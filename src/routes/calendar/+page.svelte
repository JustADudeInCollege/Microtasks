<script lang="ts">
  import { onMount, tick, onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import { slide, scale, fly, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { goto, invalidateAll } from '$app/navigation';
  import { browser } from '$app/environment';
  import type { ActionResult } from '@sveltejs/kit';
  import type { TaskForFrontend } from '$lib/types/task'; // Import from types file
  import TaskPopover from '$lib/components/TaskPopover.svelte'; // Import new popover component
  import DayTasksModal from '$lib/components/DayTasksModal.svelte'; // Import new modal component

  export let data: {
    user?: { name?: string };
    tasks: TaskForFrontend[];
    error?: string;
  };
  export let form: ActionResult | undefined | null;

  let isSidebarOpen = false;
  let username = "User (Calendar Initial Default)";
  // console.log('[Calendar Svelte] Initial `username` state:', username); // Keep for debugging if needed

  let greeting = "GOOD DAY";
  let eventFormActionError: string | null = null;
  let pageError: string | null = data.error || null;
  let isDarkMode = false;
  let currentDateTime = "";
  let dateTimeInterval: ReturnType<typeof setInterval> | null = null;

  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();

  interface CalendarEvent { id: string; title: string; description?: string; color?: string; deadlineTime?: string; }
  interface Day { dayNum: number; events: CalendarEvent[]; isCurrentMonth: boolean; isToday: boolean; date: Date; }
  let daysInMonth: Day[] = [];
  let isLoadingCalendar = true;

  let showEventForm = false;
  let editingEventId: string | null = null;
  let eventTitle = "";
  let eventDescription = "";
  let eventDate: string | null = null;
  let eventDueTime: string | null = null;
  let eventColor: string = '#3B82F6';

  let showTaskDetailsPopover = false; // Changed from Modal to Popover
  let selectedTaskForDetails: TaskForFrontend | null = null;
  let popoverX: number = 0; // X coordinate for popover
  let popoverY: number = 0; // Y coordinate for popover

  let showDayTasksModal = false;
  let selectedDayTasks: TaskForFrontend[] = [];
  let selectedDayDate: Date | null = null;

  const dropdownIds = ['notifWindow', 'helpWindow', 'profileWindow'];

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "GOOD MORNING";
    if (hour >= 12 && hour < 18) return "GOOD AFTERNOON";
    return "GOOD EVENING";
  }
  $: currentPath = $page.url.pathname;

  function getStoredUsername(): string {
    if (browser) {
      const storedName = localStorage.getItem('microtask_username') || "User (from Calendar Storage Default)";
      // console.log('[Calendar Svelte getStoredUsername] Value from localStorage:', storedName);
      return storedName;
    }
    return "User (Calendar SSR Default)";
  }

  async function updateCalendarDays() {
    isLoadingCalendar = true;
    await tick();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const newDaysInMonth: Day[] = [];
    const firstDateOfMonth = new Date(currentYear, currentMonth, 1);
    const startingDayOfWeek = firstDateOfMonth.getDay();
    const daysInCurrentActualMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevMonthEndDate = new Date(currentYear, currentMonth, 0);
    const daysInPrevMonth = prevMonthEndDate.getDate();

    for (let i = 0; i < startingDayOfWeek; i++) {
        const dayNum = daysInPrevMonth - startingDayOfWeek + 1 + i;
        const date = new Date(currentYear, currentMonth - 1, dayNum); date.setHours(0,0,0,0);
        newDaysInMonth.push({ dayNum, events: [], isCurrentMonth: false, isToday: date.getTime() === today.getTime(), date });
    }
    for (let i = 1; i <= daysInCurrentActualMonth; i++) {
        const currentDateObj = new Date(currentYear, currentMonth, i); currentDateObj.setHours(0,0,0,0);
        const isTodayFlag = currentDateObj.getTime() === today.getTime();
        let eventsForThisDay: CalendarEvent[] = [];

        if (data.tasks && Array.isArray(data.tasks)) {
            data.tasks.forEach(task => {
                if (task.dueDateISO) {
                    const [taskYear, taskMonth, taskDay] = task.dueDateISO.split('-').map(Number);
                    if (taskYear === currentDateObj.getFullYear() && (taskMonth - 1) === currentDateObj.getMonth() && taskDay === currentDateObj.getDate()) {
                        eventsForThisDay.push({ id: task.id, title: task.title, description: task.description, deadlineTime: task.dueTime || undefined, color: task.color || '#10B981', });
                    }
                }
            });
        }

        // REMOVED THURSDAY SPECIAL EVENTS BLOCK
        // if (isTodayFlag && today.getDay() === 4) { ... }

        newDaysInMonth.push({ dayNum: i, events: eventsForThisDay, isCurrentMonth: true, isToday: isTodayFlag, date: currentDateObj });
    }
    const totalCells = Math.ceil(newDaysInMonth.length / 7) * 7;
    let nextMonthDayCounter = 1;
    while(newDaysInMonth.length < totalCells) {
        const date = new Date(currentYear, currentMonth + 1, nextMonthDayCounter); date.setHours(0,0,0,0);
        newDaysInMonth.push({ dayNum: nextMonthDayCounter, events: [], isCurrentMonth: false, isToday: date.getTime() === today.getTime(), date });
        nextMonthDayCounter++;
    }
    daysInMonth = newDaysInMonth;
    isLoadingCalendar = false;
  }
  function prevMonth() { currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; } updateCalendarDays(); }
  function nextMonth() { currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; } updateCalendarDays(); }
  function toggleDarkMode() { isDarkMode = !isDarkMode; if (browser) { document.body.classList.toggle('dark', isDarkMode); localStorage.setItem('theme', isDarkMode ? 'dark' : 'light'); } }
  function toggleSidebar() { isSidebarOpen = !isSidebarOpen; }
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
  function openAddEventForm(dayDateObj?: Date) { showEventForm = true; editingEventId = null; eventTitle = ""; eventDescription = ""; eventFormActionError = null; const dateToUse = dayDateObj || new Date(); eventDate = `${dateToUse.getFullYear()}-${(dateToUse.getMonth() + 1).toString().padStart(2, '0')}-${dateToUse.getDate().toString().padStart(2, '0')}`; eventDueTime = null; eventColor = '#3B82F6'; }
  function closeEventForm() { showEventForm = false; }
  function closeSidebar() { isSidebarOpen = false; }
  
  // Modified to accept eventId and optionally MouseEvent for positioning
  function openTaskDetailsPopover(eventId: string, event?: MouseEvent) {
      const task = data.tasks.find(t => t.id === eventId);
      if (task) {
          selectedTaskForDetails = task;
          if (event) {
              popoverX = event.clientX;
              popoverY = event.clientY;
          } else {
              // Fallback for keyboard events or if event is not provided
              // You might want to calculate position based on the element's bounding rect
              popoverX = window.innerWidth / 2; // Center of the screen as a fallback
              popoverY = window.innerHeight / 2; // Center of the screen as a fallback
          }
          showTaskDetailsPopover = true;
      } else {
          console.warn(`Task with ID ${eventId} not found for details popover.`);
      }
  }
  function closeTaskDetailsPopover() { showTaskDetailsPopover = false; selectedTaskForDetails = null; } // Changed from Modal to Popover

  function openDayTasksModal(day: Day) {
      selectedDayDate = day.date;
      selectedDayTasks = data.tasks.filter(task => {
          if (!task.dueDateISO) return false;
          const [taskYear, taskMonth, taskDay] = task.dueDateISO.split('-').map(Number);
          return taskYear === day.date.getFullYear() && (taskMonth - 1) === day.date.getMonth() && taskDay === day.date.getDate();
      });
      showDayTasksModal = true;
  }
  function closeDayTasksModal() {
      showDayTasksModal = false;
      selectedDayTasks = [];
      selectedDayDate = null;
  }

  function toggleWindow(id: string) { const el = document.getElementById(id); if (el) el.classList.toggle('hidden'); }
  function closeOtherWindows(currentId: string) { dropdownIds.forEach(id => { if (id !== currentId) document.getElementById(id)?.classList.add('hidden'); }); }
  function handleLogout() { if (browser) { localStorage.removeItem('microtask_username'); document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;"; goto('/login'); } }

  const eventFormEnhanceCallback = () => {
    eventFormActionError = null;
    return async ({ result, update }: { result: ActionResult, update: (opts?: { reset?: boolean }) => Promise<void> }) => {
      // console.log('[Calendar Svelte Enhance] AddEvent Action Result:', JSON.stringify(result, null, 2));
      if (result.type === 'success' && result.data?.eventForm?.success) {
        closeEventForm();
        successMessage = result.data.eventForm.message || 'Event added successfully!';
        if (successMessageTimeoutId) clearTimeout(successMessageTimeoutId);
        successMessageTimeoutId = window.setTimeout(() => successMessage = null, 3000);
        await invalidateAll();
      } else if (result.type === 'failure') {
        const failureData = result.data as { eventForm?: { error?: string } };
        eventFormActionError = failureData?.eventForm?.error || 'Failed to process event.';
      } else if (result.type === 'error') {
        eventFormActionError = (result.error as Error)?.message || 'An unexpected error occurred.';
      }
      await update({ reset: result.type === 'success' && result.data?.eventForm?.success });
    };
  };
  let successMessage: string | null = null;
  let successMessageTimeoutId: number | undefined;

  const handleEscKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (showTaskDetailsPopover) closeTaskDetailsPopover(); else if (showEventForm) closeEventForm(); else if (showDayTasksModal) closeDayTasksModal(); else if (isSidebarOpen) closeSidebar(); } }; // Changed to close popover

  $: {
    // console.log('[Calendar Svelte Reactive Block - User/Error] Triggered. Current data.user:', data.user, 'Current username state:', username);
    if (browser) {
      let nameToSet: string | undefined = undefined;
      if (data.user?.name && data.user.name !== "User" && data.user.name !== "User (Calendar Initial Default)" && data.user.name !== "User (Calendar SSR Default)" && data.user.name !== "User (from Calendar Storage Default)") {
        nameToSet = data.user.name;
      } else {
        const storedName = getStoredUsername();
        if (username !== storedName && (!data.user?.name || data.user.name.startsWith("User (Calendar"))) {
          nameToSet = storedName;
        }
      }
      if (nameToSet !== undefined && username !== nameToSet) {
          username = nameToSet;
      }
    }
    pageError = data.error || null;
  }

  $: {
      if (data.tasks) {
          // console.log('[Calendar Svelte Reactive Block - Tasks] data.tasks updated, calling updateCalendarDays. Count:', data.tasks.length);
          updateCalendarDays();
      }
  }

  $: {
      if (form) {
          // console.log('[Calendar Svelte Reactive Block - Form Prop] Form prop updated:', JSON.stringify(form, null, 2));
          if (form.type === 'failure' && form.data?.eventForm?.error) {
              eventFormActionError = form.data.eventForm.error;
          } else if (form.type === 'success' && form.data?.eventForm?.success){
              eventFormActionError = null; // Clear error on success
              successMessage = form.data.eventForm.message || 'Operation successful!';
              if (successMessageTimeoutId) clearTimeout(successMessageTimeoutId);
              successMessageTimeoutId = window.setTimeout(() => successMessage = null, 3000);
          }
          form = null;
      }
  }

  onMount(() => {
    // console.log('[Calendar Svelte onMount] Component Mounted. Initial data.user:', data.user);
    let initialUsername = "User (Calendar onMount Default)";
    if (data.user?.name && data.user.name !== "User" && !data.user.name.includes("(Calendar")) {
        initialUsername = data.user.name;
    } else {
        initialUsername = getStoredUsername();
    }
    username = initialUsername;
    greeting = getGreeting();

    if (browser) {
      const savedTheme = localStorage.getItem('theme');
      isDarkMode = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.body.classList.toggle('dark', isDarkMode);
      const setupIconListener = (iconId: string, windowId: string) => { const el = document.getElementById(iconId); if(el) el.addEventListener('click', (e) => { e.stopPropagation(); toggleWindow(windowId); closeOtherWindows(windowId); });};
      setupIconListener('bellIcon', 'notifWindow');
      setupIconListener('helpIcon', 'helpWindow');
      setupIconListener('profileIcon', 'profileWindow');
      const darkModeButton = document.getElementById('darkModeToggle');
      if (darkModeButton) darkModeButton.addEventListener('click', toggleDarkMode);
      
      // Update date/time
      updateDateTime();
      dateTimeInterval = setInterval(updateDateTime, 60000);
    }

    const handleGlobalClick = (event: MouseEvent) => {
        const target = event.target as Node | null;
        const sidebar = document.getElementById('sidebar');
        const hamburgerButton = document.getElementById('hamburgerButton');
        if (sidebar && !sidebar.contains(target) && hamburgerButton && !hamburgerButton.contains(target) && isSidebarOpen) {
            closeSidebar();
        }
        let isClickInsideDropdownTrigger = false;
        const triggerIds = ['bellIcon', 'helpIcon', 'profileIcon'];
        triggerIds.forEach(triggerId => {
            const el = document.getElementById(triggerId);
            if (el && el.contains(target)) isClickInsideDropdownTrigger = true;
        });
        let isClickInsideDropdownWindow = false;
        dropdownIds.forEach(windowId => {
            const el = document.getElementById(windowId);
            if (el && el.contains(target)) isClickInsideDropdownWindow = true;
        });
        // Close popover if click is outside and popover is open
        if (showTaskDetailsPopover) {
            const popoverElement = document.querySelector('.fixed.z-\\[80\\]'); // Assuming this class identifies the popover
            if (popoverElement && !popoverElement.contains(target)) {
                closeTaskDetailsPopover();
            }
        }
        // Close day tasks modal if click is outside and modal is open
        if (showDayTasksModal) {
            const dayTasksModalElement = document.querySelector('.fixed.inset-0.z-\\[60\\]'); // Assuming this class identifies the modal
            if (dayTasksModalElement && !dayTasksModalElement.contains(target)) {
                closeDayTasksModal();
            }
        }
        if (!isClickInsideDropdownTrigger && !isClickInsideDropdownWindow) closeOtherWindows('');
    };
    document.addEventListener('click', handleGlobalClick);
    // Attach keydown listener with useCapture = true
    document.addEventListener('keydown', handleEscKey, true);
    const intervalId = setInterval(() => { greeting = getGreeting(); }, 60000);

    if (browser && data.tasks) {
        updateCalendarDays();
    }

    return () => {
      clearInterval(intervalId);
      if (dateTimeInterval) clearInterval(dateTimeInterval);
      document.removeEventListener('click', handleGlobalClick);
      // Remove keydown listener with useCapture = true
      document.removeEventListener('keydown', handleEscKey, true);
      const bellIcon = document.getElementById('bellIcon'); if (bellIcon) bellIcon.onclick = null;
      const helpIcon = document.getElementById('helpIcon'); if (helpIcon) helpIcon.onclick = null;
      const profileIcon = document.getElementById('profileIcon'); if (profileIcon) profileIcon.onclick = null;
      const darkModeButton = document.getElementById('darkModeToggle'); if (darkModeButton) darkModeButton.onclick = null;
      if (successMessageTimeoutId) clearTimeout(successMessageTimeoutId);
    };
  });
</script>

<!-- HTML Template (Sidebar, Header, Main Calendar View, Modals) -->
<div class={`flex h-screen font-sans ${isDarkMode ? 'dark bg-zinc-900 text-zinc-300' : 'bg-gray-100 text-gray-800'}`}>
  {#if pageError && !eventFormActionError}
    <div class="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-md z-[100]" role="alert">
      <strong class="font-bold">Error:</strong>
      <span class="block sm:inline">{pageError}</span>
      <button on:click={() => pageError = null} class="absolute top-0 bottom-0 right-0 px-4 py-3" aria-label="Close error">
        <span class="text-xl">×</span>
      </button>
    </div>
  {/if}
  {#if successMessage}
    <div class="fixed top-4 right-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded shadow-md z-[100]" role="status">
      <span class="block sm:inline">{successMessage}</span>
      <button on:click={() => successMessage = null} class="absolute top-0 bottom-0 right-0 px-4 py-3" aria-label="Close success message">
        <span class="text-xl">×</span>
      </button>
    </div>
  {/if}


    {#if isSidebarOpen}
<div
  id="sidebar"
  class={`fixed top-0 left-0 h-full w-64 shadow-lg z-50 flex flex-col justify-between p-4 border-r ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}
  transition:fly={{ x: -300, duration: 300, easing: quintOut }}
>
  <div>
    <div class="flex items-center gap-2 mb-8 pb-4 border-b ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}">
      <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Microtask Logo" class="w-8 h-8" />
      <h1 class={`text-xl font-bold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Microtask</h1>
    </div>
        <nav class="flex flex-col gap-2">
          <a href="/home"
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${currentPath === '/home' || currentPath === '/' ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" /></svg>
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
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${currentPath === '/tasks' ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" class={`w-5 h-5 ${currentPath === '/tasks' ? 'stroke-white' : (isDarkMode ? 'stroke-zinc-300' : 'stroke-gray-700')}`}><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
            <span>All Tasks</span>
          </a>
          <a href="/calendar"
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${currentPath === '/calendar' ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" /><path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/></svg>
            <span>Calendar</span>
          </a>
          <a href="/workspace"
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${currentPath === '/workspace' ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" class={`w-5 h-5 ${currentPath === '/workspace' ? 'stroke-white' : (isDarkMode ? 'stroke-zinc-300' : 'stroke-gray-700')}`}><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.098a2.25 2.25 0 0 1-2.25 2.25h-12a2.25 2.25 0 0 1-2.25-2.25V14.15M18 18.75h.75A2.25 2.25 0 0 0 21 16.5v-1.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 15v1.5A2.25 2.25 0 0 0 3.75 18.75H4.5M12 12.75a3 3 0 0 0-3-3H5.25V7.5a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3v2.25H15a3 3 0 0 0-3 3Z" /></svg>
            <span>Workspace</span>
          </a>
          <a href="/ai-chat"
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${currentPath === '/ai-chat' ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path d="M12.001 2.504a2.34 2.34 0 00-2.335 2.335v.583c0 .582.212 1.13.582 1.556l.03.035-.03.034a2.34 2.34 0 00-2.917 3.916A3.287 3.287 0 004.08 14.25a3.287 3.287 0 003.287 3.287h8.266a3.287 3.287 0 003.287-3.287 3.287 3.287 0 00-1.253-2.583 2.34 2.34 0 00-2.917-3.916l-.03-.034.03-.035c.37-.425.582-.973.582-1.555v-.583a2.34 2.34 0 00-2.335-2.336h-.002zM9.75 12.75a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" /><path fill-rule="evenodd" d="M12 1.5c5.79 0 10.5 4.71 10.5 10.5S17.79 22.5 12 22.5 1.5 17.79 1.5 12 6.21 1.5 12 1.5zM2.85 12a9.15 9.15 0 019.15-9.15 9.15 9.15 0 019.15 9.15 9.15 9.15 0 01-9.15 9.15A9.15 9.15 0 012.85 12z" clip-rule="evenodd" /></svg>
            <span>Ask Synthia</span>
          </a>
        </nav>
      </div>
      <button on:click={handleLogout}
              class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold w-full mt-auto transition-colors duration-150
                     ${isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100'}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" class={`w-5 h-5 ${isDarkMode ? 'stroke-zinc-300' : 'stroke-gray-700'}`}><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
        <span>Log out</span>
      </button>
    </div>
  {/if}

  <div class="flex-1 flex flex-col overflow-hidden">
  <header class={`top-header ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
    <div class="header-left">
      <button id="hamburgerButton" class="menu-btn" on:click={toggleSidebar} aria-label="Toggle Sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
      </button>
      <a href="/home" class="logo">
        <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Microtask Logo" class="h-8 w-auto">
        <span class={`${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Microtask</span>
      </a>
    </div>
      <div class="flex items-center gap-4 mr-4 right text-gray-600 dark:text-zinc-300 text-sm font-medium">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
          <path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" /><path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/></svg>
        <span>{currentDateTime}</span>
      </div>
      <div class="header-icons">
        <div class="relative">
          <button id="bellIcon" aria-label="Notifications" class="relative">
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0c-1.673-.253-3.287-.673-4.831-1.243a.75.75 0 01-.297-1.206C4.45 13.807 5.25 11.873 5.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0H9.752z" clip-rule="evenodd" /></svg>
          </button>
          <div id="notifWindow" class={`dropdown-window hidden w-80 max-h-96 overflow-y-auto custom-scrollbar ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
            <h3 class="font-semibold mb-2 text-sm">Notifications</h3> <p class="text-xs text-center py-4">No new notifications.</p>
          </div>
        </div>
        <div class="relative">
          <button id="helpIcon" aria-label="Help & FAQ">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.042.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" /></svg>
          </button>
          <div id="helpWindow" class={`dropdown-window hidden ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
            <h3 class="font-semibold mb-2 text-sm">FAQ</h3><ul class="list-disc list-inside space-y-1 text-xs"><li>How do I add a task?</li><li>Where is the calendar?</li></ul><a href="/support" class="text-xs text-blue-600 hover:underline mt-2 block">Visit Support</a>
          </div>
        </div>
        <div class="relative">
          <button id="profileIcon" aria-label="Profile Menu">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" /></svg>
          </button>
          <div id="profileWindow" class={`dropdown-window hidden ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
            <h3 class="font-semibold mb-2 text-sm">Profile</h3>
            <p class="text-xs mb-2 truncate">Welcome, {username || 'User'}!</p>
            <button on:click={handleLogout} class={`text-xs px-2 py-1.5 rounded w-full text-left transition-colors duration-150 ${isDarkMode ? 'bg-red-700 hover:bg-red-600 text-zinc-300' : 'bg-red-100 hover:bg-red-200 text-red-700'}`}>Logout</button>
          </div>
        </div>
        <button id="darkModeToggle" aria-label="Toggle Dark Mode" class={`ml-2 p-1.5 rounded-full transition-colors duration-150 ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-300' : 'hover:bg-gray-100 text-gray-700'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
            {#if isDarkMode} <path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 0 0-.103.103l1.132 1.132a.75.75 0 0 0 1.06 0l1.132-1.132a.75.75 0 0 0-.103-1.06l-1.132-1.132a.75.75 0 0 0-1.06 0L9.63 1.615a.75.75 0 00-.102.103ZM12 3.75a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75ZM18.282 5.282a.75.75 0 00-1.06 0l-1.132 1.132a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 000-.103ZM19.5 12a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75ZM18.282 18.718a.75.75 0 000 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 00-1.06 0l-1.132 1.132a.75.75 0 00.103.103ZM12 18.75a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5a.75.75 0 01.75.75ZM5.718 18.718a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 00-1.06 0L4.586 17.686a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 000-.103ZM4.5 12a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75ZM5.718 5.282a.75.75 0 000-1.06l-1.132-1.132a.75.75 0 00-1.06 0L2.39 4.114a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-.103ZM12 6.75a5.25 5.25 0 015.25 5.25 5.25 5.25 0 01-5.25 5.25 5.25 5.25 0 01-5.25-5.25 5.25 5.25 0 015.25-5.25Z" clip-rule="evenodd" />
            {:else} <path fill-rule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 010 9Z" clip-rule="evenodd" /> {/if}
          </svg>
        </button>
      </div>
    </header>

    <div class="flex-1 flex flex-col overflow-hidden">
       
        
        <div class="px-4 sm:px-6 mt-4">
            <h1 class={`text-xl sm:text-2xl font-semibold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>{greeting}, <span class={`${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{username.toUpperCase()}</span>!</h1>
            <p class={`text-sm mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Here is your monthly schedule.</p>
        </div>

      <main class="px-4 sm:px-6 mt-4 flex-grow">
        <div class={`calendar-container w-full p-2 sm:p-4 rounded-lg shadow ${isDarkMode ? 'bg-zinc-800 border border-zinc-700' : 'bg-white border border-gray-200'}`}>
             <div class="flex justify-between items-center mb-4 px-1">
                <button on:click={prevMonth} aria-label="Previous Month" class={`p-2 rounded-md transition-colors ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-300' : 'hover:bg-gray-100 text-gray-600'}`}><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg></button>
                <h2 class={`text-lg sm:text-xl font-semibold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>{new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long' })} {currentYear}</h2>
                <button on:click={nextMonth} aria-label="Next Month" class={`p-2 rounded-md transition-colors ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-300' : 'hover:bg-gray-100 text-gray-600'}`}><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg></button>
            </div>
            <div class={`grid grid-cols-7 gap-px text-center font-medium text-xs mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
                {#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as dayName}<div class="py-1 hidden sm:block">{dayName.toUpperCase()}</div><div class="py-1 sm:hidden">{dayName[0]}</div>{/each}
            </div>
            <div class="grid grid-cols-7 gap-px">
                {#if isLoadingCalendar && daysInMonth.length === 0} <div class="col-span-7 text-center py-10 flex justify-center items-center min-h-[300px]"><svg class={`animate-spin h-8 w-8 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
                {:else if daysInMonth.length > 0}
                    {#each daysInMonth as day (day.date.toISOString() + '-' + day.dayNum + '-' + day.events.map(e=>e.id + (e.deadlineTime || '')).join('-'))} <div class={`p-1 sm:p-1.5 border min-h-[5rem] sm:min-h-[7rem] flex flex-col transition-colors duration-150 cursor-pointer relative group ${!day.isCurrentMonth ? (isDarkMode ? 'bg-zinc-850 border-zinc-750 text-zinc-600' : 'bg-gray-50 border-gray-100 text-gray-400') : (isDarkMode ? 'bg-zinc-750 border-zinc-700 hover:bg-zinc-700' : 'bg-white border-gray-200 hover:bg-gray-50')} ${day.isToday && day.isCurrentMonth ? (isDarkMode ? '!border-blue-500 ring-1 ring-blue-500 !bg-zinc-700' : '!border-blue-500 ring-1 ring-blue-500 !bg-blue-50') : ''}`} role="gridcell" aria-label={`Date ${day.date.toLocaleDateString()}${day.events.length ? ', ' + day.events.length + ' event' + (day.events.length > 1 ? 's' : '') : ''}`} on:click={() => openDayTasksModal(day)} tabindex="0" on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openDayTasksModal(day); }}>
                            <span class={`text-xs sm:text-sm font-semibold mb-0.5 ${day.isToday && day.isCurrentMonth ? (isDarkMode ? 'text-blue-300' : 'text-blue-600') : ''} ${!day.isCurrentMonth ? 'opacity-60' : ''}`}>{day.dayNum}</span>
                            {#if day.isCurrentMonth && day.events.length > 0} {@const maxEventsToShow = day.events.length > 2 ? 1 : 2} <ul class="mt-0.5 text-[0.6rem] sm:text-[0.7rem] space-y-0.5 overflow-hidden flex-grow"> {#each day.events.slice(0, maxEventsToShow) as event (event.id)} <li class={`truncate p-0.5 sm:px-1 sm:py-0.5 rounded text-white leading-tight cursor-pointer hover:opacity-80 transition-opacity`} style="background-color: {event.color || (isDarkMode ? '#374151' : '#9CA3AF')};" on:click|stopPropagation={(e) => openTaskDetailsPopover(event.id, e)} on:keydown|stopPropagation={(e) => { if (e.key === 'Enter' || e.key === ' ') openTaskDetailsPopover(event.id); }} tabindex="0" role="button" aria-label={`View details for ${event.title}`} title={event.title + (event.deadlineTime ? ` (DL: ${event.deadlineTime})` : '')}> {event.title} {#if event.deadlineTime}<span class="block text-[0.55rem] sm:text-[0.6rem] opacity-80">DL: {event.deadlineTime}</span>{/if} </li> {/each} {#if day.events.length > maxEventsToShow}<li class={`italic text-[0.55rem] sm:text-[0.65rem] mt-0.5 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>+{day.events.length - maxEventsToShow} more</li>{/if} </ul> {/if}
                             <button on:click|stopPropagation={() => openAddEventForm(day.date)} class={`absolute bottom-1 right-1 p-0.5 sm:p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-150 focus:opacity-100 ${isDarkMode ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'}`} aria-label="Add event to this day"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-2.5 h-2.5 sm:w-3 sm:h-3"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg></button>
                        </div>
                    {/each}
                {:else if !isLoadingCalendar && daysInMonth.length === 0} <p class={`col-span-7 text-center py-10 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>No days to display for this month.</p>
                {/if}
            </div>
        </div>
      </main>
    </div>
  </div>

  {#if showEventForm} <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm" on:click|self={closeEventForm} transition:fade={{ duration: 150 }}> <div class={`rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${isDarkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-white text-gray-800'}`} role="dialog" aria-modal="true" aria-labelledby="event-modal-title" on:click|stopPropagation transition:scale={{ duration: 200, start: 0.95, opacity: 0.5 }}> <div class={`flex justify-between items-center p-4 sm:p-5 border-b flex-shrink-0 ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}> <h3 id="event-modal-title" class="text-lg sm:text-xl font-semibold">{editingEventId ? 'Edit Event' : 'Add Event'}</h3> <button type="button" class={`p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 ${isDarkMode ? 'text-zinc-400 hover:bg-zinc-700 focus:ring-zinc-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:ring-gray-400'}`} on:click={closeEventForm} aria-label="Close"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button> </div> <form method="POST" action="?/addEvent" use:enhance={eventFormEnhanceCallback} class={`flex-grow flex flex-col overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-4`}> {#if editingEventId} <input type="hidden" name="id" value={editingEventId} /> {/if} <div><label for="event-title" class="block text-sm font-medium mb-1">Title <span class="text-red-500">*</span></label><input type="text" id="event-title" name="title" bind:value={eventTitle} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 placeholder-zinc-500' : 'border-gray-300 text-gray-800 placeholder-gray-400'}`} required /></div> <div><label for="event-description" class="block text-sm font-medium mb-1">Description (Optional)</label><textarea id="event-description" name="description" bind:value={eventDescription} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-h-[80px] ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 placeholder-zinc-500' : 'border-gray-300 text-gray-800 placeholder-gray-400'}`} ></textarea></div> <div class="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label for="event-date" class="block text-sm font-medium mb-1">Date <span class="text-red-500">*</span></label><input type="date" id="event-date" name="eventDate" bind:value={eventDate} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 calendar-picker-dark' : 'border-gray-300 text-gray-800'}`} required /></div><div><label for="event-color" class="block text-sm font-medium mb-1">Color</label><input type="color" id="event-color" name="color" bind:value={eventColor} class={`w-full h-10 px-1 py-1 border rounded-md shadow-sm cursor-pointer ${isDarkMode ? 'bg-zinc-700 border-zinc-600' : 'border-gray-300'}`} /></div></div> <div class="grid grid-cols-1 sm:grid-cols-1 gap-4"><div><label for="event-due-time" class="block text-sm font-medium mb-1">Deadline Time (Optional)</label><input type="time" id="event-due-time" name="dueTime" bind:value={eventDueTime} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 calendar-picker-dark' : 'border-gray-300 text-gray-800'}`} /></div></div> {#if eventFormActionError}<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded-md text-sm" role="alert">{eventFormActionError}</div>{/if} <div class={`flex flex-col sm:flex-row justify-end gap-3 mt-auto pt-4 border-t -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 px-4 py-3 sm:px-5 sm:py-3 rounded-b-lg flex-shrink-0 ${isDarkMode ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-50 border-gray-200'}`}><button type="button" class={`w-full sm:w-auto px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 ${isDarkMode ? 'bg-zinc-600 text-zinc-300 hover:bg-zinc-500 focus:ring-zinc-500' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400'}`} on:click={closeEventForm}>Cancel</button><button type="submit" class="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150">{editingEventId ? 'Update Event' : 'Add Event'}</button> </div> </form> </div> </div> {/if}
  
  <!-- Task Popover Component -->
  <TaskPopover
    isOpen={showTaskDetailsPopover}
    task={selectedTaskForDetails}
    x={popoverX}
    y={popoverY}
    on:close={closeTaskDetailsPopover}
  />

  <!-- Day Tasks Modal Component -->
  <DayTasksModal
    bind:isOpen={showDayTasksModal}
    tasks={selectedDayTasks}
    date={selectedDayDate}
    on:close={closeDayTasksModal}
    on:detailTask={(e) => {
      // closeDayTasksModal(); // Removed: Do not close the day tasks modal when opening task details
      openTaskDetailsPopover(e.detail.task.id, e.detail.event);
    }}
  />
</div>

<style>
  /* ... (existing styles - ensure the styles for .filter-button-icon are not needed or adapted for SVGs if they were for PNGs) ... */
  .font-sans { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  :global(body, html) { height: 100%; margin: 0; padding: 0; overflow: hidden; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
  ::-webkit-scrollbar-thumb { background: #c5c5c5; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
  .custom-scrollbar { scrollbar-width: thin; scrollbar-color: #c5c5c5 #f1f1f1; }
  :global(.dark) ::-webkit-scrollbar-track { background: #2d3748; }
  :global(.dark) ::-webkit-scrollbar-thumb { background: #4a5568; }
  :global(.dark) ::-webkit-scrollbar-thumb:hover { background: #718096; }
  :global(.dark) .custom-scrollbar { scrollbar-color: #4a5568 #2d3748; }

  .top-header { position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; justify-content: space-between; padding: 0 1rem; height: 60px; z-index: 40; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: background-color 0.2s, border-color 0.2s; }
  .header-left { display: flex; align-items: center; gap: 0.75rem; }
  .top-header .menu-btn { background: none; border: none; cursor: pointer; padding: 0.5rem; border-radius: 9999px; transition: background-color 0.15s ease; }
  /* Removed img specific styling, SVG will inherit color */
  .dark .top-header .menu-btn:hover { background-color: #374151; }
  
  .top-header .logo { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 1.125rem; text-decoration: none; }
  /* Removed img specific styling for logo */

  .top-header .header-icons { display: flex; align-items: center; gap: 0.25rem; }
  .top-header .header-icons button { background: none; border: none; cursor: pointer; padding: 0.5rem; line-height: 0; display: flex; align-items: center; justify-content: center; border-radius: 9999px; width: 36px; height: 36px; transition: background-color 0.15s ease; }
  .top-header .header-icons button:hover { background-color: #f3f4f6; } /* Light mode hover */
  .dark .top-header .header-icons button:hover { background-color: #374151; } /* Dark mode hover */
  /* Removed img specific styling for header icons */
  
  .relative { position: relative; }
  .dropdown-window { position: absolute; right: 0; top: calc(100% + 8px); border-radius: 0.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 0.75rem; width: 260px; z-index: 50; opacity: 0; transform: translateY(-5px) scale(0.98); transition: opacity 0.15s ease-out, transform 0.15s ease-out; pointer-events: none; visibility: hidden; }
  .dropdown-window:not(.hidden) { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; visibility: visible; }
  .hidden { display: none !important; }

  :global(.dark .bg-zinc-800) { background-color: #1f2937; }
  :global(.dark .border-zinc-700) { border-color: #374151; }
  :global(.dark .text-zinc-100) { color: #f3f4f6; }
  :global(.dark .text-zinc-300) { color: #d1d5db; }
  :global(.dark .text-zinc-400) { color: #9ca3af; }
  :global(.dark .text-zinc-500) { color: #6b7280; }
  :global(.dark .text-zinc-600) { color: #4b5563; }

  :global(.dark .bg-zinc-700) { background-color: #374151; }
  :global(.dark .border-zinc-600) { border-color: #4b5563; }
  :global(.dark .hover\:bg-zinc-700:hover) { background-color: #4b5563; }
  :global(.dark .hover\:bg-zinc-600:hover) { background-color: #4b5563; }
  :global(.dark .bg-zinc-600) { background-color: #4b5563; }
  :global(.dark .bg-zinc-500) { background-color: #6b7280; }
  :global(.dark .hover\:bg-zinc-500:hover) { background-color: #626f81; }


  :global(.dark .bg-zinc-850) { background-color: #1a202c; } /* Slightly darker for non-current month days */
  :global(.dark .border-zinc-750) { border-color: #2d3748; } /* Border for non-current month days */
  :global(.dark .bg-zinc-750) { background-color: #2d3748; } /* Bg for current month days in dark */

  :global(.dark .calendar-picker-dark::-webkit-calendar-picker-indicator) {
    filter: invert(0.8); /* Makes the date/time picker icon visible in dark mode */
  }

  /* This class was for PNGs, SVGs don't need it if fill="currentColor" and parent color is white */
  /* .filter-button-icon {
    filter: invert(1) brightness(100%); 
  } */

  /* Ensure SVGs in active sidebar links are white */
  :global(a.bg-blue-600 svg),
  :global(a.bg-blue-800 svg) {
    fill: white !important; /* For fill-based SVGs */
    stroke: white !important; /* For stroke-based SVGs if any are used this way */
  }
  /* If you still have any IMG tags for icons in active links that need to be white: */
  :global(a.bg-blue-600 img),
  :global(a.bg-blue-800 img) {
    filter: brightness(0) invert(1);
  }
</style>
