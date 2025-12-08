// src/lib/types/collaboration.ts
// Types and interfaces for the collaborative workspace feature

export type MemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface WorkspaceMember {
    id: string;              // Document ID
    workspaceId: string;     // Reference to workspace
    userId: string;          // User's UID
    username: string;        // User's display name (denormalized for easy display)
    email: string;           // User's email (denormalized)
    photoURL?: string;       // User's profile picture URL
    role: MemberRole;        // Permission level
    joinedAt: string;        // ISO date string
    invitedBy: string;       // UID of user who invited them
}

export interface WorkspaceInvitation {
    id: string;              // Document ID
    workspaceId: string;     // Reference to workspace
    workspaceName: string;   // Denormalized for notification display
    invitedEmail: string;    // Email of invited user
    invitedUserId?: string;  // UID if user exists in system
    invitedByUserId: string; // UID of inviter
    invitedByUsername: string; // Denormalized inviter name
    role: MemberRole;        // Role being offered
    status: 'pending' | 'accepted' | 'declined' | 'expired';
    createdAt: string;       // ISO date string
    expiresAt: string;       // ISO date string (e.g., 7 days from creation)
}

export interface TaskAssignment {
    id: string;              // Document ID
    taskId: string;          // Reference to task
    userId: string;          // Assigned user's UID
    username: string;        // Denormalized for display
    photoURL?: string;       // User's profile picture URL
    assignedAt: string;      // ISO date string
    assignedBy: string;      // UID of user who assigned
}

export interface ActivityLogEntry {
    id: string;              // Document ID
    workspaceId: string;     // Reference to workspace
    taskId?: string;         // Reference to task (optional)
    userId: string;          // User who performed action
    username: string;        // Denormalized for display
    action: ActivityAction;  // Type of action
    details: string;         // Human-readable description
    metadata?: Record<string, any>; // Additional data (old/new values, etc.)
    createdAt: string;       // ISO date string
}

export type ActivityAction = 
    | 'workspace_created'
    | 'member_invited'
    | 'member_joined'
    | 'member_removed'
    | 'member_role_changed'
    | 'task_created'
    | 'task_updated'
    | 'task_completed'
    | 'task_uncompleted'
    | 'task_deleted'
    | 'task_assigned'
    | 'task_unassigned'
    | 'task_moved'
    | 'comment_added';

// User notification types
export type NotificationType = 
    | 'task_assigned'
    | 'task_unassigned'
    | 'workspace_invitation'
    | 'member_joined'
    | 'task_completed';

export interface UserNotification {
    id: string;              // Document ID
    userId: string;          // User receiving the notification
    type: NotificationType;  // Type of notification
    title: string;           // Short title
    message: string;         // Detailed message
    workspaceId?: string;    // Related workspace
    workspaceName?: string;  // Denormalized workspace name
    taskId?: string;         // Related task
    taskTitle?: string;      // Denormalized task title
    fromUserId: string;      // User who triggered the notification
    fromUsername: string;    // Denormalized username
    isRead: boolean;         // Has the user read this
    createdAt: string;       // ISO date string
}

export interface UserNotificationForFrontend extends UserNotification {
    timeAgo: string;         // "2 hours ago", etc.
}

// Frontend-specific types
export interface WorkspaceMemberForFrontend {
    id: string;
    userId: string;
    username: string;
    email: string;
    photoURL?: string;
    role: MemberRole;
    joinedAt: string;
    isCurrentUser: boolean;
}

export interface InvitationForFrontend {
    id: string;
    workspaceId: string;
    workspaceName: string;
    invitedByUsername: string;
    role: MemberRole;
    status: 'pending' | 'accepted' | 'declined' | 'expired';
    createdAt: string;
    expiresAt: string;
}

export interface ActivityLogForFrontend {
    id: string;
    username: string;
    action: ActivityAction;
    details: string;
    taskId?: string;
    createdAt: string;
    timeAgo: string; // "2 hours ago", "yesterday", etc.
}

// Permission helpers
export const ROLE_PERMISSIONS: Record<MemberRole, {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canManageMembers: boolean;
    canDeleteWorkspace: boolean;
}> = {
    owner: {
        canView: true,
        canEdit: true,
        canDelete: true,
        canManageMembers: true,
        canDeleteWorkspace: true,
    },
    admin: {
        canView: true,
        canEdit: true,
        canDelete: true,
        canManageMembers: true,
        canDeleteWorkspace: false,
    },
    editor: {
        canView: true,
        canEdit: true,
        canDelete: false,
        canManageMembers: false,
        canDeleteWorkspace: false,
    },
    viewer: {
        canView: true,
        canEdit: false,
        canDelete: false,
        canManageMembers: false,
        canDeleteWorkspace: false,
    },
};

export function canUserPerformAction(
    role: MemberRole,
    action: 'view' | 'edit' | 'delete' | 'manageMembers' | 'deleteWorkspace'
): boolean {
    const permissions = ROLE_PERMISSIONS[role];
    switch (action) {
        case 'view': return permissions.canView;
        case 'edit': return permissions.canEdit;
        case 'delete': return permissions.canDelete;
        case 'manageMembers': return permissions.canManageMembers;
        case 'deleteWorkspace': return permissions.canDeleteWorkspace;
        default: return false;
    }
}

// Share link for joining workspace via URL
export interface WorkspaceShareLink {
    id: string;              // Document ID (also used as the link token)
    workspaceId: string;     // Reference to workspace
    workspaceName: string;   // Denormalized for display
    role: MemberRole;        // Role assigned to people who join via this link
    createdBy: string;       // UID of user who created the link
    createdByUsername: string; // Denormalized creator name
    createdAt: string;       // ISO date string
    expiresAt: string | null; // ISO date string, null = never expires
    usageLimit: number | null; // Max number of uses, null = unlimited
    usageCount: number;      // How many times the link has been used
    isActive: boolean;       // Can be disabled without deleting
}

export interface ShareLinkForFrontend {
    id: string;
    role: MemberRole;
    createdAt: string;
    expiresAt: string | null;
    usageLimit: number | null;
    usageCount: number;
    isActive: boolean;
    url: string;             // Full shareable URL
}

export function getRoleDisplayName(role: MemberRole): string {
    switch (role) {
        case 'owner': return 'Owner';
        case 'admin': return 'Admin';
        case 'editor': return 'Editor';
        case 'viewer': return 'Viewer';
        default: return 'Unknown';
    }
}

export function getActionDisplayName(action: ActivityAction): string {
    switch (action) {
        case 'workspace_created': return 'created the workspace';
        case 'member_invited': return 'invited a member';
        case 'member_joined': return 'joined the workspace';
        case 'member_removed': return 'removed a member';
        case 'member_role_changed': return 'changed a member\'s role';
        case 'task_created': return 'created a task';
        case 'task_updated': return 'updated a task';
        case 'task_completed': return 'completed a task';
        case 'task_uncompleted': return 'marked a task as incomplete';
        case 'task_deleted': return 'deleted a task';
        case 'task_assigned': return 'assigned a task';
        case 'task_unassigned': return 'unassigned a task';
        case 'task_moved': return 'moved a task';
        case 'comment_added': return 'added a comment';
        default: return 'performed an action';
    }
}

export function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) !== 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) !== 1 ? 's' : ''} ago`;
}
