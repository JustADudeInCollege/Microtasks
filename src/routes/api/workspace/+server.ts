// API endpoint for workspace creation
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export const POST: RequestHandler = async ({ request, locals }) => {
    const userId = locals.userId;

    if (!userId) {
        return json({ success: false, error: 'User not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const title = body.title?.trim();

        if (!title) {
            return json({ success: false, error: 'Workspace title is required' }, { status: 400 });
        }

        if (title.length > 100) {
            return json({ success: false, error: 'Workspace title is too long (max 100 chars)' }, { status: 400 });
        }

        // Create the workspace
        const newWorkspaceRef = await adminDb.collection('workspaces').add({
            userId,
            title,
            createdAt: FieldValue.serverTimestamp()
        });

        return json({
            success: true,
            workspaceId: newWorkspaceRef.id,
            message: 'Workspace created successfully'
        });
    } catch (error: any) {
        console.error('[API /workspace POST] Error creating workspace:', error);
        return json({ success: false, error: 'Failed to create workspace' }, { status: 500 });
    }
};
