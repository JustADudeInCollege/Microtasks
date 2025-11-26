// src/routes/settings/+page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { adminAuth, adminDb } from '$lib/server/firebaseAdmin'; // You'll need to set this up

// Ensure firebaseadmin is initialized only once
if (!adminAuth) {
  console.warn("Firebase Admin SDK not initialized on the server. User data might be limited.");
}

export const load: PageServerLoad = async ({ locals }) => {
  const userId = locals.userId;
  
  if (!userId) {
    // If you have a redirect query parameter for post-login, use it
    // throw redirect(302, '/login?redirect=/settings'); 
    throw redirect(302, '/login'); // Or a generic login redirect
  }

  let username = "User"; // Default username
  let photoURL = null; // Default photoURL

  // For enhanced data or if 'credentials' is the source of truth, fetch from Firestore Admin
  if (adminAuth && adminDb) {
    try {
      // Fetch Firebase Auth user data for displayName and photoURL as a fallback or primary source
      const userRecord = await adminAuth.getUser(userId);
      username = userRecord.displayName || username; // Prefer Firebase Auth display name
      photoURL = userRecord.photoURL || photoURL;

      // You could also fetch from your 'credentials' collection if it contains more/different info
      // const credRef = adminDb.collection('credentials').doc(locals.user.uid);
      // const credDoc = await credRef.get();
      // if (credDoc.exists) {
      //   const credData = credDoc.data();
      //   if (credData?.username) username = credData.username;
      //   if (credData?.photoURL) photoURL = credData.photoURL; 
      // }

    } catch (error: any) {
      console.error("Error fetching user data from Firebase Admin in settings load:", error.message);
      // Don't fail the page load, just use what we have from locals or defaults
    }
  }

  return {
    // Pass the username that will be used in the header and potentially to pre-fill forms
    // The client-side onAuthStateChanged will ultimately be the most up-to-date source for forms.
    username: username, 
    // Note: We don't pass full user object here to avoid exposing sensitive data if `locals.user` contains more.
    // The client-side will handle fetching the detailed profile for editing via Firebase SDK.
    // photoURL: photoURL, // Can also pass this if needed for initial header display
  };
};

// Actions are typically handled client-side with Firebase SDK for auth/profile updates.
// If you had specific server-side actions (e.g., complex data processing not suitable for client),
// they would go here. For this settings page, direct client-side Firebase calls are more common.
// export const actions: Actions = {
//   // Example: If you had a server-side form submission for something
//   // updateNonAuthRelatedSetting: async ({ request, locals }) => {
//   //   if (!locals.user) throw redirect(302, '/login');
//   //   const formData = await request.formData();
//   //   const someSetting = formData.get('someSetting');
//   //   // ... process and save ...
//   //   return { success: true, message: 'Setting updated' };
//   // }
// };