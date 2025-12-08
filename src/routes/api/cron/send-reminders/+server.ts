import { json, error as SvelteKitError } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { adminDb, admin } from '$lib/server/firebaseAdmin.js'; // Import admin for messaging
import type { SendResponse } from 'firebase-admin/messaging'; // Import type for SendResponse
import { env } from '$env/dynamic/private';
import { sendTaskReminderEmail, type TaskEmailData } from '$lib/server/emailService.js';

const CRON_SECRET = env.CRON_SECRET;
const APP_URL = env.APP_URL;

// Helper function to format a Date object to YYYY-MM-DD string
function getFormattedDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to get timezone offset in hours (e.g., "Asia/Manila" -> +8, "America/New_York" -> -5 or -4)
function getTimezoneOffsetHours(timezone: string): number {
  try {
    const now = new Date();
    // Get the offset by comparing UTC time with the timezone's local time
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    
    let offsetHours = hour - utcHour + (minute - utcMinute) / 60;
    
    // Handle day boundary
    if (offsetHours > 12) offsetHours -= 24;
    if (offsetHours < -12) offsetHours += 24;
    
    return offsetHours;
  } catch (e) {
    console.warn(`[Timezone] Failed to parse timezone "${timezone}", defaulting to UTC`);
    return 0; // Default to UTC
  }
}

// Convert a date string (YYYY-MM-DD) and time string (HH:MM) in user's timezone to UTC Date
function parseUserLocalDateTime(dateStr: string, timeStr: string | null, timezoneOffsetHours: number): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  let hours = 23, minutes = 59, seconds = 59; // Default to end of day
  
  if (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) {
    [hours, minutes] = timeStr.split(':').map(Number);
    seconds = 0;
  }
  
  // Create UTC date, then subtract the timezone offset to get the correct UTC time
  // If user is at UTC+8 and says "14:00", the UTC time is 14:00 - 8 = 06:00 UTC
  const utcHours = hours - timezoneOffsetHours;
  
  return new Date(Date.UTC(year, month - 1, day, utcHours, minutes, seconds));
}

export const GET: RequestHandler = async ({ url }) => {
  // 1. Authenticate the cron job request
  const providedSecret = url.searchParams.get('secret');
  if (providedSecret !== CRON_SECRET) {
    console.warn('[API /send-reminders] Unauthorized cron attempt.');
    throw SvelteKitError(401, 'Unauthorized');
  }

  console.log('[API /send-reminders] Cron job triggered. Processing tasks for <= 24hr FCM and email reminders...');
  
  const now = new Date(); // Current date and time
  const todayDateString = getFormattedDateString(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowDateString = getFormattedDateString(tomorrow);

  let pushNotificationsSentCount = 0;
  let emailsSentCount = 0;
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
      return json({ message: 'No tasks due today or tomorrow for potential reminders.', tasksConsidered: 0, pushNotificationsSent: 0, emailsSent: 0 });
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

      if (!userId) {
        console.warn(`[API /send-reminders] Task ${taskDoc.id} is missing userId. Skipping.`);
        continue;
      }

      // Fetch user's timezone from their profile (stored in credentials or users collection)
      const userCredDoc = await adminDb.collection('credentials').doc(userId).get();
      const userTimezone = userCredDoc.exists ? (userCredDoc.data()?.timezone || 'UTC') : 'UTC';
      const userName = userCredDoc.exists ? (userCredDoc.data()?.username || 'User') : 'User';
      const userEmail = userCredDoc.exists ? userCredDoc.data()?.email : null;
      
      // Get timezone offset for this user
      const timezoneOffsetHours = getTimezoneOffsetHours(userTimezone);
      console.log(`[API /send-reminders] User ${userId} timezone: ${userTimezone} (offset: ${timezoneOffsetHours}h)`);

      // Construct precise due date/time for the task in UTC
      let taskDueDateTimeUTC: Date;
      try {
        taskDueDateTimeUTC = parseUserLocalDateTime(taskDueDateStr, taskDueTimeStr, timezoneOffsetHours);
      } catch (e) {
        console.warn(`[API /send-reminders] Could not parse dueDate/dueTime for task ${taskDoc.id} ('${taskDueDateStr}' '${taskDueTimeStr}'). Skipping.`, e);
        continue;
      }
      
      const timeDifferenceMs = taskDueDateTimeUTC.getTime() - now.getTime();
      const hoursDifference = timeDifferenceMs / (1000 * 60 * 60);

      // Check if due within the next 24 hours (and not past due by more than, e.g., 1 hour for cron processing delay)
      if (hoursDifference > -1 && hoursDifference <= 24) {
        console.log(`[API /send-reminders] Task ${taskDoc.id} (${taskTitle}) is due in ${hoursDifference.toFixed(1)} hours. Preparing notification.`);
      } else {
        // console.log(`[API /send-reminders] Task ${taskDoc.id} (${taskTitle}) due in ${hoursDifference.toFixed(1)} hours. Outside 0-24hr window. Skipping.`);
        continue;
      }

      const appBaseUrl = APP_URL || 'https://microtasks-zoys.vercel.app/';
      const taskPageUrl = `${appBaseUrl}/tasks`;

      // 4a. Send Email Notification
      if (userEmail && !task.emailReminderSent24hr) {
        const emailData: TaskEmailData = {
          taskTitle: taskTitle,
          taskDescription: task.description || undefined,
          dueDate: taskDueDateStr,
          dueTime: taskDueTimeStr || undefined,
          hoursUntilDue: hoursDifference,
          taskUrl: taskPageUrl
        };

        const emailSent = await sendTaskReminderEmail(userEmail, userName, emailData);
        if (emailSent) {
          emailsSentCount++;
          await adminDb.collection('tasks').doc(taskDoc.id).update({ emailReminderSent24hr: true });
          console.log(`[API /send-reminders] Email reminder sent to ${userEmail} for task "${taskTitle}".`);
        }
      } else if (!userEmail) {
        console.log(`[API /send-reminders] No email found for user ${userId} (${userName}). Skipping email for task ${taskTitle}.`);
      }

      // 4b. Fetch FCM tokens for push notification
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
          pushNotificationsSentCount += successCount;
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

    console.log(`[API /send-reminders] Finished processing. Tasks considered: ${tasksConsideredCount}. Push notifications: ${pushNotificationsSentCount}. Emails sent: ${emailsSentCount}.`);
    return json({
      message: 'Reminder processing complete.',
      tasksConsidered: tasksConsideredCount,
      pushNotificationsSent: pushNotificationsSentCount,
      emailsSent: emailsSentCount
    });

  } catch (err: any) {
    console.error('[API /send-reminders] Critical error during reminder processing:', err);
    throw SvelteKitError(500, `Internal Server Error: ${err.message}`);
  }
};