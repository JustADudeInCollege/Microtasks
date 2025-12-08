// src/routes/api/workspace/members/+server.ts
// API endpoint for workspace member management

import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { adminAuth } from '../../../../lib/server/firebaseAdmin.js';
import {
    getWorkspaceMembers,
    addWorkspaceMember,
    removeWorkspaceMember,
    updateMemberRole,
    canPerformAction,
    getUserRole,
} from '../../../../lib/server/collaborationService.js';
import type { MemberRole } from '../../../../lib/types/collaboration.js';

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

// GET /api/workspace/members?workspaceId=xxx
export const GET: RequestHandler = async ({ url, cookies }) => {
    const userId = await verifySession(cookies);
    const workspaceId = url.searchParams.get('workspaceId');

    if (!workspaceId) {
        throw error(400, 'workspaceId is required');
    }

    // Verify user has access
    const hasAccess = await canPerformAction(workspaceId, userId, 'view');
    if (!hasAccess) {
        throw error(403, 'Access denied');
    }

    const members = await getWorkspaceMembers(workspaceId);
    
    // Debug: log members with photos
    console.log('[Members API] Members:', members.map(m => ({ username: m.username, photoURL: m.photoURL })));
    
    // Add isCurrentUser flag
    const membersWithFlag = members.map(m => ({
        ...m,
        isCurrentUser: m.userId === userId,
    }));

    return json({ members: membersWithFlag });
};

// POST /api/workspace/members - Add a member (for accepting invitations or direct add)
export const POST: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { workspaceId, targetUserId, role } = await request.json();

    if (!workspaceId || !targetUserId || !role) {
        throw error(400, 'workspaceId, targetUserId, and role are required');
    }

    // Verify user can manage members
    const canManage = await canPerformAction(workspaceId, userId, 'manageMembers');
    if (!canManage) {
        throw error(403, 'You do not have permission to add members');
    }

    // Cannot add as owner
    if (role === 'owner') {
        throw error(400, 'Cannot add a member as owner');
    }

    try {
        const member = await addWorkspaceMember(workspaceId, targetUserId, role as MemberRole, userId);
        return json({ success: true, member });
    } catch (err: any) {
        throw error(400, err.message || 'Failed to add member');
    }
};

// PATCH /api/workspace/members - Update member role
export const PATCH: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { workspaceId, targetUserId, newRole } = await request.json();

    if (!workspaceId || !targetUserId || !newRole) {
        throw error(400, 'workspaceId, targetUserId, and newRole are required');
    }

    // Verify user can manage members
    const canManage = await canPerformAction(workspaceId, userId, 'manageMembers');
    if (!canManage) {
        throw error(403, 'You do not have permission to change roles');
    }

    // Check if target is owner
    const targetRole = await getUserRole(workspaceId, targetUserId);
    if (targetRole === 'owner') {
        throw error(400, 'Cannot change owner role');
    }

    // Cannot set as owner
    if (newRole === 'owner') {
        throw error(400, 'Cannot set role to owner');
    }

    try {
        await updateMemberRole(workspaceId, targetUserId, newRole as MemberRole);
        return json({ success: true });
    } catch (err: any) {
        throw error(400, err.message || 'Failed to update role');
    }
};

// DELETE /api/workspace/members
export const DELETE: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { workspaceId, targetUserId } = await request.json();

    if (!workspaceId || !targetUserId) {
        throw error(400, 'workspaceId and targetUserId are required');
    }

    // Check if user is removing themselves (allowed)
    const isSelfRemoval = userId === targetUserId;

    if (!isSelfRemoval) {
        // Verify user can manage members
        const canManage = await canPerformAction(workspaceId, userId, 'manageMembers');
        if (!canManage) {
            throw error(403, 'You do not have permission to remove members');
        }
    }

    // Cannot remove owner
    const targetRole = await getUserRole(workspaceId, targetUserId);
    if (targetRole === 'owner') {
        throw error(400, 'Cannot remove workspace owner');
    }

    try {
        await removeWorkspaceMember(workspaceId, targetUserId);
        return json({ success: true });
    } catch (err: any) {
        throw error(400, err.message || 'Failed to remove member');
    }
};
