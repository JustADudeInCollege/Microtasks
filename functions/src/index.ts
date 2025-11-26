import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import { logger } from "firebase-functions"; // Using v2 logger

admin.initializeApp();
const db = admin.firestore();

// Configure Nodemailer Transporter
// It's HIGHLY recommended to use Firebase environment configuration for sensitive data.
// Set these using:
// firebase functions:config:set gmail.email="your.email@gmail.com" gmail.password="your_gmail_app_password"
// To access in v2 functions, you might need to use process.env or define them as params
import { config } from "firebase-functions"; // Import config

// For simplicity here, we'll assume they are available via process.env if not using params.
// It's better to use parameterized configuration for v2 functions if possible.
const GMAIL_EMAIL = config().gmail?.email;
const GMAIL_PASSWORD = config().gmail?.password;

if (!GMAIL_EMAIL || !GMAIL_PASSWORD) {
  logger.error("Gmail email or password not configured via functions.config() for Nodemailer. Set with `firebase functions:config:set gmail.email=... gmail.password=...`");
  // Potentially throw an error or exit if these are critical
}

const mailTransport = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: GMAIL_EMAIL as string, // Cast as string assuming they exist if check passes
    pass: GMAIL_PASSWORD as string, // Cast as string
  },
});

// Function to send reminder emails
async function sendTaskReminderEmail(
  userEmail: string,
  userName: string | undefined, // userName can be undefined
  taskTitle: string,
  taskDueDate: string,
) {
  const mailOptions: nodemailer.SendMailOptions = {
    from: `"Microtask App" <${GMAIL_EMAIL}>`, // Use < and > for < >
    to: userEmail,
    subject: `Task Reminder: "${taskTitle}" is due soon!`,
    html: `
      <p>Hi ${userName || "User"},</p>
      <p>This is a friendly reminder that your task "<strong>${taskTitle}</strong>" is due on <strong>${taskDueDate}</strong>.</p>
      <p>Please make sure to complete it on time!</p>
      <p>Best,</p>
      <p>The Microtask Team</p>
    `,
  };

  try {
    await mailTransport.sendMail(mailOptions);
    logger.info(`Reminder email sent to ${userEmail} for task "${taskTitle}"`);
  } catch (error) {
    logger.error(
      `Failed to send reminder email to ${userEmail} for task "${taskTitle}":`,
      error,
    );
  }
}

// Scheduled function to check for tasks due today and send reminders (v2 syntax)
export const dailyTaskReminders = onSchedule(
  {
    schedule: "every day 09:00",
    timeZone: "Asia/Manila",
    // For v2, secrets can be managed via Google Secret Manager and accessed via params
    // secrets: ["GMAIL_PASSWORD_SECRET"], // Example if GMAIL_PASSWORD was a secret
    // Or use environment variables set during deployment or via .env files for functions
  },
  async (event) => { // event is of type scheduler.ScheduledEvent
    logger.info("Running dailyTaskReminders function (v2)...", { structuredData: true });

    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    const todayDateString = `${year}-${month}-${day}`;

    logger.info(`Checking for tasks due on: ${todayDateString}`);

    try {
      const tasksSnapshot = await db
        .collection("tasks")
        .where("isCompleted", "==", false)
        .where("dueDate", "==", todayDateString)
        .get();

      if (tasksSnapshot.empty) {
        logger.info("No tasks due today for reminders.");
        return; // Changed from return null
      }

      logger.info(`Found ${tasksSnapshot.docs.length} tasks due today.`);

      for (const taskDoc of tasksSnapshot.docs) {
        const task = taskDoc.data();
        const userId = task.userId;
        const taskTitle = task.title || "Untitled Task";
        const taskDueDate = task.dueDate;

        if (!userId) {
          logger.warn(`Task ${taskDoc.id} is missing userId. Skipping.`);
          continue;
        }

        const userCredDoc = await db.collection("credentials").doc(userId).get();

        if (!userCredDoc.exists) {
          logger.warn(`Credentials for userId ${userId} not found. Skipping task ${taskDoc.id}.`);
          continue;
        }

        const userData = userCredDoc.data();
        const userEmail = userData?.email;
        const userName = userData?.username;

        if (!userEmail) {
          logger.warn(`Email not found for userId ${userId}. Skipping task ${taskDoc.id}.`);
          continue;
        }

        // The critical check for GMAIL_EMAIL and GMAIL_PASSWORD happens before mailTransport creation.
        // If mailTransport was created, we assume auth was attempted.
        // The try...catch in sendTaskReminderEmail will handle send failures.
        // Thus, this specific check can be removed for simplification.

        await sendTaskReminderEmail(
          userEmail,
          userName,
          taskTitle,
          taskDueDate,
        );
      }
      logger.info("Finished processing task reminders.");
    } catch (error) {
      logger.error("Error in dailyTaskReminders function (v2):", error);
      // In case of an error, we might want to throw it or just log and exit.
      // For a scheduled function, often just logging is sufficient unless it's a critical failure.
      // The function will implicitly return Promise<void> if it reaches the end or returns without a value.
      return; // Changed from return null
    }
    // Implicitly returns Promise<void> if execution reaches here
  });