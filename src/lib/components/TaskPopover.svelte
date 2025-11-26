<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { fly } from 'svelte/transition';
    import type { TaskForFrontend } from '$lib/types/task';

    export let task: TaskForFrontend | null;
    export let isOpen: boolean;
    export let x: number = 0; // X coordinate for positioning
    export let y: number = 0; // Y coordinate for positioning

    let popoverElement: HTMLDivElement; // Reference to the popover's main div

    const dispatch = createEventDispatcher();

    function closeModal() {
        dispatch('close');
    }

    // Reactive statement to focus the popover when it opens
    $: if (isOpen && popoverElement) {
        popoverElement.focus();
    } else if (!isOpen && popoverElement) {
        // Optionally return focus to the element that triggered it, or body
        document.body.focus();
    }

    function formatDate(isoString: string | null): string {
        if (!isoString) return 'Not set';
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

    function getStatusClass(status: TaskForFrontend['status']): string {
        switch (status) {
            case 'pending': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-700 dark:text-yellow-200';
            case 'complete': return 'bg-green-100 text-green-800 dark:bg-green-700 dark:text-green-200';
            case 'incomplete': return 'bg-red-100 text-red-800 dark:bg-red-700 dark:text-red-200';
            case 'late': return 'bg-orange-100 text-orange-700 dark:bg-orange-600 dark:text-orange-100';
            default: return 'bg-gray-200 text-gray-700 dark:bg-zinc-600 dark:text-zinc-300';
        }
    }

    function getPriorityText(priority: string | number | null): string {
        if (typeof priority === 'string') return priority.charAt(0).toUpperCase() + priority.slice(1);
        return 'Standard';
    }

    // Adjust position if it goes off-screen
    let popoverStyle = '';
    $: {
        if (isOpen && task) {
            // Calculate desired position
            let finalX = x;
            let finalY = y;

            // Get viewport dimensions (assuming browser context)
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            // Get popover dimensions (estimate or measure after render)
            // For now, let's assume a max width/height for calculation
            const popoverWidth = 300; // Max width from CSS
            const popoverHeight = 250; // Estimated max height

            // Adjust X if it goes off right edge
            if (finalX + popoverWidth > viewportWidth - 20) { // 20px padding from right edge
                finalX = viewportWidth - popoverWidth - 20;
            }
            // Adjust Y if it goes off bottom edge
            if (finalY + popoverHeight > viewportHeight - 20) { // 20px padding from bottom edge
                finalY = viewportHeight - popoverHeight - 20;
            }
            // Ensure it doesn't go off left edge
            if (finalX < 20) {
                finalX = 20;
            }
            // Ensure it doesn't go off top edge (consider header height)
            if (finalY < 70) { // Assuming header is ~60px + 10px padding
                finalY = 70;
            }

            popoverStyle = `left: ${finalX}px; top: ${finalY}px;`;
        }
    }
</script>

{#if isOpen && task}
    <div
        bind:this={popoverElement}
        tabindex="-1"
        class="fixed z-[80] p-4 rounded-lg shadow-lg border transition-all duration-200 ease-out
               bg-white text-gray-800 border-gray-200
               dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700
               focus:outline-none"
        style="{popoverStyle}"
        on:click|stopPropagation
        transition:fly={{ y: 10, duration: 150, opacity: 0 }}
        role="dialog"
        aria-modal="false"
        aria-labelledby="task-popover-title"
    >
        <button
            class="absolute top-2 right-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-700
                   text-gray-400 dark:text-zinc-400"
            on:click={closeModal}
            aria-label="Close task details"
        >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
        </button>

        <div class="flex items-center mb-2">
            <span class="w-3 h-3 rounded-full mr-2 flex-shrink-0" style="background-color: {task.color || '#3B82F6'};"></span>
            <h3 id="task-popover-title" class="text-base font-semibold break-words" style="color: {task.color || (true ? '#E5E7EB' : '#1F2937')};">
                {task.title}
            </h3>
        </div>

        {#if task.description}
            <p class="text-xs text-gray-600 dark:text-zinc-400 mb-2 max-h-20 overflow-y-auto custom-scrollbar">
                {task.description}
            </p>
        {/if}

        <div class="text-xs space-y-1">
            <p class="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 text-gray-500 dark:text-zinc-400">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 3h.008v.008H12V18Z" />
                </svg>
                <span class="font-medium text-gray-700 dark:text-zinc-200">Due:</span>
                <span class="ml-1 text-gray-600 dark:text-zinc-400">
                    {formatDate(task.dueDateISO)} {#if task.dueTime} at {task.dueTime}{/if}
                </span>
            </p>
            <p class="flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 text-gray-500 dark:text-zinc-400">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                <span class="font-medium text-gray-700 dark:text-zinc-200">Status:</span>
                <span class="ml-1 px-2 py-0.5 rounded-full {getStatusClass(task.status)}">
                    {formatStatus(task.status)}
                </span>
            </p>
            {#if task.priority}
                <p class="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4 mr-1 text-gray-500 dark:text-zinc-400">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L13.5 21.75l1.5-6.75h-6.75H3.75Z" />
                    </svg>
                    <span class="font-medium text-gray-700 dark:text-zinc-200">Priority:</span>
                    <span class="ml-1 text-gray-600 dark:text-zinc-400">{getPriorityText(task.priority)}</span>
                </p>
            {/if}
        </div>
    </div>
{/if}

<style>
    /* Tailwind classes handle most styling, but custom scrollbar and z-index are important */
    .custom-scrollbar {
        scrollbar-width: thin;
        scrollbar-color: #c5c5c5 #f1f1f1;
    }
    :global(.dark) .custom-scrollbar {
        scrollbar-color: #4a5568 #2d3748;
    }
    ::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }
    ::-webkit-scrollbar-track {
        background: #f1f1f1;
        border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb {
        background: #c5c5c5;
        border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
        background: #a8a8a8;
    }
    :global(.dark) ::-webkit-scrollbar-track {
        background: #2d3748;
    }
    :global(.dark) ::-webkit-scrollbar-thumb {
        background: #4a5568;
    }
    :global(.dark) ::-webkit-scrollbar-thumb:hover {
        background: #718096;
    }
</style>
