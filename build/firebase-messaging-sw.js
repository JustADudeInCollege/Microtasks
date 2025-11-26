// static/firebase-messaging-sw.js

// Scripts for firebase and firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker
// Get this config from your Firebase project settings (Web App)
// IMPORTANT: Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCw0-_N_zTL2Psu2kpIDReFOt6fCF2RcFo",
  authDomain: "microtasks-4c31d.firebaseapp.com",
  projectId: "microtasks-4c31d",
  storageBucket: "microtasks-4c31d.firebasestorage.app",
  messagingSenderId: "599965802416",
  appId: "1:599965802416:web:e09f0a98cb25be73c50075",
  measurementId: "G-LVS586S5HK"
};


firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);

  // Customize notification here
  const notificationTitle = payload.notification?.title || 'New Notification';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new message.',
    icon: payload.notification?.icon || '/favicon.png' // Optional: path to an icon
    // You can add more options like 'data' to handle clicks, etc.
    // data: { url: payload.data?.url || '/' } // Example: URL to open on click
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Optional: Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click Received.', event.notification.data);
  event.notification.close();

  // Example: Open a URL from the notification data
  // const urlToOpen = event.notification.data && event.notification.data.url ? event.notification.data.url : '/';
  // event.waitUntil(clients.openWindow(urlToOpen));
});