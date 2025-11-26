<script lang="ts">
	import type { TaskForFrontend } from '$lib/types/task'; // Ensure path is correct
	import { createEventDispatcher } from 'svelte';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
    import { enhance } from '$app/forms'; // For form enhancement
    import type { SubmitFunction, ActionResult } from '@sveltejs/kit';
    import LoadingIndicator from '$lib/components/LoadingIndicator.svelte'; // Import LoadingIndicator

	export let task: TaskForFrontend | null;
	export let isOpen: boolean;

    let isLoadingOperation = false; // New state for loading indicator

	const dispatch = createEventDispatcher();

    // --- Edit Mode State ---
    let isEditMode = false;
    let editTitle = '';
    let editDescription = '';
    let editDueDateISO: string | null = ''; // Store as string for input type="date"
    let editDueTime: string | null = '';   // Store as string for input type="time"
    let editPriority: string | number | null = 'standard';
    let editFormSubmitting = false;
    let editFormError: string | null = null;

    // --- Delete Confirmation State ---
    let showDeleteConfirm = false;

    // Reactive statement to initialize edit form when task changes or edit mode starts
    $: if (task && isEditMode) {
        editTitle = task.title;
        editDescription = task.description || '';
        editDueDateISO = task.dueDateISO || '';
        editDueTime = task.dueTime || '';
        editPriority = task.priority || 'standard';
        editFormError = null; // Reset error on mode change
    } else if (!isEditMode) {
        editFormError = null; // Clear error when exiting edit mode
    }


    function closeModalAndReset() {
        isEditMode = false; // Ensure edit mode is reset
        showDeleteConfirm = false; // Ensure delete confirm is reset
        isLoadingOperation = false; // Stop loading when modal closes
		dispatch('close');
	}

    function toggleEditMode() {
        isEditMode = !isEditMode;
        if (!isEditMode) { // If exiting edit mode, clear errors
            editFormError = null;
        }
        // Form fields are initialized by the reactive block above
    }

    function promptDelete() {
        showDeleteConfirm = true;
    }

    function cancelDelete() {
        showDeleteConfirm = false;
    }

    function confirmDelete() {
        if (task) {
            isLoadingOperation = true; // Start loading for delete operation
            dispatch('delete', { taskId: task.id });
        }
        showDeleteConfirm = false;
        // closeModalAndReset(); // Parent will handle closing after delete success/failure
    }


	function formatDate(isoString: string | null): string {
		if (!isoString) return 'N/A';
		try {
            let dateToFormat = new Date(isoString);
            if (isoString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                 const [year, month, day] = isoString.split('-').map(Number);
                 dateToFormat = new Date(year, month -1, day); 
            }
			return dateToFormat.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
		} catch { return 'Invalid Date'; }
	}

	function formatStatus(status: TaskForFrontend['status']): string {
		switch (status) {
			case 'pending': return 'Pending';
			case 'complete': return 'Complete';
			case 'incomplete': return 'Incomplete (Past Due)';
			case 'late': return 'Completed Late';
			default: return 'Unknown';
		}
	}

    function getPriorityClass(priority: string | number | null): string {
        if (typeof priority === 'string') return `priority-text-${priority.toLowerCase()}`;
        return 'priority-text-standard';
    }

    const handleUpdateTaskEnhance: SubmitFunction = ({formData}) => {
        editFormSubmitting = true;
        editFormError = null;
        isLoadingOperation = true; // Start loading

        if (!task) {
            editFormError = "Task data is missing.";
            editFormSubmitting = false;
            isLoadingOperation = false; // Stop loading on error
            return ({update}) => update(); // Cancel SvelteKit submission
        }
        formData.append('taskId', task.id); // Ensure taskId is part of the form data for the server

        // Ensure empty strings for optional fields are sent as such or handled by server
        if (editDescription.trim() === '') formData.set('description', ''); // Or remove if server handles empty as "no change"
        // For dueDate/dueTime, if they are empty strings, they should be sent. Server action handles nulling.

        return async ({ result, update }) => {
            editFormSubmitting = false;
            isLoadingOperation = false; // Stop loading on completion

            if (result.type === 'failure' && result.data?.taskForm?.error) {
                editFormError = result.data.taskForm.error;
            } else if (result.type === 'success') {
                dispatch('updated'); // Notify parent that task was updated (parent should refresh)
                isEditMode = false; // Exit edit mode on success
                // closeModalAndReset(); // Optionally close the whole modal
            } else if (result.type === 'error') {
                editFormError = result.error.message || "An unexpected error occurred during update.";
            }
            // No need to call `await update()` here if parent handles data refresh via 'updated' event
        };
    };

</script>

{#if isOpen && task}
	<div
		class="modal-backdrop"
		on:click={closeModalAndReset}
		transition:fly={{ y: 20, duration: 200, easing: quintOut }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="task-detail-title"
	>
        {#if isLoadingOperation}
            <LoadingIndicator fullScreen={true} message="Processing task..." />
        {/if}
		<div class="modal-content" on:click|stopPropagation transition:fly={{ y: -20, duration: 300, easing: quintOut }}>
			<button class="modal-close-button" on:click={closeModalAndReset} aria-label="Close task details">×</button>
			
			{#if isEditMode}
                <!-- EDIT MODE FORM -->
                <h2 id="task-detail-title">Edit: {task.title}</h2>
                <form method="POST" action="?/updateTask" use:enhance={handleUpdateTaskEnhance} class="edit-task-form">
                    {#if editFormError}
                        <p class="form-error-message">{editFormError}</p>
                    {/if}
                    <div class="form-group">
                        <label for="editTitle">Title*</label>
                        <input type="text" id="editTitle" name="title" bind:value={editTitle} required />
                    </div>
                    <div class="form-group">
                        <label for="editDescription">Description</label>
                        <textarea id="editDescription" name="description" bind:value={editDescription}></textarea>
                    </div>
                    <div class="form-group-row">
                        <div class="form-group">
                            <label for="editDueDateISO">Due Date</label>
                            <input type="date" id="editDueDateISO" name="dueDate" bind:value={editDueDateISO} />
                        </div>
                        <div class="form-group">
                            <label for="editDueTime">Due Time</label>
                            <input type="time" id="editDueTime" name="dueTime" bind:value={editDueTime} disabled={!editDueDateISO}/>
                        </div>
                    </div>
                    <div class="form-group">
                        <label for="editPriority">Priority</label>
                        <select id="editPriority" name="priority" bind:value={editPriority}>
                            <option value="standard">Standard</option>
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="button-secondary" on:click={toggleEditMode} disabled={editFormSubmitting}>Cancel</button>
                        <button type="submit" class="button-primary" disabled={editFormSubmitting}>
                            {editFormSubmitting ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            {:else}
                <!-- VIEW MODE -->
                <h2 id="task-detail-title">{task.title}</h2>
                <div class="task-details-grid">
                    {#if task.description}
                        <div class="detail-item description-item">
                            <strong>Description:</strong>
                            <p>{task.description}</p>
                        </div>
                    {/if}
                    <div class="detail-item">
                        <strong>Status:</strong>
                        <span class="status-badge status-{task.status}">{formatStatus(task.status)}</span>
                    </div>
                    <div class="detail-item">
                        <strong>Priority:</strong>
                        <span class="priority-badge {getPriorityClass(task.priority)}">
                            {task.priority ? String(task.priority).charAt(0).toUpperCase() + String(task.priority).slice(1) : 'Standard'}
                        </span>
                    </div>
                    {#if task.dueDateISO}
                    <div class="detail-item">
                        <strong>Due Date:</strong>
                        <span>{formatDate(task.dueDateISO)}</span>
                        {#if task.dueTime}
                            <span> at {task.dueTime}</span>
                        {/if}
                    </div>
                    {:else}
                    <div class="detail-item">
                        <strong>Due Date:</strong>
                        <span>Not Set</span>
                    </div>
                    {/if}
                    <div class="detail-item">
                        <strong>Created:</strong>
                        <span>{formatDate(task.createdAtISO)}</span>
                    </div>
                </div>

                <div class="modal-actions">
                    <button class="button-delete" on:click={promptDelete}>Delete Task</button>
                    <button class="button-secondary" on:click={toggleEditMode}>Update Task</button>
                    <button class="button-primary" on:click={closeModalAndReset}>Close</button>
                </div>
            {/if}

            {#if showDeleteConfirm}
                <div class="delete-confirm-overlay" on:click={cancelDelete}>
                    <div class="delete-confirm-content" on:click|stopPropagation>
                        <h4>Confirm Deletion</h4>
                        <p>Are you sure you want to delete task "{task.title}"? This action cannot be undone.</p>
                        <div class="modal-actions">
                            <button class="button-secondary" on:click={cancelDelete}>Cancel</button>
                            <button class="button-delete-confirm" on:click={confirmDelete}>Delete</button>
                        </div>
                    </div>
                </div>
            {/if}
		</div>
	</div>
{/if}

<style>
	/* ... (existing modal-backdrop, modal-content, modal-close-button, h2 styles) ... */
    .modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1050;
	}
	.modal-content {
		background-color: var(--surface-light, #fff);
		padding: 2rem;
		border-radius: 8px;
		box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
		width: 90%;
		max-width: 600px;
		max-height: 90vh;
		overflow-y: auto;
		position: relative;
	}
	:global(body.dark) .modal-content {
		background-color: var(--surface-dark, #1f2937);
		color: var(--text-dark-primary);
	}
	.modal-close-button {
		position: absolute;
		top: 10px;
		right: 15px;
		background: none;
		border: none;
		font-size: 1.8rem;
		cursor: pointer;
		color: var(--text-light-secondary);
		line-height: 1;
	}
	:global(body.dark) .modal-close-button {
		color: var(--text-dark-secondary);
	}

	h2 {
		margin-top: 0;
		margin-bottom: 1.5rem;
		font-size: 1.5rem;
		color: var(--text-light-primary);
		border-bottom: 1px solid var(--border-light);
		padding-bottom: 0.75rem;
	}
	:global(body.dark) h2 {
		color: var(--text-dark-primary);
		border-bottom-color: var(--border-dark);
	}

	.task-details-grid {
		display: grid;
		grid-template-columns: 1fr; 
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
    @media (min-width: 500px) {
        .task-details-grid {
            grid-template-columns: repeat(2, 1fr);
        }
    }
	.detail-item { padding: 0.5rem 0; font-size: 0.95em; }
	.detail-item strong { display: block; margin-bottom: 0.3rem; font-weight: 600; color: var(--text-light-secondary); font-size: 0.85em; text-transform: uppercase; }
	:global(body.dark) .detail-item strong { color: var(--text-dark-secondary); }
	.detail-item p { margin: 0; white-space: pre-wrap; word-break: break-word; line-height: 1.6; }
	.description-item { grid-column: 1 / -1; }
    .status-badge, .priority-badge { padding: 0.2em 0.6em; border-radius: 4px; font-size: 0.9em; font-weight: 500; display: inline-block; }
    .status-pending { background-color: #e0e7ff; color: #3730a3; }
    .status-complete { background-color: #d1fae5; color: #065f46; }
    .status-incomplete { background-color: #fee2e2; color: #991b1b; }
    .status-late { background-color: #ffedd5; color: #9a3412; }
    :global(body.dark) .status-pending { background-color: #3730a3; color: #e0e7ff; }
    :global(body.dark) .status-complete { background-color: #065f46; color: #d1fae5; }
    :global(body.dark) .status-incomplete { background-color: #991b1b; color: #fee2e2; }
    :global(body.dark) .status-late { background-color: #9a3412; color: #ffedd5; }
    .priority-text-high { background-color: #fee2e2; color: var(--priority-high-light, #ef4444); }
    .priority-text-medium { background-color: #fffbeb; color: var(--priority-medium-light, #f59e0b); }
    .priority-text-low { background-color: #f0fdf4; color: var(--priority-low-light, #22c55e); }
    .priority-text-standard { background-color: #eff6ff; color: var(--priority-standard-light, #6b7280); }
    :global(body.dark) .priority-text-high { background-color: #3f2222; color: var(--priority-high-dark, #f87171); }
    :global(body.dark) .priority-text-medium { background-color: #422e14; color: var(--priority-medium-dark, #fbbf24); }
    :global(body.dark) .priority-text-low { background-color: #153220; color: var(--priority-low-dark, #4ade80); }
    :global(body.dark) .priority-text-standard { background-color: #262f47; color: var(--priority-standard-dark, #9ca3af); }

	.modal-actions { margin-top: 1.5rem; text-align: right; display: flex; gap: 0.75rem; justify-content: flex-end; }
	.modal-actions button, .modal-actions a { padding: 0.6rem 1.2rem; border-radius: 5px; cursor: pointer; font-weight: 500; transition: background-color 0.2s ease, opacity 0.2s ease; text-decoration: none; font-size: 0.9em; display: inline-flex; align-items: center; justify-content: center; border: 1px solid transparent; }
	.modal-actions .button-primary { background-color: var(--interactive-light); color: white; border-color: var(--interactive-light); }
    .modal-actions .button-primary:hover { opacity: 0.85; }
	:global(body.dark) .modal-actions .button-primary { background-color: var(--interactive-dark); border-color: var(--interactive-dark); }
    .modal-actions .button-secondary { background-color: transparent; color: var(--text-light-secondary); border-color: var(--border-light); }
    .modal-actions .button-secondary:hover { background-color: var(--interactive-hover-light); }
    :global(body.dark) .modal-actions .button-secondary { color: var(--text-dark-secondary); border-color: var(--border-dark); }
    :global(body.dark) .modal-actions .button-secondary:hover { background-color: var(--interactive-hover-dark); }
    .modal-actions .button-delete { background-color: #fee2e2; color: #ef4444; border-color: #fca5a5; }
    .modal-actions .button-delete:hover { background-color: #fecaca; }
    :global(body.dark) .modal-actions .button-delete { background-color: #450a0a; color: #f87171; border-color: #7f1d1d; }
    :global(body.dark) .modal-actions .button-delete:hover { background-color: #5b21b620; } /* Darker red for dark hover */
    
    /* Edit Form Styles */
    .edit-task-form { display: flex; flex-direction: column; gap: 1rem; }
    .edit-task-form .form-group label { font-weight: 500; font-size: 0.9em; margin-bottom: 0.25rem; display: block; color: var(--text-light-secondary); }
    :global(body.dark) .edit-task-form .form-group label { color: var(--text-dark-secondary); }
    .edit-task-form .form-group input[type="text"],
    .edit-task-form .form-group input[type="date"],
    .edit-task-form .form-group input[type="time"],
    .edit-task-form .form-group textarea,
    .edit-task-form .form-group select {
        width: 100%;
        padding: 0.5rem 0.75rem;
        border: 1px solid var(--border-light);
        border-radius: 4px;
        font-size: 0.95em;
        background-color: var(--surface-light);
		color: var(--text-light-primary);
    }
    :global(body.dark) .edit-task-form .form-group input,
    :global(body.dark) .edit-task-form .form-group textarea,
    :global(body.dark) .edit-task-form .form-group select {
        background-color: var(--bg-dark); /* Slightly different from surface for inputs */
        color: var(--text-dark-primary);
        border-color: var(--border-dark);
    }
    .edit-task-form .form-group input:focus,
    .edit-task-form .form-group textarea:focus,
    .edit-task-form .form-group select:focus {
        outline: none;
        border-color: var(--interactive-light);
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    :global(body.dark) .edit-task-form .form-group input:focus,
    :global(body.dark) .edit-task-form .form-group textarea:focus,
    :global(body.dark) .edit-task-form .form-group select:focus {
        border-color: var(--interactive-dark);
        box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.3);
    }
    .edit-task-form .form-group-row { display: flex; gap: 1rem; }
    .edit-task-form .form-group-row .form-group { flex: 1; }
    .edit-task-form textarea { min-height: 80px; resize: vertical; }
    .form-error-message {
        background-color: #fee2e2; color: #991b1b;
        border: 1px solid #fca5a5; padding: 0.5rem 0.75rem;
        border-radius: 4px; font-size: 0.875em; margin-bottom: 1rem;
    }
    :global(body.dark) .form-error-message {
        background-color: #3f2222; color: #fecaca; border-color: #7f1d1d;
    }

    /* Delete Confirmation Overlay */
    .delete-confirm-overlay {
        position: absolute; /* Position within the modal-content */
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(0,0,0,0.3); /* Slightly darker than main backdrop */
        backdrop-filter: blur(2px);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10; /* Above the edit form but below modal-close button if needed */
        border-radius: 8px; /* Match parent modal content */
    }
    .delete-confirm-content {
        background-color: var(--surface-light);
        padding: 1.5rem;
        border-radius: 6px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        text-align: center;
        width: 90%;
        max-width: 400px;
    }
    :global(body.dark) .delete-confirm-content {
        background-color: var(--surface-dark);
    }
    .delete-confirm-content h4 {
        margin-top: 0;
        margin-bottom: 0.75rem;
        font-size: 1.1rem;
        font-weight: 600;
    }
    .delete-confirm-content p {
        margin-bottom: 1.25rem;
        font-size: 0.9em;
        color: var(--text-light-secondary);
    }
    :global(body.dark) .delete-confirm-content p {
        color: var(--text-dark-secondary);
    }
    .button-delete-confirm {
        background-color: #dc2626; /* Red */
        color: white;
        border-color: #dc2626;
    }
    .button-delete-confirm:hover {
        background-color: #b91c1c; /* Darker Red */
    }
    :global(body.dark) .button-delete-confirm {
        background-color: #991b1b;
        border-color: #991b1b;
    }
    :global(body.dark) .button-delete-confirm:hover {
        background-color: #7f1d1d;
    }

</style>
