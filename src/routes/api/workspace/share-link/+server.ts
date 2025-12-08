// src/routes/api/workspace/share-link/+server.ts
// API endpoint for creating and managing workspace share links

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { adminDb } from '$lib/server/firebaseAdmin';
import { getUserRole } from '$lib/server/collaborationService';
import type { MemberRole, WorkspaceShareLink, ShareLinkForFrontend } from '$lib/types/collaboration';
import crypto from 'crypto';

const shareLinksCollection = adminDb.collection('workspace_share_links');
const workspacesCollection = adminDb.collection('workspaces');

function generateShareToken(): string {
    // Generate a URL-safe random token
    return crypto.randomBytes(16).toString('base64url');
}

// GET - Fetch share links for a workspace
export const GET: RequestHandler = async ({ url, locals }) => {
    const userId = locals.userId;
    if (!userId) {
        return json({ message: 'Unauthorized' }, { status: 401 });
    }

    const workspaceId = url.searchParams.get('workspaceId');
    if (!workspaceId) {
        return json({ message: 'Workspace ID is required' }, { status: 400 });
    }

    try {
        // Check if user has permission to view share links
        const userRole = await getUserRole(workspaceId, userId);
        if (!userRole || (userRole !== 'owner' && userRole !== 'admin')) {
            return json({ message: 'Permission denied' }, { status: 403 });
        }

        const snapshot = await shareLinksCollection
            .where('workspaceId', '==', workspaceId)
            .where('isActive', '==', true)
            .orderBy('createdAt', 'desc')
            .get();

        const shareLinks: ShareLinkForFrontend[] = snapshot.docs.map(doc => {
            const data = doc.data() as WorkspaceShareLink;
            return {
                id: doc.id,
                role: data.role,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt,
                usageLimit: data.usageLimit,
                usageCount: data.usageCount,
                isActive: data.isActive,
                url: `${url.origin}/join/${doc.id}`
            };
        });

        return json({ shareLinks });
    } catch (error: any) {
        console.error('[GET /api/workspace/share-link] Error:', error);
        return json({ message: 'Failed to fetch share links' }, { status: 500 });
    }
};

// POST - Create a new share link
export const POST: RequestHandler = async ({ request, url, locals }) => {
    const userId = locals.userId;
    if (!userId) {
        return json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { workspaceId, role, expiresInDays, usageLimit } = await request.json();

        if (!workspaceId) {
            return json({ message: 'Workspace ID is required' }, { status: 400 });
        }

        // Check if user has permission to create share links
        const userRole = await getUserRole(workspaceId, userId);
        if (!userRole || (userRole !== 'owner' && userRole !== 'admin')) {
            return json({ message: 'Permission denied' }, { status: 403 });
        }

        // Can't create links with higher role than yourself (except owner can create any)
        const validRole: MemberRole = role || 'viewer';
        if (userRole !== 'owner' && (validRole === 'owner' || validRole === 'admin')) {
            return json({ message: 'Cannot create link with admin or owner role' }, { status: 403 });
        }

        // Get workspace name
        const workspaceDoc = await workspacesCollection.doc(workspaceId).get();
        if (!workspaceDoc.exists) {
            return json({ message: 'Workspace not found' }, { status: 404 });
        }
        const workspaceName = workspaceDoc.data()?.title || 'Workspace';

        // Get creator's username
        const credDoc = await adminDb.collection('credentials').doc(userId).get();
        const creatorUsername = credDoc.exists ? credDoc.data()?.username || 'Unknown' : 'Unknown';

        // Generate unique token for the link
        const linkToken = generateShareToken();

        // Calculate expiration
        let expiresAt: string | null = null;
        if (expiresInDays && expiresInDays > 0) {
            const expDate = new Date();
            expDate.setDate(expDate.getDate() + expiresInDays);
            expiresAt = expDate.toISOString();
        }

        const shareLinkData: Omit<WorkspaceShareLink, 'id'> = {
            workspaceId,
            workspaceName,
            role: validRole,
            createdBy: userId,
            createdByUsername: creatorUsername,
            createdAt: new Date().toISOString(),
            expiresAt,
            usageLimit: usageLimit || null,
            usageCount: 0,
            isActive: true
        };

        // Use the token as the document ID for easy lookup
        await shareLinksCollection.doc(linkToken).set(shareLinkData);

        const shareLink: ShareLinkForFrontend = {
            id: linkToken,
            role: validRole,
            createdAt: shareLinkData.createdAt,
            expiresAt,
            usageLimit: usageLimit || null,
            usageCount: 0,
            isActive: true,
            url: `${url.origin}/join/${linkToken}`
        };

        return json({ shareLink });
    } catch (error: any) {
        console.error('[POST /api/workspace/share-link] Error:', error);
        return json({ message: 'Failed to create share link' }, { status: 500 });
    }
};

// DELETE - Deactivate a share link
export const DELETE: RequestHandler = async ({ request, locals }) => {
    const userId = locals.userId;
    if (!userId) {
        return json({ message: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { linkId, workspaceId } = await request.json();

        if (!linkId || !workspaceId) {
            return json({ message: 'Link ID and workspace ID are required' }, { status: 400 });
        }

        // Check if user has permission
        const userRole = await getUserRole(workspaceId, userId);
        if (!userRole || (userRole !== 'owner' && userRole !== 'admin')) {
            return json({ message: 'Permission denied' }, { status: 403 });
        }

        // Verify the link belongs to this workspace
        const linkDoc = await shareLinksCollection.doc(linkId).get();
        if (!linkDoc.exists || linkDoc.data()?.workspaceId !== workspaceId) {
            return json({ message: 'Share link not found' }, { status: 404 });
        }

        // Deactivate the link (soft delete)
        await shareLinksCollection.doc(linkId).update({ isActive: false });

        return json({ success: true });
    } catch (error: any) {
        console.error('[DELETE /api/workspace/share-link] Error:', error);
        return json({ message: 'Failed to delete share link' }, { status: 500 });
    }
};
