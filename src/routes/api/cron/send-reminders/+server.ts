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

// Helper function to convert 24h time (HH:MM) to 12h format (h:MM AM/PM)
function formatTime12h(time24: string | null): string {
  if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) return 'end of day';
  
  const [hourStr, minute] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  
  return `${hour}:${minute} ${ampm}`;
}

// Helper to get timezone offset in minutes (more accurate than hours)
function getTimezoneOffsetMinutes(timezone: string): number {
  try {
    // Create a date and format it in both UTC and the target timezone
    const now = new Date();
    
    // Get UTC components
    const utcYear = now.getUTCFullYear();
    const utcMonth = now.getUTCMonth();
    const utcDate = now.getUTCDate();
    const utcHours = now.getUTCHours();
    const utcMinutes = now.getUTCMinutes();
    
    // Get the local time in the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    
    const parts = formatter.formatToParts(now);
    const tzYear = parseInt(parts.find(p => p.type === 'year')?.value || '0');
    const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1;
    const tzDay = parseInt(parts.find(p => p.type === 'day')?.value || '1');
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    
    // Calculate total minutes for each
    const utcTotalMinutes = ((utcYear * 365 + utcMonth * 30 + utcDate) * 24 * 60) + (utcHours * 60) + utcMinutes;
    const tzTotalMinutes = ((tzYear * 365 + tzMonth * 30 + tzDay) * 24 * 60) + (tzHour * 60) + tzMinute;
    
    const offsetMinutes = tzTotalMinutes - utcTotalMinutes;
    
    console.log(`[Timezone] ${timezone}: UTC ${utcHours}:${utcMinutes}, Local ${tzHour}:${tzMinute}, offset=${offsetMinutes}min`);
    
    return offsetMinutes;
  } catch (e) {
    console.warn(`[Timezone] Failed to parse timezone "${timezone}", defaulting to UTC`);
    return 0;
  }
}

// Convert a date string (YYYY-MM-DD) and time string (HH:MM) in user's timezone to UTC Date
function parseUserLocalDateTime(dateStr: string, timeStr: string | null, timezoneOffsetMinutes: number): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  let hours = 23, minutes = 59, seconds = 59; // Default to end of day
  
  if (timeStr && /^\d{2}:\d{2}$/.test(timeStr)) {
    [hours, minutes] = timeStr.split(':').map(Number);
    seconds = 0;
  }
  
  // Convert local time to UTC by subtracting the offset
  // User's local time - offset = UTC time
  // e.g., 21:00 Manila (UTC+8, offset=+480min) -> 21:00 - 480min = 13:00 UTC
  const localTotalMinutes = hours * 60 + minutes;
  const utcTotalMinutes = localTotalMinutes - timezoneOffsetMinutes;
  
  const utcHours = Math.floor(utcTotalMinutes / 60);
  const utcMinutes = utcTotalMinutes % 60;
  
  // Handle day overflow/underflow
  let adjustedDay = day;
  let adjustedHours = utcHours;
  if (utcHours < 0) {
    adjustedHours = utcHours + 24;
    adjustedDay = day - 1;
  } else if (utcHours >= 24) {
    adjustedHours = utcHours - 24;
    adjustedDay = day + 1;
  }
  
  const result = new Date(Date.UTC(year, month - 1, adjustedDay, adjustedHours, utcMinutes, seconds));
  console.log(`[parseUserLocalDateTime] ${dateStr} ${timeStr || '23:59'} (offset ${timezoneOffsetMinutes}min) -> UTC ${result.toISOString()}`);
  return result;
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
      const timezoneOffsetMinutes = getTimezoneOffsetMinutes(userTimezone);
      console.log(`[API /send-reminders] User ${userId} timezone: ${userTimezone} (offset: ${timezoneOffsetMinutes}min / ${(timezoneOffsetMinutes/60).toFixed(1)}h)`);

      // Construct precise due date/time for the task in UTC
      let taskDueDateTimeUTC: Date;
      try {
        taskDueDateTimeUTC = parseUserLocalDateTime(taskDueDateStr, taskDueTimeStr, timezoneOffsetMinutes);
      } catch (e) {
        console.warn(`[API /send-reminders] Could not parse dueDate/dueTime for task ${taskDoc.id} ('${taskDueDateStr}' '${taskDueTimeStr}'). Skipping.`, e);
        continue;
      }
      
      const timeDifferenceMs = taskDueDateTimeUTC.getTime() - now.getTime();
      const hoursDifference = timeDifferenceMs / (1000 * 60 * 60);
      
      console.log(`[API /send-reminders] Task "${taskTitle}": Due UTC=${taskDueDateTimeUTC.toISOString()}, Now UTC=${now.toISOString()}, Diff=${hoursDifference.toFixed(2)}h`);

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
          body: `Your task "${taskTitle}" is due in approx. ${Math.max(0, Math.round(hoursDifference))} hour(s) (at ${formatTime12h(taskDueTimeStr)} on ${taskDueDateStr}).`,
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