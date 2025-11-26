import { fail } from '@sveltejs/kit';
import { db } from '$lib/firebase.js'; // Ensure this path is correct
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

// Named action to save user profile data (username, email, uid) to Firestore
// This is called *after* successful Firebase Authentication user creation on the client-side.
export const actions = {
  saveUserProfile: async ({ request }) => {
    const formData = await request.formData();
    const uid = formData.get('uid')?.toString();
    const username = formData.get('username')?.toString();
    const email = formData.get('email')?.toString().toLowerCase(); // Ensure consistent casing

    console.log(`[DEBUG] Server: Received saveUserProfile request for uid: ${uid}, username: ${username}, email: ${email}`);

    // --- Basic Input Validation ---
    if (!uid || !username || !email) {
      console.error('[DEBUG] Server: Missing uid, username, or email in saveUserProfile request.');
      return fail(400, { // 400 Bad Request
        profileSave: { // Use a distinct key for this action's response
          success: false,
          error: 'Missing required user data (uid, username, or email).'
        }
      });
    }

    // --- Username Validation ---
    const usernameRegex = /^[a-zA-Z0-9_]+$/; // Allow letters, numbers, underscore
    if (!usernameRegex.test(username)) {
        console.error(`[DEBUG] Server: Invalid username format: ${username}`);
        return fail(400, {
            profileSave: {
                success: false,
                error: 'Username can only contain letters, numbers, and underscores.'
            }
        });
    }

    // --- Firestore References ---
    const credCollectionRef = collection(db, "credentials");
    const userDocRef = doc(credCollectionRef, uid); // Use Firebase UID as the document ID

    try {
      // --- Check 1: Does a document with this UID already exist? ---
      // This shouldn't happen if client-side logic is correct, but good failsafe.
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
          console.warn(`[DEBUG] Server: Document for UID ${uid} already exists in credentials. Potential duplicate signup attempt?`);
          // Decide how to handle: maybe return success assuming it was a retry? Or fail?
          // For now, let's treat it as potentially okay, but log a warning.
          // If the existing doc has the *same* username, it's fine. If different, it's an issue.
          const existingData = userDocSnap.data();
          if (existingData.username !== username) {
             console.error(`[DEBUG] Server: UID ${uid} exists but with different username (${existingData.username}) than provided (${username}).`);
              return fail(409, { // 409 Conflict
                  profileSave: {
                      success: false,
                      error: 'User ID already associated with a different username.'
                  }
              });
          }
           console.log(`[DEBUG] Server: UID ${uid} already exists with the same username. Treating as success.`);
           return { profileSave: { success: true } }; // Indicate success
      }

      // --- Check 2: Is the desired username already taken by *another* user? ---
      const usernameQuery = query(credCollectionRef, where("username", "==", username));
      const usernameSnap = await getDocs(usernameQuery);

      if (!usernameSnap.empty) {
        // Username is already taken by a different user (since UID check passed)
        console.warn(`[DEBUG] Server: Username "${username}" is already taken.`);
        return fail(409, { // 409 Conflict
          profileSave: {
            success: false,
            error: 'Username is already taken. Please choose another.'
          }
        });
      }

      // --- Create the new user document in Firestore ---
      console.log(`[DEBUG] Server: Username "${username}" is available. Creating document for UID ${uid}.`);
      await setDoc(userDocRef, {
        uid: uid, // Store uid explicitly as well, can be useful
        username: username,
        email: email
        // DO NOT store password here - Firebase Auth handles that securely.
      });

      console.log(`[DEBUG] Server: Successfully saved profile for UID ${uid} / Username ${username}.`);
      // Return success
      return { // SvelteKit default success is 200 OK
        profileSave: {
          success: true
        }
      };

    } catch (error) {
      console.error("[DEBUG] Server: Unexpected error during saveUserProfile:", error);
      return fail(500, { // 500 Internal Server Error
        profileSave: {
          success: false,
          error: 'An internal server error occurred while saving profile. Please try again later.'
        }
      });
    }
  }
};
