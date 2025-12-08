<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
    import { fly } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    import { enhance } from '$app/forms';
    import type { SubmitFunction, ActionResult } from '@sveltejs/kit';
    import { goto, invalidateAll } from '$app/navigation';
    import type { PageData } from './$types';
    export let data: PageData;
    import TaskDetailModal from '$lib/components/TaskDetailModal.svelte';
    import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
    import AppHeader from '$lib/components/AppHeader.svelte';
    import DatePicker from '$lib/components/DatePicker.svelte';
    import type { TaskForFrontend } from '$lib/types/task';

    // --- KANBAN INTERFACES ---
    interface PlaceholderTask {
    id: string;
    title: string;
    description: string;
    priority: string | number | null;
    dueDateISO: string | null;
    dueTime: string | null;
    boardId: string;
    isCompleted: boolean;
    status: TaskForFrontend['status'];
    createdAtISO: string | null;
}
    interface PlaceholderColumn {
        id: string;
        title: string;
        tasks: PlaceholderTask[];
    }
    const COLUMN_PENDING_ID = 'status_col_pending';
    const COLUMN_INCOMPLETE_ID = 'status_col_incomplete';
    const COLUMN_COMPLETED_ID = 'status_col_completed';

    // --- LOCALSTORAGE STATE ---
    interface KanbanLayoutStorage {
        columnOrder: string[];
        taskOrders: Record<string, string[]>;
    }
    export let savedLayout: KanbanLayoutStorage | null = null;
    export const KANBAN_STORAGE_KEY_STATUS = 'kanbanBoardLayout_v2_status_based';

    // --- HEADER/SIDEBAR UI STATE ---
	export let isSidebarOpen = false;
	export let isDarkMode = false;
	let currentDateTime = "";
    export let usernameForDisplay: string;
    export let handleGlobalClickListener: ((event: MouseEvent) => void) | null = null;
    export let handleEscKeyListener: ((event: KeyboardEvent) => void) | null = null;
    let dateTimeInterval: ReturnType<typeof setInterval> | null = null;

    //modalfortask
    export let isTaskDetailModalOpen = false;
    export let selectedTaskForModal: PlaceholderTask | null = null;

    // --- KANBAN CARD DRAG & DROP STATE ---
    export let draggedCardItem: { task: PlaceholderTask; fromColumnId: string } | null = null;
    export let currentCardDragOverInfo: { columnId: string; overTaskId?: string; position?: 'before' | 'after' } | null = null;
    export let activeDraggedCardElement: HTMLElement | null = null;
    export let cardDragOffsetX = 0, cardDragOffsetY = 0;
    export let currentCardX = 0, currentCardY = 0, targetCardX = 0, targetCardY = 0;
    export let cardVelocityX = 0, cardVelocityY = 0;
    export let cardAnimationFrameId: number | null = null;

    // --- ADD TASK MODAL STATE ---
    export let isAddTaskModalOpen = false;
    export let addTaskTargetColumnId: string | null = null; // To know which column to add to
    export let addTaskFormError: string | null = null;
    export let addTaskFormSubmitting = false;

    // Form field values
    export let newTaskTitle = '';
    export let newTaskDueDate = '';
    export let newTaskDueTime = '';
    export let newTaskDescription = '';
    export let newTaskPriority = 'standard'; // Default priority
    
    //newthing
    export let isMessageModalOpen = false; // For floating messages
    export let messageModalMessage = '';   // Message content
    let messageTimeoutId: number | undefined; // For auto-closing messages

    const TASK_MOVE_ERROR_FUTURE_DUE_DATE = 'TASK_MOVE_ERROR_FUTURE_DUE_DATE';

    function showCustomMessage(message: string, duration: number = 3000, errorCode: string | null = null) {
        messageModalMessage = message;
        isMessageModalOpen = true;
        // You could store errorCode here if you wanted to display it or use it for conditional styling
        // For now, it's just passed along.
        if (messageTimeoutId) clearTimeout(messageTimeoutId);
        messageTimeoutId = window.setTimeout(() => {
            isMessageModalOpen = false;
            messageModalMessage = '';
        }, duration);
    }

    // --- UPDATE DUE DATE MODAL STATE ---
    export let isUpdateDueDateModalOpen = false;
    export let updateDueDateTaskId: string | null = null;
    export let updateDueDateTaskTitle: string = '';
    export let newUpdatedDueDate: string = '';
    export let newUpdatedDueTime: string = '';
    export let resolveUpdateDueDatePromise: ((confirmed: { date: string, time: string } | null) => void) | null = null;

    // --- KANBAN COLUMN DRAG & DROP STATE (WITH ANIMATION VARS) ---
    export let draggedColumnId: string | null = null;
    export let currentColumnDragOverInfo: { columnId: string; position?: 'before' | 'after' } | null = null;
    export let activeDraggedColumnElement: HTMLElement | null = null;
    export let columnDragOffsetX = 0, columnDragOffsetY = 0; // For animation
    export let currentColumnX = 0, currentColumnY = 0, targetColumnX = 0, targetColumnY = 0; // For animation
    export let columnVelocityX = 0, columnVelocityY = 0; // For animation
    export let columnAnimationFrameId: number | null = null; // For animation

    export let isLoadingOperation = false; // New state for loading indicator in Kanban page

    export const POS_SPRING_STIFFNESS = 0.09;
    export const POS_DAMPING_FACTOR = 0.70;
    export let DUMMY_DRAG_IMAGE: HTMLImageElement;

    export let boardColumns: PlaceholderColumn[] = [];
    export let allTasksFlatList: PlaceholderTask[] = [];

    
    const PHILIPPINES_TIMEZONE_OFFSET_HOURS_CLIENT = 8;
    
    
    function openTaskDetailModal(task: PlaceholderTask) {
    // Find the full task details from allTasksFlatList if PlaceholderTask is different
    const fullTask = allTasksFlatList.find(t => t.id === task.id);
    if (fullTask) {
        selectedTaskForModal = fullTask;
        isTaskDetailModalOpen = true;
    } else {
        console.error("Full task details not found for modal display.");
    }
}


    function getPreciseDueDateInTimezoneAsUTC_Client(
        dateString: string | null | undefined,
        timeString: string | null | undefined,
        targetTimezoneOffsetHours: number
    ): Date | null {
        if (!dateString || !/\d{4}-\d{2}-\d{2}/.test(dateString)) return null;
        try {
            const [year, month, day] = dateString.split('-').map(Number);
            let h = 23, m = 59, s = 59, ms = 999;
            if (timeString && /\d{2}:\d{2}/.test(timeString)) {
                const parsedTime = timeString.split(':').map(Number);
                if (!isNaN(parsedTime[0]) && !isNaN(parsedTime[1])) {
                    h = parsedTime[0];
                    m = parsedTime[1];
                    s = 0; ms = 0;
                }
            }
            return new Date(Date.UTC(year, month - 1, day, h - targetTimezoneOffsetHours, m, s, ms));
        } catch (e) { return null; }
    }
        

    async function showUpdateDueDateModal(taskId: string, taskTitle: string, currentDueDate: string | null, currentDueTime: string | null): Promise<{ date: string, time: string } | null> {
        return new Promise((resolve) => {
            updateDueDateTaskId = taskId;
            updateDueDateTaskTitle = taskTitle;
            newUpdatedDueDate = currentDueDate || '';
            newUpdatedDueTime = currentDueTime || '';
            isUpdateDueDateModalOpen = true;
            resolveUpdateDueDatePromise = resolve;
        });
    }

    function handleUpdateDueDateConfirm() {
        if (resolveUpdateDueDatePromise) {
            resolveUpdateDueDatePromise({ date: newUpdatedDueDate, time: newUpdatedDueTime });
        }
        closeUpdateDueDateModal();
    }

    function handleUpdateDueDateCancel() {
        if (resolveUpdateDueDatePromise) {
            resolveUpdateDueDatePromise(null);
        }
        closeUpdateDueDateModal();
    }

    function closeUpdateDueDateModal() {
        isUpdateDueDateModalOpen = false;
        updateDueDateTaskId = null;
        updateDueDateTaskTitle = '';
        newUpdatedDueDate = '';
        newUpdatedDueTime = '';
        resolveUpdateDueDatePromise = null;
    }

        function handleColumnDragStart(event: DragEvent, columnId: string) {
        if (event.dataTransfer && DUMMY_DRAG_IMAGE) {
            event.dataTransfer.setData('text/column-id', columnId);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setDragImage(DUMMY_DRAG_IMAGE, 0, 0);
            
            draggedColumnId = columnId;
            activeDraggedColumnElement = event.target as HTMLElement;

            // --- ANIMATION START SETUP FOR DRAGGED COLUMN ---
            const rect = activeDraggedColumnElement.getBoundingClientRect();
            columnDragOffsetX = event.clientX - rect.left;
            columnDragOffsetY = event.clientY - rect.top;

            currentColumnX = rect.left;
            currentColumnY = rect.top;
            targetColumnX = rect.left;
            targetColumnY = rect.top;

            columnVelocityX = 0;
            columnVelocityY = 0;

            activeDraggedColumnElement.style.position = 'fixed';
            activeDraggedColumnElement.style.left = `${currentColumnX}px`;
            activeDraggedColumnElement.style.top = `${currentColumnY}px`;
            activeDraggedColumnElement.style.width = `${rect.width}px`;
            activeDraggedColumnElement.style.height = `${rect.height}px`;
            activeDraggedColumnElement.style.zIndex = '1002'; // Ensure it's above other elements
            activeDraggedColumnElement.style.margin = '0';    // Remove margin for fixed positioning

            setTimeout(() => {
                activeDraggedColumnElement?.classList.add('dragging-column');
            }, 0);

            if (columnAnimationFrameId) cancelAnimationFrame(columnAnimationFrameId);
            columnAnimationFrameId = requestAnimationFrame(updateColumnPosition);
        }
    }

        function handleColumnDragMove(event: DragEvent) {
        if (!activeDraggedColumnElement || !draggedColumnId) return;
        // Fix for dragend event firing with 0,0 coords on some browsers
        if (event.clientX === 0 && event.clientY === 0 && event.screenX === 0 && event.screenY === 0) return; 
        
        targetColumnX = event.clientX - columnDragOffsetX;
        targetColumnY = event.clientY - columnDragOffsetY;
    }

        function openAddTaskModal(columnId: string) {
        addTaskTargetColumnId = columnId;
        // Reset form fields
        newTaskTitle = '';
        newTaskDueDate = ''; // Consider pre-filling with today's date
        newTaskDueTime = ''; // Consider pre-filling
        newTaskDescription = '';
        newTaskPriority = 'standard';
        addTaskFormError = null;
        isAddTaskModalOpen = true;
    }

    function closeAddTaskModal() {
        isAddTaskModalOpen = false;
        addTaskTargetColumnId = null;
        addTaskFormError = null;
        addTaskFormSubmitting = false;
    }

    const handleAddTaskEnhance: SubmitFunction = ({ formData, action, cancel }) => {
        addTaskFormSubmitting = true;
        addTaskFormError = null;
        isLoadingOperation = true; // Start loading for add task

        // Client-side validation (can be more extensive)
        if (!formData.get('title') || !formData.get('dueDate') || !formData.get('dueTime')) {
            addTaskFormError = "Task Name, Due Date, and Due Time are required.";
            addTaskFormSubmitting = false;
            isLoadingOperation = false; // End loading on client-side validation failure
            cancel(); // Prevent SvelteKit form submission
            return;
        }

        // Optional: Add boardId based on target column if your backend supports it
        // For status-based view, tasks are generally part of a single board or user-wide.
        // If you had multiple boards in this view, you'd set `formData.append('boardId', some_board_id);`
        // For now, the hidden input sets a default.

        return async ({ result }: { result: ActionResult }) => {
            addTaskFormSubmitting = false;
            isLoadingOperation = false; // End loading after server response

            if (result.type === 'failure') {
                if (result.data?.taskForm?.error) {
                    addTaskFormError = result.data.taskForm.error;
                } else {
                    addTaskFormError = 'An unknown error occurred.';
                }
            } else if (result.type === 'success') {
                closeAddTaskModal();
            }
            await invalidateAll(); // This will re-run the `load` function.
        };
    };

        function updateColumnPosition() {
        if (!activeDraggedColumnElement || !draggedColumnId) {
            if (columnAnimationFrameId) cancelAnimationFrame(columnAnimationFrameId);
            columnAnimationFrameId = null;
            return;
        }

        let forceX = (targetColumnX - currentColumnX) * POS_SPRING_STIFFNESS;
        let forceY = (targetColumnY - currentColumnY) * POS_SPRING_STIFFNESS;

        columnVelocityX += forceX;
        columnVelocityY += forceY;

        columnVelocityX *= POS_DAMPING_FACTOR;
        columnVelocityY *= POS_DAMPING_FACTOR;

        currentColumnX += columnVelocityX;
        currentColumnY += columnVelocityY;

        // Stop animation if very close to target and velocity is low
        if (Math.abs(columnVelocityX) < 0.1 && Math.abs(columnVelocityY) < 0.1 &&
            Math.abs(targetColumnX - currentColumnX) < 0.1 && Math.abs(targetColumnY - currentColumnY) < 0.1) {
            currentColumnX = targetColumnX;
            currentColumnY = targetColumnY;
            columnVelocityX = 0;
            columnVelocityY = 0;
        }

        activeDraggedColumnElement.style.left = `${currentColumnX}px`;
        activeDraggedColumnElement.style.top = `${currentColumnY}px`;
        // Optional: Add a slight visual effect during drag
        activeDraggedColumnElement.style.transform = `rotate(1deg) scale(1.02)`;

        columnAnimationFrameId = requestAnimationFrame(updateColumnPosition);
    }

    function handleColumnDragOver(event: DragEvent, targetColumnId: string) {
        event.preventDefault();
        event.stopPropagation();
        
        if (!draggedColumnId || draggedColumnId === targetColumnId) {
            return;
        }

        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }

        const targetColumnElement = document.getElementById(`column-${targetColumnId}`);
        if (targetColumnElement) {
            const rect = targetColumnElement.getBoundingClientRect();
            const midpointX = rect.left + rect.width / 2;
            const position = event.clientX < midpointX ? 'before' : 'after';

            if (currentColumnDragOverInfo?.columnId !== targetColumnId || currentColumnDragOverInfo?.position !== position) {
                currentColumnDragOverInfo = { columnId: targetColumnId, position };
            }
        }
    }

    function handleColumnDragLeave(event: DragEvent, columnId: string) {
        event.stopPropagation();
        const relatedTarget = event.relatedTarget as Node | null;
        const currentTarget = event.currentTarget as HTMLElement;

        if (!relatedTarget || !currentTarget.closest('.kanban-board')?.contains(relatedTarget) || !(relatedTarget as HTMLElement).closest('.kanban-column')) {
            currentColumnDragOverInfo = null;
        } else if (currentColumnDragOverInfo?.columnId === columnId) {
             const nextColumnElement = (relatedTarget as HTMLElement).closest('.kanban-column');
             if (nextColumnElement?.id !== `column-${currentColumnDragOverInfo.columnId}`) {
                currentColumnDragOverInfo = null;
             }
        }
    }

    function handleLogout() {
    if (browser) {
        localStorage.removeItem('microtask_username');
        document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
        goto('/login');
    }
  }

    async function handleColumnDrop(event: DragEvent, targetColumnId: string) {
        event.preventDefault();
        event.stopPropagation();

        if (!draggedColumnId || draggedColumnId === targetColumnId) {
            return;
        }

        const sourceColumnId = draggedColumnId;
        const targetPosition = currentColumnDragOverInfo?.position || 'after';

        const newColumnOrder = [...boardColumns.map(c => c.id)];
        const draggedColIndex = newColumnOrder.indexOf(sourceColumnId);
        const targetColIndex = newColumnOrder.indexOf(targetColumnId);

        if (draggedColIndex === -1 || targetColIndex === -1) return;

        const [removedColumnId] = newColumnOrder.splice(draggedColIndex, 1);

        let insertIndex = targetColIndex;
        if (targetPosition === 'after' && draggedColIndex < targetColIndex) {
            insertIndex = targetColIndex;
        } else if (targetPosition === 'before' && draggedColIndex > targetColIndex) {
            insertIndex = targetColIndex;
        } else if (targetPosition === 'after' && draggedColIndex > targetColIndex) {
             insertIndex = targetColIndex + 1;
        } else if (targetPosition === 'before' && draggedColIndex < targetColIndex) {
             insertIndex = targetColIndex;
        }
        
        newColumnOrder.splice(insertIndex, 0, removedColumnId);

        const columnMap = new Map(boardColumns.map(col => [col.id, col]));
        boardColumns = newColumnOrder.map(colId => columnMap.get(colId)!);
        
        boardColumns = [...boardColumns]; 
        saveBoardStateToLocalStorage();
    }

        function handleColumnDragEnd() {
        resetDraggedColumnVisuals(); // Resets styles and stops animation
        cleanupColumnDragState();    // Resets all column drag related state
        // currentColumnDragOverInfo = null; // This is already handled by cleanupColumnDragState
    }

        function resetDraggedColumnVisuals() {
        if (columnAnimationFrameId) {
            cancelAnimationFrame(columnAnimationFrameId);
            columnAnimationFrameId = null;
        }
        if (activeDraggedColumnElement) {
            activeDraggedColumnElement.classList.remove('dragging-column');
            activeDraggedColumnElement.style.position = '';
            activeDraggedColumnElement.style.left = '';
            activeDraggedColumnElement.style.top = '';
            activeDraggedColumnElement.style.width = '';
            activeDraggedColumnElement.style.height = '';
            activeDraggedColumnElement.style.zIndex = '';
            activeDraggedColumnElement.style.transform = '';
            activeDraggedColumnElement.style.margin = '';
        }
    }

        function cleanupColumnDragState() {
        draggedColumnId = null;
        currentColumnDragOverInfo = null;
        activeDraggedColumnElement = null; 
        columnDragOffsetX = 0;
        columnDragOffsetY = 0;
        currentColumnX = 0;
        currentColumnY = 0;
        targetColumnX = 0;
        targetColumnY = 0;
        columnVelocityX = 0;
        columnVelocityY = 0;
        // columnAnimationFrameId is already cleared in resetDraggedColumnVisuals
    }


    function recalculateTaskStatusClientSide(task: {
        isCompleted: boolean,
        dueDateISO?: string | null,
        dueTime?: string | null
    }): TaskForFrontend['status'] {
        const now = new Date();
        const preciseDueDateDeadlineUTC = getPreciseDueDateInTimezoneAsUTC_Client(
            task.dueDateISO ?? null,
            task.dueTime ?? null,
            PHILIPPINES_TIMEZONE_OFFSET_HOURS_CLIENT
        );

        if (task.isCompleted) {
            return (preciseDueDateDeadlineUTC && now.getTime() > preciseDueDateDeadlineUTC.getTime()) ? 'late' : 'complete';
        } else {
            return (preciseDueDateDeadlineUTC && now.getTime() > preciseDueDateDeadlineUTC.getTime()) ? 'incomplete' : 'pending';
        }
    }

    function mapRawTaskToPlaceholder(rawTask: TaskForFrontend): PlaceholderTask {
    return {
        id: rawTask.id,
        title: rawTask.title,
        description: rawTask.description,
        priority: rawTask.priority,
        dueDateISO: rawTask.dueDateISO,
        dueTime: rawTask.dueTime,
        boardId: rawTask.boardId,
        isCompleted: rawTask.isCompleted,
        status: recalculateTaskStatusClientSide(rawTask), // Calculate status based on raw task data
        createdAtISO: rawTask.createdAtISO
    };
}

    function formatStatusForColumnTitle(statusColumnId: string): string {
        if (statusColumnId === COLUMN_PENDING_ID) return "To Do / Pending";
        if (statusColumnId === COLUMN_INCOMPLETE_ID) return "Overdue / Needs Action";
        if (statusColumnId === COLUMN_COMPLETED_ID) return "Completed";
        return "Unknown Status";
    }

    $: {
        usernameForDisplay = data.user?.name || 'User';

        if (data.tasks) {
            allTasksFlatList = data.tasks.map(mapRawTaskToPlaceholder);
            savedLayout = savedLayout ? {...savedLayout} : null;

            const tasksByStatusGroup = new Map<string, PlaceholderTask[]>();
            tasksByStatusGroup.set(COLUMN_PENDING_ID, []);
            tasksByStatusGroup.set(COLUMN_INCOMPLETE_ID, []);
            tasksByStatusGroup.set(COLUMN_COMPLETED_ID, []);

            allTasksFlatList.forEach(task => {
                if (task.status === 'pending') {
                    tasksByStatusGroup.get(COLUMN_PENDING_ID)!.push(task);
                } else if (task.status === 'incomplete') {
                    tasksByStatusGroup.get(COLUMN_INCOMPLETE_ID)!.push(task);
                } else if (task.status === 'complete' || task.status === 'late') {
                    tasksByStatusGroup.get(COLUMN_COMPLETED_ID)!.push(task);
                }
            });

            const columnOrder = savedLayout?.columnOrder && savedLayout.columnOrder.length === 3
                ? savedLayout.columnOrder
                : [COLUMN_PENDING_ID, COLUMN_INCOMPLETE_ID, COLUMN_COMPLETED_ID];
            
            let tempBoardColumns = columnOrder.map(statusColId => ({
                id: statusColId,
                title: formatStatusForColumnTitle(statusColId),
                tasks: tasksByStatusGroup.get(statusColId) || [],
            }));
            
            if (savedLayout && savedLayout.taskOrders) {
                const taskOrdersFromStorage = savedLayout.taskOrders;
                tempBoardColumns.forEach(column => {
                    const orderedTaskIdsForColumn = taskOrdersFromStorage[column.id];
                    if (orderedTaskIdsForColumn && orderedTaskIdsForColumn.length > 0) {
                        const taskMapInColumn = new Map(column.tasks.map(t => [t.id, t]));
                        const sortedTasks: PlaceholderTask[] = [];
                        
                        orderedTaskIdsForColumn.forEach(taskId => {
                            if (taskMapInColumn.has(taskId)) {
                                sortedTasks.push(taskMapInColumn.get(taskId)!);
                                taskMapInColumn.delete(taskId); 
                            }
                        });
                        const remainingTasks = Array.from(taskMapInColumn.values()).sort((a,b) => 
                            (a.dueDateISO && b.dueDateISO ? new Date(a.dueDateISO).getTime() - new Date(b.dueDateISO).getTime() : 0)
                        );
                        sortedTasks.push(...remainingTasks);
                        column.tasks = sortedTasks;
                    } else {
                         column.tasks.sort((a,b) => 
                            (a.dueDateISO && b.dueDateISO ? new Date(a.dueDateISO).getTime() - new Date(b.dueDateISO).getTime() : 0)
                         );
                    }
                });
            } else {
                 tempBoardColumns.forEach(column => {
                     column.tasks.sort((a,b) => 
                        (a.dueDateISO && b.dueDateISO ? new Date(a.dueDateISO).getTime() - new Date(b.dueDateISO).getTime() : 0)
                     );
                 });
            }
            boardColumns = tempBoardColumns;

        } else {
            boardColumns = [];
            allTasksFlatList = [];
        }
    }

   function mapPriorityToKanban(priorityInput: string | number | null): "high" | "medium" | "low" | "standard" | null {
    if (typeof priorityInput === 'string') {
        const lowerPriority = priorityInput.toLowerCase();
        if (lowerPriority === 'high' || lowerPriority === 'medium' || lowerPriority === 'low') {
            return lowerPriority as "high" | "medium" | "low";
        }
        // If it's a string but not one of the specific ones, what should it be?
        // If 'standard' is the catch-all for unknown strings:
        if (lowerPriority === 'standard') {
            return 'standard';
        }
        // If any other string should map to null or 'standard':
        // return 'standard'; // Or null if that's preferred for unknown strings
    }
    // If priorityInput is a number or null, map to 'standard' or null
    // Based on your TaskForFrontend allowing null, perhaps null is better for unmapped cases or truly no priority
    if (priorityInput === null) {
        return null;
    }
    return 'standard'; // Default for numbers or unrecognised strings if you don't want null
}

    function loadBoardStateFromLocalStorage() {
        if (!browser) return;
        const storedLayout = localStorage.getItem(KANBAN_STORAGE_KEY_STATUS);
        if (storedLayout) {
            try {
                const parsed = JSON.parse(storedLayout);
                if (parsed && typeof parsed.taskOrders === 'object') {
                     savedLayout = parsed;
                } else {
                    throw new Error("Invalid layout structure");
                }
            } catch (e) {
                console.error("Failed to parse or validate saved kanban layout (status view):", e);
                localStorage.removeItem(KANBAN_STORAGE_KEY_STATUS);
                initializeDefaultLayout();
            }
        } else {
            initializeDefaultLayout();
        }
    }

    function initializeDefaultLayout() {
        savedLayout = {
            columnOrder: [COLUMN_PENDING_ID, COLUMN_INCOMPLETE_ID, COLUMN_COMPLETED_ID],
            taskOrders: {}
        };
    }


    function saveBoardStateToLocalStorage() {
        if (!browser || !boardColumns) return; 
        const layoutToSave: KanbanLayoutStorage = {
            columnOrder: boardColumns.map(col => col.id),
            taskOrders: boardColumns.reduce((acc, col) => {
                acc[col.id] = col.tasks.map(task => task.id); 
                return acc;
            }, {} as Record<string, string[]>)
        };
        localStorage.setItem(KANBAN_STORAGE_KEY_STATUS, JSON.stringify(layoutToSave));
    }

	onMount(() => {
        loadBoardStateFromLocalStorage(); 
        DUMMY_DRAG_IMAGE = new Image();
        DUMMY_DRAG_IMAGE.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        
        const storedDarkMode = localStorage.getItem('theme');
		if (storedDarkMode === 'dark' || (!storedDarkMode && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
			isDarkMode = true;
			if (browser) document.body.classList.add('dark');
		} else {
            isDarkMode = false;
            if (browser) document.body.classList.remove('dark');
        }

        // Update date/time
        updateDateTime();
        dateTimeInterval = setInterval(updateDateTime, 60000);

        handleGlobalClickListener = (event: MouseEvent) => {
            const target = event.target as Node | null;
            const sidebarEl = document.getElementById('sidebar');
            const hamburgerButton = document.getElementById('hamburgerButton');
            if (isSidebarOpen && sidebarEl && !sidebarEl.contains(target) && hamburgerButton && !hamburgerButton.contains(target)) closeSidebar();
        };
        if (browser) document.addEventListener('click', handleGlobalClickListener);

        handleEscKeyListener = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (isAddTaskModalOpen) {
                    closeAddTaskModal();
                } else {
                    if (isSidebarOpen) closeSidebar();
                }
            }
        };
		if (browser) document.addEventListener('keydown', handleEscKeyListener);
        allTasksFlatList = (data.tasks || []).map(mapRawTaskToPlaceholder);
        data = {...data}; 


		return () => { 
             if (dateTimeInterval) clearInterval(dateTimeInterval);
             if (browser) {
                if (handleGlobalClickListener) document.removeEventListener('click', handleGlobalClickListener);
			    if (handleEscKeyListener) document.removeEventListener('keydown', handleEscKeyListener);
            }
            if (cardAnimationFrameId) cancelAnimationFrame(cardAnimationFrameId);
            if (columnAnimationFrameId) cancelAnimationFrame(columnAnimationFrameId); // Cleanup column animation
		};
	});

    function handleCardDragStart(event: DragEvent, task: PlaceholderTask, fromColumnId: string) {
        if (event.dataTransfer && DUMMY_DRAG_IMAGE) {
            event.dataTransfer.setData('text/task-id', task.id);
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setDragImage(DUMMY_DRAG_IMAGE, 0, 0);
            draggedCardItem = { task, fromColumnId }; 
            activeDraggedCardElement = event.target as HTMLElement;
            const rect = activeDraggedCardElement.getBoundingClientRect();
            cardDragOffsetX = event.clientX - rect.left; cardDragOffsetY = event.clientY - rect.top;
            currentCardX = rect.left; currentCardY = rect.top; targetCardX = rect.left; targetCardY = rect.top;
            cardVelocityX = 0; cardVelocityY = 0;
            activeDraggedCardElement.style.position = 'fixed';
            activeDraggedCardElement.style.left = `${currentCardX}px`; activeDraggedCardElement.style.top = `${currentCardY}px`;
            activeDraggedCardElement.style.width = `${rect.width}px`; activeDraggedCardElement.style.height = `${rect.height}px`;
            activeDraggedCardElement.style.zIndex = '1001'; activeDraggedCardElement.style.margin = '0';
            setTimeout(() => { activeDraggedCardElement?.classList.add('dragging-card'); }, 0);
            if (cardAnimationFrameId) cancelAnimationFrame(cardAnimationFrameId);
            cardAnimationFrameId = requestAnimationFrame(updateCardPosition);
        }
    }
    function handleCardDragMove(event: DragEvent) {
        if (!activeDraggedCardElement || !draggedCardItem) return;
        if (event.clientX === 0 && event.clientY === 0 && event.screenX === 0 && event.screenY === 0) return;
        targetCardX = event.clientX - cardDragOffsetX; targetCardY = event.clientY - cardDragOffsetY;
    }
    function updateCardPosition() {
        if (!activeDraggedCardElement || !draggedCardItem) { if (cardAnimationFrameId) cancelAnimationFrame(cardAnimationFrameId); cardAnimationFrameId = null; return; }
        let forceX = (targetCardX - currentCardX) * POS_SPRING_STIFFNESS; let forceY = (targetCardY - currentCardY) * POS_SPRING_STIFFNESS;
        cardVelocityX += forceX; cardVelocityY += forceY;
        cardVelocityX *= POS_DAMPING_FACTOR; cardVelocityY *= POS_DAMPING_FACTOR;
        currentCardX += cardVelocityX; currentCardY += cardVelocityY;
        if (Math.abs(cardVelocityX) < 0.1 && Math.abs(cardVelocityY) < 0.1 && Math.abs(targetCardX - currentCardX) < 0.1 && Math.abs(targetCardY - currentCardY) < 0.1) { currentCardX = targetCardX; currentCardY = targetCardY; cardVelocityX = 0; cardVelocityY = 0; }
        activeDraggedCardElement.style.left = `${currentCardX}px`; activeDraggedCardElement.style.top = `${currentCardY}px`;
        activeDraggedCardElement.style.transform = `rotate(2deg) scale(1.03)`;
        cardAnimationFrameId = requestAnimationFrame(updateCardPosition);
    }
    function handleCardDragOverItem(event: DragEvent, targetColumnId: string, overTaskId?: string) {
        event.preventDefault(); event.stopPropagation();
        if (!draggedCardItem) return; 
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        let position: 'before' | 'after' | undefined = undefined;
        if (overTaskId && draggedCardItem && overTaskId !== draggedCardItem.task.id) {
            const targetCardElement = document.getElementById(`task-${overTaskId}`);
            if (targetCardElement && targetCardElement !== activeDraggedCardElement) { const rect = targetCardElement.getBoundingClientRect(); const midpointY = rect.top + rect.height / 2; position = event.clientY < midpointY ? 'before' : 'after'; }
        }
        if (currentCardDragOverInfo?.columnId !== targetColumnId || currentCardDragOverInfo?.overTaskId !== overTaskId || currentCardDragOverInfo?.position !== position) {
            currentCardDragOverInfo = { columnId: targetColumnId, overTaskId: (draggedCardItem && overTaskId === draggedCardItem.task.id) ? undefined : overTaskId, position };
        }
    }
    function handleCardDragLeaveItem(event: DragEvent, itemType: 'column' | 'card', itemId: string) { 
        event.stopPropagation(); if (!draggedCardItem) return;
        const relatedTarget = event.relatedTarget as Node | null; const currentTarget = event.currentTarget as HTMLElement;
        if (!relatedTarget || !currentTarget.closest('.kanban-board')?.contains(relatedTarget)) {
            currentCardDragOverInfo = null; return;
        }
        if (itemType === 'card' && currentCardDragOverInfo?.overTaskId === itemId) {
            const columnElement = currentTarget.closest('.kanban-column');
            if (columnElement && columnElement.contains(relatedTarget) && !(relatedTarget as HTMLElement).closest('.kanban-card')) {
                const columnId = columnElement.getAttribute('data-column-id');
                if (columnId) { currentCardDragOverInfo = { columnId: columnId }; }
            }
        }
    }

     async function handleDropOnCardOrColumn(event: DragEvent, targetStatusColumnId: string, dropTargetTaskId?: string) {
        event.preventDefault();
        event.stopPropagation();

        if (!draggedCardItem) {
            cleanupCardDragState();
            return;
        }

        const { task: taskToMove, fromColumnId: originalVisualColumnId } = draggedCardItem;
        const taskInFlatList = allTasksFlatList.find(t => t.id === taskToMove.id);

        if (!taskInFlatList) {
            console.error("Dragged task not found in flat list for update.");
            cleanupCardDragState();
            return;
        }

        // --- Re-add restriction for moving completed tasks to incomplete if due date is in future ---
        const isMovingFromCompleted = originalVisualColumnId === COLUMN_COMPLETED_ID;
        const isMovingToIncomplete = targetStatusColumnId === COLUMN_INCOMPLETE_ID;

        if (isMovingFromCompleted && isMovingToIncomplete) {
            const now = new Date();
            const preciseDueDate = getPreciseDueDateInTimezoneAsUTC_Client(
                taskInFlatList.dueDateISO,
                taskInFlatList.dueTime,
                PHILIPPINES_TIMEZONE_OFFSET_HOURS_CLIENT
            );

            if (preciseDueDate && preciseDueDate.getTime() > now.getTime()) {
                showCustomMessage(`Cannot move "${taskInFlatList.title}" to Overdue. Its due date is still in the future.`, 3000, TASK_MOVE_ERROR_FUTURE_DUE_DATE);
                resetDraggedCardVisuals();
                cleanupCardDragState();
                return; // Prevent the drop
            }
        }
        // --- End re-added restriction ---

        // --- New restriction for moving pending tasks to incomplete if due date is in future ---
        const isMovingFromPending = originalVisualColumnId === COLUMN_PENDING_ID;
        const isMovingToIncompleteNew = targetStatusColumnId === COLUMN_INCOMPLETE_ID;

        if (isMovingFromPending && isMovingToIncompleteNew) {
            const now = new Date();
            const preciseDueDate = getPreciseDueDateInTimezoneAsUTC_Client(
                taskInFlatList.dueDateISO,
                taskInFlatList.dueTime,
                PHILIPPINES_TIMEZONE_OFFSET_HOURS_CLIENT
            );

            if (preciseDueDate && preciseDueDate.getTime() > now.getTime()) {
                showCustomMessage(`Cannot move "${taskInFlatList.title}" to Overdue. Its due date is still in the future.`, 3000, TASK_MOVE_ERROR_FUTURE_DUE_DATE);
                resetDraggedCardVisuals();
                cleanupCardDragState();
                return; // Prevent the drop
            }
        }
        // --- End new restriction ---


        const originalIsCompleted = taskInFlatList.isCompleted;
        const originalDueDateISO = taskInFlatList.dueDateISO; // Store original due date
        const originalDueTime = taskInFlatList.dueTime;     // Store original due time

        resetDraggedCardVisuals();

        if (dropTargetTaskId === taskInFlatList.id && targetStatusColumnId === originalVisualColumnId && !currentCardDragOverInfo?.position) {
            isLoadingOperation = false;
            cleanupCardDragState();
            return;
        }
        
        let performOptimisticUpdateAndServerCall = false;
        let newIsCompletedStateForOptimisticUpdate = originalIsCompleted;
        let newDueDateISO: string | null = originalDueDateISO;
        let newDueTime: string | null = originalDueTime;

        // Determine the new isCompleted state based on the target column
        if (targetStatusColumnId === COLUMN_COMPLETED_ID) {
            newIsCompletedStateForOptimisticUpdate = true;
        } else if (targetStatusColumnId === COLUMN_PENDING_ID || targetStatusColumnId === COLUMN_INCOMPLETE_ID) {
            newIsCompletedStateForOptimisticUpdate = false;
        }

        // If an overdue task is moved to To Do / Pending, prompt for due date update
        if (taskInFlatList.status === 'incomplete' && targetStatusColumnId === COLUMN_PENDING_ID) {
            const newDateTime = await showUpdateDueDateModal(taskInFlatList.id, taskInFlatList.title, originalDueDateISO, originalDueTime);
            if (newDateTime) {
                newDueDateISO = newDateTime.date;
                newDueTime = newDateTime.time;
                performOptimisticUpdateAndServerCall = true; // Trigger server update for due date
            } else {
                isLoadingOperation = false; // User cancelled due date update
                cleanupCardDragState();
                return;
            }
        }

        // Always trigger server update if the target column is different from the original visual column
        // OR if the isCompleted state changes.
        if (targetStatusColumnId !== originalVisualColumnId || newIsCompletedStateForOptimisticUpdate !== originalIsCompleted) {
            performOptimisticUpdateAndServerCall = true;
        }


        // --- Apply optimistic update if confirmed ---
        if (performOptimisticUpdateAndServerCall) {
            taskInFlatList.isCompleted = newIsCompletedStateForOptimisticUpdate;
            taskInFlatList.dueDateISO = newDueDateISO;
            taskInFlatList.dueTime = newDueTime;
            taskInFlatList.status = recalculateTaskStatusClientSide(taskInFlatList);
        }
        
        // --- Client-side reordering ---
        boardColumns.forEach(col => {
            const idx = col.tasks.findIndex(t => t.id === taskInFlatList.id);
            if (idx > -1) col.tasks.splice(idx, 1);
        });

        let actualDestColId: string;
        // The actual destination column ID is determined by the task's *newly calculated status*
        // after the optimistic update. This is crucial for correct client-side rendering.
        if (taskInFlatList.status === 'pending') actualDestColId = COLUMN_PENDING_ID;
        else if (taskInFlatList.status === 'incomplete') actualDestColId = COLUMN_INCOMPLETE_ID;
        else actualDestColId = COLUMN_COMPLETED_ID;

        const destCol = boardColumns.find(col => col.id === actualDestColId);

        if (!destCol) {
            console.error("Destination column not found for status:", taskInFlatList.status, actualDestColId);
            // Revert optimistic update if destination column not found
            if(performOptimisticUpdateAndServerCall) {
                taskInFlatList.isCompleted = originalIsCompleted;
                taskInFlatList.dueDateISO = originalDueDateISO;
                taskInFlatList.dueTime = originalDueTime;
                taskInFlatList.status = recalculateTaskStatusClientSide({
                    isCompleted: originalIsCompleted,
                    dueDateISO: originalDueDateISO,
                    dueTime: originalDueTime
                });
            }
            allTasksFlatList = [...allTasksFlatList]; 
            cleanupCardDragState(); 
            return;
        }

        let inserted = false;
        if (dropTargetTaskId && dropTargetTaskId !== taskInFlatList.id && currentCardDragOverInfo?.position && destCol.id === targetStatusColumnId) {
            const targetIndexInDest = destCol.tasks.findIndex(t => t.id === dropTargetTaskId);
            if (targetIndexInDest > -1) {
                destCol.tasks.splice(
                    currentCardDragOverInfo.position === 'before' ? targetIndexInDest : targetIndexInDest + 1,
                    0,
                    taskInFlatList
                );
                inserted = true;
            }
        }
        if (!inserted) {
            destCol.tasks.push(taskInFlatList); 
        }
        
        boardColumns = [...boardColumns];
        saveBoardStateToLocalStorage();

        // --- Server Action (if needed and confirmed) ---
        if (performOptimisticUpdateAndServerCall) {
            isLoadingOperation = true;
            const formDataForServer = new FormData();
            formDataForServer.append('taskId', taskInFlatList.id);
            formDataForServer.append('isCompleted', String(newIsCompletedStateForOptimisticUpdate)); 
            // Only append due date/time if they actually changed or if it's a new task
            if (newDueDateISO !== originalDueDateISO || newDueTime !== originalDueTime) {
                formDataForServer.append('dueDateISO', newDueDateISO || '');
                formDataForServer.append('dueTime', newDueTime || '');
            }

            try {
                const response = await fetch('?/updateTask', { method: 'POST', body: formDataForServer });
                if (!response.ok) {
                    const result = await response.json().catch(() => ({ updateTaskForm: { error: "Failed to parse server error" }}));
                    console.error('Failed to update task on server:', result.updateTaskForm?.error || 'Unknown server error');
                    // Revert optimistic update on server failure
                    taskInFlatList.isCompleted = originalIsCompleted;
                    taskInFlatList.dueDateISO = originalDueDateISO;
                    taskInFlatList.dueTime = originalDueTime;
                    taskInFlatList.status = recalculateTaskStatusClientSide({
                        isCompleted: originalIsCompleted,
                        dueDateISO: originalDueDateISO,
                        dueTime: originalDueTime
                    });
                    allTasksFlatList = [...allTasksFlatList]; 
                } else {
                    const result = await response.json();
                    if (result.updateTaskForm?.taskId) {
                        const taskToFinalize = allTasksFlatList.find(t => t.id === result.updateTaskForm.taskId);
                        if (taskToFinalize) {
                            taskToFinalize.isCompleted = result.updateTaskForm.isCompleted;
                            taskToFinalize.dueDateISO = result.updateTaskForm.dueDateISO;
                            taskToFinalize.dueTime = result.updateTaskForm.dueTime;
                            taskToFinalize.status = recalculateTaskStatusClientSide(taskToFinalize);
                            allTasksFlatList = [...allTasksFlatList];
                        }
                    } else if (result.updateTaskForm && !result.updateTaskForm.successMessage && result.updateTaskForm.error) {
                         console.error('Server indicated failure for updateTask:', result.updateTaskForm.error);
                         // Revert optimistic update on server failure
                         taskInFlatList.isCompleted = originalIsCompleted;
                         taskInFlatList.dueDateISO = originalDueDateISO;
                         taskInFlatList.dueTime = originalDueTime;
                         taskInFlatList.status = recalculateTaskStatusClientSide({
                            isCompleted: originalIsCompleted,
                            dueDateISO: originalDueDateISO,
                            dueTime: originalDueTime
                         });
                         allTasksFlatList = [...allTasksFlatList];
                    }
                }
            } catch (err) {
                console.error('Error calling updateTask action:', err);
                // Revert optimistic update on network error
                taskInFlatList.isCompleted = originalIsCompleted;
                taskInFlatList.dueDateISO = originalDueDateISO;
                taskInFlatList.dueTime = originalDueTime;
                taskInFlatList.status = recalculateTaskStatusClientSide({
                    isCompleted: originalIsCompleted,
                    dueDateISO: originalDueDateISO,
                    dueTime: originalDueTime
                });
                allTasksFlatList = [...allTasksFlatList];
            } finally {
                isLoadingOperation = false;
            }
        }
        cleanupCardDragState();
    }

    function handleCardDragEnd() {
        if (cardAnimationFrameId) { cancelAnimationFrame(cardAnimationFrameId); cardAnimationFrameId = null; }
        if (activeDraggedCardElement) {
            activeDraggedCardElement.classList.remove('dragging-card');
            activeDraggedCardElement.style.position = ''; activeDraggedCardElement.style.left = ''; activeDraggedCardElement.style.top = '';
            activeDraggedCardElement.style.width = ''; activeDraggedCardElement.style.height = '';
            activeDraggedCardElement.style.zIndex = ''; activeDraggedCardElement.style.transform = ''; activeDraggedCardElement.style.margin = '';
        }
        cleanupCardDragState();
    }

    function resetDraggedCardVisuals() {
        if (activeDraggedCardElement) {
            activeDraggedCardElement.classList.remove('dragging-card');
            activeDraggedCardElement.style.position = '';
            activeDraggedCardElement.style.left = '';
            activeDraggedCardElement.style.top = '';
            activeDraggedCardElement.style.width = '';
            activeDraggedCardElement.style.height = '';
            activeDraggedCardElement.style.zIndex = '';
            activeDraggedCardElement.style.transform = '';
            activeDraggedCardElement.style.margin = '';
        }
        if (cardAnimationFrameId) {
            cancelAnimationFrame(cardAnimationFrameId);
            cardAnimationFrameId = null;
        }
    }

    function cleanupCardDragState() {
        draggedCardItem = null;
        currentCardDragOverInfo = null;
        activeDraggedCardElement = null;
        cardDragOffsetX = 0;
        cardDragOffsetY = 0;
        currentCardX = 0;
        currentCardY = 0;
        targetCardX = 0;
        targetCardY = 0;
        cardVelocityX = 0;
        cardVelocityY = 0;
    }

    const logoutEnhance: SubmitFunction = () => {
        if (browser) {
            localStorage.removeItem(KANBAN_STORAGE_KEY_STATUS);
        }
        return async ({ update }: { update: () => Promise<void> }) => {
            await update();
        };
    };

    // Standard UI Functions (toggleSidebar, DarkMode, Dropdowns, etc.)
    function toggleSidebar() { isSidebarOpen = !isSidebarOpen; }
    function closeSidebar() { isSidebarOpen = false; }
    function toggleDarkMode() {
		isDarkMode = !isDarkMode;
        if (browser) {
		    document.body.classList.toggle('dark', isDarkMode);
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        }
	}
    function updateDateTime() {
        const now = new Date();
        const options: Intl.DateTimeFormatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        };
        currentDateTime = now.toLocaleDateString('en-US', options);
    }

</script>

<div class="page-wrapper font-sans">
    <LoadingIndicator fullScreen={isLoadingOperation} />
	{#if isSidebarOpen}
    <div
  id="sidebar"
  class={`fixed top-0 left-0 h-full w-64 shadow-lg z-50 flex flex-col justify-between p-4 border-r ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}
  transition:fly={{ x: -300, duration: 300, easing: quintOut }}
>
  <div>
    <div class="flex items-center justify-between mb-8 pb-4 border-b ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}">
      <div class="flex items-center gap-2">
        <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Microtask Logo" class="w-8 h-8" />
        <h1 class={`text-xl font-bold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Microtask</h1>
      </div>
      <button on:click={closeSidebar} class={`p-1 rounded-md transition-colors ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`} aria-label="Close sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
        <nav class="flex flex-col gap-2">
          <a href="/home" 
             class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:bg-blue-600={!isDarkMode && $page.url.pathname === '/home'} 
             class:bg-blue-800={isDarkMode && $page.url.pathname === '/home'} 
             class:text-white={$page.url.pathname === '/home'}
             class:text-gray-700={!isDarkMode && $page.url.pathname !== '/home'}
             class:text-zinc-300={isDarkMode && $page.url.pathname !== '/home'}
             class:hover:bg-gray-100={!isDarkMode} 
             class:hover:bg-zinc-700={isDarkMode}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
              <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
              <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
            </svg>
            <span>Home</span>
          </a>
          <a href="/dashboard" 
             class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:bg-blue-600={!isDarkMode && $page.url.pathname === '/dashboard'} 
             class:bg-blue-800={isDarkMode && $page.url.pathname === '/dashboard'} 
             class:text-white={$page.url.pathname === '/dashboard'}
             class:text-gray-700={!isDarkMode && $page.url.pathname !== '/dashboard'}
             class:text-zinc-300={isDarkMode && $page.url.pathname !== '/dashboard'}
             class:hover:bg-gray-100={!isDarkMode} 
             class:hover:bg-zinc-700={isDarkMode}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
              <path d="M10.5 4.5a1.5 1.5 0 00-3 0v15a1.5 1.5 0 003 0V4.5z" />
              <path d="M4.5 10.5a1.5 1.5 0 000 3h15a1.5 1.5 0 000-3h-15z" /> 
              <path fill-rule="evenodd" d="M1.5 3A1.5 1.5 0 013 1.5h18A1.5 1.5 0 0122.5 3v18a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 21V3zm1.5.75v16.5h16.5V3.75H3z" clip-rule="evenodd" />
            </svg>
            <span>Dashboard</span>
          </a>
          <a href="/kanban" 
             class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:bg-blue-600={!isDarkMode && $page.url.pathname === '/kanban'} 
             class:bg-blue-800={isDarkMode && $page.url.pathname === '/kanban'} 
             class:text-white={$page.url.pathname === '/kanban'}
             class:text-gray-700={!isDarkMode && $page.url.pathname !== '/kanban'}
             class:text-zinc-300={isDarkMode && $page.url.pathname !== '/kanban'}
             class:hover:bg-gray-100={!isDarkMode} 
             class:hover:bg-zinc-700={isDarkMode}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
            <span>All Tasks</span>
          </a>
          <a href="/calendar" 
             class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:bg-blue-600={!isDarkMode && $page.url.pathname === '/calendar'} 
             class:bg-blue-800={isDarkMode && $page.url.pathname === '/calendar'} 
             class:text-white={$page.url.pathname === '/calendar'}
             class:text-gray-700={!isDarkMode && $page.url.pathname !== '/calendar'}
             class:text-zinc-300={isDarkMode && $page.url.pathname !== '/calendar'}
             class:hover:bg-gray-100={!isDarkMode} 
             class:hover:bg-zinc-700={isDarkMode}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
              <path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" /><path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/></svg>
            <span>Calendar</span>
          </a>
          <a href="/workspace" 
             class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:bg-blue-600={!isDarkMode && $page.url.pathname === '/workspace'} 
             class:bg-blue-800={isDarkMode && $page.url.pathname === '/workspace'} 
             class:text-white={$page.url.pathname === '/workspace'}
             class:text-gray-700={!isDarkMode && $page.url.pathname !== '/workspace'}
             class:text-zinc-300={isDarkMode && $page.url.pathname !== '/workspace'}
             class:hover:bg-gray-100={!isDarkMode} 
             class:hover:bg-zinc-700={isDarkMode}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.098a2.25 2.25 0 0 1-2.25 2.25h-12a2.25 2.25 0 0 1-2.25-2.25V14.15M18 18.75h.75A2.25 2.25 0 0 0 21 16.5v-1.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 15v1.5A2.25 2.25 0 0 0 3.75 18.75H4.5M12 12.75a3 3 0 0 0-3-3H5.25V7.5a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3v2.25H15a3 3 0 0 0-3 3Z" />
            </svg>
            <span>Workspace</span>
          </a>
          <a href="/ai-chat" 
             class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:bg-blue-600={!isDarkMode && $page.url.pathname === '/ai-chat'} 
             class:bg-blue-800={isDarkMode && $page.url.pathname === '/ai-chat'} 
             class:text-white={$page.url.pathname === '/ai-chat'}
             class:text-gray-700={!isDarkMode && $page.url.pathname !== '/ai-chat'}
             class:text-zinc-300={isDarkMode && $page.url.pathname !== '/ai-chat'}
             class:hover:bg-gray-100={!isDarkMode} 
             class:hover:bg-zinc-700={isDarkMode}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path d="M12.001 2.504a2.34 2.34 0 00-2.335 2.335v.583c0 .582.212 1.13.582 1.556l.03.035-.03.034a2.34 2.34 0 00-2.917 3.916A3.287 3.287 0 004.08 14.25a3.287 3.287 0 003.287 3.287h8.266a3.287 3.287 0 003.287-3.287 3.287 3.287 0 00-1.253-2.583 2.34 2.34 0 00-2.917-3.916l-.03-.034.03-.035c.37-.425.582-.973.582-1.555v-.583a2.34 2.34 0 00-2.335-2.336h-.002zM9.75 12.75a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" /><path fill-rule="evenodd" d="M12 1.5c5.79 0 10.5 4.71 10.5 10.5S17.79 22.5 12 22.5 1.5 17.79 1.5 12 6.21 1.5 12 1.5zM2.85 12a9.15 9.15 0 019.15-9.15 9.15 9.15 0 019.15 9.15 9.15 9.15 0 01-9.15 9.15A9.15 9.15 0 012.85 12z" clip-rule="evenodd" /></svg>
            <span>Ask Synthia</span>
          </a>
        </nav>
      </div>
      <button on:click={handleLogout} class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold w-full mt-auto transition-colors duration-150" class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
        <span>Log out</span>
      </button>
    </div>
  {/if}

	<div class="main-content-wrapper">
		<AppHeader {isDarkMode} username={usernameForDisplay} {currentDateTime} on:toggleSidebar={toggleSidebar} on:toggleDarkMode={toggleDarkMode} on:logout={handleLogout} />

        <main class="main-content-kanban">
            <div class="board-header-kanban">
                <h1 class="board-title-kanban"></h1>
            </div>
            <div class="kanban-board-scroll-container">
                <div class="kanban-board">
                    {#if data.error}
                        <p class="p-4 text-red-600">Error loading board: {data.error}</p>
                    {:else if !boardColumns || boardColumns.length === 0 || boardColumns.every(col => col.tasks.length === 0)}
                        <p class="p-4 text-gray-500">No tasks found to display by status.</p>
                    {/if}

                    {#each boardColumns as column (column.id)}
                        <div
                            class="kanban-column"
                            class:drag-over-column-left={currentColumnDragOverInfo?.columnId === column.id && currentColumnDragOverInfo?.position === 'before' && draggedColumnId !== column.id}
                            class:drag-over-column-right={currentColumnDragOverInfo?.columnId === column.id && currentColumnDragOverInfo?.position === 'after' && draggedColumnId !== column.id}
                            class:dragging-column={draggedColumnId === column.id && activeDraggedColumnElement?.id === `column-${column.id}`}
                            id="column-{column.id}"
                            data-column-id={column.id}
                            draggable="true"
                            on:dragstart={(e) => handleColumnDragStart(e, column.id)}
                            on:drag={handleColumnDragMove}
                            on:dragover={(e) => {
                                if (draggedCardItem) {
                                    handleCardDragOverItem(e, column.id);
                                } 
                                else if (draggedColumnId) {
                                    handleColumnDragOver(e, column.id);
                                } 
                                else {
                                    e.preventDefault();
                                }
                            }}
                            on:dragleave={(e) => {
                                if (draggedCardItem) {
                                    handleCardDragLeaveItem(e, 'column', column.id);
                                } else if (draggedColumnId) {
                                    handleColumnDragLeave(e, column.id);
                                }
                            }}
                            on:drop={(e) => {
                                if (draggedCardItem) {
                                    handleDropOnCardOrColumn(e, column.id);
                                } else if (draggedColumnId) {
                                    handleColumnDrop(e, column.id);
                                }
                            }}
                            on:dragend={handleColumnDragEnd}
                        >
                            <div class="column-header">
                                <h3 class="column-title">{column.title}</h3>
                                <span class="column-task-count">{column.tasks.length}</span>
                            </div>
                            <div class="kanban-column-content">
                                {#if column.tasks.length === 0 && !draggedCardItem && !(currentCardDragOverInfo?.columnId === column.id && draggedCardItem)}
                                    <div
                                        class="empty-column-dropzone"
                                        on:dragover={(e) => { if(draggedCardItem) handleCardDragOverItem(e, column.id); else e.preventDefault(); }}
                                        on:drop={(e) => { if(draggedCardItem) handleDropOnCardOrColumn(e, column.id);}}
                                    >Drop card here</div>
                                {/if}
                                {#each column.tasks as task (task.id)}
                                    <div
                                        class="kanban-card priority-{task.priority || 'standard'}"
                                        class:drag-over-card-before={currentCardDragOverInfo?.overTaskId === task.id && currentCardDragOverInfo?.position === 'before' && activeDraggedCardElement?.id !== `task-${task.id}` }
                                        class:drag-over-card-after={currentCardDragOverInfo?.overTaskId === task.id && currentCardDragOverInfo?.position === 'after' && activeDraggedCardElement?.id !== `task-${task.id}` }
                                        class:task-status-late={task.status === 'late'}
                                        class:task-status-incomplete={task.status === 'incomplete'}
                                        draggable="true"
                                        id="task-{task.id}"
                                        on:dragstart={(e) => handleCardDragStart(e, task, column.id)}
                                        on:drag={handleCardDragMove}
                                        on:dragend={handleCardDragEnd}
                                        on:dragover={(e) => handleCardDragOverItem(e, column.id, task.id)}
                                        on:dragleave={(e) => handleCardDragLeaveItem(e, 'card', task.id)}
                                        on:drop={(e) => handleDropOnCardOrColumn(e, column.id, task.id)}
                                        on:click={() => openTaskDetailModal(task)}
                                    >
                                        <div class="card-labels">
                                            {#if task.status === 'late'} <span class="label-status-late">Completed Late</span> {/if}
                                            {#if task.status === 'incomplete'} <span class="label-status-incomplete">Overdue</span> {/if}
                                        </div>
                                        <h4 class="card-title">{task.title}</h4>
                                        {#if task.description} <p class="card-description-preview">{task.description.substring(0, 70)}{task.description.length > 70 ? '...' : ''}</p> {/if}
                                        <div class="card-footer">
                                            <div class="card-meta-icons">
                                                {#if task.description} <span class="meta-icon" title="Has description"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M3 18H21V16H3V18ZM3 13H21V11H3V13ZM3 8H21V6H3V8Z"></path></svg></span> {/if}
                                                {#if task.dueDateISO}
                                                    <span class="meta-icon" title="Due: {task.dueDateISO}{task.dueTime ? ' ' + task.dueTime : ''}">
                                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17 3H19V5H17V3M17 7H19V9H17V7M5 3H7V5H5V3M5 7H7V9H5V7M16 1V3H8V1H6V3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3H18V1H16M19 19H5V10H19V19Z"></path></svg>
                                                        <span class="due-date-text">
                                                            {new Date(task.dueDateISO.replace(/-/g, '/')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                            {#if task.dueTime} {task.dueTime} {/if}
                                                        </span>
                                                    </span>
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                            <!-- Add card button fixed at bottom of column -->
                            {#if !draggedCardItem && column.id === COLUMN_PENDING_ID }
                                <div class="add-card-button-wrapper">
                                    <button class="add-card-button" on:click={() => openAddTaskModal(column.id)}>+ Add a card</button>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>
        </main>
	</div>

{#if isMessageModalOpen}
<div class="floating-message-modal" transition:fly={{ y: -50, duration: 300, easing: quintOut }}>
    <div class="floating-message-content">
        <p>{messageModalMessage}</p>
        <button class="floating-message-close-btn" on:click={() => isMessageModalOpen = false}>&times;</button>
    </div>
</div>
{/if}

<TaskDetailModal bind:isOpen={isTaskDetailModalOpen} task={selectedTaskForModal} {isDarkMode}
    on:close={() => isTaskDetailModalOpen = false}
    on:updated={async () => {
        isLoadingOperation = true; // Start loading for task update
        await invalidateAll(); // This will re-run the load function for the page
        isTaskDetailModalOpen = false; // Close modal after update
        isLoadingOperation = false; // End loading
    }}
    on:delete={async (event) => {
        isLoadingOperation = true; // Start loading for task delete
        const taskIdToDelete = event.detail.taskId;
        console.log('Attempting to delete task:', taskIdToDelete);
        // Call your form action for deletion
        const formData = new FormData();
        formData.append('taskId', taskIdToDelete);

        // You might need to store form result for error display
        // For simplicity, we'll directly fetch and then invalidate
        try {
            const response = await fetch('?/deleteTask', {
                method: 'POST',
                body: formData
            });
            console.log('Delete task server response:', response); // Log the raw response
            const result = await response.json(); // Assuming server sends JSON
            console.log('Delete task server result:', result); // Log the parsed JSON result

            let parsedData = result;
            // Check if result.data is a string and parse it
            if (typeof result.data === 'string') {
                try {
                    // The string looks like a JSON array of objects/strings, so parse it
                    const tempParsed = JSON.parse(result.data);
                    // Assuming the actual form data is the first object in the array
                    if (Array.isArray(tempParsed) && tempParsed.length > 0 && typeof tempParsed[0] === 'object') {
                        parsedData = tempParsed[0]; // Get the first object which contains deleteTaskForm
                    } else {
                        console.warn('Unexpected format for result.data:', tempParsed);
                    }
                } catch (parseError) {
                    console.error('Failed to parse result.data string:', parseError);
                }
            }

            if (parsedData.deleteTaskForm?.successMessage) {
                console.log(parsedData.deleteTaskForm.successMessage);
            } else if (parsedData.deleteTaskForm?.error) {
                console.error(`Error deleting task: ${parsedData.deleteTaskForm.error}`);
            } else {
                console.error('An unknown error occurred while deleting the task.');
            }
            await invalidateAll(); // Always refresh list after a delete attempt
        } catch (error) {
            console.error('Error deleting task:', error);
        } finally {
            isTaskDetailModalOpen = false; // Close modal after delete attempt
            isLoadingOperation = false; // End loading
        }
    }}
/>






{#if isAddTaskModalOpen}
<div class="modal-overlay" on:click={closeAddTaskModal}>
    <div class="modal-content add-task-modal-content" on:click|stopPropagation>
        <form method="POST" action="?/addTask" use:enhance={handleAddTaskEnhance}>
            <h3 class="modal-title">Add New Task
                {#if addTaskTargetColumnId}
                    to {boardColumns.find(col => col.id === addTaskTargetColumnId)?.title || 'Column'}
                {/if}
            </h3>
            
            {#if addTaskFormError}
                <p class="form-error-message">{addTaskFormError}</p>
            {/if}

            <input type="hidden" name="boardId" value="unassigned_tasks_board" /> <!-- Default or derive from column if applicable -->
            <!-- If your columns directly map to boardIds or have a fixed boardId, use that.
                 For this status-based view, 'unassigned_tasks_board' or a general boardId is fine.
                 The actual placement in the column is client-side UI for status.
            -->


            <div class="form-group">
                <label for="newTaskTitle" class="form-label">Task Name*</label>
                <input type="text" id="newTaskTitle" name="title" bind:value={newTaskTitle} required class="form-input" placeholder="e.g., Finalize report"/>
            </div>

            <div class="form-group">
                <label class="form-label">Due Date*</label>
                <DatePicker bind:value={newTaskDueDate} name="dueDate" id="newTaskDueDate" required {isDarkMode} />
            </div>
            <div class="form-group">
                <label for="newTaskDueTime" class="form-label">Due Time*</label>
                <input type="time" id="newTaskDueTime" name="dueTime" bind:value={newTaskDueTime} required class="form-input"/>
            </div>

            <div class="form-group">
                <label for="newTaskDescription" class="form-label">Description</label>
                <textarea id="newTaskDescription" name="description" bind:value={newTaskDescription} class="form-textarea" placeholder="Add more details..."></textarea>
            </div>

            <div class="form-group">
                <label for="newTaskPriority" class="form-label">Priority</label>
                <select id="newTaskPriority" name="priority" bind:value={newTaskPriority} class="form-select">
                    <option value="standard">Standard</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                </select>
            </div>

            <div class="modal-actions">
                <button type="button" class="modal-button modal-button-cancel" on:click={closeAddTaskModal} disabled={addTaskFormSubmitting}>Cancel</button>
                <button type="submit" class="modal-button modal-button-confirm" disabled={addTaskFormSubmitting}>
                    {addTaskFormSubmitting ? 'Adding...' : 'Add Task'}
                </button>
            </div>
        </form>
    </div>
</div>
{/if}
</div>

{#if isUpdateDueDateModalOpen}
<div class="modal-overlay" on:click={handleUpdateDueDateCancel}>
    <div class="modal-content add-task-modal-content" on:click|stopPropagation>
        <h3 class="modal-title">Update Due Date for "{updateDueDateTaskTitle}"</h3>
        <div class="form-group">
            <label class="form-label">New Due Date*</label>
            <DatePicker bind:value={newUpdatedDueDate} name="newUpdatedDueDate" id="newUpdatedDueDate" required {isDarkMode} />
        </div>
        <div class="form-group">
            <label for="newUpdatedDueTime" class="form-label">New Due Time*</label>
            <input type="time" id="newUpdatedDueTime" bind:value={newUpdatedDueTime} required class="form-input"/>
        </div>
        <div class="modal-actions">
            <button type="button" class="modal-button modal-button-cancel" on:click={handleUpdateDueDateCancel}>Cancel</button>
            <button type="button" class="modal-button modal-button-confirm" on:click={handleUpdateDueDateConfirm}>Update</button>
        </div>
    </div>
</div>
{/if}

<style>
    /* --- SHARED STYLES --- */
    .font-sans { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .page-wrapper { display: flex; height: 100vh; color: #1f2937; background-color: #f3f4f6; }
    canvas { display: block; } .hidden-dropdown { display: none !important; } .capitalize { text-transform: capitalize; }
	.sidebar-container { background-color: #ffffff; border-right: 1px solid #e5e7eb; color: #374151; position: fixed; top: 0; left: 0; height: 100%; width: 16rem; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05); z-index: 50; display: flex; flex-direction: column; justify-content: space-between; padding: 1rem; box-sizing: border-box; }
    .sidebar-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid #e5e7eb; }
    .sidebar-logo-img { width: 2rem; height: 2rem; }
    .sidebar-title { color: #1f2937; font-size: 1.25rem; font-weight: 700; }
    .sidebar-nav { display: flex; flex-direction: column; gap: 0.5rem; }
    .nav-link { color: #374151; display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-weight: 600; transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1); text-decoration: none; }
    .nav-link:hover { background-color: #f3f4f6;  }
    .nav-link.active { background-color: #2563eb; color: #ffffff; }
    .nav-icon { width: 1.25rem; height: 1.25rem; }
    .nav-link.active .nav-icon { filter: brightness(0) invert(1); }
    .logout-button { color: #374151; display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border-radius: 0.375rem; font-weight: 600; width: 100%; margin-top: auto; transition: background-color 150ms ease; background: none; border: none; cursor: pointer; text-align: left; font-family: inherit; font-size: inherit; }
    .logout-button:hover { background-color: #f3f4f6; }
    .logout-button .nav-icon { width: 1.25rem; height: 1.25rem; }
    .relative { position: relative; }
    .main-content-wrapper { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .main-content-kanban { padding-top: 60px; flex-grow: 1; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; background-color: var(--bg-light); color: var(--text-light-primary); }
    .board-header-kanban { display: flex; align-items: center; padding: 10px 1rem; flex-shrink: 0; box-sizing: border-box; }
    .board-title-kanban { font-size: 1.25rem; font-weight: 700; color: inherit; margin: 0; }
    :global(body.dark) .page-wrapper { color: #d1d5db; background-color: #18181b; }
    :global(body.dark) .sidebar-container { background-color: #1f2937; border-right-color: #374151; color: #d1d5db; }
    :global(body.dark) .sidebar-header { border-bottom-color: #374151; } :global(body.dark) .sidebar-title { color: #f3f4f6; }
    :global(body.dark) .nav-link { color: #d1d5db; } :global(body.dark) .nav-link:hover { background-color: #374151; }
    :global(body.dark) .nav-link.active { background-color: #1e40af; }
    :global(body.dark) .logout-button { color: #d1d5db; } :global(body.dark) .logout-button:hover { background-color: #374151; }
    :global(body.dark) .main-content-kanban { background-color: var(--bg-dark); color: var(--text-dark-primary); }

    .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1050; /* Higher than sidebar and header */
    padding: 1rem;
    box-sizing: border-box;
}

.modal-content {
    background-color: var(--surface-light);
    color: var(--text-light-primary);
    padding: 1.5rem 2rem;
    border-radius: 8px;
    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
    max-width: 450px;
    width: 100%;
    text-align: center;
}
:global(body.dark) .modal-content {
    background-color: var(--surface-dark);
    color: var(--text-dark-primary);
}

.modal-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 0;
    margin-bottom: 0.75rem;
}

.modal-message {
    font-size: 0.95rem;
    margin-bottom: 1.5rem;
    line-height: 1.6;
    color: var(--text-light-secondary);
}
:global(body.dark) .modal-message {
    color: var(--text-dark-secondary);
}

.modal-actions {
    display: flex;
    justify-content: flex-end; /* Align buttons to the right */
    gap: 0.75rem;
}

.modal-button {
    padding: 0.6rem 1.2rem;
    border-radius: 5px;
    border: none;
    font-weight: 500;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.2s, box-shadow 0.2s;
}

.modal-button-confirm {
    background-color: var(--interactive-light);
    color: white;
}
:global(body.dark) .modal-button-confirm {
    background-color: var(--interactive-dark);
}
.modal-button-confirm:hover {
    background-color: #1d4ed8; /* Darker blue */
    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.3);
}
:global(body.dark) .modal-button-confirm:hover {
    background-color: #1e3a8a; /* Darker blue for dark mode */
}


.modal-button-cancel {
    background-color: #e5e7eb; /* Light gray */
    color: var(--text-light-primary);
    border: 1px solid #d1d5db;
}
:global(body.dark) .modal-button-cancel {
    background-color: #374151; /* Darker gray */
    color: var(--text-dark-primary);
    border-color: #4b5563;
}
.modal-button-cancel:hover {
    background-color: #d1d5db; /* Slightly darker gray */
}
:global(body.dark) .modal-button-cancel:hover {
    background-color: #4b5563; /* Slightly lighter gray for dark mode */
}
    /* KANBAN BOARD SPECIFIC STYLES */
    :root {
        --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        --bg-light: #f3f4f6; --bg-dark: #18181b;
        --text-light-primary: #1f2937; --text-light-secondary: #4b5563;
        --text-dark-primary: #f3f4f6; --text-dark-secondary: #9ca3af;
        --border-light: #e5e7eb; --border-dark: #374151;
        --surface-light: #ffffff; --surface-dark: #1f2937;
        --interactive-light: #2563eb; --interactive-dark: #1d4ed8;
        --interactive-hover-light: #f0f4f8; --interactive-hover-dark: #2c3a4f;
        --priority-high-light: #ef4444; --priority-high-dark: #f87171;
        --priority-medium-light: #f59e0b; --priority-medium-dark: #fbbf24;
        --priority-low-light: #22c55e; --priority-low-dark: #4ade80;
        --priority-standard-light: #3b82f6; --priority-standard-dark: #60a5fa;
        --status-late-bg: #fee2e2; --status-late-text: #991b1b;
        --status-incomplete-bg: #fef3c7; --status-incomplete-text: #92400e;
    }
    :global(body.dark) {
        --status-late-bg: #3f2222; --status-late-text: #fca5a5;
        --status-incomplete-bg: #4a3a1d; --status-incomplete-text: #fde68a;
    }

    .kanban-board-scroll-container { flex-grow: 1; overflow-x: auto; overflow-y: hidden; padding: 10px; box-sizing: border-box; }
    .kanban-board { display: inline-flex; gap: 12px; padding-bottom: 10px; min-height: calc(100% - 10px); align-items: flex-start; box-sizing: border-box; }
    .kanban-column { background-color: var(--surface-light); border: 1px solid var(--border-light); border-radius: 8px; width: 300px; flex-shrink: 0; display: flex; flex-direction: column; max-height: calc(100vh - 60px - 40px - 30px); padding: 0; box-sizing: border-box; box-shadow: 0 2px 4px rgba(0,0,0,0.04); position: relative; /* For pseudo-elements */}
    :global(body.dark) .kanban-column { background-color: var(--surface-dark); border-color: var(--border-dark); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
    
    .kanban-column.dragging-column {
        opacity: 0.8;
        box-shadow: 0 10px 20px rgba(0,0,0,0.15);
        /* transform is handled by JS for animation */
        /* transition: transform 0.1s ease-out; NOT NEEDED as JS handles pos */
        pointer-events: none; /* Helps prevent unwanted interactions with content during fixed positioning */
    }
    :global(body.dark) .kanban-column.dragging-column {
        box-shadow: 0 10px 20px rgba(0,0,0,0.4);
    }

    /* Visual indicators for column drop zones with smooth transition */
    .kanban-column::before,
    .kanban-column::after {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        width: 0; /* Start with 0 width */
        opacity: 0; /* Start invisible */
        background-color: var(--interactive-light);
        z-index: 5; /* Lower than dragged column if it's fixed */
        border-radius: 3px;
        pointer-events: none;
        transition: width 0.2s ease-out, opacity 0.2s ease-out, background-color 0.15s ease;
    }
    :global(body.dark) .kanban-column::before,
    :global(body.dark) .kanban-column::after {
        background-color: var(--interactive-dark);
    }

    .kanban-column.drag-over-column-left::before {
        left: -3px;
        width: 6px; /* Expand width */
        opacity: 1; /* Become visible */
    }

    .kanban-column.drag-over-column-right::after {
        right: -3px;
        width: 6px; /* Expand width */
        opacity: 1; /* Become visible */
    }

    .column-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; box-sizing: border-box; border-bottom: 1px solid var(--border-light); }
    :global(body.dark) .column-header { border-bottom-color: var(--border-dark); }
    .column-title { font-size: 0.95em; font-weight: 600; color: var(--text-light-primary); margin: 0; flex-grow: 1; padding-right: 5px; }
    :global(body.dark) .column-title { color: var(--text-dark-primary); }
    .column-task-count { font-size: 0.8em; color: var(--text-light-secondary); margin-left: 8px; background-color: var(--bg-light); padding: 2px 6px; border-radius: 4px;}
    :global(body.dark) .column-task-count { color: var(--text-dark-secondary); background-color: var(--bg-dark); }
    .column-options-button { background: transparent; border: none; color: var(--text-light-secondary); padding: 4px; cursor: pointer; border-radius: 9999px; line-height: 1; transition: background-color 0.15s ease;}
    .column-options-button:hover { background-color: var(--interactive-hover-light); }
    :global(body.dark) .column-options-button { color: var(--text-dark-secondary); }
    :global(body.dark) .column-options-button:hover { background-color: var(--interactive-hover-dark); }

    .kanban-column-content { overflow-y: auto; flex-grow: 1; padding: 10px; min-height: 30px; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; }
    .empty-column-dropzone { flex-grow: 1; min-height: 60px; border: 2px dashed var(--border-light); border-radius: 6px; margin: 0; display: flex; align-items: center; justify-content: center; color: var(--text-light-secondary); font-size: 0.9em; }
    :global(body.dark) .empty-column-dropzone { border-color: var(--border-dark); color: var(--text-dark-secondary); }
    .kanban-column-content::-webkit-scrollbar { width: 8px; }
    .kanban-column-content::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 4px; }
    .kanban-column-content::-webkit-scrollbar-track { background-color: transparent; }
    :global(body.dark) .kanban-column-content::-webkit-scrollbar-thumb { background-color: #475569; }

    .kanban-card { background-color: var(--surface-light); border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 1px 1px rgba(0,0,0,0.04); padding: 10px 12px; margin-bottom: 0; cursor: grab; word-wrap: break-word; font-size: 14px; color: var(--text-light-primary); position: relative; transition: border-top 0.1s linear, border-bottom 0.1s linear, background-color 0.15s ease, opacity 0.2s ease; box-sizing: border-box; border-top: 3px solid transparent; border-bottom: 3px solid transparent; border-left: 4px solid transparent; }
    :global(body.dark) .kanban-card { background-color: var(--surface-dark); color: var(--text-dark-primary); box-shadow: 0 1px 2px rgba(0,0,0,0.2), 0 1px 1px rgba(0,0,0,0.2); }
    .kanban-card:hover:not(.dragging-card) { background-color: #f8fafc; }
    :global(body.dark) .kanban-card:hover:not(.dragging-card) { background-color: #334155; }
    .kanban-card.dragging-card { opacity: 0.85; box-shadow: 0 8px 16px rgba(0,0,0,0.12); border-color: transparent !important; pointer-events: none; }
    :global(body.dark) .kanban-card.dragging-card { box-shadow: 0 8px 16px rgba(0,0,0,0.35); }
    .kanban-card.drag-over-card-before { border-top-color: var(--interactive-light); }
    .kanban-card.drag-over-card-after { border-bottom-color: var(--interactive-light); }
    :global(body.dark) .kanban-card.drag-over-card-before { border-top-color: var(--interactive-dark); }
    :global(body.dark) .kanban-card.drag-over-card-after { border-bottom-color: var(--interactive-dark); }
    
    .card-labels { display: flex; gap: 4px; margin-bottom: 4px; flex-wrap: wrap; }
    .card-labels span { font-size: 0.7em; padding: 2px 5px; border-radius: 3px; font-weight: 500; }
    .label-status-late { background-color: var(--status-late-bg); color: var(--status-late-text); }
    .label-status-incomplete { background-color: var(--status-incomplete-bg); color: var(--status-incomplete-text); }

    .card-title { margin: 0 0 6px 0; font-size: 0.9rem; font-weight: 500; line-height: 1.4; display: block; }
    .card-description-preview { font-size: 0.8rem; color: var(--text-light-secondary); margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; }
    :global(body.dark) .card-description-preview { color: var(--text-dark-secondary); }
    .card-footer { display: flex; justify-content: space-between; align-items: center; min-height: 20px; margin-top: 4px; }
    .card-meta-icons { display: flex; align-items: center; gap: 10px; color: var(--text-light-secondary); }
    :global(body.dark) .card-meta-icons { color: var(--text-dark-secondary); }
    .meta-icon { display: flex; align-items: center; gap: 4px; font-size: 0.75em; }
    .due-date-text { font-size: 0.85em; }
    .priority-high { border-left-color: var(--priority-high-light); }
    .priority-medium { border-left-color: var(--priority-medium-light); }
    .priority-low { border-left-color: var(--priority-low-light); }
    .priority-standard { border-left-color: var(--border-light); } 
    :global(body.dark) .priority-high { border-left-color: var(--priority-high-dark); }
    :global(body.dark) .priority-medium { border-left-color: var(--priority-medium-dark); }
    :global(body.dark) .priority-low { border-left-color: var(--priority-low-dark); }
    :global(body.dark) .priority-standard { border-left-color: var(--border-dark); }

    .add-card-button-wrapper { 
        padding: 8px 10px; 
        border-top: 1px solid var(--border-light); 
        background: linear-gradient(to bottom, rgba(255,255,255,0.9), var(--surface-light));
        flex-shrink: 0;
        position: sticky;
        bottom: 0;
        z-index: 5;
    }
    :global(body.dark) .add-card-button-wrapper { 
        border-top-color: var(--border-dark); 
        background: linear-gradient(to bottom, rgba(31,41,55,0.9), var(--surface-dark));
    }
    .add-card-button { background-color: transparent; border: none; color: var(--text-light-secondary); padding: 8px 10px; border-radius: 4px; text-align: left; width: 100%; cursor: pointer; font-size: 0.85em; box-sizing: border-box; transition: background-color 0.15s ease, color 0.15s ease; }
    .add-card-button:hover { background-color: var(--interactive-hover-light); color: var(--interactive-light); }
    :global(body.dark) .add-card-button { color: var(--text-dark-secondary); }
    :global(body.dark) .add-card-button:hover { background-color: var(--interactive-hover-dark); color: var(--interactive-dark); }
    .p-4 { padding: 1rem; } .text-red-600 { color: #dc2626; } :global(body.dark) .text-red-600 { color: #f87171; }
    .text-gray-500 { color: #6b7280; } :global(body.dark) .text-gray-500 { color: #9ca3af; }
    /* --- ADD TASK MODAL STYLES --- */
.add-task-modal-content { /* For specific sizing or layout if needed */
    max-width: 550px;
    text-align: left; /* Align form elements to the left */
}

/* --- UPDATE DUE DATE MODAL STYLES (reusing add-task-modal-content for consistency) --- */
/* No specific new styles needed beyond what's already defined for .modal-content and form elements */

.form-group {
    margin-bottom: 1rem;
}
.form-group-row {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
}
.form-group-row .form-group {
    flex: 1;
    margin-bottom: 0;
}

.form-label {
    display: block;
    font-weight: 500;
    font-size: 0.875rem;
    margin-bottom: 0.3rem;
    color: var(--text-light-secondary);
}
:global(body.dark) .form-label {
    color: var(--text-dark-secondary);
}

.form-input,
.form-textarea,
.form-select {
    width: 100%;
    padding: 0.6rem 0.75rem;
    border: 1px solid var(--border-light);
    border-radius: 5px;
    background-color: var(--surface-light);
    color: var(--text-light-primary);
    font-size: 0.9rem;
    box-sizing: border-box;
    transition: border-color 0.2s, box-shadow 0.2s;
}
:global(body.dark) .form-input,
:global(body.dark) .form-textarea,
:global(body.dark) .form-select {
    background-color: var(--bg-dark); /* Slightly different from surface-dark for input fields */
    color: var(--text-dark-primary);
    border-color: var(--border-dark);
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
    outline: none;
    border-color: var(--interactive-light);
    box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2); /* Focus ring */
}
:global(body.dark) .form-input:focus,
:global(body.dark) .form-textarea:focus,
:global(body.dark) .form-select:focus {
    border-color: var(--interactive-dark);
    box-shadow: 0 0 0 2px rgba(29, 78, 216, 0.3);
}

.form-textarea {
    min-height: 80px;
    resize: vertical;
}

.form-error-message {
    background-color: #fee2e2; /* Light red */
    color: #b91c1c; /* Dark red text */
    border: 1px solid #fca5a5; /* Red border */
    padding: 0.75rem 1rem;
    border-radius: 5px;
    font-size: 0.875rem;
    margin-bottom: 1rem;
}
:global(body.dark) .form-error-message {
    background-color: #450a0a; /* Darker red bg */
    color: #fecaca; /* Light red text */
    border-color: #7f1d1d; /* Dark red border */
}

/* --- FLOATING MESSAGE MODAL STYLES --- */
.floating-message-modal {
    position: fixed;
    top: 20px; /* Adjust as needed */
    left: 50%;
    transform: translateX(-50%);
    z-index: 1100; /* Higher than other modals */
    pointer-events: none; /* Allow clicks to pass through if not interacting with the message itself */
    width: auto; /* Adjust width based on content */
    max-width: 90%; /* Max width for responsiveness */
}

.floating-message-content {
    background-color: #fef3c7; /* Light yellow for warning */
    color: #92400e; /* Dark orange text */
    border: 1px solid #fde68a; /* Yellow border */
    padding: 12px 20px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    gap: 15px;
    font-size: 0.95rem;
    font-weight: 500;
    pointer-events: auto; /* Re-enable pointer events for the content itself */
}
:global(body.dark) .floating-message-content {
    background-color: #4a3a1d; /* Darker yellow for dark mode */
    color: #fde68a; /* Lighter yellow text for dark mode */
    border-color: #92400e; /* Darker orange border for dark mode */
}

.floating-message-content p {
    margin: 0;
    flex-grow: 1;
}

.floating-message-close-btn {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0 5px;
    transition: opacity 0.2s;
}

.floating-message-close-btn:hover {
    opacity: 0.7;
}
</style>
