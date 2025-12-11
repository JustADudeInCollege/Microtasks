// src/lib/server/aiService.ts

import { GROQ_API_KEY } from '$env/static/private';

// Updated AiGeneratedTask interface
export interface AiGeneratedTask {
  title: string;
  description: string;
}

export interface OriginalTemplateStep {
  text: string;
  userInput?: string;
}

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Chat message type for conversation history
export interface ChatMessageForAPI {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// Groq API completion function with conversation history support
export async function getOpenRouterCompletion(prompt: string, throwOnError: boolean = false): Promise<string | null> {
  // For backwards compatibility, wrap single prompt in messages array
  return getChatCompletion([{ role: 'user', content: prompt }], throwOnError);
}

// New function that accepts conversation history
export async function getChatCompletion(messages: ChatMessageForAPI[], throwOnError: boolean = false): Promise<string | null> {
  const model = 'llama-3.3-70b-versatile';

  try {
    console.log(`DEBUG: Calling Groq with model: ${model}, messages count: ${messages.length}`);
    console.log(`DEBUG: Messages being sent:`, JSON.stringify(messages.map(m => ({ role: m.role, contentLength: m.content.length }))));

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`Groq API error: ${res.status} - ${errorText}`);

      if (res.status === 429) {
        // Try to get retry time from headers
        const retryAfter = res.headers.get('Retry-After') || res.headers.get('x-ratelimit-reset-requests');
        const waitTime = retryAfter ? `${retryAfter} seconds` : 'a minute';
        throw new Error(`RATE_LIMITED:${waitTime}`);
      }

      if (throwOnError) {
        throw new Error(`API error ${res.status}: ${errorText}`);
      }
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) return content;

    return null;

  } catch (err: any) {
    console.error(`Groq fetch error:`, err);
    if (err.message?.startsWith('RATE_LIMITED') || throwOnError) {
      throw err;
    }
    return null;
  }
}

// Interface for parsed task from natural language
export interface ParsedTask {
  title: string;
  description?: string;
  dueDate?: string; // ISO format YYYY-MM-DD
  dueTime?: string; // HH:MM format
  priority?: 'low' | 'standard' | 'high' | 'urgent';
  category?: string;
  estimatedMinutes?: number;
}

// Parse natural language into a structured task
export async function parseNaturalLanguageTask(input: string, currentDate: string): Promise<ParsedTask | null> {
  const prompt = `You are a task parsing AI. Parse the following natural language input into a structured task.

Current date: ${currentDate}

User input: "${input}"

Extract the following information:
- title: A concise task title (required)
- description: Additional details if mentioned (optional)
- dueDate: Date in YYYY-MM-DD format. Interpret relative dates like "tomorrow", "next Monday", "in 3 days", "friday" based on current date ${currentDate}
- dueTime: Time in HH:MM 24-hour format if mentioned (e.g., "3pm" = "15:00", "9am" = "09:00")
- priority: One of "low", "standard", "high", "urgent" based on keywords like "important", "urgent", "ASAP", "whenever", etc. Default to "standard"
- category: Infer a category like "Work", "Personal", "Health", "Study", "Shopping", etc. based on content
- estimatedMinutes: Estimated time to complete if mentioned or inferable

Respond with ONLY a valid JSON object, no markdown, no explanation. Example:
{"title":"Call dentist","description":"Schedule annual checkup","dueDate":"2024-01-15","dueTime":"15:00","priority":"standard","category":"Health","estimatedMinutes":15}

If the input is too vague or not a task, respond with: {"error":"Could not parse as a task"}`;

  try {
    const response = await getOpenRouterCompletion(prompt, true);
    if (!response) return null;

    // Clean the response and parse JSON
    const cleanedResponse = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const parsed = JSON.parse(cleanedResponse);

    if (parsed.error) {
      console.log('NLP parse error:', parsed.error);
      return null;
    }

    return {
      title: parsed.title || input,
      description: parsed.description,
      dueDate: parsed.dueDate,
      dueTime: parsed.dueTime,
      priority: parsed.priority || 'standard',
      category: parsed.category,
      estimatedMinutes: parsed.estimatedMinutes
    };
  } catch (err) {
    console.error('Error parsing natural language task:', err);
    return null;
  }
}

// Suggest priority for a task based on its content
export async function suggestTaskPriority(title: string, description: string = '', dueDate?: string): Promise<'low' | 'standard' | 'high' | 'urgent'> {
  const today = new Date().toISOString().split('T')[0];
  const prompt = `Analyze this task and suggest a priority level.

Task Title: "${title}"
Description: "${description}"
Due Date: ${dueDate || 'Not specified'}
Today's Date: ${today}

Consider:
- Urgency based on due date (if due soon, higher priority)
- Keywords suggesting importance (urgent, ASAP, important, critical)
- Keywords suggesting low priority (whenever, eventually, someday)
- Nature of the task (health/safety = higher, entertainment = lower)

Respond with ONLY one word: "low", "standard", "high", or "urgent"`;

  try {
    const response = await getOpenRouterCompletion(prompt);
    if (!response) return 'standard';

    const priority = response.trim().toLowerCase();
    if (['low', 'standard', 'high', 'urgent'].includes(priority)) {
      return priority as 'low' | 'standard' | 'high' | 'urgent';
    }
    return 'standard';
  } catch {
    return 'standard';
  }
}

// Suggest category for a task based on its content
export async function suggestTaskCategory(title: string, description: string = ''): Promise<string> {
  const prompt = `Categorize this task into ONE of these categories:
- Work
- Personal
- Health
- Study
- Shopping
- Finance
- Home
- Social
- Travel
- Other

Task Title: "${title}"
Description: "${description}"

Respond with ONLY the category name, nothing else.`;

  try {
    const response = await getOpenRouterCompletion(prompt);
    if (!response) return 'Personal';

    const category = response.trim();
    const validCategories = ['Work', 'Personal', 'Health', 'Study', 'Shopping', 'Finance', 'Home', 'Social', 'Travel', 'Other'];

    // Find matching category (case-insensitive)
    const match = validCategories.find(c => c.toLowerCase() === category.toLowerCase());
    return match || 'Personal';
  } catch {
    return 'Personal';
  }
}

// Break down a large task into subtasks
export async function breakdownTask(title: string, description: string = ''): Promise<{ title: string, description: string }[]> {
  const prompt = `Break down this task into 3-6 smaller, actionable subtasks.

Main Task: "${title}"
Description: "${description}"

Generate subtasks that are:
- Specific and actionable
- Progressive (can be done in order)
- Together complete the main task

Respond with ONLY a JSON array of objects with "title" and "description" fields. No markdown.
Example: [{"title":"Research options","description":"Look up available choices"},{"title":"Compare prices","description":"Create a comparison spreadsheet"}]`;

  try {
    const response = await getOpenRouterCompletion(prompt, true);
    if (!response) return [];

    const cleanedResponse = response.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const parsed = JSON.parse(cleanedResponse);

    if (Array.isArray(parsed)) {
      return parsed.map(item => ({
        title: String(item.title || ''),
        description: String(item.description || '')
      })).filter(item => item.title);
    }
    return [];
  } catch (err) {
    console.error('Error breaking down task:', err);
    return [];
  }
}

// Ensure 'export' is present
export async function generateEntirePlanWithAI(
  workspaceName: string,
  templateTitle: string,
  templateGoal: string,
  originalStepsWithUserInput: OriginalTemplateStep[],
  generalProjectNotes: string,
  pdfContextString: string = ""
): Promise<AiGeneratedTask[]> {

  const formattedOriginalSteps = originalStepsWithUserInput.map((step, i) =>
    `${i + 1}. Original Step: "${step.text}" ${step.userInput ? `(User's input for this: "${step.userInput}")` : '(No specific user input for this original step.)'}`
  ).join('\n');

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
  } else {
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
PDF Context (Reference Material): "${pdfContextString ? pdfContextString.substring(0, 15000) : 'None provided'}"

The original template provides the following structural steps as a guideline, some with initial user input from the user who wants to achieve the overall goal:
${formattedOriginalSteps}

Your main task is to expand on these original steps, using the initial user input (especially for the first prompted step, currently focused on "${initialSeedTopic}") as the central theme or starting point.
CRITICAL: If "PDF Context" is provided above, you MUST prioritize it as your primary source of truth. Use the specific details, syllabus, or project requirements found in the PDF text to generate highly specific tasks that match the document's content.
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

  const fallbackTasks: AiGeneratedTask[] = originalStepsWithUserInput.map(step => ({
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
        parsedTasks.every(task =>
          typeof task.title === 'string' &&
          typeof task.description === 'string'
        )
      ) {
        console.log(`Successfully parsed ${parsedTasks.length} tasks from AI for entire plan.`);
        return parsedTasks.map(task => ({
          title: String(task.title),
          description: String(task.description)
        }));
      } else {
        console.warn(`Parsed JSON for entire plan not valid/empty array of tasks. Parsed:`, parsedTasks, "Original AI String:", aiResponseString);
      }
    }
    console.warn(`AI response for entire plan not valid JSON array after extraction. Fallback. Raw: ${aiResponseString}`);
    return fallbackTasks;
  } catch (e) {
    console.error(`Error parsing AI JSON response for entire plan:`, e, "\nAI Response String:", aiResponseString);
    return fallbackTasks;
  }
}
