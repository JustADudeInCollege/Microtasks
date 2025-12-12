<script lang="ts">
    import { onMount, onDestroy, tick } from "svelte";
    import { page } from "$app/stores";
    import { browser } from "$app/environment";
    import { fly } from "svelte/transition";
    import { quintOut } from "svelte/easing";
    import { enhance } from "$app/forms";
    import type { SubmitFunction, ActionResult } from "@sveltejs/kit";
    import { goto, invalidateAll } from "$app/navigation";
    import TaskDetailModal from "$lib/components/TaskDetailModal.svelte";
    import LoadingIndicator from "$lib/components/LoadingIndicator.svelte";
    import AppHeader from "$lib/components/AppHeader.svelte";
    import ShareModal from "$lib/components/ShareModal.svelte";
    import MemberList from "$lib/components/MemberList.svelte";
    import DatePicker from "$lib/components/DatePicker.svelte";
    import TaskFormModal from "$lib/components/TaskFormModal.svelte";
    import type { TaskForFrontend } from "$lib/types/task";
    import type {
        WorkspaceMemberForFrontend,
        MemberRole,
        TaskAssignment,
    } from "$lib/types/collaboration";

    export let data: import("./$types").PageData;

    let isLoadingOperation = false; // New state for loading indicator
    let isPageReady = false; // Page-level loading state - wait until all data is loaded
    let kanbanScrollContainer: HTMLElement; // Declare variable for scroll container
    let handleTaskDeletedListener: ((e: Event) => void) | null = null;

    // --- SORT STATE ---
    let sortBy: "dueDate" | "priority" = "dueDate";

    // --- COLLABORATION STATE ---
    let isShareModalOpen = false;
    let workspaceMembers: WorkspaceMemberForFrontend[] = [];
    let taskAssignmentsMap: Record<string, TaskAssignment[]> = {}; // Object of taskId -> assignments (better Svelte reactivity)
    $: userRole = (data.currentWorkspace?.userRole || "viewer") as MemberRole;
    $: isCollaborative = data.currentWorkspace?.isCollaborative ?? false;
    $: workspaceName = data.currentWorkspace?.name || "Workspace";
    $: workspaceId = data.selectedBoardId || "";

    // Debug: log assignments map changes
    $: console.log(
        "[Board Page] taskAssignmentsMap updated:",
        Object.keys(taskAssignmentsMap).length,
        "tasks with assignments",
    );

    // Force reactivity: create a reactive key that changes when assignments change
    $: assignmentsVersion =
        Object.keys(taskAssignmentsMap).length +
        JSON.stringify(Object.keys(taskAssignmentsMap));

    // Debug: log the userRole
    $: console.log(
        "[Board Page] currentWorkspace:",
        data.currentWorkspace,
        "userRole:",
        userRole,
    );

    async function loadWorkspaceMembers() {
        if (!workspaceId) {
            console.log("[loadWorkspaceMembers] No workspaceId, skipping");
            return;
        }
        try {
            console.log(
                "[loadWorkspaceMembers] Fetching members for workspace:",
                workspaceId,
            );
            const res = await fetch(
                `/api/workspace/members?workspaceId=${workspaceId}`,
            );
            if (res.ok) {
                const data = await res.json();
                workspaceMembers = data.members;
                console.log(
                    "[loadWorkspaceMembers] Got members:",
                    workspaceMembers,
                );
            } else {
                console.error(
                    "[loadWorkspaceMembers] Response not ok:",
                    res.status,
                );
            }
        } catch (err) {
            console.error("Failed to load workspace members:", err);
        }
    }

    async function loadAllTaskAssignments() {
        if (!workspaceId) {
            console.log("[loadAllTaskAssignments] No workspaceId, skipping");
            return;
        }
        try {
            console.log(
                "[loadAllTaskAssignments] Fetching assignments for workspace:",
                workspaceId,
            );
            const res = await fetch(
                `/api/workspace/assignments?workspaceId=${workspaceId}`,
            );
            if (res.ok) {
                const data = await res.json();
                console.log(
                    "[loadAllTaskAssignments] Got assignments:",
                    data.assignments,
                );
                // Build object of taskId -> assignments (using object for better Svelte reactivity)
                const newMap: Record<string, TaskAssignment[]> = {};
                for (const assignment of data.assignments || []) {
                    if (!newMap[assignment.taskId]) {
                        newMap[assignment.taskId] = [];
                    }
                    newMap[assignment.taskId].push(assignment);
                }
                taskAssignmentsMap = newMap; // Reassign to trigger reactivity
                console.log(
                    "[loadAllTaskAssignments] Built map with",
                    Object.keys(newMap).length,
                    "tasks having assignments",
                );
            } else {
                console.error(
                    "[loadAllTaskAssignments] Response not ok:",
                    res.status,
                );
            }
        } catch (err) {
            console.error("Failed to load task assignments:", err);
        }
    }

    function getTaskAssignees(taskId: string): TaskAssignment[] {
        const assignees = taskAssignmentsMap[taskId] || [];
        if (assignees.length > 0) {
            console.log(
                "[getTaskAssignees] Task",
                taskId,
                "has",
                assignees.length,
                "assignees",
            );
        }
        return assignees;
    }

    function handleAvatarImageError(event: Event) {
        const img = event.currentTarget as HTMLImageElement;
        img.style.display = "none";
        const nextEl = img.nextElementSibling as HTMLElement | null;
        if (nextEl) nextEl.classList.remove("hidden");
    }

    function openShareModal() {
        isShareModalOpen = true;
    }

    // --- KANBAN INTERFACES ---
    interface PlaceholderTask {
        id: string;
        title: string;
        description: string;
        isCompleted: boolean;
        status: "pending" | "complete" | "incomplete" | "late";
        priority: string | number | null;
        createdAtISO: string | null;
        dueDateISO: string | null;
        dueTime: string | null;
        boardId: string;
        color?: string;
    }
    interface PlaceholderColumn {
        id: string; // dueDateISO ('YYYY-MM-DD') or NO_DUE_DATE_COLUMN_ID
        title: string; // User-friendly date string (e.g., "Today", "No Due Date")
        tasks: PlaceholderTask[];
    }
    export const NO_DUE_DATE_COLUMN_ID = "___NO_DUE_DATE___";
    // --- END KANBAN INTERFACES ---

    // --- LOCALSTORAGE STATE ---
    interface KanbanLayoutStorage {
        columnOrder: string[]; // Array of dateKeys (dueDateISO or NO_DUE_DATE_COLUMN_ID) - less critical if always date-sorted
        taskOrders: Record<string, string[]>; // Key is dateKey, value is array of taskIds
    }
    export let savedLayout: KanbanLayoutStorage | null = null;
    export const KANBAN_STORAGE_KEY = "kanbanBoardLayout_v2_date_based"; // Changed key to avoid conflicts

    // --- HEADER/SIDEBAR UI STATE ---
    export let isSidebarOpen = false;
    export let isDarkMode = false;
    export let usernameForDisplay: string;
    export let currentDateTime = "";
    export let handleGlobalClickListener: ((event: MouseEvent) => void) | null =
        null;
    export let handleEscKeyListener: ((event: KeyboardEvent) => void) | null =
        null;
    // --- END Header/Sidebar UI State ---

    // --- KANBAN CARD DRAG & DROP STATE (COLUMN DRAG STATE IS REMOVED) ---
    export let draggedCardItem: {
        task: PlaceholderTask;
        fromColumnId: string;
    } | null = null; // fromColumnId is the original dateKey
    export let currentCardDragOverInfo: {
        columnId: string;
        overTaskId?: string;
        position?: "before" | "after";
    } | null = null; // columnId is the target dateKey
    export let activeDraggedCardElement: HTMLElement | null = null;
    export let cardDragOffsetX = 0,
        cardDragOffsetY = 0;
    export let currentCardX = 0,
        currentCardY = 0,
        targetCardX = 0,
        targetCardY = 0;
    export let cardVelocityX = 0,
        cardVelocityY = 0;
    export let cardAnimationFrameId: number | null = null;
    export let isDraggingCard = false; // Track if user is actually dragging
    let mouseDownX = 0;
    let mouseDownY = 0;
    let mouseMovedDuringDrag = false;
    let clickStartTime = 0;

    export const POS_SPRING_STIFFNESS = 0.09;
    export const POS_DAMPING_FACTOR = 0.7;
    export let DUMMY_DRAG_IMAGE: HTMLImageElement;
    // --- END KANBAN CARD DRAG & DROP STATE ---

    // --- MODAL STATE ---
    export let isConfirmationModalOpen = false;
    export let confirmationModalMessage = "";
    export let resolveConfirmationPromise:
        | ((confirmed: boolean) => void)
        | null = null;

    export let isTaskDetailModalOpen = false;
    export let selectedTaskForModal: PlaceholderTask | null = null;

    export let isAddTaskModalOpen = false;
    export let addTaskTargetColumnId: string | null = null;
    export let addTaskFormError: string | null = null;
    export let addTaskFormSubmitting = false;

    // Form field values for Add Task Modal
    export let newTaskTitle = "";
    export let newTaskDueDate = "";
    export let newTaskDueTime = "";
    export let newTaskDescription = "";
    export let newTaskPriority = "standard"; // Default priority

    export let boardColumns: PlaceholderColumn[] = [];
    export let allTasksFlatList: PlaceholderTask[] = []; // Keep a flat list for easier lookup

    export const PHILIPPINES_TIMEZONE_OFFSET_HOURS_CLIENT = 8; // Assuming this is still relevant for date calculations

    export async function showCustomConfirm(message: string): Promise<boolean> {
        return new Promise((resolve) => {
            confirmationModalMessage = message;
            isConfirmationModalOpen = true;
            resolveConfirmationPromise = resolve; // Store the resolve function
        });
    }

    function handleModalConfirm() {
        if (resolveConfirmationPromise) {
            resolveConfirmationPromise(true);
        }
        closeModal();
    }

    function handleModalCancel() {
        if (resolveConfirmationPromise) {
            resolveConfirmationPromise(false);
        }
        closeModal();
    }

    function closeModal() {
        isConfirmationModalOpen = false;
        confirmationModalMessage = "";
        resolveConfirmationPromise = null;
    }

    function openTaskDetailModal(task: PlaceholderTask) {
        const timeSinceDragStart = Date.now() - clickStartTime;
        // Only block if user actually moved the mouse during drag AND it was recent
        if (
            isDraggingCard &&
            mouseMovedDuringDrag &&
            timeSinceDragStart < 300
        ) {
            console.log("Click blocked - user was dragging and moved mouse");
            return;
        }
        console.log("Opening task detail modal for:", task.title);
        // Find the full task details from allTasksFlatList if PlaceholderTask is different
        const fullTask = allTasksFlatList.find((t) => t.id === task.id);
        if (fullTask) {
            selectedTaskForModal = fullTask;
            isTaskDetailModalOpen = true;
        } else {
            console.error("Full task details not found for modal display.");
        }
    }

    function openAddTaskModal(columnId: string) {
        addTaskTargetColumnId = columnId;
        // Reset form fields
        newTaskTitle = "";
        // Pre-fill with current date (YYYY-MM-DD format)
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        const day = String(now.getDate()).padStart(2, "0");
        newTaskDueDate = `${year}-${month}-${day}`;
        // Pre-fill with current time rounded to nearest 30 min (HH:MM format)
        let hours = now.getHours();
        let minutes = now.getMinutes() < 30 ? 30 : 0;
        if (minutes === 0) hours = (hours + 1) % 24;
        newTaskDueTime = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        newTaskDescription = "";
        newTaskPriority = "standard"; // Default priority
        addTaskFormError = null;
        isAddTaskModalOpen = true;
    }

    function closeAddTaskModal() {
        isAddTaskModalOpen = false;
        addTaskTargetColumnId = null;
        addTaskFormError = null;
        addTaskFormSubmitting = false;
    }

    const handleAddTaskEnhance: SubmitFunction = ({
        formData,
        action,
        cancel,
    }) => {
        addTaskFormSubmitting = true;
        addTaskFormError = null;
        isLoadingOperation = true; // Start loading for add task

        // Client-side validation (can be more extensive)
        const title = formData.get("title");
        const dueDate = formData.get("dueDate");
        // const dueTime = formData.get('dueTime'); // Example: if you make dueTime optional on client too

        // Example: simplified client validation for title and dueDate
        if (!title || !dueDate) {
            let missingFields = [];
            if (!title) missingFields.push("Task Name");
            if (!dueDate) missingFields.push("Due Date");
            // if (!dueTime) missingFields.push("Due Time"); // If dueTime were also required client-side

            addTaskFormError = `${missingFields.join(" and ")} ${missingFields.length > 1 ? "are" : "is"} required.`;
            addTaskFormSubmitting = false;
            isLoadingOperation = false; // End loading on client-side validation failure
            cancel(); // Prevent SvelteKit form submission
            return;
        }

        // --- MODIFICATION START ---
        // Add boardId based on the current page context (data.selectedBoardId from server)
        const currentBoardContextId = data.selectedBoardId;

        if (currentBoardContextId) {
            formData.append("boardId", currentBoardContextId);
        }
        // If currentBoardContextId is null (e.g., viewing /kanban "All Tasks" page),
        // we don't append 'boardId'. The server-side 'addTask' action
        // will then default it to 'unassigned_tasks_board' or a similar default.
        // This means we don't need an error or to cancel submission if no specific board is "open".
        // --- MODIFICATION END ---

        return async ({
            result,
            update,
        }: {
            result: ActionResult;
            update: () => Promise<void>;
        }) => {
            addTaskFormSubmitting = false;
            isLoadingOperation = false; // End loading after server response

            if (result.type === "failure") {
                if (result.data?.taskForm?.error) {
                    addTaskFormError = result.data.taskForm.error;
                } else {
                    addTaskFormError = "An unknown error occurred.";
                }
            } else if (result.type === "success") {
                closeAddTaskModal();
                await invalidateAll(); // Refresh tasks
            }
            // It's generally good practice to call update regardless of success/failure
            // if the form state might have changed or if you want to ensure load re-runs.
            // However, invalidateAll() usually handles re-running load for success.
            // If using progressive enhancement, update() applies the result to the page.
            await update();
        };
    };

    function getPreciseDueDateInTimezoneAsUTC_Client(
        dateString: string | null | undefined,
        timeString: string | null | undefined,
        targetTimezoneOffsetHours: number,
    ): Date | null {
        if (!dateString || !/\d{4}-\d{2}-\d{2}/.test(dateString)) return null;
        try {
            const [year, month, day] = dateString.split("-").map(Number);
            let h = 23,
                m = 59,
                s = 59,
                ms = 999;
            if (timeString && /\d{2}:\d{2}/.test(timeString)) {
                const parsedTime = timeString.split(":").map(Number);
                if (!isNaN(parsedTime[0]) && !isNaN(parsedTime[1])) {
                    h = parsedTime[0];
                    m = parsedTime[1];
                    s = 0;
                    ms = 0;
                }
            }
            return new Date(
                Date.UTC(
                    year,
                    month - 1,
                    day,
                    h - targetTimezoneOffsetHours,
                    m,
                    s,
                    ms,
                ),
            );
        } catch (e) {
            return null;
        }
    }

    function recalculateTaskStatusClientSide(task: {
        isCompleted?: boolean; // Make optional as it might not be present in workspace tasks initially
        dueDateISO?: string | null;
        dueTime?: string | null;
    }): TaskForFrontend["status"] {
        const now = new Date();
        const preciseDueDateDeadlineUTC =
            getPreciseDueDateInTimezoneAsUTC_Client(
                task.dueDateISO ?? null,
                task.dueTime ?? null,
                PHILIPPINES_TIMEZONE_OFFSET_HOURS_CLIENT,
            );

        // If isCompleted is explicitly true, it's complete. Otherwise, check due date.
        if (task.isCompleted) {
            return preciseDueDateDeadlineUTC &&
                now.getTime() > preciseDueDateDeadlineUTC.getTime()
                ? "late"
                : "complete";
        } else {
            return preciseDueDateDeadlineUTC &&
                now.getTime() > preciseDueDateDeadlineUTC.getTime()
                ? "incomplete"
                : "pending";
        }
    }

    function mapRawTaskToPlaceholder(
        rawTask: (typeof data.tasks)[0],
    ): PlaceholderTask {
        const mappedTask: PlaceholderTask = {
            id: rawTask.id,
            title: rawTask.title,
            description: rawTask.description || "", // Ensure description is always a string
            priority: mapPriorityToKanban(rawTask.priority),
            dueDateISO: rawTask.dueDateISO, // This is 'YYYY-MM-DD' or null
            dueTime: rawTask.dueTime,
            boardId: rawTask.boardId, // Underlying board/project ID
            createdAtISO: rawTask.createdAtISO || null, // Map createdAtISO, default to null
            isCompleted: rawTask.isCompleted ?? false, // Default to false if not present
            status: "pending", // Default status, will be recalculated
        };
        // Recalculate status based on the task's properties
        mappedTask.status = recalculateTaskStatusClientSide(mappedTask);
        return mappedTask;
    }

    function formatDateForColumnTitle(dateKey: string): string {
        if (dateKey === NO_DUE_DATE_COLUMN_ID) {
            return "No Due Date";
        }
        try {
            const [year, month, day] = dateKey.split("-").map(Number);
            const columnDate = new Date(year, month - 1, day);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            if (columnDate.getTime() === today.getTime()) return "Today";
            if (columnDate.getTime() === tomorrow.getTime()) return "Tomorrow";

            return columnDate.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
            });
        } catch (e) {
            console.warn("Error formatting date for column title:", dateKey, e);
            return dateKey;
        }
    }

    // Get current user's ID from workspace members
    $: currentUserId =
        workspaceMembers.find((m) => m.isCurrentUser)?.userId || "";

    // Priority order: urgent > high > standard > low
    const priorityOrder: Record<string, number> = {
        urgent: 0,
        high: 1,
        standard: 2,
        low: 3,
    };

    function sortTasksByAssignmentAndPriority(
        tasks: PlaceholderTask[],
    ): PlaceholderTask[] {
        return [...tasks].sort((a, b) => {
            // Check if tasks are assigned to current user
            const aAssignedToMe =
                currentUserId &&
                taskAssignmentsMap[a.id]?.some(
                    (assign) => assign.userId === currentUserId,
                );
            const bAssignedToMe =
                currentUserId &&
                taskAssignmentsMap[b.id]?.some(
                    (assign) => assign.userId === currentUserId,
                );

            // Assigned to me first
            if (aAssignedToMe && !bAssignedToMe) return -1;
            if (!aAssignedToMe && bAssignedToMe) return 1;

            // Then sort by priority
            const aPriority =
                priorityOrder[String(a.priority).toLowerCase()] ??
                priorityOrder["standard"];
            const bPriority =
                priorityOrder[String(b.priority).toLowerCase()] ??
                priorityOrder["standard"];
            return aPriority - bPriority;
        });
    }

    $: {
        // Dependencies: data.tasks, taskAssignmentsMap, currentUserId (for sorting)
        const _deps = [data.tasks, taskAssignmentsMap, currentUserId];
        console.log("Value of data.user:", data.user); // Added for debugging
        usernameForDisplay = data.user?.name || "User";

        if (data.tasks) {
            // Populate allTasksFlatList so modal can find tasks
            allTasksFlatList = (data.tasks || []).map(mapRawTaskToPlaceholder);

            const tasksByDateGroup = new Map<string, PlaceholderTask[]>();

            allTasksFlatList.forEach((task) => {
                const dateKey = task.dueDateISO || NO_DUE_DATE_COLUMN_ID;

                if (!tasksByDateGroup.has(dateKey)) {
                    tasksByDateGroup.set(dateKey, []);
                }
                const groupTasks = tasksByDateGroup.get(dateKey)!;
                if (!groupTasks.some((t) => t.id === task.id)) {
                    groupTasks.push(task);
                }
            });

            let tempBoardColumns = Array.from(tasksByDateGroup.entries()).map(
                ([dateKey, tasks]) => ({
                    id: dateKey,
                    title: formatDateForColumnTitle(dateKey),
                    tasks: sortTasksByAssignmentAndPriority(tasks),
                }),
            );

            tempBoardColumns.sort((a, b) => {
                if (a.id === NO_DUE_DATE_COLUMN_ID) return -1;
                if (b.id === NO_DUE_DATE_COLUMN_ID) return 1;
                return a.id.localeCompare(b.id);
            });

            // Note: savedLayout reordering is now secondary to the assignment/priority sort
            // If you want manual drag order to override, you can remove the sort above
            // For now, assignment+priority sorting takes precedence

            boardColumns = tempBoardColumns;
        } else {
            boardColumns = [];
        }
    }

    // Reactive sorted columns - re-computes when sortBy or boardColumns change
    $: sortedBoardColumns = boardColumns.map((col) => ({
        ...col,
        tasks: getWorkspaceSortedTasks(col.tasks, sortBy),
    }));

    // Helper function for sorting based on sortBy dropdown
    function getWorkspaceSortedTasks(
        tasks: PlaceholderTask[],
        currentSortBy: "dueDate" | "priority",
    ): PlaceholderTask[] {
        return [...tasks].sort((a, b) => {
            if (currentSortBy === "priority") {
                const priorityDiff =
                    getPriorityValue(b.priority) - getPriorityValue(a.priority);
                if (priorityDiff !== 0) return priorityDiff;
                if (a.dueDateISO && b.dueDateISO) {
                    return (
                        new Date(a.dueDateISO).getTime() -
                        new Date(b.dueDateISO).getTime()
                    );
                }
                return a.dueDateISO ? -1 : 1;
            } else {
                if (a.dueDateISO && b.dueDateISO) {
                    return (
                        new Date(a.dueDateISO).getTime() -
                        new Date(b.dueDateISO).getTime()
                    );
                }
                if (a.dueDateISO) return -1;
                if (b.dueDateISO) return 1;
                return (
                    getPriorityValue(b.priority) - getPriorityValue(a.priority)
                );
            }
        });
    }

    function mapPriorityToKanban(
        priority: string | number | null,
    ): PlaceholderTask["priority"] {
        if (typeof priority === "string") {
            const lowerPriority = priority.toLowerCase();
            if (
                lowerPriority === "urgent" ||
                lowerPriority === "high" ||
                lowerPriority === "low"
            ) {
                return lowerPriority as "urgent" | "high" | "low";
            }
            return "standard";
        }
        return "standard";
    }

    function loadBoardStateFromLocalStorage() {
        if (!browser) return;
        const storedLayout = localStorage.getItem(KANBAN_STORAGE_KEY);
        if (storedLayout) {
            try {
                savedLayout = JSON.parse(storedLayout);
            } catch (e) {
                console.error("Failed to parse saved kanban layout:", e);
                localStorage.removeItem(KANBAN_STORAGE_KEY);
                savedLayout = null;
            }
        } else {
            savedLayout = null;
        }
    }

    function saveBoardStateToLocalStorage() {
        if (!browser || !boardColumns) return;
        const layoutToSave: KanbanLayoutStorage = {
            columnOrder: boardColumns.map((col) => col.id),
            taskOrders: boardColumns.reduce(
                (acc, col) => {
                    acc[col.id] = col.tasks.map((task) => task.id);
                    return acc;
                },
                {} as Record<string, string[]>,
            ),
        };
        localStorage.setItem(KANBAN_STORAGE_KEY, JSON.stringify(layoutToSave));
    }

    // Helper to convert priority to numeric value for sorting
    function getPriorityValue(priority: string | null): number {
        switch (priority?.toLowerCase()) {
            case "urgent":
                return 4;
            case "high":
                return 3;
            case "standard":
                return 2;
            case "low":
                return 1;
            default:
                return 0;
        }
    }

    // Sort tasks based on current sort mode
    function sortTasks(tasks: PlaceholderTask[]): PlaceholderTask[] {
        return [...tasks].sort((a, b) => {
            if (sortBy === "priority") {
                // Sort by priority (highest first)
                const priorityDiff =
                    getPriorityValue(b.priority) - getPriorityValue(a.priority);
                if (priorityDiff !== 0) return priorityDiff;
                // Then by due date as secondary sort
                if (a.dueDateISO && b.dueDateISO) {
                    return (
                        new Date(a.dueDateISO).getTime() -
                        new Date(b.dueDateISO).getTime()
                    );
                }
                return a.dueDateISO ? -1 : 1;
            } else {
                // Sort by due date (earliest first)
                if (a.dueDateISO && b.dueDateISO) {
                    return (
                        new Date(a.dueDateISO).getTime() -
                        new Date(b.dueDateISO).getTime()
                    );
                }
                if (a.dueDateISO) return -1;
                if (b.dueDateISO) return 1;
                // Then by priority as secondary sort
                return (
                    getPriorityValue(b.priority) - getPriorityValue(a.priority)
                );
            }
        });
    }

    // Standard UI Functions (toggleSidebar, DarkMode, Dropdowns, etc.)
    function toggleSidebar() {
        isSidebarOpen = !isSidebarOpen;
    }
    function closeSidebar() {
        isSidebarOpen = false;
    }
    function toggleDarkMode() {
        isDarkMode = !isDarkMode;
        if (browser) {
            document.documentElement.classList.toggle("dark", isDarkMode);
            document.body.classList.toggle("dark", isDarkMode);
            localStorage.setItem("theme", isDarkMode ? "dark" : "light");
        }
    }

    function handleLogout() {
        if (browser) {
            if (!confirm("Are you sure you want to log out?")) {
                return;
            }
            localStorage.removeItem("microtask_username");
            document.cookie =
                "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
            goto("/login");
        }
    }

    onMount(() => {
        loadBoardStateFromLocalStorage();

        // Load workspace members and task assignments before showing the page
        Promise.all([loadWorkspaceMembers(), loadAllTaskAssignments()]).then(
            () => {
                // Mark page as ready after initial data load
                isPageReady = true;
            },
        );

        DUMMY_DRAG_IMAGE = new Image();
        DUMMY_DRAG_IMAGE.src =
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

        const storedDarkMode = localStorage.getItem("theme");
        if (
            storedDarkMode === "dark" ||
            (!storedDarkMode &&
                window.matchMedia &&
                window.matchMedia("(prefers-color-scheme: dark)").matches)
        ) {
            isDarkMode = true;
            if (browser) document.body.classList.add("dark");
        } else {
            isDarkMode = false;
            if (browser) document.body.classList.remove("dark");
        }

        handleGlobalClickListener = (event: MouseEvent) => {
            const target = event.target as Node | null;
            const sidebarEl = document.getElementById("sidebar");
            const hamburgerButton = document.getElementById("hamburgerButton");
            if (
                isSidebarOpen &&
                sidebarEl &&
                !sidebarEl.contains(target) &&
                hamburgerButton &&
                !hamburgerButton.contains(target)
            )
                closeSidebar();
        };
        if (browser)
            document.addEventListener("click", handleGlobalClickListener);

        // Global listener for task deletions happening elsewhere in the app
        handleTaskDeletedListener = (evt: Event) => {
            try {
                console.log(
                    "[Board Page] Received global task-deleted event, performing full reload...",
                );
                if (typeof window !== "undefined" && window.location) {
                    window.location.reload();
                }
            } catch (err) {
                console.error(
                    "[Board Page] Error handling task-deleted event (reload):",
                    err,
                );
            }
        };
        if (typeof window !== "undefined")
            window.addEventListener(
                "microtask:task-deleted",
                handleTaskDeletedListener as EventListener,
            );

        handleEscKeyListener = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (isConfirmationModalOpen) {
                    handleModalCancel();
                } else if (isAddTaskModalOpen) {
                    closeAddTaskModal();
                } else if (isTaskDetailModalOpen) {
                    isTaskDetailModalOpen = false;
                } else if (isSidebarOpen) {
                    closeSidebar();
                }
            }
        };
        if (browser) document.addEventListener("keydown", handleEscKeyListener);

        return () => {
            if (browser) {
                if (handleGlobalClickListener)
                    document.removeEventListener(
                        "click",
                        handleGlobalClickListener,
                    );
                if (handleEscKeyListener)
                    document.removeEventListener(
                        "keydown",
                        handleEscKeyListener,
                    );
                if (handleTaskDeletedListener)
                    window.removeEventListener(
                        "microtask:task-deleted",
                        handleTaskDeletedListener as EventListener,
                    );
            }
            if (cardAnimationFrameId)
                cancelAnimationFrame(cardAnimationFrameId);
        };
    });

    function handleCardDragStart(
        event: DragEvent,
        task: PlaceholderTask,
        fromDateKey: string,
    ) {
        if (event.dataTransfer && DUMMY_DRAG_IMAGE) {
            mouseDownX = event.clientX;
            mouseDownY = event.clientY;
            mouseMovedDuringDrag = false;
            clickStartTime = Date.now();
            isDraggingCard = true; // Mark that dragging started
            event.dataTransfer.setData("text/task-id", task.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setDragImage(DUMMY_DRAG_IMAGE, 0, 0);
            draggedCardItem = { task, fromColumnId: fromDateKey };
            activeDraggedCardElement = event.target as HTMLElement;
            const rect = activeDraggedCardElement.getBoundingClientRect();
            cardDragOffsetX = event.clientX - rect.left;
            cardDragOffsetY = event.clientY - rect.top;
            currentCardX = rect.left;
            currentCardY = rect.top;
            targetCardX = rect.left;
            targetCardY = rect.top;
            cardVelocityX = 0;
            cardVelocityY = 0;
            activeDraggedCardElement.style.position = "fixed";
            activeDraggedCardElement.style.left = `${currentCardX}px`;
            activeDraggedCardElement.style.top = `${currentCardY}px`;
            activeDraggedCardElement.style.width = `${rect.width}px`;
            activeDraggedCardElement.style.height = `${rect.height}px`;
            activeDraggedCardElement.style.zIndex = "1001";
            activeDraggedCardElement.style.margin = "0";
            setTimeout(() => {
                activeDraggedCardElement?.classList.add("dragging-card");
            }, 0);
            if (cardAnimationFrameId)
                cancelAnimationFrame(cardAnimationFrameId);
            cardAnimationFrameId = requestAnimationFrame(updateCardPosition);
        }
    }
    function handleCardDragMove(event: DragEvent) {
        if (!activeDraggedCardElement || !draggedCardItem) return;
        if (
            event.clientX === 0 &&
            event.clientY === 0 &&
            event.screenX === 0 &&
            event.screenY === 0
        )
            return;
        // Check if mouse moved significantly (more than 5px)
        if (
            Math.abs(event.clientX - mouseDownX) > 5 ||
            Math.abs(event.clientY - mouseDownY) > 5
        ) {
            mouseMovedDuringDrag = true;
        }
        targetCardX = event.clientX - cardDragOffsetX;
        targetCardY = event.clientY - cardDragOffsetY;
    }
    function updateCardPosition() {
        if (!activeDraggedCardElement || !draggedCardItem) {
            if (cardAnimationFrameId)
                cancelAnimationFrame(cardAnimationFrameId);
            cardAnimationFrameId = null;
            return;
        }
        let forceX = (targetCardX - currentCardX) * POS_SPRING_STIFFNESS;
        let forceY = (targetCardY - currentCardY) * POS_SPRING_STIFFNESS;
        cardVelocityX += forceX;
        cardVelocityY += forceY;
        cardVelocityX *= POS_DAMPING_FACTOR;
        cardVelocityY *= POS_DAMPING_FACTOR;
        currentCardX += cardVelocityX;
        currentCardY += cardVelocityY;
        if (
            Math.abs(cardVelocityX) < 0.1 &&
            Math.abs(cardVelocityY) < 0.1 &&
            Math.abs(targetCardX - currentCardX) < 0.1 &&
            Math.abs(targetCardY - currentCardY) < 0.1
        ) {
            currentCardX = targetCardX;
            currentCardY = targetCardY;
            cardVelocityX = 0;
            cardVelocityY = 0;
        }
        activeDraggedCardElement.style.left = `${currentCardX}px`;
        activeDraggedCardElement.style.top = `${currentCardY}px`;
        activeDraggedCardElement.style.transform = `rotate(2deg) scale(1.03)`;
        cardAnimationFrameId = requestAnimationFrame(updateCardPosition);
    }
    function handleCardDragOverItem(
        event: DragEvent,
        targetDateKey: string,
        overTaskId?: string,
    ) {
        event.preventDefault();
        event.stopPropagation();
        if (!draggedCardItem) return;
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        let position: "before" | "after" | undefined = undefined;
        if (
            overTaskId &&
            draggedCardItem &&
            overTaskId !== draggedCardItem.task.id
        ) {
            const targetCardElement = document.getElementById(
                `task-${overTaskId}`,
            );
            if (
                targetCardElement &&
                targetCardElement !== activeDraggedCardElement
            ) {
                const rect = targetCardElement.getBoundingClientRect();
                const midpointY = rect.top + rect.height / 2;
                position = event.clientY < midpointY ? "before" : "after";
            }
        }
        if (
            currentCardDragOverInfo?.columnId !== targetDateKey ||
            currentCardDragOverInfo?.overTaskId !== overTaskId ||
            currentCardDragOverInfo?.position !== position
        ) {
            currentCardDragOverInfo = {
                columnId: targetDateKey,
                overTaskId:
                    draggedCardItem && overTaskId === draggedCardItem.task.id
                        ? undefined
                        : overTaskId,
                position,
            };
        }
    }
    function handleCardDragLeaveItem(
        event: DragEvent,
        itemType: "column" | "card",
        itemId: string,
    ) {
        event.stopPropagation();
        if (!draggedCardItem) return;
        const relatedTarget = event.relatedTarget as Node | null;
        const currentTarget = event.currentTarget as HTMLElement;
        if (
            !relatedTarget ||
            !currentTarget.closest(".kanban-board")?.contains(relatedTarget)
        ) {
            currentCardDragOverInfo = null;
            return;
        }
        if (
            itemType === "card" &&
            currentCardDragOverInfo?.overTaskId === itemId
        ) {
            const columnElement = currentTarget.closest(".kanban-column");
            if (
                columnElement &&
                columnElement.contains(relatedTarget) &&
                !(relatedTarget as HTMLElement).closest(".kanban-card")
            ) {
                const columnDateKey =
                    columnElement.getAttribute("data-column-id");
                if (columnDateKey) {
                    currentCardDragOverInfo = { columnId: columnDateKey };
                }
            }
        }
    }
    async function handleDropOnCardOrColumn(
        event: DragEvent,
        targetDateKey: string,
        dropTargetTaskId?: string,
    ) {
        event.preventDefault();
        event.stopPropagation();

        if (!draggedCardItem) {
            cleanupCardDragState(); // Ensure cleanup if no dragged item
            return;
        }

        const { task: taskToMove, fromColumnId: originalDateKey } =
            draggedCardItem;

        // Check if dropped on itself or same position in the same column
        // (This condition might need refinement based on how you determine "same position")
        if (
            (dropTargetTaskId === taskToMove.id &&
                targetDateKey === originalDateKey) ||
            (targetDateKey === originalDateKey &&
                !dropTargetTaskId &&
                !currentCardDragOverInfo?.overTaskId &&
                !currentCardDragOverInfo?.position) // Dropped on empty part of same column
        ) {
            // If dropped on the same spot or on the same column without a specific target,
            // it's essentially a "cancel" of the drag from the user's perspective.
            // We still need to clean up the drag visuals.
            // The handleCardDragEnd will be called by the browser, which in turn calls cleanupCardDragState.
            // So, just returning here might be enough IF activeDraggedCardElement is correctly reset in handleCardDragEnd.
            // However, to be absolutely sure, especially if handleCardDragEnd isn't firing or
            // if other logic might prevent its full effect, explicitly call cleanup.

            // The browser's 'dragend' event should still fire on the source element,
            // which calls handleCardDragEnd(), which calls cleanupCardDragState().
            // So, simply returning here is usually sufficient if activeDraggedCardElement is handled correctly
            // in handleCardDragEnd.

            // If for some reason `handleCardDragEnd` isn't fully resetting the visual state
            // in this specific scenario, you might need to add:
            // resetDraggedCardVisuals(); // A hypothetical function to reset styles if handleCardDragEnd isn't enough
            // cleanupCardDragState(); // This would then be redundant if handleCardDragEnd is called.
            // For now, we rely on handleCardDragEnd to do its job.
            return;
        }

        // --- Start loading if it's a date change ---
        let wasDateChange = originalDateKey !== targetDateKey;
        if (wasDateChange) {
            isLoadingOperation = true;
        }
        // --- End loading logic ---

        const sourceCol = boardColumns.find(
            (col) => col.id === originalDateKey,
        );
        let taskIndexInSource = -1;
        if (sourceCol) {
            taskIndexInSource = sourceCol.tasks.findIndex(
                (t) => t.id === taskToMove.id,
            );
            if (taskIndexInSource > -1) {
                sourceCol.tasks.splice(taskIndexInSource, 1);
            }
        } else {
            console.warn(
                "Source column not found for optimistic update:",
                originalDateKey,
            );
            for (const col of boardColumns) {
                const idx = col.tasks.findIndex((t) => t.id === taskToMove.id);
                if (idx > -1) {
                    col.tasks.splice(idx, 1);
                    break;
                }
            }
        }

        const destCol = boardColumns.find((col) => col.id === targetDateKey);
        if (!destCol) {
            console.error(
                "Destination column not found for optimistic update:",
                targetDateKey,
            );
            if (sourceCol && taskIndexInSource > -1) {
                sourceCol.tasks.splice(taskIndexInSource, 0, taskToMove); // Put it back
            }
            if (wasDateChange) isLoadingOperation = false; // Reset loading if we bailed
            // cleanupCardDragState(); // `handleCardDragEnd` should cover this.
            return; // The drag operation effectively failed or was cancelled.
        }

        let inserted = false;
        if (
            dropTargetTaskId &&
            currentCardDragOverInfo?.position &&
            dropTargetTaskId !== taskToMove.id
        ) {
            const targetIndexInDest = destCol.tasks.findIndex(
                (t) => t.id === dropTargetTaskId,
            );
            if (targetIndexInDest > -1) {
                if (currentCardDragOverInfo.position === "before") {
                    destCol.tasks.splice(targetIndexInDest, 0, taskToMove);
                } else {
                    destCol.tasks.splice(targetIndexInDest + 1, 0, taskToMove);
                }
                inserted = true;
            }
        }
        if (!inserted) {
            destCol.tasks.push(taskToMove);
        }

        taskToMove.dueDateISO =
            targetDateKey === NO_DUE_DATE_COLUMN_ID ? null : targetDateKey;
        // Recalculate status based on new due date or if it was completed/uncompleted by column move
        taskToMove.status = recalculateTaskStatusClientSide(taskToMove);

        boardColumns = [...boardColumns];
        saveBoardStateToLocalStorage();

        if (wasDateChange) {
            // Only make server call if the date/column actually changed
            const formData = new FormData();
            formData.append("taskId", taskToMove.id);
            const newDueDateForServer =
                targetDateKey === NO_DUE_DATE_COLUMN_ID ? "" : targetDateKey;
            formData.append("newDueDateISO", newDueDateForServer);
            // Include due time if relevant
            if (targetDateKey !== NO_DUE_DATE_COLUMN_ID && taskToMove.dueTime) {
                formData.append("newDueTime", taskToMove.dueTime);
            } else if (targetDateKey === NO_DUE_DATE_COLUMN_ID) {
                formData.append("newDueTime", ""); // Clear time if no due date
            }

            try {
                const response = await fetch("?/updateTaskDueDate", {
                    method: "POST",
                    body: formData,
                });
                if (!response.ok) {
                    const result = await response.json().catch(() => ({
                        updateDueDateForm: {
                            error: "Failed to parse server error",
                        },
                    }));
                    console.error(
                        "Failed to update task due date on server:",
                        result.updateDueDateForm?.error ||
                            "Unknown server error",
                    );
                    // Consider reverting optimistic update here
                } else {
                    const result = await response.json();
                    if (!result.updateDueDateForm?.success) {
                        console.error(
                            "Server indicated failure for updateTaskDueDate:",
                            result.updateDueDateForm?.error,
                        );
                        // Consider reverting optimistic update here
                    }
                }
            } catch (err) {
                console.error("Error calling updateTaskDueDate action:", err);
                // Consider reverting optimistic update here
            } finally {
                isLoadingOperation = false; // End loading
            }
        }
        // cleanupCardDragState(); // `handleCardDragEnd` should cover this.
        // The drag operation is considered complete. handleCardDragEnd will be invoked.
    }
    function handleCardDragEnd() {
        if (cardAnimationFrameId) {
            cancelAnimationFrame(cardAnimationFrameId);
            cardAnimationFrameId = null;
        }
        if (activeDraggedCardElement) {
            activeDraggedCardElement.classList.remove("dragging-card");
            activeDraggedCardElement.style.position = "";
            activeDraggedCardElement.style.left = "";
            activeDraggedCardElement.style.top = "";
            activeDraggedCardElement.style.width = "";
            activeDraggedCardElement.style.height = "";
            activeDraggedCardElement.style.zIndex = "";
            activeDraggedCardElement.style.transform = "";
            activeDraggedCardElement.style.margin = "";
            activeDraggedCardElement.style.display = "none"; // Hide the element after drag ends
        }
        cleanupCardDragState(); // Call to reset other drag-related state variables
    }
    function cleanupCardDragState() {
        draggedCardItem = null;
        currentCardDragOverInfo = null;
        // Ensure display is reset if the element is reused, though it should be nullified
        if (activeDraggedCardElement) {
            activeDraggedCardElement.style.display = "";
        }
        activeDraggedCardElement = null;
        cardDragOffsetX = 0;
        cardDragOffsetY = 0;
        currentCardX = 0;
        currentCardY = 0;
        targetCardX = 0;
        targetCardY = 0;
        cardVelocityX = 0;
        cardVelocityY = 0;
        if (cardAnimationFrameId) cancelAnimationFrame(cardAnimationFrameId);
        cardAnimationFrameId = null;
        // Reset dragging flag after a short delay to allow click event to check it
        setTimeout(() => {
            isDraggingCard = false;
            mouseMovedDuringDrag = false;
        }, 150);
    }
</script>

<!-- HTML Structure -->
<!-- Loading overlay until all data is ready -->
{#if !isPageReady}
    <div class="page-loading-overlay">
        <LoadingIndicator />
    </div>
{/if}

<div class="page-wrapper font-sans" class:sidebar-open={isSidebarOpen}>
    {#if isLoadingOperation}
        <LoadingIndicator fullScreen={true} />
    {/if}

    {#if isSidebarOpen}
        <div
            id="sidebar"
            class={`fixed top-0 left-0 h-full w-64 shadow-lg z-50 flex flex-col justify-between p-4 border-r ${isDarkMode ? "bg-zinc-800 border-zinc-700" : "bg-white border-gray-200"}`}
            transition:fly={{ x: -300, duration: 300, easing: quintOut }}
        >
            <div>
                <div
                    class={`flex items-center justify-between mb-8 pb-4 border-b ${isDarkMode ? "border-zinc-700" : "border-gray-200"}`}
                >
                    <div class="flex items-center gap-2">
                        <img
                            src={isDarkMode
                                ? "/logonamindarkmode.png"
                                : "/logonamin.png"}
                            alt="Microtask Logo"
                            class="w-8 h-8"
                        />
                        <h1
                            class={`text-xl font-bold ${isDarkMode ? "text-zinc-100" : "text-gray-800"}`}
                        >
                            Microtask
                        </h1>
                    </div>
                    <button
                        on:click={closeSidebar}
                        class={`p-1 rounded-md transition-colors ${isDarkMode ? "hover:bg-zinc-700 text-zinc-400" : "hover:bg-gray-100 text-gray-500"}`}
                        aria-label="Close sidebar"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            class="w-5 h-5"
                            ><path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M6 18L18 6M6 6l12 12"
                            /></svg
                        >
                    </button>
                </div>
                <nav class="flex flex-col gap-2">
                    <a
                        href="/home"
                        class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
                        class:active={$page.url.pathname === "/home" ||
                            $page.url.pathname === "/"}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class="w-5 h-5"
                            aria-hidden="true"
                        >
                            <path
                                d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z"
                            />
                            <path
                                d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z"
                            />
                        </svg>
                        <span>Home</span>
                    </a>
                    <a
                        href="/dashboard"
                        class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
                        class:bg-blue-600={!isDarkMode &&
                            $page.url.pathname === "/dashboard"}
                        class:bg-blue-800={isDarkMode &&
                            $page.url.pathname === "/dashboard"}
                        class:text-white={$page.url.pathname === "/dashboard"}
                        class:text-gray-700={!isDarkMode &&
                            $page.url.pathname !== "/dashboard"}
                        class:text-zinc-300={isDarkMode &&
                            $page.url.pathname !== "/dashboard"}
                        class:hover:bg-gray-100={!isDarkMode}
                        class:hover:bg-zinc-700={isDarkMode}
                    >
                        <img
                            src={isDarkMode
                                ? "/dashboarddark.png"
                                : "/dashboard.png"}
                            alt="Dashboard"
                            class="w-5 h-5"
                            aria-hidden="true"
                        />
                        <span>Dashboard</span>
                    </a>
                    <a
                        href="/kanban"
                        class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
                        class:hover:bg-gray-100={!isDarkMode}
                        class:hover:bg-zinc-700={isDarkMode}
                        class:text-gray-700={!isDarkMode}
                        class:text-zinc-300={isDarkMode}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-5 h-5"
                            aria-hidden="true"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
                            />
                        </svg>
                        <span>All Tasks</span>
                    </a>
                    <a
                        href="/calendar"
                        class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
                        class:hover:bg-gray-100={!isDarkMode}
                        class:hover:bg-zinc-700={isDarkMode}
                        class:text-gray-700={!isDarkMode}
                        class:text-zinc-300={isDarkMode}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            class="w-5 h-5"
                            aria-hidden="true"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z"
                                clip-rule="evenodd"
                            /><path
                                d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"
                            /></svg
                        >
                        <span>Calendar</span>
                    </a>
                    <a
                        href="/workspace"
                        class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
                        class:active={$page.url.pathname.startsWith(
                            "/workspace",
                        )}
                    >
                        <img
                            src={isDarkMode
                                ? "/Workspacedark.png"
                                : "/workspacee.png"}
                            alt="Workspace"
                            class="w-5 h-5"
                            aria-hidden="true"
                        />
                        <span>Workspace</span>
                    </a>
                </nav>
            </div>
            <button
                on:click={handleLogout}
                class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold w-full mt-auto transition-colors duration-150"
                class:hover:bg-gray-100={!isDarkMode}
                class:hover:bg-zinc-700={isDarkMode}
                class:text-gray-700={!isDarkMode}
                class:text-zinc-300={isDarkMode}
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="w-5 h-5"
                    aria-hidden="true"
                    ><path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9"
                    /></svg
                >
                <span>Log out</span>
            </button>
        </div>
    {/if}

    <div class="main-content-wrapper">
        <AppHeader
            {isDarkMode}
            username={usernameForDisplay}
            {currentDateTime}
            on:toggleSidebar={toggleSidebar}
            on:toggleDarkMode={toggleDarkMode}
            on:logout={handleLogout}
        />

        <main class="main-content-kanban">
            <div class="board-header-kanban">
                <div class="board-header-left">
                    <h1 class="board-title-kanban">{workspaceName}</h1>
                    {#if isCollaborative}
                        <MemberList
                            members={workspaceMembers}
                            compact={true}
                            maxDisplay={3}
                        />
                    {/if}
                </div>
                <div class="board-header-actions">
                    <button
                        class="share-workspace-button"
                        on:click={openShareModal}
                        title="Share workspace"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <circle cx="18" cy="5" r="3"></circle>
                            <circle cx="6" cy="12" r="3"></circle>
                            <circle cx="18" cy="19" r="3"></circle>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"
                            ></line>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"
                            ></line>
                        </svg>
                        Share
                    </button>
                    <button
                        class="add-task-board-button"
                        on:click={() => openAddTaskModal(NO_DUE_DATE_COLUMN_ID)}
                    >
                        + Add a new task
                    </button>
                    <!-- Sort Dropdown -->
                    <div class="sort-controls">
                        <label for="sortByWS" class="sort-label">Sort by:</label
                        >
                        <select
                            id="sortByWS"
                            class="sort-select"
                            bind:value={sortBy}
                        >
                            <option value="dueDate">Due Date</option>
                            <option value="priority">Priority</option>
                        </select>
                    </div>
                </div>
            </div>
            <div
                class="kanban-board-scroll-container"
                bind:this={kanbanScrollContainer}
            >
                <div class="kanban-board">
                    {#if data.error}
                        <p class="p-4 text-red-600">
                            Error loading board: {data.error}
                        </p>
                    {:else if !boardColumns || boardColumns.length === 0}
                        <p class="p-4 text-gray-500">
                            No tasks found or tasks have no due dates to
                            display.
                        </p>
                    {/if}

                    {#each sortedBoardColumns as column (column.id)}
                        <div
                            class="kanban-column"
                            class:drag-over-column={currentCardDragOverInfo?.columnId ===
                                column.id &&
                                !currentCardDragOverInfo?.overTaskId &&
                                draggedCardItem}
                            data-column-id={column.id}
                            on:dragover={(e) => {
                                if (draggedCardItem)
                                    handleCardDragOverItem(e, column.id);
                                else e.preventDefault();
                            }}
                            on:dragleave={(e) => {
                                if (draggedCardItem)
                                    handleCardDragLeaveItem(
                                        e,
                                        "column",
                                        column.id,
                                    );
                            }}
                            on:drop={(e) => {
                                if (draggedCardItem)
                                    handleDropOnCardOrColumn(e, column.id);
                            }}
                        >
                            <div class="column-header">
                                <h3 class="column-title">{column.title}</h3>
                                <span class="column-task-count"
                                    >{column.tasks.length}</span
                                >
                            </div>
                            <div class="kanban-column-content">
                                {#if column.tasks.length === 0 && !draggedCardItem && !(currentCardDragOverInfo?.columnId === column.id && draggedCardItem)}
                                    <div
                                        class="empty-column-dropzone"
                                        on:dragover={(e) => {
                                            if (draggedCardItem)
                                                handleCardDragOverItem(
                                                    e,
                                                    column.id,
                                                );
                                            else e.preventDefault();
                                        }}
                                        on:drop={(e) => {
                                            if (draggedCardItem)
                                                handleDropOnCardOrColumn(
                                                    e,
                                                    column.id,
                                                );
                                        }}
                                    >
                                        Drop card here
                                    </div>
                                {/if}
                                {#each column.tasks as task (task.id)}
                                    <div
                                        class="kanban-card priority-{task.priority ||
                                            'standard'}"
                                        class:drag-over-card-before={currentCardDragOverInfo?.overTaskId ===
                                            task.id &&
                                            currentCardDragOverInfo?.position ===
                                                "before" &&
                                            activeDraggedCardElement?.id !==
                                                `task-${task.id}`}
                                        class:drag-over-card-after={currentCardDragOverInfo?.overTaskId ===
                                            task.id &&
                                            currentCardDragOverInfo?.position ===
                                                "after" &&
                                            activeDraggedCardElement?.id !==
                                                `task-${task.id}`}
                                        draggable="true"
                                        id="task-{task.id}"
                                        role="button"
                                        tabindex="0"
                                        on:dragstart={(e) =>
                                            handleCardDragStart(
                                                e,
                                                task,
                                                column.id,
                                            )}
                                        on:drag={handleCardDragMove}
                                        on:dragend={handleCardDragEnd}
                                        on:dragover={(e) =>
                                            handleCardDragOverItem(
                                                e,
                                                column.id,
                                                task.id,
                                            )}
                                        on:dragleave={(e) =>
                                            handleCardDragLeaveItem(
                                                e,
                                                "card",
                                                task.id,
                                            )}
                                        on:drop={(e) =>
                                            handleDropOnCardOrColumn(
                                                e,
                                                column.id,
                                                task.id,
                                            )}
                                        on:click|stopPropagation={() =>
                                            openTaskDetailModal(task)}
                                        on:keydown={(e) => {
                                            if (
                                                e.key === "Enter" ||
                                                e.key === " "
                                            ) {
                                                e.preventDefault();
                                                openTaskDetailModal(task);
                                            }
                                        }}
                                    >
                                        <div class="card-labels"></div>
                                        <h4 class="card-title">{task.title}</h4>
                                        {#if task.description}
                                            <p class="card-description-preview">
                                                {task.description.substring(
                                                    0,
                                                    70,
                                                )}{task.description.length > 70
                                                    ? "..."
                                                    : ""}
                                            </p>
                                        {/if}
                                        <div class="card-footer">
                                            <div class="card-meta-icons">
                                                {#if task.description}
                                                    <span
                                                        class="meta-icon"
                                                        title="Has description"
                                                        ><svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            viewBox="0 0 24 24"
                                                            fill="currentColor"
                                                            width="14"
                                                            height="14"
                                                            ><path
                                                                d="M3 18H21V16H3V18ZM3 13H21V11H3V13ZM3 8H21V6H3V8Z"
                                                            ></path></svg
                                                        ></span
                                                    >
                                                {/if}
                                                {#if task.dueDateISO && column.id !== NO_DUE_DATE_COLUMN_ID}
                                                    <span
                                                        class="meta-icon"
                                                        title="Due date: {task.dueDateISO}"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            viewBox="0 0 24 24"
                                                            fill="currentColor"
                                                            width="14"
                                                            height="14"
                                                            ><path
                                                                d="M17 3H19V5H17V3M17 7H19V9H17V7M5 3H7V5H5V3M5 7H7V9H5V7M16 1V3H8V1H6V3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3H18V1H16M19 19H5V10H19V19Z"
                                                            ></path></svg
                                                        >
                                                        <span
                                                            class="due-date-text"
                                                            >{new Date(
                                                                task.dueDateISO.replace(
                                                                    /-/g,
                                                                    "/",
                                                                ),
                                                            ).toLocaleDateString(
                                                                "en-US",
                                                                {
                                                                    month: "short",
                                                                    day: "numeric",
                                                                },
                                                            )}</span
                                                        >
                                                    </span>
                                                {/if}
                                                {#if task.dueTime && column.id !== NO_DUE_DATE_COLUMN_ID}
                                                    <span
                                                        class="meta-icon"
                                                        title="Due time: {task.dueTime}"
                                                    >
                                                        <svg
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            viewBox="0 0 24 24"
                                                            fill="currentColor"
                                                            width="14"
                                                            height="14"
                                                            ><path
                                                                d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8z"
                                                            ></path><path
                                                                d="M13 7h-2v5.414l3.293 3.293 1.414-1.414L13 11.586z"
                                                            ></path></svg
                                                        >
                                                        <span
                                                            class="due-date-text"
                                                            >{task.dueTime}</span
                                                        >
                                                    </span>
                                                {/if}
                                            </div>
                                            <!-- Assignee avatars (using assignmentsVersion for reactivity) -->
                                            {#key assignmentsVersion}
                                                {#if taskAssignmentsMap[task.id]?.length > 0}
                                                    <div class="card-assignees">
                                                        {#each taskAssignmentsMap[task.id].slice(0, 3) as assignee (assignee.id)}
                                                            {#if assignee.photoURL}
                                                                <img
                                                                    class="card-assignee-avatar"
                                                                    src={assignee.photoURL}
                                                                    alt={assignee.username}
                                                                    title={assignee.username}
                                                                    on:error={handleAvatarImageError}
                                                                />
                                                                <div
                                                                    class="card-assignee-avatar card-assignee-letter hidden"
                                                                    title={assignee.username}
                                                                >
                                                                    {assignee.username
                                                                        .charAt(
                                                                            0,
                                                                        )
                                                                        .toUpperCase()}
                                                                </div>
                                                            {:else}
                                                                <div
                                                                    class="card-assignee-avatar card-assignee-letter"
                                                                    title={assignee.username}
                                                                >
                                                                    {assignee.username
                                                                        .charAt(
                                                                            0,
                                                                        )
                                                                        .toUpperCase()}
                                                                </div>
                                                            {/if}
                                                        {/each}
                                                        {#if taskAssignmentsMap[task.id].length > 3}
                                                            <div
                                                                class="card-assignee-avatar card-assignee-more"
                                                                title="{taskAssignmentsMap[
                                                                    task.id
                                                                ].length -
                                                                    3} more"
                                                            >
                                                                +{taskAssignmentsMap[
                                                                    task.id
                                                                ].length - 3}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                {/if}
                                            {/key}
                                        </div>
                                    </div>
                                {/each}
                            </div>
                            <!-- Add card button fixed at bottom of column -->
                            <div class="add-card-button-wrapper">
                                <button
                                    class="add-card-button"
                                    on:click={() => openAddTaskModal(column.id)}
                                    >+ Add a card</button
                                >
                            </div>
                        </div>
                    {/each}
                </div>
            </div>
        </main>
    </div>
</div>

{#if isConfirmationModalOpen}
    <div class="modal-overlay" on:click={handleModalCancel}>
        <div class="modal-content" on:click|stopPropagation>
            <h3 class="modal-title">Confirm Action</h3>
            <p class="modal-message">{confirmationModalMessage}</p>
            <div class="modal-actions">
                <button
                    class="modal-button modal-button-cancel"
                    on:click={handleModalCancel}>Cancel</button
                >
                <button
                    class="modal-button modal-button-confirm"
                    on:click={handleModalConfirm}>Confirm</button
                >
            </div>
        </div>
    </div>
{/if}

<TaskDetailModal
    bind:isOpen={isTaskDetailModalOpen}
    task={selectedTaskForModal}
    {workspaceId}
    {workspaceMembers}
    {userRole}
    on:close={() => (isTaskDetailModalOpen = false)}
    on:assignmentsChanged={loadAllTaskAssignments}
    on:updated={async () => {
        isLoadingOperation = true; // Start loading for task update
        console.log("Task update action completed, refreshing data...");
        await invalidateAll(); // This will re-run the load function for the page
        isTaskDetailModalOpen = false; // Close modal after update
        isLoadingOperation = false; // End loading
    }}
    on:delete={async (event) => {
        isLoadingOperation = true; // Start loading for task delete
        const taskIdToDelete = event.detail.taskId;
        console.log("Attempting to delete task:", taskIdToDelete);
        const formData = new FormData();
        formData.append("taskId", taskIdToDelete);

        try {
            const response = await fetch("?/deleteTask", {
                method: "POST",
                body: formData,
            });
            const result = await response.json();

            // SvelteKit form action responses have data nested under 'data' property
            const formResult = result.data ?? result;

            if (formResult.deleteTaskForm?.successMessage) {
                console.log(formResult.deleteTaskForm.successMessage);
                await invalidateAll(); // Refresh list
            } else if (formResult.deleteTaskForm?.error) {
                alert(
                    `Error deleting task: ${formResult.deleteTaskForm.error}`,
                );
            } else {
                // If we got here but response was ok, it might have succeeded
                if (response.ok) {
                    await invalidateAll();
                } else {
                    alert("An unknown error occurred while deleting the task.");
                }
            }
        } catch (error) {
            console.error("Error deleting task:", error);
            alert("An error occurred while deleting the task.");
        } finally {
            isTaskDetailModalOpen = false; // Close modal after delete attempt
            isLoadingOperation = false; // End loading
        }
    }}
/>

<!-- Add Task Modal -->
<TaskFormModal
    isOpen={isAddTaskModalOpen}
    mode="add"
    {isDarkMode}
    {workspaceId}
    on:close={closeAddTaskModal}
    on:success={() => {
        closeAddTaskModal();
        invalidateAll();
    }}
/>

<!-- Share Modal for collaboration -->
<ShareModal
    bind:isOpen={isShareModalOpen}
    {workspaceId}
    {workspaceName}
    currentUserRole={userRole}
    on:close={() => {
        isShareModalOpen = false;
        loadWorkspaceMembers();
    }}
    on:memberRemoved={loadWorkspaceMembers}
/>

<style>
    /* --- SHARED STYLES --- */
    .font-sans {
        font-family:
            "Inter",
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            Roboto,
            Helvetica,
            Arial,
            sans-serif;
    }
    .page-loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(2px);
        z-index: 9999;
    }
    :global(body.dark) .page-loading-overlay {
        background-color: rgba(24, 24, 27, 0.85);
    }
    .page-wrapper {
        display: flex;
        min-height: 100vh;
        color: #1f2937;
        background-color: #ffffff;
    }
    canvas {
        display: block;
    }
    .hidden-dropdown {
        display: none !important;
    }
    .capitalize {
        text-transform: capitalize;
    }
    .sidebar-container {
        background-color: #ffffff;
        border-right: 1px solid #e5e7eb;
        color: #374151;
        position: fixed;
        top: 0;
        left: 0;
        height: 100%;
        width: 16rem;
        box-shadow:
            0 10px 15px -3px rgba(0, 0, 0, 0.1),
            0 4px 6px -2px rgba(0, 0, 0, 0.05);
        z-index: 50;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 1rem;
        box-sizing: border-box;
    }
    .sidebar-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 2rem;
        padding-bottom: 1rem;
        border-bottom: 1px solid #e5e7eb;
    }
    .sidebar-logo-img {
        width: 2rem;
        height: 2rem;
    }
    .sidebar-title {
        color: #1f2937;
        font-size: 1.25rem;
        font-weight: 700;
    }
    .sidebar-nav {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .nav-link {
        color: #374151;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        border-radius: 0.375rem;
        font-weight: 600;
        transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
        text-decoration: none;
    }
    .nav-link:hover {
        background-color: #f3f4f6;
    }
    .nav-link.active {
        background-color: #2563eb;
        color: #ffffff;
    }
    .nav-icon {
        width: 1.25rem;
        height: 1.25rem;
    }
    .nav-link.active .nav-icon {
        filter: brightness(0) invert(1);
    }
    .logout-button {
        color: #374151;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        border-radius: 0.375rem;
        font-weight: 600;
        width: 100%;
        margin-top: auto;
        transition: background-color 150ms ease;
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        font-family: inherit;
        font-size: inherit;
    }
    .logout-button:hover {
        background-color: #f3f4f6;
    }
    .logout-button .nav-icon {
        width: 1.25rem;
        height: 1.25rem;
    }

    .main-content-wrapper {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }
    .main-content-kanban {
        padding-top: 60px;
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-sizing: border-box;
        background-color: var(--bg-light);
        color: var(--text-light-primary);
    }
    .board-header-kanban {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 1rem;
        flex-shrink: 0;
        box-sizing: border-box;
    }
    .board-header-left {
        display: flex;
        align-items: center;
        gap: 1rem;
    }
    .board-header-actions {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .board-title-kanban {
        font-size: 1.25rem;
        font-weight: 700;
        color: inherit;
        margin: 0;
    }

    .share-workspace-button {
        display: flex;
        align-items: center;
        gap: 0.375rem;
        padding: 0.375rem 0.75rem;
        background-color: #3b82f6;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.15s;
    }
    .share-workspace-button:hover {
        background-color: #2563eb;
    }
    :global(body.dark) .share-workspace-button {
        background-color: #2563eb;
    }
    :global(body.dark) .share-workspace-button:hover {
        background-color: #1d4ed8;
    }
    :global(body.dark) .page-wrapper {
        color: #d1d5db;
        background-color: var(--bg-dark);
    }
    :global(body.dark) .sidebar-container {
        background-color: #1f2937;
        border-right-color: #374151;
        color: #d1d5db;
    }
    :global(body.dark) .sidebar-header {
        border-bottom-color: #374151;
    }
    :global(body.dark) .sidebar-title {
        color: #f3f4f6;
    }
    :global(body.dark) .nav-link {
        color: #d1d5db;
    }
    :global(body.dark) .nav-link:hover {
        background-color: #374151;
    }
    :global(body.dark) .nav-link.active {
        background-color: #1e40af;
    }
    :global(body.dark) .logout-button {
        color: #d1d5db;
    }
    :global(body.dark) .logout-button:hover {
        background-color: #374151;
    }

    :global(body.dark) .main-content-kanban {
        background-color: var(--bg-dark);
        color: var(--text-dark-primary);
    }

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
        transition:
            background-color 0.2s,
            box-shadow 0.2s;
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
    /* KANBAN BOARD SPECIFIC STYLES - MODERNIZED */
    :root {
        --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI",
            Roboto, Helvetica, Arial, sans-serif;
        --bg-light: #f8fafc;
        --bg-dark: #18181b;
        --text-light-primary: #1e293b;
        --text-light-secondary: #64748b;
        --text-dark-primary: #fafafa;
        --text-dark-secondary: #a1a1aa;
        --border-light: #e2e8f0;
        --border-dark: #3f3f46;
        --surface-light: #ffffff;
        --surface-dark: #27272a;
        --interactive-light: #6366f1;
        --interactive-dark: #818cf8;
        --interactive-hover-light: #f1f5f9;
        --interactive-hover-dark: #3f3f46;
        --priority-high-light: #ef4444;
        --priority-high-dark: #f87171;
        --priority-medium-light: #f59e0b;
        --priority-medium-dark: #fbbf24;
        --priority-low-light: #10b981;
        --priority-low-dark: #34d399;
        --priority-standard-light: #6366f1;
        --priority-standard-dark: #818cf8;
        --status-late-bg: #fef2f2;
        --status-late-text: #dc2626;
        --status-incomplete-bg: #fef3c7;
        --status-incomplete-text: #d97706;
    }
    :global(body.dark) {
        --status-late-bg: rgba(239, 68, 68, 0.15);
        --status-late-text: #fca5a5;
        --status-incomplete-bg: rgba(245, 158, 11, 0.15);
        --status-incomplete-text: #fde68a;
    }

    /* Sort Controls */
    .sort-controls {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: 12px;
    }
    .sort-label {
        font-size: 0.85rem;
        font-weight: 500;
        color: var(--text-light-secondary);
    }
    :global(body.dark) .sort-label {
        color: var(--text-dark-secondary);
    }
    .sort-select {
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid var(--border-light);
        background: var(--surface-light);
        color: var(--text-light-primary);
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        min-width: 140px;
    }
    .sort-select:hover {
        border-color: var(--interactive-light);
    }
    .sort-select:focus {
        outline: none;
        border-color: var(--interactive-light);
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
    }
    :global(body.dark) .sort-select {
        background: var(--surface-dark);
        border-color: var(--border-dark);
        color: var(--text-dark-primary);
    }
    :global(body.dark) .sort-select:hover {
        border-color: var(--interactive-dark);
    }
    :global(body.dark) .sort-select:focus {
        box-shadow: 0 0 0 3px rgba(129, 140, 248, 0.2);
    }

    .kanban-board-scroll-container {
        flex-grow: 1;
        overflow-x: auto;
        overflow-y: hidden;
        padding: 16px 20px;
        box-sizing: border-box;
        background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(0, 0, 0, 0.02) 100%
        );
    }
    :global(body.dark) .kanban-board-scroll-container {
        background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(0, 0, 0, 0.1) 100%
        );
    }

    .kanban-board {
        display: inline-flex;
        gap: 16px;
        padding-bottom: 16px;
        min-height: calc(100% - 10px);
        align-items: flex-start;
        box-sizing: border-box;
    }

    .kanban-column {
        background: rgba(255, 255, 255, 0.8);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 16px;
        width: 320px;
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        max-height: calc(100vh - 60px - 40px - 30px);
        padding: 0;
        box-sizing: border-box;
        box-shadow:
            0 4px 24px rgba(0, 0, 0, 0.06),
            0 1px 2px rgba(0, 0, 0, 0.04);
        position: relative;
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
    }
    .kanban-column:hover {
        box-shadow:
            0 8px 32px rgba(0, 0, 0, 0.08),
            0 2px 4px rgba(0, 0, 0, 0.04);
    }
    :global(body.dark) .kanban-column {
        background: rgba(39, 39, 42, 0.9);
        border-color: rgba(63, 63, 70, 0.6);
        box-shadow:
            0 4px 24px rgba(0, 0, 0, 0.25),
            0 1px 3px rgba(0, 0, 0, 0.15);
    }
    :global(body.dark) .kanban-column:hover {
        box-shadow:
            0 8px 40px rgba(0, 0, 0, 0.35),
            0 4px 8px rgba(0, 0, 0, 0.2);
    }

    .kanban-column.dragging-column {
        opacity: 0.85;
        box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.2),
            0 0 0 2px var(--interactive-light);
        pointer-events: none;
    }
    :global(body.dark) .kanban-column.dragging-column {
        box-shadow:
            0 20px 40px rgba(0, 0, 0, 0.5),
            0 0 0 2px var(--interactive-dark);
    }

    /* Visual indicators for column drop zones with smooth transition */
    .kanban-column::before,
    .kanban-column::after {
        content: "";
        position: absolute;
        top: 0;
        bottom: 0;
        width: 0;
        opacity: 0;
        background-color: var(--interactive-light);
        z-index: 5;
        border-radius: 3px;
        pointer-events: none;
        transition:
            width 0.2s ease-out,
            opacity 0.2s ease-out,
            background-color 0.15s ease;
    }
    :global(body.dark) .kanban-column::before,
    :global(body.dark) .kanban-column::after {
        background-color: var(--interactive-dark);
    }

    .kanban-column.drag-over-column-left::before {
        left: -3px;
        width: 6px;
        opacity: 1;
    }

    .kanban-column.drag-over-column-right::after {
        right: -3px;
        width: 6px;
        opacity: 1;
    }

    .column-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 16px 14px;
        box-sizing: border-box;
        border-bottom: 1px solid rgba(0, 0, 0, 0.06);
        position: relative;
    }
    .column-header::after {
        content: "";
        position: absolute;
        bottom: -1px;
        left: 16px;
        right: 16px;
        height: 2px;
        background: linear-gradient(
            90deg,
            var(--interactive-light),
            transparent
        );
        opacity: 0.4;
        border-radius: 2px;
    }
    :global(body.dark) .column-header {
        border-bottom-color: rgba(255, 255, 255, 0.06);
    }
    :global(body.dark) .column-header::after {
        background: linear-gradient(
            90deg,
            var(--interactive-dark),
            transparent
        );
        opacity: 0.3;
    }

    .column-title {
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--text-light-primary);
        margin: 0;
        flex-grow: 1;
        padding-right: 8px;
        letter-spacing: -0.01em;
    }
    :global(body.dark) .column-title {
        color: var(--text-dark-primary);
    }

    .column-task-count {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--interactive-light);
        margin-left: 8px;
        background: linear-gradient(
            135deg,
            rgba(99, 102, 241, 0.1),
            rgba(99, 102, 241, 0.05)
        );
        padding: 4px 10px;
        border-radius: 20px;
        border: 1px solid rgba(99, 102, 241, 0.2);
    }
    :global(body.dark) .column-task-count {
        color: var(--interactive-dark);
        background: linear-gradient(
            135deg,
            rgba(129, 140, 248, 0.15),
            rgba(129, 140, 248, 0.08)
        );
        border-color: rgba(129, 140, 248, 0.25);
    }

    .column-options-button {
        background: transparent;
        border: none;
        color: var(--text-light-secondary);
        padding: 6px;
        cursor: pointer;
        border-radius: 8px;
        line-height: 1;
        transition: all 0.15s ease;
    }
    .column-options-button:hover {
        background-color: rgba(0, 0, 0, 0.05);
        color: var(--text-light-primary);
    }
    :global(body.dark) .column-options-button {
        color: var(--text-dark-secondary);
    }
    :global(body.dark) .column-options-button:hover {
        background-color: rgba(255, 255, 255, 0.08);
        color: var(--text-dark-primary);
    }

    .kanban-column-content {
        overflow-y: auto;
        flex-grow: 1;
        padding: 12px;
        min-height: 30px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .empty-column-dropzone {
        flex-grow: 1;
        min-height: 80px;
        border: 2px dashed rgba(99, 102, 241, 0.3);
        border-radius: 12px;
        margin: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-light-secondary);
        font-size: 0.85rem;
        font-weight: 500;
        background: rgba(99, 102, 241, 0.02);
        transition: all 0.2s ease;
    }
    .empty-column-dropzone:hover {
        border-color: rgba(99, 102, 241, 0.5);
        background: rgba(99, 102, 241, 0.05);
    }
    :global(body.dark) .empty-column-dropzone {
        border-color: rgba(129, 140, 248, 0.25);
        color: var(--text-dark-secondary);
        background: rgba(129, 140, 248, 0.03);
    }
    :global(body.dark) .empty-column-dropzone:hover {
        border-color: rgba(129, 140, 248, 0.4);
        background: rgba(129, 140, 248, 0.08);
    }

    .kanban-column-content::-webkit-scrollbar {
        width: 6px;
    }
    .kanban-column-content::-webkit-scrollbar-thumb {
        background-color: rgba(0, 0, 0, 0.15);
        border-radius: 10px;
    }
    .kanban-column-content::-webkit-scrollbar-thumb:hover {
        background-color: rgba(0, 0, 0, 0.25);
    }
    .kanban-column-content::-webkit-scrollbar-track {
        background-color: transparent;
    }
    :global(body.dark) .kanban-column-content::-webkit-scrollbar-thumb {
        background-color: rgba(255, 255, 255, 0.15);
    }
    :global(body.dark) .kanban-column-content::-webkit-scrollbar-thumb:hover {
        background-color: rgba(255, 255, 255, 0.25);
    }

    .kanban-card {
        background-color: var(--surface-light);
        border-radius: 8px;
        box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.08),
            0 1px 2px rgba(0, 0, 0, 0.06);
        padding: 10px 12px;
        margin-bottom: 0;
        cursor: grab;
        word-wrap: break-word;
        font-size: 14px;
        color: var(--text-light-primary);
        position: relative;
        transition:
            transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
            box-shadow 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94),
            border-color 0.15s ease,
            background-color 0.15s ease,
            opacity 0.2s ease;
        box-sizing: border-box;
        border-top: 3px solid transparent;
        border-bottom: 3px solid transparent;
        border-left: 4px solid transparent;
        will-change: transform, box-shadow;
    }
    :global(body.dark) .kanban-card {
        background-color: var(--surface-dark);
        color: var(--text-dark-primary);
        box-shadow:
            0 1px 3px rgba(0, 0, 0, 0.25),
            0 1px 2px rgba(0, 0, 0, 0.2);
    }

    .kanban-card:hover:not(.dragging-card) {
        background-color: #f8fafc;
        cursor: pointer;
        transform: translateY(-1px);
        box-shadow:
            0 4px 8px rgba(0, 0, 0, 0.08),
            0 2px 4px rgba(0, 0, 0, 0.06);
    }
    :global(body.dark) .kanban-card:hover:not(.dragging-card) {
        background-color: #334155;
        box-shadow:
            0 4px 8px rgba(0, 0, 0, 0.3),
            0 2px 4px rgba(0, 0, 0, 0.25);
    }

    .kanban-card:active:not(.dragging-card) {
        cursor: grabbing;
        transform: scale(1.02);
        box-shadow:
            0 8px 20px rgba(0, 0, 0, 0.12),
            0 4px 8px rgba(0, 0, 0, 0.08);
    }
    :global(body.dark) .kanban-card:active:not(.dragging-card) {
        box-shadow:
            0 8px 20px rgba(0, 0, 0, 0.4),
            0 4px 8px rgba(0, 0, 0, 0.3);
    }

    .kanban-card.dragging-card {
        opacity: 0.9;
        transform: scale(1.03) rotate(2deg);
        box-shadow:
            0 16px 32px rgba(0, 0, 0, 0.15),
            0 8px 16px rgba(0, 0, 0, 0.1),
            0 0 0 2px var(--interactive-light);
        border-color: transparent !important;
        pointer-events: none;
        cursor: grabbing;
        z-index: 1000;
    }
    :global(body.dark) .kanban-card.dragging-card {
        box-shadow:
            0 16px 32px rgba(0, 0, 0, 0.45),
            0 8px 16px rgba(0, 0, 0, 0.35),
            0 0 0 2px var(--interactive-dark);
    }

    /* Enhanced drop zone indicators with animation */
    .kanban-card.drag-over-card-before {
        border-top-color: var(--interactive-light);
        border-top-width: 4px;
        transform: translateY(3px);
    }
    .kanban-card.drag-over-card-before::before {
        content: "";
        position: absolute;
        top: -6px;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(
            90deg,
            var(--interactive-light),
            transparent,
            var(--interactive-light)
        );
        border-radius: 2px;
        animation: pulseIndicator 1s ease-in-out infinite;
    }

    .kanban-card.drag-over-card-after {
        border-bottom-color: var(--interactive-light);
        border-bottom-width: 4px;
        transform: translateY(-3px);
    }
    .kanban-card.drag-over-card-after::after {
        content: "";
        position: absolute;
        bottom: -6px;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(
            90deg,
            var(--interactive-light),
            transparent,
            var(--interactive-light)
        );
        border-radius: 2px;
        animation: pulseIndicator 1s ease-in-out infinite;
    }

    :global(body.dark) .kanban-card.drag-over-card-before {
        border-top-color: var(--interactive-dark);
    }
    :global(body.dark) .kanban-card.drag-over-card-after {
        border-bottom-color: var(--interactive-dark);
    }
    :global(body.dark) .kanban-card.drag-over-card-before::before,
    :global(body.dark) .kanban-card.drag-over-card-after::after {
        background: linear-gradient(
            90deg,
            var(--interactive-dark),
            transparent,
            var(--interactive-dark)
        );
    }

    @keyframes pulseIndicator {
        0%,
        100% {
            opacity: 0.6;
            transform: scaleX(0.8);
        }
        50% {
            opacity: 1;
            transform: scaleX(1);
        }
    }

    .card-labels {
        display: flex;
        gap: 4px;
        margin-bottom: 4px;
        flex-wrap: wrap;
    }
    .card-labels span {
        font-size: 0.7em;
        padding: 2px 5px;
        border-radius: 3px;
        font-weight: 500;
    }
    .label-status-late {
        background-color: var(--status-late-bg);
        color: var(--status-late-text);
    }
    .label-status-incomplete {
        background-color: var(--status-incomplete-bg);
        color: var(--status-incomplete-text);
    }

    .card-title {
        margin: 0 0 6px 0;
        font-size: 0.9rem;
        font-weight: 500;
        line-height: 1.4;
        display: block;
    }
    .card-description-preview {
        font-size: 0.8rem;
        color: var(--text-light-secondary);
        margin-bottom: 8px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    :global(body.dark) .card-description-preview {
        color: var(--text-dark-secondary);
    }
    .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        min-height: 20px;
        margin-top: 4px;
    }
    .card-meta-icons {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--text-light-secondary);
    }
    :global(body.dark) .card-meta-icons {
        color: var(--text-dark-secondary);
    }
    .meta-icon {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 0.75em;
    }
    .due-date-text {
        font-size: 0.85em;
    }

    /* Card Assignee Avatars */
    .card-assignees {
        display: flex;
        align-items: center;
        margin-left: auto;
    }
    .card-assignee-avatar {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        border: 2px solid var(--surface-light);
        margin-left: -6px;
        object-fit: cover;
        font-size: 10px;
        font-weight: 600;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--interactive-light);
        color: white;
        flex-shrink: 0;
    }
    .card-assignee-avatar:first-child {
        margin-left: 0;
    }
    :global(body.dark) .card-assignee-avatar {
        border-color: var(--surface-dark);
        background-color: var(--interactive-dark);
    }
    .card-assignee-letter {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }
    :global(body.dark) .card-assignee-letter {
        background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
    }
    .card-assignee-more {
        background-color: #6b7280;
        font-size: 9px;
    }
    :global(body.dark) .card-assignee-more {
        background-color: #4b5563;
    }
    .hidden {
        display: none !important;
    }
    .priority-urgent {
        border-left: 4px solid #dc2626;
        background: linear-gradient(
            90deg,
            rgba(220, 38, 38, 0.08),
            transparent
        );
    }
    .priority-high {
        border-left: 4px solid var(--priority-high-light);
        background: linear-gradient(
            90deg,
            rgba(239, 68, 68, 0.03),
            transparent
        );
    }
    .priority-medium {
        border-left: 4px solid var(--priority-medium-light);
        background: linear-gradient(
            90deg,
            rgba(245, 158, 11, 0.03),
            transparent
        );
    }
    .priority-low {
        border-left: 4px solid var(--priority-low-light);
        background: linear-gradient(
            90deg,
            rgba(16, 185, 129, 0.03),
            transparent
        );
    }
    .priority-standard {
        border-left: 4px solid var(--priority-standard-light);
        background: linear-gradient(
            90deg,
            rgba(99, 102, 241, 0.02),
            transparent
        );
    }
    :global(body.dark) .priority-urgent {
        border-left-color: #ef4444;
        background: linear-gradient(90deg, rgba(239, 68, 68, 0.1), transparent);
    }
    :global(body.dark) .priority-high {
        border-left-color: var(--priority-high-dark);
        background: linear-gradient(
            90deg,
            rgba(248, 113, 113, 0.05),
            transparent
        );
    }
    :global(body.dark) .priority-medium {
        border-left-color: var(--priority-medium-dark);
        background: linear-gradient(
            90deg,
            rgba(251, 191, 36, 0.05),
            transparent
        );
    }
    :global(body.dark) .priority-low {
        border-left-color: var(--priority-low-dark);
        background: linear-gradient(
            90deg,
            rgba(52, 211, 153, 0.05),
            transparent
        );
    }
    :global(body.dark) .priority-standard {
        border-left-color: var(--border-dark);
        background: linear-gradient(
            90deg,
            rgba(129, 140, 248, 0.03),
            transparent
        );
    }

    .add-card-button-wrapper {
        padding: 8px 10px;
        border-top: 1px solid var(--border-light);
        background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0.9),
            var(--surface-light)
        );
        flex-shrink: 0;
        position: sticky;
        bottom: 0;
        z-index: 5;
    }
    :global(body.dark) .add-card-button-wrapper {
        border-top-color: var(--border-dark);
        background: linear-gradient(
            to bottom,
            rgba(31, 41, 55, 0.9),
            var(--surface-dark)
        );
    }
    .add-card-button {
        background-color: transparent;
        border: none;
        color: var(--text-light-secondary);
        padding: 8px 10px;
        border-radius: 4px;
        text-align: left;
        width: 100%;
        cursor: pointer;
        font-size: 0.85em;
        box-sizing: border-box;
        transition:
            background-color 0.15s ease,
            color 0.15s ease;
    }
    .add-card-button:hover {
        background-color: var(--interactive-hover-light);
        color: var(--interactive-light);
    }
    :global(body.dark) .add-card-button {
        color: var(--text-dark-secondary);
    }
    :global(body.dark) .add-card-button:hover {
        background-color: var(--interactive-hover-dark);
        color: var(--interactive-dark);
    }
    .p-4 {
        padding: 1rem;
    }
    .text-red-600 {
        color: #dc2626;
    }
    :global(body.dark) .text-red-600 {
        color: #f87171;
    }
    .text-gray-500 {
        color: #6b7280;
    }
    :global(body.dark) .text-gray-500 {
        color: #9ca3af;
    }
    /* --- ADD TASK MODAL STYLES --- */
    .add-task-modal-content {
        /* For specific sizing or layout if needed */
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
        transition:
            border-color 0.2s,
            box-shadow 0.2s;
    }
    :global(body.dark) .form-input,
    :global(body.dark) .form-textarea,
    :global(body.dark) .form-select {
        background-color: var(
            --bg-dark
        ); /* Slightly different from surface-dark for input fields */
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

    .add-task-board-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;

        padding: 0.5rem 1rem; /* Adjust for desired size (py-2 px-4 equivalent) */

        background-color: var(
            --light-accent-primary,
            #007bff
        ); /* Primary blue, fallback */
        color: var(--light-text-on-accent, #ffffff); /* White text */

        font-weight: 600; /* font-semibold */
        font-size: 0.875rem; /* text-sm or adjust as needed */

        border: 1px solid transparent;
        border-radius: var(--rounded-md, 0.375rem); /* Medium rounded corners */

        box-shadow: var(
            --shadow-sm,
            0 1px 2px rgba(0, 0, 0, 0.05)
        ); /* Subtle shadow */

        cursor: pointer;
        text-decoration: none;
        white-space: nowrap;

        transition:
            background-color 0.15s ease-in-out,
            border-color 0.15s ease-in-out,
            box-shadow 0.15s ease-in-out,
            transform 0.1s ease-in-out;
    }

    .add-task-board-button:hover:not(:disabled) {
        background-color: var(
            --light-accent-primary-hover,
            #0056b3
        ); /* Darker blue on hover */
        box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.1));
        transform: translateY(-1px);
    }

    .add-task-board-button:active:not(:disabled) {
        transform: translateY(0);
        box-shadow: var(--shadow-sm);
    }

    .add-task-board-button:focus {
        /* Keep :focus for keyboard users if :focus-visible is not fully supported */
        outline: none;
    }
    .add-task-board-button:focus-visible {
        outline: none;
        box-shadow:
            var(--shadow-sm),
            0 0 0 3px var(--light-border-focus, rgba(0, 123, 255, 0.3)); /* Focus ring */
    }

    .add-task-board-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
    }

    /* Dark Mode adjustments for the button */
    :global(body.dark) .add-task-board-button {
        background-color: var(--dark-accent-primary, #36a3ff);
        color: var(
            --dark-text-on-accent,
            #000000
        ); /* Adjust if dark primary needs dark text */
        box-shadow: var(--dark-shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.2));
    }

    :global(body.dark) .add-task-board-button:hover:not(:disabled) {
        background-color: var(--dark-accent-primary-hover, #0b8eff);
        box-shadow: var(--dark-shadow-md, 0 4px 6px rgba(0, 0, 0, 0.3));
    }

    :global(body.dark) .add-task-board-button:focus-visible {
        box-shadow:
            var(--dark-shadow-sm),
            0 0 0 3px var(--dark-border-focus, rgba(54, 163, 255, 0.4));
    }
</style>
