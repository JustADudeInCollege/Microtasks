<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import type { TaskForFrontend } from '$lib/types/task';
  import { createEventDispatcher } from 'svelte';

  export let isOpen: boolean;
  export let tasks: TaskForFrontend[] = [];
  export let date: Date | null = null;

  const dispatch = createEventDispatcher();

  function close() {
    isOpen = false;
  }

  // Function to format date for display
  function formatDate(d: Date | null): string {
    if (!d) return '';
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
</script>

  {#if isOpen}
    <div
      class="fixed inset-0 z-[70] flex items-center justify-center bg-opacity-50 p-4 backdrop-blur-sm"
      on:click|self={close}
      transition:fade={{ duration: 150 }}
    >
      <div
        class="rounded-lg shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden bg-white text-gray-800 dark:bg-zinc-800 dark:text-zinc-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="day-tasks-modal-title"
      on:click|stopPropagation
      transition:scale={{ duration: 200, start: 0.95, opacity: 0.5 }}
    >
      <div class="flex justify-between items-center p-4 sm:p-5 border-b border-gray-200 dark:border-zinc-700 flex-shrink-0">
        <h3 id="day-tasks-modal-title" class="text-lg sm:text-xl font-semibold">Tasks for {formatDate(date)}</h3>
        <button
          type="button"
          class="p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:ring-gray-400 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:focus:ring-zinc-600"
          on:click={close}
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div class="flex-grow overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-3">
        {#if tasks.length > 0}
          <ul class="space-y-2">
            {#each tasks as task (task.id)}
              <li
                class="p-3 rounded-md shadow-sm flex items-center justify-between cursor-pointer hover:opacity-90 transition-opacity"
                style="background-color: {task.color || '#10B981'};"
                on:click={(e) => dispatch('detailTask', { task, event: e })}
              >
                <div class="flex-1">
                  <h4 class="font-semibold text-white text-sm">{task.title}</h4>
                  {#if task.description}
                    <p class="text-white text-xs opacity-90 mt-0.5">{task.description}</p>
                  {/if}
                  {#if task.dueTime}
                    <p class="text-white text-xs opacity-80 mt-0.5">Due: {task.dueTime}</p>
                  {/if}
                </div>
                <!-- Optionally add a button to view full details or edit task -->
                <!-- <button class="ml-2 p-1 rounded-full bg-white bg-opacity-20 hover:bg-opacity-30 text-white" aria-label="View task details">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" /></svg>
                </button> -->
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-center text-gray-500 dark:text-zinc-400 py-4">No tasks due on this day.</p>
        {/if}
      </div>
      <div class="flex justify-end p-4 sm:p-5 border-t border-gray-200 dark:border-zinc-700 flex-shrink-0">
        <button
          type="button"
          class="px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400 dark:bg-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-500 dark:focus:ring-zinc-500"
          on:click={close}
        >
          Close
        </button>
      </div>
    </div>
  </div>
{/if}
