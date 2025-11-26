// src/lib/server/aiService.ts
import { OPENROUTER_API_KEY } from '$env/static/private';
// Ensure 'export' is present
export async function getOpenRouterCompletion(prompt) {
    try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'Referer': 'https://your-app-domain.com', // User should update this to their actual domain
                'X-Title': 'Microtask AI Task Generation'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-4-scout:free',
                messages: [{ role: 'user', content: prompt }]
            })
        });
        if (!res.ok) {
            const errorText = await res.text();
            console.error('OpenRouter API error response:', {
                status: res.status,
                statusText: res.statusText,
                body: errorText,
                promptSentLength: prompt.length
            });
            return null;
        }
        const data = await res.json();
        return data.choices?.[0]?.message?.content ?? null;
    }
    catch (err) {
        console.error('OpenRouter request failed during fetch:', err);
        return null;
    }
}
// Ensure 'export' is present
export async function generateEntirePlanWithAI(workspaceName, templateTitle, templateGoal, originalStepsWithUserInput, generalProjectNotes) {
    const formattedOriginalSteps = originalStepsWithUserInput.map((step, i) => `${i + 1}. Original Step: "${step.text}" ${step.userInput ? `(User's input for this: "${step.userInput}")` : '(No specific user input for this original step.)'}`).join('\n');
    const initialSeedTopic = originalStepsWithUserInput.find(step => step.userInput)?.userInput || originalStepsWithUserInput[0]?.text || "the general theme";
    const isSkillLearning = templateGoal.toLowerCase().includes("learn") ||
        templateGoal.toLowerCase().includes("fluent") ||
        templateGoal.toLowerCase().includes("skill") ||
        templateGoal.toLowerCase().includes("master") ||
        (initialSeedTopic && (initialSeedTopic.toLowerCase().includes("language") ||
            initialSeedTopic.toLowerCase().includes("speak") ||
            initialSeedTopic.toLowerCase().includes("learn") ||
            initialSeedTopic.toLowerCase().includes("study")));
    let specificInstructionsForAI = "";
    if (isSkillLearning) {
        specificInstructionsForAI = `
Given the user wants to learn/improve "${initialSeedTopic}" (e.g., "Japanese language") and the overall goal is "${templateGoal}" (e.g., "Become fluent in Japanese"), generate tasks that form a structured, beginner-friendly learning path.
The tasks should start with very foundational, specific, and actionable elements, and then progressively increase in difficulty and scope, building upon previous tasks.
The initial tasks MUST be concrete actions a beginner can take. For example, if learning Japanese:
    - Task 1 Title: "Master Hiragana: The Foundational Script"
      Description: "Learn all Hiragana characters. Utilize apps like Duolingo or Memrise, alongside online charts. Practice writing each character multiple times. Understanding Hiragana is essential for reading and writing basic Japanese."
    - Task 2 Title: "Learn Katakana: For Loanwords and Emphasis"
      Description: "After Hiragana, learn all Katakana characters. Use similar methods: apps, charts, and writing practice. Katakana is crucial for reading foreign loanwords and for emphasis."

Subsequent tasks should then build on these, incorporating elements from the original template steps (like "Allocate study hours", "Schedule practice tests") by making them specific to the learning journey. For example:
    - If an original step is "Allocate study hours", a generated task could be: "Design Your Weekly ${initialSeedTopic} Study Schedule", with a description prompting the user to block out specific times for focused grammar, vocabulary, listening practice, etc.
    - If an original step is "Schedule practice tests", a generated task could be: "Identify and Prepare for a Beginner ${initialSeedTopic} Level Check (e.g., research JLPT N5 sample tests and requirements)".

Titles MUST be imperative and engaging.
Descriptions MUST be detailed, imperative, explain *how* to do the task (suggesting specific actions, methods, or resources where appropriate), *why* it's important for their goal of "${templateGoal}", and **must NOT include specific time durations like 'for X days', 'daily', or 'for a week'**. The system will handle scheduling.
Do not generate tasks like "Define milestones" or "Break down your goal"; instead, *provide* those initial broken-down tasks.
The **final task in the sequence must be a culminating activity or practical application of the learned skill**, providing a sense of accomplishment and clear progression from the start, not generic advice.
`;
    }
    else {
        specificInstructionsForAI = `
The tasks should flesh out the original template steps into actionable items that are progressive.
If an original step has user input, the generated task(s) for that part of the plan should heavily incorporate or be based on that input, making them specific.
The tasks should progress logically, with each task building towards the overall goal.
Make task titles action-oriented and imperative.
Descriptions should be clear, imperative, explain the 'what' and 'why' of the task, and **must NOT include specific time durations like 'for X days', 'daily', or 'for a week'**. The system will handle scheduling.
For example, if an original step is "Define project scope" and user input is "New mobile app for event discovery", a task could be:
    - Title: "Draft the Core Feature List for EventDiscovery App"
      Description: "List all essential features the mobile app must have for users to discover events. Consider user stories like searching, filtering by date/location, viewing event details, and saving events. This will form the basis of the project scope."
The **final task must represent a key deliverable, a point of application, or a clear conclusion for this specific plan**, not generic advice.
`;
    }
    let detailedPrompt = `
You are an expert project planner and curriculum designer AI. Your goal is to help a user create a detailed set of actionable tasks for a new workspace in a productivity app called Microtask.

Workspace Name: "${workspaceName}"
Based on Template: "${templateTitle}"
Overall Goal of this Plan: "${templateGoal}"
General Notes from User for the Entire Plan: "${generalProjectNotes || 'None provided'}"

The original template provides the following structural steps as a guideline, some with initial user input from the user who wants to achieve the overall goal:
${formattedOriginalSteps}

Your main task is to expand on these original steps, using the initial user input (especially for the first prompted step, currently focused on "${initialSeedTopic}") as the central theme or starting point.
Generate a sequence of approximately ${originalStepsWithUserInput.length} to ${Math.max(originalStepsWithUserInput.length, originalStepsWithUserInput.length + 3)} tasks that cover the original template's structure.
These tasks **must be progressive**, meaning each task should logically build upon the previous one, increasing in complexity or scope, and leading towards the overall goal.
The **final task must be a meaningful concluding action or deliverable for THIS specific plan**, not generic advice like "review progress" or "set new goals". It should feel like a natural culmination of the preceding tasks.
If the initial user input is a list of items (e.g., "Math, Physics, History"), try to generate a few introductory tasks for each item before moving to tasks that correspond to later original template steps.

${specificInstructionsForAI}

For each generated task, provide:
1.  A "title" (string): Concise, action-oriented (ideally under 15 words).
2.  A "description" (string): Detailed, imperative, explains what to do, why it's important, and suggests methods/resources if applicable. **Crucially, the description itself must NOT contain specific time durations like 'for X days', 'spend X hours daily', 'for a week', etc.** The user will manage scheduling separately based on start/end dates provided to the system.

IMPORTANT: Your entire response MUST be a single, well-formed JSON array of objects. Each object in the array must have exactly two keys: "title", and "description". Do not include any other text, explanations, comments, or markdown formatting (like \`\`\`json) outside of this JSON array. Just the raw JSON array itself.

Example of the required JSON structure for one task:
{
  "title": "Example Task Title",
  "description": "Example detailed imperative description for the task, without mentioning specific day counts or daily routines."
}

Full response example (ensure the final task is conclusive and not generic):
[
  {"title": "Grasp the Basics: What is Quantum Entanglement?", "description": "Start by researching the fundamental definition and core principles of quantum entanglement. Focus on understanding it at a conceptual level to achieve the goal: ${templateGoal}."},
  {"title": "Historical Context & Key Experiments of Entanglement", "description": "Explore the history of quantum entanglement, including Einstein's 'spooky action' and key experiments that demonstrated the phenomenon. This builds upon your foundational understanding."},
  {"title": "Apply Entanglement Concepts: Solve a Primer Problem", "description": "Find a beginner-level problem or case study involving quantum entanglement and work through its solution, applying the principles learned. Document your approach and understanding."}
]
  `;
    detailedPrompt = detailedPrompt.replace(/\s+/g, ' ').trim();
    console.log("-----------------------------------------------------");
    console.log("AI PROMPT SENT FOR ENTIRE PLAN GENERATION (REFINED FOR SPECIFICITY & NO DURATIONS):");
    console.log("Workspace:", workspaceName, "| Template:", templateTitle, "| Goal:", templateGoal);
    console.log("Initial Seed Topic Guessed:", initialSeedTopic, "| Is Skill Learning Detected:", isSkillLearning);
    console.log("Prompt Length:", detailedPrompt.length);
    console.log("-----------------------------------------------------");
    const aiResponseString = await getOpenRouterCompletion(detailedPrompt);
    console.log("-----------------------------------------------------");
    console.log("RAW AI RESPONSE RECEIVED FOR ENTIRE PLAN:");
    console.log(aiResponseString);
    console.log("-----------------------------------------------------");
    const fallbackTasks = originalStepsWithUserInput.map(step => ({
        title: `Task (AI Fallback): ${step.text}${step.userInput ? ` (Details: ${step.userInput.substring(0, 40)}...)` : ''}`,
        description: `(AI processing issue for plan) Please manually complete the objectives for: "${step.text}". Consider the overall goal: "${templateGoal}" and any general notes: "${generalProjectNotes || 'N/A'}". ${step.userInput ? `Your input for this part was: "${step.userInput}"` : ''}`
    }));
    if (!aiResponseString) {
        console.warn(`AI returned null for entire plan (Workspace: "${workspaceName}"). Falling back to basic tasks based on original steps.`);
        return fallbackTasks;
    }
    try {
        const jsonMatch = aiResponseString.match(/(\[[\s\S]*?\])/);
        if (jsonMatch && jsonMatch[0]) {
            const cleanedJsonString = jsonMatch[0];
            console.log("-----------------------------------------------------");
            console.log("CLEANED JSON STRING (extracted by regex):");
            console.log(cleanedJsonString);
            console.log("-----------------------------------------------------");
            const parsedTasks = JSON.parse(cleanedJsonString);
            if (Array.isArray(parsedTasks) && parsedTasks.length > 0 &&
                parsedTasks.every(task => typeof task.title === 'string' &&
                    typeof task.description === 'string')) {
                console.log(`Successfully parsed ${parsedTasks.length} tasks from AI for entire plan.`);
                return parsedTasks.map(task => ({
                    title: String(task.title),
                    description: String(task.description)
                }));
            }
            else {
                console.warn(`Parsed JSON for entire plan not valid/empty array of tasks. Parsed:`, parsedTasks, "Original AI String:", aiResponseString);
            }
        }
        console.warn(`AI response for entire plan not valid JSON array after extraction. Fallback. Raw: ${aiResponseString}`);
        return fallbackTasks;
    }
    catch (e) {
        console.error(`Error parsing AI JSON response for entire plan:`, e, "\nAI Response String:", aiResponseString);
        return fallbackTasks;
    }
}
