// src/routes/api/calendar-ai/+server.ts
// API endpoint for calendar AI operations

import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import {
    suggestOptimalSchedule,
    analyzeWorkload,
    parseNaturalLanguageTask,
    generateDailyPlan,
    detectConflicts,
    calendarChat,
    suggestTaskPriorities,
    type CalendarTask
} from '$lib/server/calendarAiService';
import { breakdownTask } from '$lib/server/aiService';

export const POST: RequestHandler = async ({ request, locals }) => {
    // Check authentication
    const userId = locals.userId;
    if (!userId) {
        return json({ error: 'User not authenticated' }, { status: 401 });
    }

    try {
        const body = await request.json();
        const { action, payload } = body;

        if (!action) {
            return json({ error: 'Action is required' }, { status: 400 });
        }

        console.log(`[Calendar AI API] Action: ${action}, User: ${userId}`);

        switch (action) {
            case 'suggest-schedule': {
                const { taskDescription, existingTasks, preferredDateRange } = payload || {};
                if (!taskDescription) {
                    return json({ error: 'taskDescription is required' }, { status: 400 });
                }
                const result = await suggestOptimalSchedule(
                    taskDescription,
                    existingTasks || [],
                    preferredDateRange
                );
                return json({ success: true, data: result });
            }

            case 'analyze-workload': {
                const { tasks, dateRange } = payload || {};
                if (!dateRange?.start || !dateRange?.end) {
                    return json({ error: 'dateRange with start and end is required' }, { status: 400 });
                }
                const result = await analyzeWorkload(tasks || [], dateRange);
                return json({ success: true, data: result });
            }

            case 'parse-task': {
                const { userInput, currentDate } = payload || {};
                if (!userInput) {
                    return json({ error: 'userInput is required' }, { status: 400 });
                }
                const result = await parseNaturalLanguageTask(
                    userInput,
                    currentDate || new Date().toISOString().split('T')[0]
                );
                return json({ success: true, data: result });
            }

            case 'daily-plan': {
                const { tasks, targetDate } = payload || {};
                if (!targetDate) {
                    return json({ error: 'targetDate is required' }, { status: 400 });
                }
                const result = await generateDailyPlan(tasks || [], targetDate);
                return json({ success: true, data: result });
            }

            case 'detect-conflicts': {
                const { tasks } = payload || {};
                const result = await detectConflicts(tasks || []);
                return json({ success: true, data: result });
            }

            case 'chat': {
                const { message, tasks, conversationHistory } = payload || {};
                if (!message) {
                    return json({ error: 'message is required' }, { status: 400 });
                }
                const result = await calendarChat(message, tasks || [], conversationHistory || []);
                if (!result) {
                    return json({
                        success: false,
                        error: 'Failed to get AI response',
                        data: { reply: "I couldn't process your request. Please try again." }
                    });
                }
                return json({ success: true, data: { reply: result } });
            }

            case 'suggest-priorities': {
                const { tasks } = payload || {};
                const result = await suggestTaskPriorities(tasks || []);
                return json({ success: true, data: result });
            }

            case 'breakdown-task': {
                const { title, description } = payload || {};
                if (!title) {
                    return json({ error: 'title is required' }, { status: 400 });
                }
                const subtasks = await breakdownTask(title, description || '');
                return json({ success: true, data: { subtasks } });
            }

            default:
                return json({
                    error: `Unknown action: ${action}. Valid actions: suggest-schedule, analyze-workload, parse-task, daily-plan, detect-conflicts, chat, suggest-priorities, breakdown-task`
                }, { status: 400 });
        }
    } catch (error: any) {
        console.error('[Calendar AI API] Error:', error);

        // Check for rate limit error
        if (error.message?.startsWith('RATE_LIMITED')) {
            const waitTime = error.message.split(':')[1] || 'a minute';
            return json({
                success: false,
                error: `AI is rate limited. Please wait ${waitTime} and try again.`
            }, { status: 429 });
        }

        return json({
            success: false,
            error: error.message || 'Internal server error'
        }, { status: 500 });
    }
};
