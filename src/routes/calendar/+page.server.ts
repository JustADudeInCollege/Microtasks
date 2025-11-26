// src/routes/calendar/+page.server.ts
import type { PageServerLoad, PageServerLoadEvent, Actions } from './$types.js';
import { adminDb } from '$lib/server/firebaseAdmin.js';
import { Timestamp as AdminTimestamp, FieldValue } from 'firebase-admin/firestore';
import { fail } from '@sveltejs/kit';

// Interface for data fetched from Firestore (server-side)
interface FetchedTaskData {
    title: string;
    description?: string;
    isCompleted?: boolean;
    createdAt?: AdminTimestamp;
    dueDate?: string | null; // YYYY-MM-DD
    dueTime?: string | null; // HH:MM (This will be the deadline time)
    completedAt?: AdminTimestamp | null;
    userId?: string;
    priority?: string;
    tags?: string[];
    noteId?: string;
    lastModified?: AdminTimestamp;
    color?: string;
    // endTime is removed as we are only using a single deadline time (dueTime)
}

// Interface for data sent to the frontend (client-side)
export interface TaskForFrontend {
    id: string;
    title: string;
    description: string;
    isCompleted: boolean;
    status: 'pending' | 'complete' | 'incomplete' | 'late';
    priority: string | number | null;
    createdAtISO: string | null;
    dueDateISO: string | null; // Essential for calendar (YYYY-MM-DD)
    dueTime: string | null; // This is the deadline time (HH:MM)
    color?: string;
    // endTime is removed
}

interface UserForFrontend {
    name?: string;
}

const PHILIPPINES_TIMEZONE_OFFSET_HOURS = 8;

function getPreciseDueDateInTimezoneAsUTC(
    dateString: string | null,
    timeString: string | null, // This is the dueTime/deadlineTime
    targetTimezoneOffsetHours: number
): Date | null {
    if (!dateString || !/\d{4}-\d{2}-\d{2}/.test(dateString)) {
        return null;
    }
    try {
        const [year, month, day] = dateString.split('-').map(Number);
        let hoursInTargetTimezone = 23; // Default to end of day if no time
        let minutesInTargetTimezone = 59;
        let secondsInTargetTimezone = 59;
        let msInTargetTimezone = 999;

        if (timeString && /\d{2}:\d{2}/.test(timeString)) {
            const [h, m] = timeString.split(':').map(Number);
            if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                hoursInTargetTimezone = h;
                minutesInTargetTimezone = m;
                secondsInTargetTimezone = 0; // For a deadline, seconds can be 0
                msInTargetTimezone = 0;
            }
        }
        return new Date(Date.UTC(
            year,
            month - 1, // JS month is 0-indexed
            day,
            hoursInTargetTimezone - targetTimezoneOffsetHours,
            minutesInTargetTimezone,
            secondsInTargetTimezone,
            msInTargetTimezone
        ));
    } catch (e) {
        console.warn(`[Calendar Page Server] Error parsing date/time for target timezone: ${dateString} ${timeString}`, e);
        return null;
    }
}


function mapTaskDataForCalendar(docSnapshot: FirebaseFirestore.QueryDocumentSnapshot): TaskForFrontend {
    const docData = docSnapshot.data() as FetchedTaskData;
    const taskId = docSnapshot.id;
    const createdAtTimestamp = docData.createdAt;
    const storedDueDateString = docData.dueDate;
    const storedDueTimeString = docData.dueTime; // This is the deadline time
    const completedAtTimestamp = docData.completedAt;

    const createdAtISO = createdAtTimestamp?.toDate()?.toISOString() ?? null;
    const completedAtDate = completedAtTimestamp?.toDate() ?? null;
    
    const preciseDueDateDeadlineUTC = getPreciseDueDateInTimezoneAsUTC(
        storedDueDateString ?? null,
        storedDueTimeString ?? null, // Pass deadline time
        PHILIPPINES_TIMEZONE_OFFSET_HOURS
    );

    let dueDateISO: string | null = null;
    if (storedDueDateString && /\d{4}-\d{2}-\d{2}/.test(storedDueDateString)) {
        try {
            dueDateISO = storedDueDateString;
        } catch (e) {
            console.warn(`[Calendar Page Server] Error processing dueDateISO for task ${taskId}: ${storedDueDateString}`, e);
        }
    }
    
    let status: TaskForFrontend['status'];
    const isCompleted = docData.isCompleted ?? false;
    const now = new Date();

    if (isCompleted) {
        // If completed, check if it was completed after the precise deadline
        if (completedAtDate && preciseDueDateDeadlineUTC && completedAtDate.getTime() > preciseDueDateDeadlineUTC.getTime()) {
            status = 'late';
        } else {
            status = 'complete';
        }
    } else {
        // If not completed, check if the precise deadline has passed
        if (preciseDueDateDeadlineUTC && now.getTime() > preciseDueDateDeadlineUTC.getTime()) {
            status = 'incomplete'; // Or 'late' if you prefer for overdue incomplete tasks
        } else {
            status = 'pending';
        }
    }

    return {
        id: taskId,
        title: docData.title || 'Untitled Task',
        description: docData.description || 'No Description Provided',
        isCompleted: isCompleted,
        status: status,
        priority: docData.priority ?? null,
        createdAtISO: createdAtISO,
        dueDateISO: dueDateISO, // YYYY-MM-DD format
        dueTime: storedDueTimeString ?? null, // This is the deadline time
        color: docData.color ?? '#3B82F6', // Default color
    };
}

export const load: PageServerLoad = async ({ locals }: PageServerLoadEvent) => {
    const userId = locals.userId;
    let userForFrontend: UserForFrontend | undefined = undefined;

    if (!userId) {
        return {
            user: userForFrontend,
            tasks: [],
            error: 'User not authenticated. Please log in.'
        };
    }

    try {
        const credDocRef = adminDb.collection('credentials').doc(userId);
        const credDoc = await credDocRef.get();
        if (credDoc.exists) {
            userForFrontend = { name: credDoc.data()?.username || 'User' };
        } else {
            userForFrontend = { name: 'User' };
        }
    } catch (userError: any) {
        console.error(`[Calendar Page Server] Error fetching user credentials for ${userId}:`, userError);
        userForFrontend = { name: 'User' };
    }

    try {
        const tasksCollectionRef = adminDb.collection('tasks');
        const firestoreQuery = tasksCollectionRef.where('userId', '==', userId);
        
        const snapshot = await firestoreQuery.get();
        const tasks: TaskForFrontend[] = snapshot.docs
            .map(mapTaskDataForCalendar)
            .filter(task => task.dueDateISO); // Only include tasks with a due date for the calendar

        return {
            user: userForFrontend,
            tasks: tasks,
        };

    } catch (error: any) {
        console.error('[Calendar Page Server] ERROR loading tasks:', error);
        return {
            user: userForFrontend,
            tasks: [],
            error: `Failed to load tasks for calendar: ${error.message || 'Server Error'}.`
        };
    }
};

export const actions: Actions = {
    addEvent: async ({ request, locals }) => {
        const userId = locals.userId;
        if (!userId) {
            return fail(401, { eventForm: { error: 'User not authenticated.' } });
        }

        const formData = await request.formData();
        const title = formData.get('title')?.toString()?.trim();
        const description = formData.get('description')?.toString()?.trim() || '';
        const eventDate = formData.get('eventDate')?.toString() || null; // This is the dueDate (YYYY-MM-DD)
        const deadlineTime = formData.get('dueTime')?.toString() || null; // This is the dueTime (HH:MM) from the form
        const color = formData.get('color')?.toString() || '#3B82F6';

        if (!title) {
            return fail(400, {
                eventForm: { error: 'Event title is required.', title, description, eventDate, dueTime: deadlineTime, color }
            });
        }
        if (!eventDate) {
             return fail(400, {
                eventForm: { error: 'Event date is required.', title, description, eventDate, dueTime: deadlineTime, color }
            });
        }

        const taskData: FetchedTaskData = {
            userId,
            title,
            description,
            isCompleted: false,
            createdAt: FieldValue.serverTimestamp() as AdminTimestamp,
            lastModified: FieldValue.serverTimestamp() as AdminTimestamp,
            priority: 'standard',
            dueDate: null, // Initialize
            dueTime: null, // Initialize (this will be the deadline time)
            color: color,
        };

        if (eventDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            taskData.dueDate = eventDate;
        } else {
            return fail(400, {
                eventForm: { error: 'Invalid date format. Use YYYY-MM-DD.', title, description, eventDate, dueTime: deadlineTime, color }
            });
        }

        // Handle deadlineTime (which is stored as dueTime)
        if (deadlineTime === '' || deadlineTime === null) { // Explicitly check for null as well
            taskData.dueTime = null;
        } else if (deadlineTime && deadlineTime.match(/^\d{2}:\d{2}$/)) {
            taskData.dueTime = deadlineTime;
        } else if (deadlineTime) { // if not empty/null and not matching format
            return fail(400, {
                eventForm: { error: 'Invalid deadline time format. Use HH:MM.', title, description, eventDate, dueTime: deadlineTime, color }
            });
        }
        
        try {
            const newTaskDocRef = await adminDb.collection('tasks').add(taskData);
            return { 
                type: 'success',
                status: 200,
                data: {
                    eventForm: {
                        success: true,
                        id: newTaskDocRef.id,
                        message: 'Event added successfully as a task!'
                    }
                }
            };
        } catch (error: any) {
            console.error('[Calendar Action addEvent] ERROR:', error);
            return fail(500, {
                eventForm: { error: `Failed to add event: ${error.message || 'Server error'}`, title, description, eventDate, dueTime: deadlineTime, color }
            });
        }
    }
};
