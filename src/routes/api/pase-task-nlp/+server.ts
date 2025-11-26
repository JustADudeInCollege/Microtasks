// src/routes/api/parse-task-nlp/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
    const { description } = await request.json();

    // --- SIMULATED AI PROCESSING ---
    // In a real application, you would call an AI service here with the 'description'.
    // For now, we'll simulate the response based on keywords.

    let suggestedTitle = 'AI Suggested Title';
    let formattedDescription = `Original: ${description}\n\nAI Processed:\n- [ ] Checkpoint 1 based on description\n- [ ] Checkpoint 2 related to '${description.substring(0, 10)}...'`;
    let suggestedDueDate = '';
    let suggestedDueTime = '';
    let suggestedPriority = 'standard';
    let suggestedTags = ['ai-suggested'];

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const pad = (num: number) => String(num).padStart(2, '0');
    const formatDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

    if (description.toLowerCase().includes('tomorrow')) {
        suggestedDueDate = formatDate(tomorrow);
        suggestedDueTime = '09:00';
        suggestedTitle = `Task for tomorrow: ${description.substring(0,20)}...`;
    } else if (description.toLowerCase().includes('next week')) {
        suggestedDueDate = formatDate(nextWeek);
        suggestedTitle = `Task for next week: ${description.substring(0,20)}...`;
    }

    if (description.toLowerCase().includes('urgent') || description.toLowerCase().includes('high priority')) {
        suggestedPriority = 'high';
        suggestedTags.push('urgent');
    } else if (description.toLowerCase().includes('low priority')) {
        suggestedPriority = 'low';
    }

    if (description.toLowerCase().includes('work')) {
        suggestedTags.push('work');
    }
    if (description.toLowerCase().includes('personal')) {
        suggestedTags.push('personal');
    }
    if (description.length > 50) {
        formattedDescription = `Summary of '${description.substring(0, 20)}...':\n- [ ] Key action 1\n- [ ] Review point 2\n- [ ] Final step`;
        if (!suggestedTitle.startsWith('Task for')) {
            suggestedTitle = `Detailed Task: ${description.substring(0, 20)}...`
        }
    }

    // Simulate checklist items more directly if "checklist" or "steps" is mentioned
    if (description.toLowerCase().includes('checklist') || description.toLowerCase().includes('steps')) {
        const items = description.split('\n').filter(line => line.trim().match(/^(\d+\.|-|\*)\s/));
        if (items.length > 0) {
            formattedDescription = "Here's a checklist based on your input:\n";
            items.forEach(item => {
                formattedDescription += `- [ ] ${(item as string).replace(/^(\d+\.|-|\*)\s/, '').trim()}\n`;
            });
            if (!suggestedTitle.startsWith('Task for')) {
                 suggestedTitle = `Checklist: ${description.substring(0,20)}...`
            }
        } else {
            formattedDescription = `Your request for a checklist for '${description.substring(0,20)}...':\n- [ ] Action Item 1\n- [ ] Action Item 2\n- [ ] Action Item 3`;
        }
    }


    return json({
        success: true,
        data: {
            suggestedTitle,
            formattedDescription,
            suggestedDueDate,
            suggestedDueTime,
            suggestedPriority,
            suggestedTags: suggestedTags.join(', ') // Return as comma-separated string for the input field
        }
    });
};