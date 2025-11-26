import { json, error as SvelteKitError } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { adminDb, admin } from '$lib/server/firebaseAdmin.js'; // Import admin for messaging
import type { SendResponse } from 'firebase-admin/messaging'; // Import type for SendResponse
import { CRON_SECRET, APP_URL } from '$env/static/private';

// Helper function to format a Date object to YYYY-MM-DD string
function getFormattedDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const GET: RequestHandler = async ({ url }) => {
  // 1. Authenticate the cron job request
  const providedSecret = url.searchParams.get('secret');
  if (providedSecret !== CRON_SECRET) {
    console.warn('[API /send-reminders] Unauthorized cron attempt.');
    throw SvelteKitError(401, 'Unauthorized');
  }

  console.log('[API /send-reminders] Cron job triggered. Processing tasks for <= 24hr FCM reminders...');
  
  const now = new Date(); // Current date and time
  const todayDateString = getFormattedDateString(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowDateString = getFormattedDateString(tomorrow);

  let notificationsSentCount = 0;
  let tasksConsideredCount = 0; 

  try {
    // 2. Query for tasks due TODAY or TOMORROW that are not completed.
    // We filter for `reminderSent24hr` in the code.
    const tasksSnapshot = await adminDb
      .collection('tasks')
      .where('isCompleted', '==', false)
      .where('dueDate', 'in', [todayDateString, tomorrowDateString])
      .get();

    if (tasksSnapshot.empty) {
      console.log(`[API /send-reminders] No tasks found due today or tomorrow for potential reminders.`);
      return json({ message: 'No tasks due today or tomorrow for potential reminders.', tasksConsidered: 0, notificationsSent: 0 });
    }

    console.log(`[API /send-reminders] Found ${tasksSnapshot.docs.length} tasks due today or tomorrow to consider.`);

    // 3. Process each task
    for (const taskDoc of tasksSnapshot.docs) {
      tasksConsideredCount++;
      const task = taskDoc.data();
      const userId = task.userId;
      const taskTitle = task.title || 'Untitled Task';
      const taskDueDateStr = task.dueDate; 
      const taskDueTimeStr = task.dueTime; // HH:MM string or null

      if (task.reminderSent24hr === true) {
        // console.log(`[API /send-reminders] 24hr reminder already sent for task ${taskDoc.id} (${taskTitle}). Skipping.`);
        continue;
      }

      if (!taskDueDateStr) {
        console.warn(`[API /send-reminders] Task ${taskDoc.id} ('${taskTitle}') has no dueDate. Skipping.`);
        continue;
      }

      // Construct precise due date/time for the task
      let taskDueDateTime: Date;
      try {
        const [year, month, day] = taskDueDateStr.split('-').map(Number);
        let hours = 23, minutes = 59, seconds = 59; // Default to end of day if no time
        if (taskDueTimeStr && /^\d{2}:\d{2}$/.test(taskDueTimeStr)) {
          [hours, minutes] = taskDueTimeStr.split(':').map(Number);
          seconds = 0; 
        }
        // Create date. Assuming dueDate and dueTime are in server's local timezone or a consistent one.
        taskDueDateTime = new Date(year, month - 1, day, hours, minutes, seconds);
      } catch (e) {
        console.warn(`[API /send-reminders] Could not parse dueDate/dueTime for task ${taskDoc.id} ('${taskDueDateStr}' '${taskDueTimeStr}'). Skipping.`, e);
        continue;
      }
      
      const timeDifferenceMs = taskDueDateTime.getTime() - now.getTime();
      const hoursDifference = timeDifferenceMs / (1000 * 60 * 60);

      // Check if due within the next 24 hours (and not past due by more than, e.g., 1 hour for cron processing delay)
      if (hoursDifference > -1 && hoursDifference <= 24) {
        console.log(`[API /send-reminders] Task ${taskDoc.id} (${taskTitle}) is due in ${hoursDifference.toFixed(1)} hours. Preparing notification.`);
      } else {
        // console.log(`[API /send-reminders] Task ${taskDoc.id} (${taskTitle}) due in ${hoursDifference.toFixed(1)} hours. Outside 0-24hr window. Skipping.`);
        continue;
      }
      
      if (!userId) {
        console.warn(`[API /send-reminders] Task ${taskDoc.id} is missing userId. Skipping.`);
        continue;
      }

      // Fetch user's email and username from 'credentials' collection (optional for FCM, but good for logs)
      const userCredDoc = await adminDb.collection('credentials').doc(userId).get();
      const userName = userCredDoc.exists ? (userCredDoc.data()?.username || 'User') : 'User';

      // 4. Fetch FCM tokens for the user
      const fcmTokensSnapshot = await adminDb.collection('users').doc(userId).collection('fcmTokens').get();
      if (fcmTokensSnapshot.empty) {
        console.log(`[API /send-reminders] No FCM tokens found for user ${userId} (${userName}). Skipping push notification for task ${taskTitle}.`);
        continue;
      }

      const tokens = fcmTokensSnapshot.docs.map(docSnap => docSnap.data().token as string).filter(Boolean);
      if (tokens.length === 0) {
        console.log(`[API /send-reminders] No valid FCM tokens extracted for user ${userId} (${userName}) for task ${taskTitle}.`);
        continue;
      }

      // 5. Send Push Notification using Firebase Admin SDK
      const appBaseUrl = APP_URL || 'https://microtasks-zoys.vercel.app/';
      const taskPageUrl = `${appBaseUrl}/tasks`; 

      const messagePayload = {
        notification: {
          title: `Task Reminder: ${taskTitle}`,
          body: `Your task "${taskTitle}" is due in approx. ${Math.max(0, Math.round(hoursDifference))} hour(s) (at ${taskDueTimeStr || 'end of day'} on ${taskDueDateStr}).`,
          // icon: `${appBaseUrl}/favicon.png`, // Optional: URL to an icon
        },
        webpush: { 
          fcmOptions: {
            link: taskPageUrl 
          },
        },
        tokens: tokens,
      };

      try {
        console.log(`[API /send-reminders] Attempting to send push notification to user ${userId} (${userName}) for task "${taskTitle}" to ${tokens.length} device(s).`);
        const response = await admin.messaging().sendEachForMulticast(messagePayload);
        
        let successCount = response.successCount;
        if (successCount > 0) {
          notificationsSentCount += successCount;
          console.log(`[API /send-reminders] Successfully sent ${successCount} push notifications for task "${taskTitle}" to user ${userId}.`);
          // Mark that the 24hr reminder has been sent for this task
          await adminDb.collection('tasks').doc(taskDoc.id).update({ reminderSent24hr: true });
          console.log(`[API /send-reminders] Marked task ${taskDoc.id} (${taskTitle}) with reminderSent24hr = true.`);
        }

        if (response.failureCount > 0) {
          response.responses.forEach((resp: SendResponse, idx: number) => {
            if (!resp.success) {
              console.error(`[API /send-reminders] Failed to send to token ${tokens[idx]}: ${resp.error}`);
              if (resp.error?.code === 'messaging/registration-token-not-registered') {
                const failedToken = tokens[idx];
                adminDb.collection('users').doc(userId).collection('fcmTokens').where('token', '==', failedToken).get()
                  .then(snap => snap.forEach(d => d.ref.delete()))
                  .catch(e => console.error(`[API /send-reminders] Error deleting stale token ${failedToken}:`, e));
              }
            }
          });
        }
      } catch (pushError) {
        console.error(`[API /send-reminders] Failed to send push notification for task "${taskTitle}" to user ${userId}:`, pushError);
      }
    } // End of for loop

    console.log(`[API /send-reminders] Finished processing. Tasks considered: ${tasksConsideredCount}. Push notifications sent to ${notificationsSentCount} device(s).`);
    return json({
      message: 'Reminder processing complete.',
      tasksConsidered: tasksConsideredCount,
      notificationsSent: notificationsSentCount,
    });

  } catch (err: any) {
    console.error('[API /send-reminders] Critical error during reminder processing:', err);
    throw SvelteKitError(500, `Internal Server Error: ${err.message}`);
  }
};