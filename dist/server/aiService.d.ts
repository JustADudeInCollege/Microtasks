export interface AiGeneratedTask {
    title: string;
    description: string;
}
export interface OriginalTemplateStep {
    text: string;
    userInput?: string;
}
export declare function getOpenRouterCompletion(prompt: string): Promise<string | null>;
export declare function generateEntirePlanWithAI(workspaceName: string, templateTitle: string, templateGoal: string, originalStepsWithUserInput: OriginalTemplateStep[], generalProjectNotes: string): Promise<AiGeneratedTask[]>;
