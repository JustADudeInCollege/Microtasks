// src/routes/api/notifications/+server.ts
// API endpoint for user notifications

import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { adminAuth } from '../../../lib/server/firebaseAdmin.js';
import {
    getUserNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    getUnreadNotificationCount,
    deleteNotification,
} from '../../../lib/server/collaborationService.js';

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

// GET /api/notifications - Get user's notifications
export const GET: RequestHandler = async ({ url, cookies }) => {
    const userId = await verifySession(cookies);
    const includeRead = url.searchParams.get('includeRead') === 'true';
    const countOnly = url.searchParams.get('countOnly') === 'true';

    try {
        if (countOnly) {
            const count = await getUnreadNotificationCount(userId);
            return json({ count });
        }

        const notifications = await getUserNotifications(userId, includeRead);
        
        // Add timeAgo for each notification
        const notificationsWithTimeAgo = notifications.map(n => ({
            ...n,
            timeAgo: formatTimeAgo(n.createdAt),
        }));

        return json({ notifications: notificationsWithTimeAgo });
    } catch (err) {
        console.error('[notifications GET] Error:', err);
        return json({ notifications: [], count: 0 });
    }
};

// PATCH /api/notifications - Mark notification(s) as read
export const PATCH: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { notificationId, markAll } = await request.json();

    try {
        if (markAll) {
            const count = await markAllNotificationsAsRead(userId);
            return json({ success: true, markedCount: count });
        }

        if (!notificationId) {
            throw error(400, 'notificationId is required');
        }

        const success = await markNotificationAsRead(notificationId, userId);
        if (!success) {
            throw error(404, 'Notification not found or access denied');
        }

        return json({ success: true });
    } catch (err) {
        console.error('[notifications PATCH] Error:', err);
        throw error(500, 'Failed to update notification');
    }
};

// DELETE /api/notifications - Delete/dismiss a notification
export const DELETE: RequestHandler = async ({ request, cookies }) => {
    const userId = await verifySession(cookies);
    const { notificationId } = await request.json();

    if (!notificationId) {
        throw error(400, 'notificationId is required');
    }

    try {
        const success = await deleteNotification(notificationId, userId);
        if (!success) {
            throw error(404, 'Notification not found or access denied');
        }

        return json({ success: true });
    } catch (err) {
        console.error('[notifications DELETE] Error:', err);
        throw error(500, 'Failed to delete notification');
    }
};

// Helper function for time ago formatting
function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}
