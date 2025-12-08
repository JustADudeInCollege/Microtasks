<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';
    import type { InvitationForFrontend } from '$lib/types/collaboration';
    import { getRoleDisplayName } from '$lib/types/collaboration';

    const dispatch = createEventDispatcher<{ accepted: void; declined: void }>();

    let invitations: InvitationForFrontend[] = [];
    let isLoading = false;
    let errorMessage = '';

    onMount(() => {
        loadInvitations();
    });

    async function loadInvitations() {
        isLoading = true;
        errorMessage = '';

        try {
            const res = await fetch('/api/workspace/invitations?mine=true');
            if (res.ok) {
                const data = await res.json();
                invitations = data.invitations;
            } else {
                const data = await res.json();
                errorMessage = data.message || 'Failed to load invitations';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to load invitations';
        } finally {
            isLoading = false;
        }
    }

    async function handleInvitation(invitationId: string, action: 'accept' | 'decline') {
        isLoading = true;
        errorMessage = '';

        try {
            const res = await fetch('/api/workspace/invitations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invitationId, action })
            });

            if (res.ok) {
                invitations = invitations.filter(i => i.id !== invitationId);
                if (action === 'accept') {
                    dispatch('accepted');
                } else {
                    dispatch('declined');
                }
            } else {
                const data = await res.json();
                errorMessage = data.message || `Failed to ${action} invitation`;
            }
        } catch (err: any) {
            errorMessage = err.message || `Failed to ${action} invitation`;
        } finally {
            isLoading = false;
        }
    }
</script>

{#if invitations.length > 0}
    <div class="invitations-banner">
        <div class="banner-header">
            <div class="banner-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"></path>
                </svg>
            </div>
            <h3>You have {invitations.length} pending workspace invitation{invitations.length > 1 ? 's' : ''}!</h3>
        </div>
        {#if errorMessage}
            <p class="error">{errorMessage}</p>
        {/if}
        <div class="invitations-list">
            {#each invitations as invitation (invitation.id)}
                <div class="invitation-card">
                    <div class="invitation-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                    </div>
                    <div class="invitation-info">
                        <p class="workspace-name">{invitation.workspaceName}</p>
                        <p class="inviter">
                            <strong>{invitation.invitedByUsername}</strong> invited you as 
                            <span class="role-badge {invitation.role}">{getRoleDisplayName(invitation.role)}</span>
                        </p>
                    </div>
                    <div class="invitation-actions">
                        <button 
                            class="accept-btn"
                            on:click={() => handleInvitation(invitation.id, 'accept')}
                            disabled={isLoading}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            Accept
                        </button>
                        <button 
                            class="decline-btn"
                            on:click={() => handleInvitation(invitation.id, 'decline')}
                            disabled={isLoading}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                            Decline
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    </div>
{/if}

<style>
    .invitations-banner {
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        border-radius: 12px;
        padding: 1.25rem;
        margin-bottom: 1.5rem;
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3);
        animation: pulse-glow 2s ease-in-out infinite;
    }

    @keyframes pulse-glow {
        0%, 100% { box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3); }
        50% { box-shadow: 0 4px 25px rgba(59, 130, 246, 0.5); }
    }

    .banner-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    .banner-icon {
        background: rgba(255, 255, 255, 0.2);
        padding: 0.5rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: bell-ring 1s ease-in-out;
    }

    @keyframes bell-ring {
        0%, 100% { transform: rotate(0); }
        10%, 30% { transform: rotate(10deg); }
        20%, 40% { transform: rotate(-10deg); }
        50% { transform: rotate(0); }
    }

    .banner-icon svg {
        color: white;
    }

    h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
        color: white;
    }

    .error {
        background: rgba(220, 38, 38, 0.2);
        color: #fecaca;
        font-size: 0.8rem;
        padding: 0.5rem;
        border-radius: 6px;
        margin-bottom: 0.75rem;
    }

    .invitations-list {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .invitation-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1rem;
        background-color: rgba(255, 255, 255, 0.95);
        border-radius: 10px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    :global(body.dark) .invitation-card {
        background-color: #1f2937;
    }

    .invitation-icon {
        background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
        padding: 0.5rem;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .invitation-icon svg {
        color: white;
    }

    .invitation-info {
        flex: 1;
        min-width: 0;
    }

    .workspace-name {
        margin: 0;
        font-weight: 700;
        font-size: 1rem;
        color: #1f2937;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    :global(body.dark) .workspace-name {
        color: #f3f4f6;
    }

    .inviter {
        margin: 0.25rem 0 0;
        font-size: 0.8rem;
        color: #6b7280;
    }

    :global(body.dark) .inviter {
        color: #9ca3af;
    }

    .invitation-actions {
        display: flex;
        gap: 0.5rem;
        flex-shrink: 0;
    }

    .accept-btn, .decline-btn {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-size: 0.85rem;
        font-weight: 600;
        cursor: pointer;
        border: none;
        transition: all 0.2s ease;
    }

    .accept-btn {
        background-color: #22c55e;
        color: white;
    }

    .accept-btn:hover:not(:disabled) {
        background-color: #16a34a;
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
    }

    .decline-btn {
        background-color: #fee2e2;
        color: #dc2626;
    }

    .decline-btn:hover:not(:disabled) {
        background-color: #fecaca;
        transform: translateY(-2px);
    }

    :global(body.dark) .decline-btn {
        background-color: rgba(239, 68, 68, 0.15);
        color: #f87171;
    }

    :global(body.dark) .decline-btn:hover:not(:disabled) {
        background-color: rgba(239, 68, 68, 0.25);
    }

    .accept-btn:disabled, .decline-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
    }

    .role-badge {
        display: inline-block;
        padding: 0.15rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.025em;
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

    :global(body.dark) .role-badge.admin {
        background-color: #1e3a8a;
        color: #dbeafe;
    }

    :global(body.dark) .role-badge.editor {
        background-color: #14532d;
        color: #dcfce7;
    }

    :global(body.dark) .role-badge.viewer {
        background-color: #374151;
        color: #d1d5db;
    }

    /* Responsive */
    @media (max-width: 640px) {
        .invitation-card {
            flex-direction: column;
            align-items: flex-start;
        }

        .invitation-actions {
            width: 100%;
            margin-top: 0.75rem;
        }

        .accept-btn, .decline-btn {
            flex: 1;
            justify-content: center;
        }
    }
</style>
