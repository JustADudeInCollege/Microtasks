import { writable, type Writable } from 'svelte/store';
import { onAuthStateChanged, type User as FirebaseUser } from 'firebase/auth';
import { auth } from '$lib/firebase.js'; // Explicitly add .js extension
import { browser } from '$app/environment';

export interface UserState { // Add export here
  uid: string | null;
  email: string | null;
  displayName: string | null;
  // Add other user properties you might need
}

// Initialize with null or a value from localStorage if you persist login
const initialUser: UserState | null = null;

export const user: Writable<UserState | null> = writable(initialUser);

if (browser) {
  onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
    if (firebaseUser) {
      user.set({
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
      });
      console.log('[AuthStore] User signed in:', firebaseUser.uid);
    } else {
      user.set(null);
      console.log('[AuthStore] User signed out.');
    }
  });
}

// You might also want to export a loading state
export const authLoading: Writable<boolean> = writable(true);

if (browser) {
    const unsubscribe = onAuthStateChanged(auth, () => {
        authLoading.set(false);
        unsubscribe(); // Unsubscribe after first auth state change
    });
}