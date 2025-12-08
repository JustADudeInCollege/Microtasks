<script lang="ts">
  import { onMount } from 'svelte';
  // Import shared Firebase auth instance and required functions
  import { auth } from '$lib/firebase.js'; // Ensure this path is correct (e.g., src/lib/firebase.js)
  import {
    createUserWithEmailAndPassword, // Use Firebase for email/password signup
    signInWithPopup,
    GoogleAuthProvider,
    updateProfile // Import updateProfile if you want to set the display name
  } from 'firebase/auth';
  import { fade } from 'svelte/transition';
  import { goto } from '$app/navigation'; // Import goto for SPA navigation

  // Define a type for the potential response structure, although not strictly needed now
  type SignupResponse = {
    success: boolean;
    error: string | null;
  };

  // --- Component State ---
  let username = "";
  let email = "";
  let password = "";
  let confirmPassword = "";
  let feedbackMessage: string | null = null; // General feedback (success/error)
  let passwordError: string | null = null; // Specific password validation error
  let showPassword = false;
  let showConfirmPassword = false;
  let isLoading = false; // Loading state for async operations
  let isDarkMode = false;

  // --- Lifecycle Hook ---
  onMount(() => {
    // Load dark mode preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    isDarkMode = savedTheme === 'dark' || (!savedTheme && prefersDark);
    document.documentElement.classList.toggle('dark', isDarkMode);
    document.body.classList.toggle('dark', isDarkMode);
  });

  // --- Password Validation ---
  // Checks if the password meets the minimum requirements
  function validatePassword(password: string): string {
    const checks = {
        lowercase: /[a-z]/.test(password),
        uppercase: /[A-Z]/.test(password),
        minLength: password.length >= 8,
    };

    let errors = [];
    if (!checks.lowercase) errors.push('one lowercase letter');
    if (!checks.uppercase) errors.push('one uppercase letter');
    if (!checks.minLength) errors.push('at least 8 characters');

    if (errors.length === 0) {
        return ''; // No errors
    } else {
        return `Password must contain ${errors.join(', ')}.`;
    }
  }

  // --- Email/Password Signup Handler ---
  // Handles the form submission for standard email/password registration
  async function handleSignup() {
    feedbackMessage = null; // Clear previous messages
    passwordError = null;
    isLoading = true;

    // --- Frontend Validations ---
    const usernameRegex = /^[a-zA-Z0-9_]+$/; // Allow letters, numbers, underscore
    if (!usernameRegex.test(username)) {
      feedbackMessage = "Username can only contain letters, numbers, and underscores.";
      isLoading = false;
      return;
    }

    const passwordValidationError = validatePassword(password);
    if (passwordValidationError) {
      passwordError = passwordValidationError; // Show specific password error
      feedbackMessage = null; // Clear general feedback if there's a password error
      isLoading = false;
      return;
    }

    if (password !== confirmPassword) {
      feedbackMessage = "Passwords do not match.";
      isLoading = false;
      return;
    }

    email = email.toLowerCase().trim(); // Standardize email format
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      feedbackMessage = "Invalid email format.";
      isLoading = false;
      return;
    }
    // --- End Frontend Validations ---

    try {
      // 1. Use Firebase Authentication to create the user
      console.log(`[DEBUG] Attempting Firebase signup for email: ${email}`);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      console.log("[DEBUG] Firebase signup successful, user created:", user.uid);

      // 2. --- Update Firebase Profile (Optional but Recommended) ---
      try {
          await updateProfile(user, { displayName: username });
          console.log("[DEBUG] Updated Firebase user profile with displayName:", username);
      } catch (profileError) {
          console.error("[DEBUG] Failed to update Firebase profile:", profileError);
          // Decide if this is critical. Maybe just log it.
      }

      // 3. --- Save User Profile to Firestore via Server Action ---
      console.log("[DEBUG] Calling server action '?/saveUserProfile' to save profile data.");
      const profileFormData = new FormData();
      profileFormData.append('uid', user.uid);
      profileFormData.append('username', username); // Use the username from component state
      profileFormData.append('email', user.email || email); // Use email from auth user, fallback to component state

      let profileSaveResult;
      try {
          const response = await fetch('?/saveUserProfile', {
              method: 'POST',
              body: profileFormData
          });
          profileSaveResult = await response.json(); // Parse the JSON response

          console.log('[DEBUG] Server action response status:', response.status);
          console.log('[DEBUG] Server action response JSON:', JSON.stringify(profileSaveResult, null, 2));

          // Check for failure indicated by the server action response body
          // Adjust the check based on the actual structure returned by fail() or success
          if (!response.ok || profileSaveResult?.type === 'failure' || profileSaveResult?.profileSave?.success === false) {
              const errorMsg = profileSaveResult?.profileSave?.error || profileSaveResult?.error || 'Failed to save user profile. Please try again.';
              console.error(`[DEBUG] Failed to save profile to Firestore: ${errorMsg}`);
              feedbackMessage = errorMsg; // Show error to the user
              // IMPORTANT: Do not proceed if profile save fails.
              isLoading = false; // Ensure loading state is reset
              return; // Stop execution here
          }
          console.log("[DEBUG] Successfully saved profile data via server action.");

      } catch (fetchError) {
          console.error("[DEBUG] Network or parsing error during saveUserProfile fetch:", fetchError);
          feedbackMessage = "An error occurred connecting to the server to save your profile. Please try again.";
          isLoading = false; // Ensure loading state is reset
          return; // Stop execution here
      }

      // 4. --- Get ID token and set session cookie via API ---
      // This runs ONLY if Firebase Auth signup AND Firestore profile save succeeded
      console.log("[DEBUG] Profile saved. Attempting to set session cookie...");
      feedbackMessage = "Creating your session..."; // Update feedback

      const idToken = await user.getIdToken(); // Get the token for the new user

      const sessionResponse = await fetch('/api/auth/session', { // Call the session endpoint
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: idToken })
      });

       if (!sessionResponse.ok) {
          let errorData;
          try {
              errorData = await sessionResponse.json();
          } catch (e) {
              errorData = { message: "Failed to parse session error response." };
          }
          // If session fails after signup/profile save, the user exists but can't log in immediately.
          console.error("[DEBUG] Failed to set session cookie after signup:", errorData);
          feedbackMessage = `Signup complete, but failed to create session (${errorData.message || 'Unknown error'}). Please try logging in manually.`;
          isLoading = false;
          return; // Don't redirect automatically
      }

      console.log("[DEBUG] Server session cookie set successfully after signup.");

      // 5. --- Redirect on FULL Success (Auth + Profile Save + Session Set) ---
      goto('/login?message=signup_success'); // Redirect only if all steps succeeded

    } catch (error: any) {
      // --- Handle Firebase Signup Errors ---
      console.error("[DEBUG] Firebase signup error:", error.code, error.message);
      if (error.code === 'auth/email-already-in-use') {
        feedbackMessage = "This email address is already registered. Try logging in.";
      } else if (error.code === 'auth/invalid-email') {
        feedbackMessage = "The email address is not valid.";
      } else if (error.code === 'auth/weak-password') {
        feedbackMessage = "Password is too weak.";
        passwordError = "Password is too weak.";
      } else {
        feedbackMessage = "An unexpected error occurred during signup. Please try again.";
      }
      isLoading = false; // Ensure loading is stopped on Firebase error
    }
    // Removed finally block as isLoading is handled in error paths now
  }

  // --- Google Sign-Up/Sign-In Handler ---
  // Handles registration/login using Google via Firebase Popup
  async function googleSignup() {
    feedbackMessage = null;
    isLoading = true;
    const provider = new GoogleAuthProvider();
    try {
      // Use Firebase Auth popup for Google Sign-In
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log("[DEBUG] Google sign-up/in successful:", user.uid, user.displayName);

      // --- Optional: Save/Ensure Firestore Profile for Google User ---
      // You might want a similar server action call here to ensure
      // a profile exists in your 'credentials' collection for Google users.
      // This helps keep your user data consistent.
      // const profileFormData = new FormData();
      // profileFormData.append('uid', user.uid);
      // profileFormData.append('username', user.displayName || `user_${user.uid.substring(0, 6)}`); // Generate a username if needed
      // profileFormData.append('email', user.email || '');
      // const profileResponse = await fetch('?/saveUserProfile', { method: 'POST', body: profileFormData });
      // if (!profileResponse.ok) { /* Handle error */ }

      // --- Set Session Cookie for Google User ---
      console.log("[DEBUG] Attempting to set session cookie for Google user...");
      feedbackMessage = "Creating your session...";
      const idToken = await user.getIdToken();
      const sessionResponse = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: idToken })
      });

      if (!sessionResponse.ok) {
           let errorData;
           try { errorData = await sessionResponse.json(); } catch(e) { errorData = { message: "Failed to parse session error." }; }
           console.error("[DEBUG] Failed to set session cookie after Google signup:", errorData);
           feedbackMessage = `Google sign-in complete, but failed to create session (${errorData.message || 'Unknown error'}). Please try logging in again.`;
           isLoading = false;
           return;
       }
       console.log("[DEBUG] Server session cookie set successfully for Google user.");
      // --- END Set Session Cookie ---


      // --- Redirect on Success ---
      goto(`/home?username=${encodeURIComponent(user.displayName || 'User')}`);

    } catch (error: any) {
      // --- Handle Google Sign-In Errors ---
      console.error("[DEBUG] Google sign-up/in error:", error.code, error.message);
      if (error.code === 'auth/popup-closed-by-user') {
          feedbackMessage = "Google sign-in was cancelled.";
      } else if (error.code === 'auth/account-exists-with-different-credential') {
          feedbackMessage = "An account already exists with this email using a different sign-in method. Please log in using that method.";
      } else if (error.code === 'auth/popup-blocked') {
          feedbackMessage = "Popup blocked by browser. Please allow popups for this site.";
      } else {
          feedbackMessage = "Google sign-up failed. Please try again.";
      }
       isLoading = false; // Re-enable buttons
    }
    // Removed finally block
  }

  // --- Password Visibility Toggle ---
  function togglePasswordVisibility(field: "password" | "confirmPassword") {
    if (field === "password") {
        showPassword = !showPassword;
    } else if (field === "confirmPassword") {
        showConfirmPassword = !showConfirmPassword;
    }
  }
</script>

<main
  class={`flex flex-col justify-center items-center min-h-screen w-full h-full relative overflow-hidden ${isDarkMode ? 'bg-zinc-900' : 'bg-gray-100'}`}
>
  <!-- Background image -->
  <div 
      class="absolute inset-0 z-0 bg-cover bg-bottom bg-no-repeat"
      style={`background-image: url('${isDarkMode ? '/Darkmode.png' : '/background.png'}');`}
  ></div>
  <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Microtask Logo" class="absolute top-10 left-10 h-12 scale-150 md:scale-250 z-20" />
  <h1 class={`text-3xl font-bold text-center mb-6 z-10 ${isDarkMode ? 'text-white' : 'text-black'}`} style="text-shadow: 2px 2px 8px rgba(0,0,0,0.7), -1px -1px 4px rgba(0,0,0,0.5);">Welcome to Microtask</h1>

  <form
    on:submit|preventDefault={handleSignup}
    class={`p-6 md:p-8 rounded-xl max-w-md w-[90%] md:w-full z-10 backdrop-blur-sm ${isDarkMode ? 'bg-zinc-800/95 border border-zinc-600 shadow-[0_8px_32px_rgba(0,0,0,0.5)]' : 'bg-white/95 border border-gray-200 shadow-[0_8px_32px_rgba(0,0,0,0.15)]'}`}
  >
    <h2 class={`text-xl font-bold text-center mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Sign up to continue</h2>

    {#if feedbackMessage}
      <div
        class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4 text-sm"
        role="alert"
        transition:fade
      >
          <span class="block sm:inline">{feedbackMessage}</span>
      </div>
    {/if}

    <div class="mb-4">
      <label for="username" class={`block mb-1 font-medium text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Username</label>
      <input
        id="username"
        name="username"
        type="text"
        bind:value={username}
        class={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-white placeholder-gray-400' : 'border-gray-300 bg-white'}`}
        required
        placeholder="Choose a username (letters, numbers, _)"
        aria-describedby="usernameHint"
      />
       <p id="usernameHint" class={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Only letters, numbers, and underscores allowed.</p>
    </div>

    <div class="mb-4">
      <label for="email" class={`block mb-1 font-medium text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email</label>
      <input
        id="email"
        name="email"
        type="email"
        bind:value={email}
        class={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-white placeholder-gray-400' : 'border-gray-300 bg-white'}`}
        required
        placeholder="your@email.com"
      />
    </div>

    <div class="mb-4">
      <label for="password" class={`block mb-1 font-medium text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Password</label>
      <div class="relative">
        {#if showPassword}
          <input
            id="password"
            name="password"
            type="text"
            bind:value={password}
            class={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-white placeholder-gray-400' : 'bg-white'} ${passwordError ? 'border-red-500' : ''}`}
            required
            placeholder="Create a password"
            aria-describedby="passwordHint passwordErrorMsg"
          />
        {:else}
          <input
            id="password"
            name="password"
            type="password"
            bind:value={password}
            class={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-white placeholder-gray-400' : 'bg-white'} ${passwordError ? 'border-red-500' : ''}`}
            required
            placeholder="Create a password"
            aria-describedby="passwordHint passwordErrorMsg"
          />
        {/if}
        <button
          type="button" aria-label={showPassword ? "Hide password" : "Show password"}
          class={`absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer p-1 ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          on:click={() => togglePasswordVisibility('password')}
        >
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
               {#if showPassword}
                 <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
               {:else}
                 <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /> <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
               {/if}
             </svg>
        </button>
      </div>
       <p id="passwordHint" class={`text-xs mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Min. 8 characters, with uppercase & lowercase letters.</p>
       {#if passwordError}
         <p id="passwordErrorMsg" class="text-xs text-red-600 mt-1" transition:fade>
           {passwordError}
         </p>
       {/if}
    </div>

    <div class="mb-6"> <label for="confirmPassword" class={`block mb-1 font-medium text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Re-type Password</label>
      <div class="relative">
        {#if showConfirmPassword}
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="text"
            bind:value={confirmPassword}
            class={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-white placeholder-gray-400' : 'border-gray-300 bg-white'}`}
            required
            placeholder="Confirm your password"
          />
        {:else}
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            bind:value={confirmPassword}
            class={`w-full px-3 py-2 border rounded-lg outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-white placeholder-gray-400' : 'border-gray-300 bg-white'}`}
            required
            placeholder="Confirm your password"
          />
        {/if}
        <button
          type="button" aria-label={showConfirmPassword ? "Hide password" : "Show password"}
          class={`absolute right-3 top-1/2 transform -translate-y-1/2 cursor-pointer p-1 ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          on:click={() => togglePasswordVisibility('confirmPassword')}
        >
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
               {#if showConfirmPassword}
                 <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
               {:else}
                 <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" /> <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
               {/if}
             </svg>
        </button>
      </div>
    </div>

    <div class="mt-6">
      <button
        type="submit"
        disabled={isLoading}
        class="w-full bg-black text-white py-2.5 rounded-lg font-semibold transition duration-200 transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Signing up...' : 'Sign up'}
      </button>
    </div>

    <div class="relative my-5"> <div class="absolute inset-0 flex items-center" aria-hidden="true"><div class={`w-full border-t ${isDarkMode ? 'border-zinc-600' : 'border-gray-300'}`}></div></div>
       <div class="relative flex justify-center text-sm"><span class={`px-2 ${isDarkMode ? 'bg-zinc-800 text-gray-400' : 'bg-white text-gray-500'}`}>Or</span></div>
     </div>

    <div class="mt-4">
      <button
        type="button"
        on:click={googleSignup}
        disabled={isLoading}
        class={`w-full border flex items-center justify-center py-2.5 rounded-lg font-semibold cursor-pointer transition duration-200 transform focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400 disabled:opacity-60 disabled:cursor-not-allowed ${isDarkMode ? 'border-zinc-600 hover:bg-zinc-700' : 'border-gray-300 hover:bg-gray-50'}`}
      >
        <img src="/iconnggoogle.webp" alt="Google" class="h-5 mr-2" />
        <span class={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Sign up with Google</span>
      </button>
    </div>

    <div class="mt-5 text-center text-sm"> <p class={isDarkMode ? 'text-gray-400' : 'text-gray-600'}>
        Already have an account?
        <a href="/login" class="text-blue-600 hover:underline font-medium">Log in</a>
      </p>
    </div>
  </form>
</main>

<style>
  /* Ensure inputs don't have browser default outlines when focused */
  input:focus {
    outline: none; /* Tailwind's focus:ring utilities handle the focus indication */
  }
  /* Add any other specific styles if needed */
</style>