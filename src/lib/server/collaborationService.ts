// src/lib/server/collaborationService.ts
// Server-side service for collaboration operations

import { adminDb, adminAuth } from './firebaseAdmin.js';
import { FieldValue } from 'firebase-admin/firestore';
import type { 
    WorkspaceMember, 
    WorkspaceInvitation, 
    TaskAssignment, 
    ActivityLogEntry,
    MemberRole,
    ActivityAction,
    UserNotification,
    NotificationType
} from '../types/collaboration.js';

// Collection names
const WORKSPACE_MEMBERS = 'workspace_members';
const WORKSPACE_INVITATIONS = 'workspace_invitations';
const TASK_ASSIGNMENTS = 'task_assignments';
const ACTIVITY_LOG = 'activity_log';
const WORKSPACES = 'workspaces';
const CREDENTIALS = 'credentials';
const USER_NOTIFICATIONS = 'user_notifications';

// ==================== WORKSPACE MEMBER FUNCTIONS ====================

/**
 * Get a user's role in a workspace
 */
export async function getUserRole(workspaceId: string, userId: string): Promise<MemberRole | null> {
    console.log(`[getUserRole] workspaceId: ${workspaceId}, userId: ${userId}`);
    
    // First check if user is the workspace owner
    const workspaceDoc = await adminDb.collection(WORKSPACES).doc(workspaceId).get();
    if (!workspaceDoc.exists) {
        console.log(`[getUserRole] Workspace ${workspaceId} not found`);
        return null;
    }
    const workspaceData = workspaceDoc.data();
    console.log(`[getUserRole] Workspace owner: ${workspaceData?.userId}, checking user: ${userId}`);
    
    if (workspaceData?.userId === userId) {
        console.log(`[getUserRole] User is owner`);
        return 'owner';
    }

    // Check membership
    const memberQuery = await adminDb.collection(WORKSPACE_MEMBERS)
        .where('workspaceId', '==', workspaceId)
        .where('userId', '==', userId)
        .limit(1)
        .get();
    
    if (memberQuery.empty) {
        console.log(`[getUserRole] User is not a member`);
        return null;
    }

    const role = memberQuery.docs[0].data().role as MemberRole;
    console.log(`[getUserRole] User role from membership: ${role}`);
    return role;
}

/**
 * Check if a user has access to a workspace
 */
export async function hasWorkspaceAccess(workspaceId: string, userId: string): Promise<boolean> {
    const role = await getUserRole(workspaceId, userId);
    return role !== null;
}

/**
 * Check if user can perform a specific action in a workspace
 */
export async function canPerformAction(
    workspaceId: string, 
    userId: string, 
    action: 'view' | 'edit' | 'delete' | 'manageMembers' | 'deleteWorkspace' | 'assign'
): Promise<boolean> {
    const role = await getUserRole(workspaceId, userId);
    if (!role) return false;

    const permissions: Record<MemberRole, Record<string, boolean>> = {
        owner: { view: true, edit: true, delete: true, manageMembers: true, deleteWorkspace: true, assign: true },
        admin: { view: true, edit: true, delete: true, manageMembers: true, deleteWorkspace: false, assign: true },
        editor: { view: true, edit: true, delete: false, manageMembers: false, deleteWorkspace: false, assign: false },
        viewer: { view: true, edit: false, delete: false, manageMembers: false, deleteWorkspace: false, assign: false },
    };

    return permissions[role][action] ?? false;
}

/**
 * Get all members of a workspace
 */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    try {
        // Get workspace to include owner
        const workspaceDoc = await adminDb.collection(WORKSPACES).doc(workspaceId).get();
        if (!workspaceDoc.exists) {
            return [];
        }
        const workspaceData = workspaceDoc.data()!;

        // Get owner info
        const ownerDoc = await adminDb.collection(CREDENTIALS).doc(workspaceData.userId).get();
        const ownerData = ownerDoc.data();
        
        // Get owner's photo - first try credentials photoBase64, then Firebase Auth photoURL
        let ownerPhotoURL: string | undefined = ownerData?.photoBase64;
        if (!ownerPhotoURL) {
            try {
                const ownerAuthUser = await adminAuth.getUser(workspaceData.userId);
                ownerPhotoURL = ownerAuthUser.photoURL;
            } catch (e) {
                // Ignore if user not found in Auth
            }
        }

        const members: WorkspaceMember[] = [{
            id: `owner-${workspaceData.userId}`,
            workspaceId,
            userId: workspaceData.userId,
            username: ownerData?.username || 'Unknown',
            email: ownerData?.email || '',
            photoURL: ownerPhotoURL,
            role: 'owner',
            joinedAt: workspaceData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            invitedBy: workspaceData.userId, // Self-invited (created)
        }];

        // Get other members - just use simple where query without orderBy to avoid index requirement
        const memberQuery = await adminDb.collection(WORKSPACE_MEMBERS)
            .where('workspaceId', '==', workspaceId)
            .get();

        for (const doc of memberQuery.docs) {
            const data = doc.data();
            
            // Get member's photo - first try credentials photoBase64, then Firebase Auth photoURL
            let memberPhotoURL: string | undefined;
            const memberCredDoc = await adminDb.collection(CREDENTIALS).doc(data.userId).get();
            const memberCredData = memberCredDoc.data();
            memberPhotoURL = memberCredData?.photoBase64;
            
            if (!memberPhotoURL) {
                try {
                    const memberAuthUser = await adminAuth.getUser(data.userId);
                    memberPhotoURL = memberAuthUser.photoURL;
                } catch (e) {
                    // Ignore if user not found in Auth
                }
            }
            
            members.push({
                id: doc.id,
                workspaceId: data.workspaceId,
                userId: data.userId,
                username: data.username,
                email: data.email,
                photoURL: memberPhotoURL,
                role: data.role,
                joinedAt: data.joinedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                invitedBy: data.invitedBy,
            });
        }

        // Sort by joinedAt in memory (desc) to avoid composite index requirement
        members.sort((a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime());

        return members;
    } catch (err) {
        console.error('[getWorkspaceMembers] Error:', err);
        return []; // Return empty array on error to not break the page
    }
}

/**
 * Add a member to a workspace
 */
export async function addWorkspaceMember(
    workspaceId: string,
    userId: string,
    role: MemberRole,
    invitedByUserId: string
): Promise<WorkspaceMember> {
    // Get user info
    const userDoc = await adminDb.collection(CREDENTIALS).doc(userId).get();
    if (!userDoc.exists) {
        throw new Error('User not found');
    }
    const userData = userDoc.data()!;

    const memberData = {
        workspaceId,
        userId,
        username: userData.username || 'Unknown',
        email: userData.email || '',
        role,
        joinedAt: FieldValue.serverTimestamp(),
        invitedBy: invitedByUserId,
    };

    const docRef = await adminDb.collection(WORKSPACE_MEMBERS).add(memberData);

    return {
        id: docRef.id,
        ...memberData,
        joinedAt: new Date().toISOString(),
    } as WorkspaceMember;
}

/**
 * Remove a member from a workspace
 */
export async function removeWorkspaceMember(workspaceId: string, userId: string): Promise<void> {
    const memberQuery = await adminDb.collection(WORKSPACE_MEMBERS)
        .where('workspaceId', '==', workspaceId)
        .where('userId', '==', userId)
        .get();

    const batch = adminDb.batch();
    memberQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    // Also remove any task assignments for this user in this workspace
    const taskAssignments = await adminDb.collection(TASK_ASSIGNMENTS)
        .where('userId', '==', userId)
        .get();

    // Filter by workspace (need to check task's boardId)
    for (const assignmentDoc of taskAssignments.docs) {
        const taskId = assignmentDoc.data().taskId;
        const taskDoc = await adminDb.collection('tasks').doc(taskId).get();
        if (taskDoc.exists && taskDoc.data()?.boardId === workspaceId) {
            batch.delete(assignmentDoc.ref);
        }
    }

    await batch.commit();
}

/**
 * Update a member's role
 */
export async function updateMemberRole(
    workspaceId: string, 
    userId: string, 
    newRole: MemberRole
): Promise<void> {
    if (newRole === 'owner') {
        throw new Error('Cannot set role to owner via update');
    }

    const memberQuery = await adminDb.collection(WORKSPACE_MEMBERS)
        .where('workspaceId', '==', workspaceId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

    if (memberQuery.empty) {
        throw new Error('Member not found');
    }

    await memberQuery.docs[0].ref.update({ role: newRole });
}

// ==================== INVITATION FUNCTIONS ====================

/**
 * Create an invitation
 */
export async function createInvitation(
    workspaceId: string,
    invitedEmail: string,
    role: MemberRole,
    invitedByUserId: string
): Promise<WorkspaceInvitation> {
    // Check if user is already a member
    const existingUserQuery = await adminDb.collection(CREDENTIALS)
        .where('email', '==', invitedEmail)
        .limit(1)
        .get();

    let invitedUserId: string | undefined;
    if (!existingUserQuery.empty) {
        invitedUserId = existingUserQuery.docs[0].id;
        
        // Check if already a member
        const existingMember = await getUserRole(workspaceId, invitedUserId);
        if (existingMember) {
            throw new Error('User is already a member of this workspace');
        }
    }

    // Check for existing pending invitation
    const existingInvite = await adminDb.collection(WORKSPACE_INVITATIONS)
        .where('workspaceId', '==', workspaceId)
        .where('invitedEmail', '==', invitedEmail)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

    if (!existingInvite.empty) {
        throw new Error('An invitation is already pending for this email');
    }

    // Get workspace and inviter info
    const workspaceDoc = await adminDb.collection(WORKSPACES).doc(workspaceId).get();
    const inviterDoc = await adminDb.collection(CREDENTIALS).doc(invitedByUserId).get();

    if (!workspaceDoc.exists) {
        throw new Error('Workspace not found');
    }

    const invitationData = {
        workspaceId,
        workspaceName: workspaceDoc.data()!.title,
        invitedEmail,
        invitedUserId,
        invitedByUserId,
        invitedByUsername: inviterDoc.data()?.username || 'Unknown',
        role,
        status: 'pending' as const,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    };

    const docRef = await adminDb.collection(WORKSPACE_INVITATIONS).add(invitationData);

    return {
        id: docRef.id,
        ...invitationData,
        createdAt: new Date().toISOString(),
        expiresAt: invitationData.expiresAt.toISOString(),
    } as WorkspaceInvitation;
}

/**
 * Get pending invitations for a user
 */
export async function getUserPendingInvitations(userId: string): Promise<WorkspaceInvitation[]> {
    try {
        // Get user email
        const userDoc = await adminDb.collection(CREDENTIALS).doc(userId).get();
        if (!userDoc.exists) {
            return [];
        }
        const userEmail = userDoc.data()!.email;

        // Use simpler query to avoid composite index requirement
        const invitationsQuery = await adminDb.collection(WORKSPACE_INVITATIONS)
            .where('invitedEmail', '==', userEmail)
            .where('status', '==', 'pending')
            .get();

        const now = new Date();
        const invitations: WorkspaceInvitation[] = [];

        for (const doc of invitationsQuery.docs) {
            const data = doc.data();
            const expiresAt = data.expiresAt?.toDate?.() || new Date(data.expiresAt);
            
            // Mark expired invitations
            if (expiresAt < now) {
                await doc.ref.update({ status: 'expired' });
                continue;
            }

            invitations.push({
                id: doc.id,
                workspaceId: data.workspaceId,
                workspaceName: data.workspaceName,
                invitedEmail: data.invitedEmail,
                invitedUserId: data.invitedUserId,
                invitedByUserId: data.invitedByUserId,
                invitedByUsername: data.invitedByUsername,
                role: data.role,
                status: data.status,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                expiresAt: expiresAt.toISOString(),
            });
        }

        // Sort by createdAt in memory (desc)
        invitations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return invitations;
    } catch (err) {
        console.error('[getUserPendingInvitations] Error:', err);
        return [];
    }
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(invitationId: string, userId: string): Promise<void> {
    const inviteDoc = await adminDb.collection(WORKSPACE_INVITATIONS).doc(invitationId).get();
    
    if (!inviteDoc.exists) {
        throw new Error('Invitation not found');
    }

    const inviteData = inviteDoc.data()!;

    // Verify user email matches invitation
    const userDoc = await adminDb.collection(CREDENTIALS).doc(userId).get();
    if (!userDoc.exists || userDoc.data()!.email !== inviteData.invitedEmail) {
        throw new Error('Invitation is not for this user');
    }

    // Check expiration
    const expiresAt = inviteData.expiresAt?.toDate?.() || new Date(inviteData.expiresAt);
    if (expiresAt < new Date()) {
        await inviteDoc.ref.update({ status: 'expired' });
        throw new Error('Invitation has expired');
    }

    // Add member
    await addWorkspaceMember(
        inviteData.workspaceId,
        userId,
        inviteData.role,
        inviteData.invitedByUserId
    );

    // Update invitation status
    await inviteDoc.ref.update({ status: 'accepted' });

    // Log activity
    await logActivity(
        inviteData.workspaceId,
        userId,
        'member_joined',
        `joined the workspace`,
        undefined,
        { role: inviteData.role }
    );
}

/**
 * Decline an invitation
 */
export async function declineInvitation(invitationId: string, userId: string): Promise<void> {
    const inviteDoc = await adminDb.collection(WORKSPACE_INVITATIONS).doc(invitationId).get();
    
    if (!inviteDoc.exists) {
        throw new Error('Invitation not found');
    }

    const inviteData = inviteDoc.data()!;

    // Verify user email matches invitation
    const userDoc = await adminDb.collection(CREDENTIALS).doc(userId).get();
    if (!userDoc.exists || userDoc.data()!.email !== inviteData.invitedEmail) {
        throw new Error('Invitation is not for this user');
    }

    await inviteDoc.ref.update({ status: 'declined' });
}

/**
 * Cancel an invitation (by workspace admin/owner)
 */
export async function cancelInvitation(invitationId: string): Promise<void> {
    await adminDb.collection(WORKSPACE_INVITATIONS).doc(invitationId).delete();
}

/**
 * Get pending invitations sent from a workspace
 */
export async function getWorkspacePendingInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    try {
        // Use simpler query to avoid composite index requirement
        const invitationsQuery = await adminDb.collection(WORKSPACE_INVITATIONS)
            .where('workspaceId', '==', workspaceId)
            .where('status', '==', 'pending')
            .get();

        const invitations = invitationsQuery.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                workspaceId: data.workspaceId,
                workspaceName: data.workspaceName,
                invitedEmail: data.invitedEmail,
                invitedUserId: data.invitedUserId,
                invitedByUserId: data.invitedByUserId,
                invitedByUsername: data.invitedByUsername,
                role: data.role,
                status: data.status,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                expiresAt: data.expiresAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            };
        });

        // Sort by createdAt in memory (desc)
        invitations.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        return invitations;
    } catch (err) {
        console.error('[getWorkspacePendingInvitations] Error:', err);
        return [];
    }
}

// ==================== TASK ASSIGNMENT FUNCTIONS ====================

/**
 * Assign a user to a task
 */
export async function assignUserToTask(
    taskId: string,
    userId: string,
    assignedByUserId: string
): Promise<TaskAssignment> {
    // Verify user is a member of the workspace
    const taskDoc = await adminDb.collection('tasks').doc(taskId).get();
    if (!taskDoc.exists) {
        throw new Error('Task not found');
    }
    
    const taskData = taskDoc.data()!;
    const workspaceId = taskData.boardId;
    const taskTitle = taskData.title || 'Untitled Task';
    
    const hasAccess = await hasWorkspaceAccess(workspaceId, userId);
    if (!hasAccess) {
        throw new Error('User is not a member of this workspace');
    }

    // Check if already assigned
    const existingAssignment = await adminDb.collection(TASK_ASSIGNMENTS)
        .where('taskId', '==', taskId)
        .where('userId', '==', userId)
        .limit(1)
        .get();

    if (!existingAssignment.empty) {
        throw new Error('User is already assigned to this task');
    }

    // Get user info (the user being assigned)
    const userDoc = await adminDb.collection(CREDENTIALS).doc(userId).get();
    const userData = userDoc.data();
    
    // Get assigner info (the user doing the assigning)
    const assignerDoc = await adminDb.collection(CREDENTIALS).doc(assignedByUserId).get();
    const assignerData = assignerDoc.data();
    const assignerUsername = assignerData?.username || 'Someone';
    
    // Get workspace name
    const workspaceDoc = await adminDb.collection(WORKSPACES).doc(workspaceId).get();
    const workspaceName = workspaceDoc.data()?.title || 'Workspace';
    
    // Get user's photo - first try credentials photoBase64, then Firebase Auth photoURL
    let photoURL: string | undefined = userData?.photoBase64;
    if (!photoURL) {
        try {
            const authUser = await adminAuth.getUser(userId);
            photoURL = authUser.photoURL;
        } catch (e) {
            // Ignore if user not found in Auth
        }
    }

    const assignmentData = {
        taskId,
        userId,
        username: userData?.username || 'Unknown',
        photoURL,
        assignedAt: FieldValue.serverTimestamp(),
        assignedBy: assignedByUserId,
    };

    const docRef = await adminDb.collection(TASK_ASSIGNMENTS).add(assignmentData);

    // Create notification for the assigned user (only if they're not assigning themselves)
    if (userId !== assignedByUserId) {
        await createNotification(
            userId,
            'task_assigned',
            'New Task Assignment',
            `${assignerUsername} assigned you to "${taskTitle}"`,
            assignedByUserId,
            assignerUsername,
            {
                workspaceId,
                workspaceName,
                taskId,
                taskTitle,
            }
        );
    }

    return {
        id: docRef.id,
        ...assignmentData,
        assignedAt: new Date().toISOString(),
    } as TaskAssignment;
}

/**
 * Unassign a user from a task
 */
export async function unassignUserFromTask(taskId: string, userId: string): Promise<void> {
    const assignmentQuery = await adminDb.collection(TASK_ASSIGNMENTS)
        .where('taskId', '==', taskId)
        .where('userId', '==', userId)
        .get();

    const batch = adminDb.batch();
    assignmentQuery.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    await batch.commit();
}

/**
 * Get all assignments for a task
 */
export async function getTaskAssignments(taskId: string): Promise<TaskAssignment[]> {
    const assignmentsQuery = await adminDb.collection(TASK_ASSIGNMENTS)
        .where('taskId', '==', taskId)
        .get();

    const assignments: TaskAssignment[] = [];
    
    for (const doc of assignmentsQuery.docs) {
        const data = doc.data();
        
        // Get user's photo - first try credentials photoBase64, then Firebase Auth, then stored
        let photoURL: string | undefined;
        const credDoc = await adminDb.collection(CREDENTIALS).doc(data.userId).get();
        const credData = credDoc.data();
        photoURL = credData?.photoBase64;
        
        if (!photoURL) {
            try {
                const authUser = await adminAuth.getUser(data.userId);
                photoURL = authUser.photoURL;
            } catch (e) {
                // Use stored photoURL if available
                photoURL = data.photoURL;
            }
        }
        
        assignments.push({
            id: doc.id,
            taskId: data.taskId,
            userId: data.userId,
            username: data.username,
            photoURL,
            assignedAt: data.assignedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            assignedBy: data.assignedBy,
        });
    }
    
    // Sort in memory instead of Firestore to avoid index requirement
    return assignments.sort((a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime());
}

/**
 * Get all assignments for all tasks in a workspace
 */
export async function getWorkspaceTaskAssignments(workspaceId: string): Promise<TaskAssignment[]> {
    try {
        // Get all tasks in the workspace
        const tasksQuery = await adminDb.collection('tasks')
            .where('boardId', '==', workspaceId)
            .get();
        
        const taskIds = tasksQuery.docs.map(doc => doc.id);
        
        if (taskIds.length === 0) {
            return [];
        }
        
        // Get all assignments for these tasks
        // Firestore 'in' query has a limit of 30 items, so we need to batch
        const assignments: TaskAssignment[] = [];
        const batchSize = 30;
        
        for (let i = 0; i < taskIds.length; i += batchSize) {
            const batch = taskIds.slice(i, i + batchSize);
            const assignmentsQuery = await adminDb.collection(TASK_ASSIGNMENTS)
                .where('taskId', 'in', batch)
                .get();
            
            for (const doc of assignmentsQuery.docs) {
                const data = doc.data();
                
                // Get user's photo from credentials
                let photoURL: string | undefined;
                try {
                    const credDoc = await adminDb.collection(CREDENTIALS).doc(data.userId).get();
                    const credData = credDoc.data();
                    photoURL = credData?.photoBase64;
                    
                    if (!photoURL) {
                        try {
                            const authUser = await adminAuth.getUser(data.userId);
                            photoURL = authUser.photoURL;
                        } catch (e) {
                            photoURL = data.photoURL;
                        }
                    }
                } catch (e) {
                    console.error('[getWorkspaceTaskAssignments] Error fetching user photo:', e);
                    photoURL = undefined;
                }
                
                assignments.push({
                    id: doc.id,
                    taskId: data.taskId,
                    userId: data.userId,
                    username: data.username || 'Unknown',
                    photoURL,
                    assignedAt: data.assignedAt?.toDate?.()?.toISOString() || new Date().toISOString(),
                    assignedBy: data.assignedBy,
                });
            }
        }
        
        return assignments;
    } catch (err) {
        console.error('[getWorkspaceTaskAssignments] Error:', err);
        return [];
    }
}

/**
 * Get all tasks assigned to a user in a workspace
 */
export async function getUserAssignedTasks(userId: string, workspaceId?: string): Promise<string[]> {
    const assignmentsQuery = await adminDb.collection(TASK_ASSIGNMENTS)
        .where('userId', '==', userId)
        .get();

    const taskIds: string[] = [];

    for (const doc of assignmentsQuery.docs) {
        const taskId = doc.data().taskId;
        
        if (workspaceId) {
            // Filter by workspace
            const taskDoc = await adminDb.collection('tasks').doc(taskId).get();
            if (taskDoc.exists && taskDoc.data()?.boardId === workspaceId) {
                taskIds.push(taskId);
            }
        } else {
            taskIds.push(taskId);
        }
    }

    return taskIds;
}

// ==================== ACTIVITY LOG FUNCTIONS ====================

/**
 * Log an activity
 */
export async function logActivity(
    workspaceId: string,
    userId: string,
    action: ActivityAction,
    details: string,
    taskId?: string,
    metadata?: Record<string, any>
): Promise<ActivityLogEntry> {
    // Get username
    const userDoc = await adminDb.collection(CREDENTIALS).doc(userId).get();
    const username = userDoc.data()?.username || 'Unknown';

    const logData = {
        workspaceId,
        taskId,
        userId,
        username,
        action,
        details,
        metadata,
        createdAt: FieldValue.serverTimestamp(),
    };

    const docRef = await adminDb.collection(ACTIVITY_LOG).add(logData);

    return {
        id: docRef.id,
        ...logData,
        createdAt: new Date().toISOString(),
    } as ActivityLogEntry;
}

/**
 * Get activity log for a workspace
 */
export async function getWorkspaceActivityLog(
    workspaceId: string, 
    limit: number = 50
): Promise<ActivityLogEntry[]> {
    try {
        // Use simpler query to avoid composite index requirement
        const logQuery = await adminDb.collection(ACTIVITY_LOG)
            .where('workspaceId', '==', workspaceId)
            .get();

        const entries = logQuery.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                workspaceId: data.workspaceId,
                taskId: data.taskId,
                userId: data.userId,
                username: data.username,
                action: data.action,
                details: data.details,
                metadata: data.metadata,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            };
        });

        // Sort by createdAt in memory (desc) and limit
        entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return entries.slice(0, limit);
    } catch (err) {
        console.error('[getWorkspaceActivityLog] Error:', err);
        return [];
    }
}

/**
 * Get workspaces the user has access to (owner or member)
 */
export async function getUserAccessibleWorkspaces(userId: string): Promise<string[]> {
    const workspaceIds: string[] = [];

    // Get owned workspaces
    const ownedQuery = await adminDb.collection(WORKSPACES)
        .where('userId', '==', userId)
        .get();
    
    ownedQuery.docs.forEach(doc => {
        workspaceIds.push(doc.id);
    });

    // Get member workspaces
    const memberQuery = await adminDb.collection(WORKSPACE_MEMBERS)
        .where('userId', '==', userId)
        .get();
    
    memberQuery.docs.forEach(doc => {
        const wsId = doc.data().workspaceId;
        if (!workspaceIds.includes(wsId)) {
            workspaceIds.push(wsId);
        }
    });

    return workspaceIds;
}

// ==================== USER NOTIFICATION FUNCTIONS ====================

/**
 * Create a notification for a user
 */
export async function createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    fromUserId: string,
    fromUsername: string,
    options?: {
        workspaceId?: string;
        workspaceName?: string;
        taskId?: string;
        taskTitle?: string;
    }
): Promise<string> {
    console.log('[createNotification] Creating notification for user:', userId, 'type:', type, 'title:', title);
    
    const notificationData = {
        userId,
        type,
        title,
        message,
        fromUserId,
        fromUsername,
        workspaceId: options?.workspaceId || null,
        workspaceName: options?.workspaceName || null,
        taskId: options?.taskId || null,
        taskTitle: options?.taskTitle || null,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
    };

    const docRef = await adminDb.collection(USER_NOTIFICATIONS).add(notificationData);
    console.log('[createNotification] Created notification with ID:', docRef.id);
    return docRef.id;
}

/**
 * Get unread notifications for a user
 */
export async function getUserNotifications(userId: string, includeRead = false): Promise<UserNotification[]> {
    try {
        console.log('[getUserNotifications] Fetching notifications for user:', userId, 'includeRead:', includeRead);
        
        let query;
        if (!includeRead) {
            // Use simpler query without ordering to avoid index issues, then sort in memory
            query = adminDb.collection(USER_NOTIFICATIONS)
                .where('userId', '==', userId)
                .where('isRead', '==', false)
                .limit(50);
        } else {
            query = adminDb.collection(USER_NOTIFICATIONS)
                .where('userId', '==', userId)
                .limit(50);
        }

        const snapshot = await query.get();
        console.log('[getUserNotifications] Found', snapshot.docs.length, 'notifications');
        
        const notifications = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                userId: data.userId,
                type: data.type,
                title: data.title,
                message: data.message,
                workspaceId: data.workspaceId,
                workspaceName: data.workspaceName,
                taskId: data.taskId,
                taskTitle: data.taskTitle,
                fromUserId: data.fromUserId,
                fromUsername: data.fromUsername,
                isRead: data.isRead,
                createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
            };
        });
        
        // Sort by createdAt in memory (most recent first)
        notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        
        return notifications;
    } catch (err) {
        console.error('[getUserNotifications] Error:', err);
        return [];
    }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(notificationId: string, userId: string): Promise<boolean> {
    try {
        const docRef = adminDb.collection(USER_NOTIFICATIONS).doc(notificationId);
        const doc = await docRef.get();
        
        if (!doc.exists || doc.data()?.userId !== userId) {
            return false;
        }
        
        await docRef.update({ isRead: true });
        return true;
    } catch (err) {
        console.error('[markNotificationAsRead] Error:', err);
        return false;
    }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<number> {
    try {
        const query = await adminDb.collection(USER_NOTIFICATIONS)
            .where('userId', '==', userId)
            .where('isRead', '==', false)
            .get();
        
        const batch = adminDb.batch();
        query.docs.forEach(doc => {
            batch.update(doc.ref, { isRead: true });
        });
        
        await batch.commit();
        return query.size;
    } catch (err) {
        console.error('[markAllNotificationsAsRead] Error:', err);
        return 0;
    }
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(userId: string): Promise<number> {
    try {
        const query = await adminDb.collection(USER_NOTIFICATIONS)
            .where('userId', '==', userId)
            .where('isRead', '==', false)
            .count()
            .get();
        
        return query.data().count;
    } catch (err) {
        console.error('[getUnreadNotificationCount] Error:', err);
        return 0;
    }
}

/**
 * Delete/dismiss a notification
 */
export async function deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
        const docRef = adminDb.collection(USER_NOTIFICATIONS).doc(notificationId);
        const doc = await docRef.get();
        
        if (!doc.exists || doc.data()?.userId !== userId) {
            return false;
        }
        
        await docRef.delete();
        return true;
    } catch (err) {
        console.error('[deleteNotification] Error:', err);
        return false;
    }
}
