// src/routes/api/workspace/activity/+server.ts
// API endpoint for workspace activity log

import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { adminAuth } from '../../../../lib/server/firebaseAdmin.js';
import {
    getWorkspaceActivityLog,
    canPerformAction,
} from '../../../../lib/server/collaborationService.js';
import { formatTimeAgo } from '../../../../lib/types/collaboration.js';

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

// GET /api/workspace/activity?workspaceId=xxx&limit=50
export const GET: RequestHandler = async ({ url, cookies }) => {
    const userId = await verifySession(cookies);
    const workspaceId = url.searchParams.get('workspaceId');
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    if (!workspaceId) {
        throw error(400, 'workspaceId is required');
    }

    // Verify user has access
    const canView = await canPerformAction(workspaceId, userId, 'view');
    if (!canView) {
        throw error(403, 'Access denied');
    }

    const activities = await getWorkspaceActivityLog(workspaceId, limit);
    
    // Add timeAgo for display
    const activitiesForFrontend = activities.map(a => ({
        ...a,
        timeAgo: formatTimeAgo(a.createdAt),
    }));

    return json({ activities: activitiesForFrontend });
};
