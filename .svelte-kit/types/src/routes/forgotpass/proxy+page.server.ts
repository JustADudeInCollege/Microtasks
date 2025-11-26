// @ts-nocheck
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from '$lib/firebase.js';
import { fail } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import type { Actions } from './$types.js'; // Ensure SvelteKit types are generated

// Helper function to validate email format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

export const actions = {
  // Action to directly reset the password in Firestore
  resetPassword: async ({ request }: import('./$types').RequestEvent) => {
    const formData = await request.formData();
    const email = formData.get('email')?.toString().toLowerCase();
    const newPassword = formData.get('newPassword')?.toString();
    const confirmPassword = formData.get('confirmPassword')?.toString();

    // --- Input Validation ---
    if (!email || !newPassword || !confirmPassword) {
      return fail(400, { resetPassword: { success: false, error: 'Email and both password fields are required.' } });
    }
    if (!isValidEmail(email)) {
      return fail(400, { resetPassword: { success: false, error: 'Invalid email format.', email } });
    }
    if (newPassword !== confirmPassword) {
      return fail(400, { resetPassword: { success: false, error: 'Passwords do not match.', email } });
    }
    // Basic password strength check (minimum length)
    if (newPassword.length < 6) {
       return fail(400, { resetPassword: { success: false, error: 'Password must be at least 6 characters long.', email } });
    }
    // Consider adding more complex password validation matching signup if needed

    console.log("Attempting direct password reset for:", email);

    try {
      // 1. Find the user document in Firestore by email
      const credRef = collection(db, "credentials");
      const q = query(credRef, where("email", "==", email));
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        // User not found with this email
        console.log(`User not found for email: ${email}`);
        // NOTE: Returning specific error as requested, though less secure than a generic message
        return fail(404, { resetPassword: { success: false, error: 'Email not found.', email } });
      }

      // Assume only one user per email from signup logic
      const userDoc = snapshot.docs[0];
      const userId = userDoc.id; // Get the document ID

      // 2. Hash the new password using bcryptjs
      const hashedPassword = await bcrypt.hash(newPassword, 10); // Match signup hashing rounds (10)
      console.log(`New password hash generated for user ID: ${userId}`);
      console.log(`Hash to be stored: ${hashedPassword}`); // Log the hash before storing

      // 3. Update the user's password in Firestore
      const userRef = doc(db, "credentials", userId);
      console.log(`Attempting to update doc ID: ${userId} with hash: ${hashedPassword}`);
      await updateDoc(userRef, {
        password: hashedPassword
      });
      console.log(`Update operation completed for doc ID: ${userId}. Verifying...`);

      // **** Verification Step ****
      const { getDoc } = await import("firebase/firestore"); // Dynamically import getDoc
      const updatedDocSnap = await getDoc(userRef);
      if (updatedDocSnap.exists()) {
          const updatedData = updatedDocSnap.data();
          console.log(`Verification: Stored hash after update is: ${updatedData.password}`);
          if (updatedData.password !== hashedPassword) {
              console.error(`CRITICAL ERROR: Firestore update for ${userId} did not persist the new hash!`);
              // Optionally return a specific error here
              return fail(500, { resetPassword: { success: false, error: 'Database update failed verification. Please try again.', email } });
          }
      } else {
          console.error(`CRITICAL ERROR: Document ${userId} not found after update attempt!`);
           return fail(500, { resetPassword: { success: false, error: 'User document lost during update. Please contact support.', email } });
      }
      // **** End Verification ****

      console.log(`Password successfully reset and verified in Firestore for user ID: ${userId} (Email: ${email})`);

      // Return success
      return { resetPassword: { success: true, message: 'Password successfully updated.' } };

    } catch (error: any) {
      console.error("Error during direct password reset:", error);
      // Return generic server error
      return fail(500, { resetPassword: { success: false, error: 'Failed to reset password due to a server error. Please try again later.', email } });
    }
  }
};;null as any as Actions;