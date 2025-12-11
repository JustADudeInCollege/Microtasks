// API endpoint for fetching all user tasks (for AI panel)
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/firebaseAdmin';
import { Timestamp } from 'firebase-admin/firestore';

export const GET: RequestHandler = async ({ locals }) => {
    const userId = locals.userId;

    if (!userId) {
        return json({ error: 'User not authenticated' }, { status: 401 });
    }

    try {
        const tasksCollectionRef = adminDb.collection('tasks');
        const tasksQuery = tasksCollectionRef.where('userId', '==', userId);
        const snapshot = await tasksQuery.get();

        const tasks = snapshot.docs.map((doc) => {
            const data = doc.data();
            const createdAtTimestamp = data.createdAt as Timestamp | undefined;

            // Determine status
            let status: 'pending' | 'complete' | 'incomplete' | 'late' = 'pending';
            const isCompleted = data.isCompleted ?? false;

            if (isCompleted) {
                status = 'complete';
            } else if (data.dueDate) {
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                if (data.dueDate < todayStr) {
                    status = 'incomplete'; // overdue
                }
            }

            return {
                id: doc.id,
                title: data.title || 'Untitled Task',
                description: data.description || '',
                isCompleted: isCompleted,
                status: status,
                priority: data.priority || 'standard',
                createdAtISO: createdAtTimestamp?.toDate()?.toISOString() ?? null,
                dueDateISO: data.dueDate || null,
                dueTime: data.dueTime || null
            };
        });

        return json({ success: true, tasks });
    } catch (error: any) {
        console.error('[API /tasks] Error fetching tasks:', error);
        return json({ error: 'Failed to fetch tasks' }, { status: 500 });
    }
};
