import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { adminDb } from '$lib/server/firebaseAdmin.js';

export const POST: RequestHandler = async ({ request, locals }) => {
    const userId = locals.userId;
    
    if (!userId) {
        throw error(401, 'Not authenticated');
    }

    try {
        const { timezone } = await request.json();
        
        if (!timezone || typeof timezone !== 'string') {
            throw error(400, 'Invalid timezone');
        }

        // Validate timezone string by trying to use it
        try {
            Intl.DateTimeFormat('en-US', { timeZone: timezone });
        } catch (e) {
            throw error(400, 'Invalid timezone format');
        }

        // Update user's timezone in credentials collection
        await adminDb.collection('credentials').doc(userId).update({
            timezone: timezone,
            timezoneUpdatedAt: new Date().toISOString()
        });

        console.log(`[API /auth/timezone] Updated timezone for user ${userId} to ${timezone}`);

        return json({ success: true, timezone });
    } catch (err: any) {
        console.error('[API /auth/timezone] Error:', err);
        if (err.status) throw err;
        throw error(500, 'Failed to update timezone');
    }
};
