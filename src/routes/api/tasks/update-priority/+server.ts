// src/routes/api/tasks/update-priority/+server.ts
// API endpoint to update a task's priority

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/firebaseAdmin';

export const POST: RequestHandler = async ({ request, locals }) => {
    const userId = locals.userId;
    if (!userId) {
        return json({ error: 'User not authenticated' }, { status: 401 });
    }

    try {
        const { taskId, priority } = await request.json();

        if (!taskId) {
            return json({ error: 'taskId is required' }, { status: 400 });
        }

        if (!priority || !['urgent', 'high', 'standard', 'low'].includes(priority)) {
            return json({ error: 'Invalid priority. Must be one of: urgent, high, standard, low' }, { status: 400 });
        }

        // Get the task to verify ownership or collaboration access
        const taskRef = adminDb.collection('tasks').doc(taskId);
        const taskDoc = await taskRef.get();

        if (!taskDoc.exists) {
            return json({ error: 'Task not found' }, { status: 404 });
        }

        const taskData = taskDoc.data();

        // Check if user owns the task or has access through workspace
        let hasAccess = taskData?.userId === userId;

        if (!hasAccess && taskData?.boardId) {
            // Check workspace access
            const workspaceRef = adminDb.collection('workspaces').doc(taskData.boardId);
            const workspaceDoc = await workspaceRef.get();

            if (workspaceDoc.exists) {
                const wsData = workspaceDoc.data();
                hasAccess = wsData?.ownerId === userId ||
                    (wsData?.members && wsData.members.some((m: any) => m.id === userId));
            }
        }

        if (!hasAccess) {
            return json({ error: 'You do not have permission to update this task' }, { status: 403 });
        }

        // Update the task priority
        await taskRef.update({
            priority,
            updatedAt: new Date()
        });

        return json({
            success: true,
            message: `Priority updated to ${priority}`,
            taskId,
            newPriority: priority
        });

    } catch (error: any) {
        console.error('[API update-priority] Error:', error);
        return json({ error: error.message || 'Failed to update priority' }, { status: 500 });
    }
};
