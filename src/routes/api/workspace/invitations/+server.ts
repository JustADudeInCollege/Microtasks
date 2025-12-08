// src/routes/api/workspace/invitations/+server.ts
// API endpoint for workspace invitation management

import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { adminAuth } from '../../../../lib/server/firebaseAdmin.js';
import {
    createInvitation,
    getUserPendingInvitations,
    getWorkspacePendingInvitations,
    acceptInvitation,
    declineInvitation,
    cancelInvitation,
    canPerformAction,
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

// GET /api/workspace/invitations?workspaceId=xxx OR /api/workspace/invitations?mine=true
export const GET: RequestHandler = async ({ url, cookies }) => {
    const userId = await verifySession(cookies);
    const workspaceId = url.searchParams.get('workspaceId');
    const getMine = url.searchParams.get('mine') === 'true';

    if (getMine) {
        // Get invitations sent to the current user
        const invitations = await getUserPendingInvitations(userId);
        return json({ invitations });
    }

    if (workspaceId) {
        // Verify user can manage members
        const canManage = await canPerformAction(workspaceId, userId, 'manageMembers');
        if (!canManage) {
            throw error(403, 'Access denied');
        }

        const invitations = await getWorkspacePendingInvitations(workspaceId);
        return json({ invitations });
    }

    throw error(400, 'Either workspaceId or mine=true is required');
};

// POST /api/workspace/invitations - Create an invitation
export const POST: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { workspaceId, email, role } = await request.json();

    console.log(`[Invitations POST] userId: ${userId}, workspaceId: ${workspaceId}, email: ${email}, role: ${role}`);

    if (!workspaceId || !email || !role) {
        throw error(400, 'workspaceId, email, and role are required');
    }

    // Validate role
    if (!['admin', 'editor', 'viewer'].includes(role)) {
        throw error(400, 'Invalid role. Must be admin, editor, or viewer');
    }

    // Verify user can manage members
    const canManage = await canPerformAction(workspaceId, userId, 'manageMembers');
    console.log(`[Invitations POST] canPerformAction result: ${canManage}`);
    
    if (!canManage) {
        throw error(403, 'You do not have permission to invite members');
    }

    try {
        const invitation = await createInvitation(workspaceId, email, role as MemberRole, userId);
        return json({ success: true, invitation });
    } catch (err: any) {
        throw error(400, err.message || 'Failed to create invitation');
    }
};

// PATCH /api/workspace/invitations - Accept or decline an invitation
export const PATCH: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { invitationId, action } = await request.json();

    if (!invitationId || !action) {
        throw error(400, 'invitationId and action are required');
    }

    if (!['accept', 'decline'].includes(action)) {
        throw error(400, 'action must be accept or decline');
    }

    try {
        if (action === 'accept') {
            await acceptInvitation(invitationId, userId);
        } else {
            await declineInvitation(invitationId, userId);
        }
        return json({ success: true });
    } catch (err: any) {
        throw error(400, err.message || 'Failed to process invitation');
    }
};

// DELETE /api/workspace/invitations - Cancel an invitation (by admin/owner)
export const DELETE: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { invitationId, workspaceId } = await request.json();

    if (!invitationId || !workspaceId) {
        throw error(400, 'invitationId and workspaceId are required');
    }

    // Verify user can manage members
    const canManage = await canPerformAction(workspaceId, userId, 'manageMembers');
    if (!canManage) {
        throw error(403, 'You do not have permission to cancel invitations');
    }

    try {
        await cancelInvitation(invitationId);
        return json({ success: true });
    } catch (err: any) {
        throw error(400, err.message || 'Failed to cancel invitation');
    }
};
