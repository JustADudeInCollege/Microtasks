// src/lib/server/emailService.ts
import nodemailer from 'nodemailer';
import { GMAIL_USER, GMAIL_APP_PASSWORD } from '$env/static/private';

// Create reusable transporter using Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD // Use App Password, not regular password
  }
});

// Helper function to convert 24h time (HH:MM) to 12h format (h:MM AM/PM)
function formatTime12h(time24: string): string {
  if (!time24 || !/^\d{2}:\d{2}$/.test(time24)) return time24;
  
  const [hourStr, minute] = time24.split(':');
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  
  if (hour === 0) hour = 12;
  else if (hour > 12) hour -= 12;
  
  return `${hour}:${minute} ${ampm}`;
}

export interface TaskEmailData {
  taskTitle: string;
  taskDescription?: string;
  dueDate: string;
  dueTime?: string;
  hoursUntilDue: number;
  taskUrl?: string;
}

export async function sendTaskReminderEmail(
  toEmail: string,
  userName: string,
  task: TaskEmailData
): Promise<boolean> {
  const timeText = task.hoursUntilDue <= 1 
    ? 'less than an hour' 
    : `approximately ${Math.round(task.hoursUntilDue)} hours`;

  const dueTimeDisplay = task.dueTime ? formatTime12h(task.dueTime) : 'end of day';
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Task Reminder</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 30px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
              ⏰ Task Reminder
            </h1>
          </div>
          
          <!-- Content -->
          <div style="padding: 30px 25px;">
            <p style="color: #374151; font-size: 16px; margin: 0 0 20px 0;">
              Hi <strong>${userName}</strong>,
            </p>
            
            <p style="color: #374151; font-size: 16px; margin: 0 0 25px 0;">
              This is a friendly reminder that your task is due in <strong style="color: #dc2626;">${timeText}</strong>.
            </p>
            
            <!-- Task Card -->
            <div style="background-color: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 8px; padding: 20px; margin-bottom: 25px;">
              <h2 style="color: #1e293b; font-size: 18px; margin: 0 0 10px 0;">
                📋 ${task.taskTitle}
              </h2>
              ${task.taskDescription ? `
              <p style="color: #64748b; font-size: 14px; margin: 0 0 15px 0;">
                ${task.taskDescription}
              </p>
              ` : ''}
              <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                <div>
                  <span style="color: #94a3b8; font-size: 12px; text-transform: uppercase;">Due Date</span>
                  <p style="color: #1e293b; font-size: 14px; margin: 4px 0 0 0; font-weight: 500;">
                    📅 ${task.dueDate}
                  </p>
                </div>
                <div>
                  <span style="color: #94a3b8; font-size: 12px; text-transform: uppercase;">Due Time</span>
                  <p style="color: #1e293b; font-size: 14px; margin: 4px 0 0 0; font-weight: 500;">
                    🕐 ${dueTimeDisplay}
                  </p>
                </div>
              </div>
            </div>
            
            <!-- CTA Button -->
            ${task.taskUrl ? `
            <div style="text-align: center; margin-bottom: 25px;">
              <a href="${task.taskUrl}" style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                View Task →
              </a>
            </div>
            ` : ''}
            
            <p style="color: #64748b; font-size: 14px; margin: 0; text-align: center;">
              Stay productive! 🚀
            </p>
          </div>
          
          <!-- Footer -->
          <div style="background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">
              This email was sent by <strong>Microtask</strong> - Your Productivity Partner
            </p>
            <p style="color: #94a3b8; font-size: 11px; margin: 10px 0 0 0;">
              You received this email because you have task reminders enabled.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const textContent = `
Hi ${userName},

This is a friendly reminder that your task is due in ${timeText}.

Task: ${task.taskTitle}
${task.taskDescription ? `Description: ${task.taskDescription}` : ''}
Due Date: ${task.dueDate}
Due Time: ${dueTimeDisplay}

${task.taskUrl ? `View your task: ${task.taskUrl}` : ''}

Stay productive!
- Microtask Team
  `;

  try {
    await transporter.sendMail({
      from: `"Microtask" <${GMAIL_USER}>`,
      to: toEmail,
      subject: `⏰ Reminder: "${task.taskTitle}" is due in ${timeText}`,
      text: textContent,
      html: htmlContent
    });
    
    console.log(`[EmailService] Successfully sent reminder email to ${toEmail} for task "${task.taskTitle}"`);
    return true;
  } catch (error) {
    console.error(`[EmailService] Failed to send email to ${toEmail}:`, error);
    return false;
  }
}

// Verify email configuration on startup
export async function verifyEmailConfig(): Promise<boolean> {
  try {
    await (transporter as any).verify();
    console.log('[EmailService] Email configuration verified successfully');
    return true;
  } catch (error) {
    console.error('[EmailService] Email configuration error:', error);
    return false;
  }
}
