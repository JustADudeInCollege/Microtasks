import type { PageServerLoad, Actions, PageServerLoadEvent } from './$types.js';
import { adminDb } from '$lib/server/firebaseAdmin.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { CollectionReference, DocumentReference } from 'firebase-admin/firestore'; // Import helper types
import { fail, redirect } from '@sveltejs/kit';

// Interface for Workspace/Board data sent to the frontend
export interface WorkspaceForFrontend {
    id: string;
    name: string;
    createdAtISO?: string | null;
}

// Interface for the raw data structure from Firestore for Tasks
interface FetchedTaskData {
    title: string;
    description?: string;
    isCompleted?: boolean;
    createdAt?: Timestamp; // This is a Firestore Timestamp when read
    dueDate?: string | null;
    dueTime?: string | null;
    completedAt?: Timestamp | null; // This is a Firestore Timestamp or null when read
    userId?: string;
    priority?: string;
    tags?: string[];
    noteId?: string;
    lastModified?: Timestamp; // This is a Firestore Timestamp when read
    boardId?: string;
}

// Interface for Task data sent to the frontend
export interface TaskForFrontend {
    id: string;
    title: string;
    description: string;
    isCompleted: boolean;
    status: 'pending' | 'complete' | 'incomplete' | 'late';
    priority: string | number | null;
    createdAtISO: string | null;
    dueDateISO: string | null;
    dueTime: string | null;
    boardId: string;
}

interface UserForFrontend {
    name?: string;
}

const PHILIPPINES_TIMEZONE_OFFSET_HOURS = 8;

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
        let hoursInTargetTimezone = 23;
        let minutesInTargetTimezone = 59;
        let secondsInTargetTimezone = 59;
        let msInTargetTimezone = 999;

        if (timeString && /\d{2}:\d{2}/.test(timeString)) {
            const [h, m] = timeString.split(':').map(Number);
            if (!isNaN(h) && !isNaN(m) && h >= 0 && h <= 23 && m >= 0 && m <= 59) {
                hoursInTargetTimezone = h;
                minutesInTargetTimezone = m;
                secondsInTargetTimezone = 0;
                msInTargetTimezone = 0;
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

function mapFetchedTaskToFrontend(docSnapshot: FirebaseFirestore.QueryDocumentSnapshot<FetchedTaskData>): TaskForFrontend {
    const docData = docSnapshot.data(); // docData is now strongly typed as FetchedTaskData
    const taskId = docSnapshot.id;
    const createdAtTimestamp = docData.createdAt;
    const storedDueDateString = docData.dueDate;
    const storedDueTimeString = docData.dueTime;
    const completedAtTimestamp = docData.completedAt;

    const createdAtISO = createdAtTimestamp?.toDate()?.toISOString() ?? null;
    const completedAtDate = completedAtTimestamp?.toDate() ?? null;

    const preciseDueDateDeadlineUTC = getPreciseDueDateInTimezoneAsUTC(
        storedDueDateString ?? null,
        storedDueTimeString ?? null,
        PHILIPPINES_TIMEZONE_OFFSET_HOURS
    );

    const dueDateISO = storedDueDateString && /\d{4}-\d{2}-\d{2}/.test(storedDueDateString) ? storedDueDateString : null;

    let status: TaskForFrontend['status'];
    const isCompleted = docData.isCompleted ?? false;
    const now = new Date();

    if (isCompleted) {
        status = (completedAtDate && preciseDueDateDeadlineUTC && completedAtDate.getTime() > preciseDueDateDeadlineUTC.getTime()) ? 'late' : 'complete';
    } else {
        status = (preciseDueDateDeadlineUTC && now.getTime() > preciseDueDateDeadlineUTC.getTime()) ? 'incomplete' : 'pending';
    }

    return {
        id: taskId,
        title: docData.title || 'Untitled Task',
        description: docData.description || 'No Description Provided',
        isCompleted: isCompleted,
        status: status,
        priority: docData.priority ?? null,
        createdAtISO: createdAtISO,
        dueDateISO: dueDateISO,
        dueTime: storedDueTimeString ?? null,
        boardId: docData.boardId || 'unassigned_tasks_board',
    };
}

// Explicitly type the collection reference
const tasksCollection = adminDb.collection('tasks') as CollectionReference<FetchedTaskData>;

export const load: PageServerLoad = async ({ locals, url }: PageServerLoadEvent) => {
    const userId = locals.userId;
    let userForFrontend: UserForFrontend | undefined = undefined;
    let workspacesForFrontend: WorkspaceForFrontend[] = [];

    const filterFromDate = url.searchParams.get('filterFromDate');
    const filterToDate = url.searchParams.get('filterToDate');
    
    try {
        // Example: assuming workspaces are user-specific or you want to fetch them
        const workspacesQuery = adminDb.collection('workspaces').where('ownerId', '==', userId);
        const workspacesSnapshot = await workspacesQuery.orderBy('createdAt', 'asc').get();
        if (!workspacesSnapshot.empty) {
            workspacesForFrontend = workspacesSnapshot.docs.map(doc => {
                const data = doc.data();
                const createdAtTimestamp = data.createdAt as Timestamp | undefined;
                return {
                    id: doc.id,
                    name: data.name || 'Unnamed Workspace',
                    createdAtISO: createdAtTimestamp ? createdAtTimestamp.toDate().toISOString() : new Date().toISOString(),
                };
            });
        }
    } catch (wsError: any) {
        console.error("[Server Load /kanban] Error fetching workspaces (optional data):", wsError);
    }

    if (!userId) {
        return {
            user: userForFrontend,
            workspaces: workspacesForFrontend,
            tasks: [],
            error: 'User not authenticated. Please log in.',
            filterFromDate,
            filterToDate
        };
    }

    try {
        const credDocRef = adminDb.collection('credentials').doc(userId);
        const credDoc = await credDocRef.get();
        userForFrontend = { name: credDoc.exists ? (credDoc.data()?.username || 'User') : 'User' };
    } catch (userError: any) {
        console.error(`[Server Load /kanban] Error fetching user credentials for ${userId}:`, userError);
        userForFrontend = { name: 'User' };
    }

    try {
        const firestoreQuery = tasksCollection.where('userId', '==', userId);
        const snapshot = await firestoreQuery.get();
        let allTasks: TaskForFrontend[] = snapshot.docs.map(doc => mapFetchedTaskToFrontend(doc));

        allTasks.sort((a, b) => {
            const statusOrder = { 'pending': 1, 'incomplete': 2, 'late': 3, 'complete': 4 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
                return statusOrder[a.status] - statusOrder[b.status];
            }
            if (a.status === 'pending' || a.status === 'incomplete') {
                const dateAVal = a.dueDateISO ? new Date(a.dueDateISO).getTime() : Infinity;
                const dateBVal = b.dueDateISO ? new Date(b.dueDateISO).getTime() : Infinity;
                if (dateAVal !== dateBVal) return dateAVal - dateBVal;
                if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
                else if (a.dueTime) return -1; else if (b.dueTime) return 1;
            }
            const createdAtA = a.createdAtISO ? new Date(a.createdAtISO).getTime() : 0;
            const createdAtB = b.createdAtISO ? new Date(b.createdAtISO).getTime() : 0;
            return createdAtB - createdAtA;
        });

        return {
            user: userForFrontend,
            workspaces: workspacesForFrontend,
            tasks: allTasks,
            filterFromDate,
            filterToDate
        };

    } catch (error: any) {
        console.error(`[Server Load /kanban] ERROR loading tasks:`, error);
        return {
            user: userForFrontend,
            workspaces: workspacesForFrontend,
            tasks: [],
            error: `Failed to load tasks: ${error.message || 'Server Error'}.`,
            filterFromDate,
            filterToDate
        };
    }
};

// Define a type for task data when creating a new task, making FieldValue usage explicit
// This matches FetchedTaskData structure but with FieldValue for server-generated timestamps.
type TaskDataForCreate = Omit<FetchedTaskData, 'createdAt' | 'lastModified' | 'completedAt'> & {
    createdAt: FieldValue;
    lastModified: FieldValue;
    // completedAt is not set on creation
};


export const actions: Actions = {
    addTask: async ({ request, locals }) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { taskForm: { error: 'User not authenticated.' } });

        const formData = await request.formData();
        const title = formData.get('title')?.toString()?.trim();
        const description = formData.get('description')?.toString()?.trim() || '';
        const dueDate = formData.get('dueDate')?.toString() || null;
        const dueTime = formData.get('dueTime')?.toString() || null;
        const priority = formData.get('priority')?.toString() || 'standard';
        const tagsString = formData.get('tags')?.toString()?.trim() || '';
        const tags = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(Boolean) : [];
        let boardId = formData.get('boardId')?.toString() || 'unassigned_tasks_board';

        if (!title) {
            return fail(400, { taskForm: { error: 'Task title is required.', title, description, dueDate, dueTime, priority, tags: tagsString, boardId } });
        }
        
        // Use the specific type for creation
        const taskData: TaskDataForCreate = {
            userId, boardId, title, description, priority, tags, isCompleted: false,
            createdAt: FieldValue.serverTimestamp(),
            lastModified: FieldValue.serverTimestamp(),
            // These will be explicitly set below
            dueDate: null, 
            dueTime: null,
        };
        
        if (dueDate === '' || dueDate === null) {
            taskData.dueDate = null;
            taskData.dueTime = null;
        } else if (dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            taskData.dueDate = dueDate;
        } else {
            return fail(400, { taskForm: { error: 'Invalid due date format. Use YYYY-MM-DD.', title, description, dueDate, dueTime, priority, tags: tagsString, boardId }});
        }
        
        if (dueTime === '' || dueTime === null || !taskData.dueDate) {
            taskData.dueTime = null;
        } else if (dueTime.match(/^\d{2}:\d{2}$/)) {
            taskData.dueTime = dueTime;
        } else {
            return fail(400, { taskForm: { error: 'Invalid due time format. Use HH:MM.', title, description, dueDate, dueTime, priority, tags: tagsString, boardId }});
        }

        try {
            // tasksCollection is already typed
            const newTaskDocRef = await tasksCollection.add(taskData);
            return { taskForm: { success: true, id: newTaskDocRef.id, message: 'Task added successfully!' } };
        } catch (error: any) {
            console.error(`[Action addTask /kanban] ERROR:`, error);
            return fail(500, { taskForm: { error: `Failed to add task: ${error.message}`, title, description, dueDate, dueTime, priority, tags: tagsString, boardId } });
        }
    },

    updateTask: async ({ request, locals }) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { taskForm: { error: 'User not authenticated.' } });
        const formData = await request.formData();
        const taskId = formData.get('taskId')?.toString();
        if (!taskId) return fail(400, { taskForm: { error: 'Task ID is required.' } });

        const title = formData.get('title')?.toString()?.trim();
        const description = formData.get('description')?.toString()?.trim(); // Keep undefined if not provided for partial update
        const priority = formData.get('priority')?.toString();
        const dueDate = formData.get('dueDate')?.toString();
        const dueTime = formData.get('dueTime')?.toString();
        const isCompletedString = formData.get('isCompleted')?.toString(); // New: Get isCompleted from form data

        if (!title && title !== undefined) { // Check if title is explicitly empty, not just missing
             return fail(400, { taskForm: { error: 'Task title is required.', taskId } });
        }
        
        // Type for update payload, ensuring lastModified is FieldValue
        // Other fields are optional and match FetchedTaskData structure.
        type TaskUpdatePayload = Partial<Omit<FetchedTaskData, 'lastModified' | 'completedAt'>> & {
            lastModified: FieldValue;
            completedAt?: FieldValue | null; // Allow completedAt to be updated
        };

        const taskUpdateData: TaskUpdatePayload = { 
            lastModified: FieldValue.serverTimestamp() 
        };

        if (title !== undefined) taskUpdateData.title = title;
        if (description !== undefined) taskUpdateData.description = description;
        if (priority !== undefined) taskUpdateData.priority = priority;

        if (dueDate !== undefined) { // Only update if dueDate was provided in the form
            if (dueDate === null || dueDate === '') {
                taskUpdateData.dueDate = null;
            } else if (dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
                taskUpdateData.dueDate = dueDate;
            } else {
                return fail(400, { taskForm: { error: 'Invalid due date format.', taskId } });
            }
        }

        if (dueTime !== undefined) { // Only update if dueTime was provided in the form
            if (dueTime === null || dueTime === '') {
                taskUpdateData.dueTime = null;
            } else if (dueTime.match(/^\d{2}:\d{2}$/)) {
                taskUpdateData.dueTime = dueTime;
            } else {
                return fail(400, { taskForm: { error: 'Invalid due time format.', taskId } });
            }
        }
        // If dueDate was explicitly set to null, ensure dueTime is also null
        if (taskUpdateData.dueDate === null) {
            taskUpdateData.dueTime = null;
        }
        
        try {
            const taskRef = tasksCollection.doc(taskId); // taskRef is DocumentReference<FetchedTaskData>
            const taskDoc = await taskRef.get();
            if (!taskDoc.exists) return fail(404, { taskForm: { error: 'Task not found.' } });
            if (taskDoc.data()?.userId !== userId) return fail(403, { taskForm: { error: 'Permission denied.' } });
            
            // New: Handle isCompleted and completedAt
            if (isCompletedString !== undefined) {
                const newIsCompleted = isCompletedString === 'true';
                taskUpdateData.isCompleted = newIsCompleted;
                taskUpdateData.completedAt = newIsCompleted ? FieldValue.serverTimestamp() : null;
            }

            await taskRef.update(taskUpdateData);

            // Re-fetch the task to get its current state after update
            const updatedTaskDoc = await taskRef.get();
            const updatedTaskData = updatedTaskDoc.data();

            // Return updated isCompleted, dueDateISO, and dueTime for client-side reconciliation
            return { 
                taskForm: { 
                    success: true, 
                    message: 'Task updated successfully!',
                    taskId: taskId,
                    isCompleted: updatedTaskData?.isCompleted, // Use actual updated value
                    dueDateISO: updatedTaskData?.dueDate,      // Use actual updated value
                    dueTime: updatedTaskData?.dueTime           // Use actual updated value
                } 
            };
        } catch (error: any) {
            console.error(`[Action updateTask /kanban] ERROR for task ${taskId}:`, error);
            return fail(500, { taskForm: { error: `Failed to update task: ${error.message}` } });
        }
    },

    // The toggleComplete action is now redundant as its functionality is merged into updateTask.
    // It can be removed or kept for other specific uses if needed elsewhere.
    // For this task, we will remove it to avoid confusion and consolidate logic.
    // toggleComplete: async ({ request, locals }) => {
    //     const userId = locals.userId;
    //     if (!userId) return fail(401, { toggleCompleteForm: { error: 'User not authenticated.' } });
    //     const formData = await request.formData();
    //     const taskId = formData.get('taskId')?.toString();
    //     const currentIsCompleted = formData.get('isCompleted')?.toString() === 'true';
    //     if (!taskId) return fail(400, { toggleCompleteForm: { error: 'Task ID is required.' } });

    //     try {
    //         const taskRef = tasksCollection.doc(taskId);
    //         const taskDoc = await taskRef.get();
    //         const taskDataFromDb = taskDoc.data(); // Already FetchedTaskData
    //         if (!taskDataFromDb) return fail(404, { toggleCompleteForm: { error: 'Task not found.' } });
    //         if (taskDataFromDb.userId !== userId) return fail(403, { toggleCompleteForm: { error: 'Permission denied.' } });

    //         const newCompletedState = !currentIsCompleted;
    //         // Explicit type for payload ensuring FieldValue usage
    //         const updatePayload: { isCompleted: boolean; lastModified: FieldValue; completedAt: FieldValue | null } = {
    //             isCompleted: newCompletedState,
    //             lastModified: FieldValue.serverTimestamp(),
    //             completedAt: newCompletedState ? FieldValue.serverTimestamp() : null
    //         };
    //         await taskRef.update(updatePayload);
    //         return { toggleCompleteForm: { successMessage: `Task ${newCompletedState ? 'marked complete' : 'marked incomplete'}.`, taskId, newCompletedState } };
    //     } catch (error: any) {
    //         console.error(`[Action toggleComplete /kanban] ERROR for task ${taskId}:`, error);
    //         return fail(500, { toggleCompleteForm: { error: `Failed to update completion: ${error.message}` } });
    //     }
    // },

    deleteTask: async ({ request, locals }) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { deleteTaskForm: { error: 'User not authenticated.' } });
        const formData = await request.formData();
        const taskId = formData.get('taskId') as string;
        if (!taskId) return fail(400, { deleteTaskForm: { error: 'Task ID is required.' } });
        try {
            const taskRef = tasksCollection.doc(taskId);
            const taskDoc = await taskRef.get();
            if (!taskDoc.exists) return fail(404, { deleteTaskForm: { error: 'Task not found.' } });
            if (taskDoc.data()?.userId !== userId) return fail(403, { deleteTaskForm: { error: 'Permission denied.' } });
            await taskRef.delete();
            return { deleteTaskForm: { successMessage: 'Task deleted successfully.' } };
        } catch (error: any) {
            console.error(`[Action deleteTask /kanban] ERROR for task ${taskId}:`, error);
            return fail(500, { deleteTaskForm: { error: `Failed to delete task: ${error.message}` } });
        }
    },

    batchDeleteTasks: async ({ request, locals }) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { batchDeleteForm: { error: 'User not authenticated.' } });
        const formData = await request.formData();
        const taskIdsString = formData.get('taskIds') as string;
        if (!taskIdsString) return fail(400, { batchDeleteForm: { error: 'Task IDs are required.' } });
        const taskIds = taskIdsString.split(',').map(id => id.trim()).filter(Boolean);
        if (taskIds.length === 0) return fail(400, { batchDeleteForm: { error: 'No valid task IDs.' } });
        try {
            const batch = adminDb.batch();
            let deletedCount = 0;
            for (const taskId of taskIds) {
                const taskRef = tasksCollection.doc(taskId); // DocumentReference<FetchedTaskData>
                const taskDoc = await taskRef.get();
                if (taskDoc.exists && taskDoc.data()?.userId === userId) {
                    batch.delete(taskRef);
                    deletedCount++;
                }
            }
            if (deletedCount > 0) await batch.commit();
            return { batchDeleteForm: { successMessage: `${deletedCount} task(s) deleted. ${taskIds.length - deletedCount} skipped.` } };
        } catch (error: any) {
            console.error(`[Action batchDeleteTasks /kanban] ERROR:`, error);
            return fail(500, { batchDeleteForm: { error: `Failed to batch delete: ${error.message}` } });
        }
    },

    logout: async ({ cookies }) => {
        cookies.set('userId', '', { path: '/', maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
        throw redirect(303, '/login');
    }
};
