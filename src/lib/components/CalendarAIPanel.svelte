<script lang="ts">
  import { createEventDispatcher, tick, onMount, onDestroy } from 'svelte';
  import { scale, slide, fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { browser } from '$app/environment';

  export let isDarkMode = false;
  export let tasks: any[] = []; // Optional prop - fallback if fetch fails
  export let isOpen = false;

  const dispatch = createEventDispatcher();
  
  // Self-fetched tasks state
  let fetchedTasks: any[] = [];
  let isLoadingTasks = false;
  let tasksFetchError: string | null = null;
  let hasFetched = false;
  
  // Use fetched tasks if available, otherwise fall back to prop
  $: activeTasks = hasFetched && fetchedTasks.length > 0 ? fetchedTasks : tasks;
  
  // Fetch tasks when panel opens
  $: if (isOpen && browser && !hasFetched) {
    fetchAllTasks();
  }
  
  async function fetchAllTasks() {
    if (isLoadingTasks) return;
    
    isLoadingTasks = true;
    tasksFetchError = null;
    
    try {
      const response = await fetch('/api/tasks');
      const data = await response.json();
      
      if (data.success && data.tasks) {
        fetchedTasks = data.tasks;
        hasFetched = true;
        console.log(`[CalendarAIPanel] Fetched ${fetchedTasks.length} tasks`);
      } else {
        tasksFetchError = data.error || 'Failed to fetch tasks';
        // Fall back to prop tasks
        console.warn('[CalendarAIPanel] Using prop tasks as fallback');
      }
    } catch (error: any) {
      console.error('[CalendarAIPanel] Error fetching tasks:', error);
      tasksFetchError = error.message;
      // Fall back to prop tasks
    } finally {
      isLoadingTasks = false;
    }
  }
  
  // Refresh tasks (can be called after creating a task)
  async function refreshTasks() {
    hasFetched = false;
    await fetchAllTasks();
  }
  
  // Helper function to normalize tasks for the AI service
  // Maps various date field names to dueDateISO
  function normalizeTasksForAI(inputTasks: any[]): any[] {
    return inputTasks.map(task => ({
      ...task,
      // Ensure dueDateISO is set (check multiple possible field names)
      dueDateISO: task.dueDateISO || task.dueDate || task.eventDate || task.date || null,
      // Ensure title is set (use description as fallback)
      title: task.title || task.description || 'Untitled Task',
      // Ensure isCompleted is a boolean
      isCompleted: task.isCompleted === true || task.status === 'complete',
      // Ensure status field
      status: task.isCompleted === true || task.status === 'complete' ? 'complete' : 'pending'
    }));
  }

  // Chat state
  let chatInput = '';
  let isTyping = false;
  let activeTab: 'chat' | 'actions' = 'actions';
  let messagesContainer: HTMLDivElement;
  
  interface ChatMessage {
    id: number;
    text: string;
    isUser: boolean;
    isError: boolean;
  }

  interface APIMessage {
    role: 'user' | 'assistant';
    content: string;
  }
  
  let messages: ChatMessage[] = [];
  let messageIdCounter = 0;
  let conversationHistory: APIMessage[] = [];

  // Action results
  let workloadResult: any = null;
  let conflictResult: any = null;
  let dailyPlanResult: any = null;
  let priorityResult: any = null;
  let breakdownResult: any = null;
  let categoryResult: any = null;
  let isLoadingAction = false;
  let actionError: string | null = null;
  
  // Track the order of actions (most recent first)
  let actionOrder: ('dailyPlan' | 'workload' | 'conflict' | 'priority' | 'breakdown' | 'category')[] = [];

  // Task breakdown modal state
  let showBreakdownModal = false;
  let breakdownTaskTitle = '';
  let breakdownTaskDescription = '';
  let breakdownTaskDueDate = ''; // Original task's due date to respect
  let isBreakingDown = false;
  let breakdownSubtasks: {title: string, description: string}[] = [];
  
  // Task picker modal state
  let showTaskPickerModal = false;
  let taskPickerSearch = '';

  // Workspace creation prompt state
  let showWorkspaceNamePrompt = false;
  let workspaceName = '';
  let isCreatingWorkspace = false;

  // AI Tips for speech bubble
  const aiTips = [
    "👋 Click me to help with your tasks!",
    "✨ I can plan your day for you!",
    "📊 Let me analyze your workload!",
    "🎯 I'll help prioritize your tasks!",
    "⚡ Break down big tasks with AI!",
    "🔍 Find schedule conflicts easily!",
    "💡 Need help? I'm here for you!"
  ];
  let currentTipIndex = 0;
  let showTipBubble = false;
  let tipInterval: ReturnType<typeof setInterval> | null = null;

  // Show tip bubble intermittently when panel is closed
  $: if (!isOpen && browser) {
    if (!tipInterval) {
      // Show first tip after 2 seconds
      setTimeout(() => {
        if (!isOpen) {
          showTipBubble = true;
          // Hide after 4 seconds
          setTimeout(() => { showTipBubble = false; }, 4000);
        }
      }, 2000);
      
      // Then show tips every 10 seconds
      tipInterval = setInterval(() => {
        if (!isOpen) {
          currentTipIndex = (currentTipIndex + 1) % aiTips.length;
          showTipBubble = true;
          // Hide after 4 seconds
          setTimeout(() => { showTipBubble = false; }, 4000);
        }
      }, 10000);
    }
  } else if (tipInterval) {
    clearInterval(tipInterval);
    tipInterval = null;
    showTipBubble = false;
  }

  onDestroy(() => {
    if (tipInterval) clearInterval(tipInterval);
  });

  // Natural language task input
  let nlTaskInput = '';
  let parsedTask: any = null;
  let isParsingTask = false;

  // Drag and resize state
  let panelX = 0;
  let panelY = 0;
  let panelWidth = 340;
  let panelHeight = 450;
  let isDragging = false;
  let isResizing = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeStartWidth = 0;
  let resizeStartHeight = 0;

  // Initialize position on mount
  onMount(() => {
    if (browser) {
      panelX = window.innerWidth - panelWidth - 24;
      panelY = window.innerHeight - panelHeight - 24;
    }
  });

  // Drag handlers
  function startDrag(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    isDragging = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    dragStartX = clientX - panelX;
    dragStartY = clientY - panelY;
    
    if (browser) {
      window.addEventListener('mousemove', onDrag);
      window.addEventListener('mouseup', stopDrag);
      window.addEventListener('touchmove', onDrag);
      window.addEventListener('touchend', stopDrag);
    }
  }

  function onDrag(e: MouseEvent | TouchEvent) {
    if (!isDragging) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    let newX = clientX - dragStartX;
    let newY = clientY - dragStartY;
    
    // Constrain to viewport
    if (browser) {
      newX = Math.max(0, Math.min(newX, window.innerWidth - panelWidth));
      newY = Math.max(0, Math.min(newY, window.innerHeight - panelHeight));
    }
    
    panelX = newX;
    panelY = newY;
  }

  function stopDrag() {
    isDragging = false;
    if (browser) {
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('touchmove', onDrag);
      window.removeEventListener('touchend', stopDrag);
    }
  }

  // Resize handlers
  function startResize(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    resizeStartX = clientX;
    resizeStartY = clientY;
    resizeStartWidth = panelWidth;
    resizeStartHeight = panelHeight;
    
    if (browser) {
      window.addEventListener('mousemove', onResize);
      window.addEventListener('mouseup', stopResize);
      window.addEventListener('touchmove', onResize);
      window.addEventListener('touchend', stopResize);
    }
  }

  function onResize(e: MouseEvent | TouchEvent) {
    if (!isResizing) return;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    // Resize from bottom-left corner (width increases left, height increases down)
    const deltaX = resizeStartX - clientX;
    const deltaY = clientY - resizeStartY;
    
    let newWidth = Math.max(280, Math.min(600, resizeStartWidth + deltaX));
    let newHeight = Math.max(300, Math.min(800, resizeStartHeight + deltaY));
    
    // Adjust X position when width changes
    panelX = panelX - (newWidth - panelWidth);
    
    panelWidth = newWidth;
    panelHeight = newHeight;
  }

  function stopResize() {
    isResizing = false;
    if (browser) {
      window.removeEventListener('mousemove', onResize);
      window.removeEventListener('mouseup', stopResize);
      window.removeEventListener('touchmove', onResize);
      window.removeEventListener('touchend', stopResize);
    }
  }

  // Cleanup on destroy
  onDestroy(() => {
    if (browser) {
      window.removeEventListener('mousemove', onDrag);
      window.removeEventListener('mouseup', stopDrag);
      window.removeEventListener('mousemove', onResize);
      window.removeEventListener('mouseup', stopResize);
    }
  });

  function togglePanel() {
    isOpen = !isOpen;
    if (isOpen && browser) {
      // Reset position when opening
      panelX = window.innerWidth - panelWidth - 24;
      panelY = window.innerHeight - panelHeight - 24;
    }
    dispatch('toggle', { isOpen });
  }

  function closePanel() {
    isOpen = false;
    dispatch('close');
  }

  async function sendMessage() {
    if (!browser || !chatInput.trim() || isTyping) return;

    const userMsgText = chatInput.trim();
    chatInput = '';

    messages = [...messages, {
      id: messageIdCounter++,
      text: userMsgText,
      isUser: true,
      isError: false
    }];

    conversationHistory.push({ role: 'user', content: userMsgText });

    await tick();
    scrollToBottom();

    isTyping = true;

    try {
      const response = await fetch("/api/calendar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'chat',
          payload: {
            message: userMsgText,
            tasks: tasks,
            conversationHistory: conversationHistory.slice(-8)
          }
        })
      });

      const responseData = await response.json();
      const aiReply = responseData?.data?.reply || "I couldn't get a response. Please try again.";
      const hasError = !responseData?.success;

      conversationHistory.push({ role: 'assistant', content: aiReply });

      // Format reply with basic markdown
      let formattedText = aiReply
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');

      messages = [...messages, {
        id: messageIdCounter++,
        text: formattedText,
        isUser: false,
        isError: hasError
      }];

    } catch (error) {
      console.error("[Calendar AI Panel] Chat error:", error);
      messages = [...messages, {
        id: messageIdCounter++,
        text: "Oops! Something went wrong. Please try again.",
        isUser: false,
        isError: true
      }];
    } finally {
      isTyping = false;
      await tick();
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function handleKeypress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  // Quick Actions
  async function analyzeDailyPlan() {
    isLoadingAction = true;
    actionError = null;
    dailyPlanResult = null;

    try {
      // Use local date, not UTC (toISOString returns UTC which may be off by a day)
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const response = await fetch("/api/calendar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'daily-plan',
          payload: { tasks: normalizeTasksForAI(activeTasks), targetDate: today }
        })
      });

      const data = await response.json();
      if (data.success && data.data) {
        dailyPlanResult = data.data;
        // Move this action to the front of the order
        actionOrder = ['dailyPlan', ...actionOrder.filter(a => a !== 'dailyPlan')];
      } else {
        actionError = data.error || 'Failed to generate daily plan';
      }
    } catch (error: any) {
      actionError = error.message || 'An error occurred';
    } finally {
      isLoadingAction = false;
    }
  }

  async function analyzeWorkload() {
    isLoadingAction = true;
    actionError = null;
    workloadResult = null;

    try {
      const today = new Date();
      const endDate = new Date(today);
      endDate.setDate(today.getDate() + 7);

      const response = await fetch("/api/calendar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'analyze-workload',
          payload: {
            tasks: normalizeTasksForAI(activeTasks),
            dateRange: {
              start: today.toISOString().split('T')[0],
              end: endDate.toISOString().split('T')[0]
            }
          }
        })
      });

      const data = await response.json();
      if (data.success && data.data) {
        workloadResult = data.data;
        // Move this action to the front of the order
        actionOrder = ['workload', ...actionOrder.filter(a => a !== 'workload')];
      } else {
        actionError = data.error || 'Failed to analyze workload';
      }
    } catch (error: any) {
      actionError = error.message || 'An error occurred';
    } finally {
      isLoadingAction = false;
    }
  }

  async function detectConflicts() {
    isLoadingAction = true;
    actionError = null;
    conflictResult = null;

    try {
      const response = await fetch("/api/calendar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'detect-conflicts',
          payload: { tasks: normalizeTasksForAI(activeTasks) }
        })
      });

      const data = await response.json();
      if (data.success && data.data) {
        conflictResult = data.data;
        // Move this action to the front of the order
        actionOrder = ['conflict', ...actionOrder.filter(a => a !== 'conflict')];
      } else {
        actionError = data.error || 'Failed to detect conflicts';
      }
    } catch (error: any) {
      actionError = error.message || 'An error occurred';
    } finally {
      isLoadingAction = false;
    }
  }

  async function analyzePriorities() {
    isLoadingAction = true;
    actionError = null;
    priorityResult = null;

    try {
      const response = await fetch("/api/calendar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'suggest-priorities',
          payload: { tasks: normalizeTasksForAI(activeTasks) }
        })
      });

      const data = await response.json();
      if (data.success && data.data) {
        priorityResult = data.data;
        // Move this action to the front of the order
        actionOrder = ['priority', ...actionOrder.filter(a => a !== 'priority')];
      } else {
        actionError = data.error || 'Failed to analyze priorities';
      }
    } catch (error: any) {
      actionError = error.message || 'An error occurred';
    } finally {
      isLoadingAction = false;
    }
  }

  async function analyzeCategories() {
    isLoadingAction = true;
    actionError = null;
    categoryResult = null;

    try {
      const response = await fetch("/api/calendar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'suggest-categories',
          payload: { tasks: normalizeTasksForAI(activeTasks) }
        })
      });

      const data = await response.json();
      if (data.success && data.data) {
        categoryResult = data.data;
        // Move this action to the front of the order
        actionOrder = ['category', ...actionOrder.filter(a => a !== 'category')];
      } else {
        actionError = data.error || 'Failed to analyze categories';
      }
    } catch (error: any) {
      actionError = error.message || 'An error occurred';
    } finally {
      isLoadingAction = false;
    }
  }

  function openBreakdownModal() {
    showBreakdownModal = true;
    breakdownTaskTitle = '';
    breakdownTaskDescription = '';
    breakdownTaskDueDate = '';
    breakdownSubtasks = [];
    isBreakingDown = false;
  }

  function closeBreakdownModal() {
    showBreakdownModal = false;
    breakdownTaskTitle = '';
    breakdownTaskDescription = '';
    breakdownSubtasks = [];
  }

  async function breakdownTaskWithAI() {
    if (!breakdownTaskTitle.trim()) return;
    
    isBreakingDown = true;
    breakdownSubtasks = [];

    try {
      const response = await fetch("/api/calendar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'breakdown-task',
          payload: {
            title: breakdownTaskTitle,
            description: breakdownTaskDescription
          }
        })
      });

      const data = await response.json();
      if (data.success && data.data?.subtasks) {
        breakdownSubtasks = data.data.subtasks;
      } else {
        actionError = data.error || 'Failed to break down task';
      }
    } catch (error: any) {
      actionError = error.message || 'An error occurred';
    } finally {
      isBreakingDown = false;
    }
  }

  function createSubtask(subtask: {title: string, description: string}) {
    dispatch('createTask', {
      title: subtask.title,
      description: subtask.description,
      dueDate: new Date().toISOString().split('T')[0],
      priority: 'standard'
    });
  }

  function createAllSubtasks() {
    // Show workspace name prompt instead of creating tasks directly
    workspaceName = breakdownTaskTitle; // Pre-fill with task title
    showWorkspaceNamePrompt = true;
  }

  async function createWorkspaceWithSubtasks(useAutoName: boolean = false) {
    const finalName = useAutoName ? breakdownTaskTitle : workspaceName.trim();
    if (!finalName) return;

    isCreatingWorkspace = true;
    
    try {
      // Create the workspace
      const wsResponse = await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: finalName })
      });
      
      const wsData = await wsResponse.json();
      if (!wsData.success || !wsData.workspaceId) {
        actionError = wsData.error || 'Failed to create workspace';
        isCreatingWorkspace = false;
        return;
      }
      
      const workspaceId = wsData.workspaceId;
      
      // Calculate due dates - distribute evenly from today to the deadline
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let deadlineDate: Date;
      if (breakdownTaskDueDate) {
        // Use the original task's deadline
        deadlineDate = new Date(breakdownTaskDueDate);
        deadlineDate.setHours(23, 59, 59, 999);
        
        // If deadline is in the past or today, spread subtasks over the next few days from today
        if (deadlineDate <= today) {
          // Deadline already passed, give each subtask 1 day starting from today
          const numSubtasks = breakdownSubtasks.length;
          deadlineDate = new Date(today.getTime() + Math.max(numSubtasks, 3) * 24 * 60 * 60 * 1000);
        }
      } else {
        // Default: 7 days from now if no deadline set
        deadlineDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
      
      const totalDays = Math.max(1, Math.floor((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
      const numSubtasks = breakdownSubtasks.length;
      
      // Create all subtasks in the new workspace
      const taskPromises = breakdownSubtasks.map((subtask, index) => {
        // Spread subtasks evenly, with last one due on or before deadline
        const daysOffset = numSubtasks > 1 
          ? Math.floor((index / (numSubtasks - 1)) * totalDays)
          : 0;
        const subtaskDueDate = new Date(today.getTime() + daysOffset * 24 * 60 * 60 * 1000);
        
        return fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: subtask.title,
            description: subtask.description,
            boardId: workspaceId,
            priority: 'standard',
            dueDate: subtaskDueDate.toISOString().split('T')[0]
          })
        });
      });
      
      await Promise.all(taskPromises);
      
      // Close modals and redirect to new workspace
      showWorkspaceNamePrompt = false;
      closeBreakdownModal();
      
      // Redirect to the new workspace
      if (browser) {
        window.location.href = `/workspace/${workspaceId}`;
      }
    } catch (error: any) {
      actionError = error.message || 'Failed to create workspace';
    } finally {
      isCreatingWorkspace = false;
    }
  }

  async function parseNaturalLanguageTask() {
    if (!nlTaskInput.trim()) return;
    
    isParsingTask = true;
    parsedTask = null;

    try {
      const response = await fetch("/api/calendar-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: 'parse-task',
          payload: {
            userInput: nlTaskInput,
            currentDate: new Date().toISOString().split('T')[0]
          }
        })
      });

      const data = await response.json();
      if (data.success && data.data) {
        parsedTask = data.data;
      } else {
        actionError = data.error || 'Failed to parse task';
      }
    } catch (error: any) {
      actionError = error.message || 'An error occurred';
    } finally {
      isParsingTask = false;
    }
  }

  function createTaskFromParsed() {
    if (!parsedTask) return;
    dispatch('createTask', parsedTask);
    nlTaskInput = '';
    parsedTask = null;
  }

  function clearResults() {
    workloadResult = null;
    conflictResult = null;
    dailyPlanResult = null;
    priorityResult = null;
    categoryResult = null;
    actionError = null;
    parsedTask = null;
    actionOrder = [];
  }
</script>

<!-- Floating AI Button with Speech Bubble -->
{#if !isOpen}
  <div class="fixed bottom-10 right-16 z-50">
    <!-- Speech Bubble (positioned above) -->
    {#if showTipBubble}
      <div 
        class={`absolute bottom-full right-0 mb-3 px-3 py-2 rounded-xl text-sm font-medium shadow-lg whitespace-nowrap
          ${isDarkMode ? 'bg-zinc-700 text-zinc-100' : 'bg-white text-gray-700 border border-gray-200'}`}
        transition:scale={{ duration: 200, easing: quintOut }}
      >
        <span class="block">{aiTips[currentTipIndex]}</span>
        <!-- Speech bubble arrow pointing down -->
        <div 
          class={`absolute top-full right-6 w-0 h-0 border-l-8 border-l-transparent border-r-8 border-r-transparent
            ${isDarkMode ? 'border-t-8 border-t-zinc-700' : 'border-t-8 border-t-white'}`}
        ></div>
      </div>
    {/if}
    <!-- AI Button -->
    <button
      class="w-16 h-16 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 bg-purple-600 hover:bg-purple-700"
      on:click={togglePanel}
      aria-label="Open AI Assistant"
    >
      <img src="/Ai.png" alt="Ask Synthia AI" class="w-9 h-9" />
    </button>
  </div>
{/if}

<!-- AI Panel -->
{#if isOpen}
  <div
    class={`fixed z-50 rounded-xl shadow-2xl flex flex-col overflow-hidden select-none
      ${isDarkMode ? 'bg-zinc-800' : 'bg-white border border-gray-200'}
      ${isDragging || isResizing ? '' : 'transition-shadow'}`}
    style="left: {panelX}px; top: {panelY}px; width: {panelWidth}px; height: {panelHeight}px;"
    transition:fly={{ y: 20, duration: 250, easing: quintOut }}
  >
    <!-- Resize Handle (bottom-left corner) -->
    <div
      class={`absolute bottom-0 left-0 w-4 h-4 cursor-sw-resize z-10 ${isDarkMode ? 'hover:bg-zinc-700/50' : 'hover:bg-gray-200/50'}`}
      on:mousedown={startResize}
      on:touchstart={startResize}
    >
      <svg class="w-4 h-4 text-gray-400 rotate-90" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
      </svg>
    </div>

    <!-- Header - Draggable -->
    <div 
      class={`flex items-center justify-between px-4 py-3 border-b flex-shrink-0 cursor-grab active:cursor-grabbing
        ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}
      on:mousedown={startDrag}
      on:touchstart={startDrag}
    >
      <div class="pointer-events-none">
        <h3 class={`font-semibold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Ask Synthia</h3>
        <p class={`text-xs ${isDarkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
          {#if isLoadingTasks}
            Loading tasks...
          {:else}
            {activeTasks.length} tasks loaded
          {/if}
        </p>
      </div>
      <button
        class={`p-1 rounded-md transition-colors pointer-events-auto ${isDarkMode ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
        on:click|stopPropagation={closePanel}
        aria-label="Close AI Panel"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Tabs -->
    <div class={`flex border-b flex-shrink-0 ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}>
      <button
        class={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors
          ${activeTab === 'actions' 
            ? (isDarkMode ? 'text-blue-400 border-b-2 border-blue-400 bg-zinc-750' : 'text-blue-600 border-b-2 border-blue-600 bg-blue-50') 
            : (isDarkMode ? 'text-zinc-400 hover:text-zinc-300' : 'text-gray-500 hover:text-gray-700')}`}
        on:click={() => { activeTab = 'actions'; clearResults(); }}
      >
        Quick Actions
      </button>
      <button
        class={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors
          ${activeTab === 'chat' 
            ? (isDarkMode ? 'text-blue-400 border-b-2 border-blue-400 bg-zinc-750' : 'text-blue-600 border-b-2 border-blue-600 bg-blue-50') 
            : (isDarkMode ? 'text-zinc-400 hover:text-zinc-300' : 'text-gray-500 hover:text-gray-700')}`}
        on:click={() => activeTab = 'chat'}
      >
        Chat
      </button>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-hidden flex flex-col">
      {#if activeTab === 'actions'}
        <div class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {#if actionError}
            <div class="p-3 rounded-lg bg-red-100 text-red-700 text-sm" transition:slide={{ duration: 200 }}>
              {actionError}
            </div>
          {/if}

          <!-- Quick Action Buttons -->
          <div class="grid grid-cols-2 gap-2">
            <button
              class={`p-3 rounded-lg text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                ${isDarkMode ? 'bg-zinc-700 hover:bg-zinc-650 text-zinc-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              on:click={analyzeDailyPlan}
              disabled={isLoadingAction}
            >
              <div class="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-blue-500">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clip-rule="evenodd" />
                </svg>
                <span class="text-xs font-semibold">Plan My Day</span>
              </div>
              <p class={`text-[10px] ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Get a prioritized agenda</p>
            </button>

            <button
              class={`p-3 rounded-lg text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                ${isDarkMode ? 'bg-zinc-700 hover:bg-zinc-650 text-zinc-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              on:click={analyzeWorkload}
              disabled={isLoadingAction}
            >
              <div class="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-amber-500">
                  <path d="M15.5 2A1.5 1.5 0 0014 3.5v13a1.5 1.5 0 001.5 1.5h1a1.5 1.5 0 001.5-1.5v-13A1.5 1.5 0 0016.5 2h-1zM9.5 6A1.5 1.5 0 008 7.5v9A1.5 1.5 0 009.5 18h1a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0010.5 6h-1zM3.5 10A1.5 1.5 0 002 11.5v5A1.5 1.5 0 003.5 18h1A1.5 1.5 0 006 16.5v-5A1.5 1.5 0 004.5 10h-1z" />
                </svg>
                <span class="text-xs font-semibold">Workload</span>
              </div>
              <p class={`text-[10px] ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Check for overloaded days</p>
            </button>

            <button
              class={`p-3 rounded-lg text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                ${isDarkMode ? 'bg-zinc-700 hover:bg-zinc-650 text-zinc-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              on:click={detectConflicts}
              disabled={isLoadingAction}
            >
              <div class="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-red-500">
                  <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
                </svg>
                <span class="text-xs font-semibold">Conflicts</span>
              </div>
              <p class={`text-[10px] ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Find scheduling issues</p>
            </button>

            <button
              class={`p-3 rounded-lg text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                ${isDarkMode ? 'bg-zinc-700 hover:bg-zinc-650 text-zinc-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              on:click={analyzePriorities}
              disabled={isLoadingAction}
            >
              <div class="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-purple-500">
                  <path fill-rule="evenodd" d="M10 2a.75.75 0 01.75.75v.258a33.186 33.186 0 016.668.83.75.75 0 01-.336 1.461 31.28 31.28 0 00-1.103-.232l1.702 7.545a.75.75 0 01-.387.832A4.981 4.981 0 0115 14c-.825 0-1.606-.2-2.294-.556a.75.75 0 01-.387-.832l1.77-7.849a31.743 31.743 0 00-3.339-.254v11.505l6.06 1.01a.75.75 0 11-.244 1.48l-6.666-1.11-6.666 1.11a.75.75 0 11-.244-1.48l6.06-1.01V4.509a31.743 31.743 0 00-3.339.254l1.77 7.849a.75.75 0 01-.387.832A4.981 4.981 0 015 14c-.825 0-1.606-.2-2.294-.556a.75.75 0 01-.387-.832L4.02 5.067c-.37.07-.738.148-1.103.232a.75.75 0 01-.336-1.462 33.186 33.186 0 016.668-.829V2.75A.75.75 0 0110 2z" clip-rule="evenodd" />
                </svg>
                <span class="text-xs font-semibold">Priorities</span>
              </div>
              <p class={`text-[10px] ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>AI priority suggestions</p>
            </button>

            <button
              class={`p-3 rounded-lg text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                ${isDarkMode ? 'bg-zinc-700 hover:bg-zinc-650 text-zinc-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              on:click={openBreakdownModal}
            >
              <div class="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-green-500">
                  <path fill-rule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clip-rule="evenodd" />
                  <path fill-rule="evenodd" d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z" clip-rule="evenodd" />
                </svg>
                <span class="text-xs font-semibold">Breakdown</span>
              </div>
              <p class={`text-[10px] ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Split task into subtasks</p>
            </button>

            <button
              class={`p-3 rounded-lg text-left transition-all hover:scale-[1.02] active:scale-[0.98]
                ${isDarkMode ? 'bg-zinc-700 hover:bg-zinc-650 text-zinc-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
              on:click={analyzeCategories}
              disabled={isLoadingAction}
            >
              <div class="flex items-center gap-2 mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 text-teal-500">
                  <path fill-rule="evenodd" d="M5.5 3A2.5 2.5 0 003 5.5v2.879a2.5 2.5 0 00.732 1.767l6.5 6.5a2.5 2.5 0 003.536 0l2.878-2.878a2.5 2.5 0 000-3.536l-6.5-6.5A2.5 2.5 0 008.38 3H5.5zM6 7a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
                </svg>
                <span class="text-xs font-semibold">Categories</span>
              </div>
              <p class={`text-[10px] ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>AI tag suggestions</p>
            </button>
          </div>

          <!-- Natural Language Task Input -->
          <div class={`rounded-lg p-3 ${isDarkMode ? 'bg-zinc-700/50' : 'bg-blue-50'}`}>
            <label class={`block text-xs font-medium mb-2 ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>
              ✨ Add Task with AI
            </label>
            <div class="flex gap-2">
              <input
                type="text"
                placeholder="e.g., Meeting tomorrow at 3pm"
                bind:value={nlTaskInput}
                on:keypress={(e) => e.key === 'Enter' && parseNaturalLanguageTask()}
                class={`flex-1 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500
                  ${isDarkMode ? 'bg-zinc-800 border-zinc-600 text-zinc-200 placeholder-zinc-500' : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'}`}
              />
              <button
                class={`px-3 py-2 rounded-lg text-white text-sm font-medium transition-colors
                  ${isParsingTask ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                on:click={parseNaturalLanguageTask}
                disabled={isParsingTask || !nlTaskInput.trim()}
              >
                {isParsingTask ? '...' : 'Parse'}
              </button>
            </div>

            {#if parsedTask}
              <div class={`mt-3 p-3 rounded-lg text-sm ${isDarkMode ? 'bg-zinc-800' : 'bg-white'}`} transition:slide={{ duration: 200 }}>
                <p class={`font-medium mb-3 ${isDarkMode ? 'text-zinc-200' : 'text-gray-700'}`}>✏️ Edit & Create Task:</p>
                <div class="space-y-2">
                  <!-- Title -->
                  <div>
                    <label class={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>Title</label>
                    <input
                      type="text"
                      bind:value={parsedTask.title}
                      class={`w-full px-2 py-1.5 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-blue-500
                        ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-200' : 'bg-gray-50 border-gray-300 text-gray-800'}`}
                    />
                  </div>
                  <!-- Date & Time Row -->
                  <div class="grid grid-cols-2 gap-2">
                    <div>
                      <label class={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>Date</label>
                      <input
                        type="date"
                        bind:value={parsedTask.dueDate}
                        class={`w-full px-2 py-1.5 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-blue-500
                          ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-200' : 'bg-gray-50 border-gray-300 text-gray-800'}`}
                      />
                    </div>
                    <div>
                      <label class={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>Time</label>
                      <input
                        type="time"
                        bind:value={parsedTask.dueTime}
                        class={`w-full px-2 py-1.5 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-blue-500
                          ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-200' : 'bg-gray-50 border-gray-300 text-gray-800'}`}
                      />
                    </div>
                  </div>
                  <!-- Priority -->
                  <div>
                    <label class={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>Priority</label>
                    <select
                      bind:value={parsedTask.priority}
                      class={`w-full px-2 py-1.5 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-blue-500
                        ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-200' : 'bg-gray-50 border-gray-300 text-gray-800'}`}
                    >
                      <option value="low">Low</option>
                      <option value="standard">Standard</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                  <!-- Description (optional) -->
                  <div>
                    <label class={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>Description (optional)</label>
                    <textarea
                      bind:value={parsedTask.description}
                      rows="2"
                      class={`w-full px-2 py-1.5 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none
                        ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-200 placeholder-zinc-500' : 'bg-gray-50 border-gray-300 text-gray-800 placeholder-gray-400'}`}
                      placeholder="Add details..."
                    ></textarea>
                  </div>
                </div>
                <div class="flex gap-2 mt-3">
                  <button
                    class={`flex-1 px-3 py-2 text-xs rounded-lg font-medium transition-colors
                      ${isDarkMode ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                    on:click={() => parsedTask = null}
                  >
                    Cancel
                  </button>
                  <button
                    class="flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-xs rounded-lg font-medium transition-colors"
                    on:click={createTaskFromParsed}
                  >
                    Create Task
                  </button>
                </div>
              </div>
            {/if}
          </div>

          <!-- Loading State (at bottom) -->
          {#if isLoadingAction}
            <div class="flex items-center justify-center py-4 mt-3">
              <svg class="animate-spin h-6 w-6 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span class={`ml-2 text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Analyzing...</span>
            </div>
          {/if}

          <!-- AI Results Section (at bottom, most recent first) -->
          {#if dailyPlanResult || workloadResult || conflictResult || priorityResult || categoryResult}
            <div class="space-y-3 mt-3">
              {#each actionOrder as actionType}
                {#if actionType === 'dailyPlan' && dailyPlanResult}
                  <div class={`rounded-lg p-3 ${isDarkMode ? 'bg-zinc-700' : 'bg-green-50'}`} transition:slide={{ duration: 200 }}>
                    <h4 class={`font-semibold text-sm mb-2 ${isDarkMode ? 'text-zinc-200' : 'text-gray-700'}`}>📋 Your Daily Plan</h4>
                    <p class={`text-xs mb-3 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>{dailyPlanResult.summary}</p>
                    {#if dailyPlanResult.prioritizedTasks?.length > 0}
                      <ul class="space-y-2">
                        {#each dailyPlanResult.prioritizedTasks as task, i}
                          {@const fullTask = activeTasks.find(t => t.id === task.taskId)}
                          <li 
                            class={`text-xs p-2 rounded cursor-pointer transition-colors ${isDarkMode ? 'bg-zinc-800 hover:bg-zinc-750' : 'bg-white hover:bg-gray-50'}`}
                            on:click={() => dispatch('selectTask', { taskId: task.taskId, title: task.title, task: fullTask })}
                            on:keypress={(e) => e.key === 'Enter' && dispatch('selectTask', { taskId: task.taskId, title: task.title, task: fullTask })}
                            role="button"
                            tabindex="0"
                          >
                            <span class="font-medium">{i + 1}. {task.title}</span>
                            {#if task.suggestedTimeSlot}
                              <span class={`block mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>⏰ {task.suggestedTimeSlot}</span>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>No tasks scheduled for today.</p>
                    {/if}
                    {#if dailyPlanResult.focusTip}
                      <p class={`mt-3 text-xs italic ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>💡 {dailyPlanResult.focusTip}</p>
                    {/if}
                    {#if dailyPlanResult.overdueNote}
                      <p class={`mt-3 text-xs p-2 rounded ${isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
                        {dailyPlanResult.overdueNote}
                      </p>
                    {/if}
                  </div>
                {/if}

                {#if actionType === 'workload' && workloadResult}
                  <div class={`rounded-lg p-3 ${isDarkMode ? 'bg-zinc-700' : 'bg-amber-50'}`} transition:slide={{ duration: 200 }}>
                    <h4 class={`font-semibold text-sm mb-2 ${isDarkMode ? 'text-zinc-200' : 'text-gray-700'}`}>📊 Workload Analysis</h4>
                    <p class={`text-xs mb-3 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>{workloadResult.summary}</p>
                    {#if workloadResult.overloadedDays?.length > 0}
                      <div class="mb-2">
                        <span class="text-xs font-medium text-amber-600">⚠️ Heavy Days:</span>
                        <ul class={`mt-1 text-xs ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>
                          {#each workloadResult.overloadedDays as day}
                            <li>• {day.date}: {day.taskCount} tasks</li>
                          {/each}
                        </ul>
                      </div>
                    {/if}
                    {#if workloadResult.suggestions?.length > 0}
                      <div class="mt-2">
                        <span class={`text-xs font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>Suggestions:</span>
                        <ul class={`mt-1 text-xs ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>
                          {#each workloadResult.suggestions as suggestion}
                            <li>• {suggestion}</li>
                          {/each}
                        </ul>
                      </div>
                    {/if}
                  </div>
                {/if}

                {#if actionType === 'conflict' && conflictResult}
                  <div class={`rounded-lg p-3 ${conflictResult.hasConflicts ? (isDarkMode ? 'bg-red-900/30' : 'bg-red-50') : (isDarkMode ? 'bg-green-900/30' : 'bg-green-50')}`} transition:slide={{ duration: 200 }}>
                    <h4 class={`font-semibold text-sm mb-2 ${isDarkMode ? 'text-zinc-200' : 'text-gray-700'}`}>
                      {conflictResult.hasConflicts ? '⚠️ Conflicts Found' : '✅ No Conflicts'}
                    </h4>
                    {#if conflictResult.hasConflicts && conflictResult.conflicts?.length > 0}
                      <ul class="space-y-2">
                        {#each conflictResult.conflicts as conflict}
                          <li class={`text-xs p-2 rounded ${isDarkMode ? 'bg-zinc-800' : 'bg-white'}`}>
                            <p class="font-medium text-red-600">{conflict.description}</p>
                            <p class={`mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>💡 {conflict.suggestion}</p>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>Your schedule looks good! No conflicts detected.</p>
                    {/if}
                  </div>
                {/if}

                {#if actionType === 'priority' && priorityResult}
                  <div class={`rounded-lg p-3 ${isDarkMode ? 'bg-zinc-700' : 'bg-purple-50'}`} transition:slide={{ duration: 200 }}>
                    <h4 class={`font-semibold text-sm mb-2 ${isDarkMode ? 'text-zinc-200' : 'text-gray-700'}`}>⚖️ Priority Suggestions</h4>
                    <p class={`text-xs mb-3 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>{priorityResult.summary}</p>
                    {#if priorityResult.suggestions?.length > 0}
                      <ul class="space-y-2">
                        {#each priorityResult.suggestions as sug}
                          <li class={`text-xs p-2 rounded ${isDarkMode ? 'bg-zinc-800' : 'bg-white'}`}>
                            <div class="flex items-center justify-between mb-1">
                              <span class="font-medium">{sug.taskTitle}</span>
                              <span class={`px-2 py-0.5 rounded text-[10px] font-semibold
                                ${sug.suggestedPriority === 'urgent' ? 'bg-red-600 text-white' : 
                                  sug.suggestedPriority === 'high' ? 'bg-orange-500 text-white' : 
                                  sug.suggestedPriority === 'standard' ? (isDarkMode ? 'bg-zinc-600 text-zinc-200' : 'bg-gray-200 text-gray-700') :
                                  (isDarkMode ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-100 text-gray-500')}`}>
                                {sug.suggestedPriority?.toUpperCase()}
                              </span>
                            </div>
                            <p class={`${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>{sug.reason}</p>
                            {#if sug.currentPriority && sug.currentPriority !== sug.suggestedPriority}
                              <p class={`mt-1 text-[10px] ${isDarkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
                                Current: {sug.currentPriority} → Suggested: {sug.suggestedPriority}
                              </p>
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>No priority changes suggested.</p>
                    {/if}
                  </div>
                {/if}

                {#if actionType === 'category' && categoryResult}
                  <div class={`rounded-lg p-3 ${isDarkMode ? 'bg-zinc-700' : 'bg-teal-50'}`} transition:slide={{ duration: 200 }}>
                    <h4 class={`font-semibold text-sm mb-2 ${isDarkMode ? 'text-zinc-200' : 'text-gray-700'}`}>🏷️ Category Suggestions</h4>
                    <p class={`text-xs mb-3 ${isDarkMode ? 'text-zinc-400' : 'text-gray-600'}`}>{categoryResult.summary}</p>
                    {#if categoryResult.suggestions?.length > 0}
                      <ul class="space-y-2">
                        {#each categoryResult.suggestions as sug}
                          <li class={`text-xs p-2 rounded ${isDarkMode ? 'bg-zinc-800' : 'bg-white'}`}>
                            <div class="flex items-center justify-between mb-1">
                              <span class="font-medium">{sug.taskTitle}</span>
                              <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-500 text-white">
                                {sug.suggestedCategory}
                              </span>
                            </div>
                            {#if sug.suggestedTags?.length > 0}
                              <div class="flex flex-wrap gap-1 mt-1">
                                {#each sug.suggestedTags as tag}
                                  <span class={`px-1.5 py-0.5 rounded text-[9px] ${isDarkMode ? 'bg-zinc-700 text-zinc-300' : 'bg-gray-100 text-gray-600'}`}>
                                    #{tag}
                                  </span>
                                {/each}
                              </div>
                            {/if}
                            <p class={`mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>{sug.reason}</p>
                          </li>
                        {/each}
                      </ul>
                    {:else}
                      <p class={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>No category suggestions available.</p>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>

      {:else}
        <!-- Chat Tab -->
        <div bind:this={messagesContainer} class="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
          {#if messages.length === 0}
            <div class={`flex flex-col items-center justify-center h-full py-12 ${isDarkMode ? 'text-zinc-400' : 'text-gray-400'}`}>
              <!-- Thumbs up icon like Ask Synthia -->
              <div class={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDarkMode ? 'bg-zinc-700' : 'bg-gray-100'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-8 h-8">
                  <path d="M7.493 18.75c-.425 0-.82-.236-.975-.632A7.48 7.48 0 016 15.375c0-1.75.599-3.358 1.602-4.634.151-.192.373-.309.6-.397.473-.183.89-.514 1.212-.924a9.042 9.042 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75 2.25 2.25 0 012.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H14.23c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23h-.777zM2.331 10.977a11.969 11.969 0 00-.831 4.398 12 12 0 00.52 3.507c.26.85 1.084 1.368 1.973 1.368H4.9c.445 0 .72-.498.523-.898a8.963 8.963 0 01-.924-3.977c0-1.708.476-3.305 1.302-4.666.245-.403-.028-.959-.5-.959H4.25c-.832 0-1.612.453-1.918 1.227z" />
                </svg>
              </div>
              <p class={`text-base font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-600'}`}>How can I help?</p>
            </div>
          {/if}

          {#each messages as message (message.id)}
            <div class={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
              <div class={`max-w-[85%] px-3 py-2 rounded-lg text-sm
                ${message.isUser 
                  ? (isDarkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                  : message.isError
                    ? (isDarkMode ? 'bg-amber-900/50 text-amber-200' : 'bg-amber-100 text-amber-800')
                    : (isDarkMode ? 'bg-zinc-700 text-zinc-200' : 'bg-gray-100 text-gray-800')
                }`}>
                {@html message.text}
              </div>
            </div>
          {/each}

          {#if isTyping}
            <div class="flex justify-start">
              <div class={`px-3 py-2 rounded-lg text-sm italic ${isDarkMode ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-100 text-gray-500'}`}>
                Synthia is typing...
              </div>
            </div>
          {/if}
        </div>

        <!-- Chat Input -->
        <div class={`p-3 flex-shrink-0 ${isDarkMode ? '' : 'border-t border-gray-200'}`}>
          <div class={`flex items-center gap-2 px-3 py-2 rounded-full ${isDarkMode ? 'bg-zinc-700' : 'bg-gray-100'}`}>
            <input
              type="text"
              placeholder="Ask anything..."
              bind:value={chatInput}
              on:keypress={handleKeypress}
              class={`flex-1 bg-transparent text-sm focus:outline-none
                ${isDarkMode ? 'text-zinc-200 placeholder-zinc-500' : 'text-gray-800 placeholder-gray-400'}`}
            />
            <button
              on:click={sendMessage}
              disabled={isTyping || !chatInput.trim()}
              class={`p-1.5 rounded-full transition-colors
                ${isTyping || !chatInput.trim() ? 'text-gray-400 cursor-not-allowed' : (isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700')}`}
              aria-label="Send message"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
                <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
              </svg>
            </button>
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<!-- Task Breakdown Modal -->
{#if showBreakdownModal}
  <div 
    class="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
    on:click|self={closeBreakdownModal}
    on:keypress={(e) => e.key === 'Escape' && closeBreakdownModal()}
    role="dialog"
    aria-modal="true"
  >
    <div class={`w-full max-w-md rounded-xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-zinc-800' : 'bg-white'}`}>
      <!-- Modal Header -->
      <div class={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}>
        <h3 class={`font-semibold ${isDarkMode ? 'text-zinc-200' : 'text-gray-800'}`}>AI Task Breakdown</h3>
        <button 
          class={`p-1 rounded-full hover:bg-opacity-10 ${isDarkMode ? 'hover:bg-white' : 'hover:bg-black'}`}
          on:click={closeBreakdownModal}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>
      </div>

      <!-- Modal Content -->
      <div class="p-4 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
        <!-- Task Input -->
        <div class="space-y-3">
          <!-- Select existing task button -->
          <button
            class={`w-full px-4 py-3 rounded-lg border-2 border-dashed transition-all flex items-center justify-center gap-2
              ${isDarkMode 
                ? 'border-zinc-600 hover:border-purple-500 hover:bg-purple-500/10 text-zinc-300' 
                : 'border-gray-300 hover:border-purple-500 hover:bg-purple-50 text-gray-600'}`}
            on:click={() => { showTaskPickerModal = true; taskPickerSearch = ''; }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
              <path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z"/>
            </svg>
            <span class="font-medium">Pick from Existing Tasks</span>
          </button>
          
          <div class={`text-center text-xs ${isDarkMode ? 'text-zinc-500' : 'text-gray-400'}`}>— or enter manually —</div>
          
          <div>
            <label class={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>Task Title</label>
            <input
              type="text"
              bind:value={breakdownTaskTitle}
              placeholder="e.g., Plan my birthday party"
              class={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500
                ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-200 placeholder-zinc-500' : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'}`}
            />
          </div>
          <div>
            <label class={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>Description (optional)</label>
            <textarea
              bind:value={breakdownTaskDescription}
              rows="2"
              placeholder="Additional context..."
              class={`w-full px-3 py-2 rounded-lg border focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none
                ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-200 placeholder-zinc-500' : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'}`}
            ></textarea>
          </div>
          <button
            class={`w-full py-2 rounded-lg font-medium transition-colors
              ${isBreakingDown 
                ? 'bg-gray-400 cursor-not-allowed text-white' 
                : 'bg-green-600 hover:bg-green-700 text-white'}`}
            on:click={breakdownTaskWithAI}
            disabled={isBreakingDown || !breakdownTaskTitle.trim()}
          >
            {isBreakingDown ? '🔄 Breaking down...' : '✨ Break Down with AI'}
          </button>
        </div>

        <!-- Subtasks Results -->
        {#if breakdownSubtasks.length > 0}
          <div class={`rounded-lg p-3 ${isDarkMode ? 'bg-zinc-700' : 'bg-green-50'}`}>
            <div class="flex items-center justify-between mb-3">
              <h4 class={`font-semibold text-sm ${isDarkMode ? 'text-zinc-200' : 'text-gray-700'}`}>📋 Generated Subtasks</h4>
              <button
                class="px-3 py-1 text-xs font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors"
                on:click={createAllSubtasks}
              >
                Create All
              </button>
            </div>
            <ul class="space-y-2">
              {#each breakdownSubtasks as subtask, i}
                <li class={`p-3 rounded-lg ${isDarkMode ? 'bg-zinc-800' : 'bg-white'} flex justify-between items-start gap-2`}>
                  <div class="flex-1">
                    <span class={`font-medium text-sm ${isDarkMode ? 'text-zinc-200' : 'text-gray-800'}`}>{i + 1}. {subtask.title}</span>
                    {#if subtask.description}
                      <p class={`text-xs mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>{subtask.description}</p>
                    {/if}
                  </div>
                  <button
                    class="px-2 py-1 text-xs font-medium rounded bg-blue-600 hover:bg-blue-700 text-white flex-shrink-0"
                    on:click={() => createSubtask(subtask)}
                  >
                    Add
                  </button>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- Task Picker Modal -->
{#if showTaskPickerModal}
  <div
    class="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4"
    transition:scale={{ duration: 200, easing: quintOut }}
    on:click|self={() => showTaskPickerModal = false}
    role="dialog"
    aria-modal="true"
  >
    <div class={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-zinc-900' : 'bg-white'}`}>
      <!-- Modal Header -->
      <div class={`px-5 py-4 ${isDarkMode ? 'bg-gradient-to-r from-zinc-800 via-zinc-800 to-zinc-900' : 'bg-gradient-to-r from-gray-50 to-white border-b border-gray-200'}`}>
        <div class="flex items-center justify-between mb-3">
          <h3 class={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>📋 Select a Task</h3>
          <button 
            class={`p-1.5 rounded-full transition-colors ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`}
            on:click={() => showTaskPickerModal = false}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
        <!-- Search Bar -->
        <div class="relative">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" 
            class={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDarkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
            <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
          </svg>
          <input
            type="text"
            bind:value={taskPickerSearch}
            placeholder="Search tasks..."
            class={`w-full pl-10 pr-4 py-2.5 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-purple-500
              ${isDarkMode ? 'bg-zinc-800 text-zinc-200 placeholder-zinc-500' : 'bg-gray-100 text-gray-800 placeholder-gray-400'}`}
          />
        </div>
      </div>

      <!-- Task List -->
      <div class="max-h-[50vh] overflow-y-auto custom-scrollbar p-3 space-y-2">
        {#each activeTasks
          .filter(t => !t.isCompleted)
          .filter(t => taskPickerSearch === '' || t.title?.toLowerCase().includes(taskPickerSearch.toLowerCase()))
          .sort((a, b) => {
            // Sort by priority first (urgent > high > standard > low)
            const priorityOrder = { 'urgent': 0, 'high': 1, 'standard': 2, 'low': 3 };
            const aPriority = priorityOrder[a.priority || 'standard'] ?? 2;
            const bPriority = priorityOrder[b.priority || 'standard'] ?? 2;
            if (aPriority !== bPriority) return aPriority - bPriority;
            // Then sort by due date (soonest first)
            const aDate = a.dueDateISO ? new Date(a.dueDateISO).getTime() : Infinity;
            const bDate = b.dueDateISO ? new Date(b.dueDateISO).getTime() : Infinity;
            return aDate - bDate;
          })
          as task}
          {@const priorityGradients = {
            'urgent': 'bg-gradient-to-b from-red-400 to-red-600',
            'high': 'bg-gradient-to-b from-orange-400 to-orange-600',
            'standard': 'bg-gradient-to-b from-blue-400 to-blue-600',
            'low': 'bg-gradient-to-b from-gray-400 to-gray-500'
          }}
          {@const priorityBadgeGradients = {
            'urgent': 'bg-gradient-to-r from-red-500 to-pink-600',
            'high': 'bg-gradient-to-r from-orange-500 to-amber-600',
            'standard': 'bg-gradient-to-r from-blue-500 to-indigo-600',
            'low': 'bg-gradient-to-r from-gray-400 to-gray-500'
          }}
          {@const taskPriority = task.priority || 'standard'}
          <button
            class={`w-full text-left p-4 rounded-xl transition-all duration-200 group
              ${isDarkMode 
                ? 'bg-zinc-800 hover:bg-zinc-700 hover:ring-2 hover:ring-purple-500/50' 
                : 'bg-gray-50 hover:bg-white hover:shadow-md hover:ring-2 hover:ring-purple-500/30'}`}
            on:click={() => {
              breakdownTaskTitle = task.title || '';
              breakdownTaskDescription = task.description || '';
              breakdownTaskDueDate = task.dueDateISO || task.dueDate || '';
              showTaskPickerModal = false;
            }}
          >
            <div class="flex items-start gap-3">
              <!-- Priority Indicator -->
              <div class={`w-1.5 h-12 rounded-full flex-shrink-0 ${priorityGradients[taskPriority] || priorityGradients['standard']}`}></div>
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class={`font-medium truncate ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>
                    {task.title}
                  </span>
                  <span class={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-full ${priorityBadgeGradients[taskPriority] || priorityBadgeGradients['standard']} text-white flex-shrink-0 shadow-sm`}>
                    {taskPriority}
                  </span>
                </div>
                
                {#if task.description}
                  <p class={`text-xs truncate mb-1.5 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
                    {task.description}
                  </p>
                {/if}
                
                {#if task.dueDateISO || task.dueDate}
                  <div class={`flex items-center gap-1 text-xs ${isDarkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
                      <path fill-rule="evenodd" d="M4 1.75a.75.75 0 01.75.75V3h6.5V2.5a.75.75 0 011.5 0V3h.25A2.75 2.75 0 0115.75 5.75v7.5A2.75 2.75 0 0113 16H3a2.75 2.75 0 01-2.75-2.75v-7.5A2.75 2.75 0 013 3h.25V2.5A.75.75 0 014 1.75z" clip-rule="evenodd" />
                    </svg>
                    <span>{task.dueDateISO || task.dueDate}</span>
                  </div>
                {/if}
              </div>
              
              <!-- Arrow -->
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" 
                class={`w-5 h-5 flex-shrink-0 transition-transform group-hover:translate-x-1 ${isDarkMode ? 'text-zinc-600 group-hover:text-purple-400' : 'text-gray-300 group-hover:text-purple-500'}`}>
                <path fill-rule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clip-rule="evenodd" />
              </svg>
            </div>
          </button>
        {:else}
          <div class={`text-center py-8 ${isDarkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
            <p class="text-sm">No tasks found</p>
          </div>
        {/each}
      </div>

      <!-- Footer -->
      <div class={`px-5 py-3 border-t ${isDarkMode ? 'border-zinc-700 bg-zinc-800/50' : 'border-gray-100 bg-gray-50'}`}>
        <p class={`text-xs text-center ${isDarkMode ? 'text-zinc-500' : 'text-gray-400'}`}>
          {activeTasks.filter(t => !t.isCompleted).length} tasks available • Click to select
        </p>
      </div>
    </div>
  </div>
{/if}

<!-- Workspace Name Prompt Modal -->
{#if showWorkspaceNamePrompt}
  <div
    class="fixed inset-0 z-[80] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4"
    transition:scale={{ duration: 200, easing: quintOut }}
    on:click|self={() => showWorkspaceNamePrompt = false}
    role="dialog"
    aria-modal="true"
  >
    <div class={`w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden ${isDarkMode ? 'bg-zinc-800' : 'bg-white'}`}>
      <!-- Header -->
      <div class={`px-5 py-4 ${isDarkMode ? 'bg-gradient-to-r from-purple-900/50 to-zinc-800' : 'bg-gradient-to-r from-purple-50 to-white border-b border-gray-200'}`}>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 text-white">
              <path fill-rule="evenodd" d="M4.25 2A2.25 2.25 0 002 4.25v11.5A2.25 2.25 0 004.25 18h11.5A2.25 2.25 0 0018 15.75V4.25A2.25 2.25 0 0015.75 2H4.25zM15 5.75a.75.75 0 00-1.5 0v8.5a.75.75 0 001.5 0v-8.5zm-8.5 6a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5zM8.584 9a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5a.75.75 0 01.75-.75zm3.58-1.25a.75.75 0 00-1.5 0v6.5a.75.75 0 001.5 0v-6.5z" clip-rule="evenodd" />
            </svg>
          </div>
          <div>
            <h3 class={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>Create Workspace</h3>
            <p class={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>{breakdownSubtasks.length} subtasks will be added</p>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="p-5 space-y-4">
        <div>
          <label class={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>Workspace Name</label>
          <input
            type="text"
            bind:value={workspaceName}
            placeholder="Enter a custom name..."
            class={`w-full px-4 py-3 rounded-xl border-2 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all
              ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-100 placeholder-zinc-500' : 'bg-white border-gray-200 text-gray-800 placeholder-gray-400'}`}
          />
        </div>

        <button
          class={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2
            ${isCreatingWorkspace 
              ? 'bg-gray-400 cursor-not-allowed text-white' 
              : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl'}`}
          on:click={() => createWorkspaceWithSubtasks(false)}
          disabled={isCreatingWorkspace || !workspaceName.trim()}
        >
          {#if isCreatingWorkspace}
            <span class="animate-spin">⏳</span> Creating...
          {:else}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Create Workspace
          {/if}
        </button>

        <div class="relative">
          <div class="absolute inset-0 flex items-center">
            <div class={`w-full border-t ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}></div>
          </div>
          <div class="relative flex justify-center">
            <span class={`px-3 text-xs ${isDarkMode ? 'bg-zinc-800 text-zinc-500' : 'bg-white text-gray-400'}`}>or..</span>
          </div>
        </div>

        <button
          class={`w-full py-3 rounded-xl font-medium transition-all border-2 border-dashed flex items-center justify-center gap-2
            ${isCreatingWorkspace 
              ? 'opacity-50 cursor-not-allowed' 
              : isDarkMode 
                ? 'border-zinc-600 hover:border-purple-500 hover:bg-purple-500/10 text-zinc-300' 
                : 'border-gray-300 hover:border-purple-500 hover:bg-purple-50 text-gray-600'}`}
          on:click={() => createWorkspaceWithSubtasks(true)}
          disabled={isCreatingWorkspace}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
            <path d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0v2.43l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389 5.5 5.5 0 019.202-2.466l.312.311h-2.433a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" />
          </svg>
          Use "{breakdownTaskTitle}" automatically
        </button>
      </div>

      <!-- Footer Cancel -->
      <div class={`px-5 py-3 border-t ${isDarkMode ? 'border-zinc-700' : 'border-gray-100'}`}>
        <button
          class={`w-full py-2 rounded-lg text-sm font-medium transition-colors
            ${isDarkMode ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
          on:click={() => showWorkspaceNamePrompt = false}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .custom-scrollbar {
    scrollbar-width: thin;
  }
  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-track {
    background: transparent;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: #6b7280;
    border-radius: 2px;
  }

  /* Subtle bounce animation for speech bubble */
  @keyframes bounce-subtle {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-3px);
    }
  }
  
  .animate-bounce-subtle {
    animation: bounce-subtle 2s ease-in-out infinite;
  }
</style>
