<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto, invalidateAll } from '$app/navigation';
  import { browser } from '$app/environment';
  import { fly, fade, scale } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import AppHeader from '$lib/components/AppHeader.svelte';

  // Firebase imports
  import { auth, db } from '$lib/firebase.js';
  import { updateProfile, deleteUser, onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
  import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

  // --- Global App State ---
  let isSidebarOpen = false;
  let globalUsername = "User"; 
  let isDarkMode = false;
  let currentDateTime = "";
  let dateTimeInterval: ReturnType<typeof setInterval> | null = null;
  let pageErrorMessage: string | null = null;
  const dropdownIds = ['notifWindow', 'helpWindow', 'profileWindow'];

  interface PageData {
    error?: string;
    username?: string; 
  }
  export let data: PageData;

  $: if (browser && data?.username && !auth.currentUser) {
    globalUsername = data.username;
  }
  $: if (data?.error) pageErrorMessage = data.error;

  // --- Settings Page Specific State ---
  let currentUid: string | null = null;
  let displayNameInput = "";      
  let initialDisplayName = "";    
  
  let profilePictureFile: File | null = null;
  let profilePictureBase64: string | null = null;
  let profilePicturePreview = "https://via.placeholder.com/150/CCCCCC/808080?Text=Avatar";

  let isLoadingSave = false;
  let profileFormMessage = ""; 
  let profileFormMessageType = ""; 

  let isLoadingDelete = false;
  let deleteAccountFormMessage = ""; 
  let deleteAccountFormMessageType = ""; 

  // --- Accessibility Settings State ---
  let reduceMotion = false;
  let highContrast = false;
  let largeText = false;
  let focusIndicators = true;
  let keyboardNavigation = true;
  let accessibilityMessage = "";
  let accessibilityMessageType = "";

  // Load accessibility settings from localStorage
  function loadAccessibilitySettings() {
    if (browser) {
      reduceMotion = localStorage.getItem('reduceMotion') === 'true';
      highContrast = localStorage.getItem('highContrast') === 'true';
      largeText = localStorage.getItem('largeText') === 'true';
      focusIndicators = localStorage.getItem('focusIndicators') !== 'false'; // Default true
      keyboardNavigation = localStorage.getItem('keyboardNavigation') !== 'false'; // Default true
      
      applyAccessibilitySettings();
    }
  }

  // Apply accessibility settings to the document
  function applyAccessibilitySettings() {
    if (browser) {
      const root = document.documentElement;
      
      // Reduce motion
      if (reduceMotion) {
        root.classList.add('reduce-motion');
      } else {
        root.classList.remove('reduce-motion');
      }
      
      // High contrast
      if (highContrast) {
        root.classList.add('high-contrast');
      } else {
        root.classList.remove('high-contrast');
      }
      
      // Large text
      if (largeText) {
        root.classList.add('large-text');
      } else {
        root.classList.remove('large-text');
      }
      
      // Focus indicators
      if (focusIndicators) {
        root.classList.add('show-focus');
      } else {
        root.classList.remove('show-focus');
      }
      
      // Keyboard navigation
      if (keyboardNavigation) {
        root.classList.add('keyboard-nav');
      } else {
        root.classList.remove('keyboard-nav');
      }
    }
  }

  // Save accessibility settings
  function saveAccessibilitySettings() {
    if (browser) {
      localStorage.setItem('reduceMotion', reduceMotion.toString());
      localStorage.setItem('highContrast', highContrast.toString());
      localStorage.setItem('largeText', largeText.toString());
      localStorage.setItem('focusIndicators', focusIndicators.toString());
      localStorage.setItem('keyboardNavigation', keyboardNavigation.toString());
      
      applyAccessibilitySettings();
      
      accessibilityMessage = "Accessibility settings saved successfully!";
      accessibilityMessageType = "success";
      setTimeout(() => {
        accessibilityMessage = "";
      }, 3000);
    }
  }

  async function loadUserProfile(user: FirebaseUser) {
    isLoadingSave = true; 
    profileFormMessage = "";
    try {
      currentUid = user.uid;
      globalUsername = user.displayName || "User"; 
      displayNameInput = user.displayName || "";   
      initialDisplayName = displayNameInput;       

      profilePicturePreview = user.photoURL || "https://via.placeholder.com/150/CCCCCC/808080?Text=Avatar";
      
      // If your `credentials` collection stores a `username` that can be different from Auth's displayName
      // and you want to use that for the input, fetch it here:
      const credRef = doc(db, "credentials", user.uid);
      const credSnap = await getDoc(credRef);
      if (credSnap.exists()) {
        const credData = credSnap.data();
        // If you have a specific 'username' field in credentials you prefer for display/edit:
        // displayNameInput = credData.username || displayNameInput;
        // initialDisplayName = displayNameInput; // Update initial if fetched from Firestore
        // globalUsername = credData.username || globalUsername; // Update global display
        
        // Load saved profile picture from Firestore
        if (credSnap.exists() && credSnap.data().photoBase64) {
          profilePictureBase64 = credSnap.data().photoBase64;
          profilePicturePreview = credSnap.data().photoBase64;
        }
      }
    } catch (error) {
      console.error("Error loading profile:", error);
      profileFormMessage = "Failed to load profile information.";
      profileFormMessageType = "error";
    } finally {
      isLoadingSave = false;
    }
  }

  // Compress and convert image to Base64
  async function compressImageToBase64(file: File, maxWidth = 200, quality = 0.7): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        
        // Scale down to maxWidth (keep aspect ratio)
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        const base64 = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(img.src);
        
        // Check size (Firestore has 1MB doc limit, keep image under 500KB to be safe)
        if (base64.length > 500000) {
          reject(new Error('Image too large. Please use a smaller image.'));
          return;
        }
        
        resolve(base64);
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Could not load image'));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  function handleProfilePictureInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        profileFormMessage = "Please select a valid image file.";
        profileFormMessageType = "error";
        target.value = '';
        return;
      }
      
      profilePictureFile = file;
      
      // Show preview immediately
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          profilePicturePreview = e.target.result as string;
        }
      };
      reader.readAsDataURL(file);
      profileFormMessage = "";
    }
  }

  async function handleSaveProfileInfo() {
    if (!currentUid || !auth.currentUser) {
      profileFormMessage = "User not authenticated. Please refresh.";
      profileFormMessageType = "error";
      return;
    }
    if (!displayNameInput.trim()) {
      profileFormMessage = "Display Name cannot be empty.";
      profileFormMessageType = "error";
      return;
    }
    if (displayNameInput === initialDisplayName && !profilePictureFile) {
        profileFormMessage = "No changes to save.";
        profileFormMessageType = ""; 
        return;
    }

    isLoadingSave = true;
    profileFormMessage = "";
    profileFormMessageType = "";

    try {
      let newPhotoBase64 = profilePictureBase64;
      
      // Compress and convert new profile picture to Base64
      if (profilePictureFile) {
        profileFormMessage = "Processing image...";
        try {
          newPhotoBase64 = await compressImageToBase64(profilePictureFile, 200, 0.7);
        } catch (imgError: any) {
          profileFormMessage = imgError.message || "Failed to process image.";
          profileFormMessageType = "error";
          isLoadingSave = false;
          return;
        }
      }

      profileFormMessage = "Saving...";
      
      await updateProfile(auth.currentUser, {
        displayName: displayNameInput
      });

      const userDocRef = doc(db, "credentials", currentUid);
      await setDoc(userDocRef, { 
        username: displayNameInput,
        usernameLower: displayNameInput.toLowerCase(), // For case-insensitive login
        uid: currentUid,
        photoBase64: newPhotoBase64
      }, { merge: true }); 
      
      globalUsername = displayNameInput;
      initialDisplayName = displayNameInput;
      profilePictureBase64 = newPhotoBase64;
      profilePicturePreview = newPhotoBase64 || "https://via.placeholder.com/150/CCCCCC/808080?Text=Avatar";
      profilePictureFile = null;

      if (browser) saveGlobalUsernameToLocalStorage(globalUsername); 

      profileFormMessage = "Profile updated successfully!";
      profileFormMessageType = "success";
      // invalidateAll(); // If server data needs refresh, but auth state usually handles this for header
    } catch (error: any) {
      console.error("Error updating profile:", error);
      profileFormMessage = `Failed to update profile: ${error.message || 'Unknown error'}`;
      profileFormMessageType = "error";
    } finally {
      isLoadingSave = false;
    }
  }

  async function handleDeleteUserAccount() {
    if (!currentUid || !auth.currentUser) {
      deleteAccountFormMessage = "User not authenticated. Please refresh.";
      deleteAccountFormMessageType = "error";
      return;
    }
    if (!confirm("Are you absolutely sure you want to delete your account and all associated data? This action is permanent and cannot be undone.")) {
      deleteAccountFormMessage = "Account deletion cancelled.";
      deleteAccountFormMessageType = "";
      return;
    }

    isLoadingDelete = true;
    deleteAccountFormMessage = "";
    deleteAccountFormMessageType = "";

    try {
      const userDocRef = doc(db, "credentials", currentUid);
      await deleteDoc(userDocRef);
      
      // !!! IMPORTANT: Add logic here to delete other user-specific data from Firestore (tasks, notes, etc.) !!!
      // Example (conceptual):
      // const tasksQuery = query(collection(db, 'tasks'), where('userId', '==', currentUid));
      // const tasksSnapshot = await getDocs(tasksQuery);
      // for (const taskDoc of tasksSnapshot.docs) {
      //   await deleteDoc(doc(db, 'tasks', taskDoc.id));
      // }

      await deleteUser(auth.currentUser);

      deleteAccountFormMessage = "Account deleted successfully. You will be logged out.";
      deleteAccountFormMessageType = "success";
      
      setTimeout(() => {
        handleLogout(); 
      }, 2500);

    } catch (error: any) {
      console.error("Error deleting account:", error);
      deleteAccountFormMessage = `Failed to delete account: ${error.message || 'Unknown error'}`;
      if (error.code === 'auth/requires-recent-login') {
        deleteAccountFormMessage += " This operation is sensitive. Please log out, log back in, then try again.";
      }
      deleteAccountFormMessageType = "error";
    } finally {
      isLoadingDelete = false;
    }
  }

  function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    if (browser) {
      document.documentElement.classList.toggle('dark', isDarkMode);
      document.body.classList.toggle('dark', isDarkMode);
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }
  }
  function toggleSidebar() { isSidebarOpen = !isSidebarOpen; }
  function closeSidebar() { isSidebarOpen = false; }
  function toggleWindow(id: string) { /* ... as before ... */ }
  function closeOtherWindows(currentId: string) { /* ... as before ... */ }
  
  function getStoredGlobalUsernameFromLocalStorage(): string { if (browser) return localStorage.getItem('microtask_global_username') || "User"; return "User"; }
  function saveGlobalUsernameToLocalStorage(name: string): void { if (browser) localStorage.setItem('microtask_global_username', name); }
  
  function handleLogout() { 
    if (browser) { 
      auth.signOut().then(() => {
        saveGlobalUsernameToLocalStorage("User"); 
        goto('/login');
      }).catch(error => {
        console.error("Logout failed:", error);
        pageErrorMessage = "Logout failed. Please try again.";
      });
    } 
  }

  function updateDateTime() {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    };
    currentDateTime = now.toLocaleDateString('en-US', options);
  }

  onMount(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await loadUserProfile(user);
      } else {
        currentUid = null;
        globalUsername = getStoredGlobalUsernameFromLocalStorage(); 
        displayNameInput = ""; 
        initialDisplayName = "";
        profilePicturePreview = "https://via.placeholder.com/150/CCCCCC/808080?Text=Avatar";
        if ($page.url.pathname.includes('/settings')) { 
           // If already on settings and auth is lost, consider a softer message or let server redirect handle it
           // For now, server redirect will handle it if this fires before page load completion
        }
      }
    });

    if (browser) {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      isDarkMode = savedTheme === 'dark' || (!savedTheme && prefersDark);
      document.documentElement.classList.toggle('dark', isDarkMode);
      document.body.classList.toggle('dark', isDarkMode);
      if (!auth.currentUser && !data?.username) {
          globalUsername = getStoredGlobalUsernameFromLocalStorage();
      }
      
      // Load accessibility settings
      loadAccessibilitySettings();
    }

    // Update date/time
    updateDateTime();
    dateTimeInterval = setInterval(updateDateTime, 60000);

    return () => {
      unsubscribeAuth();
      if (dateTimeInterval) clearInterval(dateTimeInterval);
    };
  });
</script>

<!-- HTML Structure (Sidebar, Header, Settings Content) -->
<div class={`flex h-screen font-sans ${isDarkMode ? 'dark bg-zinc-900 text-zinc-300' : 'bg-gray-100 text-gray-800'}`}>
  {#if pageErrorMessage}
    <!-- Page Error Message Display -->
    <div class="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-md z-[100]" role="alert">
      <strong class="font-bold">Error:</strong>
      <span class="block sm:inline">{pageErrorMessage}</span>
      <button on:click={() => pageErrorMessage = null} class="absolute top-0 bottom-0 right-0 px-4 py-3" aria-label="Close error">
        <span class="text-xl">×</span>
      </button>
    </div>
  {/if}

  {#if isSidebarOpen}
    <!-- Sidebar HTML (from your previous code) -->
    <div
      id="sidebar"
      class={`fixed top-0 left-0 h-full w-64 shadow-lg z-50 flex flex-col justify-between p-4 border-r ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}
      transition:fly={{ x: -300, duration: 300, easing: quintOut }}
    >
      <div>
        <div class={`flex items-center justify-between mb-8 pb-4 border-b ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}>
          <div class="flex items-center gap-2">
            <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Microtask Logo" class="w-8 h-8" />
            <h1 class={`text-xl font-bold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Microtask</h1>
          </div>
          <button on:click={closeSidebar} class={`p-1 rounded-md transition-colors ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`} aria-label="Close sidebar">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <nav class="flex flex-col gap-2">
          <!-- Sidebar Links -->
          <a href="/home" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode} class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:bg-blue-600={$page.url.pathname === '/home' && !isDarkMode} class:bg-blue-800={$page.url.pathname === '/home' && isDarkMode} class:text-white={$page.url.pathname === '/home'}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" /></svg>
            <span>Home</span>
          </a>
           <a href="/dashboard" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode} class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:bg-blue-600={$page.url.pathname === '/dashboard' && !isDarkMode} class:bg-blue-800={$page.url.pathname === '/dashboard' && isDarkMode} class:text-white={$page.url.pathname === '/dashboard'}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"> <path d="M10.5 4.5a1.5 1.5 0 00-3 0v15a1.5 1.5 0 003 0V4.5z" /> <path d="M4.5 10.5a1.5 1.5 0 000 3h15a1.5 1.5 0 000-3h-15z" /> <path fill-rule="evenodd" d="M1.5 3A1.5 1.5 0 013 1.5h18A1.5 1.5 0 0122.5 3v18a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 21V3zm1.5.75v16.5h16.5V3.75H3z" clip-rule="evenodd" /></svg>
            <span>Dashboard</span>
          </a>
           <a href="/tasks" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode} class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:bg-blue-600={$page.url.pathname === '/tasks' && !isDarkMode} class:bg-blue-800={$page.url.pathname === '/tasks' && isDarkMode} class:text-white={$page.url.pathname === '/tasks'}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
            <span>All Tasks</span>
          </a>
           <a href="/calendar" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode} class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:bg-blue-600={$page.url.pathname === '/calendar' && !isDarkMode} class:bg-blue-800={$page.url.pathname === '/calendar' && isDarkMode} class:text-white={$page.url.pathname === '/calendar'}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" /><path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/></svg>
            <span>Calendar</span>
          </a>
           <a href="/workspace" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode} class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:bg-blue-600={$page.url.pathname === '/workspace' && !isDarkMode} class:bg-blue-800={$page.url.pathname === '/workspace' && isDarkMode} class:text-white={$page.url.pathname === '/workspace'}>
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.098a2.25 2.25 0 0 1-2.25 2.25h-12a2.25 2.25 0 0 1-2.25-2.25V14.15M18 18.75h.75A2.25 2.25 0 0 0 21 16.5v-1.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 15v1.5A2.25 2.25 0 0 0 3.75 18.75H4.5M12 12.75a3 3 0 0 0-3-3H5.25V7.5a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3v2.25H15a3 3 0 0 0-3 3Z" /></svg>
            <span>Workspace</span>
          </a>
           <a href="/ai-chat" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode} class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:bg-blue-600={$page.url.pathname === '/ai-chat' && !isDarkMode} class:bg-blue-800={$page.url.pathname === '/ai-chat' && isDarkMode} class:text-white={$page.url.pathname === '/ai-chat'}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path d="M12.001 2.504a2.34 2.34 0 00-2.335 2.335v.583c0 .582.212 1.13.582 1.556l.03.035-.03.034a2.34 2.34 0 00-2.917 3.916A3.287 3.287 0 004.08 14.25a3.287 3.287 0 003.287 3.287h8.266a3.287 3.287 0 003.287-3.287 3.287 3.287 0 00-1.253-2.583 2.34 2.34 0 00-2.917-3.916l-.03-.034.03-.035c.37-.425.582-.973.582-1.555v-.583a2.34 2.34 0 00-2.335-2.336h-.002zM9.75 12.75a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" /><path fill-rule="evenodd" d="M12 1.5c5.79 0 10.5 4.71 10.5 10.5S17.79 22.5 12 22.5 1.5 17.79 1.5 12 6.21 1.5 12 1.5zM2.85 12a9.15 9.15 0 019.15-9.15 9.15 9.15 0 019.15 9.15 9.15 9.15 0 01-9.15 9.15A9.15 9.15 0 012.85 12z" clip-rule="evenodd" /></svg>
            <span>Ask Synthia</span>
          </a>
        </nav>
      </div>
      <button on:click={handleLogout} class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold w-full mt-auto transition-colors duration-150" class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
        <span>Log out</span>
      </button>
    </div>
  {/if}

  <div class="flex-1 flex flex-col overflow-hidden">
    <AppHeader {isDarkMode} username={globalUsername} {currentDateTime} on:toggleSidebar={toggleSidebar} on:toggleDarkMode={toggleDarkMode} on:logout={handleLogout} />

    <div class="flex-1 overflow-y-auto pt-[60px] flex flex-col custom-scrollbar">
      <div class="settings-page">
        <h1>Account Settings</h1>
        
        <section class="settings-section">
          <h2>Profile Information</h2>
          <p class="welcome-message">Welcome, {globalUsername || 'User'}!</p>
          
          <div class="profile-form-grid">
            <div class="form-group profile-picture-group">
              <label for="profilePictureInput">Profile Picture</label>
              <div class="profile-picture-controls">
                <img src={profilePicturePreview} alt="Profile Preview" class="profile-preview" />
                <input type="file" id="profilePictureInput" accept="image/*" on:change={handleProfilePictureInputChange} style="display: none;" />
                <button type="button" class="button button-secondary upload-button" on:click={() => document.getElementById('profilePictureInput')?.click()}>
                  Choose Image
                </button>
              </div>
            </div>

            <div class="form-group full-width-profile-field">
              <label for="displayNameInput">Display Name</label>
              <input type="text" id="displayNameInput" bind:value={displayNameInput} placeholder="Your public display name" />
            </div>
          </div>

          <button class="button button-primary" on:click={handleSaveProfileInfo} disabled={isLoadingSave}>
            {#if isLoadingSave}Saving...{:else}Save Profile Info{/if}
          </button>
          {#if profileFormMessage}
            <p class="message {profileFormMessageType}">{profileFormMessage}</p>
          {/if}
        </section>

        <section class="settings-section">
          <h2>Accessibility Settings</h2>
          <p class="section-description">Customize your experience to better suit your needs.</p>
          
          <div class="accessibility-options">
            <div class="accessibility-option">
              <div class="option-info">
                <label for="reduceMotion" class="option-label">Reduce Motion</label>
                <p class="option-description">Minimize animations and transitions throughout the app.</p>
              </div>
              <label class="toggle-switch">
                <input 
                  type="checkbox" 
                  id="reduceMotion" 
                  bind:checked={reduceMotion}
                  on:change={saveAccessibilitySettings}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="accessibility-option">
              <div class="option-info">
                <label for="highContrast" class="option-label">High Contrast</label>
                <p class="option-description">Increase contrast for better visibility.</p>
              </div>
              <label class="toggle-switch">
                <input 
                  type="checkbox" 
                  id="highContrast" 
                  bind:checked={highContrast}
                  on:change={saveAccessibilitySettings}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="accessibility-option">
              <div class="option-info">
                <label for="largeText" class="option-label">Large Text</label>
                <p class="option-description">Increase text size for easier reading.</p>
              </div>
              <label class="toggle-switch">
                <input 
                  type="checkbox" 
                  id="largeText" 
                  bind:checked={largeText}
                  on:change={saveAccessibilitySettings}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="accessibility-option">
              <div class="option-info">
                <label for="focusIndicators" class="option-label">Enhanced Focus Indicators</label>
                <p class="option-description">Show prominent focus outlines when navigating with keyboard.</p>
              </div>
              <label class="toggle-switch">
                <input 
                  type="checkbox" 
                  id="focusIndicators" 
                  bind:checked={focusIndicators}
                  on:change={saveAccessibilitySettings}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="accessibility-option">
              <div class="option-info">
                <label for="keyboardNavigation" class="option-label">Keyboard Navigation Hints</label>
                <p class="option-description">Display keyboard shortcuts and navigation hints.</p>
              </div>
              <label class="toggle-switch">
                <input 
                  type="checkbox" 
                  id="keyboardNavigation" 
                  bind:checked={keyboardNavigation}
                  on:change={saveAccessibilitySettings}
                />
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          {#if accessibilityMessage}
            <p class="message {accessibilityMessageType}">{accessibilityMessage}</p>
          {/if}
        </section>

        <section class="settings-section danger-zone">
          <h2>Account Deletion</h2>
          <p class="danger-text">
            Permanently delete your account and all associated data. This action cannot be undone. 
            Please be absolutely sure before proceeding.
          </p>
          <button class="button button-danger" on:click={handleDeleteUserAccount} disabled={isLoadingDelete}>
             {#if isLoadingDelete}Deleting...{:else}Delete My Account{/if}
          </button>
          {#if deleteAccountFormMessage}
            <p class="message {deleteAccountFormMessageType}">{deleteAccountFormMessage}</p>
          {/if}
        </section>

        <footer class="settings-footer">
          Microtask © {new Date().getFullYear()}
        </footer>
      </div>
    </div>
  </div>
</div>

<!-- Styles (as provided in the previous combined message, including settings-specific styles and dark mode) -->
<style>
  /* General App Styles (condensed for brevity - use your full style block) */
  .font-sans {font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;}
  :global(body, html) {height: 100%; margin: 0; padding: 0; overflow: hidden; }
  /* ... Scrollbar Styles ... */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
  ::-webkit-scrollbar-thumb { background: #c5c5c5; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
  .custom-scrollbar { scrollbar-width: thin; scrollbar-color: #c5c5c5 #f1f1f1; }
  :global(.dark) ::-webkit-scrollbar-track { background: #2d3748; }
  :global(.dark) ::-webkit-scrollbar-thumb { background: #4a5568; }
  :global(.dark) ::-webkit-scrollbar-thumb:hover { background: #718096; }
  :global(.dark) .custom-scrollbar { scrollbar-color: #4a5568 #2d3748; }


  
  /* Settings Page Specific Styles */
  .settings-page {max-width: 800px; margin: 2rem auto; padding: 1rem 2rem; flex-grow: 1; display: flex; flex-direction: column;}
  .settings-page h1 {text-align: center; margin-bottom: 2rem; font-weight: 600; font-size: 2em;}
  .settings-page h1 { color: #1f2937; }
  :global(.dark) .settings-page h1 { color: #f3f4f6; }
  .settings-section {padding: 1.5rem 2rem; margin-bottom: 2rem; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);}
  .settings-section { background-color: #ffffff; border: 1px solid #e5e7eb; color: #1f2937; }
  :global(.dark) .settings-section { background-color: #374151; border-color: #4b5563; color: #d1d5db;}
  .settings-section h2 {font-size: 1.5em; margin-top: 0; margin-bottom: 1.5rem; padding-bottom: 0.75rem; font-weight: 500;}
  .settings-section h2 { color: #111827; border-bottom: 1px solid #e5e7eb; }
  :global(.dark) .settings-section h2 { color: #f3f4f6; border-bottom-color: #4b5563;}
  .welcome-message {font-size: 1.1em; margin-bottom: 1.5rem; margin-top: -1rem;}
  .welcome-message { color: #4b5563; }
  :global(.dark) .welcome-message { color: #9ca3af; }
  .profile-form-grid { display: grid; grid-template-columns: 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
  .form-group { display: flex; flex-direction: column; }
  .full-width-profile-field { grid-column: 1 / -1; }
  .profile-picture-group { /* Stays as default in 1-col layout */ }
  .profile-picture-controls { display: flex; flex-direction: column; align-items: flex-start; gap: 1rem; }
  .profile-preview {width: 120px; height: 120px; border-radius: 50%; object-fit: cover; margin-bottom: 0.5rem; }
  .profile-preview { border: 3px solid #e5e7eb; }
  :global(.dark) .profile-preview { border-color: #4b5563; }
  .upload-button { display: inline-block; cursor: pointer; }
  .settings-section label { font-weight: 600; margin-bottom: 0.5rem; font-size: 0.95em; }
  .settings-section label { color: #374151; }
  :global(.dark) .settings-section label { color: #d1d5db; }
  .settings-section input[type="text"] {width: 100%; padding: 0.75rem; border-radius: 6px; box-sizing: border-box; font-size: 1em; transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;}
  .settings-section input[type="text"] {background-color: #fff; border: 1px solid #d1d5db; color: #1f2937;}
  :global(.dark) .settings-section input[type="text"] {background-color: #2d3748; border-color: #4b5563; color: #f3f4f6;}
  :global(.dark) .settings-section input::placeholder { color: #6b7280; }
  .settings-section input[type="text"]:focus {outline: none;}
  .settings-section input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25); }
  :global(.dark) .settings-section input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35); }
  .settings-section .button {padding: 0.75rem 1.5rem; border: none; border-radius: 6px; font-size: 1em; font-weight: 500; cursor: pointer; transition: background-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out; text-decoration: none; display: inline-block; text-align: center;}
  .settings-section .button:disabled { opacity: 0.6; cursor: not-allowed; }
  .settings-section .button-primary { color: white; }
  .settings-section .button-primary { background-color: #3b82f6; }
  .settings-section .button-primary:hover:not(:disabled) { background-color: #2563eb; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  :global(.dark) .settings-section .button-primary { background-color: #2563eb; }
  :global(.dark) .settings-section .button-primary:hover:not(:disabled) { background-color: #1d4ed8; }
  .settings-section .button-secondary { }
  .settings-section .button-secondary { background-color: #e5e7eb; color: #1f2937; border: 1px solid #d1d5db; }
  .settings-section .button-secondary:hover:not(:disabled) { background-color: #d1d5db; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
  :global(.dark) .settings-section .button-secondary { background-color: #4b5563; color: #f3f4f6; border-color: #6b7280; }
  :global(.dark) .settings-section .button-secondary:hover:not(:disabled) { background-color: #6b7280; }
  .settings-section .button-danger { color: white; }
  .settings-section .button-danger { background-color: #ef4444; }
  .settings-section .button-danger:hover:not(:disabled) { background-color: #dc2626; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
  :global(.dark) .settings-section .button-danger { background-color: #dc2626; }
  :global(.dark) .settings-section .button-danger:hover:not(:disabled) { background-color: #b91c1c; }
  .message { margin-top: 1.25rem; padding: 0.75rem 1rem; border-radius: 6px; font-size: 0.9em; text-align: left; }
  .message.success { background-color: #d1fae5; color: #065f46; border: 1px solid #a7f3d0; }
  :global(.dark) .message.success { background-color: #064e3b; color: #a7f3d0; border-color: #34d399; }
  .message.error { background-color: #fee2e2; color: #991b1b; border: 1px solid #fecaca; }
  :global(.dark) .message.error { background-color: #7f1d1d; color: #fecaca; border-color: #ef4444; }
  .danger-zone { border-left: 4px solid #ef4444;  }
  :global(.dark) .danger-zone { border-left-color: #dc2626; }
  .danger-zone h2 { color: #ef4444; }
  :global(.dark) .danger-zone h2 { color: #f87171; }
  .danger-text { font-size: 0.95em; line-height: 1.6; margin-bottom: 1.5rem; }
  .danger-text { color: #7f1d1d;  }
  :global(.dark) .danger-text { color: #fecaca;  }
  .settings-footer {text-align: center; margin-top: auto; padding-top: 1.5rem; padding-bottom: 1rem; font-size: 0.9em;}
  .settings-footer { border-top: 1px solid #e5e7eb; color: #6b7280;  }
  :global(.dark) .settings-footer { border-top-color: #4b5563; color: #9ca3af; }
  /* Accessibility Settings Styles */
  .section-description {
    font-size: 0.95em;
    line-height: 1.6;
    margin-bottom: 1.5rem;
    color: #6b7280;
  }
  :global(.dark) .section-description { color: #9ca3af; }

  .accessibility-options {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .accessibility-option {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-radius: 8px;
    background-color: #f9fafb;
    border: 1px solid #e5e7eb;
    transition: background-color 0.2s ease;
  }
  :global(.dark) .accessibility-option {
    background-color: #2d3748;
    border-color: #4b5563;
  }

  .option-info {
    flex: 1;
    margin-right: 1rem;
  }

  .option-label {
    display: block;
    font-weight: 600;
    font-size: 1em;
    margin-bottom: 0.25rem;
    color: #1f2937;
  }
  :global(.dark) .option-label { color: #f3f4f6; }

  .option-description {
    font-size: 0.875em;
    color: #6b7280;
    line-height: 1.4;
    margin: 0;
  }
  :global(.dark) .option-description { color: #9ca3af; }

  /* Toggle Switch Styles */
  .toggle-switch {
    position: relative;
    display: inline-block;
    width: 50px;
    height: 26px;
    cursor: pointer;
  }

  .toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #cbd5e1;
    transition: 0.3s;
    border-radius: 34px;
  }
  :global(.dark) .toggle-slider {
    background-color: #4b5563;
  }

  .toggle-slider:before {
    position: absolute;
    content: "";
    height: 20px;
    width: 20px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  .toggle-switch input:checked + .toggle-slider {
    background-color: #3b82f6;
  }
  :global(.dark) .toggle-switch input:checked + .toggle-slider {
    background-color: #2563eb;
  }

  .toggle-switch input:focus + .toggle-slider {
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.25);
  }

  .toggle-switch input:checked + .toggle-slider:before {
    transform: translateX(24px);
  }

  /* Accessibility Feature Styles */
  :global(.reduce-motion *) {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }

  :global(.high-contrast) {
    filter: contrast(1.2);
  }

  :global(.large-text) {
    font-size: 115% !important;
  }

  :global(.show-focus *:focus) {
    outline: 3px solid #3b82f6 !important;
    outline-offset: 2px !important;
  }

  :global(.keyboard-nav) [tabindex]:not([tabindex="-1"])::after {
    /* Optional: Add visual hints for keyboard navigation */
  }

  @media (max-width: 768px) {
    .settings-page { padding: 1rem; margin-top: 1rem; margin-bottom: 1rem; }
    .settings-section { padding: 1rem 1.5rem; }
    .profile-form-grid { grid-template-columns: 1fr; } /* Already 1-col, but good to keep */
    .profile-picture-controls { flex-direction: column; align-items: flex-start; } /* Stack image and button on small screens */
    .profile-preview { width: 100px; height: 100px; margin-bottom: 0.5rem; } /* Adjust preview for mobile */
    .settings-section .button { width: auto; display: inline-block; }
    
    .accessibility-option {
      flex-direction: column;
      align-items: flex-start;
      gap: 1rem;
    }
    
    .option-info {
      margin-right: 0;
    }
  }
</style>