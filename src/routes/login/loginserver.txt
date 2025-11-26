
import type { Actions } from './$types.js';
import { db } from '$lib/firebase.js'; // Ensure this path is correct
import { fail } from '@sveltejs/kit';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

// --- Action to look up email by username ---
export const actions: Actions = {
  lookupEmail: async ({ request }) => {
    const formData = await request.formData();
    const username = formData.get('username')?.toString();

    // Validate input: Check if username was provided
    if (!username) {
      // Return 400 Bad Request if username is missing
      return fail(400, {
          lookup: { // Use consistent nested structure for errors
            success: false,
            error: 'Username was not provided.'
          }
      });
    }

    console.log(`[DEBUG] Server: Looking up email for username: ${username}`);

    try {
      // Prepare Firestore query
      const credRef = collection(db, "credentials");
      const q = query(credRef, where("username", "==", username), limit(1)); // Query by username, expect max 1 result

      // Execute query
      const snapshot = await getDocs(q);

      // --- Handling Firestore Query Result ---
      if (snapshot.empty) {
        // Username not found in the database
        console.log(`[DEBUG] Server: Username not found: ${username}. Returning fail(404).`);
        // Use fail(404) to indicate resource not found, providing a clear error message
        return fail(404, { // HTTP 404 Not Found
            lookup: { // Maintain consistent payload structure
                success: false,
                error: 'Username not found.' // Specific error for client
            }
        });
      } else {
        // Username found, proceed to extract email
        const userData = snapshot.docs[0].data();
        const email = userData.email;

        // Validate data integrity: Check if email field exists
        if (!email) {
             console.error(`[DEBUG] Server: Found user document for ${username} but the 'email' field is missing or empty.`);
             // Return 500 Internal Server Error for incomplete data
             return fail(500, {
                 lookup: {
                    success: false,
                    error: 'User data incomplete on server.' // Error for internal issue
                 }
             });
        }

        // Successfully found the email associated with the username
        console.log(`[DEBUG] Server: Found email ${email} for username ${username}`);
        // Return a successful response (plain object, SvelteKit sends HTTP 200)
        return { // Success case
            lookup: {
                success: true,
                email: email // Include the found email
            }
        };
      }
    } catch (error: any) {
      // Catch any unexpected errors during Firestore interaction or processing
      console.error("[DEBUG] Server: Unexpected error during username lookup:", error);
      // Return 500 Internal Server Error for unexpected issues
      return fail(500, {
          lookup: {
            success: false,
            error: 'An internal server error occurred. Please try again later.' // Generic error for client
          }
      });
    }
  }
  // Other actions (e.g., password reset) could be defined here
};

// Optional: Load function (uncomment and adapt if needed for passing initial data/messages)
// export async function load({ url }) {
//     // ... load function logic ...
//     return {
//         // props for the page
//     };
// }