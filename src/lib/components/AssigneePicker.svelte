<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { WorkspaceMember, WorkspaceMemberForFrontend, TaskAssignment } from '$lib/types/collaboration';
    import { getRoleDisplayName } from '$lib/types/collaboration';

    export let taskId: string;
    export let workspaceId: string;
    export let currentAssignments: TaskAssignment[] = [];
    export let members: (WorkspaceMember | WorkspaceMemberForFrontend)[] = [];
    export let canEdit: boolean = true;
    export let compact: boolean = false;

    const dispatch = createEventDispatcher();
    
    let isOpen = false;
    let isLoading = false;
    let loadingUserId: string | null = null; // Track which user is being assigned/unassigned
    let errorMessage = '';
    let confirmingUnassign: { userId: string; username: string } | null = null;
    let failedImages: Set<string> = new Set();

    function handleImageError(id: string) {
        failedImages.add(id);
        failedImages = failedImages;
    }

    $: assignedUserIds = new Set(currentAssignments.map(a => a.userId));
    $: unassignedMembers = members.filter(m => !assignedUserIds.has(m.userId));

    function toggleDropdown() {
        if (!canEdit) return;
        isOpen = !isOpen;
        if (isOpen) {
            errorMessage = '';
            confirmingUnassign = null;
        }
    }

    function closeDropdown() {
        isOpen = false;
        confirmingUnassign = null;
    }

    async function assignUser(userId: string) {
        isLoading = true;
        loadingUserId = userId;
        errorMessage = '';

        try {
            const res = await fetch('/api/workspace/assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, assignUserId: userId })
            });

            if (res.ok) {
                const data = await res.json();
                dispatch('assigned', { assignment: data.assignment });
            } else {
                const data = await res.json();
                errorMessage = data.message || 'Failed to assign';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to assign';
        } finally {
            isLoading = false;
            loadingUserId = null;
        }
    }

    async function unassignUser(userId: string) {
        isLoading = true;
        loadingUserId = userId;
        errorMessage = '';

        try {
            const res = await fetch('/api/workspace/assignments', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ taskId, unassignUserId: userId })
            });

            if (res.ok) {
                dispatch('unassigned', { userId });
            } else {
                const data = await res.json();
                errorMessage = data.message || 'Failed to unassign';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to unassign';
        } finally {
            isLoading = false;
            loadingUserId = null;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            closeDropdown();
        }
    }

    function getRoleColor(role: string): string {
        switch (role) {
            case 'owner': return '#f59e0b';
            case 'admin': return '#3b82f6';
            case 'editor': return '#10b981';
            case 'viewer': return '#6b7280';
            default: return '#6b7280';
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="assignee-picker" class:compact>
    <button 
        class="picker-trigger"
        on:click={toggleDropdown}
        disabled={!canEdit}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
    >
        {#if currentAssignments.length === 0}
            <span class="no-assignees">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <line x1="19" y1="8" x2="19" y2="14"></line>
                    <line x1="22" y1="11" x2="16" y2="11"></line>
                </svg>
                {#if !compact}
                    <span>Assign</span>
                {/if}
            </span>
        {:else}
            <div class="assigned-avatars">
                {#each currentAssignments.slice(0, 3) as assignment (assignment.id)}
                    {@const member = members.find(m => m.userId === assignment.userId)}
                    {@const photoUrl = assignment.photoURL || member?.photoURL}
                    {#if photoUrl && !failedImages.has(assignment.id)}
                        <img 
                            class="avatar-mini-img"
                            src={photoUrl}
                            alt={assignment.username}
                            title={assignment.username}
                            on:error={() => handleImageError(assignment.id)}
                        />
                    {:else}
                        <div 
                            class="avatar-mini"
                            style="background-color: {member ? getRoleColor(member.role) : '#6b7280'}"
                            title={assignment.username}
                        >
                            {assignment.username.charAt(0).toUpperCase()}
                        </div>
                    {/if}
                {/each}
                {#if currentAssignments.length > 3}
                    <div class="avatar-mini more">+{currentAssignments.length - 3}</div>
                {/if}
            </div>
        {/if}
    </button>

    {#if isOpen}
        <div class="dropdown" role="listbox">
            {#if errorMessage}
                <div class="error-message">{errorMessage}</div>
            {/if}

            {#if currentAssignments.length > 0}
                <div class="section">
                    <div class="section-label">Assigned</div>
                    {#each currentAssignments as assignment (assignment.id)}
                        {@const member = members.find(m => m.userId === assignment.userId)}
                        {@const photoUrl = assignment.photoURL || member?.photoURL}
                        <div class="member-option assigned">
                            {#if photoUrl && !failedImages.has('dropdown-' + assignment.id)}
                                <img 
                                    class="avatar-small-img"
                                    src={photoUrl}
                                    alt={assignment.username}
                                    on:error={() => handleImageError('dropdown-' + assignment.id)}
                                />
                            {:else}
                                <div 
                                    class="avatar-small"
                                    style="background-color: {member ? getRoleColor(member.role) : '#6b7280'}"
                                >
                                    {assignment.username.charAt(0).toUpperCase()}
                                </div>
                            {/if}
                            <span class="member-name">{assignment.username}</span>
                            {#if loadingUserId === assignment.userId}
                                <span class="loading-spinner"></span>
                            {:else}
                                <button 
                                    class="remove-btn"
                                    on:click={() => confirmingUnassign = { userId: assignment.userId, username: assignment.username }}
                                    disabled={isLoading}
                                    aria-label="Remove {assignment.username}"
                                >
                                    Remove
                                </button>
                            {/if}
                        </div>
                    {/each}
                </div>
            {/if}

            {#if unassignedMembers.length > 0}
                <div class="section">
                    <div class="section-label">Add assignee</div>
                    {#each unassignedMembers as member (member.id)}
                        <button 
                            class="member-option"
                            on:click={() => assignUser(member.userId)}
                            disabled={isLoading}
                            role="option"
                        >
                            {#if member.photoURL && !failedImages.has('member-' + member.id)}
                                <img 
                                    class="avatar-small-img"
                                    src={member.photoURL}
                                    alt={member.username}
                                    on:error={() => handleImageError('member-' + member.id)}
                                />
                            {:else}
                                <div 
                                    class="avatar-small"
                                    style="background-color: {getRoleColor(member.role)}"
                                >
                                    {member.username.charAt(0).toUpperCase()}
                                </div>
                            {/if}
                            <span class="member-name">
                                {member.username}
                                {#if member.isCurrentUser}
                                    <span class="you-label">(You)</span>
                                {/if}
                            </span>
                            {#if loadingUserId === member.userId}
                                <span class="loading-spinner"></span>
                            {:else}
                                <span class="role-tag">{getRoleDisplayName(member.role)}</span>
                            {/if}
                        </button>
                    {/each}
                </div>
            {:else if currentAssignments.length === members.length}
                <div class="all-assigned">All members assigned</div>
            {/if}
        </div>
    {/if}
</div>

{#if isOpen}
    <div class="backdrop" on:click={closeDropdown} on:keydown={() => {}}></div>
{/if}

<!-- Confirmation Modal -->
{#if confirmingUnassign}
    <div class="confirm-overlay" on:click={() => confirmingUnassign = null} on:keydown={() => {}}>
        <div class="confirm-modal" on:click|stopPropagation>
            <div class="confirm-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <line x1="18" y1="8" x2="23" y2="13"></line>
                    <line x1="23" y1="8" x2="18" y2="13"></line>
                </svg>
            </div>
            <h3 class="confirm-title">Remove Assignee</h3>
            <p class="confirm-message">
                Are you sure you want to remove <strong>{confirmingUnassign.username}</strong> from this task?
            </p>
            <div class="confirm-actions">
                <button 
                    class="confirm-cancel"
                    on:click={() => confirmingUnassign = null}
                >
                    Cancel
                </button>
                <button 
                    class="confirm-remove"
                    on:click={async () => {
                        if (confirmingUnassign) {
                            await unassignUser(confirmingUnassign.userId);
                            confirmingUnassign = null;
                        }
                    }}
                    disabled={isLoading}
                >
                    {isLoading ? 'Removing...' : 'Remove'}
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .assignee-picker {
        position: relative;
        display: inline-block;
    }

    .picker-trigger {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.25rem 0.5rem;
        background: none;
        border: 1px solid #e5e7eb;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.75rem;
        color: #6b7280;
        transition: all 0.15s;
    }

    .picker-trigger:hover:not(:disabled) {
        border-color: #3b82f6;
        color: #3b82f6;
    }

    .picker-trigger:disabled {
        cursor: default;
        opacity: 0.7;
    }

    :global(.dark) .picker-trigger {
        border-color: #4b5563;
        color: #9ca3af;
    }

    :global(.dark) .picker-trigger:hover:not(:disabled) {
        border-color: #3b82f6;
        color: #60a5fa;
    }

    .compact .picker-trigger {
        padding: 0.15rem 0.35rem;
    }

    .no-assignees {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }

    .assigned-avatars {
        display: flex;
        margin-left: -4px;
    }

    .avatar-mini {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 0.65rem;
        font-weight: 600;
        border: 2px solid white;
        margin-left: -6px;
    }

    .avatar-mini-img {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid white;
        margin-left: -6px;
        object-fit: cover;
    }

    :global(.dark) .avatar-mini,
    :global(.dark) .avatar-mini-img {
        border-color: #1f2937;
    }

    .avatar-mini:first-child,
    .avatar-mini-img:first-child {
        margin-left: 0;
    }

    .avatar-mini.more {
        background-color: #6b7280;
        font-size: 0.55rem;
    }

    .dropdown {
        position: absolute;
        bottom: 100%;
        left: 0;
        margin-bottom: 4px;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 -10px 15px -3px rgba(0, 0, 0, 0.1);
        min-width: 200px;
        max-height: 300px;
        overflow-y: auto;
        z-index: 50;
    }

    :global(.dark) .dropdown {
        background: #1f2937;
        border-color: #374151;
    }

    .error-message {
        padding: 0.5rem;
        font-size: 0.75rem;
        color: #dc2626;
        background-color: #fef2f2;
    }

    :global(.dark) .error-message {
        background-color: #450a0a;
        color: #fca5a5;
    }

    .section {
        padding: 0.5rem 0;
        border-bottom: 1px solid #e5e7eb;
    }

    .section:last-child {
        border-bottom: none;
    }

    :global(.dark) .section {
        border-bottom-color: #374151;
    }

    .section-label {
        padding: 0.25rem 0.75rem;
        font-size: 0.65rem;
        font-weight: 600;
        text-transform: uppercase;
        color: #6b7280;
        letter-spacing: 0.05em;
    }

    :global(.dark) .section-label {
        color: #9ca3af;
    }

    .member-option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.5rem 0.75rem;
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        font-size: 0.875rem;
    }

    .member-option:hover {
        background-color: #f3f4f6;
    }

    :global(.dark) .member-option:hover {
        background-color: #374151;
    }

    .member-option.assigned {
        cursor: default;
    }

    .member-option.assigned:hover {
        background: none;
    }

    .avatar-small {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 0.7rem;
        font-weight: 600;
        flex-shrink: 0;
    }

    .avatar-small-img {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        object-fit: cover;
        flex-shrink: 0;
    }

    .member-name {
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .you-label {
        color: #3b82f6;
        font-size: 0.75rem;
    }

    .role-tag {
        font-size: 0.65rem;
        color: #6b7280;
    }

    :global(.dark) .role-tag {
        color: #9ca3af;
    }

    .unassign-btn {
        padding: 0.15rem;
        background: none;
        border: none;
        cursor: pointer;
        color: #6b7280;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .unassign-btn:hover:not(:disabled) {
        background-color: #fef2f2;
        color: #dc2626;
    }

    :global(.dark) .unassign-btn:hover:not(:disabled) {
        background-color: #450a0a;
        color: #fca5a5;
    }

    .remove-btn {
        padding: 0.25rem 0.5rem;
        background: none;
        border: 1px solid #dc2626;
        border-radius: 4px;
        cursor: pointer;
        color: #dc2626;
        font-size: 0.7rem;
        font-weight: 500;
        transition: all 0.15s;
    }

    .remove-btn:hover:not(:disabled) {
        background-color: #dc2626;
        color: white;
    }

    :global(.dark) .remove-btn {
        border-color: #f87171;
        color: #f87171;
    }

    :global(.dark) .remove-btn:hover:not(:disabled) {
        background-color: #dc2626;
        color: white;
    }

    .all-assigned {
        padding: 0.75rem;
        text-align: center;
        font-size: 0.75rem;
        color: #6b7280;
    }

    .backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 40;
    }

    /* Confirmation Modal Styles */
    .confirm-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
        animation: fadeIn 0.15s ease-out;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @keyframes scaleIn {
        from { transform: scale(0.95); opacity: 0; }
        to { transform: scale(1); opacity: 1; }
    }

    .confirm-modal {
        background: white;
        border-radius: 12px;
        padding: 1.5rem;
        max-width: 320px;
        width: 90%;
        text-align: center;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        animation: scaleIn 0.15s ease-out;
    }

    :global(.dark) .confirm-modal {
        background: #1f2937;
        border: 1px solid #374151;
    }

    .confirm-icon {
        width: 56px;
        height: 56px;
        margin: 0 auto 1rem;
        background-color: #fef2f2;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #dc2626;
    }

    :global(.dark) .confirm-icon {
        background-color: #450a0a;
        color: #f87171;
    }

    .confirm-title {
        margin: 0 0 0.5rem;
        font-size: 1.1rem;
        font-weight: 600;
        color: #111827;
    }

    :global(.dark) .confirm-title {
        color: #f9fafb;
    }

    .confirm-message {
        margin: 0 0 1.25rem;
        font-size: 0.875rem;
        color: #6b7280;
        line-height: 1.5;
    }

    :global(.dark) .confirm-message {
        color: #9ca3af;
    }

    .confirm-message strong {
        color: #111827;
    }

    :global(.dark) .confirm-message strong {
        color: #f9fafb;
    }

    .confirm-actions {
        display: flex;
        gap: 0.75rem;
        justify-content: center;
    }

    .confirm-cancel {
        padding: 0.5rem 1rem;
        background: none;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        color: #374151;
        transition: all 0.15s;
    }

    .confirm-cancel:hover {
        background-color: #f3f4f6;
    }

    :global(.dark) .confirm-cancel {
        border-color: #4b5563;
        color: #d1d5db;
    }

    :global(.dark) .confirm-cancel:hover {
        background-color: #374151;
    }

    .confirm-remove {
        padding: 0.5rem 1rem;
        background-color: #dc2626;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 0.875rem;
        font-weight: 500;
        color: white;
        transition: all 0.15s;
    }

    .confirm-remove:hover:not(:disabled) {
        background-color: #b91c1c;
    }

    .confirm-remove:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .loading-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #e5e7eb;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
        margin-left: auto;
    }

    :global(.dark) .loading-spinner {
        border-color: #374151;
        border-top-color: #60a5fa;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
