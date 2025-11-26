import { writable } from 'svelte/store';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase.js'; // Explicitly add .js extension
import { browser } from '$app/environment';
// Initialize with null or a value from localStorage if you persist login
const initialUser = null;
export const user = writable(initialUser);
if (browser) {
    onAuthStateChanged(auth, (firebaseUser) => {
        if (firebaseUser) {
            user.set({
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                displayName: firebaseUser.displayName,
            });
            console.log('[AuthStore] User signed in:', firebaseUser.uid);
        }
        else {
            user.set(null);
            console.log('[AuthStore] User signed out.');
        }
    });
}
// You might also want to export a loading state
export const authLoading = writable(true);
if (browser) {
    const unsubscribe = onAuthStateChanged(auth, () => {
        authLoading.set(false);
        unsubscribe(); // Unsubscribe after first auth state change
    });
}
