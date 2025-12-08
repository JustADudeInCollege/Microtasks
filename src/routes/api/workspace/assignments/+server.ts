// src/routes/api/workspace/assignments/+server.ts
// API endpoint for task assignment management

import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { adminAuth, adminDb } from '../../../../lib/server/firebaseAdmin.js';
import {
    assignUserToTask,
    unassignUserFromTask,
    getTaskAssignments,
    getWorkspaceTaskAssignments,
    canPerformAction,
    logActivity,
} from '../../../../lib/server/collaborationService.js';

// Helper to verify session
async function verifySession(cookies: any): Promise<string> {
    const sessionToken = cookies.get('__session');
    if (!sessionToken) {
        throw error(401, 'Not authenticated');
    }

    try {
        const decodedToken = await adminAuth.verifyIdToken(sessionToken, true);
        return decodedToken.uid;
    } catch (err) {
        throw error(401, 'Invalid session');
    }
}

// Helper to get workspace ID from task
async function getWorkspaceIdFromTask(taskId: string): Promise<string> {
    const taskDoc = await adminDb.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) {
        throw error(404, 'Task not found');
    }
    return taskDoc.data()!.boardId;
}

// GET /api/workspace/assignments?taskId=xxx OR ?workspaceId=xxx
export const GET: RequestHandler = async ({ url, cookies }) => {
    const userId = await verifySession(cookies);
    const taskId = url.searchParams.get('taskId');
    const workspaceId = url.searchParams.get('workspaceId');

    // If workspaceId is provided, get all assignments for the workspace
    if (workspaceId) {
        try {
            const canView = await canPerformAction(workspaceId, userId, 'view');
            if (!canView) {
                // Return empty assignments instead of error for non-collaborative workspaces
                return json({ assignments: [] });
            }
            
            const assignments = await getWorkspaceTaskAssignments(workspaceId);
            
            const assignmentsWithFlag = assignments.map(a => ({
                ...a,
                isCurrentUser: a.userId === userId,
            }));
            
            return json({ assignments: assignmentsWithFlag });
        } catch (err) {
            console.error('[assignments GET] Error fetching workspace assignments:', err);
            // Return empty array on error to prevent UI breakage
            return json({ assignments: [] });
        }
    }

    // Otherwise, get assignments for a specific task
    if (!taskId) {
        throw error(400, 'taskId or workspaceId is required');
    }

    // Get workspace and verify access
    const taskWorkspaceId = await getWorkspaceIdFromTask(taskId);
    const canView = await canPerformAction(taskWorkspaceId, userId, 'view');
    if (!canView) {
        throw error(403, 'Access denied');
    }

    const assignments = await getTaskAssignments(taskId);
    
    // Add isCurrentUser flag
    const assignmentsWithFlag = assignments.map(a => ({
        ...a,
        isCurrentUser: a.userId === userId,
    }));

    return json({ assignments: assignmentsWithFlag });
};

// POST /api/workspace/assignments - Assign a user to a task
export const POST: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { taskId, assignUserId } = await request.json();

    if (!taskId || !assignUserId) {
        throw error(400, 'taskId and assignUserId are required');
    }

    // Get workspace and verify permission (only owner and admin can assign)
    const workspaceId = await getWorkspaceIdFromTask(taskId);
    const canAssign = await canPerformAction(workspaceId, userId, 'assign');
    if (!canAssign) {
        throw error(403, 'Only owners and admins can assign tasks');
    }

    try {
        const assignment = await assignUserToTask(taskId, assignUserId, userId);
        
        // Log activity
        await logActivity(
            workspaceId,
            userId,
            'task_assigned',
            `assigned ${assignment.username} to a task`,
            taskId,
            { assignedUserId: assignUserId }
        );

        return json({ success: true, assignment });
    } catch (err: any) {
        throw error(400, err.message || 'Failed to assign user');
    }
};

// DELETE /api/workspace/assignments - Unassign a user from a task
export const DELETE: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { taskId, unassignUserId } = await request.json();

    if (!taskId || !unassignUserId) {
        throw error(400, 'taskId and unassignUserId are required');
    }

    // Get workspace and verify permission
    const workspaceId = await getWorkspaceIdFromTask(taskId);
    
    // Allow self-unassignment or owner/admin only
    const isSelfUnassign = userId === unassignUserId;
    if (!isSelfUnassign) {
        const canAssign = await canPerformAction(workspaceId, userId, 'assign');
        if (!canAssign) {
            throw error(403, 'Only owners and admins can unassign tasks');
        }
    }

    try {
        await unassignUserFromTask(taskId, unassignUserId);
        
        // Log activity
        await logActivity(
            workspaceId,
            userId,
            'task_unassigned',
            isSelfUnassign ? 'unassigned themselves from a task' : 'unassigned a member from a task',
            taskId,
            { unassignedUserId: unassignUserId }
        );

        return json({ success: true });
    } catch (err: any) {
        throw error(400, err.message || 'Failed to unassign user');
    }
};
