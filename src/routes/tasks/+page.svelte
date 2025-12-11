<script lang="ts">
    import { fly, slide } from 'svelte/transition';
    import { onMount, onDestroy, tick } from 'svelte';
    import { enhance } from '$app/forms';
    import { goto, invalidateAll } from '$app/navigation';
    import { page } from '$app/stores'; // Import page store for active link highlighting
    import type { SubmitFunction, ActionResult } from '@sveltejs/kit';
    import { quintOut } from 'svelte/easing';
    import { browser } from '$app/environment';
    import AppHeader from '$lib/components/AppHeader.svelte';
    import CalendarAIPanel from '$lib/components/CalendarAIPanel.svelte';

    // --- Task Type ---
    interface TaskForFrontend {
        id: string;
        title: string;
        description: string;
        isCompleted: boolean;
        status: 'pending' | 'complete' | 'incomplete' | 'late';
        priority: string | number | null;
        createdAtISO: string | null;
        dueDateISO: string | null;
        dueTime: string | null;
    }


    // --- Props ---
    export let data: {
        user?: { name?: string; };
        tasks: Array<TaskForFrontend>;
        error?: string;
        filterFromDate?: string | null;
        filterToDate?: string | null;
    };
    export let form: ActionResult | undefined | null;

    // --- Component State ---
    let isSidebarOpen = false;
    let isSubmitting = false;
    let isToggleCompleting: Record<string, boolean> = {};
    let isDarkMode = false; // For dark mode state
    let isAIPanelOpen = false;

    let batchDeleteSuccessMessage: string | undefined = undefined;
    let batchDeleteMessageTimeoutId: number | undefined;
    let shouldShowOtherTasksTitle = false;
    let currentDateTime = "";
    let dateTimeInterval: ReturnType<typeof setInterval> | null = null;

    // --- Add Task Modal State ---
    let showAddTaskModal = false;
    let newTaskTitle = '';
    let newTaskDescription = '';
    let newTaskDueDate: string | null = null;
    let newTaskDueTime: string | null = null;
    let newTaskPriority: string = 'standard';

    // --- Edit Task Modal State ---
    let showEditTaskModal = false;
    let taskToEdit: TaskForFrontend | null = null;
    let editTaskId = '';
    let editTaskTitle = '';
    let editTaskDescription = '';
    let editTaskDueDate: string | null = null;
    let editTaskDueTime: string | null = null;
    let editTaskPriority: string = 'standard';
    let editTaskFormEl: HTMLFormElement | undefined = undefined;

    // --- Delete Confirmation States ---
    let showSingleDeleteConfirm = false;
    let taskToConfirmDelete: { id: string; title: string } | null = null;
    let showBatchDeleteConfirm = false;
    let singleDeleteFormEl: HTMLFormElement | undefined = undefined;
    let batchDeleteFormEl: HTMLFormElement | undefined = undefined;
    let toggleCompleteFormEl: HTMLFormElement | undefined = undefined;

    // --- Toggle Complete Confirmation State ---
    let showToggleCompleteConfirm = false;
    let taskToConfirmToggleComplete: { id: string; title: string; currentIsCompleted: boolean } | null = null;

    // --- Sort By Day Modal State ---
    let showSortByDayModal = false;
    let selectedSortDay: string | null = null;

    // --- Sort Options State ---
    let showSortOptions = false;
    let currentSortCriteria: 'priority' | 'status' | 'dueDate' | 'title' = 'dueDate';
    let currentSortOrder: 'asc' | 'desc' = 'asc';

    // --- State for viewing tasks by selected date ---
    let viewingDateInput: string | null = null;

    // --- Date Range Filter Modal State ---
    let showFilterDateRangeModal = false;
    let clientFilterFromDate: string | null = data.filterFromDate ?? null;
    let clientFilterToDate: string | null = data.filterToDate ?? null;

    // --- Search State ---
    let searchQuery = '';

    // --- Reactive Variables ---
    $: tasks = data?.tasks ?? [];
    $: loadError = data?.error;
    $: username = data?.user?.name || (browser ? localStorage.getItem('microtask_username') || "User" : "User");

    let actionError: string | undefined = undefined;
    let pageActionError: string | undefined = undefined;
    let pageActionSuccessMessage: string | undefined = undefined;
    let messageTimeoutId: number | undefined;

    let noTasksInViewMessage = "No tasks for this view. Time to relax or plan ahead!";

    const encouragingMessages: string[] = [
    "Great things start with small tasks!",
    "Let's organize and conquer!",
    "Ready to make some progress?",
    "Add a task and let's get started!",
    "One task at a time builds momentum.",
    "Your future self will thank you for these tasks.",
    "What's next on the agenda?",
    "No tasks in this view! Enjoy the moment or plan your next big win.",
    "Looks clear here! A perfect opportunity to strategize or take a breather.",
    "Zero tasks? Maybe it's a sign to explore a new idea or learn something new.",
    "Your schedule for this view is empty. Embrace the freedom or fill it with purpose!",
    "All clear! Time to celebrate small victories or set new goals.",
    "A blank slate! What amazing thing will you decide to do next?",
    "No tasks looming. Use this calm to recharge or create something new.",
    "This space is open! What will you fill it with? Adventure? Learning? Rest?",
    "Task list clear! Perhaps it's time for that coffee break you've been thinking about.",
    "An empty list means you're either super efficient or it's time to dream big!",
    "Nothing to see here (task-wise). Seize the day in other ways!",
    "Well done on clearing your tasks for this view, or perhaps it's a fresh start!",
    "The coast is clear! What's your next move, captain?",
    "No tasks in sight. Perfect for a moment of mindfulness or a burst of creativity.",
    "Your task list is looking spotless for this view. What's your next focus?"
];

    function getRandomMessage() {
        return encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];
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

    function toggleSidebar() {
        isSidebarOpen = !isSidebarOpen;
    }
    function closeSidebar() {
        isSidebarOpen = false;
    }
    function handleLogout() {
        if (browser) {
            localStorage.removeItem('microtask_username');
            document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
            goto('/login');
        }
    }
    function toggleDarkMode() { 
      isDarkMode = !isDarkMode;
      if (browser) {
        document.documentElement.classList.toggle('dark', isDarkMode);
        document.body.classList.toggle('dark', isDarkMode);
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
      }
    }


    onMount(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const fromParam = urlParams.get('filterFromDate');
        const toParam = urlParams.get('filterToDate');
        const taskIdParam = urlParams.get('taskId');
        if (fromParam) clientFilterFromDate = fromParam;
        if (toParam) clientFilterToDate = toParam;

        if (browser) {
          const savedTheme = localStorage.getItem('theme');
          isDarkMode = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
          document.documentElement.classList.toggle('dark', isDarkMode);
          document.body.classList.toggle('dark', isDarkMode);
          if (!data.user?.name) username = localStorage.getItem('microtask_username') || "User";

          // Update date/time
          updateDateTime();
          dateTimeInterval = setInterval(updateDateTime, 60000);
          
          // Handle taskId parameter - open task edit modal
          if (taskIdParam) {
            const task = data.tasks?.find(t => t.id === taskIdParam);
            if (task) {
              editTaskId = task.id;
              editTaskTitle = task.title || '';
              editTaskDescription = task.description || '';
              editTaskDueDate = task.dueDateISO || null;
              editTaskDueTime = task.dueTime || null;
              editTaskPriority = String(task.priority || 'standard');
              showEditTaskModal = true;
              // Clear the URL parameter
              const newUrl = new URL(window.location.href);
              newUrl.searchParams.delete('taskId');
              window.history.replaceState({}, '', newUrl.toString());
            }
          }
        }

        const clickHandler = (event: MouseEvent) => {
            const target = event.target as Node | null;
            const sidebarEl = document.getElementById('sidebar');
            const hamburgerButton = document.getElementById('hamburgerButton');
             if (sidebarEl && !sidebarEl.contains(target) && hamburgerButton && !hamburgerButton.contains(target) && isSidebarOpen) {
                closeSidebar();
            }
        };
        document.addEventListener('click', clickHandler);

        return () => {
            if (dateTimeInterval) clearInterval(dateTimeInterval);
            document.removeEventListener('click', clickHandler);
            if (messageTimeoutId) clearTimeout(messageTimeoutId);
            if (batchDeleteMessageTimeoutId) clearTimeout(batchDeleteMessageTimeoutId);
        };
    });


    let tasksForSelectedDate: TaskForFrontend[] = [];
    let otherTasksToList: TaskForFrontend[] = [];
    let selectedDateDisplayTitle = "Due Today";

    function getTodaysDateISO(): string {
        const today = new Date();
        return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    function formatDisplayDate(dateStr: string | null): string {
        if (typeof dateStr !== 'string' || dateStr.indexOf('-') === -1) {
            return dateStr || (viewingDateInput === null ? "Today" : "");
        }
        try {
            const parts = dateStr.split('-').map(Number);
            if (parts.length === 3 && !parts.some(isNaN) && parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1 && parts[2] <= 31) {
                const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                if (dateObj.getFullYear() === parts[0] && dateObj.getMonth() === parts[1] - 1 && dateObj.getDate() === parts[2]) {
                    return dateObj.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
                }
            }
            return dateStr;
        } catch (e) {
            console.error("Error formatting display date:", e);
            return dateStr;
        }
    }

    $: {
        const todayISO = getTodaysDateISO();
        let primaryTaskList: TaskForFrontend[] = [];
        let secondaryTaskList: TaskForFrontend[] = [];
        let tasksToProcess = tasks;
        const trimmedSearchQuery = searchQuery.trim();

        if (trimmedSearchQuery !== '') {
            const lowerSearchQuery = trimmedSearchQuery.toLowerCase();
            tasksToProcess = tasks.filter(task => {
                const titleMatch = task.title.toLowerCase().includes(lowerSearchQuery);
                const descriptionMatch = task.description && task.description.toLowerCase().includes(lowerSearchQuery);
                let dueDateMatch = false;
                if (task.dueDateISO) {
                    if (task.dueDateISO.toLowerCase().includes(lowerSearchQuery)) dueDateMatch = true;
                    try {
                        const dateObj = new Date(task.dueDateISO);
                        if (dateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).toLowerCase().includes(lowerSearchQuery)) dueDateMatch = true;
                        if (dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toLowerCase().includes(lowerSearchQuery)) dueDateMatch = true;
                    } catch (e) { /* ignore */ }
                }
                return titleMatch || descriptionMatch || dueDateMatch;
            });
        }

        const isDateRangeFilterActive = !!(clientFilterFromDate || clientFilterToDate);

        if (isDateRangeFilterActive) {
            const from = clientFilterFromDate ? new Date(clientFilterFromDate + "T00:00:00Z").getTime() : -Infinity;
            const to = clientFilterToDate ? new Date(clientFilterToDate + "T23:59:59Z").getTime() : Infinity;

            if (tasksToProcess && tasksToProcess.length > 0) {
                primaryTaskList = tasksToProcess.filter(task => {
                    if (!task.dueDateISO) return false;
                    try {
                        const taskDueDate = new Date(task.dueDateISO).getTime();
                        return taskDueDate >= from && taskDueDate <= to;
                    } catch (e) { return false; }
                });
                const primaryTaskIds = new Set(primaryTaskList.map(t => t.id));
                secondaryTaskList = tasksToProcess.filter(task => !primaryTaskIds.has(task.id));
            }
            let title = "Tasks ";
            if (clientFilterFromDate && clientFilterToDate) title = `Due from ${formatDisplayDate(clientFilterFromDate)} to ${formatDisplayDate(clientFilterToDate)}`;
            else if (clientFilterFromDate) title = `Due on or after ${formatDisplayDate(clientFilterFromDate)}`;
            else if (clientFilterToDate) title = `Due on or before ${formatDisplayDate(clientFilterToDate)}`;
            selectedDateDisplayTitle = title;
            viewingDateInput = null;
        } else {
            const targetDateFilter = viewingDateInput || todayISO;
            if (tasksToProcess && tasksToProcess.length > 0) {
                primaryTaskList = tasksToProcess.filter(task => task.dueDateISO && task.dueDateISO.startsWith(targetDateFilter));
                const primaryTaskIds = new Set(primaryTaskList.map(t => t.id));
                secondaryTaskList = tasksToProcess.filter(task => !primaryTaskIds.has(task.id));
            }
            if (viewingDateInput) selectedDateDisplayTitle = viewingDateInput === todayISO ? "Due Today" : `Due ${formatDisplayDate(viewingDateInput)}`;
            else selectedDateDisplayTitle = "Due Today";
        }

        const sortTasks = (taskArray: TaskForFrontend[]) => {
            return [...taskArray].sort((a, b) => {
                let valA: any, valB: any;
                if (currentSortCriteria === 'priority') {
                    const priorityOrder: Record<string, number> = { high: 3, standard: 2, low: 1, na: 0 };
                    valA = priorityOrder[String(a.priority || 'na').toLowerCase()] ?? priorityOrder.na;
                    valB = priorityOrder[String(b.priority || 'na').toLowerCase()] ?? priorityOrder.na;
                } else if (currentSortCriteria === 'status') {
                    const statusOrder = { late: 4, incomplete: 3, pending: 2, complete: 1 };
                    valA = statusOrder[a.status] || 0;
                    valB = statusOrder[b.status] || 0;
                } else if (currentSortCriteria === 'dueDate') {
                    valA = a.dueDateISO ? new Date(a.dueDateISO).getTime() : 0;
                    valB = b.dueDateISO ? new Date(b.dueDateISO).getTime() : 0;
                    if (!a.dueDateISO) valA = currentSortOrder === 'asc' ? Infinity : -Infinity;
                    if (!b.dueDateISO) valB = currentSortOrder === 'asc' ? Infinity : -Infinity;
                } else if (currentSortCriteria === 'title') {
                    valA = a.title.toLowerCase();
                    valB = b.title.toLowerCase();
                } else return 0;
                if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
                return 0;
            });
        };
        tasksForSelectedDate = sortTasks(primaryTaskList);
        otherTasksToList = sortTasks(secondaryTaskList);

        if (tasksForSelectedDate.length === 0 && !loadError && !pageActionError && !batchDeleteSuccessMessage) {
            if (trimmedSearchQuery !== '') {
                let baseMsg = `No tasks match your search: "${trimmedSearchQuery}"`;
                if (isDateRangeFilterActive || viewingDateInput) baseMsg += ` for ${selectedDateDisplayTitle.toLowerCase().replace(/^due /i,'')}.`;
                else baseMsg += ` for today.`;
                noTasksInViewMessage = baseMsg;
            } else if (isDateRangeFilterActive || viewingDateInput) {
                noTasksInViewMessage = `No tasks found for ${selectedDateDisplayTitle.toLowerCase().replace(/^due /i,'')}. Try a different date or clear filters.`;
            } else {
                noTasksInViewMessage = getRandomMessage();
            }
        }
        shouldShowOtherTasksTitle = viewingDateInput !== null || tasksForSelectedDate.length > 0 || clientFilterFromDate !== null || clientFilterToDate !== null;
    }

    function showPageMessage(message: string, isError: boolean = false, duration: number = 4000) {
        // Clear any existing messages first
        pageActionError = undefined;
        pageActionSuccessMessage = undefined;

        if (isError) {
            pageActionError = message;
        } else {
            pageActionSuccessMessage = message;
        }

        if (messageTimeoutId) clearTimeout(messageTimeoutId);
        messageTimeoutId = window.setTimeout(() => {
            pageActionError = undefined;
            pageActionSuccessMessage = undefined;
        }, duration);
    }

    // Removed the reactive block for 'form' to handle messages directly within submit callbacks
    // This simplifies message handling and avoids potential race conditions or unexpected reactivity.

    let selectedTaskIds = new Set<string>();
    function toggleTaskSelection(taskId: string) {
        selectedTaskIds.has(taskId) ? selectedTaskIds.delete(taskId) : selectedTaskIds.add(taskId);
        selectedTaskIds = selectedTaskIds;
    }
    function clearSelections() { selectedTaskIds.clear(); selectedTaskIds = new Set(selectedTaskIds); }

    function openAddTaskModalFunc() {
        showAddTaskModal = true;
        newTaskTitle = '';
        newTaskDescription = '';
        newTaskDueDate = null;
        newTaskDueTime = null;
        newTaskPriority = 'standard';
        actionError = undefined; // Clear action error for new modal
        pageActionError = undefined; // Clear page-level errors
        pageActionSuccessMessage = undefined; // Clear page-level success messages
    }
    function closeAddTaskModal() { showAddTaskModal = false; isSubmitting = false; }

    function openEditTaskModal(task: TaskForFrontend) {
        taskToEdit = task;
        editTaskId = task.id;
        editTaskTitle = task.title;
        editTaskDescription = task.description;
        editTaskDueDate = task.dueDateISO ? task.dueDateISO.substring(0, 10) : null;
        editTaskDueTime = task.dueTime;
        editTaskPriority = task.priority?.toString() || 'standard';
        showEditTaskModal = true;
        actionError = undefined; // Clear action error for new modal
        pageActionError = undefined; // Clear page-level errors
        pageActionSuccessMessage = undefined; // Clear page-level success messages
    }
    function closeEditTaskModal() { showEditTaskModal = false; isSubmitting = false; taskToEdit = null; }

    function openSortByDayModalFunc() {
        selectedSortDay = viewingDateInput || getTodaysDateISO();
        showSortByDayModal = true;
    }
    function closeSortByDayModalFunc() { showSortByDayModal = false; }
    function applySortByDay() {
        if (selectedSortDay) {
            viewingDateInput = selectedSortDay;
            clientFilterFromDate = null;
            clientFilterToDate = null;
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.delete('filterFromDate');
            currentUrl.searchParams.delete('filterToDate');
            goto(currentUrl.href, { invalidateAll: true, noScroll: true, keepFocus: true });
        }
        closeSortByDayModalFunc();
    }

    function viewTodayTasks() {
        viewingDateInput = null;
        clientFilterFromDate = null;
        clientFilterToDate = null;
        searchQuery = '';
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('filterFromDate');
        currentUrl.searchParams.delete('filterToDate');
        goto(currentUrl.href, { invalidateAll: true, noScroll: true, keepFocus: true });
    }

    function toggleSortOptions() { showSortOptions = !showSortOptions; }
    function applySort(criteria: 'priority' | 'status' | 'dueDate' | 'title', order?: 'asc' | 'desc') {
        currentSortCriteria = criteria;
        if (order) currentSortOrder = order;
        else currentSortOrder = (currentSortCriteria === criteria && currentSortOrder === 'asc') ? 'desc' : 'asc';
        showSortOptions = false;
    }

    function openFilterDateRangeModal() { showFilterDateRangeModal = true; }
    function closeFilterDateRangeModal() { showFilterDateRangeModal = false; }
    function applyDateRangeFilter() {
        const currentUrl = new URL(window.location.href);
        if (clientFilterFromDate) currentUrl.searchParams.set('filterFromDate', clientFilterFromDate);
        else currentUrl.searchParams.delete('filterFromDate');
        if (clientFilterToDate) currentUrl.searchParams.set('filterToDate', clientFilterToDate);
        else currentUrl.searchParams.delete('filterToDate');
        goto(currentUrl.href, { invalidateAll: true, noScroll: true, keepFocus: true });
        closeFilterDateRangeModal();
    }
    function clearDateRangeFilter() {
        clientFilterFromDate = null;
        clientFilterToDate = null;
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.delete('filterFromDate');
        currentUrl.searchParams.delete('filterToDate');
        goto(currentUrl.href, { invalidateAll: true, noScroll: true, keepFocus: true });
        closeFilterDateRangeModal();
    }

    const handleModalFormSubmit: SubmitFunction<Record<string, any>, Record<string, any>> = ({ action }) => {
        isSubmitting = true; actionError = undefined;
        const isActionAddTask = action.search === '?/addTask';
        const isActionUpdateTask = action.search === '?/updateTask';
        return async ({ result, update }) => {
            let wasSuccessful = false;
            if (result.type === 'success') {
                if (isActionAddTask && (result.data as any)?.taskForm?.success) {
                    showPageMessage((result.data as any).taskForm.message, false);
                    wasSuccessful = true;
                }
                else if (isActionUpdateTask && (result.data as any)?.taskForm?.success) {
                    showPageMessage((result.data as any).taskForm.message, false);
                    wasSuccessful = true;
                }
            } else if (result.type === 'failure') {
                const formErrors = result.data as any;
                const errorMessage = formErrors?.taskForm?.error || formErrors?.error || 'An unknown error occurred.';
                actionError = errorMessage; // Set actionError for modal-specific display
                showPageMessage(errorMessage, true); // Also show as page-level error
            }

            await update({ reset: false });
            if (wasSuccessful) {
                await invalidateAll();
                if (isActionAddTask && showAddTaskModal) closeAddTaskModal();
                else if (isActionUpdateTask && showEditTaskModal) closeEditTaskModal();
            }
            isSubmitting = false;
        };
    };

    function requestSingleDelete(task: { id: string; title: string }) {
        taskToConfirmDelete = task;
        showSingleDeleteConfirm = true;
        pageActionError = undefined; // Clear any existing page errors
        pageActionSuccessMessage = undefined; // Clear any existing page success messages
    }
    function cancelSingleDelete() { showSingleDeleteConfirm = false; taskToConfirmDelete = null; }
    const handleSingleDeleteSubmitCb: SubmitFunction = () => {
        isSubmitting = true;
        return async ({ result, update }) => {
            if (result.type === 'success') {
                showPageMessage((result.data as any)?.deleteTaskForm?.successMessage || 'Task deleted successfully.', false);
                await invalidateAll(); // Ensure data is re-fetched after successful deletion
            } else if (result.type === 'failure') {
                const formErrors = result.data as any;
                const errorMessage = formErrors?.deleteTaskForm?.error || formErrors?.error || 'An unknown error occurred while deleting the task.';
                showPageMessage(errorMessage, true);
            }
            await update(); // Update the form state, which might trigger data re-fetch if not already done by invalidateAll
            isSubmitting = false;
            if (showSingleDeleteConfirm) cancelSingleDelete();
        };
    };
    function confirmSingleDelete() {
        if (singleDeleteFormEl && taskToConfirmDelete) {
            (singleDeleteFormEl.elements.namedItem('taskId') as HTMLInputElement).value = taskToConfirmDelete.id;
            singleDeleteFormEl.requestSubmit();
        }
    }

    function requestBatchDelete() { if (selectedTaskIds.size > 0) showBatchDeleteConfirm = true; }
    function cancelBatchDelete() { showBatchDeleteConfirm = false; }
    const handleBatchDeleteSubmitCb: SubmitFunction = ({ formData }) => {
        formData.set('taskIds', Array.from(selectedTaskIds).join(','));
        isSubmitting = true;
        return async ({ result, update }) => {
            if (result.type === 'success' && result.data && (result.data as any).batchDeleteForm?.successMessage) {
                clearSelections();
                batchDeleteSuccessMessage = "Tasks have been deleted successfully!";
                if (batchDeleteMessageTimeoutId) clearTimeout(batchDeleteMessageTimeoutId);
                batchDeleteMessageTimeoutId = window.setTimeout(() => batchDeleteSuccessMessage = undefined, 2000);
            }
            await update({ reset: false });
            isSubmitting = false;
            if (showBatchDeleteConfirm) cancelBatchDelete();
        };
    };
    function confirmBatchDelete() { if (batchDeleteFormEl) batchDeleteFormEl.requestSubmit(); }

    const handleToggleCompleteSubmitCb: SubmitFunction = ({ formData }) => {
        const taskId = formData.get('taskId') as string;
        if (taskId) isToggleCompleting = { ...isToggleCompleting, [taskId]: true };
        return async ({ update }) => {
            if (taskId) isToggleCompleting = { ...isToggleCompleting, [taskId]: false };
            await update({ reset: false });
        };
    };

    function requestToggleComplete(task: TaskForFrontend) {
        taskToConfirmToggleComplete = { id: task.id, title: task.title, currentIsCompleted: task.isCompleted };
        showToggleCompleteConfirm = true;
    }
    function cancelToggleCompleteConfirmation() { showToggleCompleteConfirm = false; taskToConfirmToggleComplete = null; }
    function confirmToggleTaskCompletion() {
        if (toggleCompleteFormEl && taskToConfirmToggleComplete) {
            (toggleCompleteFormEl.elements.namedItem('taskId') as HTMLInputElement).value = taskToConfirmToggleComplete.id;
            (toggleCompleteFormEl.elements.namedItem('isCompleted') as HTMLInputElement).value = String(taskToConfirmToggleComplete.currentIsCompleted);
            toggleCompleteFormEl.requestSubmit();
            cancelToggleCompleteConfirmation();
        } else {
            cancelToggleCompleteConfirmation();
        }
    }

    function formatDateTimeDisplay(isoDateString: string | null, dueTime: string | null = null): string {
        if (!isoDateString) return 'N/A';
        try {
            const datePartOnly = isoDateString.substring(0,10);
            const [year, month, day] = datePartOnly.split('-').map(Number);
            const displayDate = new Date(year, month - 1, day);
            const dateFormatted = displayDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            if (dueTime && dueTime.includes(':')) {
                let [hoursStr, minutesStr] = dueTime.split(':');
                let hours = parseInt(hoursStr, 10), minutes = parseInt(minutesStr, 10);
                if (isNaN(hours) || isNaN(minutes)) return dateFormatted;
                const ampm = hours >= 12 ? 'PM' : 'AM';
                hours = hours % 12 || 12;
                return `${dateFormatted} ${hours}:${minutes < 10 ? '0' : ''}${minutes} ${ampm}`;
            }
            return dateFormatted;
        } catch (e) { return 'Invalid Date'; }
    }

    function formatPriorityDisplay(priority: string | number | null): string {
        const priorityValue = priority ? String(priority).toLowerCase() : 'na';
        let displayClass = 'priority-tag';
        let displayText = '';
        switch (priorityValue) {
            case 'low': displayClass += ' priority-low'; displayText = 'LOW'; break;
            case 'standard': displayClass += ' priority-standard'; displayText = 'STANDARD'; break;
            case 'high': displayClass += ' priority-high'; displayText = 'HIGH'; break;
            default: displayClass += ' priority-na'; displayText = 'N/A'; break;
        }
        return `<span class="${displayClass}">${displayText}</span>`;
    }


    onDestroy(() => {
        if (messageTimeoutId) clearTimeout(messageTimeoutId);
        if (batchDeleteMessageTimeoutId) clearTimeout(batchDeleteMessageTimeoutId);
    });

    function escKeyHandler(event: KeyboardEvent) {
        if (event.key === 'Escape') {
            if (showAddTaskModal) closeAddTaskModal();
            if (showEditTaskModal) closeEditTaskModal();
            if (showSingleDeleteConfirm) cancelSingleDelete();
            if (showBatchDeleteConfirm) cancelBatchDelete();
            if (showSortByDayModal) closeSortByDayModalFunc();
            if (showSortOptions) showSortOptions = false;
            if (showToggleCompleteConfirm) cancelToggleCompleteConfirmation();
            if (showFilterDateRangeModal) closeFilterDateRangeModal();
            if (searchQuery !== '') searchQuery = '';
            if (isSidebarOpen) closeSidebar();
        }
    }

    function handleWindowClick(e: MouseEvent) {
        const sortDropdown = document.getElementById('sortOptionsDropdown');
        const sortButton = document.getElementById('sortButton');
        if (showSortOptions && sortDropdown && !sortDropdown.contains(e.target as Node) && sortButton && !sortButton.contains(e.target as Node)) {
            showSortOptions = false;
        }
    }
</script>

<svelte:window on:keydown={escKeyHandler} on:click={handleWindowClick} />

<form method="POST" action="?/deleteTask" use:enhance={handleSingleDeleteSubmitCb} bind:this={singleDeleteFormEl} style="display: none;">
    <input type="hidden" name="taskId" />
</form>
<form method="POST" action="?/batchDeleteTasks" use:enhance={handleBatchDeleteSubmitCb} bind:this={batchDeleteFormEl} style="display: none;">
</form>
<form method="POST" action="?/toggleComplete" use:enhance={handleToggleCompleteSubmitCb} bind:this={toggleCompleteFormEl} style="display: none;">
    <input type="hidden" name="taskId" />
    <input type="hidden" name="isCompleted" />
</form>

<div class="app-container">
    <AppHeader {isDarkMode} {username} {currentDateTime} on:toggleSidebar={toggleSidebar} on:toggleDarkMode={toggleDarkMode} on:logout={handleLogout} />
    {#if isSidebarOpen}
    <aside
  id="sidebar"
  class={`fixed top-0 left-0 h-full w-64 shadow-lg z-10000 flex flex-col justify-between p-4 border-r ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}
  transition:fly={{ x: -300, duration: 300, easing: quintOut }}
>
  <div>
    <div class={`flex items-center justify-between mb-8 pb-4 border-b ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}>
      <div class="flex items-center gap-2">
        <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Logo" class="w-8 h-8" />
        <h1 class={`text-xl font-bold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Microtask</h1>
      </div>
      <button on:click={closeSidebar} class={`p-1 rounded-md transition-colors ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`} aria-label="Close sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
                <nav class="flex flex-col gap-2">
          <a href="/home"
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${$page.url.pathname === '/home' || $page.url.pathname === '/' ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
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
          <a href="/tasks"
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${$page.url.pathname === '/tasks' ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                 class={`w-5 h-5 ${$page.url.pathname === '/tasks' ? 'stroke-white' : (isDarkMode ? 'stroke-zinc-300' : 'stroke-gray-700')}`}>
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
            <span>All Tasks</span>
          </a>
          <a href="/calendar"
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${$page.url.pathname === '/calendar' ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
                <path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" />
                <path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/>
            </svg>
            <span>Calendar</span>
          </a>
          <a href="/workspace"
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${$page.url.pathname.startsWith('/workspace') ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
                 class={`w-5 h-5 ${$page.url.pathname.startsWith('/workspace') ? 'stroke-white' : (isDarkMode ? 'stroke-zinc-300' : 'stroke-gray-700')}`}>
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.098a2.25 2.25 0 0 1-2.25 2.25h-12a2.25 2.25 0 0 1-2.25-2.25V14.15M18 18.75h.75A2.25 2.25 0 0 0 21 16.5v-1.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 15v1.5A2.25 2.25 0 0 0 3.75 18.75H4.5M12 12.75a3 3 0 0 0-3-3H5.25V7.5a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3v2.25H15a3 3 0 0 0-3 3Z" />
            </svg>
            <span>Workspace</span>
          </a>
        </nav>
      </div>
      <button on:click={handleLogout}
              class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold w-full mt-auto transition-colors duration-150
                     ${isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5"
             class={`w-5 h-5 ${isDarkMode ? 'stroke-zinc-300' : 'stroke-gray-700'}`}>
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
        </svg>
        <span>Log out</span>
      </button>
    </aside>
  {/if}
  <main class="main-content">
        <!-- Page Title Section for "All Tasks" -->
        <div class="page-title-header">
            <h1>Here are all of the tasks you have:</h1>
        </div>
        <!-- Task controls header -->
        <div class="content-header task-list-header">
            <button class="today-btn" on:click={viewTodayTasks}>TODAY</button>
            <div class="search-bar">
                <img src="/Search.png" alt="Search Icon" />
                <input type="search" placeholder="Search all tasks..." bind:value={searchQuery} />
            </div>
            <div class="filter-buttons">
                <button class="filter-btn" on:click={openAddTaskModalFunc}>+ Add Task</button>
                <button class="filter-btn" on:click={openSortByDayModalFunc}>Day {#if viewingDateInput !== null}*{/if}</button>
                <div class="relative">
                    <button id="sortButton" class="filter-btn" on:click={toggleSortOptions}>
                        Sort {#if currentSortCriteria !== 'dueDate' || currentSortOrder !== 'asc'}*{/if}
                    </button>
                    {#if showSortOptions}
                        <div id="sortOptionsDropdown" class="dropdown-window !block" style="position: absolute; top: 100%; right: 0; background: white; border: 1px solid #ccc; padding: 10px; z-index: 1000; min-width: 180px; box-shadow: 0 2px 5px rgba(0,0,0,0.1);">
                            <p style="margin-bottom: 5px; font-weight: bold;">Sort by:</p>
                            <button class="sort-option-btn" on:click={() => applySort('priority')} class:active={currentSortCriteria === 'priority'}>
                                Priority {currentSortCriteria === 'priority' ? (currentSortOrder === 'asc' ? ' (Low-High)' : ' (High-Low)') : ''}
                            </button>
                            <button class="sort-option-btn" on:click={() => applySort('status')} class:active={currentSortCriteria === 'status'}>
                                Status {currentSortCriteria === 'status' ? (currentSortOrder === 'asc' ? ' (A-Z)' : ' (Z-A)') : ''}
                            </button>
                            <button class="sort-option-btn" on:click={() => applySort('dueDate')} class:active={currentSortCriteria === 'dueDate'}>
                                Due Date {currentSortCriteria === 'dueDate' ? (currentSortOrder === 'asc' ? ' (Old-New)' : ' (New-Old)') : ''}
                            </button>
                            <button class="sort-option-btn" on:click={() => applySort('title')} class:active={currentSortCriteria === 'title'}>
                                Title {currentSortCriteria === 'title' ? (currentSortOrder === 'asc' ? ' (A-Z)' : ' (Z-A)') : ''}
                            </button>
                            <hr style="margin: 8px 0;">
                            <button class="sort-option-btn" on:click={() => currentSortOrder = 'asc'} class:active={currentSortOrder === 'asc'}>Ascending</button>
                            <button class="sort-option-btn" on:click={() => currentSortOrder = 'desc'} class:active={currentSortOrder === 'desc'}>Descending</button>
                        </div>
                    {/if}
                </div>
                <button class="filter-btn" on:click={openFilterDateRangeModal}>
                    Filter {#if clientFilterFromDate || clientFilterToDate}*{/if}
                </button>
            </div>
        </div> 
        

        <!-- Messages and Task List Area -->
        {#if loadError}<div class="message error-message" role="alert"><strong>Error loading tasks:</strong> {loadError}</div>{/if}
        {#if pageActionError}<div class="message error-message" role="alert">{pageActionError}</div>{/if}
        {#if pageActionSuccessMessage && !batchDeleteSuccessMessage}
            <div class="message success-message" role="status">{pageActionSuccessMessage}</div>
        {/if}

        <div class="task-list-area">
            {#if batchDeleteSuccessMessage}
                <div class="message success-message" role="status" style="margin-top: 15px; margin-bottom: 15px;">{batchDeleteSuccessMessage}</div>
            {:else if selectedTaskIds.size > 0 && (tasksForSelectedDate.length > 0 || otherTasksToList.length > 0)}
                <div class="batch-actions-bar">
                    <span>{selectedTaskIds.size} task(s) selected</span>
                    <button type="button" class="batch-delete-btn" on:click={requestBatchDelete} disabled={isSubmitting}>Delete Selected</button>
                </div>
            {/if}

            <div class="todays-tasks-section">
                <h2 class="tasks-section-title">
                    {selectedDateDisplayTitle}
                    {#if searchQuery.trim() !== ''}<span style="font-weight: normal; font-size: 0.8em; color: #555;"> (Search: "{searchQuery.trim()}")</span>{/if}
                </h2>
                {#if tasksForSelectedDate.length > 0}
                    <div class="task-table-container">
                        <table class="task-table">
                            <thead><tr>
                                <th class="checkbox-column"></th><th class="task-details-column">TASK</th><th>CREATED</th><th>PRIORITY</th>
                                <th>DUE</th><th>STATUS</th><th class="actions-column">ACTIONS</th>
                            </tr></thead>
                            <tbody>
                            {#each tasksForSelectedDate as task (task.id)}
                                <tr class:selected={selectedTaskIds.has(task.id)}>
                                    <td class="checkbox-column"><input type="checkbox" class="task-checkbox" aria-label="Select task {task.title}" checked={selectedTaskIds.has(task.id)} on:change={() => toggleTaskSelection(task.id)}/></td>
                                    <td class="task-details-column"><div class="task-title">{task.title}</div>{#if task.description}<div class="task-description">{task.description}</div>{/if}</td>
                                    <td>{formatDateTimeDisplay(task.createdAtISO)}</td>
                                    <td>{@html formatPriorityDisplay(task.priority)}</td>
                                    <td>{formatDateTimeDisplay(task.dueDateISO, task.dueTime)}</td>
                                    <td><span class="status status-{task.status.replace(' ', '-')}">{task.status}</span></td>
                                    <td class="actions-column">
                                        <button type="button" class="action-btn toggle-complete-btn" aria-label={task.isCompleted ? 'Mark task as not complete' : 'Mark task as complete'} on:click={() => requestToggleComplete(task)} title={task.isCompleted ? 'Unmark as complete' : 'Mark as complete'} disabled={isToggleCompleting[task.id]}>
                                            {#if isToggleCompleting[task.id]}<svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                                            {:else if task.isCompleted}<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#4CAF50" stroke="#4CAF50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="completed-icon"><circle cx="12" cy="12" r="9"></circle></svg>
                                            {:else}<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="not-completed-icon"><circle cx="12" cy="12" r="9"></circle></svg>{/if}
                                        </button>
                                        <button type="button" class="action-btn edit-btn" aria-label="Edit task: {task.title}" on:click={() => openEditTaskModal(task)}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                                        <button type="button" class="action-btn delete-btn" aria-label="Delete task: {task.title}" on:click={() => requestSingleDelete(task)}><svg width="18" height="18" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
                                    </td>
                                </tr>
                            {/each}
                            </tbody>
                        </table>
                    </div> 
                {:else if tasksForSelectedDate.length === 0 && !loadError && !pageActionError && !batchDeleteSuccessMessage}
                    <div class="no-tasks-message" style="padding: 20px 15px; text-align: center;">
                        <p>{noTasksInViewMessage}</p>
                    </div>
                {/if}
            </div> 

            {#if otherTasksToList.length > 0}
                <div class="other-tasks-section">
                    <h2 class="tasks-section-title">
                        {shouldShowOtherTasksTitle ? 'Other Tasks' : 'Tasks'}
                        {#if searchQuery.trim() !== '' && !shouldShowOtherTasksTitle}<span style="font-weight: normal; font-size: 0.8em; color: #555;"> (Search: "{searchQuery.trim()}")</span>{/if}
                    </h2>
                     <div class="task-table-container"> <table class="task-table">
                            <thead><tr>
                                <th class="checkbox-column"></th><th class="task-details-column">TASK</th><th>CREATED</th><th>PRIORITY</th>
                                <th>DUE</th><th>STATUS</th><th class="actions-column">ACTIONS</th>
                            </tr></thead>
                            <tbody>
                            {#each otherTasksToList as task (task.id)}
                                <tr class:selected={selectedTaskIds.has(task.id)}>
                                    <td class="checkbox-column"><input type="checkbox" class="task-checkbox" aria-label="Select task {task.title}" checked={selectedTaskIds.has(task.id)} on:change={() => toggleTaskSelection(task.id)}/></td>
                                    <td class="task-details-column"><div class="task-title">{task.title}</div>{#if task.description}<div class="task-description">{task.description}</div>{/if}</td>
                                    <td>{formatDateTimeDisplay(task.createdAtISO)}</td>
                                    <td>{@html formatPriorityDisplay(task.priority)}</td>
                                    <td>{formatDateTimeDisplay(task.dueDateISO, task.dueTime)}</td>
                                    <td><span class="status status-{task.status.replace(' ', '-')}">{task.status}</span></td>
                                    <td class="actions-column">
                                        <button type="button" class="action-btn toggle-complete-btn" aria-label={task.isCompleted ? 'Mark task as not complete' : 'Mark task as complete'} on:click={() => requestToggleComplete(task)} title={task.isCompleted ? 'Unmark as complete' : 'Mark as complete'} disabled={isToggleCompleting[task.id]}>
                                            {#if isToggleCompleting[task.id]}<svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                                            {:else if task.isCompleted}<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#4CAF50" stroke="#4CAF50" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="completed-icon"><circle cx="12" cy="12" r="9"></circle></svg>
                                            {:else}<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="not-completed-icon"><circle cx="12" cy="12" r="9"></circle></svg>{/if}
                                        </button>
                                        <button type="button" class="action-btn edit-btn" aria-label="Edit task: {task.title}" on:click={() => openEditTaskModal(task)}><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
                                        <button type="button" class="action-btn delete-btn" aria-label="Delete task: {task.title}" on:click={() => requestSingleDelete(task)}><svg width="18" height="18" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
                                    </td>
                                </tr>
                            {/each}
                            </tbody>
                        </table>
                    </div> 
                </div> 
            {/if}

            {#if tasksForSelectedDate.length === 0 && otherTasksToList.length === 0 && !clientFilterFromDate && !clientFilterToDate && viewingDateInput === null && !loadError && !pageActionError && !batchDeleteSuccessMessage}
                <div class="no-tasks-message">
                     <p>{noTasksInViewMessage}</p>
                </div>
            {/if}
        </div> 
    </main>
</div> <!-- THIS IS THE CORRECTED CLOSING DIV FOR .app-container -->

{#if showAddTaskModal}
<div class="modal-overlay" on:click|self={closeAddTaskModal} role="dialog" aria-modal="true" aria-labelledby="addTaskModalTitle">
    <div class="modal-content" style="max-width: 550px;">
        <div class="modal-header"><h2 id="addTaskModalTitle" class="modal-title">Add New Task</h2><button class="modal-close-btn" on:click={closeAddTaskModal} aria-label="Close" disabled={isSubmitting}>×</button></div>
        <form method="POST" action="?/addTask" use:enhance={handleModalFormSubmit} class="modal-form">
            <div class="form-group">
                <label for="newTaskTitle">Title <span class="required-asterisk">*</span></label>
                <input type="text" id="newTaskTitle" name="title" bind:value={newTaskTitle} required disabled={isSubmitting} />
            </div>
            <div class="form-group">
                <label for="newTaskDescription">Description</label>
                <textarea id="newTaskDescription" name="description" bind:value={newTaskDescription} disabled={isSubmitting}></textarea>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label for="newTaskDueDate">Due Date</label>
                    <input type="date" id="newTaskDueDate" name="dueDate" bind:value={newTaskDueDate} disabled={isSubmitting} />
                </div>
                <div class="form-group">
                    <label for="newTaskDueTime">Due Time</label>
                    <input type="time" id="newTaskDueTime" name="dueTime" bind:value={newTaskDueTime} disabled={isSubmitting} />
                </div>
            </div>
            <div class="form-group">
                <label for="newTaskPriority">Priority</label>
                <select id="newTaskPriority" name="priority" bind:value={newTaskPriority} disabled={isSubmitting}>
                    <option value="low">Low</option>
                    <option value="standard" selected>Standard</option>
                    <option value="high">High</option>
                </select>
            </div>
            {#if actionError}
                <div class="form-error-message" role="alert">{actionError}</div>
            {/if}
            <div class="modal-actions">
                <button type="button" class="modal-btn cancel-btn" on:click={closeAddTaskModal} disabled={isSubmitting}>Cancel</button>
                <button type="submit" class="modal-btn confirm-btn" disabled={isSubmitting}>
                    {#if isSubmitting}Adding...{:else}Add Task{/if}
                </button>
            </div>
        </form>
    </div>
</div>
{/if}

{#if showEditTaskModal && taskToEdit}
<div class="modal-overlay" on:click|self={closeEditTaskModal} role="dialog" aria-modal="true" aria-labelledby="editTaskModalTitle">
    <div class="modal-content" style="max-width: 550px;">
        <div class="modal-header"><h2 id="editTaskModalTitle" class="modal-title">Edit Task</h2><button class="modal-close-btn" on:click={closeEditTaskModal} aria-label="Close" disabled={isSubmitting}>×</button></div>
        <form method="POST" action="?/updateTask" use:enhance={handleModalFormSubmit} bind:this={editTaskFormEl} class="modal-form">
            <input type="hidden" name="taskId" value={editTaskId} />
            <div class="form-group">
                <label for="editTaskTitle">Title <span class="required-asterisk">*</span></label>
                <input type="text" id="editTaskTitle" name="title" bind:value={editTaskTitle} required disabled={isSubmitting} />
            </div>
            <div class="form-group">
                <label for="editTaskDescription">Description</label>
                <textarea id="editTaskDescription" name="description" bind:value={editTaskDescription} disabled={isSubmitting}></textarea>
            </div>
            <div class="form-grid">
                <div class="form-group">
                    <label for="editTaskDueDate">Due Date</label>
                    <input type="date" id="editTaskDueDate" name="dueDate" bind:value={editTaskDueDate} disabled={isSubmitting} />
                </div>
                <div class="form-group">
                    <label for="editTaskDueTime">Due Time</label>
                    <input type="time" id="editTaskDueTime" name="dueTime" bind:value={editTaskDueTime} disabled={isSubmitting} />
                </div>
            </div>
            <div class="form-group">
                <label for="editTaskPriority">Priority</label>
                <select id="editTaskPriority" name="priority" bind:value={editTaskPriority} disabled={isSubmitting}>
                    <option value="low">Low</option>
                    <option value="standard">Standard</option>
                    <option value="high">High</option>
                </select>
            </div>
            {#if actionError}
                <div class="form-error-message" role="alert">{actionError}</div>
            {/if}
            <div class="modal-actions">
                <button type="button" class="modal-btn cancel-btn" on:click={closeEditTaskModal} disabled={isSubmitting}>Cancel</button>
                <button type="submit" class="modal-btn confirm-btn" disabled={isSubmitting}>
                    {#if isSubmitting}Saving...{:else}Save Changes{/if}
                </button>
            </div>
        </form>
    </div>
</div>
{/if}

{#if showSortByDayModal}
    <div class="modal-overlay" on:click|self={closeSortByDayModalFunc} role="dialog" aria-modal="true" aria-labelledby="sortByDayModalTitle">
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <h2 id="sortByDayModalTitle" class="modal-title">View Tasks For Day</h2>
                <button class="modal-close-btn" on:click={closeSortByDayModalFunc} aria-label="Close">×</button>
            </div>
            <div class="modal-form">
                <div class="form-group">
                    <label for="sortDayInput">Select Date:</label>
                    <input type="date" id="sortDayInput" bind:value={selectedSortDay} />
                </div>
            </div>
            <div class="modal-actions">
                <button type="button" class="modal-btn cancel-btn" on:click={closeSortByDayModalFunc}>Cancel</button>
                <button type="button" class="modal-btn confirm-btn" on:click={applySortByDay}>View Day</button>
            </div>
        </div>
    </div>
{/if}

{#if showToggleCompleteConfirm && taskToConfirmToggleComplete}
    <div class="modal-overlay" on:click|self={cancelToggleCompleteConfirmation} role="dialog" aria-modal="true" aria-labelledby="toggleCompleteModalTitle">
        <div class="modal-content" style="max-width: 480px;">
            <div class="modal-header">
                <h2 id="toggleCompleteModalTitle" class="modal-title">Confirm Status Change</h2>
                <button class="modal-close-btn" on:click={cancelToggleCompleteConfirmation} aria-label="Close" disabled={isSubmitting}>×</button>
            </div>
            <p style="padding: 16px 24px;">
                Are you sure you want to mark the task "<strong>{taskToConfirmToggleComplete.title}</strong>" as
                <strong>{taskToConfirmToggleComplete.currentIsCompleted ? 'incomplete' : 'complete'}</strong>?
            </p>
            <div class="modal-actions modal-actions-centered">
                <button type="button" class="modal-btn cancel-btn" on:click={cancelToggleCompleteConfirmation} disabled={isSubmitting}>Cancel</button>
                <button type="button" class="modal-btn confirm-btn" on:click={confirmToggleTaskCompletion} disabled={isSubmitting || (taskToConfirmToggleComplete && isToggleCompleting[taskToConfirmToggleComplete.id])}>
                    {#if isSubmitting || (taskToConfirmToggleComplete && isToggleCompleting[taskToConfirmToggleComplete.id])}Updating...{:else}Confirm{/if}
                </button>
            </div>
        </div>
    </div>
{/if}

{#if showFilterDateRangeModal}
<div class="modal-overlay" on:click|self={closeFilterDateRangeModal} role="dialog" aria-modal="true" aria-labelledby="filterDateRangeModalTitle">
    <div class="modal-content" style="max-width: 500px;">
        <div class="modal-header">
            <h2 id="filterDateRangeModalTitle" class="modal-title">Filter by Date Range</h2>
            <button class="modal-close-btn" on:click={closeFilterDateRangeModal} aria-label="Close">×</button>
        </div>
        <div class="modal-form">
            <div class="form-grid">
                <div class="form-group">
                    <label for="filterFromDate">From Date:</label>
                    <input type="date" id="filterFromDate" bind:value={clientFilterFromDate} />
                </div>
                <div class="form-group">
                    <label for="filterToDate">To Date:</label>
                    <input type="date" id="filterToDate" bind:value={clientFilterToDate} />
                </div>
            </div>
        </div>
        <div class="modal-actions">
            <button type="button" class="modal-btn cancel-btn" on:click={clearDateRangeFilter}>Clear Filter</button>
            <button type="button" class="modal-btn confirm-btn" on:click={applyDateRangeFilter}>Apply Filter</button>
        </div>
    </div>
</div>
{/if}

{#if showSingleDeleteConfirm && taskToConfirmDelete}
    <div class="modal-overlay" on:click|self={cancelSingleDelete} role="dialog" aria-modal="true" aria-labelledby="singleDeleteModalTitle">
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header"><h2 id="singleDeleteModalTitle" class="modal-title">Confirm Deletion</h2><button class="modal-close-btn" on:click={cancelSingleDelete} aria-label="Close" disabled={isSubmitting}>×</button></div>
            <p style="padding: 16px 24px;">Are you sure you want to delete the task "<strong>{taskToConfirmDelete.title}</strong>"? This action cannot be undone.</p>
            <div class="modal-actions modal-actions-centered">
                <button type="button" class="modal-btn cancel-btn" on:click={cancelSingleDelete} disabled={isSubmitting}>Cancel</button>
                <button type="button" class="modal-btn confirm-delete-btn" on:click={confirmSingleDelete} disabled={isSubmitting}>
                    {#if isSubmitting}Deleting...{:else}Delete Task{/if}
                </button>
            </div>
        </div>
    </div>
{/if}

{#if showBatchDeleteConfirm}
    <div class="modal-overlay" on:click|self={cancelBatchDelete} role="dialog" aria-modal="true" aria-labelledby="batchDeleteModalTitle">
        <div class="modal-content" style="max-width: 450px;">
            <div class="modal-header"><h2 id="batchDeleteModalTitle" class="modal-title">Confirm Batch Deletion</h2><button class="modal-close-btn" on:click={cancelBatchDelete} aria-label="Close" disabled={isSubmitting}>×</button></div>
            <p style="padding: 16px 24px;">Are you sure you want to delete {selectedTaskIds.size} selected task(s)? This action cannot be undone.</p>
            <div class="modal-actions modal-actions-centered">
                <button type="button" class="modal-btn cancel-btn" on:click={cancelBatchDelete} disabled={isSubmitting}>Cancel</button>
                <button type="button" class="modal-btn confirm-delete-btn" on:click={confirmBatchDelete} disabled={isSubmitting}>
                    {#if isSubmitting}Deleting...{:else}Delete Selected ({selectedTaskIds.size}){/if}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- AI Assistant Panel -->
<CalendarAIPanel
    {isDarkMode}
    tasks={data.tasks}
    bind:isOpen={isAIPanelOpen}
    on:selectTask={(e) => {
      // Use task from event (self-fetched) or fall back to searching local data
      const task = e.detail.task || data.tasks?.find(t => t.id === e.detail.taskId);
      if (task) {
        // Open edit modal with this task
        editTaskId = task.id;
        editTaskTitle = task.title || '';
        editTaskDescription = task.description || '';
        editTaskDueDate = task.dueDateISO || task.dueDate || null;
        editTaskDueTime = task.dueTime || null;
        editTaskPriority = String(task.priority || 'standard');
        showEditTaskModal = true;
      }
    }}
/>

<style>
    :global(html), :global(body) {
      height: 100%;
      margin: 0;
      padding: 0;
      overflow: hidden; 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    :global(body.dark) {
        background-color: #111827; 
        color: #d1d5db; 
    }

    .app-container {
      display: flex;
      flex-direction: column;
      height: 100vh; 
      box-sizing: border-box;
    }



    #sidebar {
        z-index: 10000; 
    }

    .main-content {
      flex-grow: 1; 
      overflow-y: auto; 
      padding-top: 70px; 
      padding-left: 20px;
      padding-right: 20px;
      padding-bottom: 20px;
      box-sizing: border-box;
      width: 100%; 
      background-color: #f9fafb; 
    }
    :global(body.dark) .main-content {
        background-color: #111827; 
    }

    :root {
        --color-pending-bg: #fffbeb; 
        --color-pending-text: #b45309; 
        --color-pending-border: #fde68a; 
        
        --color-complete-bg: #f0fdf4; 
        --color-complete-text: #15803d; 
        --color-complete-border: #bbf7d0; 

        --color-incomplete-bg: #fef2f2; 
        --color-incomplete-text: #b91c1c; 
        --color-incomplete-border: #fecaca; 
        
        --color-late-bg: #fff7ed; 
        --color-late-text: #c2410c; 
        --color-late-border: #fed7aa; 
        
        --color-na-text: #4b5563; 
    }

 





 

    .page-title-header { 
        padding: 10px 15px 15px 15px; 
        border-bottom: 1px solid #e5e7eb; 
        margin-bottom: 20px;
    }
    .page-title-header h1 {
        font-size: 1.8em;
        font-weight: bold;
        color: #111827; 
        margin:0;
    }
    :global(body.dark) .page-title-header {
        border-bottom-color: #374151; 
    }
    :global(body.dark) .page-title-header h1 {
        color: #f3f4f6; 
    }

    .content-header.task-list-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 15px; background-color: #fff;
        border: 1px solid #e5e7eb; border-radius: 6px; 
        gap: 10px; flex-wrap: wrap; margin-bottom: 20px;
    }
     :global(body.dark) .content-header.task-list-header { background-color: #1f2937; border-color: #374151; } 

    .today-btn, .filter-btn {
        padding: 6px 15px; background-color: #e5e7eb; 
        border: none; border-radius: 6px; cursor: pointer;
        font-weight: 600; font-size: 0.9em; color: #1f2937; 
        flex-shrink: 0;
    }
    .today-btn:hover, .filter-btn:hover { background-color: #d1d5db; } 
     :global(body.dark) .today-btn, :global(body.dark) .filter-btn { background-color: #374151; color: #f3f4f6; } 
     :global(body.dark) .today-btn:hover, :global(body.dark) .filter-btn:hover { background-color: #4b5563; } 

    .search-bar {
        display: flex; align-items: center; background-color: #fff;
        border: 1px solid #d1d5db; border-radius: 20px; 
        padding: 5px 12px; flex-grow: 1; min-width: 150px;
    }
    .search-bar img { height: 16px; margin-right: 6px; opacity: 0.6; }
    .search-bar input { border: none; outline: none; padding: 3px 0; background: none; font-size: 0.9em; width: 100%; color: #111827; }
    .search-bar input::placeholder { color: #6b7280; } 
     :global(body.dark) .search-bar { background-color: #374151; border-color: #4b5563; } 
     :global(body.dark) .search-bar input { color: #e5e7eb; } 
     :global(body.dark) .search-bar input::placeholder { color: #9ca3af; } 
     :global(body.dark) .search-bar img { filter: invert(0.8); }

    .filter-buttons { display: flex; gap: 8px; flex-shrink: 0; }

    .task-list-area { overflow-x: visible; flex-grow: 1; display: flex; flex-direction: column; }

    .todays-tasks-section, .other-tasks-section {
        margin-bottom: 40px; border: 1px solid #e5e7eb; 
        border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        background-color: #fff; overflow: hidden;
    }
     :global(body.dark) .todays-tasks-section, :global(body.dark) .other-tasks-section {
        background-color: #1f2937; border-color: #374151; 
    }

    .tasks-section-title {
        font-size: 1.3em; font-weight: 600; color: #1f2937; 
        padding: 12px 15px; margin: 0;
        background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; 
    }
     :global(body.dark) .tasks-section-title { color: #e5e7eb; background-color: #374151; border-bottom-color: #4b5563; } 

    .todays-tasks-section .tasks-section-title { background-color: #eff6ff; color: #2563eb; border-color: #dbeafe; } 
     :global(body.dark) .todays-tasks-section .tasks-section-title { background-color: #1e3a8a; color: #93c5fd; border-color: #2563eb; } 

    .task-table-container { overflow-x: auto; }
    .task-table { width: 100%; border-collapse: collapse; font-size: 0.9em; }
    .task-table th, .task-table td { text-align: left; padding: 12px 15px; border-bottom: 1px solid #f3f4f6; vertical-align: middle; } 
     :global(body.dark) .task-table th, :global(body.dark) .task-table td { border-bottom-color: #374151;  }
    .task-table tbody tr:last-child td { border-bottom: none; }
    .task-table th.task-details-column, .task-table td.task-details-column { white-space: normal; min-width: 200px; max-width: 400px; vertical-align: top; padding-top: 10px; padding-bottom: 10px; }
    .task-table th:not(.task-details-column), .task-table td:not(.task-details-column):not(.checkbox-column):not(.actions-column) { white-space: nowrap; }
    .task-table th.checkbox-column, .task-table td.checkbox-column { width: 1%; padding-right: 5px; text-align: center; vertical-align: middle;}
    .task-table th.actions-column, .task-table td.actions-column { width: auto; text-align: right; padding-left: 5px; vertical-align: middle; white-space: nowrap; }
    .task-table th { font-weight: 600; color: #4b5563; font-size: 0.8em; text-transform: uppercase; letter-spacing: 0.5px; background-color: #f9fafb; position: sticky; top: 0; z-index: 10; } 
     :global(body.dark) .task-table th { color: #d1d5db; background-color: #374151; } 

    .task-table tbody tr:hover { background-color: #f9fafb; } 
    .task-table tbody tr.selected { background-color: #eff6ff; } 
     :global(body.dark) .task-table tbody tr:hover { background-color: #1f2937; } 
     :global(body.dark) .task-table tbody tr.selected { background-color: #1e3a8a; } 
    
     :global(body.dark) .task-table td { color: #d1d5db; } 
    .task-title { font-weight: 500; color: #111827; margin-bottom: 3px; display: block; } 
     :global(body.dark) .task-title { color: #f3f4f6; } 
    .task-description { font-size: 0.85em; color: #4b5563; line-height: 1.4; display: block; } 
     :global(body.dark) .task-description { color: #9ca3af; } 

    .status { display: inline-block; padding: 4px 10px; border-radius: 12px; font-size: 0.75em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid transparent; }
    .status-pending { background-color: var(--color-pending-bg); color: var(--color-pending-text); border-color: var(--color-pending-border);}
    .status-complete { background-color: var(--color-complete-bg); color: var(--color-complete-text); border-color: var(--color-complete-border);}
    .status-incomplete { background-color: var(--color-incomplete-bg); color: var(--color-incomplete-text); border-color: var(--color-incomplete-border);}
    .status-late { background-color: var(--color-late-bg); color: var(--color-late-text); border-color: var(--color-late-border); }
    
    :global(body.dark) .status-pending { background-color: #713f12; color: #fef3c7; border-color: #a16207;} 
    :global(body.dark) .status-complete { background-color: #065f46; color: #d1fae5; border-color: #047857;} 
    :global(body.dark) .status-incomplete { background-color: #991b1b; color: #fee2e2; border-color: #b91c1c;} 
    :global(body.dark) .status-late { background-color: #7c2d12; color: #ffedd5; border-color: #9a3412;} 

    :global(.priority-tag) { padding: 4px 10px; border-radius: 12px; font-size: 0.75em; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid transparent; display: inline-block; }
    :global(.priority-low) { background-color: var(--color-complete-bg); color: var(--color-complete-text); border-color: var(--color-complete-border); }
    :global(.priority-standard) { background-color: var(--color-pending-bg); color: var(--color-pending-text); border-color: var(--color-pending-border); }
    :global(.priority-high) { background-color: var(--color-incomplete-bg); color: var(--color-incomplete-text); border-color: var(--color-incomplete-border); }
    :global(.priority-na) { color: var(--color-na-text); }
    :global(body.dark .priority-low) { background-color: #065f46; color: #d1fae5; border-color: #047857;}
    :global(body.dark .priority-standard) { background-color: #713f12; color: #fef3c7; border-color: #a16207;}
    :global(body.dark .priority-high) { background-color: #991b1b; color: #fee2e2; border-color: #b91c1c;}
    :global(body.dark .priority-na) { color: #9ca3af; background-color: #374151; border-color: #4b5563; } 

    .no-tasks-message { text-align: center; padding: 30px 20px; color: #4b5563; font-size: 1em; margin-top: 20px; } 
     :global(body.dark) .no-tasks-message { color: #9ca3af; } 

    .action-btn { background: none; border: none; cursor: pointer; padding: 5px; line-height:0; display: inline-flex; align-items: center; justify-content: center; margin-left: 4px; border-radius: 4px; transition: background-color 0.15s ease;}
    .action-btn:hover { background-color: #e5e7eb; } 
     :global(body.dark) .action-btn:hover { background-color: #374151; } 
    .action-btn:disabled { opacity: 0.5; cursor: not-allowed; background-color: transparent !important; }
    .action-btn:first-child { margin-left: 0; }
    .edit-btn { color: #2563eb; } .edit-btn:hover { color: #1d4ed8; background-color: #e0e0e0;} 
     :global(body.dark) .edit-btn { color: #60a5fa; } :global(body.dark) .edit-btn:hover { color: #93c5fd; background-color: #374151;} 
    .delete-btn { color: #dc2626; } .delete-btn:hover { color: #b91c1c; background-color: #e0e0e0;} 
     :global(body.dark) .delete-btn { color: #f87171; } :global(body.dark) .delete-btn:hover { color: #ef4444; background-color: #374151;} 
    .action-btn svg { width:18px; height:18px; vertical-align: middle; }
    .toggle-complete-btn .completed-icon { color: #15803d; } 
    .toggle-complete-btn .not-completed-icon { color: #6b7280; } 
     :global(body.dark) .toggle-complete-btn .not-completed-icon { color: #9ca3af; } 
    .toggle-complete-btn:hover .not-completed-icon { color: #374151; } 
     :global(body.dark) .toggle-complete-btn:hover .not-completed-icon { color: #d1d5db; } 

    .message { padding: 12px 15px; margin-bottom: 20px; border-radius: 6px; font-size: 0.9em; border: 1px solid transparent; }
    .error-message { background-color: #fee2e2; border-color: #fca5a5; color: #b91c1c; } 
    .success-message { background-color: #f0fdf4; border-color: #bbf7d0; color: #15803d; } 
     :global(body.dark) .error-message { background-color: #7f1d1d; border-color: #b91c1c; color: #fecaca; } 
     :global(body.dark) .success-message { background-color: #065f46; border-color: #047857; color: #d1fae5; } 

    .batch-actions-bar { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background-color: #eff6ff; border: 1px solid #dbeafe; border-radius: 6px; margin: 15px 0; } 
    .batch-actions-bar span { font-size: 0.9em; color: #1e40af; } 
    .batch-delete-btn { padding: 6px 12px; background-color: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 0.85em; } .batch-delete-btn:hover { background-color: #b91c1c; } 
    .batch-delete-btn:disabled { background-color: #fca5a5; cursor: not-allowed;} 
     :global(body.dark) .batch-actions-bar { background-color: #1e3a8a; border-color: #1e40af; } 
     :global(body.dark) .batch-actions-bar span { color: #93c5fd; } 
     :global(body.dark) .batch-delete-btn { background-color: #b91c1c; } :global(body.dark) .batch-delete-btn:hover { background-color: #991b1b; } 
     :global(body.dark) .batch-delete-btn:disabled { background-color: #ef4444; opacity: 0.7; } 

    .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 2000; padding: 20px; }
    .modal-content { background-color: #fff; border-radius: 8px; box-shadow: 0 8px 16px rgba(0,0,0,0.2); width: 100%; display: flex; flex-direction: column; max-height: calc(100vh - 40px); }
     :global(body.dark) .modal-content { background-color: #1f2937; } 
    .modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;} 
     :global(body.dark) .modal-header { border-bottom-color: #374151; } 
    .modal-title { font-size: 1.25rem; font-weight: 600; color: #111827; margin: 0; } 
     :global(body.dark) .modal-title { color: #f3f4f6; } 
    .modal-close-btn { background: none; border: none; font-size: 1.75rem; line-height: 1; color: #6b7280; cursor: pointer; padding:0; } 
    .modal-close-btn:hover { color: #111827; } .modal-close-btn:disabled { color: #d1d5db; cursor: not-allowed;} 
     :global(body.dark) .modal-close-btn { color: #9ca3af; } 
     :global(body.dark) .modal-close-btn:hover { color: #d1d5db; } 
     :global(body.dark) .modal-close-btn:disabled { color: #4b5563; } 

    .modal-form { padding: 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; flex-grow: 1;}
    .form-group label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 6px; } 
     :global(body.dark) .form-group label { color: #d1d5db; } 
    .form-group input[type="text"],
    .form-group input[type="date"],
    .form-group input[type="time"],
    .form-group textarea,
    .form-group select {
        width: 100%; padding: 10px 12px; border: 1px solid #d1d5db; 
        border-radius: 6px; font-size: 0.95rem; transition: border-color 0.2s, box-shadow 0.2s;
        background-color: #fff; color: #111827; 
    }
     :global(body.dark) .form-group input[type="text"],
     :global(body.dark) .form-group input[type="date"],
     :global(body.dark) .form-group input[type="time"],
     :global(body.dark) .form-group textarea,
     :global(body.dark) .form-group select {
        background-color: #374151; color: #e5e7eb; border-color: #4b5563; 
    }
    .form-group input:focus, .form-group textarea:focus, .form-group select:focus {
        border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.2); outline:none;
    }
     :global(body.dark) .form-group input:focus,
     :global(body.dark) .form-group textarea:focus,
     :global(body.dark) .form-group select:focus {
        border-color: #60a5fa; box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.3);
    }

    .form-group input:disabled, .form-group textarea:disabled, .form-group select:disabled {
        background-color: #f3f4f6; color: #6b7280; cursor: not-allowed; 
    }
     :global(body.dark) .form-group input:disabled,
     :global(body.dark) .form-group textarea:disabled,
     :global(body.dark) .form-group select:disabled {
        background-color: #4b5563; color: #9ca3af; 
    }
    .form-group textarea { min-height: 80px; resize: vertical; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
    .required-asterisk { color: #ef4444; margin-left: 2px; } 
    .form-error-message { background-color: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; padding: 10px; border-radius: 6px; margin-bottom: 0px; margin-top: -8px; font-size: 0.875rem; } 
     :global(body.dark) .form-error-message { background-color: #7f1d1d; color: #fecaca; border-color: #b91c1c; } 

    .modal-actions { display: flex; justify-content: flex-end; gap: 12px; padding: 16px 24px; border-top: 1px solid #e5e7eb; background-color: #f9fafb; border-radius: 0 0 8px 8px; flex-shrink: 0;} 
     :global(body.dark) .modal-actions { background-color: #1f2937; border-top-color: #374151; } 
    .modal-actions-centered { justify-content: center; padding-top:20px; border-top:none; background:none;}
    .modal-content p { font-size: 1rem; color: #374151; margin-bottom: 8px; line-height: 1.6; } 
     :global(body.dark) .modal-content p { color: #d1d5db; } 

    .modal-btn { padding: 10px 20px; border-radius: 6px; font-size: 0.9rem; font-weight: 500; cursor: pointer; transition: background-color 0.2s, box-shadow 0.2s; border: 1px solid transparent;}
    .cancel-btn { background-color: #fff; color: #374151; border-color: #d1d5db; } .cancel-btn:hover { background-color: #f3f4f6; } 
     :global(body.dark) .cancel-btn { background-color: #374151; color: #e5e7eb; border-color: #4b5563; } 
     :global(body.dark) .cancel-btn:hover { background-color: #4b5563; } 
    .confirm-btn { background-color: #2563eb; color: white; } .confirm-btn:hover { background-color: #1d4ed8; }
     :global(body.dark) .confirm-btn { background-color: #2563eb; } :global(body.dark) .confirm-btn:hover { background-color: #1d4ed8; }
    .confirm-delete-btn { background-color: #dc2626; color: white; } .confirm-delete-btn:hover { background-color: #b91c1c; }
     :global(body.dark) .confirm-delete-btn { background-color: #dc2626; } :global(body.dark) .confirm-delete-btn:hover { background-color: #b91c1c; }

    .modal-btn:disabled { background-color: #9ca3af; cursor: not-allowed; border-color: #9ca3af; color: #e5e7eb; } 
     :global(body.dark) .modal-btn:disabled { background-color: #4b5563; border-color: #4b5563; color: #9ca3af; } 
    .confirm-btn:disabled { background-color: #93c5fd; color:white; } 
     :global(body.dark) .confirm-btn:disabled { background-color: #60a5fa; opacity: 0.7;} 
    .confirm-delete-btn:disabled { background-color: #fca5a5; color:white; } 
     :global(body.dark) .confirm-delete-btn:disabled { background-color: #f87171; opacity: 0.7;} 

    .task-checkbox:focus, input[type="checkbox"]:focus { outline: none; box-shadow: none; }
    .task-checkbox:focus-visible, input[type="checkbox"]:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; } 
     :global(body.dark) .task-checkbox:focus-visible, :global(body.dark) input[type="checkbox"]:focus-visible { outline-color: #60a5fa; } 

    .filter-buttons .relative { position: relative; display: inline-block; }
    .sort-option-btn {
        display: block; width: 100%; padding: 6px 10px; text-align: left;
        background: none; border: none; cursor: pointer; font-size: 0.9em; color: #1f2937; 
    }
    .sort-option-btn:hover { background-color: #f3f4f6; } 
    .sort-option-btn.active { font-weight: bold; background-color: #e5e7eb; color: #111827; } 
     :global(body.dark) .sort-option-btn { color: #d1d5db; } 
     :global(body.dark) .sort-option-btn:hover { background-color: #374151; } 
     :global(body.dark) .sort-option-btn.active { background-color: #4b5563; color: #fff; } 
     :global(body.dark) #sortOptionsDropdown { background: #1f2937 !important; border-color: #374151 !important; } 

    .animate-spin { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    
    :global(nav a img), :global(nav a svg) { transition: filter 0.15s ease-in-out, stroke 0.15s ease-in-out; }
    :global(nav a.bg-blue-600 img), :global(nav a.bg-blue-700 img) { filter: brightness(0) invert(1); }
    :global(nav a.bg-blue-600 svg), :global(nav a.bg-blue-700 svg) { stroke: white !important; fill: white !important; }
    :global(body.dark nav a:not(.bg-blue-700):not(.text-white) img) { filter: invert(0.8); }
    :global(body.dark nav a:not(.bg-blue-700):not(.text-white) svg) { stroke: #d1d5db; fill: #d1d5db; }
    :global(body:not(.dark) nav a:not(.bg-blue-600):not(.text-white) img) { filter: none; }
    :global(body:not(.dark) nav a:not(.bg-blue-600):not(.text-white) svg) { stroke: #374151; fill: #374151; }

    .font-sans { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; } 

    /* Custom Scrollbar Styles */
    .main-content::-webkit-scrollbar { width: 8px; height: 8px; }
    .main-content::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
    :global(body.dark) .main-content::-webkit-scrollbar-track { background: #2d3748; }
    .main-content::-webkit-scrollbar-thumb { background: #c5c5c5; border-radius: 4px; }
    :global(body.dark) .main-content::-webkit-scrollbar-thumb { background: #4a5568; }
    .main-content::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
    :global(body.dark) .main-content::-webkit-scrollbar-thumb:hover { background: #718096; }

    .main-content { scrollbar-width: thin; scrollbar-color: #c5c5c5 #f1f1f1; }
    :global(body.dark) .main-content { scrollbar-color: #4a5568 #2d3748; }

</style>
