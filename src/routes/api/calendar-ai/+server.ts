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
    predictOverdueRisk,
    suggestSmartReminders,
    analyzeProgressInsights,
    type CalendarTask
} from '$lib/server/calendarAiService';
import { breakdownTask, getChatCompletion } from '$lib/server/aiService';

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

            case 'predict-overdue': {
                const { tasks } = payload || {};
                const result = await predictOverdueRisk(tasks || []);
                return json({ success: true, data: result });
            }

            case 'smart-reminders': {
                const { tasks } = payload || {};
                const result = await suggestSmartReminders(tasks || []);
                return json({ success: true, data: result });
            }

            case 'progress-insights': {
                const { tasks } = payload || {};
                const result = await analyzeProgressInsights(tasks || []);
                return json({ success: true, data: result });
            }

            case 'quick-tip': {
                // Direct AI call for a brief actionable tip
                const { tasks, context } = body;
                if (!tasks || tasks.length === 0) {
                    return json({ success: true, tip: "Add some tasks to get personalized insights!" });
                }

                // Build a simple prompt for a quick tip
                const taskList = tasks.slice(0, 5).map((t: any) =>
                    `- ${t.title}${t.isOverdue ? ' (OVERDUE)' : ''}${t.priority === 'urgent' ? ' [URGENT]' : t.priority === 'high' ? ' [HIGH]' : ''}`
                ).join('\n');

                try {
                    const tip = await getChatCompletion([
                        {
                            role: 'system',
                            content: 'You are a productivity assistant. Give ONE brief, actionable tip (max 15 words) about which task to focus on first and why. Be direct and helpful. No fluff.'
                        },
                        {
                            role: 'user',
                            content: `My tasks:\n${taskList}\n\nTask breakdown: ${context || 'unknown'}\n\nWhat should I do first?`
                        }
                    ]);
                    return json({ success: true, tip: tip || "Focus on your most urgent task first." });
                } catch (e) {
                    return json({ success: true, tip: "Start with overdue tasks, then high priority ones." });
                }
            }

            case 'rank-tasks': {
                // AI ranks tasks by difficulty - quick wins first for momentum
                const { tasks, context } = body;
                if (!tasks || tasks.length === 0) {
                    return json({ success: true, ranking: [], tip: "Add tasks to get AI recommendations!" });
                }

                const taskListForRanking = tasks.map((t: any, i: number) =>
                    `${i + 1}. [ID:${t.id}] ${t.title} (${t.group})`
                ).join('\n');

                try {
                    const response = await getChatCompletion([
                        {
                            role: 'system',
                            content: `You are a productivity coach. Analyze these tasks and rank them for optimal accomplishment.
Order them: easiest/quickest tasks first (for momentum), then harder ones.
Consider: task complexity from title, effort required, mental energy needed.

Respond in EXACTLY this JSON format, nothing else:
{"ranking": ["id1", "id2", ...], "tip": "Brief advice (15 words max)"}`
                        },
                        {
                            role: 'user',
                            content: `Rank these tasks by difficulty (easiest first):\n${taskListForRanking}\n\nContext: ${context}`
                        }
                    ]);

                    // Parse AI response
                    try {
                        const parsed = JSON.parse(response || '{}');
                        return json({
                            success: true,
                            ranking: parsed.ranking || [],
                            tip: parsed.tip || "Start with quick wins to build momentum!"
                        });
                    } catch {
                        // AI didn't return valid JSON, return default
                        return json({
                            success: true,
                            ranking: tasks.map((t: any) => t.id),
                            tip: "Start with quick wins to build momentum!"
                        });
                    }
                } catch (e) {
                    return json({
                        success: true,
                        ranking: tasks.map((t: any) => t.id),
                        tip: "Start with your most manageable task first."
                    });
                }
            }

            default:
                return json({
                    error: `Unknown action: ${action}. Valid actions: suggest-schedule, analyze-workload, parse-task, daily-plan, detect-conflicts, chat, suggest-priorities, breakdown-task, predict-overdue, smart-reminders, progress-insights`
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
