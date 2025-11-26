// @ts-nocheck
// src/routes/home/+page.server.ts

import type { PageServerLoad, Actions } from './$types.js';
import { adminDb } from '$lib/server/firebaseAdmin.js';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { fail } from '@sveltejs/kit';


/**
 * Interface representing a Task document in Firestore and how it's handled on the server.
 * Note: Timestamps are handled as Timestamps on the server for creation/update,
 * but often converted to ISO strings or specific formats (YYYY-MM-DD, HH:MM) when sent to the client.
 */
interface TaskServerData {
    id: string;
    title: string; // Added title field
    description: string;
    isCompleted: boolean;
    createdAt: string | null; // ISO string format for client
    userId?: string;
    dueDate?: string | null; // YYYY-MM-DD string format for client
    dueTime?: string | null; // HH:MM string format for client
    priority?: string; // 'low', 'standard', 'high'
    tags?: string[]; // Array of tag strings
    noteId?: string; // Optional ID linking to a note
}

// --- Load Function (Uses ADMIN SDK - Bypasses Rules) ---
export const load = async ({ locals, url }: Parameters<PageServerLoad>[0]) => {
    const userId = locals.userId;
    // Get the 'showCompleted' state from the URL query parameter
    const showCompletedParam = url.searchParams.get('showCompleted'); // Ensure this matches the client-side param name
    const shouldShowCompleted = showCompletedParam === 'true';
    console.log(`[Server Load /home] showCompleted=${shouldShowCompleted}`);

    if (!userId) {
        console.warn('[Server Load /home] No userId found in locals.');
        // Return the expected structure even if not authenticated, including the showCompleted state
        return { notes: [], tasks: [], showCompleted: shouldShowCompleted, error: 'User not authenticated. Please log in.', username: 'User' };
    }
    console.log(`[Server Load /home] Loading data for user: ${userId}`);

    let username = 'User';
    try {
        const credDocRef = adminDb.collection('credentials').doc(userId);
        const credDoc = await credDocRef.get();
        if (credDoc.exists) {
            username = credDoc.data()?.username || 'User';
        } else {
            console.warn(`[Server Load /home] Credentials document not found for userId: ${userId}. Defaulting name to 'User'.`);
        }
    } catch (userError: any) {
        console.error(`[Server Load /home] Error fetching user credentials for ${userId}:`, userError);
    }
    try {
        // --- Fetch Notes ---
        const notesCollectionRef = adminDb.collection('notes');
        const notesQuery = notesCollectionRef.where('userId', '==', userId).orderBy('createdAt', 'desc');
        const notesSnapshot = await notesQuery.get();
        const notes = notesSnapshot.docs.map((docSnapshot: any) => {
            const docData = docSnapshot.data();
            const createdAtTimestamp = docData.createdAt as Timestamp | undefined;
            return {
                id: docSnapshot.id,
                title: docData.title || 'Untitled Note',
                content: docData.content || '',
                createdAt: createdAtTimestamp?.toDate()?.toISOString() ?? null, // Convert Timestamp to ISO string
                userId: docData.userId
            };
        });
        console.log(`[Server Load /home] Fetched ${notes.length} notes.`);

        // --- Fetch Tasks (Conditionally Filtered) ---
        const tasksCollectionRef = adminDb.collection('tasks');
        let tasksQuery = tasksCollectionRef.where('userId', '==', userId);

        // Get today's date in YYYY-MM-DD format
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        const todayDateString = `${year}-${month}-${day}`;

        console.log(`[Server Load /home] Filtering tasks for today: ${todayDateString}`);
        tasksQuery = tasksQuery.where('dueDate', '==', todayDateString);

        // Apply filter based on the 'showCompleted' state
        if (!shouldShowCompleted) {
            console.log('[Server Load /home] Filtering incomplete tasks for today.');
            // This will likely require an index on (userId ASC, dueDate ASC, isCompleted ASC, createdAt DESC) or similar
            tasksQuery = tasksQuery.where('isCompleted', '==', false);
        } else {
             console.log('[Server Load /home] Fetching all tasks for today (completed and incomplete).');
             // This will likely require an index on (userId ASC, dueDate ASC, createdAt DESC)
        }

        // Apply ordering and limit
        // Order by priority then by creation time for tasks due today
        tasksQuery = tasksQuery.orderBy('priority', 'desc').orderBy('createdAt', 'asc').limit(10);
        // Note: Firestore requires the first orderBy field to match the inequality/range filter if one exists.
        // Since we have an equality filter on dueDate, we can order by other fields.
        // If dueDate was a range, priority would need to be the first orderBy.

        const tasksSnapshot = await tasksQuery.get();
        console.log(`[Server Load /home] Fetched ${tasksSnapshot.size} tasks matching filter.`);

        // Map Firestore task documents to the TaskServerData interface for the client
        const tasksData: TaskServerData[] = tasksSnapshot.docs.map((docSnapshot: any) => {
            const docData = docSnapshot.data();
            const createdAtTimestamp = docData.createdAt as Timestamp | undefined;

            // Handle dueDate (assuming stored as 'YYYY-MM-DD' string, or convert if Timestamp)
            let dueDateStr: string | null = null;
            if (docData.dueDate) {
                if (docData.dueDate instanceof Timestamp) {
                     // Convert Timestamp to 'YYYY-MM-DD'
                     try {
                        dueDateStr = docData.dueDate.toDate().toISOString().split('T')[0];
                     } catch (e) { console.warn(`Error converting dueDate Timestamp for task ${docSnapshot.id}`); }
                } else if (typeof docData.dueDate === 'string') {
                    // Validate or use the string directly if it's already YYYY-MM-DD
                    dueDateStr = docData.dueDate.match(/^\d{4}-\d{2}-\d{2}$/) ? docData.dueDate : null;
                }
            }

            return {
                id: docSnapshot.id,
                title: docData.title || '', // Fetch the title field
                description: docData.description || '',
                isCompleted: docData.isCompleted ?? false,
                createdAt: createdAtTimestamp?.toDate()?.toISOString() ?? null, // Convert Timestamp to ISO string
                userId: docData.userId,
                dueDate: dueDateStr, // Send as YYYY-MM-DD string
                dueTime: docData.dueTime || null, // Send as HH:MM string
                priority: docData.priority || 'standard',
                tags: docData.tags || [],
                noteId: docData.noteId
            };
        });

        // Return all fetched data
        return { notes, tasks: tasksData, showCompleted: shouldShowCompleted, username: username };

    } catch (error: any) {
        console.error('[Server Load /home] !!! ERROR loading data from Firestore (Admin SDK) !!!:', error);
        // Provide specific feedback for common index errors
        if (error.code === 'FAILED_PRECONDITION' && error.message.includes('index')) {
            console.error("[Server Load /home] Query failed due to a missing Firestore index. Check the Firestore console for index suggestions based on the error message and your query filters/ordering (e.g., userId, isCompleted, createdAt).");
            return {
                notes: [], tasks: [], showCompleted: shouldShowCompleted,
                error: `Query failed: Missing Firestore index. Please check server logs and Firestore console.`
            };
        }
        // Return generic error for other issues
        return {
            notes: [], tasks: [], showCompleted: shouldShowCompleted, username: 'User',
            error: `Failed to load data: ${error.message || 'Server Error'}. Check server logs.`
        };
    }
};

// --- Form Actions ---
export const actions = {
    // --- Note Actions (Keep existing logic) ---
    addNote: async ({ request, locals }: import('./$types').RequestEvent) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { noteForm: { error: 'Authentication required.' } });
        const formData = await request.formData();
        const title = formData.get('title')?.toString()?.trim() || 'Untitled Note';
        const content = formData.get('content')?.toString()?.trim();
        if (!content) return fail(400, { noteForm: { title, missingContent: true, error: 'Note content cannot be empty.' } });
        try {
            const newDocRef = await adminDb.collection('notes').add({ userId, title, content, createdAt: FieldValue.serverTimestamp(), lastModified: FieldValue.serverTimestamp() });
            return { noteForm: { success: true, id: newDocRef.id, message: 'Note added.' } };
        } catch (e:any) { console.error('[Action addNote] Error:', e); return fail(500, { noteForm: { title, content, error: 'Server error adding note.' } }); }
    },

    editNote: async ({ request, locals }: import('./$types').RequestEvent) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { noteForm: { error: 'Authentication required.' } });
        const formData = await request.formData();
        const id = formData.get('id')?.toString();
        const title = formData.get('title')?.toString()?.trim() || 'Untitled Note';
        const content = formData.get('content')?.toString()?.trim();
        if (!id) return fail(400, { noteForm: { error: 'Note ID missing.' } });
        if (!content) return fail(400, { noteForm: { id, title, error: 'Note content empty.' } });
        try {
            const noteDocRef = adminDb.collection('notes').doc(id);
            const noteSnap = await noteDocRef.get();
            if (!noteSnap.exists || noteSnap.data()?.userId !== userId) return fail(noteSnap.exists ? 403 : 404, { noteForm: { id, error: 'Permission denied or note not found.' }});
            await noteDocRef.update({ title, content, lastModified: FieldValue.serverTimestamp() });
            return { noteForm: { success: true, id, message: 'Note updated.' } };
        } catch (e:any) { console.error('[Action editNote] Error:', e); return fail(500, { noteForm: { id, title, content, error: 'Server error updating note.' } }); }
    },

    deleteNote: async ({ request, locals }: import('./$types').RequestEvent) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { noteForm: { error: 'Authentication required.' } });
        const formData = await request.formData();
        const id = formData.get('id')?.toString();
        if (!id) return fail(400, { noteForm: { error: 'Note ID missing.' } });
        try {
            const noteDocRef = adminDb.collection('notes').doc(id);
            const noteSnap = await noteDocRef.get();
            // Allow deletion even if note not found (idempotent) or permission denied (don't leak info)
            if (noteSnap.exists && noteSnap.data()?.userId === userId) {
                 await noteDocRef.delete();
                 console.log(`[Action deleteNote] Note ${id} deleted by user ${userId}`);
                 return { noteForm: { success: true, id, message: 'Note deleted.' } };
            } else if (!noteSnap.exists) {
                 console.log(`[Action deleteNote] Note ${id} not found for deletion.`);
                 return { noteForm: { success: true, id, message: 'Note already deleted or not found.' } };
            } else {
                 console.warn(`[Action deleteNote] User ${userId} attempted to delete note ${id} owned by ${noteSnap.data()?.userId}`);
                 return fail(403, { noteForm: { id, error: 'Permission denied.' }});
            }
        } catch (e:any) { console.error('[Action deleteNote] Error:', e); return fail(500, { noteForm: { id, error: 'Server error deleting note.' } }); }
    },

    // --- Task Actions (Modified) ---
    addTask: async ({ request, locals }: import('./$types').RequestEvent) => {
        const userId = locals.userId;
        if (!userId) { return fail(401, { taskForm: { error: 'Authentication required.' } }); }

        const formData = await request.formData();
        // Get the title from the form data
        const title = formData.get('title')?.toString()?.trim();
        const description = formData.get('description')?.toString()?.trim();
        const dueDate = formData.get('dueDate')?.toString() || null; // Expect YYYY-MM-DD
        const dueTime = formData.get('dueTime')?.toString() || null; // Expect HH:MM
        const priority = formData.get('priority')?.toString() || 'standard';
        const tagsString = formData.get('tags')?.toString()?.trim() || '';
        // Convert comma-separated tags string into an array
        const tags = tagsString ? tagsString.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

        // Require at least a title (description is now optional if title exists)
        if (!title) {
             return fail(400, { taskForm: { description, dueDate, dueTime, priority, tags: tagsString, error: 'Task title is required.' } });
        }

        // Prepare the data object to be saved to Firestore
        const taskData: any = {
            userId: userId,
            title: title, // Save the title
            description: description || "", // Save description or empty string
            isCompleted: false, // New tasks are always incomplete
            createdAt: FieldValue.serverTimestamp(), // Use server timestamp for creation time
            lastModified: FieldValue.serverTimestamp(), // Also set last modified time
            priority: priority,
            tags: tags
        };

        // Add dueDate and dueTime if they exist and are valid (simple check for now)
        if (dueDate && dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            taskData.dueDate = dueDate; // Store as YYYY-MM-DD string
        }
        if (dueTime && dueTime.match(/^\d{2}:\d{2}$/)) {
            taskData.dueTime = dueTime; // Store as HH:MM string
        }

        try {
            console.log(`[Action addTask] Adding task for user ${userId}:`, { title: taskData.title, priority: taskData.priority });
            const tasksCollectionRef = adminDb.collection('tasks');
            const newTaskDocRef = await tasksCollectionRef.add(taskData);
            console.log(`[Action addTask] Task added with ID ${newTaskDocRef.id}`);
            // Return success state, client will trigger data refresh via invalidateAll
            return { taskForm: { success: true, id: newTaskDocRef.id, message: 'Task added!' } };
        } catch (error: any) {
            console.error('[Action addTask] Error adding task (Admin SDK):', error);
            // Return failure with submitted data (minus sensitive info) and error message
            return fail(500, { taskForm: { title, description, dueDate, dueTime, priority, tags: tagsString, error: 'Failed to save task due to a server error.' } });
        }
    },

    toggleTask: async ({ request, locals }: import('./$types').RequestEvent) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { error: 'Authentication required.' });
        const formData = await request.formData();
        const id = formData.get('id')?.toString();
        // Checkbox value is 'on' when checked, null when unchecked in standard form submission
        const newIsCompleted = formData.get('isCompleted') !== null;
        if (!id) return fail(400, { error: 'Task ID missing.' });
        try {
            const taskDocRef = adminDb.collection('tasks').doc(id);
            const taskSnap = await taskDocRef.get();
            if (!taskSnap.exists || taskSnap.data()?.userId !== userId) return fail(taskSnap.exists ? 403: 404, { id, error: 'Permission denied or task not found.' });
            await taskDocRef.update({ isCompleted: newIsCompleted, lastModified: FieldValue.serverTimestamp() });
            console.log(`[Action toggleTask] Task ${id} completion set to ${newIsCompleted}`);
            return { success: true }; // Client will invalidate data
        } catch (e:any) { console.error(`[Action toggleTask] Error for task ${id}:`, e); return fail(500, { id, error: 'Server error updating task status.' }); }
    },

    deleteTask: async ({ request, locals }: import('./$types').RequestEvent) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { error: 'Authentication required.' });
        const formData = await request.formData();
        const id = formData.get('id')?.toString();
        if (!id) return fail(400, { error: 'Task ID missing.' });
        try {
            const taskDocRef = adminDb.collection('tasks').doc(id);
            const taskSnap = await taskDocRef.get();
             if (taskSnap.exists && taskSnap.data()?.userId === userId) {
                 await taskDocRef.delete();
                 console.log(`[Action deleteTask] Task ${id} deleted by user ${userId}`);
                 return { success: true, message: 'Task deleted.' };
            } else if (!taskSnap.exists) {
                 console.log(`[Action deleteTask] Task ${id} not found for deletion.`);
                 return { success: true, message: 'Task already deleted or not found.' }; // Not an error
            } else {
                 console.warn(`[Action deleteTask] User ${userId} attempted to delete task ${id} owned by ${taskSnap.data()?.userId}`);
                 return fail(403, { id, error: 'Permission denied.' });
            }
        } catch (e:any) { console.error(`[Action deleteTask] Error for task ${id}:`, e); return fail(500, { id, error: 'Server error deleting task.' }); }
    },
};
;null as any as Actions;