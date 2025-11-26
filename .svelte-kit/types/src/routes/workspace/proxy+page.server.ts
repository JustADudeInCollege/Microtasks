// @ts-nocheck
import type { PageServerLoad, Actions, PageServerLoadEvent } from './$types.js';
import { adminDb } from '$lib/server/firebaseAdmin.js';
import { fail, redirect, error as SvelteKitError } from '@sveltejs/kit';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { generateEntirePlanWithAI } from '$lib/server/aiService';

export interface BoardForFrontend {
    id:string;
    title: string;
    createdAtISO?: string | null; 
}

interface UserForFrontend {
    name?: string;
}

interface TemplateStepDef {
    text: string;
    inputPrompt?: string;
    inputType?: 'text' | 'textarea';
    requiresContext?: boolean;
}

export const load = async ({ locals }: PageServerLoadEvent) => {
    const userId = locals.userId;
    let userForFrontend: UserForFrontend | undefined = undefined;
    let boardsForFrontend: BoardForFrontend[] = [];
    let pageLoadError: string | null = null;

    if (!userId) {
        // Optional: throw redirect(303, '/login');
    }

    if (userId) {
        try {
            const credDocRef = adminDb.collection('credentials').doc(userId);
            const credDoc = await credDocRef.get();
            userForFrontend = credDoc.exists ? { name: credDoc.data()?.username || 'User' } : { name: 'User (No Credentials)' };
        } catch (userFetchError: any) {
            console.error(`[Workspace Load] Error fetching user credentials for ${userId}:`, userFetchError);
            pageLoadError = 'Could not load your user data.';
        }

        if (!pageLoadError) { 
            try {
                const boardsSnapshot = await adminDb.collection('workspaces') 
                    .where('userId', '==', userId)
                    .orderBy('createdAt', 'desc') 
                    .get();

                boardsForFrontend = boardsSnapshot.docs.map(doc => {
                    const data = doc.data();
                    let createdAtISO = null;
                    if (data.createdAt && data.createdAt instanceof Timestamp) {
                        createdAtISO = data.createdAt.toDate().toISOString();
                    } else if (data.createdAt && typeof data.createdAt === 'object' && (data.createdAt as any)._seconds) {
                        createdAtISO = new Date((data.createdAt as any)._seconds * 1000).toISOString();
                    }
                    return {
                        id: doc.id,
                        title: data.title || 'Untitled Workspace',
                        createdAtISO: createdAtISO,
                    };
                });
            } catch (dbFetchError: any) {
                console.error(`[Workspace Load] Error fetching boards for user ${userId}:`, dbFetchError);
                pageLoadError = (pageLoadError ? pageLoadError + " " : "") + 'Could not load workspaces.';
            }
        }
    }

    return {
        user: userForFrontend,
        boards: boardsForFrontend,
        error: pageLoadError,
    };
};


export const actions = {
    addBoard: async ({ request, locals }: import('./$types').RequestEvent) => {
        const userId = locals.userId;
        if (!userId) {
            return fail(401, { boardForm: { error: 'User not authenticated. Please log in.' } });
        }
        const formData = await request.formData();
        const title = formData.get('title')?.toString()?.trim();
        if (!title) {
            return fail(400, { boardForm: { error: 'Workspace title is required.', title }});
        }
        if (title.length > 100) {
             return fail(400, { boardForm: { error: 'Workspace title is too long (max 100 chars).', title }});
        }
        try {
            const newBoardRef = await adminDb.collection('workspaces').add({ userId, title, createdAt: FieldValue.serverTimestamp() });
            return { boardForm: { success: true, message: 'Workspace added!', newBoard: { id: newBoardRef.id, title }}};
        } catch (error: any) {
            return fail(500, { boardForm: { error: `Failed to add: ${(error as Error).message || 'Server error.'}`, title }});
        }
    },

    deleteBoard: async ({ request, locals }: import('./$types').RequestEvent) => {
        const userId = locals.userId;
        if (!userId) return fail(401, { deleteBoardForm: { error: 'User not authenticated.' }});
        const formData = await request.formData();
        const boardId = formData.get('boardId')?.toString();
        if (!boardId) return fail(400, { deleteBoardForm: { error: 'Workspace ID required.' }});

        try {
            const boardRef = adminDb.collection('workspaces').doc(boardId);
            const boardDoc = await boardRef.get();
            if (!boardDoc.exists || boardDoc.data()?.userId !== userId) {
                return fail(boardDoc.exists ? 403 : 404, { deleteBoardForm: { error: boardDoc.exists ? 'Permission denied.' : 'Not found.' }});
            }
            const batch = adminDb.batch();
            const tasksQuery = adminDb.collection('tasks').where('boardId', '==', boardId).where('userId', '==', userId);
            const tasksSnapshot = await tasksQuery.get();
            let deletedTasksCount = 0;
            tasksSnapshot.docs.forEach(doc => { batch.delete(doc.ref); deletedTasksCount++; });
            batch.delete(boardRef);
            await batch.commit();
            return { deleteBoardForm: { success: true, message: `Deleted workspace & ${deletedTasksCount} task(s).` }};
        } catch (error: any) {
            return fail(500, { deleteBoardForm: { error: `Failed to delete: ${(error as Error).message || 'Server error.'}` }});
        }
    },

    createWorkspaceFromTemplate: async ({ request, locals }: import('./$types').RequestEvent) => {
        const userId = locals.userId;
        if (!userId) {
            return fail(401, { templateForm: { error: 'User not authenticated. Please log in.' } });
        }

        const formData = await request.formData();
        const workspaceName = formData.get('workspaceName')?.toString()?.trim();
        const templateTitle = formData.get('templateTitle')?.toString() || "Selected Template"; 
        const templateGoal = formData.get('templateGoal')?.toString() || "Achieve project objectives.";
        const templateStepsJSON = formData.get('templateStepsJSON')?.toString();
        const stepSpecificInputsJSON = formData.get('stepSpecificInputsJSON')?.toString();
        
        const projectStartDateString = formData.get('projectStartDate')?.toString();
        const projectEndDateString = formData.get('projectEndDate')?.toString();
        const projectNotes = formData.get('projectNotes')?.toString()?.trim() || '';

        if (!workspaceName) return fail(400, { templateForm: { error: 'New workspace name is required.' } });
        if (!templateStepsJSON || !stepSpecificInputsJSON) return fail(400, { templateForm: { error: 'Template data missing.' } });

        let definedTemplateSteps: TemplateStepDef[];
        let userStepInputs: Record<number, string>;
        try {
            definedTemplateSteps = JSON.parse(templateStepsJSON);
            userStepInputs = JSON.parse(stepSpecificInputsJSON);
            if (!Array.isArray(definedTemplateSteps)) throw new Error('Invalid template steps structure.');
        } catch (e) {
            return fail(400, { templateForm: { error: 'Invalid template data format.' } });
        }

        let startDateObj: Date | null = null;
        if (projectStartDateString && /^\d{4}-\d{2}-\d{2}$/.test(projectStartDateString)) {
            startDateObj = new Date(projectStartDateString + 'T00:00:00Z');
            if (isNaN(startDateObj.getTime())) startDateObj = null;
        }
        let endDateObj: Date | null = null;
        if (projectEndDateString && /^\d{4}-\d{2}-\d{2}$/.test(projectEndDateString)) {
            endDateObj = new Date(projectEndDateString + 'T23:59:59Z');
            if (isNaN(endDateObj.getTime())) endDateObj = null;
        }
        if (startDateObj && endDateObj && endDateObj < startDateObj) {
            return fail(400, { templateForm: { error: 'End date cannot be before start date.' } });
        }
        
        const newWorkspaceData = {
            userId, title: workspaceName, createdAt: FieldValue.serverTimestamp(),
            fromTemplate: templateTitle, templateGoal: templateGoal,
        };

        try {
            const newWorkspaceRef = await adminDb.collection('workspaces').add(newWorkspaceData);
            const newWorkspaceId = newWorkspaceRef.id;
            
            const originalStepsWithUserInputForAI = definedTemplateSteps.map((step, index) => ({
                text: step.text,
                userInput: userStepInputs[index]?.trim() || undefined
            }));

            const aiGeneratedTasks = await generateEntirePlanWithAI(
                workspaceName,
                templateTitle,
                templateGoal,
                originalStepsWithUserInputForAI,
                projectNotes
            );
            
            let tasksGeneratedCount = aiGeneratedTasks.length;

            if (tasksGeneratedCount > 0) {
                const batch = adminDb.batch();
                const tasksCollection = adminDb.collection('tasks');

                const totalTasksToSchedule = tasksGeneratedCount;
                let taskDueDateForCalc: Date | null = startDateObj ? new Date(startDateObj.getTime()) : null;
                let daysBetweenTasks = 2;

                if (startDateObj && endDateObj && totalTasksToSchedule > 1) {
                    const totalDurationDays = Math.max(1, (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
                    daysBetweenTasks = totalTasksToSchedule > 1 ? Math.max(1, Math.floor(totalDurationDays / (totalTasksToSchedule -1))) : 0;
                } else if (startDateObj) {
                    daysBetweenTasks = (totalTasksToSchedule > 1) ? 2 : 0;
                }
                
                aiGeneratedTasks.forEach((taskDetails, index) => {
                    let dueDateString: string | null = null;
                    if (taskDueDateForCalc) {
                        let individualTaskDueDate = new Date(taskDueDateForCalc.getTime());
                        if (index > 0 && daysBetweenTasks > 0) {
                            individualTaskDueDate.setUTCDate(taskDueDateForCalc.getUTCDate() + (index * daysBetweenTasks));
                        } else if (index > 0 && daysBetweenTasks === 0 && startDateObj) {
                             individualTaskDueDate = new Date(startDateObj.getTime());
                        }

                        if (endDateObj && individualTaskDueDate > endDateObj) {
                           individualTaskDueDate = new Date(endDateObj.getTime());
                        }
                        dueDateString = individualTaskDueDate.toISOString().split('T')[0];
                    }
                    
                    const finalTaskData = {
                        userId,
                        boardId: newWorkspaceId,
                        title: taskDetails.title.substring(0, 200),
                        description: taskDetails.description.substring(0, 1500),
                        createdAt: FieldValue.serverTimestamp(),
                        isCompleted: false,
                        priority: 'standard',
                        dueDate: dueDateString,
                        dueTime: null,
                        tags: templateTitle ? [templateTitle.toLowerCase().replace(/\s+/g, '-').substring(0,30)] : [],
                    };
                    batch.set(tasksCollection.doc(), finalTaskData);
                });
                await batch.commit();
            }

            return {
                templateForm: {
                    success: true,
                    message: `Workspace "${workspaceName}" and ${tasksGeneratedCount} AI-generated tasks created!`,
                    newBoard: { id: newWorkspaceId, title: workspaceName }
                }
            };

        } catch (error: any) {
            console.error('[Action createWorkspaceFromTemplate] CRITICAL ERROR:', error);
            const errorMessage = (error.message && error.message.toLowerCase().includes("ai")) 
                ? `AI Processing Error: ${error.message}` 
                : `Failed to create from template: ${(error as Error).message || 'Server error.'}`;
            return fail(500, {
                templateForm: { error: errorMessage }
            });
        }
    },
    
    logout: async ({ cookies }: import('./$types').RequestEvent) => {
        cookies.set('userId', '', { 
            path: '/', 
            maxAge: 0, 
            httpOnly: true, 
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' 
        });
        throw redirect(303, '/login');
    }
};;null as any as PageServerLoad;;null as any as Actions;