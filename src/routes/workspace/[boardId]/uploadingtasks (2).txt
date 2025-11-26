import type { PageServerLoad, Actions, PageServerLoadEvent } from './$types.js';
import { adminDb } from '$lib/server/firebaseAdmin.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { fail, redirect } from '@sveltejs/kit';

// Interface for the raw data structure from Firestore
interface FetchedTaskData {
    title: string;
    description?: string;
    isCompleted?: boolean;
    createdAt?: Timestamp;
    dueDate?: string | null; // YYYY-MM-DD
    dueTime?: string | null; // HH:MM
    completedAt?: Timestamp | null;
    userId?: string;
    priority?: string;
    tags?: string[];
    noteId?: string;
    lastModified?: Timestamp;
    boardId?: string; // Crucial for workspace tasks
}

// Interface for the data structure sent to thefrontend (same as in tasks.server.txt)
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
}

// Define the expected shape of the user object we'll pass to the frontend
interface UserForFrontend {
    name?: string;
}

// Define the expected shape of the board object
export interface BoardDataForFrontend {
    id: string;
    title: string;
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
            year,
            month - 1,
            day,
            hoursInTargetTimezone - targetTimezoneOffsetHours,
            minutesInTargetTimezone,
            secondsInTargetTimezone,
            msInTargetTimezone
        ));
    } catch (e) {
        console.warn(`[getPreciseDueDateInTimezoneAsUTC] Error parsing date/time for target timezone: ${dateString} ${timeString}`, e);
        return null;
    }
}

function mapTaskData(docSnapshot: FirebaseFirestore.QueryDocumentSnapshot): TaskForFrontend {
    const docData = docSnapshot.data() as FetchedTaskData;
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

    let dueDateISO: string | null = null;
    if (storedDueDateString && /\d{4}-\d{2}-\d{2}/.test(storedDueDateString)) {
        try {
            const [year, month, day] = storedDueDateString.split('-').map(Number);
            dueDateISO = new Date(Date.UTC(year, month - 1, day)).toISOString();
        } catch (e) {
            console.warn(`[mapTaskData] Error creating dueDateISO for task ${taskId}: ${storedDueDateString}`, e);
        }
    }

    let status: TaskForFrontend['status'];
    const isCompleted = docData.isCompleted ?? false;
    const now = new Date();

    if (isCompleted) {
        if (completedAtDate && preciseDueDateDeadlineUTC && completedAtDate.getTime() > preciseDueDateDeadlineUTC.getTime()) {
            status = 'late';
        } else {
            status = 'complete';
        }
    } else {
        if (preciseDueDateDeadlineUTC && now.getTime() > preciseDueDateDeadlineUTC.getTime()) {
            status = 'incomplete';
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
        dueDateISO: dueDateISO,
        dueTime: storedDueTimeString ?? null,
    };
}

export const load: PageServerLoad = async ({ locals, url, params }: PageServerLoadEvent) => {
    const userId = locals.userId;
    const boardId = params.boardId;
    let userForFrontend: UserForFrontend | undefined = undefined;
    let boardDataForFrontend: BoardDataForFrontend | undefined = undefined;

    const filterFromDate = url.searchParams.get('filterFromDate');
    const filterToDate = url.searchParams.get('filterToDate');

    if (!userId) {
        return {
            user: userForFrontend,
            board: boardDataForFrontend,
            tasks: [],
            error: 'User not authenticated. Please log in.',
            filterFromDate,
            filterToDate
        };
    }

    if (!boardId) {
        return {
            user: userForFrontend,
            board: boardDataForFrontend,
            tasks: [],
            error: 'Workspace ID is missing.',
            filterFromDate,
            filterToDate
        };
    }

    // Fetch user details
    try {
        const credDocRef = adminDb.collection('credentials').doc(userId);
        const credDoc = await credDocRef.get();
        if (credDoc.exists) {
            userForFrontend = { name: credDoc.data()?.username || 'User' };
        } else {
            userForFrontend = { name: 'User' };
        }
    } catch (userError: any) {
        console.error(`[Server Load /workspace/${boardId}] Error fetching user credentials for ${userId}:`, userError);
        userForFrontend = { name: 'User' }; // Fallback
    }

    // Fetch workspace/board details
    try {
        const boardRef = adminDb.collection('workspaces').doc(boardId);
        const boardDoc = await boardRef.get();
        if (!boardDoc.exists) {
            return {
                user: userForFrontend,
                board: undefined,
                tasks: [],
                error: 'Workspace not found.',
                filterFromDate,
                filterToDate
            };
        }
        const fetchedBoardData = boardDoc.data();
        if (fetchedBoardData?.userId !== userId) {
            return {
                user: userForFrontend,
                board: undefined,
                tasks: [],
                error: 'Access to this workspace is denied.',
                filterFromDate,
                filterToDate
            };
        }
        boardDataForFrontend = { id: boardDoc.id, title: fetchedBoardData.title || 'Untitled Workspace' };
    } catch (boardError: any) {
        console.error(`[Server Load /workspace/${boardId}] Error fetching workspace:`, boardError);
        return {
            user: userForFrontend,
            board: undefined,
            tasks: [],
            error: `Failed to load workspace details: ${boardError.message || 'Server Error'}.`,
            filterFromDate,
            filterToDate
        };
    }

    // Fetch tasks for this specific board
    try {
        const tasksCollectionRef = adminDb.collection('tasks');
        // Query tasks for the current user AND current board
        let firestoreQuery = tasksCollectionRef.where('userId', '==', userId).where('boardId', '==', boardId);
        
        console.log(`[Server Load /workspace/${boardId}] Fetching tasks for user ${userId} and board ${boardId}.`);

        const snapshot = await firestoreQuery.get();
        console.log(`[Server Load /workspace/${boardId}] Fetched ${snapshot.docs.length} tasks for this workspace.`);
        let allTasks: TaskForFrontend[] = snapshot.docs.map(mapTaskData);

        // Sorting logic (same as in tasks.server.txt)
        allTasks.sort((a, b) => {
            const statusOrder = { 'pending': 1, 'incomplete': 2, 'late': 3, 'complete': 4 };
            if (statusOrder[a.status] !== statusOrder[b.status]) {
                return statusOrder[a.status] - statusOrder[b.status];
            }
            if (a.status === 'pending' || a.status === 'incomplete') {
                const dateA = a.dueDateISO ? new Date(a.dueDateISO).getTime() : Infinity;
                const dateB = b.dueDateISO ? new Date(b.dueDateISO).getTime() : Infinity;
                if (dateA !== dateB) return dateA - dateB;
                if (a.dueTime && b.dueTime) return a.dueTime.localeCompare(b.dueTime);
                else if (a.dueTime) return -1;
                else if (b.dueTime) return 1;
            }
            const createdAtA = a.createdAtISO ? new Date(a.createdAtISO).getTime() : 0;
            const createdAtB = b.createdAtISO ? new Date(b.createdAtISO).getTime() : 0;
            return createdAtB - createdAtA;
        });

        return {
            user: userForFrontend,
            board: boardDataForFrontend,
            tasks: allTasks,
            filterFromDate,
            filterToDate
        };

    } catch (error: any) {
        console.error(`[Server Load /workspace/${boardId}] ERROR loading tasks:`, error);
        if (error.code === 'FAILED_PRECONDITION' && error.message.includes('index')) {
             console.error(`[Server Load /workspace/${boardId}] Query failed due to a missing Firestore index. Check Firestore console for index suggestions based on: userId, boardId (and potentially other orderBy fields if added to the query like createdAt).`);
             return {
                user: userForFrontend,
                board: boardDataForFrontend,
                tasks: [],
                error: `Query failed: Missing Firestore index for (userId, boardId). See server logs and Firebase console.`,
                filterFromDate,
                filterToDate
            };
         }
        return {
            user: userForFrontend,
            board: boardDataForFrontend,
            tasks: [],
            error: `Failed to load tasks: ${error.message || 'Server Error'}.`,
            filterFromDate,
            filterToDate
        };
    }
};

export const actions: Actions = {
    addTask: async (event) => { // event includes { request, locals, params }
        const { request, locals, params } = event;
        const userId = locals.userId;
        const boardId = params.boardId;

        if (!userId) {
            return fail(401, { taskForm: { error: 'User not authenticated.' } });
        }
        if (!boardId) {
            return fail(400, { taskForm: { error: 'Workspace ID not found for adding task.' } });
        }

        const formData = await request.formData();
        const title = formData.get('title')?.toString()?.trim();
        const description = formData.get('description')?.toString()?.trim() || '';
        const dueDate = formData.get('dueDate')?.toString() || null;
        const dueTime = formData.get('dueTime')?.toString() || null;
        const priority = formData.get('priority')?.toString() || 'standard';
        const tagsString = formData.get('tags')?.toString()?.trim() || '';
        const tags = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(Boolean) : [];

        if (!title) {
            return fail(400, {
                taskForm: {
                    error: 'Task title is required.',
                    title, description, dueDate, dueTime, priority, tags: tagsString
                }
            });
        }

        const taskData: any = {
            userId,
            boardId, // Add boardId to the task
            title,
            description,
            priority,
            tags,
            isCompleted: false,
            createdAt: FieldValue.serverTimestamp(),
            lastModified: FieldValue.serverTimestamp()
        };

        if (dueDate === '') {
            taskData.dueDate = null;
        } else if (dueDate && dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            taskData.dueDate = dueDate;
        } else if (dueDate) {
            return fail(400, {
                taskForm: {
                    error: 'Invalid due date format. Use YYYY-MM-DD.',
                    title, description, dueDate, dueTime, priority, tags: tagsString
                }
            });
        }

        if (dueTime === '') {
            taskData.dueTime = null;
        } else if (dueTime && dueTime.match(/^\d{2}:\d{2}$/)) {
            taskData.dueTime = dueTime;
        } else if (dueTime) {
            return fail(400, {
                taskForm: {
                    error: 'Invalid due time format. Use HH:MM.',
                    title, description, dueDate, dueTime, priority, tags: tagsString
                }
            });
        }

        try {
            const newTaskDocRef = await adminDb.collection('tasks').add(taskData);
            return {
                taskForm: {
                    success: true,
                    id: newTaskDocRef.id,
                    message: 'Task added successfully to workspace!'
                }
            };
        } catch (error: any) {
            console.error(`[Action addTask to /workspace/${boardId}] ERROR:`, error);
            return fail(500, {
                taskForm: {
                    error: `Failed to add task: ${error.message}`,
                    title, description, dueDate, dueTime, priority, tags: tagsString
                }
            });
        }
    },

    // updateTask, toggleComplete, deleteTask, batchDeleteTasks are largely the same
    // as in tasks.server.txt. The key is that they operate on a taskId,
    // and the userId check within them ensures security.
    // No specific boardId check from params is strictly needed here if userId check is robust.
    updateTask: async ({ request, locals, params }) => {
        const userId = locals.userId;
        // const boardId = params.boardId; // Available if needed for extra checks

        if (!userId) return fail(401, { taskForm: { error: 'User not authenticated.' } });

        const formData = await request.formData();
        const taskId = formData.get('taskId')?.toString();
        if (!taskId) return fail(400, { taskForm: { error: 'Task ID is required.' } });

        const title = formData.get('title')?.toString()?.trim();
        const description = formData.get('description')?.toString()?.trim() || '';
        const dueDate = formData.get('dueDate')?.toString(); // Let server handle null or empty string
        const dueTime = formData.get('dueTime')?.toString(); // Let server handle null or empty string
        const priority = formData.get('priority')?.toString() || 'standard';

        if (!title) return fail(400, { taskForm: { error: 'Task title is required.', taskId } });

        const taskUpdateData: any = { title, description, priority, lastModified: FieldValue.serverTimestamp() };

        if (dueDate === null || dueDate === '') taskUpdateData.dueDate = null;
        else if (dueDate && dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) taskUpdateData.dueDate = dueDate;
        else if (dueDate) return fail(400, { taskForm: { error: 'Invalid due date format.', taskId } });

        if (dueTime === null || dueTime === '') taskUpdateData.dueTime = null;
        else if (dueTime && dueTime.match(/^\d{2}:\d{2}$/)) taskUpdateData.dueTime = dueTime;
        else if (dueTime) return fail(400, { taskForm: { error: 'Invalid due time format.', taskId } });

        try {
            const taskRef = adminDb.collection('tasks').doc(taskId);
            const taskDoc = await taskRef.get();
            if (!taskDoc.exists) return fail(404, { taskForm: { error: 'Task not found.' } });
            if (taskDoc.data()?.userId !== userId) return fail(403, { taskForm: { error: 'Permission denied.' } });
            // Optional: if (taskDoc.data()?.boardId !== boardId) return fail(403, {error: 'Task not part of this board.'})

            await taskRef.update(taskUpdateData);
            return { taskForm: { success: true, message: 'Task updated successfully!' } };
        } catch (error: any) {
            console.error(`[Action updateTask in /workspace/${params.boardId}] ERROR for task ${taskId}:`, error);
            return fail(500, { taskForm: { error: `Failed to update task: ${error.message}` } });
        }
    },

    toggleComplete: async ({ request, locals, params }) => {
        const userId = locals.userId;
        // const boardId = params.boardId;

        if (!userId) return fail(401, { toggleCompleteForm: { error: 'User not authenticated.' } });

        const formData = await request.formData();
        const taskId = formData.get('taskId')?.toString();
        const currentIsCompleted = formData.get('isCompleted')?.toString() === 'true';

        if (!taskId) {
            return fail(400, { toggleCompleteForm: { error: 'Task ID is required.' } });
        }

        try {
            const taskRef = adminDb.collection('tasks').doc(taskId);
            const taskDoc = await taskRef.get();
            const taskData = taskDoc.data() as FetchedTaskData | undefined;

            if (!taskData) return fail(404, { toggleCompleteForm: { error: 'Task not found.' } });
            if (taskData.userId !== userId) return fail(403, { toggleCompleteForm: { error: 'Permission denied.' } });
            // Optional: if (taskData.boardId !== boardId) return fail(403, {error: 'Task not part of this board.'})


            const newCompletedState = !currentIsCompleted;
            const updatePayload: { isCompleted: boolean; lastModified: FieldValue; completedAt?: FieldValue | Timestamp | null } = {
                isCompleted: newCompletedState,
                lastModified: FieldValue.serverTimestamp()
            };

            if (newCompletedState) {
                updatePayload.completedAt = FieldValue.serverTimestamp();
            } else {
                updatePayload.completedAt = null;
            }

            await taskRef.update(updatePayload);

            return {
                toggleCompleteForm: {
                    successMessage: `Task ${newCompletedState ? 'marked as complete' : 'marked as not complete'}.`,
                    taskId: taskId,
                    newCompletedState: newCompletedState
                }
            };
        } catch (error: any) {
            console.error(`[Action toggleComplete in /workspace/${params.boardId}] ERROR for task ${taskId}:`, error);
            return fail(500, { toggleCompleteForm: { error: `Failed to update completion: ${error.message}` } });
        }
    },

    deleteTask: async ({ request, locals, params }) => {
        const userId = locals.userId;
        // const boardId = params.boardId;

        if (!userId) return fail(401, { deleteTaskForm: { error: 'User not authenticated.' } });
        const formData = await request.formData();
        const taskId = formData.get('taskId') as string;
        if (!taskId) return fail(400, { deleteTaskForm: { error: 'Task ID is required.' } });

        try {
            const taskRef = adminDb.collection('tasks').doc(taskId);
            const taskDoc = await taskRef.get();
            if (!taskDoc.exists) return fail(404, { deleteTaskForm: { error: 'Task not found.' } });
            if (taskDoc.data()?.userId !== userId) return fail(403, { deleteTaskForm: { error: 'Permission denied.' } });
            // Optional: if (taskDoc.data()?.boardId !== boardId) return fail(403, {error: 'Task not part of this board.'})

            await taskRef.delete();
            return { deleteTaskForm: { successMessage: 'Task deleted successfully.' } };
        } catch (error: any) {
            console.error(`[Action deleteTask in /workspace/${params.boardId}] ERROR for task ${taskId}:`, error);
            return fail(500, { deleteTaskForm: { error: `Failed to delete task: ${error.message}` } });
        }
    },

    batchDeleteTasks: async ({ request, locals, params }) => {
        const userId = locals.userId;
        // const boardId = params.boardId;

        if (!userId) return fail(401, { batchDeleteForm: { error: 'User not authenticated.' } });
        const formData = await request.formData();
        const taskIdsString = formData.get('taskIds') as string;
        if (!taskIdsString) return fail(400, { batchDeleteForm: { error: 'Task IDs are required.' } });
        const taskIds = taskIdsString.split(',').map(id => id.trim()).filter(Boolean);
        if (taskIds.length === 0) return fail(400, { batchDeleteForm: { error: 'No valid task IDs.' } });

        try {
            const batch = adminDb.batch();
            const tasksCollectionRef = adminDb.collection('tasks');
            let deletedCount = 0;
            for (const taskId of taskIds) {
                const taskRef = tasksCollectionRef.doc(taskId);
                const taskDoc = await taskRef.get();
                if (taskDoc.exists && taskDoc.data()?.userId === userId) {
                    // Optional: && taskDoc.data()?.boardId === boardId
                    batch.delete(taskRef);
                    deletedCount++;
                }
            }
            if (deletedCount > 0) await batch.commit();
            return { batchDeleteForm: { successMessage: `${deletedCount} task(s) deleted. ${taskIds.length - deletedCount} skipped.` } };
        } catch (error: any) {
            console.error(`[Action batchDeleteTasks in /workspace/${params.boardId}] ERROR:`, error);
            return fail(500, { batchDeleteForm: { error: `Failed to batch delete: ${error.message}` } });
        }
    },

    logout: async ({ cookies }) => { // This is a generic action, fine here.
        cookies.set('userId', '', { path: '/', maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' });
        throw redirect(303, '/login');
    }
};