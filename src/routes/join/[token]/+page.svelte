<script lang="ts">
    import { enhance } from '$app/forms';
    import { goto } from '$app/navigation';
    import { getRoleDisplayName } from '$lib/types/collaboration';

    export let data;
    
    let isJoining = false;
    let formError = '';

    $: hasError = !!data.error;
    $: isLoggedIn = data.isLoggedIn;
    $: isAlreadyMember = data.isAlreadyMember;

    function handleJoinEnhance() {
        isJoining = true;
        formError = '';

        return async ({ result, update }: { result: any; update: () => Promise<void> }) => {
            isJoining = false;
            
            if (result.type === 'failure') {
                formError = result.data?.error || 'Failed to join workspace';
            } else if (result.type === 'redirect') {
                // Will auto-redirect
            }
            await update();
        };
    }

    function goToLogin() {
        // Store the current URL to redirect back after login
        const returnUrl = encodeURIComponent(window.location.pathname);
        goto(`/login?returnUrl=${returnUrl}`);
    }

    function goToWorkspace() {
        goto(`/workspace/${data.workspaceId}`);
    }
</script>

<svelte:head>
    <title>Microtask</title>
</svelte:head>

<div class="join-page">
    <a href="/" class="logo-link">
        <img src="/logonamin.png" alt="Microtasks" class="logo" />
    </a>
    <div class="join-card">
        {#if hasError}
            <div class="error-state">
                <div class="error-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="15" y1="9" x2="9" y2="15"></line>
                        <line x1="9" y1="9" x2="15" y2="15"></line>
                    </svg>
                </div>
                <h1>Unable to Join</h1>
                <p class="error-message">{data.error}</p>
                <a href="/dashboard" class="btn-primary">Go to Dashboard</a>
            </div>
        {:else if isAlreadyMember}
            <div class="success-state">
                <div class="success-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <h1>You're Already a Member</h1>
                <p>You already have access to <strong>{data.workspaceName}</strong>.</p>
                <button class="btn-primary" on:click={goToWorkspace}>Open Workspace</button>
            </div>
        {:else}
            <div class="invite-state">
                <div class="invite-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                
                <h1>You're Invited!</h1>
                
                <div class="invite-details">
                    <p><strong>{data.createdByUsername}</strong> has invited you to join:</p>
                    <div class="workspace-name">{data.workspaceName}</div>
                    <div class="role-info">
                        You'll join as: <span class="role-badge {data.role}">{getRoleDisplayName(data.role)}</span>
                    </div>
                </div>

                {#if formError}
                    <div class="form-error">{formError}</div>
                {/if}

                {#if isLoggedIn}
                    <form method="POST" action="?/join" use:enhance={handleJoinEnhance}>
                        <button type="submit" class="btn-primary btn-join" disabled={isJoining}>
                            {#if isJoining}
                                <span class="spinner"></span>
                                Joining...
                            {:else}
                                Join Workspace
                            {/if}
                        </button>
                    </form>
                {:else}
                    <div class="login-prompt">
                        <p>You need to be logged in to join this workspace.</p>
                        <button class="btn-primary" on:click={goToLogin}>
                            Log In to Continue
                        </button>
                        <p class="signup-hint">
                            Don't have an account? <a href="/signup?returnUrl={encodeURIComponent(`/join/${data.token}`)}">Sign up</a>
                        </p>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .join-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background-image: url('/invitebg.png');
        background-size: cover;
        background-position: center bottom;
        background-repeat: no-repeat;
        padding: 1rem;
        position: relative;
    }

    :global(.dark) .join-page {
        background-image: url('/invitebgdark.png');
    }

    .logo-link {
        position: absolute;
        top: 1.5rem;
        right: 1.5rem;
    }

    .logo {
        height: 40px;
        width: auto;
    }

    :global(.dark) .logo {
        content: url('/logonamindarkmode.png');
    }

    .join-card {
        background: white;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        padding: 3rem;
        max-width: 450px;
        width: 100%;
        text-align: center;
    }

    :global(.dark) .join-card {
        background: #1f2937;
        color: #f3f4f6;
    }

    h1 {
        font-size: 1.75rem;
        font-weight: 700;
        margin: 1rem 0;
        color: #111827;
    }

    :global(.dark) h1 {
        color: #f3f4f6;
    }

    .error-state .error-icon,
    .success-state .success-icon,
    .invite-state .invite-icon {
        margin-bottom: 1rem;
    }

    .error-state .error-icon svg {
        color: #dc2626;
    }

    .success-state .success-icon svg {
        color: #10b981;
    }

    .invite-state .invite-icon svg {
        color: #6366f1;
    }

    .error-message {
        color: #6b7280;
        margin-bottom: 1.5rem;
    }

    .invite-details {
        background: #f9fafb;
        border-radius: 12px;
        padding: 1.5rem;
        margin: 1.5rem 0;
    }

    :global(.dark) .invite-details {
        background: #374151;
    }

    .invite-details p {
        color: #6b7280;
        margin-bottom: 0.75rem;
    }

    :global(.dark) .invite-details p {
        color: #9ca3af;
    }

    .workspace-name {
        font-size: 1.5rem;
        font-weight: 700;
        color: #111827;
        margin-bottom: 0.75rem;
    }

    :global(.dark) .workspace-name {
        color: #f3f4f6;
    }

    .role-info {
        color: #6b7280;
        font-size: 0.875rem;
    }

    :global(.dark) .role-info {
        color: #9ca3af;
    }

    .role-badge {
        display: inline-block;
        padding: 0.25rem 0.75rem;
        border-radius: 9999px;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
    }

    .role-badge.viewer {
        background: #e5e7eb;
        color: #4b5563;
    }

    .role-badge.editor {
        background: #d1fae5;
        color: #065f46;
    }

    .role-badge.admin {
        background: #dbeafe;
        color: #1e40af;
    }

    .role-badge.owner {
        background: #fef3c7;
        color: #92400e;
    }

    .btn-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
        color: white;
        border: none;
        padding: 0.875rem 2rem;
        border-radius: 10px;
        font-size: 1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        text-decoration: none;
        width: 100%;
    }

    .btn-primary:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 10px 20px -10px rgba(99, 102, 241, 0.5);
    }

    .btn-primary:disabled {
        opacity: 0.7;
        cursor: not-allowed;
    }

    .btn-join {
        margin-top: 1rem;
    }

    .form-error {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #dc2626;
        padding: 0.75rem 1rem;
        border-radius: 8px;
        font-size: 0.875rem;
        margin-bottom: 1rem;
    }

    :global(.dark) .form-error {
        background: #450a0a;
        border-color: #7f1d1d;
        color: #fca5a5;
    }

    .login-prompt p {
        color: #6b7280;
        margin-bottom: 1rem;
    }

    :global(.dark) .login-prompt p {
        color: #9ca3af;
    }

    .signup-hint {
        margin-top: 1rem;
        font-size: 0.875rem;
    }

    .signup-hint a {
        color: #6366f1;
        font-weight: 600;
        text-decoration: none;
    }

    .signup-hint a:hover {
        text-decoration: underline;
    }

    .spinner {
        width: 18px;
        height: 18px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }

    @media (max-width: 480px) {
        .join-card {
            padding: 2rem 1.5rem;
        }

        h1 {
            font-size: 1.5rem;
        }

        .workspace-name {
            font-size: 1.25rem;
        }
    }
</style>
