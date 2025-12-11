// src/lib/server/calendarAiService.ts
// AI-powered calendar analysis and task management service

import { getChatCompletion, type ChatMessageForAPI } from './aiService';

// Types for calendar AI operations
export interface CalendarTask {
    id: string;
    title: string;
    description: string;
    dueDateISO: string | null;
    dueTime: string | null;
    priority: string | number | null;
    isCompleted: boolean;
    status: 'pending' | 'complete' | 'incomplete' | 'late';
}

export interface ScheduleSuggestion {
    suggestedDate: string;
    suggestedTime: string | null;
    reason: string;
}

export interface WorkloadAnalysis {
    overloadedDays: Array<{ date: string; taskCount: number; severity: 'warning' | 'critical' }>;
    underloadedDays: Array<{ date: string; taskCount: number }>;
    suggestions: string[];
    summary: string;
}

export interface ParsedTask {
    title: string;
    description: string;
    dueDate: string | null;
    dueTime: string | null;
    priority: string;
    confidence: number;
}

export interface DailyPlan {
    date: string;
    prioritizedTasks: Array<{
        taskId: string;
        title: string;
        suggestedTimeSlot: string;
        priority: number;
        reason: string;
    }>;
    focusTip: string;
    summary: string;
    overdueNote?: string | null;
}

export interface ConflictResult {
    hasConflicts: boolean;
    conflicts: Array<{
        taskIds: string[];
        taskTitles: string[];
        conflictType: 'same-time' | 'overlapping' | 'too-many-deadlines';
        description: string;
        suggestion: string;
    }>;
}

// Helper to format date for AI context
function formatDateForAI(dateString: string | null): string {
    if (!dateString) return 'No date set';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Helper to get current date info for AI
function getCurrentDateContext(): string {
    const now = new Date();
    return `Today is ${now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    })}. The current time is ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}.`;
}

// Interface for priority suggestions
export interface PrioritySuggestion {
    taskId: string;
    taskTitle: string;
    currentPriority: string | null;
    suggestedPriority: 'low' | 'standard' | 'high' | 'urgent';
    reason: string;
    daysUntilDue?: number; // For sorting
}

export interface PrioritySuggestionsResult {
    suggestions: PrioritySuggestion[];
    summary: string;
}

/**
 * Suggest optimal priorities for a list of tasks
 * Calculates priorities based on due date - no AI needed for reliability
 */
export async function suggestTaskPriorities(
    tasks: CalendarTask[]
): Promise<PrioritySuggestionsResult> {
    const incompleteTasks = tasks.filter(t => !t.isCompleted).slice(0, 20);

    if (incompleteTasks.length === 0) {
        return {
            suggestions: [],
            summary: 'No incomplete tasks to analyze.'
        };
    }

    // Process ALL incomplete tasks - calculate priorities ourselves for accuracy
    const today = new Date();

    const suggestions: PrioritySuggestion[] = incompleteTasks.map((task) => {
        // Calculate accurate due status ourselves
        let isOverdue = false;
        let daysUntilDue = 999; // Default for no due date
        let dueStatusText = '';

        if (task.dueDateISO) {
            // Compare dates at start of day to avoid timezone/time issues
            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const [year, month, day] = task.dueDateISO.split('-').map(Number);
            const dueDate = new Date(year, month - 1, day);

            // Calculate difference in days
            const diffMs = dueDate.getTime() - todayStart.getTime();
            daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));

            if (daysUntilDue < 0) {
                isOverdue = true;
                const daysOverdue = Math.abs(daysUntilDue);
                dueStatusText = `⚠️ OVERDUE by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} - needs immediate attention!`;
            } else if (daysUntilDue === 0) {
                dueStatusText = `Due today`;
            } else if (daysUntilDue === 1) {
                dueStatusText = `Due tomorrow`;
            } else {
                dueStatusText = `Due in ${daysUntilDue} days`;
            }
        } else {
            dueStatusText = 'No due date set';
        }

        // Calculate priority based on due date (our logic, more reliable than AI)
        let suggestedPriority: 'urgent' | 'high' | 'standard' | 'low';
        if (isOverdue) {
            suggestedPriority = 'urgent';
        } else if (daysUntilDue === 0) {
            // Due today
            suggestedPriority = 'high';
        } else if (daysUntilDue <= 2) {
            // Due tomorrow or in 2 days
            suggestedPriority = 'high';
        } else if (daysUntilDue <= 5) {
            // Due in 3-5 days
            suggestedPriority = 'standard';
        } else {
            // Due in 6+ days or no due date
            suggestedPriority = 'low';
        }

        return {
            taskId: task.id,
            taskTitle: task.title,
            currentPriority: task.priority?.toString() || null,
            suggestedPriority: suggestedPriority,
            reason: dueStatusText,
            daysUntilDue: daysUntilDue
        };
    });

    // Sort by: 1) Priority (urgent > high > standard > low), 2) Days until due (sooner first)
    const priorityOrder: Record<string, number> = { 'urgent': 0, 'high': 1, 'standard': 2, 'low': 3 };
    suggestions.sort((a, b) => {
        const orderA = priorityOrder[a.suggestedPriority] ?? 2;
        const orderB = priorityOrder[b.suggestedPriority] ?? 2;
        // First compare by priority
        if (orderA !== orderB) {
            return orderA - orderB;
        }
        // Then by days until due (sooner deadlines first)
        return (a.daysUntilDue ?? 999) - (b.daysUntilDue ?? 999);
    });
    // Generate summary based on our analysis
    const urgentCount = suggestions.filter(s => s.suggestedPriority === 'urgent').length;
    const highCount = suggestions.filter(s => s.suggestedPriority === 'high').length;
    let summaryParts: string[] = [];
    if (urgentCount > 0) summaryParts.push(`${urgentCount} overdue`);
    if (highCount > 0) summaryParts.push(`${highCount} due soon`);
    const summary = summaryParts.length > 0
        ? `${summaryParts.join(', ')} - prioritize these first!`
        : `Analyzed ${suggestions.length} tasks. No immediate deadlines.`;

    return {
        suggestions,
        summary
    };
}

/**
 * Analyze user's schedule and suggest optimal time for a new task
 */
export async function suggestOptimalSchedule(
    taskDescription: string,
    existingTasks: CalendarTask[],
    preferredDateRange?: { start: string; end: string }
): Promise<ScheduleSuggestion | null> {
    const tasksSummary = existingTasks
        .filter(t => !t.isCompleted && t.dueDateISO)
        .slice(0, 20) // Limit for context window
        .map(t => `- "${t.title}" due ${formatDateForAI(t.dueDateISO)}${t.dueTime ? ` at ${t.dueTime}` : ''} (${t.priority || 'standard'} priority)`)
        .join('\n');

    const prompt = `You are a scheduling assistant. ${getCurrentDateContext()}

The user wants to schedule: "${taskDescription}"
${preferredDateRange ? `Preferred date range: ${preferredDateRange.start} to ${preferredDateRange.end}` : ''}

Current tasks on calendar:
${tasksSummary || 'No existing tasks'}

Analyze the schedule and suggest the best date and time. Consider:
1. Avoid overloading days with many tasks
2. Prioritize tasks with closer deadlines first
3. Leave buffer time between tasks

IMPORTANT: Respond ONLY with a JSON object in this exact format, no other text:
{"suggestedDate": "YYYY-MM-DD", "suggestedTime": "HH:MM" or null, "reason": "Brief explanation"}`;

    const messages: ChatMessageForAPI[] = [
        { role: 'system', content: 'You are a helpful scheduling assistant. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
    ];

    try {
        const response = await getChatCompletion(messages, false);
        if (!response) return null;

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]) as ScheduleSuggestion;
        }
        return null;
    } catch (error) {
        console.error('[CalendarAI] Error suggesting schedule:', error);
        return null;
    }
}

/**
 * Analyze workload distribution across days
 */
export async function analyzeWorkload(
    tasks: CalendarTask[],
    dateRange: { start: string; end: string }
): Promise<WorkloadAnalysis | null> {
    // Group tasks by date
    const tasksByDate: Record<string, CalendarTask[]> = {};
    tasks.filter(t => !t.isCompleted && t.dueDateISO).forEach(task => {
        const date = task.dueDateISO!;
        if (!tasksByDate[date]) tasksByDate[date] = [];
        tasksByDate[date].push(task);
    });

    const dateBreakdown = Object.entries(tasksByDate)
        .map(([date, dateTasks]) => `${formatDateForAI(date)}: ${dateTasks.length} tasks (${dateTasks.map(t => t.title).join(', ')})`)
        .join('\n');

    const prompt = `You are a workload analysis assistant. ${getCurrentDateContext()}

Analyze the user's task distribution for the period ${dateRange.start} to ${dateRange.end}:

${dateBreakdown || 'No tasks scheduled in this period'}

Identify:
1. Days with too many tasks (5+ is heavy, 8+ is critical)
2. Days with no or few tasks (good for rescheduling)
3. Suggestions to balance the workload

IMPORTANT: Respond ONLY with a JSON object in this exact format:
{
  "overloadedDays": [{"date": "YYYY-MM-DD", "taskCount": number, "severity": "warning" or "critical"}],
  "underloadedDays": [{"date": "YYYY-MM-DD", "taskCount": number}],
  "suggestions": ["suggestion 1", "suggestion 2"],
  "summary": "Brief 1-2 sentence summary"
}`;

    const messages: ChatMessageForAPI[] = [
        { role: 'system', content: 'You are a helpful workload analysis assistant. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
    ];

    try {
        const response = await getChatCompletion(messages, false);
        if (!response) return null;

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]) as WorkloadAnalysis;
        }
        return null;
    } catch (error) {
        console.error('[CalendarAI] Error analyzing workload:', error);
        return null;
    }
}

/**
 * Parse natural language input into structured task data
 */
export async function parseNaturalLanguageTask(
    userInput: string,
    currentDate: string
): Promise<ParsedTask | null> {
    const prompt = `You are a task parsing assistant. ${getCurrentDateContext()}

Parse the following natural language task input into structured data:
"${userInput}"

Extract:
1. Task title (clear, concise)
2. Description (if additional details are provided)
3. Due date (convert relative dates like "tomorrow", "next Monday" to YYYY-MM-DD format. Interpret "later" as today's date.)
4. Due time (if mentioned, in HH:MM 24-hour format)
5. Priority (urgent/high/standard/low based on language cues)
6. Confidence (0.0-1.0 how confident you are in the parsing)

IMPORTANT: Respond ONLY with a JSON object in this exact format:
{
  "title": "Task title",
  "description": "Additional details or empty string",
  "dueDate": "YYYY-MM-DD" or null,
  "dueTime": "HH:MM" or null,
  "priority": "standard",
  "confidence": 0.9
}`;

    const messages: ChatMessageForAPI[] = [
        { role: 'system', content: 'You are a task parsing assistant. Respond only with valid JSON. Be accurate with date calculations.' },
        { role: 'user', content: prompt }
    ];

    try {
        const response = await getChatCompletion(messages, false);
        if (!response) return null;

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]) as ParsedTask;
        }
        return null;
    } catch (error) {
        console.error('[CalendarAI] Error parsing natural language task:', error);
        return null;
    }
}

/**
 * Generate a prioritized daily plan
 */
export async function generateDailyPlan(
    tasks: CalendarTask[],
    targetDate: string
): Promise<DailyPlan | null> {
    const todayTasks = tasks.filter(t => !t.isCompleted && t.dueDateISO === targetDate);
    const upcomingTasks = tasks.filter(t => !t.isCompleted && t.dueDateISO && t.dueDateISO > targetDate).slice(0, 5);
    const overdueTasks = tasks.filter(t => !t.isCompleted && t.dueDateISO && t.dueDateISO < targetDate);

    // Debug logging
    console.log(`[CalendarAI] Target date: ${targetDate}`);
    console.log(`[CalendarAI] Total tasks received: ${tasks.length}`);
    console.log(`[CalendarAI] Today tasks: ${todayTasks.length}, Overdue tasks: ${overdueTasks.length}, Upcoming: ${upcomingTasks.length}`);
    if (overdueTasks.length > 0) {
        console.log(`[CalendarAI] Overdue tasks:`, overdueTasks.map(t => ({ id: t.id, title: t.title, dueDateISO: t.dueDateISO, isCompleted: t.isCompleted })));
    }

    if (todayTasks.length === 0 && overdueTasks.length === 0) {
        return {
            date: targetDate,
            prioritizedTasks: [],
            focusTip: "You have no tasks due today! Consider working ahead on upcoming deadlines.",
            summary: "No tasks scheduled for today.",
            overdueNote: null
        };
    }

    const todayTasksInfo = todayTasks.map(t =>
        `- ID: ${t.id}, Title: "${t.title}", Time: ${t.dueTime || 'any time'}, Priority: ${t.priority || 'standard'}, Description: ${t.description?.substring(0, 100) || 'none'}`
    ).join('\n');

    const overdueTasksInfo = overdueTasks.map(t =>
        `- ID: ${t.id}, Title: "${t.title}", Was due: ${formatDateForAI(t.dueDateISO)}, Priority: ${t.priority || 'standard'}`
    ).join('\n');

    const upcomingInfo = upcomingTasks.map(t =>
        `- "${t.title}" due ${formatDateForAI(t.dueDateISO)}`
    ).join('\n');

    const prompt = `You are a daily planning assistant. ${getCurrentDateContext()}

Create a prioritized daily plan for ${formatDateForAI(targetDate)}.

Tasks due today:
${todayTasksInfo || 'None'}

${overdueTasks.length > 0 ? `OVERDUE TASKS (need urgent attention!):
${overdueTasksInfo}` : ''}

Upcoming tasks (for context):
${upcomingInfo || 'None'}

Create a plan that:
1. Orders tasks by importance (urgency + priority). Include overdue tasks at the TOP as they need immediate attention!
2. Suggests time slots for each task
3. Provides a motivating focus tip
4. Gives a brief summary
${overdueTasks.length > 0 ? '5. Include a note about the overdue tasks that need attention' : ''}

IMPORTANT: Respond ONLY with a JSON object in this exact format:
{
  "date": "${targetDate}",
  "prioritizedTasks": [
    {"taskId": "id", "title": "title", "suggestedTimeSlot": "9:00 AM - 10:00 AM", "priority": 1, "reason": "Why this order"}
  ],
  "focusTip": "Motivational tip for the day",
  "summary": "Brief summary of the day's plan"${overdueTasks.length > 0 ? ',\n  "overdueNote": "Warning message about overdue tasks"' : ''}
}`;

    const messages: ChatMessageForAPI[] = [
        { role: 'system', content: 'You are a helpful daily planning assistant. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
    ];

    try {
        const response = await getChatCompletion(messages, false);
        if (!response) return null;

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]) as DailyPlan;
            // Always set overdue note based on our accurate count (don't trust AI's response)
            if (overdueTasks.length > 0) {
                result.overdueNote = `⚠️ You have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} that need${overdueTasks.length === 1 ? 's' : ''} attention: ${overdueTasks.map(t => t.title).join(', ')}`;
            } else {
                result.overdueNote = null;
            }
            return result;
        }
        return null;
    } catch (error) {
        console.error('[CalendarAI] Error generating daily plan:', error);
        return null;
    }
}

/**
 * Detect conflicts in the calendar
 */
export async function detectConflicts(tasks: CalendarTask[]): Promise<ConflictResult> {
    const pendingTasks = tasks.filter(t => !t.isCompleted && t.dueDateISO);

    // Quick conflict detection without AI for obvious cases
    const conflicts: ConflictResult['conflicts'] = [];

    // Group by date and time
    const byDateTime: Record<string, CalendarTask[]> = {};
    pendingTasks.forEach(task => {
        const key = `${task.dueDateISO}-${task.dueTime || 'no-time'}`;
        if (!byDateTime[key]) byDateTime[key] = [];
        byDateTime[key].push(task);
    });

    // Find same-time conflicts
    Object.entries(byDateTime).forEach(([key, keyTasks]) => {
        if (keyTasks.length > 1 && key.includes(':')) { // Only if time is set
            conflicts.push({
                taskIds: keyTasks.map(t => t.id),
                taskTitles: keyTasks.map(t => t.title),
                conflictType: 'same-time',
                description: `${keyTasks.length} tasks scheduled at the same time`,
                suggestion: 'Try doing one of these tasks earlier to avoid cramming. Spreading out your work helps you stay focused!'
            });
        }
    });

    // Check for days with too many deadlines
    const byDate: Record<string, CalendarTask[]> = {};
    pendingTasks.forEach(task => {
        if (!byDate[task.dueDateISO!]) byDate[task.dueDateISO!] = [];
        byDate[task.dueDateISO!].push(task);
    });

    Object.entries(byDate).forEach(([date, dateTasks]) => {
        if (dateTasks.length >= 5) {
            conflicts.push({
                taskIds: dateTasks.map(t => t.id),
                taskTitles: dateTasks.map(t => t.title),
                conflictType: 'too-many-deadlines',
                description: `${dateTasks.length} tasks due on ${formatDateForAI(date)}`,
                suggestion: 'That\'s a lot for one day! Consider starting some tasks early or moving less urgent ones to avoid burnout.'
            });
        }
    });

    return {
        hasConflicts: conflicts.length > 0,
        conflicts
    };
}

/**
 * AI-powered chat for calendar-specific questions
 */
export async function calendarChat(
    userMessage: string,
    tasks: CalendarTask[],
    conversationHistory: ChatMessageForAPI[] = []
): Promise<string | null> {
    const tasksSummary = tasks
        .filter(t => !t.isCompleted)
        .slice(0, 15)
        .map(t => `- "${t.title}" due ${formatDateForAI(t.dueDateISO)}${t.dueTime ? ` at ${t.dueTime}` : ''}`)
        .join('\n');

    const systemPrompt = `You are Synthia, an AI calendar assistant for the Microtask productivity app. ${getCurrentDateContext()}

The user's current pending tasks:
${tasksSummary || 'No pending tasks'}

Help the user with:
- Scheduling questions
- Task prioritization
- Time management advice
- Understanding their workload

Be concise and helpful. If the user asks to create a task, suggest they use the "Add Task" feature.`;

    const messages: ChatMessageForAPI[] = [
        { role: 'system', content: systemPrompt },
        ...conversationHistory.slice(-8), // Keep last 8 messages for context
        { role: 'user', content: userMessage }
    ];

    try {
        const response = await getChatCompletion(messages, false);
        return response;
    } catch (error) {
        console.error('[CalendarAI] Error in calendar chat:', error);
        return null;
    }
}
