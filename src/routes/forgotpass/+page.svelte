<script lang="ts">
  import { auth } from '$lib/firebase.js'; // Using central firebase.js
  import { sendPasswordResetEmail } from "firebase/auth";

  let email = "";
  let isLoading = false;
  let formMessage: string | null = null;
  let messageType: 'success' | 'error' = 'error';

  // --- Validate email format ---
  function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // --- Send reset email using Firebase Auth ---
  async function handleResetRequest() {
    formMessage = null; // Clear previous messages
    messageType = 'error';

    if (!email) {
      formMessage = "Please enter your email address.";
      return;
    }
    if (!isValidEmail(email)) {
      formMessage = "Please enter a valid email address.";
      return;
    }

    isLoading = true;

    try {
      // Use the imported auth instance from $lib/firebase.js
      await sendPasswordResetEmail(auth, email.trim().toLowerCase());

      // Display a generic success message
      formMessage = "If an account exists for this email, a password reset link has been sent.";
      messageType = 'success';
      email = ""; // Clear field on success

    } catch (error: any) {
      console.error("Error sending password reset email:", error);
      if (error.code === 'auth/invalid-email') {
          formMessage = "Invalid email format provided.";
      } else {
          formMessage = "Failed to send reset link. Please try again later.";
      }
      messageType = 'error';
    } finally {
      isLoading = false;
    }
  }
</script>

<main
  class="flex flex-col justify-center items-center min-h-screen w-full h-full bg-cover bg-[center_top_100%]"
  style="background-image: url('/background.png');"
>
  <img src="/logonamin.png" alt="Logo" class="absolute top-10 left-10 h-12 scale-250" />

  <h1 class="text-3xl font-bold text-center mb-6 text-black">Microtask</h1>

  <div class="bg-white p-8 rounded-lg shadow-2xl border border-gray-500/50 max-w-md w-full text-center">

      <h2 class="text-xl font-bold mb-2">Forgot Your Password?</h2>
      <p class="text-gray-600 mb-6">
        Enter your email address below, and if an account exists, we'll send you a link to reset your password.
      </p>

      {#if formMessage}
        <p class="text-center text-sm mb-4 {messageType === 'error' ? 'text-red-500' : 'text-green-500'}">
          {formMessage}
        </p>
      {/if}

      <form on:submit|preventDefault={handleResetRequest}>
          <div class="mb-4 text-left">
            <label for="email" class="block text-gray-700 font-semibold mb-1">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              bind:value={email}
              class="w-full px-3 py-2 border rounded-lg outline-none border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Enter your account email"
              required
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            class="w-full bg-black text-white py-2 rounded-lg font-semibold transition duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Sending...' : 'Send Reset Link'}
          </button>
      </form>

      <a href="/login" class="block mt-6 text-sm text-blue-500 hover:underline">
        Back to Login
      </a>

  </div>
</main>

<style>
  input:disabled {
    background-color: #f3f4f6; /* Tailwind gray-100 */
    cursor: not-allowed;
  }
</style>
