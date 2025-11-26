// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
// adminAuth is now the initialized Auth service instance
import { adminAuth } from './lib/server/firebaseAdmin.js';

export const handle: Handle = async ({ event, resolve }) => {
    const sessionCookie = event.cookies.get('__session');

    if (!sessionCookie) {
        // No session cookie found, user is not logged in server-side.
        // console.debug('[Hooks] No session cookie found.');
        event.locals.userId = null;
        return resolve(event); // Proceed without setting user info
    }

    try {
        // Verify the token stored in the cookie
        // console.debug('[Hooks] Verifying session cookie...');

        // --- CORRECTED LINE ---
        // Call verifyIdToken directly on the adminAuth instance
        const decodedToken = await adminAuth.verifyIdToken(sessionCookie, true);
        // --- END CORRECTION ---

        // console.debug(`[Hooks] Session cookie verified for UID: ${decodedToken.uid}`);

        // Add the user's UID to locals
        event.locals.userId = decodedToken.uid;
    } catch (error: any) {
        // Cookie is invalid or expired. Clear it and treat user as logged out.
        if (
            error.code === 'auth/id-token-expired' ||
            error.code === 'auth/argument-error' /* invalid token */
        ) {
            console.warn(`[Hooks] Invalid session cookie: ${error.code}. Clearing cookie.`);
            event.cookies.delete('__session', { path: '/' });
        } else {
            console.error('[Hooks] Error verifying session cookie:', error);
        }
        event.locals.userId = null;
    }

    // Continue processing the request
    return resolve(event);
};