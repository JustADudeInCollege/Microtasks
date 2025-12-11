// API endpoint for AI-powered task operations
import type { RequestHandler } from '@sveltejs/kit';
import { json, error } from '@sveltejs/kit';
import { adminAuth } from '$lib/server/firebaseAdmin.js';
import {
    parseNaturalLanguageTask,
    suggestTaskPriority,
    suggestTaskCategory,
    breakdownTask
} from '$lib/server/aiService.js';

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

// POST /api/ai-task - Process AI task operations
export const POST: RequestHandler = async ({ request, cookies }) => {
    await verifySession(cookies);

    const body = await request.json();
    const { action, input, title, description, dueDate } = body;

    try {
        switch (action) {
            case 'parse': {
                // Parse natural language into structured task
                if (!input) {
                    throw error(400, 'Input is required for parse action');
                }
                const currentDate = new Date().toISOString().split('T')[0];
                const parsed = await parseNaturalLanguageTask(input, currentDate);
                return json({ success: true, task: parsed });
            }

            case 'suggest-priority': {
                // Suggest priority for a task
                if (!title) {
                    throw error(400, 'Title is required for priority suggestion');
                }
                const priority = await suggestTaskPriority(title, description || '', dueDate);
                return json({ success: true, priority });
            }

            case 'suggest-category': {
                // Suggest category for a task
                if (!title) {
                    throw error(400, 'Title is required for category suggestion');
                }
                const category = await suggestTaskCategory(title, description || '');
                return json({ success: true, category });
            }

            case 'breakdown': {
                // Break down a task into subtasks
                if (!title) {
                    throw error(400, 'Title is required for task breakdown');
                }
                const subtasks = await breakdownTask(title, description || '');
                return json({ success: true, subtasks });
            }

            default:
                throw error(400, `Unknown action: ${action}`);
        }
    } catch (err: any) {
        console.error('[ai-task API] Error:', err);
        if (err.status) throw err;
        throw error(500, err.message || 'AI processing failed');
    }
};
