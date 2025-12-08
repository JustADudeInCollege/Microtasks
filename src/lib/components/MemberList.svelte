<script lang="ts">
    import type { MemberRole, WorkspaceMember } from '$lib/types/collaboration';
    import { getRoleDisplayName } from '$lib/types/collaboration';

    export let members: WorkspaceMember[] = [];
    export let compact: boolean = false;
    export let maxDisplay: number = 5;
    
    $: displayMembers = compact ? members.slice(0, maxDisplay) : members;
    $: remainingCount = compact ? Math.max(0, members.length - maxDisplay) : 0;

    // Track which member images have failed to load
    let failedImages: Set<string> = new Set();

    function handleImageError(memberId: string) {
        failedImages.add(memberId);
        failedImages = failedImages; // Trigger reactivity
    }

    function shouldShowImage(member: WorkspaceMember): boolean {
        return !!member.photoURL && !failedImages.has(member.id);
    }

    function getRoleColor(role: MemberRole): string {
        switch (role) {
            case 'owner': return '#f59e0b';
            case 'admin': return '#3b82f6';
            case 'editor': return '#10b981';
            case 'viewer': return '#6b7280';
            default: return '#6b7280';
        }
    }
</script>

{#if compact}
    <div class="member-list-compact">
        <div class="avatars-stack">
            {#each displayMembers as member, i (member.id)}
                {#if shouldShowImage(member)}
                    <img 
                        class="avatar-circle-img"
                        style="z-index: {displayMembers.length - i}"
                        src={member.photoURL}
                        alt={member.username}
                        title="{member.username} ({getRoleDisplayName(member.role)})"
                        on:error={() => handleImageError(member.id)}
                    />
                {:else}
                    <div 
                        class="avatar-circle"
                        style="z-index: {displayMembers.length - i}; background-color: {getRoleColor(member.role)}"
                        title="{member.username} ({getRoleDisplayName(member.role)})"
                    >
                        {member.username.charAt(0).toUpperCase()}
                    </div>
                {/if}
            {/each}
            {#if remainingCount > 0}
                <div class="avatar-circle more" title="{remainingCount} more members">
                    +{remainingCount}
                </div>
            {/if}
        </div>
        {#if members.length === 1}
            <span class="member-count">Only you</span>
        {:else}
            <span class="member-count">{members.length} members</span>
        {/if}
    </div>
{:else}
    <div class="member-list-full">
        {#each members as member (member.id)}
            <div class="member-row">
                {#if shouldShowImage(member)}
                    <img 
                        class="avatar-img"
                        src={member.photoURL}
                        alt={member.username}
                        on:error={() => handleImageError(member.id)}
                    />
                {:else}
                    <div 
                        class="avatar"
                        style="background-color: {getRoleColor(member.role)}"
                    >
                        {member.username.charAt(0).toUpperCase()}
                    </div>
                {/if}
                <div class="member-details">
                    <span class="member-name">
                        {member.username}
                        {#if member.isCurrentUser}
                            <span class="you-badge">(You)</span>
                        {/if}
                    </span>
                    <span class="member-email">{member.email}</span>
                </div>
                <span class="role-badge {member.role}">{getRoleDisplayName(member.role)}</span>
            </div>
        {/each}
    </div>
{/if}

<style>
    .member-list-compact {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .avatars-stack {
        display: flex;
    }

    .avatar-circle {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 0.75rem;
        font-weight: 600;
        border: 2px solid white;
        margin-left: -8px;
    }

    .avatar-circle-img {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        border: 2px solid white;
        margin-left: -8px;
        object-fit: cover;
    }

    .avatar-circle:first-child,
    .avatar-circle-img:first-child {
        margin-left: 0;
    }

    :global(.dark) .avatar-circle,
    :global(.dark) .avatar-circle-img {
        border-color: #1f2937;
    }

    .avatar-circle.more {
        background-color: #4b5563;
        font-size: 0.65rem;
    }

    .member-count {
        font-size: 0.75rem;
        color: #6b7280;
    }

    :global(.dark) .member-count {
        color: #9ca3af;
    }

    .member-list-full {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .member-row {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem;
        border-radius: 6px;
        background-color: #f9fafb;
    }

    :global(.dark) .member-row {
        background-color: #374151;
    }

    .avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 0.875rem;
        flex-shrink: 0;
    }

    .avatar-img {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
    }

    .member-details {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
    }

    .member-name {
        font-weight: 500;
        font-size: 0.875rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .member-email {
        font-size: 0.75rem;
        color: #6b7280;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    :global(.dark) .member-email {
        color: #9ca3af;
    }

    .you-badge {
        color: #3b82f6;
        font-weight: 400;
        margin-left: 0.25rem;
    }

    .role-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.65rem;
        font-weight: 500;
        text-transform: uppercase;
        flex-shrink: 0;
    }

    .role-badge.owner {
        background-color: #fef3c7;
        color: #92400e;
    }

    .role-badge.admin {
        background-color: #dbeafe;
        color: #1e40af;
    }

    .role-badge.editor {
        background-color: #dcfce7;
        color: #166534;
    }

    .role-badge.viewer {
        background-color: #f3f4f6;
        color: #374151;
    }

    :global(.dark) .role-badge.owner {
        background-color: #78350f;
        color: #fef3c7;
    }

    :global(.dark) .role-badge.admin {
        background-color: #1e3a8a;
        color: #dbeafe;
    }

    :global(.dark) .role-badge.editor {
        background-color: #14532d;
        color: #dcfce7;
    }

    :global(.dark) .role-badge.viewer {
        background-color: #374151;
        color: #d1d5db;
    }
</style>
