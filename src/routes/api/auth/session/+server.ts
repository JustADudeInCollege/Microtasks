// src/routes/api/auth/session/+server.ts
import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { adminDb } from '../../../../lib/server/firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';
// Ensure this path matches where your firebaseAdmin setup is
import { adminAuth } from '../../../../lib/server/firebaseAdmin.js'; // adminAuth is the initialized instance
// Use dynamic private env vars for checking environment
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request, cookies }) => {
    try {
        // 1. Get the ID token from the client's request body
        const { token } = await request.json();

        if (!token) {
            // Use SvelteKit's error helper for proper HTTP errors
            throw error(400, 'ID token is required.');
        }

        // 2. Verify the ID token using Firebase Admin SDK.
        // This checks if the token is valid, not expired, and issued by your Firebase project.

        // --- CORRECTED LINE ---
        // Call verifyIdToken directly on the adminAuth instance
        const decodedToken = await adminAuth.verifyIdToken(token, true /** checkRevoked - optional */);
        // --- END CORRECTION ---

        console.log(`[API Session] Verified ID token for UID: ${decodedToken.uid}`);

        // 3. Set the session cookie
        const secure = env.NODE_ENV === 'production'; // Use secure cookies in production only
        // Consider making maxAge configurable via env vars too
        const maxAge = 60 * 60 * 24 * 14; // Cookie expiry: 14 days in seconds

        cookies.set('__session', token, {
            path: '/', // Cookie available for all paths
            httpOnly: true, // CRITICAL: Prevents client-side JS from accessing the cookie
            secure: secure, // CRITICAL: Send only over HTTPS in production
            maxAge: maxAge, // How long the cookie lasts
            sameSite: 'lax' // Protects against CSRF attacks in most cases
        });
// 4. Create or update user document in 'credentials' collection
const userDocRef = adminDb.collection('credentials').doc(decodedToken.uid);
const userDoc = await userDocRef.get();

if (!userDoc.exists) {
    // User document doesn't exist, create it
    await userDocRef.set({
        username: decodedToken.name || decodedToken.email || 'Google User',
        email: decodedToken.email,
        provider: 'google',
        createdAt: FieldValue.serverTimestamp()
    });
    console.log(`[API Session] Created new user document for UID: ${decodedToken.uid}`);
} else {
    // User document exists, update it with latest info (e.g., display name)
    await userDocRef.update({
        username: decodedToken.name || decodedToken.email || 'Google User',
        email: decodedToken.email,
        lastLogin: FieldValue.serverTimestamp()
    });
    console.log(`[API Session] Updated user document for UID: ${decodedToken.uid}`);
}

// 5. Return a success response to the client
return json({ success: true, message: 'Session cookie set.' });


    } catch (err: any) {
        console.error('[API Session] Error verifying token or setting cookie:', err);

        // Handle specific Firebase Admin errors for better client feedback
        if (err.code === 'auth/id-token-expired') {
            throw error(401, 'Firebase ID token has expired. Please log in again.');
        }
        if (err.code === 'auth/argument-error' || err.code === 'auth/invalid-id-token') {
            throw error(401, 'Firebase ID token is invalid.');
        }
        // Handle revoked token if checkRevoked is true
        if (err.code === 'auth/id-token-revoked') {
             throw error(401, 'Your session has been revoked. Please log in again.');
        }
        // Default error for other issues
        throw error(500, 'Failed to verify authentication.');
    }
};

// Optional: Add a GET or DELETE handler if you need to explicitly log out
// export const DELETE: RequestHandler = async ({ cookies }) => {
//  cookies.delete('__session', { path: '/' });
//  return json({ success: true, message: 'Logged out' });
// };