// src/lib/server/firebaseAdmin.js - Using Environment Variable

import admin from "firebase-admin";
import { getApps } from "firebase-admin/app";
// Automatically loads variables from .env in development
import 'dotenv/config';

// --- Load Service Account Key from Environment Variable ---
const serviceAccountJson = process.env.FIREBASE_ADMIN_SDK_JSON;

if (!serviceAccountJson) {
    // Throw an error if the environment variable is not set.
    // In production, environment variables are usually set through the hosting provider's interface.
    console.error("!!! FATAL ERROR: FIREBASE_ADMIN_SDK_JSON environment variable is not set! !!!");
    console.error("Ensure you have a .env file with the variable set in development,");
    console.error("or that the environment variable is configured in your deployment environment.");
    throw new Error("Firebase Admin SDK configuration is missing.");
}

let serviceAccount;
try {
    // Parse the JSON string from the environment variable
    serviceAccount = JSON.parse(serviceAccountJson);
} catch (e) {
    console.error("!!! Failed to parse FIREBASE_ADMIN_SDK_JSON environment variable content !!!", e);
    console.error("Verify the JSON content in your .env file or environment variable configuration.");
    throw new Error("Firebase Admin SDK service account key could not be parsed.");
}
// --- End Loading Key ---


// Initialize Firebase Admin SDK only if it hasn't been initialized yet
if (!getApps().length) {
  try {
      admin.initializeApp({
          // Use the parsed service account object
          credential: admin.credential.cert(serviceAccount),
          // Optional: Add databaseURL or storageBucket if needed for other services
          // databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
          // storageBucket: `${serviceAccount.project_id}.appspot.com`,
      });
      console.log('[Firebase Admin] SDK Initialized successfully (using environment variable).');
  } catch(e) {
      console.error("!!! Firebase Admin SDK Initialization Failed !!!", e);
      // Throw error to potentially stop the server if Firebase Admin is critical
      throw new Error("Firebase Admin SDK could not be initialized.");
  }
} else {
    console.log('[Firebase Admin] SDK already initialized.');
}

// --- Export the Correct Service Instances ---
// Call the functions to get the service instances AFTER potential initialization
const adminAuthInstance = admin.auth();
const adminDbInstance = admin.firestore();

console.log('[Firebase Admin] Auth and Firestore instances obtained.');

// Export the instances with the desired names (adminAuth, adminDb)
export const adminAuth = adminAuthInstance;
export const adminDb = adminDbInstance;

// Optionally export the main admin object if you need direct access elsewhere
export { admin };

// --- End Export ---