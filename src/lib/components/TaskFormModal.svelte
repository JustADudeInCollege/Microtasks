<script lang="ts">
	import type { TaskForFrontend } from '$lib/types/task';
	import { createEventDispatcher } from 'svelte';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';

	// Props
	export let isOpen: boolean = false;
	export let mode: 'add' | 'edit' = 'add';
	export let task: TaskForFrontend | null = null;
	export let isDarkMode: boolean = false;
	export let formAction: string = '';
	export let workspaceId: string = '';

	// Form state
	let title = '';
	let description = '';
	let dueDate: string | null = '';
	let dueTime: string | null = '';
	let priority: string = 'standard';
	let isSubmitting = false;
	let formError: string | null = null;

	const dispatch = createEventDispatcher();

	// Compute form action based on mode
	$: computedFormAction = formAction || (mode === 'add' ? '?/addTask' : '?/updateTask');

	// Initialize form when opening in edit mode
	$: if (isOpen && mode === 'edit' && task) {
		title = task.title || '';
		description = task.description || '';
		dueDate = task.dueDateISO || '';
		dueTime = task.dueTime || '';
		priority = (task.priority as string) || 'standard';
		formError = null;
	}

	// Reset form when opening in add mode
	$: if (isOpen && mode === 'add') {
		title = '';
		description = '';
		dueDate = '';
		dueTime = '';
		priority = 'standard';
		formError = null;
	}

	function closeModal() {
		isSubmitting = false;
		formError = null;
		dispatch('close');
	}

	const handleFormSubmit: SubmitFunction = ({ formData }) => {
		isSubmitting = true;
		formError = null;

		// Add task ID for edit mode
		if (mode === 'edit' && task) {
			formData.append('taskId', task.id);
		}

		// Add workspace ID if provided
		if (workspaceId) {
			formData.set('workspaceId', workspaceId);
		}

		return async ({ result, update }) => {
			isSubmitting = false;

			if (result.type === 'failure') {
				formError = (result.data as any)?.taskForm?.error || (result.data as any)?.error || 'An error occurred';
			} else if (result.type === 'success') {
				dispatch('success', { mode });
				closeModal();
			} else if (result.type === 'error') {
				formError = result.error?.message || 'An unexpected error occurred';
			}

			// Let SvelteKit handle the update
			await update();
		};
	};
</script>

{#if isOpen}
	<div
		class="modal-backdrop"
		class:dark={isDarkMode}
		on:mousedown|self={closeModal}
		transition:fly={{ y: 20, duration: 200, easing: quintOut }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="task-form-title"
	>
		{#if isSubmitting}
			<LoadingIndicator fullScreen={true} message={mode === 'add' ? 'Adding task...' : 'Updating task...'} />
		{/if}
		
		<div class="modal-content" class:dark={isDarkMode} on:click|stopPropagation transition:fly={{ y: -20, duration: 300, easing: quintOut }}>
			<button class="modal-close-button" class:dark={isDarkMode} on:click={closeModal} aria-label="Close modal">×</button>
			
			<h2 id="task-form-title" class:dark={isDarkMode}>
				{mode === 'add' ? 'Add New Task' : `Edit: ${task?.title || 'Task'}`}
			</h2>

			<form method="POST" action={computedFormAction} use:enhance={handleFormSubmit} class="task-form">
				{#if formError}
					<div class="form-error" class:dark={isDarkMode} role="alert">{formError}</div>
				{/if}

				<div class="form-group">
					<label for="taskTitle" class:dark={isDarkMode}>Title <span class="required">*</span></label>
					<input
						type="text"
						id="taskTitle"
						name="title"
						bind:value={title}
						required
						disabled={isSubmitting}
						placeholder="Enter task title..."
						class:dark={isDarkMode}
					/>
				</div>

				<div class="form-group">
					<label for="taskDescription" class:dark={isDarkMode}>Description</label>
					<textarea
						id="taskDescription"
						name="description"
						bind:value={description}
						disabled={isSubmitting}
						placeholder="Add more details..."
						class:dark={isDarkMode}
					></textarea>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label class:dark={isDarkMode}>Due Date <span class="required">*</span></label>
						<DatePicker bind:value={dueDate} name="dueDate" id="taskDueDate" required {isDarkMode} />
					</div>
					<div class="form-group">
						<label for="taskDueTime" class:dark={isDarkMode}>Due Time <span class="required">*</span></label>
						<input
							type="time"
							id="taskDueTime"
							name="dueTime"
							bind:value={dueTime}
							required
							disabled={isSubmitting}
							class:dark={isDarkMode}
						/>
					</div>
				</div>

				<div class="form-group">
					<label for="taskPriority" class:dark={isDarkMode}>Priority</label>
					<select
						id="taskPriority"
						name="priority"
						bind:value={priority}
						disabled={isSubmitting}
						class:dark={isDarkMode}
					>
						<option value="urgent">Urgent</option>
						<option value="high">High</option>
						<option value="standard">Standard</option>
						<option value="low">Low</option>
					</select>
				</div>

				<div class="modal-actions">
					<button type="button" class="btn-cancel" class:dark={isDarkMode} on:click={closeModal} disabled={isSubmitting}>
						Cancel
					</button>
					<button type="submit" class="btn-submit" disabled={isSubmitting}>
						{#if isSubmitting}
							{mode === 'add' ? 'Adding...' : 'Saving...'}
						{:else}
							{mode === 'add' ? 'Add Task' : 'Save Changes'}
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-color: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: flex;
		justify-content: center;
		align-items: center;
		z-index: 1050;
	}

	.modal-content {
		background: rgba(255, 255, 255, 0.95);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		padding: 2rem 2.5rem;
		border-radius: 16px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15), 0 10px 20px rgba(0, 0, 0, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.3);
		width: 90%;
		max-width: 500px;
		max-height: 90vh;
		overflow-y: auto;
		position: relative;
	}
	.modal-content.dark {
		background: rgba(39, 39, 42, 0.95);
		border-color: rgba(63, 63, 70, 0.5);
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4), 0 10px 20px rgba(0, 0, 0, 0.3);
		color: #f4f4f5;
	}

	.modal-close-button {
		position: absolute;
		top: 16px;
		right: 16px;
		background: rgba(0, 0, 0, 0.05);
		border: none;
		font-size: 1.5rem;
		width: 36px;
		height: 36px;
		border-radius: 10px;
		cursor: pointer;
		color: #6b7280;
		line-height: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
	}
	.modal-close-button:hover {
		background: rgba(0, 0, 0, 0.1);
		color: #374151;
	}
	.modal-close-button.dark {
		background: rgba(255, 255, 255, 0.05);
		color: #a1a1aa;
	}
	.modal-close-button.dark:hover {
		background: rgba(255, 255, 255, 0.1);
		color: #f4f4f5;
	}

	h2 {
		margin: 0 0 1.5rem 0;
		font-size: 1.35rem;
		font-weight: 700;
		color: #111827;
		padding-right: 40px;
	}
	h2.dark {
		color: #f4f4f5;
	}

	.task-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	label {
		font-weight: 500;
		font-size: 0.9rem;
		color: #374151;
	}
	label.dark {
		color: #d4d4d8;
	}

	.required {
		color: #ef4444;
	}

	input[type="text"],
	input[type="time"],
	textarea,
	select {
		width: 100%;
		padding: 0.65rem 0.85rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.95rem;
		background-color: #fff;
		color: #111827;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
		box-sizing: border-box;
	}
	input[type="text"].dark,
	input[type="time"].dark,
	textarea.dark,
	select.dark {
		background-color: #18181b;
		border-color: #71717a;
		color: #f4f4f5;
	}
	input:focus,
	textarea:focus,
	select:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
	}
	input.dark:focus,
	textarea.dark:focus,
	select.dark:focus {
		border-color: #60a5fa;
		box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
	}

	/* Ensure form group spacing is visible */
	.form-group + .form-group {
		border-top: 1px solid rgba(0, 0, 0, 0.05);
		padding-top: 1rem;
		margin-top: 0.5rem;
	}
	.dark .form-group + .form-group {
		border-top-color: rgba(255, 255, 255, 0.08);
	}

	textarea {
		min-height: 80px;
		resize: vertical;
	}

	.form-error {
		background-color: #fee2e2;
		color: #991b1b;
		border: 1px solid #fca5a5;
		padding: 0.65rem 0.85rem;
		border-radius: 8px;
		font-size: 0.875rem;
	}
	.form-error.dark {
		background-color: #3f2222;
		color: #fecaca;
		border-color: #7f1d1d;
	}

	.modal-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}

	.btn-cancel,
	.btn-submit {
		padding: 0.65rem 1.25rem;
		border-radius: 8px;
		font-weight: 500;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s ease;
		border: 1px solid transparent;
	}

	.btn-cancel {
		background-color: transparent;
		color: #6b7280;
		border-color: #d1d5db;
	}
	.btn-cancel:hover:not(:disabled) {
		background-color: #f3f4f6;
	}
	.btn-cancel.dark {
		color: #a1a1aa;
		border-color: #3f3f46;
	}
	.btn-cancel.dark:hover:not(:disabled) {
		background-color: #27272a;
	}

	.btn-submit {
		background: linear-gradient(135deg, #3b82f6, #2563eb);
		color: white;
		border: none;
	}
	.btn-submit:hover:not(:disabled) {
		background: linear-gradient(135deg, #2563eb, #1d4ed8);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
	}
	.btn-submit:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	@media (max-width: 480px) {
		.modal-content {
			padding: 1.5rem;
		}
		.form-row {
			grid-template-columns: 1fr;
		}
	}
</style>
