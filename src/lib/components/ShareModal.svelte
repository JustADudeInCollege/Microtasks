<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { MemberRole, WorkspaceMember, WorkspaceInvitation, ShareLinkForFrontend } from '$lib/types/collaboration';
    import { getRoleDisplayName } from '$lib/types/collaboration';

    export let workspaceId: string;
    export let workspaceName: string = 'Workspace';
    export let currentUserRole: MemberRole = 'viewer';
    export let isOpen: boolean = false;

    const dispatch = createEventDispatcher();
    
    let inviteEmail = '';
    let inviteRole: MemberRole = 'editor';
    let isLoading = false;
    let isInviting = false;
    let errorMessage = '';
    let successMessage = '';
    
    let members: WorkspaceMember[] = [];
    let pendingInvitations: WorkspaceInvitation[] = [];
    
    // Share link state
    let shareLinks: ShareLinkForFrontend[] = [];
    let showLinkCreator = false;
    let linkRole: MemberRole = 'viewer';
    let linkExpiresDays: number | null = 7; // Default 7 days
    let linkUsageLimit: number | null = null;
    let isCreatingLink = false;
    let copiedLinkId: string | null = null;
    let failedImages: Set<string> = new Set();

    function handleImageError(memberId: string) {
        failedImages.add(memberId);
        failedImages = failedImages; // trigger reactivity
    }

    $: canManageMembers = currentUserRole === 'owner' || currentUserRole === 'admin';
    
    // Load data when modal opens
    $: if (isOpen) {
        loadData();
    }

    async function loadData() {
        isLoading = true;
        errorMessage = '';
        
        try {
            // Fetch members
            const membersRes = await fetch(`/api/workspace/members?workspaceId=${workspaceId}`);
            if (membersRes.ok) {
                const data = await membersRes.json();
                members = data.members;
            }
            
            // Fetch pending invitations and share links if can manage
            if (canManageMembers) {
                const invitesRes = await fetch(`/api/workspace/invitations?workspaceId=${workspaceId}`);
                if (invitesRes.ok) {
                    const data = await invitesRes.json();
                    pendingInvitations = data.invitations;
                }
                
                // Fetch share links
                const linksRes = await fetch(`/api/workspace/share-link?workspaceId=${workspaceId}`);
                if (linksRes.ok) {
                    const data = await linksRes.json();
                    shareLinks = data.shareLinks || [];
                }
            }
        } catch (err: any) {
            errorMessage = 'Failed to load workspace data';
        } finally {
            isLoading = false;
        }
    }

    async function sendInvitation() {
        if (!inviteEmail.trim()) {
            errorMessage = 'Please enter an email address';
            return;
        }

        isInviting = true;
        errorMessage = '';
        successMessage = '';

        try {
            const res = await fetch('/api/workspace/invitations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspaceId,
                    email: inviteEmail.trim().toLowerCase(),
                    role: inviteRole
                })
            });

            const data = await res.json();
            
            if (res.ok) {
                successMessage = `Invitation sent to ${inviteEmail}`;
                inviteEmail = '';
                pendingInvitations = [...pendingInvitations, data.invitation];
            } else {
                errorMessage = data.message || 'Failed to send invitation';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to send invitation';
        } finally {
            isInviting = false;
        }
    }

    async function cancelInvitation(invitationId: string) {
        if (!confirm('Cancel this invitation?')) return;
        
        isLoading = true;
        try {
            const res = await fetch('/api/workspace/invitations', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ invitationId, workspaceId })
            });

            if (res.ok) {
                pendingInvitations = pendingInvitations.filter(i => i.id !== invitationId);
            } else {
                const data = await res.json();
                errorMessage = data.message || 'Failed to cancel invitation';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to cancel invitation';
        } finally {
            isLoading = false;
        }
    }

    async function updateMemberRole(userId: string, newRole: string) {
        isLoading = true;
        errorMessage = '';
        
        try {
            const res = await fetch('/api/workspace/members', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId, targetUserId: userId, newRole })
            });

            if (res.ok) {
                members = members.map(m => 
                    m.userId === userId ? { ...m, role: newRole as MemberRole } : m
                );
            } else {
                const data = await res.json();
                errorMessage = data.message || 'Failed to update role';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to update role';
        } finally {
            isLoading = false;
        }
    }

    async function removeMember(userId: string, username: string) {
        if (!confirm(`Remove ${username} from this workspace?`)) return;
        
        isLoading = true;
        errorMessage = '';
        
        try {
            const res = await fetch('/api/workspace/members', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ workspaceId, targetUserId: userId })
            });

            if (res.ok) {
                members = members.filter(m => m.userId !== userId);
                dispatch('memberRemoved', { userId });
            } else {
                const data = await res.json();
                errorMessage = data.message || 'Failed to remove member';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to remove member';
        } finally {
            isLoading = false;
        }
    }

    // --- Share Link Functions ---
    async function createShareLink() {
        isCreatingLink = true;
        errorMessage = '';
        successMessage = '';

        try {
            const res = await fetch('/api/workspace/share-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workspaceId,
                    role: linkRole,
                    expiresInDays: linkExpiresDays,
                    usageLimit: linkUsageLimit
                })
            });

            const data = await res.json();

            if (res.ok) {
                shareLinks = [data.shareLink, ...shareLinks];
                showLinkCreator = false;
                successMessage = 'Share link created!';
                // Auto-copy to clipboard
                await copyToClipboard(data.shareLink.url, data.shareLink.id);
            } else {
                errorMessage = data.message || 'Failed to create share link';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to create share link';
        } finally {
            isCreatingLink = false;
        }
    }

    async function deleteShareLink(linkId: string) {
        if (!confirm('Deactivate this share link? Anyone with the link will no longer be able to join.')) return;

        isLoading = true;
        errorMessage = '';

        try {
            const res = await fetch('/api/workspace/share-link', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ linkId, workspaceId })
            });

            if (res.ok) {
                shareLinks = shareLinks.filter(l => l.id !== linkId);
                successMessage = 'Share link deactivated';
            } else {
                const data = await res.json();
                errorMessage = data.message || 'Failed to deactivate link';
            }
        } catch (err: any) {
            errorMessage = err.message || 'Failed to deactivate link';
        } finally {
            isLoading = false;
        }
    }

    async function copyToClipboard(url: string, linkId: string) {
        try {
            await navigator.clipboard.writeText(url);
            copiedLinkId = linkId;
            setTimeout(() => {
                copiedLinkId = null;
            }, 2000);
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = url;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            copiedLinkId = linkId;
            setTimeout(() => {
                copiedLinkId = null;
            }, 2000);
        }
    }

    function formatExpiryDate(expiresAt: string | null): string {
        if (!expiresAt) return 'Never expires';
        const date = new Date(expiresAt);
        const now = new Date();
        if (date < now) return 'Expired';
        const days = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (days === 1) return 'Expires in 1 day';
        if (days < 7) return `Expires in ${days} days`;
        return `Expires ${date.toLocaleDateString()}`;
    }

    function closeModal() {
        isOpen = false;
        showLinkCreator = false;
        dispatch('close');
    }

    function handleBackdropClick(e: MouseEvent) {
        if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
            closeModal();
        }
    }
</script>

{#if isOpen}
    <div 
        class="modal-backdrop"
        on:click={handleBackdropClick}
        on:keydown={(e) => e.key === 'Escape' && closeModal()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        tabindex="-1"
    >
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="share-modal-title">Share "{workspaceName}"</h2>
                <button class="close-btn" on:click={closeModal} aria-label="Close modal">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>

            {#if errorMessage}
                <div class="message error">{errorMessage}</div>
            {/if}
            
            {#if successMessage}
                <div class="message success">{successMessage}</div>
            {/if}

            {#if canManageMembers}
                <div class="invite-section">
                    <h3>Invite People</h3>
                    <div class="invite-form">
                        <input 
                            type="email" 
                            bind:value={inviteEmail}
                            placeholder="Enter email address"
                            disabled={isInviting}
                        />
                        <select bind:value={inviteRole} disabled={isInviting}>
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Admin</option>
                        </select>
                        <button 
                            on:click={sendInvitation} 
                            disabled={isInviting || !inviteEmail.trim()}
                            class="invite-btn"
                        >
                            {isInviting ? 'Loading...' : 'Invite'}
                        </button>
                    </div>
                    <p class="role-hint">
                        <strong>Viewer:</strong> Can view tasks •
                        <strong>Editor:</strong> Can edit tasks •
                        <strong>Admin:</strong> Can manage members
                    </p>
                </div>

                <!-- Share Link Section -->
                <div class="share-link-section">
                    <div class="section-header">
                        <h3>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                            </svg>
                            Share via Link
                        </h3>
                        {#if !showLinkCreator}
                            <button class="create-link-btn" on:click={() => showLinkCreator = true}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"></line>
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                Create Link
                            </button>
                        {/if}
                    </div>

                    {#if showLinkCreator}
                        <div class="link-creator">
                            <div class="link-options">
                                <div class="option-group">
                                    <label>Access Level</label>
                                    <select bind:value={linkRole}>
                                        <option value="viewer">Viewer</option>
                                        <option value="editor">Editor</option>
                                        {#if currentUserRole === 'owner'}
                                            <option value="admin">Admin</option>
                                        {/if}
                                    </select>
                                </div>
                                <div class="option-group">
                                    <label>Expires</label>
                                    <select bind:value={linkExpiresDays}>
                                        <option value={1}>1 day</option>
                                        <option value={7}>7 days</option>
                                        <option value={30}>30 days</option>
                                        <option value={null}>Never</option>
                                    </select>
                                </div>
                                <div class="option-group">
                                    <label>Usage Limit</label>
                                    <select bind:value={linkUsageLimit}>
                                        <option value={null}>Unlimited</option>
                                        <option value={1}>1 use</option>
                                        <option value={5}>5 uses</option>
                                        <option value={10}>10 uses</option>
                                        <option value={25}>25 uses</option>
                                    </select>
                                </div>
                            </div>
                            <div class="link-creator-actions">
                                <button class="btn-cancel" on:click={() => showLinkCreator = false}>
                                    Cancel
                                </button>
                                <button class="btn-create" on:click={createShareLink} disabled={isCreatingLink}>
                                    {isCreatingLink ? 'Creating...' : 'Create & Copy Link'}
                                </button>
                            </div>
                        </div>
                    {/if}

                    {#if shareLinks.length > 0}
                        <ul class="share-links-list">
                            {#each shareLinks as link (link.id)}
                                <li class="share-link-item">
                                    <div class="link-info">
                                        <div class="link-url">
                                            <input type="text" value={link.url} readonly />
                                            <button 
                                                class="copy-btn"
                                                on:click={() => copyToClipboard(link.url, link.id)}
                                                title="Copy link"
                                            >
                                                {#if copiedLinkId === link.id}
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                        <polyline points="20 6 9 17 4 12"></polyline>
                                                    </svg>
                                                {:else}
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                                    </svg>
                                                {/if}
                                            </button>
                                        </div>
                                        <div class="link-meta">
                                            <span class="role-badge {link.role}">{getRoleDisplayName(link.role)}</span>
                                            <span class="link-expiry">{formatExpiryDate(link.expiresAt)}</span>
                                            {#if link.usageLimit}
                                                <span class="link-usage">{link.usageCount}/{link.usageLimit} uses</span>
                                            {:else}
                                                <span class="link-usage">{link.usageCount} uses</span>
                                            {/if}
                                        </div>
                                    </div>
                                    <button 
                                        class="delete-link-btn"
                                        on:click={() => deleteShareLink(link.id)}
                                        disabled={isLoading}
                                        title="Deactivate link"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </li>
                            {/each}
                        </ul>
                    {:else if !showLinkCreator}
                        <p class="no-links-hint">Create a share link to let anyone with the link join this workspace.</p>
                    {/if}
                </div>
            {/if}

            {#if pendingInvitations.length > 0 && canManageMembers}
                <div class="pending-section">
                    <h3>Pending Invitations</h3>
                    <ul class="invitations-list">
                        {#each pendingInvitations as invitation (invitation.id)}
                            <li class="invitation-item">
                                <div class="invitation-info">
                                    <span class="email">{invitation.invitedEmail}</span>
                                    <span class="role-badge {invitation.role}">{getRoleDisplayName(invitation.role)}</span>
                                </div>
                                <button 
                                    class="cancel-btn" 
                                    on:click={() => cancelInvitation(invitation.id)}
                                    disabled={isLoading}
                                    aria-label="Cancel invitation"
                                >
                                    Cancel
                                </button>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

            <div class="members-section">
                <h3>Members ({members.length})</h3>
                {#if isLoading && members.length === 0}
                    <p class="loading">Loading members...</p>
                {:else}
                    <ul class="members-list">
                        {#each members as member (member.id)}
                            <li class="member-item">
                                <div class="member-info">
                                    {#if member.photoURL && !failedImages.has(member.id)}
                                        <img 
                                            class="avatar-img" 
                                            src={member.photoURL} 
                                            alt={member.username}
                                            on:error={() => handleImageError(member.id)}
                                        />
                                    {:else}
                                        <div class="avatar">
                                            {member.username.charAt(0).toUpperCase()}
                                        </div>
                                    {/if}
                                    <div class="details">
                                        <span class="name">
                                            {member.username}
                                            {#if member.isCurrentUser}
                                                <span class="you-badge">(You)</span>
                                            {/if}
                                        </span>
                                        <span class="email">{member.email}</span>
                                    </div>
                                </div>
                                <div class="member-actions">
                                    {#if member.role === 'owner'}
                                        <span class="role-badge owner">Owner</span>
                                    {:else if canManageMembers && !member.isCurrentUser}
                                        <select 
                                            value={member.role} 
                                            on:change={(e) => updateMemberRole(member.userId, e.currentTarget.value)}
                                            disabled={isLoading}
                                        >
                                            <option value="viewer">Viewer</option>
                                            <option value="editor">Editor</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                        <button 
                                            class="remove-btn"
                                            on:click={() => removeMember(member.userId, member.username)}
                                            disabled={isLoading}
                                            aria-label="Remove member"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                            </svg>
                                        </button>
                                    {:else}
                                        <span class="role-badge {member.role}">{getRoleDisplayName(member.role)}</span>
                                    {/if}
                                </div>
                            </li>
                        {/each}
                    </ul>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .modal-backdrop {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1rem;
    }

    .modal-content {
        background: white;
        border-radius: 12px;
        width: 100%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }

    :global(.dark) .modal-content {
        background: #1f2937;
        color: #f3f4f6;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #e5e7eb;
    }

    :global(.dark) .modal-header {
        border-bottom-color: #374151;
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
    }

    .close-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.25rem;
        color: #6b7280;
        border-radius: 4px;
    }

    .close-btn:hover {
        background-color: #f3f4f6;
        color: #111827;
    }

    :global(.dark) .close-btn:hover {
        background-color: #374151;
        color: #f3f4f6;
    }

    .message {
        padding: 0.75rem 1.5rem;
        font-size: 0.875rem;
    }

    .message.error {
        background-color: #fef2f2;
        color: #dc2626;
    }

    .message.success {
        background-color: #f0fdf4;
        color: #16a34a;
    }

    :global(.dark) .message.error {
        background-color: #450a0a;
        color: #fca5a5;
    }

    :global(.dark) .message.success {
        background-color: #052e16;
        color: #86efac;
    }

    .invite-section, .pending-section, .members-section {
        padding: 1rem 1.5rem;
        border-bottom: 1px solid #e5e7eb;
    }

    :global(.dark) .invite-section, 
    :global(.dark) .pending-section, 
    :global(.dark) .members-section {
        border-bottom-color: #374151;
    }

    .members-section {
        border-bottom: none;
    }

    h3 {
        margin: 0 0 0.75rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: #374151;
    }

    :global(.dark) h3 {
        color: #d1d5db;
    }

    .invite-form {
        display: flex;
        gap: 0.5rem;
    }

    .invite-form input {
        flex: 1;
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.875rem;
    }

    :global(.dark) .invite-form input {
        background-color: #374151;
        border-color: #4b5563;
        color: #f3f4f6;
    }

    .invite-form select {
        padding: 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.875rem;
        background: white;
    }

    :global(.dark) .invite-form select {
        background-color: #374151;
        border-color: #4b5563;
        color: #f3f4f6;
    }

    .invite-btn {
        padding: 0.5rem 1rem;
        background-color: #3b82f6;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
    }

    .invite-btn:hover:not(:disabled) {
        background-color: #2563eb;
    }

    .invite-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .role-hint {
        margin-top: 0.5rem;
        font-size: 0.75rem;
        color: #6b7280;
    }

    :global(.dark) .role-hint {
        color: #9ca3af;
    }

    .invitations-list, .members-list {
        list-style: none;
        padding: 0;
        margin: 0;
    }

    .invitation-item, .member-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem 0;
        border-bottom: 1px solid #f3f4f6;
    }

    :global(.dark) .invitation-item,
    :global(.dark) .member-item {
        border-bottom-color: #374151;
    }

    .invitation-item:last-child, .member-item:last-child {
        border-bottom: none;
    }

    .invitation-info, .member-info {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background-color: #3b82f6;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
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

    .details {
        display: flex;
        flex-direction: column;
    }

    .name {
        font-weight: 500;
        font-size: 0.875rem;
    }

    .email {
        font-size: 0.75rem;
        color: #6b7280;
    }

    :global(.dark) .email {
        color: #9ca3af;
    }

    .you-badge {
        color: #3b82f6;
        font-weight: 400;
    }

    .member-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }

    .member-actions select {
        padding: 0.25rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 0.75rem;
        background: white;
    }

    :global(.dark) .member-actions select {
        background-color: #374151;
        border-color: #4b5563;
        color: #f3f4f6;
    }

    .role-badge {
        padding: 0.25rem 0.5rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 500;
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

    .cancel-btn {
        padding: 0.25rem 0.5rem;
        background: none;
        border: 1px solid #d1d5db;
        border-radius: 4px;
        font-size: 0.75rem;
        cursor: pointer;
        color: #6b7280;
    }

    .cancel-btn:hover:not(:disabled) {
        border-color: #dc2626;
        color: #dc2626;
    }

    .remove-btn {
        padding: 0.25rem;
        background: none;
        border: none;
        cursor: pointer;
        color: #6b7280;
        border-radius: 4px;
    }

    .remove-btn:hover:not(:disabled) {
        background-color: #fef2f2;
        color: #dc2626;
    }

    :global(.dark) .remove-btn:hover:not(:disabled) {
        background-color: #450a0a;
        color: #fca5a5;
    }

    .loading {
        text-align: center;
        color: #6b7280;
        font-size: 0.875rem;
        padding: 1rem;
    }

    /* Share Link Section Styles */
    .share-link-section {
        padding: 1rem;
        border-bottom: 1px solid #e5e7eb;
    }

    :global(.dark) .share-link-section {
        border-bottom-color: #374151;
    }

    .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.75rem;
    }

    .section-header h3 {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
        font-size: 0.875rem;
        font-weight: 600;
        color: #374151;
    }

    :global(.dark) .section-header h3 {
        color: #e5e7eb;
    }

    .create-link-btn {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        padding: 0.375rem 0.75rem;
        background: #6366f1;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 0.75rem;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
    }

    .create-link-btn:hover {
        background: #4f46e5;
    }

    .link-creator {
        background: #f9fafb;
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 0.75rem;
    }

    :global(.dark) .link-creator {
        background: #1f2937;
    }

    .link-options {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 0.75rem;
        margin-bottom: 1rem;
    }

    .option-group {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }

    .option-group label {
        font-size: 0.7rem;
        font-weight: 500;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.025em;
    }

    :global(.dark) .option-group label {
        color: #9ca3af;
    }

    .option-group select {
        padding: 0.375rem 0.5rem;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.8rem;
        background: white;
        cursor: pointer;
    }

    :global(.dark) .option-group select {
        background: #374151;
        border-color: #4b5563;
        color: #e5e7eb;
    }

    .link-creator-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
    }

    .btn-cancel {
        padding: 0.5rem 1rem;
        background: none;
        border: 1px solid #d1d5db;
        border-radius: 6px;
        font-size: 0.8rem;
        cursor: pointer;
        color: #6b7280;
    }

    :global(.dark) .btn-cancel {
        border-color: #4b5563;
        color: #9ca3af;
    }

    .btn-cancel:hover {
        background: #f3f4f6;
    }

    :global(.dark) .btn-cancel:hover {
        background: #374151;
    }

    .btn-create {
        padding: 0.5rem 1rem;
        background: #6366f1;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
    }

    .btn-create:hover:not(:disabled) {
        background: #4f46e5;
    }

    .btn-create:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }

    .share-links-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }

    .share-link-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem;
        background: #f9fafb;
        border-radius: 8px;
    }

    :global(.dark) .share-link-item {
        background: #1f2937;
    }

    .link-info {
        flex: 1;
        min-width: 0;
    }

    .link-url {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        margin-bottom: 0.25rem;
    }

    .link-url input {
        flex: 1;
        padding: 0.25rem 0.5rem;
        background: white;
        border: 1px solid #e5e7eb;
        border-radius: 4px;
        font-size: 0.75rem;
        font-family: monospace;
        color: #4b5563;
        min-width: 0;
    }

    :global(.dark) .link-url input {
        background: #374151;
        border-color: #4b5563;
        color: #d1d5db;
    }

    .copy-btn {
        padding: 0.375rem;
        background: #6366f1;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .copy-btn:hover {
        background: #4f46e5;
    }

    .link-meta {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
    }

    .link-expiry,
    .link-usage {
        font-size: 0.7rem;
        color: #6b7280;
    }

    :global(.dark) .link-expiry,
    :global(.dark) .link-usage {
        color: #9ca3af;
    }

    .delete-link-btn {
        padding: 0.375rem;
        background: none;
        border: none;
        color: #6b7280;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .delete-link-btn:hover:not(:disabled) {
        background: #fef2f2;
        color: #dc2626;
    }

    :global(.dark) .delete-link-btn:hover:not(:disabled) {
        background: #450a0a;
        color: #fca5a5;
    }

    .no-links-hint {
        font-size: 0.8rem;
        color: #6b7280;
        margin: 0;
    }

    :global(.dark) .no-links-hint {
        color: #9ca3af;
    }

    @media (max-width: 480px) {
        .link-options {
            grid-template-columns: 1fr;
        }
    }
</style>
