// src/routes/dashboard/+page.server.ts
import type { PageServerLoad, Actions } from './$types.js';
import { adminDb } from '$lib/server/firebaseAdmin.js';
import { Timestamp } from 'firebase-admin/firestore'; // CORRECTED: Import Timestamp from firebase-admin/firestore
// FieldValue is not used in this file, so it's removed to avoid the warning.
// If you add actions that use FieldValue.serverTimestamp(), etc., add it here:
// import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { fail, redirect } from '@sveltejs/kit';

// Interface for the raw data structure from Firestore (consistent with other files)
interface FetchedTaskData {
    title: string;
    description?: string;
    isCompleted?: boolean;
    createdAt?: Timestamp; // This now correctly refers to the imported Firestore Timestamp
    dueDate?: string | null; // YYYY-MM-DD
    dueTime?: string | null; // HH:MM
    completedAt?: Timestamp | null; // This now correctly refers to the imported Firestore Timestamp
    userId?: string;
    priority?: string; // e.g., 'high', 'standard', 'low'
    // other fields if present, like boardId, tags etc.
}

// Interface for the data structure sent to the frontend for the dashboard
export interface DashboardStats {
    tasksDoneThisMonth: number;
    tasksDoneThisWeek: number;
    tasksDoneAllTime: number;
    tasksDoneOnTime: number;
    tasksDoneLate: number;
    priorityCounts: Record<string, number>; // e.g., { high: 10, standard: 25, low: 5, unprioritized: 2 }
}

interface UserForFrontend {
    name?: string;
}

const PHILIPPINES_TIMEZONE_OFFSET_HOURS = 8; // As used in other files

// Helper function from uploadingtasks (2).txt
function getPreciseDueDateInTimezoneAsUTC(
    dateString: string | null,
    timeString: string | null,
    targetTimezoneOffsetHours: number
): Date | null {
    if (!dateString || !/\d{4}-\d{2}-\d{2}/.test(dateString)) {
        return null;
    }
    try {
        const [year, month, day] = dateString.split('-').map(Number);
        let hoursInTargetTimezone = 23, minutesInTargetTimezone = 59, secondsInTargetTimezone = 59, msInTargetTimezone = 999;

        if (timeString && /\d{2}:\d{2}/.test(timeString)) {
            const [h, m] = timeString.split(':').map(Number);
            if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                hoursInTargetTimezone = h; minutesInTargetTimezone = m;
                secondsInTargetTimezone = 0; msInTargetTimezone = 0;
            }
        }
        return new Date(Date.UTC(
            year, month - 1, day,
            hoursInTargetTimezone - targetTimezoneOffsetHours,
            minutesInTargetTimezone, secondsInTargetTimezone, msInTargetTimezone
        ));
    } catch (e) {
        console.warn(`[getPreciseDueDateInTimezoneAsUTC] Error parsing date/time: ${dateString} ${timeString}`, e);
        return null;
    }
}

// Date helper functions
function getStartOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getEndOfDay(date: Date): Date {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function getStartOfWeek(date: Date, startDay: number = 0): Date { // 0 for Sunday
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (startDay === 1 && day === 0 ? -6 : startDay); // Adjust for Monday start
    const startOfWeekDate = new Date(d.setDate(diff));
    return getStartOfDay(startOfWeekDate);
}

function getEndOfWeek(date: Date, startDay: number = 0): Date {
    const d = new Date(date);
    const sow = getStartOfWeek(d, startDay);
    const endOfWeekDate = new Date(sow);
    endOfWeekDate.setDate(sow.getDate() + 6);
    return getEndOfDay(endOfWeekDate);
}

function getStartOfMonth(date: Date): Date {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    return getStartOfDay(d);
}

function getEndOfMonth(date: Date): Date {
    const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return getEndOfDay(d);
}


export const load: PageServerLoad = async ({ locals }) => {
    const userId = locals.userId;
    let userForFrontend: UserForFrontend | undefined = undefined;
    let pageLoadError: string | null = null;

    if (!userId) {
        throw redirect(303, '/login');
    }

    try {
        const credDocRef = adminDb.collection('credentials').doc(userId);
        const credDoc = await credDocRef.get();
        userForFrontend = credDoc.exists ? { name: credDoc.data()?.username || 'User' } : { name: 'User (No Credentials)' };
    } catch (userFetchError: any) {
        console.error(`[Dashboard Load] Error fetching user credentials for ${userId}:`, userFetchError);
        pageLoadError = 'Could not load your user data.';
    }

    const dashboardStats: DashboardStats = {
        tasksDoneThisMonth: 0,
        tasksDoneThisWeek: 0,
        tasksDoneAllTime: 0,
        tasksDoneOnTime: 0,
        tasksDoneLate: 0,
        priorityCounts: { high: 0, standard: 0, low: 0, unprioritized: 0 },
    };

    if (!pageLoadError) { 
        try {
            const tasksSnapshot = await adminDb.collection('tasks')
                .where('userId', '==', userId)
                .get();

            const now = new Date();
            const startOfThisWeek = getStartOfWeek(now, 1); 
            const endOfThisWeek = getEndOfWeek(now, 1);
            const startOfThisMonth = getStartOfMonth(now);
            const endOfThisMonth = getEndOfMonth(now);

            tasksSnapshot.docs.forEach(doc => {
                const task = doc.data() as FetchedTaskData;

                const priority = task.priority?.toLowerCase() || 'unprioritized';
                if (dashboardStats.priorityCounts.hasOwnProperty(priority)) {
                    dashboardStats.priorityCounts[priority]++;
                } else {
                     dashboardStats.priorityCounts.unprioritized++;
                }


                if (task.isCompleted && task.completedAt) {
                    dashboardStats.tasksDoneAllTime++;
                    // task.completedAt is a Firestore Timestamp, so .toDate() is valid
                    const completedAtDate = task.completedAt.toDate(); 

                    if (completedAtDate >= startOfThisWeek && completedAtDate <= endOfThisWeek) {
                        dashboardStats.tasksDoneThisWeek++;
                    }
                    if (completedAtDate >= startOfThisMonth && completedAtDate <= endOfThisMonth) {
                        dashboardStats.tasksDoneThisMonth++;
                    }

                    const preciseDueDateUTC = getPreciseDueDateInTimezoneAsUTC(
                        task.dueDate || null,
                        task.dueTime || null,
                        PHILIPPINES_TIMEZONE_OFFSET_HOURS
                    );

                    if (preciseDueDateUTC) {
                        if (completedAtDate.getTime() <= preciseDueDateUTC.getTime()) {
                            dashboardStats.tasksDoneOnTime++;
                        } else {
                            dashboardStats.tasksDoneLate++;
                        }
                    } else if (task.dueDate === null || task.dueDate === undefined) {
                        // If there's no due date, consider it "on time" as there was no deadline.
                        // Or you might choose to categorize these differently.
                        dashboardStats.tasksDoneOnTime++;
                    }
                }
            });

        } catch (dbFetchError: any) {
            console.error(`[Dashboard Load] Error fetching tasks for user ${userId}:`, dbFetchError);
            pageLoadError = (pageLoadError ? pageLoadError + " " : "") + 'Could not load task data for dashboard.';
        }
    }

    return {
        user: userForFrontend,
        dashboardStats: dashboardStats,
        error: pageLoadError,
    };
};

export const actions: Actions = {
    logout: async ({ cookies }) => {
        cookies.set('userId', '', {
            path: '/',
            maxAge: 0,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        throw redirect(303, '/login');
    }
};