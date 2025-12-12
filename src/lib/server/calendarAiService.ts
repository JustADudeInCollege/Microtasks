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
        conflictType: 'same-time' | 'overlapping' | 'too-many-deadlines' | 'overdue';
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

    // Define today's date for comparisons
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    Object.entries(byDate).forEach(([date, dateTasks]) => {
        // Parse the date to compare with today
        const [year, month, day] = date.split('-').map(Number);
        const taskDate = new Date(year, month - 1, day);
        const isPastDate = taskDate < todayStart;

        // Only show "too many deadlines" for today or future dates
        // Past dates will be handled by overdue detection
        if (dateTasks.length >= 5 && !isPastDate) {
            conflicts.push({
                taskIds: dateTasks.map(t => t.id),
                taskTitles: dateTasks.map(t => t.title),
                conflictType: 'too-many-deadlines',
                description: `${dateTasks.length} tasks due on ${formatDateForAI(date)}`,
                suggestion: 'That\'s a lot for one day! Consider starting some tasks early or moving less urgent ones to avoid burnout.'
            });
        }
    });

    // Check for overdue tasks

    const overdueTasks = pendingTasks.filter(task => {
        if (!task.dueDateISO) return false;
        const [year, month, day] = task.dueDateISO.split('-').map(Number);
        const dueDate = new Date(year, month - 1, day);
        return dueDate < todayStart;
    });

    if (overdueTasks.length > 0) {
        // Group overdue tasks by how many days overdue
        const daysOverdue = (task: CalendarTask) => {
            const [year, month, day] = task.dueDateISO!.split('-').map(Number);
            const dueDate = new Date(year, month - 1, day);
            return Math.floor((todayStart.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        };

        const sorted = [...overdueTasks].sort((a, b) => daysOverdue(b) - daysOverdue(a));
        const mostOverdue = daysOverdue(sorted[0]);

        conflicts.push({
            taskIds: overdueTasks.map(t => t.id),
            taskTitles: overdueTasks.map(t => t.title),
            conflictType: 'overdue',
            description: `⚠️ ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} (up to ${mostOverdue} day${mostOverdue > 1 ? 's' : ''} late)`,
            suggestion: 'These tasks have passed their due date. Consider completing them immediately, rescheduling to realistic dates, or breaking them into smaller steps.'
        });
    }

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

/**
 * Suggest categories/tags for multiple tasks
 */
export interface CategorySuggestion {
    taskId: string;
    taskTitle: string;
    suggestedCategory: string;
    suggestedTags: string[];
    reason: string;
}

export interface CategoryAnalysis {
    suggestions: CategorySuggestion[];
    summary: string;
}

export async function suggestTaskCategories(
    tasks: CalendarTask[]
): Promise<CategoryAnalysis | null> {
    const uncategorizedTasks = tasks.filter(t => !t.isCompleted).slice(0, 15);

    if (uncategorizedTasks.length === 0) {
        return {
            suggestions: [],
            summary: 'No tasks to categorize.'
        };
    }

    const tasksList = uncategorizedTasks
        .map((t, i) => `${i + 1}. ID: "${t.id}" | Title: "${t.title}" | Description: "${t.description || 'N/A'}"`)
        .join('\n');

    const prompt = `Analyze these tasks and suggest categories and tags for each.

Available Categories: Work, Personal, Health, Study, Shopping, Finance, Home, Social, Travel, Creative, Admin, Other

Tasks to categorize:
${tasksList}

For each task, provide:
1. The best matching category
2. 1-3 relevant tags (short, lowercase, specific)
3. Brief reason for the categorization

Respond with JSON only:
{
    "suggestions": [
        {
            "taskId": "task-id-here",
            "taskTitle": "task title here",
            "suggestedCategory": "Category",
            "suggestedTags": ["tag1", "tag2"],
            "reason": "Short reason"
        }
    ],
    "summary": "Brief overview of the categorization"
}`;

    const messages: ChatMessageForAPI[] = [
        { role: 'system', content: 'You are a helpful task categorization assistant. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
    ];

    try {
        const response = await getChatCompletion(messages, false);
        if (!response) return null;

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]) as CategoryAnalysis;
        }
        return null;
    } catch (error) {
        console.error('[CalendarAI] Error suggesting categories:', error);
        return null;
    }
}

/**
 * Predict which tasks are at risk of becoming overdue
 */
export interface OverdueRiskResult {
    atRiskTasks: Array<{
        taskId: string;
        taskTitle: string;
        dueDate: string;
        riskLevel: 'low' | 'medium' | 'high' | 'critical';
        riskScore: number; // 0-100
        reason: string;
        suggestion: string;
    }>;
    summary: string;
    overallRisk: 'low' | 'medium' | 'high';
}

export async function predictOverdueRisk(
    tasks: CalendarTask[]
): Promise<OverdueRiskResult | null> {
    const pendingTasks = tasks.filter(t => !t.isCompleted && t.dueDateISO).slice(0, 15);

    if (pendingTasks.length === 0) {
        return {
            atRiskTasks: [],
            summary: 'No pending tasks with due dates to analyze.',
            overallRisk: 'low'
        };
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Build task list with context
    const tasksList = pendingTasks.map((t, i) => {
        const daysUntilDue = t.dueDateISO
            ? Math.ceil((new Date(t.dueDateISO).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            : 0;
        const isOverdue = daysUntilDue < 0;

        return `${i + 1}. "${t.title}" | Due: ${t.dueDateISO} (${isOverdue ? `${Math.abs(daysUntilDue)} days overdue` : `${daysUntilDue} days left`}) | Priority: ${t.priority || 'standard'}`;
    }).join('\n');

    const prompt = `Analyze these pending tasks and predict which are at risk of becoming overdue. Consider:
- Time until deadline
- Task complexity (inferred from title/description)
- Priority level
- Number of concurrent tasks

Today's date: ${todayStr}

Tasks:
${tasksList}

For each task, assess the overdue risk. Respond with JSON only:
{
    "atRiskTasks": [
        {
            "taskId": "task-id-here",
            "taskTitle": "task title",
            "dueDate": "YYYY-MM-DD",
            "riskLevel": "low|medium|high|critical",
            "riskScore": 0-100,
            "reason": "Why this task is at risk",
            "suggestion": "What to do about it"
        }
    ],
    "summary": "Brief overview of the risk situation",
    "overallRisk": "low|medium|high"
}

Focus on tasks that are truly at risk (medium, high, critical). Don't list low-risk tasks unless there's something notable.`;

    const messages: ChatMessageForAPI[] = [
        { role: 'system', content: 'You are a productivity analyst. Predict task overdue risks based on deadlines and context. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
    ];

    try {
        const response = await getChatCompletion(messages, false);
        if (!response) return null;

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]) as OverdueRiskResult;

            // Ensure taskIds match actual tasks
            result.atRiskTasks = result.atRiskTasks.map(risk => {
                const matchedTask = pendingTasks.find(t =>
                    t.title.toLowerCase().includes(risk.taskTitle.toLowerCase().substring(0, 20)) ||
                    risk.taskTitle.toLowerCase().includes(t.title.toLowerCase().substring(0, 20))
                );
                if (matchedTask) {
                    risk.taskId = matchedTask.id;
                }
                return risk;
            });

            return result;
        }
        return null;
    } catch (error) {
        console.error('[CalendarAI] Error predicting overdue risk:', error);
        return null;
    }
}

/**
 * Suggest smart reminders based on task patterns and deadlines
 */
export interface SmartReminderResult {
    reminders: Array<{
        taskId: string;
        taskTitle: string;
        dueDate: string;
        suggestedReminderTime: string; // e.g., "2 hours before", "1 day before", "Tomorrow at 9am"
        reminderReason: string;
        urgency: 'low' | 'medium' | 'high';
    }>;
    summary: string;
    productivityTip: string;
}

export async function suggestSmartReminders(
    tasks: CalendarTask[]
): Promise<SmartReminderResult | null> {
    const pendingTasks = tasks.filter(t => !t.isCompleted && t.dueDateISO).slice(0, 12);

    if (pendingTasks.length === 0) {
        return {
            reminders: [],
            summary: 'No pending tasks to set reminders for.',
            productivityTip: 'Great job staying on top of things!'
        };
    }

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentHour = today.getHours();

    // Build task context
    const tasksList = pendingTasks.map((t, i) => {
        const daysUntilDue = t.dueDateISO
            ? Math.ceil((new Date(t.dueDateISO).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

        return `${i + 1}. "${t.title}" | Due: ${t.dueDateISO}${t.dueTime ? ` at ${t.dueTime}` : ''} | (${daysUntilDue} days left) | Priority: ${t.priority || 'standard'}`;
    }).join('\n');

    const prompt = `You are a productivity assistant. Suggest optimal reminder times for these tasks.

Current date/time: ${todayStr}, ${currentHour}:00
User's tasks:
${tasksList}

For each task, suggest when to set a reminder based on:
- Task urgency and deadline proximity
- Best times for focus (morning for important work, afternoon for routine)
- Give buffer time before deadlines
- Consider task complexity (inferred from title)

Respond with JSON only:
{
    "reminders": [
        {
            "taskId": "will-be-matched",
            "taskTitle": "task title",
            "dueDate": "YYYY-MM-DD",
            "suggestedReminderTime": "e.g., Tomorrow at 9am, In 2 hours, 1 day before deadline",
            "reminderReason": "Brief explanation",
            "urgency": "low|medium|high"
        }
    ],
    "summary": "Overall recommendation summary",
    "productivityTip": "One actionable productivity tip based on their task list"
}`;

    const messages: ChatMessageForAPI[] = [
        { role: 'system', content: 'You are a productivity coach. Suggest smart reminder times. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
    ];

    try {
        const response = await getChatCompletion(messages, false);
        if (!response) return null;

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]) as SmartReminderResult;

            // Match taskIds to actual tasks
            result.reminders = result.reminders.map(reminder => {
                const matchedTask = pendingTasks.find(t =>
                    t.title.toLowerCase().includes(reminder.taskTitle.toLowerCase().substring(0, 20)) ||
                    reminder.taskTitle.toLowerCase().includes(t.title.toLowerCase().substring(0, 20))
                );
                if (matchedTask) {
                    reminder.taskId = matchedTask.id;
                }
                return reminder;
            });

            return result;
        }
        return null;
    } catch (error) {
        console.error('[CalendarAI] Error suggesting smart reminders:', error);
        return null;
    }
}

/**
 * Analyze progress and provide productivity insights
 */
export interface ProgressInsightsResult {
    stats: {
        totalTasks: number;
        completedTasks: number;
        pendingTasks: number;
        overdueTasks: number;
        completionRate: number; // percentage
    };
    insights: Array<{
        type: 'achievement' | 'warning' | 'tip' | 'pattern';
        icon: string;
        title: string;
        description: string;
    }>;
    weeklyTrend: 'improving' | 'stable' | 'declining';
    motivationalMessage: string;
    topPriorityAction: string;
}

export async function analyzeProgressInsights(
    tasks: CalendarTask[]
): Promise<ProgressInsightsResult | null> {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Calculate stats
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.isCompleted).length;
    const pendingTasks = tasks.filter(t => !t.isCompleted).length;
    const overdueTasks = tasks.filter(t =>
        !t.isCompleted && t.dueDateISO && new Date(t.dueDateISO) < today
    ).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Build context for AI analysis
    const taskSummary = `
Total tasks: ${totalTasks}
Completed: ${completedTasks} (${completionRate}%)
Pending: ${pendingTasks}
Overdue: ${overdueTasks}

Recent tasks:
${tasks.slice(0, 10).map((t, i) =>
        `${i + 1}. "${t.title}" - ${t.isCompleted ? '✅ Complete' : t.dueDateISO && new Date(t.dueDateISO) < today ? '⚠️ Overdue' : '⏳ Pending'} | Due: ${t.dueDateISO || 'No date'} | Priority: ${t.priority || 'standard'}`
    ).join('\n')}`;

    const prompt = `Analyze this user's task progress and provide personalized productivity insights.

Today's date: ${todayStr}
${taskSummary}

Provide insights based on their patterns. Respond with JSON only:
{
    "insights": [
        {
            "type": "achievement|warning|tip|pattern",
            "icon": "emoji for this insight",
            "title": "Short title",
            "description": "Detailed insight (1-2 sentences)"
        }
    ],
    "weeklyTrend": "improving|stable|declining",
    "motivationalMessage": "Personalized encouraging message based on their progress",
    "topPriorityAction": "The single most important thing they should do next"
}

Include 3-5 insights covering:
- Achievements (if completion rate is good)
- Warnings (if there are overdue tasks or declining patterns)
- Tips (actionable productivity advice)
- Patterns (observed habits, peak productivity times if inferable)

IMPORTANT: Keep suggestions simple and immediately actionable. Do NOT suggest complex productivity methodologies like Eisenhower Matrix, Pomodoro Technique, GTD, time-blocking frameworks, or similar laborious systems. Focus on quick, practical tips the user can apply right now.`;

    const messages: ChatMessageForAPI[] = [
        { role: 'system', content: 'You are an encouraging productivity coach. Analyze task patterns and provide helpful, personalized insights. Be positive but honest. Keep advice simple and quick to implement - avoid suggesting complex methodologies. Respond only with valid JSON.' },
        { role: 'user', content: prompt }
    ];

    try {
        const response = await getChatCompletion(messages, false);
        if (!response) return null;

        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const aiResult = JSON.parse(jsonMatch[0]);

            return {
                stats: {
                    totalTasks,
                    completedTasks,
                    pendingTasks,
                    overdueTasks,
                    completionRate
                },
                insights: aiResult.insights || [],
                weeklyTrend: aiResult.weeklyTrend || 'stable',
                motivationalMessage: aiResult.motivationalMessage || 'Keep up the great work!',
                topPriorityAction: aiResult.topPriorityAction || 'Focus on your highest priority task.'
            };
        }
        return null;
    } catch (error) {
        console.error('[CalendarAI] Error analyzing progress insights:', error);
        return null;
    }
}
