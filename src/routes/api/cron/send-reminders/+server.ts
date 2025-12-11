import { json, error as SvelteKitError } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { adminDb, admin } from '$lib/server/firebaseAdmin.js';
import { env } from '$env/dynamic/private';
import { sendDailySummaryEmail, type DailySummaryTask } from '$lib/server/emailService.js';

const CRON_SECRET = env.CRON_SECRET;
const APP_URL = env.APP_URL;

// Helper function to format a Date object to YYYY-MM-DD string
function getFormattedDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper function to add hours to a date
function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// Get all dates between now and the reminder window
function getDatesInRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  current.setHours(0, 0, 0, 0);

  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  while (current <= end) {
    dates.push(getFormattedDateString(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export const GET: RequestHandler = async ({ url }) => {
  // 1. Authenticate the cron job request
  const providedSecret = url.searchParams.get('secret');
  if (providedSecret !== CRON_SECRET) {
    console.warn('[API /send-reminders] Unauthorized cron attempt.');
    throw SvelteKitError(401, 'Unauthorized');
  }

  console.log('[API /send-reminders] Cron job triggered. Processing task reminders with user preferences...');

  const now = new Date();
  let emailsSentCount = 0;
  let usersProcessedCount = 0;
  let tasksFound = 0;

  try {
    // 2. Get all users with their notification settings
    const credentialsSnapshot = await adminDb.collection('credentials').get();

    if (credentialsSnapshot.empty) {
      console.log('[API /send-reminders] No users found.');
      return json({ message: 'No users found.', usersProcessed: 0, emailsSent: 0 });
    }

    const appBaseUrl = APP_URL || 'https://microtasks-zoys.vercel.app/';
    const taskPageUrl = `${appBaseUrl}/tasks`;

    // 3. Process each user based on their settings
    for (const userDoc of credentialsSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const notificationSettings = userData.notificationSettings || {};

      // Skip users with email reminders disabled or no email
      const emailRemindersEnabled = notificationSettings.emailReminders ?? true;
      const userEmail = userData.email;

      if (!emailRemindersEnabled || !userEmail) {
        continue;
      }

      usersProcessedCount++;

      // Get user's reminder preference (default: 24 hours = 1 day before)
      const defaultReminderHours: number = notificationSettings.defaultReminderHours ?? 24;
      const userName = userData.username || 'User';

      // Calculate the date range based on user's preference
      const reminderWindowEnd = addHours(now, defaultReminderHours);
      const datesToCheck = getDatesInRange(now, reminderWindowEnd);

      console.log(`[API /send-reminders] User ${userName}: Checking tasks due within ${defaultReminderHours} hours (dates: ${datesToCheck.join(', ')})`);

      // Query tasks for this user within their reminder window
      // Note: Firestore 'in' queries are limited to 30 values, which is fine for up to 30 days
      if (datesToCheck.length === 0) continue;

      const tasksSnapshot = await adminDb
        .collection('tasks')
        .where('userId', '==', userId)
        .where('isCompleted', '==', false)
        .where('dueDate', 'in', datesToCheck)
        .get();

      if (tasksSnapshot.empty) {
        console.log(`[API /send-reminders] No upcoming tasks for ${userName}.`);
        continue;
      }

      tasksFound += tasksSnapshot.docs.length;

      // Build task list for email
      const emailTasks: DailySummaryTask[] = tasksSnapshot.docs.map(doc => {
        const task = doc.data();
        return {
          taskTitle: task.title || 'Untitled Task',
          taskDescription: task.description || undefined,
          dueDate: task.dueDate,
          dueTime: task.dueTime || undefined,
          priority: task.priority || 'standard'
        };
      });

      // Send consolidated email
      const emailSent = await sendDailySummaryEmail(
        userEmail,
        userName,
        emailTasks,
        taskPageUrl
      );

      if (emailSent) {
        emailsSentCount++;
        console.log(`[API /send-reminders] Reminder email sent to ${userEmail} with ${emailTasks.length} tasks.`);

        // Mark tasks as reminded
        for (const taskDoc of tasksSnapshot.docs) {
          await adminDb.collection('tasks').doc(taskDoc.id).update({
            lastReminderSentAt: admin.firestore.FieldValue.serverTimestamp(),
            reminderCount: admin.firestore.FieldValue.increment(1)
          });
        }
      }
    }

    console.log(`[API /send-reminders] Complete. Users: ${usersProcessedCount}, Emails: ${emailsSentCount}, Tasks: ${tasksFound}`);
    return json({
      message: 'Task reminder processing complete.',
      usersProcessed: usersProcessedCount,
      emailsSent: emailsSentCount,
      tasksFound
    });

  } catch (err: any) {
    console.error('[API /send-reminders] Critical error:', err);
    throw SvelteKitError(500, `Internal Server Error: ${err.message}`);
  }
};