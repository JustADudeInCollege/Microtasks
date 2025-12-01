<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { auth, db } from '$lib/firebase.js';
  import { onAuthStateChanged } from 'firebase/auth';
  import { doc, getDoc } from 'firebase/firestore';

  export let isDarkMode: boolean = false;
  export let username: string = 'User';
  export let currentDateTime: string = '';

  const dispatch = createEventDispatcher();

  let showLogoutConfirm = false;
  let profilePicture: string = '';
  let showNotifDropdown = false;
  let showHelpDropdown = false;
  let showProfileDropdown = false;

  let dateTimeInterval: ReturnType<typeof setInterval> | null = null;

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

  function toggleSidebar() {
    dispatch('toggleSidebar');
  }

  function toggleDarkMode() {
    dispatch('toggleDarkMode');
  }

  function toggleNotifDropdown(e: MouseEvent) {
    e.stopPropagation();
    showNotifDropdown = !showNotifDropdown;
    showHelpDropdown = false;
    showProfileDropdown = false;
  }

  function toggleHelpDropdown(e: MouseEvent) {
    e.stopPropagation();
    showHelpDropdown = !showHelpDropdown;
    showNotifDropdown = false;
    showProfileDropdown = false;
  }

  function toggleProfileDropdown(e: MouseEvent) {
    e.stopPropagation();
    showProfileDropdown = !showProfileDropdown;
    showNotifDropdown = false;
    showHelpDropdown = false;
  }

  function closeAllDropdowns() {
    showNotifDropdown = false;
    showHelpDropdown = false;
    showProfileDropdown = false;
  }

  function handleGlobalClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown-trigger') && !target.closest('.dropdown-window')) {
      closeAllDropdowns();
    }
  }

  function openLogoutConfirm() {
    showLogoutConfirm = true;
    closeAllDropdowns();
  }

  function cancelLogout() {
    showLogoutConfirm = false;
  }

  function confirmLogout() {
    showLogoutConfirm = false;
    if (browser) {
      localStorage.removeItem('microtask_username');
      document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
      goto('/login');
    }
  }

  onMount(() => {
    if (browser) {
      updateDateTime();
      dateTimeInterval = setInterval(updateDateTime, 60000);

      // Fetch profile picture from Firestore
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (user) {
          try {
            const credRef = doc(db, "credentials", user.uid);
            const credSnap = await getDoc(credRef);
            if (credSnap.exists() && credSnap.data().photoBase64) {
              profilePicture = credSnap.data().photoBase64;
            }
          } catch (error) {
            console.error("Error fetching profile picture:", error);
          }
        }
      });

      return () => {
        if (dateTimeInterval) clearInterval(dateTimeInterval);
        unsubscribe();
      };
    }
  });

  onDestroy(() => {
    if (dateTimeInterval) clearInterval(dateTimeInterval);
  });
</script>

<svelte:window on:click={handleGlobalClick} />

<header class={`top-header ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
  <div class="header-left">
    <button id="hamburgerButton" class="menu-btn" on:click={toggleSidebar} aria-label="Toggle Sidebar">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
      </svg>
    </button>
    <a href="/home" class="logo">
      <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Microtask Logo" class="h-8 w-auto">
      <span class={`${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Microtask</span>
    </a>
  </div>

  <div class={`flex items-center gap-4 mr-4 right text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-900'}`}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
      <path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" />
      <path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/>
    </svg>
    <span>{currentDateTime}</span>
  </div>

  <div class="header-icons">
    <div class="relative">
      <button on:click={toggleNotifDropdown} aria-label="Notifications" class="dropdown-trigger relative">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
          <path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0c-1.673-.253-3.287-.673-4.831-1.243a.75.75 0 01-.297-1.206C4.45 13.807 5.25 11.873 5.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0H9.752z" clip-rule="evenodd" />
        </svg>
      </button>
      {#if showNotifDropdown}
      <div class={`dropdown-window w-80 max-h-96 overflow-y-auto custom-scrollbar ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
        <h3 class="font-semibold mb-2 text-sm">Notifications</h3>
        <p class="text-xs text-center py-4">No new notifications.</p>
      </div>
      {/if}
    </div>

    <div class="relative">
      <button on:click={toggleHelpDropdown} aria-label="Help & FAQ" class="dropdown-trigger">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
          <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.042.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" />
        </svg>
      </button>
      {#if showHelpDropdown}
      <div class={`dropdown-window ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
        <h3 class="font-semibold mb-2 text-sm">FAQ</h3>
        <ul class="list-disc list-inside space-y-1 text-xs">
          <li>How do I add a task?</li>
          <li>Where is the calendar?</li>
        </ul>
        <a href="/support" class="text-xs text-blue-600 hover:underline mt-2 block">Visit Support</a>
      </div>
      {/if}
    </div>

    <div class="relative">
      <button on:click={toggleProfileDropdown} aria-label="Profile Menu" class="dropdown-trigger w-12 h-12 rounded-full overflow-hidden flex-shrink-0 p-0 border-0 bg-transparent cursor-pointer">
        {#if profilePicture}
          <img src={profilePicture} alt="Profile" class="w-full h-full rounded-full object-cover" />
        {:else}
          <div class="w-full h-full rounded-full bg-gray-200 dark:bg-zinc-600 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7 text-gray-500 dark:text-zinc-400" aria-hidden="true">
              <path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" />
            </svg>
          </div>
        {/if}
      </button>
      {#if showProfileDropdown}
      <div class={`dropdown-window ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
        <!-- Profile Picture in Dropdown -->
        <div class="flex flex-col items-center mb-3 pb-3 border-b {isDarkMode ? 'border-zinc-600' : 'border-gray-200'}">
          {#if profilePicture}
            <img src={profilePicture} alt="Profile" class="w-16 h-16 rounded-full object-cover mb-2" />
          {:else}
            <div class="w-16 h-16 rounded-full bg-gray-200 dark:bg-zinc-600 flex items-center justify-center mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-10 h-10 text-gray-400 dark:text-zinc-500" aria-hidden="true">
                <path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" />
              </svg>
            </div>
          {/if}
          <p class="font-semibold text-sm">{username || 'User'}</p>
        </div>
        <a href="/settings" class={`flex items-center gap-2 text-xs px-2 py-1.5 rounded w-full transition-colors duration-150 mb-2 ${isDarkMode ? 'hover:bg-zinc-600 text-zinc-300' : 'hover:bg-gray-100 text-gray-700'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
            <path fill-rule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clip-rule="evenodd" />
          </svg>
          Settings
        </a>
        <button on:click={openLogoutConfirm} class={`flex items-center gap-2 text-xs px-2 py-1.5 rounded w-full text-left transition-colors duration-150 ${isDarkMode ? 'bg-red-700 hover:bg-red-600 text-zinc-300' : 'bg-red-100 hover:bg-red-200 text-red-700'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4">
            <path fill-rule="evenodd" d="M7.5 3.75A1.5 1.5 0 006 5.25v13.5a1.5 1.5 0 001.5 1.5h6a1.5 1.5 0 001.5-1.5V15a.75.75 0 011.5 0v3.75a3 3 0 01-3 3h-6a3 3 0 01-3-3V5.25a3 3 0 013-3h6a3 3 0 013 3V9a.75.75 0 01-1.5 0V5.25a1.5 1.5 0 00-1.5-1.5h-6zm10.72 4.72a.75.75 0 011.06 0l3 3a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06l1.72-1.72H9a.75.75 0 010-1.5h10.94l-1.72-1.72a.75.75 0 010-1.06z" clip-rule="evenodd" />
          </svg>
          Logout
        </button>
      </div>
      {/if}
    </div>

    <button on:click={toggleDarkMode} aria-label="Toggle Dark Mode" class={`ml-2 p-1.5 rounded-full transition-colors duration-150 ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-300' : 'hover:bg-gray-100 text-gray-700'}`}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
        {#if isDarkMode}
          <path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 0 0-.103.103l1.132 1.132a.75.75 0 0 0 1.06 0l1.132-1.132a.75.75 0 0 0-.103-1.06l-1.132-1.132a.75.75 0 0 0-1.06 0L9.63 1.615a.75.75 0 00-.102.103ZM12 3.75a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75ZM18.282 5.282a.75.75 0 00-1.06 0l-1.132 1.132a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 000-.103ZM19.5 12a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75ZM18.282 18.718a.75.75 0 000 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 00-1.06 0l-1.132 1.132a.75.75 0 00.103.103ZM12 18.75a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75ZM5.718 18.718a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 00-1.06 0L4.586 17.686a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 000-.103ZM4.5 12a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75ZM5.718 5.282a.75.75 0 000-1.06l-1.132-1.132a.75.75 0 00-1.06 0L2.39 4.114a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-.103ZM12 6.75a5.25 5.25 0 015.25 5.25 5.25 5.25 0 01-5.25 5.25 5.25 5.25 0 01-5.25-5.25 5.25 5.25 0 015.25-5.25Z" clip-rule="evenodd" />
        {:else}
          <path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clip-rule="evenodd" />
        {/if}
      </svg>
    </button>
  </div>
</header>

<!-- Logout Confirmation Modal -->
{#if showLogoutConfirm}
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm" on:click|self={cancelLogout} on:keydown={(e) => e.key === 'Escape' && cancelLogout()} role="dialog" aria-modal="true" aria-labelledby="logout-title">
    <div class={`rounded-lg shadow-xl p-6 max-w-sm w-full mx-4 transform transition-all ${isDarkMode ? 'bg-zinc-800 text-zinc-100' : 'bg-white text-gray-900'}`}>
      <div class="flex items-center gap-3 mb-4">
        <div class={`p-2 rounded-full ${isDarkMode ? 'bg-red-900/50' : 'bg-red-100'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class={`w-6 h-6 ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
            <path fill-rule="evenodd" d="M7.5 3.75A1.5 1.5 0 006 5.25v13.5a1.5 1.5 0 001.5 1.5h6a1.5 1.5 0 001.5-1.5V15a.75.75 0 011.5 0v3.75a3 3 0 01-3 3h-6a3 3 0 01-3-3V5.25a3 3 0 013-3h6a3 3 0 013 3V9a.75.75 0 01-1.5 0V5.25a1.5 1.5 0 00-1.5-1.5h-6zm10.72 4.72a.75.75 0 011.06 0l3 3a.75.75 0 010 1.06l-3 3a.75.75 0 11-1.06-1.06l1.72-1.72H9a.75.75 0 010-1.5h10.94l-1.72-1.72a.75.75 0 010-1.06z" clip-rule="evenodd" />
          </svg>
        </div>
        <h2 id="logout-title" class="text-lg font-semibold">Confirm Logout</h2>
      </div>
      <p class={`mb-6 text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>
        Are you sure you want to log out? You will need to sign in again to access your tasks.
      </p>
      <div class="flex gap-3 justify-end">
        <button
          on:click={cancelLogout}
          class={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isDarkMode ? 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
        >
          Cancel
        </button>
        <button
          on:click={confirmLogout}
          class="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
        >
          Logout
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .top-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    height: 60px;
    z-index: 40;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    transition: background-color 0.2s, border-color 0.2s;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .top-header .menu-btn {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 9999px;
    transition: background-color 0.15s ease;
  }

  :global(.dark) .top-header .menu-btn:hover {
    background-color: #374151;
  }

  .top-header .logo {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    font-size: 1.125rem;
    text-decoration: none;
  }

  .top-header .header-icons {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .top-header .header-icons button {
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.5rem;
    line-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9999px;
    width: 36px;
    height: 36px;
    transition: background-color 0.15s ease;
  }

  .top-header .header-icons button:hover {
    background-color: #f3f4f6;
  }

  :global(.dark) .top-header .header-icons button:hover {
    background-color: #374151;
  }

  .relative {
    position: relative;
  }

  .dropdown-window {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
    border-radius: 0.5rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    padding: 0.75rem;
    width: 260px;
    z-index: 50;
    opacity: 0;
    transform: translateY(-5px) scale(0.98);
    transition: opacity 0.15s ease-out, transform 0.15s ease-out;
    pointer-events: none;
    visibility: hidden;
  }

  .dropdown-window:not(.hidden) {
    opacity: 1;
    transform: translateY(0) scale(1);
    pointer-events: auto;
    visibility: visible;
  }

  :global(.hidden) {
    display: none !important;
  }

  .custom-scrollbar {
    scrollbar-width: thin;
    scrollbar-color: #c5c5c5 #f1f1f1;
  }

  :global(.dark) .custom-scrollbar {
    scrollbar-color: #4a5568 #2d3748;
  }
</style>
