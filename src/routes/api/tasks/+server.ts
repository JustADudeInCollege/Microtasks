// API endpoint for fetching all user tasks (for AI panel)
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';

export const GET: RequestHandler = async ({ locals }) => {
    const userId = locals.userId;

    if (!userId) {
        return json({ error: 'User not authenticated' }, { status: 401 });
    }

    try {
        const tasksCollectionRef = adminDb.collection('tasks');
        const tasksQuery = tasksCollectionRef.where('userId', '==', userId);
        const snapshot = await tasksQuery.get();

        const tasks = snapshot.docs.map((doc) => {
            const data = doc.data();
            const createdAtTimestamp = data.createdAt as Timestamp | undefined;

            // Determine status
            let status: 'pending' | 'complete' | 'incomplete' | 'late' = 'pending';
            const isCompleted = data.isCompleted ?? false;

            if (isCompleted) {
                status = 'complete';
            } else if (data.dueDate) {
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                if (data.dueDate < todayStr) {
                    status = 'incomplete'; // overdue
                }
            }

            return {
                id: doc.id,
                title: data.title || 'Untitled Task',
                description: data.description || '',
                isCompleted: isCompleted,
                status: status,
                priority: data.priority || 'standard',
                createdAtISO: createdAtTimestamp?.toDate()?.toISOString() ?? null,
                dueDateISO: data.dueDate || null,
                dueTime: data.dueTime || null
            };
        });

        return json({ success: true, tasks });
    } catch (error: any) {
        console.error('[API /tasks] Error fetching tasks:', error);
        return json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }
};

// POST handler for creating tasks
export const POST: RequestHandler = async ({ request, locals }) => {
    const userId = locals.userId;

    if (!userId) {
        return json({ success: false, error: 'User not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { title, description, boardId, priority, dueDate, dueTime } = body;

        if (!title?.trim()) {
            return json({ success: false, error: 'Task title is required' }, { status: 400 });
        }

        // Create the task
        const taskData: any = {
            userId,
            title: title.trim(),
            description: description?.trim() || '',
            isCompleted: false,
            priority: priority || 'standard',
            createdAt: Timestamp.now()
        };

        // Add optional fields
        if (boardId) taskData.boardId = boardId;
        if (dueDate) taskData.dueDate = dueDate;
        if (dueTime) taskData.dueTime = dueTime;

        const newTaskRef = await adminDb.collection('tasks').add(taskData);

        return json({
            success: true,
            taskId: newTaskRef.id,
            message: 'Task created successfully'
        });
    } catch (error: any) {
        console.error('[API /tasks POST] Error creating task:', error);
        return json({ success: false, error: 'Failed to create task' }, { status: 500 });
    }
};
