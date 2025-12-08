<script lang="ts">
    import { onMount } from 'svelte';
    import type { ActivityLogForFrontend, ActivityAction } from '$lib/types/collaboration';
    import { getActionDisplayName } from '$lib/types/collaboration';

    export let workspaceId: string;
    export let maxItems: number = 20;
    export let compact: boolean = false;

    let activities: ActivityLogForFrontend[] = [];
    let isLoading = false;
    let errorMessage = '';

    onMount(() => {
        loadActivities();
    });

    async function loadActivities() {
        isLoading = true;
        errorMessage = '';

        try {
            const res = await fetch(`/api/workspace/activity?workspaceId=${workspaceId}&limit=${maxItems}`);
            if (res.ok) {
                const data = await res.json();
                activities = data.activities;
            } else {
                const data = await res.json();
                errorMessage = data.message || 'Failed to load activities';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to load activities';
        } finally {
            isLoading = false;
        }
    }

    function getActionIcon(action: ActivityAction): string {
        switch (action) {
            case 'workspace_created':
                return '🏗️';
            case 'member_invited':
            case 'member_joined':
                return '👋';
            case 'member_removed':
                return '🚪';
            case 'member_role_changed':
                return '👑';
            case 'task_created':
                return '✨';
            case 'task_updated':
                return '✏️';
            case 'task_completed':
                return '✅';
            case 'task_uncompleted':
                return '🔄';
            case 'task_deleted':
                return '🗑️';
            case 'task_assigned':
            case 'task_unassigned':
                return '👤';
            case 'task_moved':
                return '📦';
            case 'comment_added':
                return '💬';
            default:
                return '📋';
        }
    }

    function getActionColor(action: ActivityAction): string {
        if (action.includes('completed') || action.includes('created') || action.includes('joined')) {
            return '#10b981';
        }
        if (action.includes('deleted') || action.includes('removed')) {
            return '#ef4444';
        }
        if (action.includes('assigned') || action.includes('invited')) {
            return '#3b82f6';
        }
        return '#6b7280';
    }
</script>

<div class="activity-log" class:compact>
    <div class="header">
        <h3>Activity</h3>
        <button class="refresh-btn" on:click={loadActivities} disabled={isLoading} aria-label="Refresh activities">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class:spinning={isLoading}>
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
        </button>
    </div>

    {#if isLoading && activities.length === 0}
        <div class="loading">Loading activities...</div>
    {:else if errorMessage}
        <div class="error">{errorMessage}</div>
    {:else if activities.length === 0}
        <div class="empty">No activity yet</div>
    {:else}
        <ul class="activity-list">
            {#each activities as activity (activity.id)}
                <li class="activity-item">
                    <div class="activity-icon" style="color: {getActionColor(activity.action)}">
                        {getActionIcon(activity.action)}
                    </div>
                    <div class="activity-content">
                        <p class="activity-text">
                            <span class="username">{activity.username}</span>
                            {getActionDisplayName(activity.action)}
                            {#if activity.details && !activity.details.includes(activity.username)}
                                <span class="details">- {activity.details}</span>
                            {/if}
                        </p>
                        <span class="time-ago">{activity.timeAgo}</span>
                    </div>
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style>
    .activity-log {
        background: white;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        overflow: hidden;
    }

    :global(.dark) .activity-log {
        background: #1f2937;
        border-color: #374151;
    }

    .compact .activity-list {
        max-height: 200px;
    }

    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid #e5e7eb;
    }

    :global(.dark) .header {
        border-bottom-color: #374151;
    }

    .header h3 {
        margin: 0;
        font-size: 0.875rem;
        font-weight: 600;
    }

    .refresh-btn {
        padding: 0.25rem;
        background: none;
        border: none;
        cursor: pointer;
        color: #6b7280;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .refresh-btn:hover:not(:disabled) {
        background-color: #f3f4f6;
        color: #111827;
    }

    :global(.dark) .refresh-btn:hover:not(:disabled) {
        background-color: #374151;
        color: #f3f4f6;
    }

    .spinning {
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }

    .loading, .error, .empty {
        padding: 1.5rem;
        text-align: center;
        font-size: 0.875rem;
        color: #6b7280;
    }

    :global(.dark) .loading, 
    :global(.dark) .error, 
    :global(.dark) .empty {
        color: #9ca3af;
    }

    .error {
        color: #dc2626;
    }

    :global(.dark) .error {
        color: #fca5a5;
    }

    .activity-list {
        list-style: none;
        padding: 0;
        margin: 0;
        max-height: 400px;
        overflow-y: auto;
    }

    .activity-item {
        display: flex;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border-bottom: 1px solid #f3f4f6;
    }

    :global(.dark) .activity-item {
        border-bottom-color: #374151;
    }

    .activity-item:last-child {
        border-bottom: none;
    }

    .activity-icon {
        font-size: 1rem;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .activity-content {
        flex: 1;
        min-width: 0;
    }

    .activity-text {
        margin: 0;
        font-size: 0.8rem;
        color: #374151;
        line-height: 1.4;
    }

    :global(.dark) .activity-text {
        color: #d1d5db;
    }

    .username {
        font-weight: 600;
        color: #111827;
    }

    :global(.dark) .username {
        color: #f3f4f6;
    }

    .details {
        color: #6b7280;
    }

    :global(.dark) .details {
        color: #9ca3af;
    }

    .time-ago {
        font-size: 0.7rem;
        color: #9ca3af;
        margin-top: 0.125rem;
        display: block;
    }

    :global(.dark) .time-ago {
        color: #6b7280;
    }
</style>
