import type { PageServerLoad, Actions, PageServerLoadEvent } from './$types.js';
import { adminDb } from '$lib/server/firebaseAdmin.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { CollectionReference, DocumentReference, Query } from 'firebase-admin/firestore'; // Import Query
import { fail, redirect } from '@sveltejs/kit';
import { getUserRole, getWorkspaceMembers, canPerformAction } from '$lib/server/collaborationService.js';
import type { MemberRole, WorkspaceMember } from '$lib/types/collaboration.js';

// Interface for Workspace/Board data sent to the frontend
export interface WorkspaceForFrontend {
    id: string;
    name: string;
    createdAtISO?: string | null;
    userRole?: MemberRole | null;
    isCollaborative?: boolean;
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
    const docData = docSnapshot.data();
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

    // Log the boardId of the task being mapped
    // console.log(`[mapFetchedTaskToFrontend] Mapping task ${taskId} with boardId: ${docData.boardId}`);

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
        boardId: docData.boardId || 'unassigned_tasks_board', // Ensure this matches Firestore structure
    };
}

const tasksCollection = adminDb.collection('tasks') as CollectionReference<FetchedTaskData>;

export const load: PageServerLoad = async ({ locals, params, url }: PageServerLoadEvent) => {
    console.log(`[LOAD /workspace/${params.boardId}] Function called.`); // DEBUG
    console.log(`[LOAD /workspace/${params.boardId}] Full URL: ${url.href}`); // DEBUG

    const userId = locals.userId;
    const currentBoardIdFromParams = params.boardId; // This is the key for filtering tasks

    console.log(`[LOAD /workspace/${params.boardId}] userId: ${userId}, currentBoardIdFromParams: ${currentBoardIdFromParams}`); // DEBUG

    let userForFrontend: UserForFrontend | undefined = undefined;
    let currentWorkspace: WorkspaceForFrontend | undefined = undefined; // For the specific workspace being viewed

    // Date filters from URL (if you use them on this page)
    const filterFromDate = url.searchParams.get('filterFromDate');
    const filterToDate = url.searchParams.get('filterToDate');

    if (!userId) {
        console.log(`[LOAD /workspace/${params.boardId}] User not authenticated. Returning early.`); // DEBUG
        // Consider redirect(303, '/login') or return an error state
        return {
            user: userForFrontend,
            currentWorkspace: currentWorkspace,
            tasks: [],
            error: 'User not authenticated. Please log in.',
            selectedBoardId: currentBoardIdFromParams, // Still pass this for client context
            filterFromDate,
            filterToDate
        };
    }

    // Fetch user details
    try {
        const credDocRef = adminDb.collection('credentials').doc(userId);
        const credDoc = await credDocRef.get();
        userForFrontend = { name: credDoc.exists ? (credDoc.data()?.username || 'User') : 'User (No Credentials)' };
        console.log(`[LOAD /workspace/${params.boardId}] User details fetched:`, userForFrontend.name); // DEBUG
    } catch (userError: any) {
        console.error(`[LOAD /workspace/${params.boardId}] Error fetching user credentials for ${userId}:`, userError);
        userForFrontend = { name: 'User (Error)' }; // Default on error
    }

    // Fetch details for the current workspace (optional but good for display)
    if (currentBoardIdFromParams) {
        try {
            const workspaceDocRef = adminDb.collection('workspaces').doc(currentBoardIdFromParams);
            const workspaceDoc = await workspaceDocRef.get();
            if (workspaceDoc.exists) {
                const data = workspaceDoc.data();
                // Check if user has access (owner or member)
                const userRole = await getUserRole(currentBoardIdFromParams, userId);
                
                if (userRole) {
                    // Get member count to check if collaborative
                    const members = await getWorkspaceMembers(currentBoardIdFromParams);
                    const isCollaborative = members.length > 1;
                    
                    currentWorkspace = {
                        id: workspaceDoc.id,
                        name: data?.title || 'Unnamed Workspace',
                        createdAtISO: data?.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : null,
                        userRole: userRole,
                        isCollaborative: isCollaborative
                    };
                    console.log(`[LOAD /workspace/${params.boardId}] Current workspace details fetched:`, currentWorkspace.name, `User role: ${userRole}`); // DEBUG
                } else {
                    console.warn(`[LOAD /workspace/${params.boardId}] User ${userId} does not have access to workspace ${currentBoardIdFromParams}.`); // DEBUG
                     return { // Or throw error(403, 'Forbidden');
                        user: userForFrontend,
                        tasks: [],
                        error: 'You do not have permission to view this workspace.',
                        selectedBoardId: currentBoardIdFromParams,
                        filterFromDate,
                        filterToDate
                    };
                }
            } else {
                console.warn(`[LOAD /workspace/${params.boardId}] Workspace with ID ${currentBoardIdFromParams} not found.`); // DEBUG
                return { // Or throw error(404, 'Workspace not found');
                    user: userForFrontend,
                    tasks: [],
                    error: 'Workspace not found.',
                    selectedBoardId: currentBoardIdFromParams,
                    filterFromDate,
                    filterToDate
                };
            }
        } catch (wsError: any) {
            console.error(`[LOAD /workspace/${params.boardId}] Error fetching current workspace ${currentBoardIdFromParams}:`, wsError);
            // Continue, but currentWorkspace will be undefined
        }
    } else {
        // This case should ideally not be reached if `params.boardId` is mandatory for this route.
        console.error(`[LOAD /workspace/${params.boardId}] CRITICAL: No boardId in params for a [boardId] route!`); // DEBUG
        return {
            user: userForFrontend,
            tasks: [],
            error: 'Invalid board identifier.',
            selectedBoardId: null,
            filterFromDate,
            filterToDate
        };
    }


    // Fetch tasks for the workspace (all tasks in shared workspace, not just user's tasks)
    try {
        console.log(`[LOAD /workspace/${params.boardId}] Building Firestore query for tasks...`); // DEBUG
        
        // For collaborative workspaces, get all tasks in the workspace
        // For non-collaborative, we still filter by workspace ID only
        let firestoreQuery: Query<FetchedTaskData>;

        // CRUCIAL: Filter by the boardId from the route parameter
        if (currentBoardIdFromParams && currentBoardIdFromParams.trim() !== '') {
            firestoreQuery = tasksCollection.where('boardId', '==', currentBoardIdFromParams);
            console.log(`[LOAD /workspace/${params.boardId}] Querying tasks with boardId: '${currentBoardIdFromParams}'`); // DEBUG
        } else {
            // This state should ideally not be reached if boardId is a required param.
            // If it can be optional, then this means "show all tasks for user if no boardId".
            console.warn(`[LOAD /workspace/${params.boardId}] No currentBoardIdFromParams to filter tasks by. This might show all user tasks.`); // DEBUG
            // Depending on requirements, you might want to return an error or an empty task list here.
            // For a route like /workspace/[boardId]/, you usually expect boardId to be present.
            // If you allow /workspace/ (without a boardId) to hit this same load function, that's different.
        }
        
        // Add other filters if needed, e.g., date range (ensure compound indexes in Firestore if complex)
        // if (filterFromDate) firestoreQuery = firestoreQuery.where('dueDate', '>=', filterFromDate);
        // if (filterToDate) firestoreQuery = firestoreQuery.where('dueDate', '<=', filterToDate);

        const snapshot = await firestoreQuery.get();
        console.log(`[LOAD /workspace/${params.boardId}] Firestore query executed. Found ${snapshot.docs.length} task documents.`); // DEBUG

        let allTasks: TaskForFrontend[] = snapshot.docs.map(doc => {
            const task = mapFetchedTaskToFrontend(doc);
            // Additional debug for each mapped task's boardId vs expected
            if (task.boardId !== currentBoardIdFromParams) {
                console.warn(`[LOAD /workspace/${params.boardId}] Mismatch! Task ${task.id} has boardId '${task.boardId}' but expected '${currentBoardIdFromParams}'. Data:`, doc.data());
            }
            return task;
        });

        // Sort tasks (your existing sorting logic)
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
        console.log(`[LOAD /workspace/${params.boardId}] Tasks mapped and sorted. Total tasks: ${allTasks.length}`); // DEBUG
        // For detailed check if still an issue:
        // allTasks.forEach(t => console.log(`  Task ID: ${t.id}, Title: ${t.title}, BoardID: ${t.boardId}`));

        return {
            user: userForFrontend,
            currentWorkspace: currentWorkspace,
            tasks: allTasks,
            selectedBoardId: currentBoardIdFromParams, // Crucial for client-side context
            filterFromDate,
            filterToDate
        };

    } catch (error: any) {
        console.error(`[LOAD /workspace/${params.boardId}] ERROR loading tasks:`, error); // DEBUG
        return {
            user: userForFrontend,
            currentWorkspace: currentWorkspace,
            tasks: [],
            error: `Failed to load tasks for this workspace: ${error.message || 'Server Error'}.`,
            selectedBoardId: currentBoardIdFromParams,
            filterFromDate,
            filterToDate
        };
    }
};


// Define a type for task data when creating a new task, making FieldValue usage explicit
type TaskDataForCreate = Omit<FetchedTaskData, 'createdAt' | 'lastModified' | 'completedAt'> & {
    createdAt: FieldValue;
    lastModified: FieldValue;
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
        let boardId = formData.get('boardId')?.toString()?.trim() || 'unassigned_tasks_board';
        if (!boardId) boardId = 'unassigned_tasks_board'; // Ensure boardId is not an empty string

        if (!title) {
            return fail(400, { taskForm: { error: 'Task title is required.', title, description, dueDate, dueTime, priority, tags: tagsString, boardId } });
        }
        
        const taskData: TaskDataForCreate = {
            userId, boardId, title, description, priority, tags, isCompleted: false,
            createdAt: FieldValue.serverTimestamp(),
            lastModified: FieldValue.serverTimestamp(),
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
        const description = formData.get('description')?.toString()?.trim(); 
        const priority = formData.get('priority')?.toString();
        const dueDate = formData.get('dueDate')?.toString();
        const dueTime = formData.get('dueTime')?.toString();
        const isCompletedString = formData.get('isCompleted')?.toString();

        if (title === '') { // Check if title is explicitly empty
             return fail(400, { taskForm: { error: 'Task title cannot be empty.', taskId } });
        }
        
        type TaskUpdatePayload = Partial<Omit<FetchedTaskData, 'lastModified' | 'completedAt'>> & {
            lastModified: FieldValue;
            completedAt?: FieldValue | null;
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
            // Reset reminder flags when due date changes so notifications are sent again
            (taskUpdateData as any).reminderSent24hr = false;
            (taskUpdateData as any).emailReminderSent24hr = false;
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
            const taskRef = tasksCollection.doc(taskId); 
            const taskDoc = await taskRef.get();
            if (!taskDoc.exists) return fail(404, { taskForm: { error: 'Task not found.' } });
            
            const taskData = taskDoc.data()!;
            const workspaceId = taskData.boardId;
            
            // Check if user is the task owner OR has edit permission in the workspace
            const isTaskOwner = taskData.userId === userId;
            const canEdit = workspaceId ? await canPerformAction(workspaceId, userId, 'edit') : false;
            
            if (!isTaskOwner && !canEdit) {
                return fail(403, { taskForm: { error: 'Permission denied.' } });
            }
            
            // Handle isCompleted and completedAt
            if (isCompletedString !== undefined) {
                const newIsCompleted = isCompletedString === 'true';
                taskUpdateData.isCompleted = newIsCompleted;
                taskUpdateData.completedAt = newIsCompleted ? FieldValue.serverTimestamp() : null;
            }

            await taskRef.update(taskUpdateData);
            
            // Re-fetch the task to get its current state after update
            const updatedTaskDoc = await taskRef.get();
            const updatedTaskData = updatedTaskDoc.data();

            return { 
                taskForm: { 
                    success: true, 
                    message: 'Task updated successfully!',
                    taskId: taskId,
                    isCompleted: updatedTaskData?.isCompleted,
                    dueDateISO: updatedTaskData?.dueDate,
                    dueTime: updatedTaskData?.dueTime
                } 
            };
        } catch (error: any) {
            console.error(`[Action updateTask /kanban] ERROR for task ${taskId}:`, error);
            return fail(500, { taskForm: { error: `Failed to update task: ${error.message}` } });
        }
    },
    
    updateTaskDueDate: async ({ request, locals }) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { updateDueDateForm: { error: 'User not authenticated.' } });
        
        const formData = await request.formData();
        const taskId = formData.get('taskId')?.toString();
        const newDueDateISO = formData.get('newDueDateISO')?.toString(); 

        if (!taskId) return fail(400, { updateDueDateForm: { error: 'Task ID is required.' }});
        if (newDueDateISO === undefined) return fail(400, { updateDueDateForm: { error: 'New due date is required.' }});

        const updatePayload: Partial<Pick<FetchedTaskData, 'dueDate' | 'dueTime'>> & { lastModified: FieldValue } = {
            lastModified: FieldValue.serverTimestamp()
        };

        if (newDueDateISO === '' || newDueDateISO === null) {
            updatePayload.dueDate = null;
            updatePayload.dueTime = null; 
        } else if (newDueDateISO.match(/^\d{4}-\d{2}-\d{2}$/)) {
            updatePayload.dueDate = newDueDateISO;
        } else {
            return fail(400, { updateDueDateForm: { error: 'Invalid new due date format.' }});
        }
        // Reset reminder flags when due date changes so notifications are sent again
        (updatePayload as any).reminderSent24hr = false;
        (updatePayload as any).emailReminderSent24hr = false;
        
        try {
            const taskRef = tasksCollection.doc(taskId);
            const taskDoc = await taskRef.get();
            if (!taskDoc.exists) return fail(404, { updateDueDateForm: { error: 'Task not found.' }});
            
            const taskData = taskDoc.data()!;
            const workspaceId = taskData.boardId;
            
            // Check if user is the task owner OR has edit permission in the workspace
            const isTaskOwner = taskData.userId === userId;
            const canEdit = workspaceId ? await canPerformAction(workspaceId, userId, 'edit') : false;
            
            if (!isTaskOwner && !canEdit) {
                return fail(403, { updateDueDateForm: { error: 'Permission denied.' }});
            }
            
            await taskRef.update(updatePayload);
            return { updateDueDateForm: { success: true, message: 'Task due date updated successfully.' }};
        } catch (error: any) {
            console.error(`[Action updateTaskDueDate /kanban] ERROR for task ${taskId} to ${newDueDateISO}:`, error);
            return fail(500, { updateDueDateForm: { error: `Failed to update task due date: ${error.message}` }});
        }
    },

    toggleComplete: async ({ request, locals }) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { toggleCompleteForm: { error: 'User not authenticated.' } });
        const formData = await request.formData();
        const taskId = formData.get('taskId')?.toString();
        const currentIsCompleted = formData.get('isCompleted')?.toString() === 'true';
        if (!taskId) return fail(400, { toggleCompleteForm: { error: 'Task ID is required.' } });

        try {
            const taskRef = tasksCollection.doc(taskId);
            const taskDoc = await taskRef.get();
            const taskDataFromDb = taskDoc.data(); 
            if (!taskDataFromDb) return fail(404, { toggleCompleteForm: { error: 'Task not found.' } });
            
            const workspaceId = taskDataFromDb.boardId;
            
            // Check if user is the task owner OR has edit permission in the workspace
            const isTaskOwner = taskDataFromDb.userId === userId;
            const canEdit = workspaceId ? await canPerformAction(workspaceId, userId, 'edit') : false;
            
            if (!isTaskOwner && !canEdit) {
                return fail(403, { toggleCompleteForm: { error: 'Permission denied.' } });
            }

            const newCompletedState = !currentIsCompleted;
            const updatePayload: { isCompleted: boolean; lastModified: FieldValue; completedAt: FieldValue | null } = {
                isCompleted: newCompletedState,
                lastModified: FieldValue.serverTimestamp(),
                completedAt: newCompletedState ? FieldValue.serverTimestamp() : null
            };
            await taskRef.update(updatePayload);
            return { toggleCompleteForm: { successMessage: `Task ${newCompletedState ? 'marked complete' : 'marked incomplete'}.`, taskId, newCompletedState } };
        } catch (error: any) {
            console.error(`[Action toggleComplete /kanban] ERROR for task ${taskId}:`, error);
            return fail(500, { toggleCompleteForm: { error: `Failed to update completion: ${error.message}` } });
        }
    },

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
            
            const taskData = taskDoc.data()!;
            const workspaceId = taskData.boardId;
            
            // Check if user is the task owner OR has delete permission in the workspace
            const isTaskOwner = taskData.userId === userId;
            const canDelete = workspaceId ? await canPerformAction(workspaceId, userId, 'delete') : false;
            
            if (!isTaskOwner && !canDelete) {
                return fail(403, { deleteTaskForm: { error: 'Permission denied.' } });
            }
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
                const taskRef = tasksCollection.doc(taskId); 
                const taskDoc = await taskRef.get();
                if (taskDoc.exists) {
                    const taskData = taskDoc.data()!;
                    const workspaceId = taskData.boardId;
                    const isTaskOwner = taskData.userId === userId;
                    const canDelete = workspaceId ? await canPerformAction(workspaceId, userId, 'delete') : false;
                    
                    if (isTaskOwner || canDelete) {
                        batch.delete(taskRef);
                        deletedCount++;
                    }
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