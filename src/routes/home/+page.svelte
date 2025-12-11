<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { db } from '$lib/firebase.js'; // Client-side Firebase instance (still used for other potential client operations)
  // Removed direct Firestore client-side imports for username fetching as it's now server-side
  import { enhance } from '$app/forms';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import CalendarAIPanel from '$lib/components/CalendarAIPanel.svelte';
  import { slide, scale, fly, fade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { goto, invalidateAll } from '$app/navigation';
  import { browser } from '$app/environment';

  let isSidebarOpen = false;
  let currentDateTime = "";
  let showNoteForm = false;
  let editingNoteId: string | null = null;
  let noteTitle = "";
  let noteContent = "";
  let expandedNoteId: string | null = null;
  
  let username = "User"; // Default, will be set by server data
  let greeting = "GOOD DAY";
  // email and usernameFromUrl might not be needed if all username logic is server-side now
  // let email = ''; 
  // let usernameFromUrl = ''; 

  let isRefreshingNotes = false;
  let isRefreshingTasks = false;
  let errorMessage: string | null = null;
  let showTaskForm = false;
  let isAIPanelOpen = false;
  let showCompletedTasks = false;
  let showDeleteConfirmation = false;
  let pendingDeleteNoteId: string | null = null;
  let selectedTask: Task | null = null; // For task detail modal
  let isEditingTask = false; // For inline task editing

  // Edit task form fields
  let editTaskTitle = "";
  let editTaskDescription = "";
  let editTaskDueDate: string | null = null;
  let editTaskDueTime: string | null = null;
  let editTaskPriority: string = 'standard';

  let taskTitle = "";
  let taskDescription = "";
  let taskDueDate: string | null = null;
  let taskDueTime: string | null = null;
  let taskPriority: string = 'standard';
  let taskTags: string = '';
  let isDarkMode = false;
  let noTasksTodayMessage = "You have no tasks due today, take a well-deserved break for now view all tasks below!";

  const encouragingMessages = [
    "No tasks today? Enjoy the calm before the next storm of productivity!",
    "Looks like a clear schedule! Time to recharge or tackle a passion project.",
    "Zero tasks on the docket! Maybe it's a sign to get Synthia to assist you in learning something new today?",
    "Your to-do list is empty for today. Embrace the freedom!",
    "No tasks? Perfect day to plan your next big move or simply relax.",
  ];

  function getRandomMessage() {
    return encouragingMessages[Math.floor(Math.random() * encouragingMessages.length)];
  }

  interface Task {
    id: string;
    title?: string; // Primary task name (used by calendar route)
    description: string; // Can be used as fallback or additional details
    isCompleted: boolean;
    createdAt: string | null; // Assuming this is createdAtISO from server
    userId?: string;
    dueDate?: string | null; // Assuming this is dueDateISO (YYYY-MM-DD) from server
    dueTime?: string | null; // HH:MM format
    priority?: string | number;
    tags?: string[];
    noteId?: string;
  }

  // Updated to include username from server
  interface PageData {
    notes?: {
      id: string;
      title: string;
      content: string;
      createdAt: string | null; // ISO string
      userId?: string;
    }[];
    tasks?: Task[];
    showCompleted?: boolean;
    error?: string;
    username?: string; // Username provided by the server load function
  }

  export let data: PageData;

  // Reactive statement to update component's username from server data
  $: if (data && data.username) {
    username = data.username;
    if (browser) { 
        saveUsername(username); // Persist to localStorage for potential other uses or faster non-SSR updates
    }
  } else if (browser && !data.username) { // Fallback if server doesn't provide username for some reason
    username = getStoredUsername();
  }


  $: {
    if (data?.error) {
      errorMessage = data.error;
    } else {
      errorMessage = null;
    }
    if (data && typeof data.showCompleted === 'boolean') {
      showCompletedTasks = data.showCompleted;
    }
    if (browser && (!data?.tasks || data.tasks.length === 0)) {
      noTasksTodayMessage = getRandomMessage();
    }
  }

  $: if (browser) {
    const aiChatToggleEl = document.getElementById('aiChatToggle');
    if (aiChatToggleEl) {
      if (showNoteForm || showTaskForm || (expandedNoteId !== null && !showNoteForm) ) {
        aiChatToggleEl.classList.add('hidden');
      } else {
        aiChatToggleEl.classList.remove('hidden');
      }
    }
  }

  function toggleShowCompleted() {
    const currentUrl = new URL($page.url);
    const nextShowCompleted = !showCompletedTasks;
    currentUrl.searchParams.set('showCompleted', String(nextShowCompleted));
    goto(currentUrl.href, {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    if (browser) {
      document.documentElement.classList.toggle('dark', isDarkMode);
      document.body.classList.toggle('dark', isDarkMode);
      localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }
  }

  function toggleSidebar() {
    isSidebarOpen = !isSidebarOpen;
  }

  function openAddTaskForm() {
    showTaskForm = true;
    taskTitle = ""; taskDescription = ""; taskDueDate = null; taskDueTime = null;
    taskPriority = 'standard'; taskTags = '';
  }

  function closeTaskForm() {
    showTaskForm = false;
    taskTitle = ""; taskDescription = ""; taskDueDate = null; taskDueTime = null;
    taskPriority = 'standard'; taskTags = '';
  }

  function closeSidebar() {
    isSidebarOpen = false;
  }

  function openAddNoteForm() {
    showNoteForm = true; editingNoteId = null; noteTitle = ""; noteContent = "";
  }

  function openEditNoteForm(note: { id: string; title: string; content: string }) {
    showNoteForm = true; editingNoteId = note.id; noteTitle = note.title; noteContent = note.content;
  }

  function closeForm() {
    showNoteForm = false; noteTitle = ""; noteContent = ""; editingNoteId = null;
  }

  const taskAddFormEnhanceCallback = () => {
    return async ({ result, update }: { result: any, update: any }) => {
      if (result.type === 'success' || result.type === 'redirect') {
        closeTaskForm(); await invalidateAll();
      } else if (result.type === 'failure') {
        const formError = result.data?.taskForm?.error || result.data?.error;
        errorMessage = formError || 'Failed to add task.';
        if (formError && formError.toLowerCase().includes('authentication required')) goto('/login'); 
      } else if (result.type === 'error') {
        errorMessage = result.error?.message || 'An unexpected error occurred.';
      }
      await update({ reset: result.type !== 'failure' });
    };
  };

  const noteFormEnhanceCallback = () => {
    return async ({ result, update }: { result: any, update: any }) => {
      if (result.type === 'success' || result.type === 'redirect') {
        closeForm(); await invalidateAll();
      } else if (result.type === 'failure') {
        const formError = result.data?.noteForm?.error || result.data?.error;
        errorMessage = formError || (editingNoteId ? 'Failed to update note.' : 'Failed to add note.');
        if (formError && formError.toLowerCase().includes('authentication required')) goto('/login'); 
      } else if (result.type === 'error') {
        errorMessage = result.error?.message || 'An unexpected error occurred with the note form.';
      }
       await update({ reset: result.type !== 'failure' });
    };
  };

  const taskFormEnhanceCallback = () => {
    return async ({ result, update }: { result: any, update: any }) => {
      if (result.type === 'failure') {
        errorMessage = result.data?.error || 'Failed to update task status.';
      } else if (result.type === 'error') {
        errorMessage = result.error?.message || 'An unexpected error occurred toggling the task.';
      } else if (result.type === 'success' && errorMessage?.startsWith('Failed to update task')) {
        errorMessage = null;
      }
      await invalidateAll(); 
      await update({ reset: false });
    };
  };

  function startEditTask() {
    if (!selectedTask) return;
    editTaskTitle = selectedTask.title || selectedTask.description || '';
    editTaskDescription = selectedTask.description || '';
    editTaskDueDate = selectedTask.dueDate || null;
    editTaskDueTime = selectedTask.dueTime || null;
    editTaskPriority = String(selectedTask.priority || 'standard');
    isEditingTask = true;
  }

  function cancelEditTask() {
    isEditingTask = false;
  }

  const editTaskEnhanceCallback = () => {
    return async ({ result, update }: { result: any, update: any }) => {
      if (result.type === 'success' || result.type === 'redirect') {
        isEditingTask = false;
        selectedTask = null;
        await invalidateAll();
      } else if (result.type === 'failure') {
        errorMessage = result.data?.error || 'Failed to update task.';
      } else if (result.type === 'error') {
        errorMessage = result.error?.message || 'An unexpected error occurred updating the task.';
      }
      await update({ reset: result.type !== 'failure' });
    };
  };

  function getStoredUsername(): string {
    if (browser) return localStorage.getItem('microtask_username') || "User";
    return "User";
  }

  function saveUsername(name: string): void {
    if (browser) localStorage.setItem('microtask_username', name);
  }

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "GOOD MORNING";
    if (hour >= 12 && hour < 18) return "GOOD AFTERNOON";
    return "GOOD EVENING";
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

  function handleLogout() {
    if (browser) {
        localStorage.removeItem('microtask_username');
        document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
        goto('/login');
    }
  }

  let isDragging = false;
  let dragOffsetX = 0, dragOffsetY = 0;
  let chatWindowElement: HTMLElement | null = null;
  let chatHeaderElement: HTMLElement | null = null;

  let isResizing = false;
  let resizeStartX = 0, resizeStartY = 0;
  let initialWidth = 0, initialHeight = 0;
  let resizeHandleElement: HTMLElement | null = null;
  const MIN_CHAT_WIDTH = 250, MIN_CHAT_HEIGHT = 200;

  let aiSpeechBubbleElement: HTMLElement | null = null;
  let aiBubbleTimeoutId: number | null = null;
  let aiBubbleIntervalId: number | null = null;
  const aiBubbleMessages = [
    "Tap me for assistance!", "Got a question? Click me!", "Need help with tasks?", "I'm Synthia, your AI pal!", "Let's be productive!"
  ];

  function showRandomAiSpeechBubble() {
    const aiChatToggleEl = document.getElementById('aiChatToggle');
    const chatWinEl = document.getElementById('aiChatWindow');

    if (!browser || !aiChatToggleEl || !aiSpeechBubbleElement || 
        (chatWinEl && !chatWinEl.classList.contains('hidden')) || 
        showNoteForm || showTaskForm || isSidebarOpen || 
        aiChatToggleEl.classList.contains('hidden')
    ) {
      if (aiSpeechBubbleElement && aiSpeechBubbleElement.classList.contains('visible')) {
        aiSpeechBubbleElement.classList.remove('visible');
      }
      return;
    }

    const randomIndex = Math.floor(Math.random() * aiBubbleMessages.length);
    aiSpeechBubbleElement.textContent = aiBubbleMessages[randomIndex];
    aiSpeechBubbleElement.classList.add('visible'); 

    if (aiBubbleTimeoutId) clearTimeout(aiBubbleTimeoutId);
    aiBubbleTimeoutId = window.setTimeout(() => {
      aiSpeechBubbleElement?.classList.remove('visible');
    }, 4000); 
  }


  function onDragMouseDown(event: MouseEvent) {
    if (event.target === resizeHandleElement || isResizing || !chatWindowElement || !chatHeaderElement) return;
    const target = event.target as HTMLElement;
    if (!chatHeaderElement.contains(target) || target.closest('button')) return;
    isDragging = true;
    dragOffsetX = event.clientX - chatWindowElement.offsetLeft;
    dragOffsetY = event.clientY - chatWindowElement.offsetTop;
    chatHeaderElement.classList.add('grabbing');
    chatWindowElement.classList.add('user-select-none');
    chatWindowElement.style.transition = 'none'; 
    const rect = chatWindowElement.getBoundingClientRect();
    chatWindowElement.style.left = `${rect.left}px`;
    chatWindowElement.style.top = `${rect.top}px`;
    chatWindowElement.style.bottom = 'auto'; chatWindowElement.style.right = 'auto';
    event.preventDefault();
  }

  function onDragMouseMove(event: MouseEvent) {
    if (!isDragging || !chatWindowElement) return;
    let newX = event.clientX - dragOffsetX;
    let newY = event.clientY - dragOffsetY;
    const elRect = chatWindowElement.getBoundingClientRect();
    newX = Math.max(0, Math.min(newX, window.innerWidth - elRect.width));
    newY = Math.max(0, Math.min(newY, window.innerHeight - elRect.height));
    chatWindowElement.style.left = `${newX}px`;
    chatWindowElement.style.top = `${newY}px`;
  }

  function onDragMouseUp() {
    if (!isDragging || !chatHeaderElement || !chatWindowElement) return;
    isDragging = false;
    chatHeaderElement.classList.remove('grabbing');
    chatWindowElement.classList.remove('user-select-none');
    chatWindowElement.style.transition = ''; 
  }

  function onResizeMouseDown(event: MouseEvent) {
    if (isDragging || !chatWindowElement || !resizeHandleElement) return; 
    isResizing = true;
    resizeStartX = event.clientX; resizeStartY = event.clientY;
    initialWidth = chatWindowElement.offsetWidth; initialHeight = chatWindowElement.offsetHeight;
    chatWindowElement.classList.add('user-select-none', 'resizing');
    chatWindowElement.style.transition = 'none'; 
    const rect = chatWindowElement.getBoundingClientRect();
    chatWindowElement.style.left = `${rect.left}px`; chatWindowElement.style.top = `${rect.top}px`;
    chatWindowElement.style.bottom = 'auto'; chatWindowElement.style.right = 'auto';
    chatWindowElement.style.width = `${initialWidth}px`; chatWindowElement.style.height = `${initialHeight}px`;
    event.preventDefault(); event.stopPropagation(); 
  }

  function onResizeMouseMove(event: MouseEvent) {
    if (!isResizing || !chatWindowElement) return;
    const deltaX = event.clientX - resizeStartX, deltaY = event.clientY - resizeStartY;
    let newWidth = initialWidth + deltaX, newHeight = initialHeight + deltaY;
    newWidth = Math.max(MIN_CHAT_WIDTH, newWidth); newHeight = Math.max(MIN_CHAT_HEIGHT, newHeight);
    chatWindowElement.style.width = `${newWidth}px`; chatWindowElement.style.height = `${newHeight}px`;
  }

  function onResizeMouseUp() {
    if (!isResizing || !chatWindowElement) return;
    isResizing = false;
    chatWindowElement.classList.remove('user-select-none', 'resizing');
    chatWindowElement.style.transition = ''; 
  }

  const handleEscKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      if (showNoteForm) closeForm(); if (showTaskForm) closeTaskForm();
      if (showDeleteConfirmation) showDeleteConfirmation = false;
      if (isSidebarOpen) closeSidebar();
      if (isDragging) onDragMouseUp(); if (isResizing) onResizeMouseUp(); 
    }
  };

  function updateChatWindowStyle() {
    if (!browser || !chatWindowElement ) return;
    const chatMessages = document.getElementById('chatMessages');
    
    chatWindowElement.style.bottom = '100px'; 
    chatWindowElement.style.right = '16px';  
    chatWindowElement.style.left = 'auto'; 
    chatWindowElement.style.top = 'auto';
    
    if (!isDragging && !isResizing) {
        const currentWidth = chatWindowElement.style.width;
        const currentHeight = chatWindowElement.style.height;
        if (!currentWidth || currentWidth === '100%') { 
            chatWindowElement.style.width = '380px'; 
        }
        if (!currentHeight || currentHeight === '100%') { 
             chatWindowElement.style.height = '480px';
        }
    }
    
    chatWindowElement.style.maxWidth = '90vw'; 
    chatWindowElement.style.maxHeight = 'calc(100vh - 120px)';
    chatWindowElement.style.borderRadius = '1rem';
    chatWindowElement.classList.remove('chat-expanded'); 

    if (chatMessages?.querySelector('h2.initial-prompt-title')) {
        chatMessages.classList.add('items-center', 'justify-center', 'text-center');
        chatMessages.classList.remove('items-start', 'justify-start', 'text-left');
    } else {
        chatMessages?.classList.remove('items-center', 'justify-center', 'text-center');
        chatMessages?.classList.add('items-start', 'justify-start', 'text-left');
    }
  }

  async function sendChatMessage() {
    if (!browser) return;
    const chatInputEl = document.getElementById('chatInput') as HTMLInputElement | null;
    const chatMessages = document.getElementById('chatMessages');
    if (!chatInputEl || !chatMessages) return;
    const userMsgText = chatInputEl.value.trim();
    if (!userMsgText) return;

    const aiContextPreamble = `You are Synthia, a helpful AI assistant integrated into the Microtask productivity app. Keep your answers concise and relevant to task management, scheduling, note-taking, and general productivity. The user's name is ${username || 'User'}. Today's date is ${new Date().toLocaleDateString()}. \n\nUser query: `;
    const fullMessageToSend = aiContextPreamble + userMsgText;

    const userMsgDiv = document.createElement('div');
    userMsgDiv.className = `p-2 rounded-lg text-sm self-end max-w-[75%] ml-auto mb-2 break-words ${isDarkMode ? 'bg-blue-700 text-blue-100' : 'bg-blue-500 text-white'}`;
    userMsgDiv.textContent = userMsgText;

    const initialPromptDiv = chatMessages.querySelector('.initial-prompt');
    if (initialPromptDiv) {
      initialPromptDiv.remove();
      updateChatWindowStyle(); 
    }
    chatMessages.appendChild(userMsgDiv);
    chatInputEl.value = "";
    chatMessages.scrollTop = chatMessages.scrollHeight;

    const typingIndicator = document.createElement('div');
    typingIndicator.id = 'aiTyping';
    typingIndicator.className = `p-2 rounded-lg text-sm self-start max-w-[75%] mb-2 italic ${isDarkMode ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-200 text-gray-500'}`;
    typingIndicator.textContent = 'Synthia is typing...';
    chatMessages.appendChild(typingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    try {
      const response = await fetch("/api/chat", { 
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: fullMessageToSend })
      });
      typingIndicator.remove();
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: true, reply: `API request failed with status ${response.status}` }));
        throw new Error(errorData.reply || `API request failed: ${response.status}`);
      }
      const responseData = await response.json();
      const aiReplyText = responseData?.reply || "Hmm, I couldn't get a response this time.";
      
      // If there was an error, show the reply as an error message
      if (responseData.error) {
        const errorMsgDiv = document.createElement('div');
        errorMsgDiv.className = `p-2 rounded-lg text-sm self-start max-w-[75%] mb-2 ${isDarkMode ? 'bg-amber-800 text-amber-200' : 'bg-amber-100 text-amber-700'}`;
        errorMsgDiv.textContent = aiReplyText;
        chatMessages.appendChild(errorMsgDiv);
      } else {
        let formattedReply = aiReplyText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\n/g, '<br>');
        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.className = `p-2 rounded-lg text-sm self-start max-w-[75%] mb-2 break-words ${isDarkMode ? 'bg-zinc-700 text-zinc-200' : 'bg-gray-200 text-gray-800'}`;
        aiMsgDiv.innerHTML = formattedReply;
        chatMessages.appendChild(aiMsgDiv);
      }
    } catch (error: any) {
      const errorMsgDiv = document.createElement('div');
      errorMsgDiv.className = `p-2 rounded-lg text-sm self-start max-w-[75%] mb-2 ${isDarkMode ? 'bg-red-800 text-red-200' : 'bg-red-100 text-red-700'}`;
      errorMsgDiv.textContent = error.message || "Oops! Something went wrong with the chat.";
      if(document.getElementById('aiTyping')) document.getElementById('aiTyping')?.remove();
      chatMessages.appendChild(errorMsgDiv);
    } finally {
        if(chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  async function refreshData() {
    isRefreshingNotes = true; isRefreshingTasks = true; errorMessage = null;
    try { await invalidateAll(); } 
    catch (err) { errorMessage = 'Failed to refresh data. Please try again.'; } 
    finally { isRefreshingNotes = false; isRefreshingTasks = false; }
  }
  function confirmDelete() { 
    // Determine which note ID to delete: prefer pendingDeleteNoteId (from list), fallback to editingNoteId (from modal)
    const idToDelete = pendingDeleteNoteId ?? editingNoteId;
    if (!idToDelete) return;
    showDeleteConfirmation = false;
    pendingDeleteNoteId = null;
    editingNoteId = null;

    // Send a form-encoded POST to the local action ?/deleteNote
    const body = new URLSearchParams();
    body.append('id', idToDelete);
    fetch(`?/deleteNote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    }).then(async (res) => {
      if (!res.ok) {
        const text = await res.text().catch(() => 'Failed to delete note.');
        errorMessage = text || 'Failed to delete note.';
      } else {
        await invalidateAll();
      }
    }).catch((err) => {
      console.error('Delete note request failed:', err);
      errorMessage = 'Failed to delete note.';
    });
  }

  let globalMouseMoveListener: ((event: MouseEvent) => void) | null = null;
  let globalMouseUpListener: (() => void) | null = null;

  onMount(() => {
    if (!data?.tasks || data.tasks.length === 0) noTasksTodayMessage = getRandomMessage();
    // username is now set reactively from `data` prop
    greeting = getGreeting();
    if (browser) {
      const savedTheme = localStorage.getItem('theme');
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      isDarkMode = savedTheme === 'dark' || (!savedTheme && prefersDark);
      document.documentElement.classList.toggle('dark', isDarkMode);
      document.body.classList.toggle('dark', isDarkMode);
    }
    // fetchUsernameFromFirebase() call is removed
    // Header icon listeners are now handled by the AppHeader component
    
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      const sidebarEl = document.getElementById('sidebar');
      const hamburgerButton = document.getElementById('hamburgerButton');
      if (isSidebarOpen && sidebarEl && !sidebarEl.contains(target) && hamburgerButton && !hamburgerButton.contains(target)) {
        closeSidebar();
      }
    };
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('keydown', handleEscKey);

    const aiChatToggleEl = document.getElementById('aiChatToggle');
    chatWindowElement = document.getElementById('aiChatWindow');
    const closeChat = document.getElementById('closeChat');
    const sendBtn = document.getElementById('sendChat');
    const chatInputEl = document.getElementById('chatInput') as HTMLInputElement | null;

    if (aiChatToggleEl && chatWindowElement) {
      aiChatToggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentlyHidden = chatWindowElement!.classList.contains('hidden');
        chatWindowElement!.classList.toggle('hidden', !currentlyHidden);
        if (!currentlyHidden && isDragging) onDragMouseUp(); 
        if (!currentlyHidden && isResizing) onResizeMouseUp();
        updateChatWindowStyle(); 
        if(currentlyHidden && aiSpeechBubbleElement?.classList.contains('visible')) { 
            aiSpeechBubbleElement.classList.remove('visible');
        }
      });
    }
    if (closeChat && chatWindowElement) {
      closeChat.addEventListener('click', () => { 
        chatWindowElement!.classList.add('hidden');
        if (isDragging) onDragMouseUp(); if (isResizing) onResizeMouseUp();
      });
    }
    if (sendBtn && chatInputEl) { 
        sendBtn.addEventListener('click', sendChatMessage);
        chatInputEl.addEventListener('keypress', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChatMessage(); }
        });
    }
    
    chatHeaderElement = document.getElementById('aiChatHeader');
    resizeHandleElement = document.getElementById('resizeHandle');
    aiSpeechBubbleElement = document.getElementById('aiSpeechBubble');

    if (chatHeaderElement) chatHeaderElement.addEventListener('mousedown', onDragMouseDown);
    if (resizeHandleElement) resizeHandleElement.addEventListener('mousedown', onResizeMouseDown);
    
    globalMouseMoveListener = (event) => { if (isDragging) onDragMouseMove(event); if (isResizing) onResizeMouseMove(event); };
    globalMouseUpListener = () => { if (isDragging) onDragMouseUp(); if (isResizing) onResizeMouseUp(); };
    document.addEventListener('mousemove', globalMouseMoveListener);
    document.addEventListener('mouseup', globalMouseUpListener);

    if (aiSpeechBubbleElement) { 
      aiBubbleIntervalId = window.setInterval(showRandomAiSpeechBubble, 10000); 
      showRandomAiSpeechBubble(); 
    }

    updateChatWindowStyle();
    updateDateTime(); // Initial call
    const greetingIntervalId = setInterval(() => { greeting = getGreeting(); }, 60000);
    const dateTimeIntervalId = setInterval(updateDateTime, 60000); // Update every minute

    return () => {
      clearInterval(greetingIntervalId);
      clearInterval(dateTimeIntervalId); // Clear interval on unmount
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('keydown', handleEscKey);
      if (chatHeaderElement) chatHeaderElement.removeEventListener('mousedown', onDragMouseDown);
      if (resizeHandleElement) resizeHandleElement.removeEventListener('mousedown', onResizeMouseDown);
      if (globalMouseMoveListener) document.removeEventListener('mousemove', globalMouseMoveListener);
      if (globalMouseUpListener) document.removeEventListener('mouseup', globalMouseUpListener);
      if (aiBubbleIntervalId) clearInterval(aiBubbleIntervalId);
      if (aiBubbleTimeoutId) clearTimeout(aiBubbleTimeoutId);
    };
  });
</script>

<div class={`flex h-screen font-sans ${isDarkMode ? 'dark bg-zinc-900 text-zinc-300' : 'bg-gray-100 text-gray-800'}`}>
  {#if errorMessage}
    <div class="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-md z-[100]" role="alert">
      <strong class="font-bold">Error:</strong>
      <span class="block sm:inline">{errorMessage}</span>
      <button on:click={() => errorMessage = null} class="absolute top-0 bottom-0 right-0 px-4 py-3" aria-label="Close error">
        <span class="text-xl">×</span>
      </button>
    </div>
  {/if}

  <!-- Task Details Modal -->
  {#if selectedTask}
    <div 
      class="fixed inset-0 z-[70] flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm"
      on:click|self={() => selectedTask = null}
      transition:fade={{ duration: 150 }}
    >
      <div 
        class={`rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden ${isDarkMode ? 'bg-zinc-800' : 'bg-white'}`}
        transition:scale={{ duration: 200, start: 0.95 }}
      >
        <!-- Header -->
        <div class={`flex items-center justify-between px-5 py-4 border-b ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}>
          <h3 class={`text-lg font-semibold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Task Details</h3>
          <button
            on:click={() => selectedTask = null}
            class={`p-1 rounded-md transition-colors ${isDarkMode ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {#if !isEditingTask}
        <!-- View Mode Content -->
        <div class={`p-5 space-y-4 overflow-y-auto max-h-[60vh] ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>
          <!-- Title -->
          <div>
            <h4 class={`text-xl font-bold ${isDarkMode ? 'text-zinc-100' : 'text-gray-900'}`}>
              {selectedTask.title || selectedTask.description || 'Untitled Task'}
            </h4>
            {#if selectedTask.isCompleted}
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-2">
                ✓ Completed
              </span>
            {/if}
          </div>
          
          <!-- Description -->
          {#if selectedTask.description && selectedTask.title}
            <div>
              <label class={`text-xs font-medium uppercase tracking-wide ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Description</label>
              <p class={`mt-1 ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>{selectedTask.description}</p>
            </div>
          {/if}
          
          <!-- Priority -->
          <div>
            <label class={`text-xs font-medium uppercase tracking-wide ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Priority</label>
            <div class="mt-1">
              {#if selectedTask.priority === 'urgent'}
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">🔴 Urgent</span>
              {:else if selectedTask.priority === 'high'}
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">🟠 High</span>
              {:else if selectedTask.priority === 'low'}
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">🟢 Low</span>
              {:else}
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">🔵 Standard</span>
              {/if}
            </div>
          </div>
          
          <!-- Due Date/Time -->
          {#if selectedTask.dueDate}
            <div class="flex gap-6">
              <div>
                <label class={`text-xs font-medium uppercase tracking-wide ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Due Date</label>
                <p class={`mt-1 flex items-center gap-1 ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                  </svg>
                  {new Date(selectedTask.dueDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </p>
              </div>
              {#if selectedTask.dueTime}
                <div>
                  <label class={`text-xs font-medium uppercase tracking-wide ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Due Time</label>
                  <p class={`mt-1 flex items-center gap-1 ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-4 h-4">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    {(() => {
                      const [h, m] = (selectedTask.dueTime || '').split(':');
                      const hour = parseInt(h);
                      const ampm = hour >= 12 ? 'PM' : 'AM';
                      const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                      return `${h12}:${m} ${ampm}`;
                    })()}
                  </p>
                </div>
              {/if}
            </div>
          {/if}
          
          <!-- Tags -->
          {#if selectedTask.tags && selectedTask.tags.length > 0}
            <div>
              <label class={`text-xs font-medium uppercase tracking-wide ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Tags</label>
              <div class="mt-1 flex flex-wrap gap-1">
                {#each selectedTask.tags as tag}
                  <span class={`inline-flex items-center px-2 py-0.5 rounded text-xs ${isDarkMode ? 'bg-zinc-700 text-zinc-300' : 'bg-gray-100 text-gray-700'}`}>
                    #{tag}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        
        <!-- Footer - View Mode -->
        <div class={`px-5 py-3 border-t flex flex-col gap-2 ${isDarkMode ? 'border-zinc-700 bg-zinc-750' : 'border-gray-200 bg-gray-50'}`}>
          <!-- Action buttons row -->
          <div class="flex gap-2">
            <form
              method="POST"
              action="?/toggleTask"
              use:enhance={taskFormEnhanceCallback}
              class="flex-1"
            >
              <input type="hidden" name="id" value={selectedTask.id} />
              <input type="hidden" name="isCompleted" value={selectedTask.isCompleted ? '' : 'on'} />
              <button
                type="submit"
                on:click={() => { selectedTask = null; }}
                class={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2
                  ${selectedTask.isCompleted 
                    ? (isDarkMode ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-amber-500 text-white hover:bg-amber-600')
                    : (isDarkMode ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-green-500 text-white hover:bg-green-600')}`}
              >
                {#if selectedTask.isCompleted}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                  </svg>
                  Undo
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  Complete
                {/if}
              </button>
            </form>
            <button
              type="button"
              on:click={startEditTask}
              class={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2
                ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
              Edit
            </button>
          </div>
          <!-- Close button -->
          <button
            on:click={() => { selectedTask = null; isEditingTask = false; }}
            class={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            Close
          </button>
        </div>
      {:else}
        <!-- Edit Mode Content -->
        <form
          method="POST"
          action="?/updateTask"
          use:enhance={editTaskEnhanceCallback}
          class="flex flex-col flex-1"
        >
          <input type="hidden" name="id" value={selectedTask.id} />
          
          <div class={`p-5 space-y-4 overflow-y-auto flex-1 ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>
            <!-- Title -->
            <div>
              <label class={`block text-xs font-medium uppercase tracking-wide mb-1 ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Title</label>
              <input
                type="text"
                name="title"
                bind:value={editTaskTitle}
                required
                class={`w-full px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'bg-white border-gray-300 text-gray-900'}`}
                placeholder="Task title"
              />
            </div>
            
            <!-- Description -->
            <div>
              <label class={`block text-xs font-medium uppercase tracking-wide mb-1 ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Description</label>
              <textarea
                name="description"
                bind:value={editTaskDescription}
                rows="5"
                class={`w-full px-3 py-2 rounded-lg border text-sm resize-none ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'bg-white border-gray-300 text-gray-900'}`}
                placeholder="Optional description"
              ></textarea>
            </div>
            
            <!-- Priority -->
            <div>
              <label class={`block text-xs font-medium uppercase tracking-wide mb-1 ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Priority</label>
              <select
                name="priority"
                bind:value={editTaskPriority}
                class={`w-full px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'bg-white border-gray-300 text-gray-900'}`}
              >
                <option value="low">🟢 Low</option>
                <option value="standard">🔵 Standard</option>
                <option value="high">🟠 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </div>
            
            <!-- Due Date/Time -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class={`block text-xs font-medium uppercase tracking-wide mb-1 ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Due Date</label>
                <input
                  type="date"
                  name="dueDate"
                  bind:value={editTaskDueDate}
                  class={`w-full px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'bg-white border-gray-300 text-gray-900'}`}
                />
              </div>
              <div>
                <label class={`block text-xs font-medium uppercase tracking-wide mb-1 ${isDarkMode ? 'text-zinc-500' : 'text-gray-500'}`}>Due Time</label>
                <input
                  type="time"
                  name="dueTime"
                  bind:value={editTaskDueTime}
                  class={`w-full px-3 py-2 rounded-lg border text-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-100' : 'bg-white border-gray-300 text-gray-900'}`}
                />
              </div>
            </div>
          </div>
          
          <!-- Footer - Edit Mode -->
          <div class={`px-5 py-3 border-t flex gap-2 ${isDarkMode ? 'border-zinc-700 bg-zinc-750' : 'border-gray-200 bg-gray-50'}`}>
            <button
              type="submit"
              class={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2
                ${isDarkMode ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-4 h-4">
                <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              Save Changes
            </button>
            <button
              type="button"
              on:click={cancelEditTask}
              class={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isDarkMode ? 'bg-zinc-700 text-zinc-300 hover:bg-zinc-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              Cancel
            </button>
          </div>
        </form>
      {/if}
      </div>
    </div>
  {/if}

  {#if isSidebarOpen}
    <div
  id="sidebar"
  class={`fixed top-0 left-0 h-full w-64 shadow-lg z-50 flex flex-col justify-between p-4 border-r ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}
  transition:fly={{ x: -300, duration: 300, easing: quintOut }}
>
  <div>
    <div class={`flex items-center justify-between mb-8 pb-4 border-b ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}>
      <div class="flex items-center gap-2">
        <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Microtask Logo" class="w-8 h-8" />
        <h1 class={`text-xl font-bold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>Microtask</h1>
      </div>
      <button on:click={closeSidebar} class={`p-1 rounded-md transition-colors ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`} aria-label="Close sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
        <nav class="flex flex-col gap-2">
          <a href="/home" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:bg-blue-600={!isDarkMode} class:bg-blue-800={isDarkMode} class:text-white={true} class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode}>
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
          <a href="/kanban" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
            <span>All Tasks</span>
          </a>
          <a href="/calendar" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
              <path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" /><path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/></svg>
            <span>Calendar</span>
          </a>
          <a href="/workspace" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.098a2.25 2.25 0 0 1-2.25 2.25h-12a2.25 2.25 0 0 1-2.25-2.25V14.15M18 18.75h.75A2.25 2.25 0 0 0 21 16.5v-1.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 15v1.5A2.25 2.25 0 0 0 3.75 18.75H4.5M12 12.75a3 3 0 0 0-3-3H5.25V7.5a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3v2.25H15a3 3 0 0 0-3 3Z" />
            </svg>
            <span>Workspace</span>
          </a>
        </nav>
      </div>
      <button on:click={handleLogout} class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold w-full mt-auto transition-colors duration-150" class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode}>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
        <span>Log out</span>
      </button>
    </div>
  {/if}

  <div class="flex-1 flex flex-col overflow-hidden">
    <AppHeader {isDarkMode} {username} {currentDateTime} on:toggleSidebar={toggleSidebar} on:toggleDarkMode={toggleDarkMode} on:logout={handleLogout} />

    <div class="flex-1 overflow-y-auto pt-[60px] pb-20 flex flex-col">

      <div class="px-4 sm:px-6 mt-6">
        <div class="greeting-hero mb-2">
          <h1 class={`text-2xl sm:text-3xl font-bold ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>
            {greeting}, <span class={`${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>{username.toUpperCase()}</span>!
          </h1>
          <p class={`text-sm mt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
            {#if data?.tasks && data.tasks.length > 0}
              You have <span class="font-semibold text-blue-500">{data.tasks.length}</span> task{data.tasks.length === 1 ? '' : 's'} due today. Let's get it done!
            {:else}
              {getRandomMessage()}
            {/if}
          </p>
        </div>
      </div>

      <main class="px-4 sm:px-6 mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 flex-grow">
        <section class="flex flex-col gap-6">
          <div class={`quick-access-card border rounded-xl p-4 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600' : 'bg-white border-gray-200'}`}>
            <div class="flex justify-between items-center mb-4">
              <h2 class={`text-lg font-semibold ${isDarkMode ? 'text-zinc-100' : 'text-gray-700'}`}>
                Quick Access
              </h2>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <a href="/calendar" class={`quick-link-card group flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${isDarkMode ? 'bg-zinc-600 hover:bg-zinc-550 border border-zinc-500' : 'bg-gradient-to-br from-blue-50 to-blue-100/50 hover:from-blue-100 hover:to-blue-200/50 border border-blue-200/50'}`}>
                <div class={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${isDarkMode ? 'bg-blue-500/20' : 'bg-blue-500/10'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-blue-500" aria-hidden="true"><path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" /></svg>
                </div>
                <span class={`text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>Calendar</span>
              </a>
              <a href="/kanban" class={`quick-link-card group flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${isDarkMode ? 'bg-zinc-600 hover:bg-zinc-550 border border-zinc-500' : 'bg-gradient-to-br from-green-50 to-green-100/50 hover:from-green-100 hover:to-green-200/50 border border-green-200/50'}`}>
                <div class={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${isDarkMode ? 'bg-green-500/20' : 'bg-green-500/10'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-green-500" aria-hidden="true"><path fill-rule="evenodd" d="M7.502 6h7.128A3.375 3.375 0 0118 9.375v9.375a3 3 0 003-3V6.108c0-1.505-1.125-2.811-2.664-2.94a48.972 48.972 0 00-.673-.05A3 3 0 0015 1.5h-1.5a3 3 0 00-2.663 1.618c-.225.015-.45.032-.673.05C8.662 3.297 7.5 4.603 7.5 6.108V6zM13.5 3a1.5 1.5 0 011.5 1.5H12A1.5 1.5 0 0113.5 3z" clip-rule="evenodd" /><path fill-rule="evenodd" d="M3 9.375C3 8.339 3.84 7.5 4.875 7.5h9.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V9.375zm9.586 4.594a.75.75 0 00-1.172-.938l-2.476 3.096-.908-.907a.75.75 0 00-1.06 1.06l1.5 1.5a.75.75 0 001.116-.062l3-3.75z" clip-rule="evenodd" /></svg>
                </div>
                <span class={`text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>Tasks</span>
              </a>
              <a href="/dashboard" class={`quick-link-card group flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${isDarkMode ? 'bg-zinc-600 hover:bg-zinc-550 border border-zinc-500' : 'bg-gradient-to-br from-purple-50 to-purple-100/50 hover:from-purple-100 hover:to-purple-200/50 border border-purple-200/50'}`}>
                <div class={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${isDarkMode ? 'bg-purple-500/20' : 'bg-purple-500/10'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-purple-500" aria-hidden="true"><path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z" /></svg>
                </div>
                <span class={`text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>Dashboard</span>
              </a>
              <a href="/workspace" class={`quick-link-card group flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 hover:-translate-y-1 hover:shadow-lg ${isDarkMode ? 'bg-zinc-600 hover:bg-zinc-550 border border-zinc-500' : 'bg-gradient-to-br from-orange-50 to-orange-100/50 hover:from-orange-100 hover:to-orange-200/50 border border-orange-200/50'}`}>
                <div class={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 ${isDarkMode ? 'bg-orange-500/20' : 'bg-orange-500/10'}`}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-orange-500" aria-hidden="true"><path fill-rule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clip-rule="evenodd" /><path d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z" /></svg>
                </div>
                <span class={`text-sm font-medium ${isDarkMode ? 'text-zinc-300' : 'text-gray-700'}`}>Workspace</span>
              </a>
            </div>
          </div>


          <div class={`border rounded-xl p-4 shadow-sm relative flex flex-col ${isDarkMode ? 'bg-zinc-700 border-zinc-600' : 'bg-white border-gray-200'}`}>
            <div class="flex justify-between items-center mb-4 flex-shrink-0">
              <h2 class={`text-lg font-semibold flex items-center gap-2 ${isDarkMode ? 'text-zinc-100' : 'text-gray-700'}`}>
                Today's Tasks
                {#if data?.tasks && data.tasks.length > 0}
                  <span class={`text-xs font-normal px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600'}`}>
                    {data.tasks.length}
                  </span>
                {/if}
              </h2>
            </div>
            <div class="space-y-2 flex-grow overflow-y-auto mb-4 pr-2 -mr-2 pt-1 pb-1 custom-scrollbar">
              {#if data?.tasks && data.tasks.length > 0}
                {#each data.tasks as task (task.id)}
                  <div
                    class={`task-item-card flex items-center gap-3 rounded-xl px-4 py-3 cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lg
                      ${isDarkMode ? 'bg-zinc-600 border border-zinc-500 hover:bg-zinc-550' : 'bg-gradient-to-r from-white to-gray-50/50 border border-gray-200 hover:border-gray-300 hover:shadow-md'}`}
                    on:click={() => selectedTask = task}
                    on:keydown={(e) => e.key === 'Enter' && (selectedTask = task)}
                    role="button"
                    tabindex="0"
                  >
                    <!-- Priority indicator -->
                    <div class={`priority-dot w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      task.priority === 'urgent' ? 'bg-red-500' :
                      task.priority === 'high' ? 'bg-orange-500' :
                      task.priority === 'low' ? 'bg-green-500' :
                      'bg-blue-500'
                    }`}></div>
                    
                    <div class="flex flex-col flex-grow overflow-hidden">
                      <span
                        class:line-through={task.isCompleted}
                        class:opacity-60={task.isCompleted}
                        class={`font-medium text-sm truncate ${isDarkMode ? 'text-zinc-200' : 'text-gray-800'}`}
                      >
                        {task.title || task.description || 'No Title'}
                      </span>
                      {#if task.dueTime}
                        <span class={`text-xs ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
                          Due: {(() => {
                            const [h, m] = (task.dueTime || '').split(':');
                            const hour = parseInt(h);
                            const ampm = hour >= 12 ? 'PM' : 'AM';
                            const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                            return `${h12}:${m} ${ampm}`;
                          })()}
                        </span>
                      {/if}
                    </div>
                    <!-- Chevron icon -->
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class={`w-4 h-4 flex-shrink-0 transition-transform group-hover:translate-x-0.5 ${isDarkMode ? 'text-zinc-400' : 'text-gray-400'}`}>
                      <path stroke-linecap="round" stroke-linejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                {/each}
              {:else if data?.tasks}
                <div class={`text-center py-8 ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>
                  <p class="text-sm">No tasks due today!</p>
                  <p class="text-xs mt-1 opacity-75">{getRandomMessage()}</p>
                </div>
              {:else if !data?.error}
                <p class={`italic text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Loading tasks...</p>
              {/if}
            </div>
            <a href="/kanban" class={`text-sm font-medium hover:underline mt-auto pt-2 flex-shrink-0 flex items-center gap-1 ${isDarkMode ? 'text-blue-400' : 'text-blue-600'}`}>
              View all tasks
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-3.5 h-3.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </a>
          </div>
        </section>

        <section class={`notes-section rounded-xl p-4 flex flex-col justify-between relative shadow-sm ${isDarkMode ? 'bg-zinc-700 border border-zinc-600' : 'bg-white border border-gray-200'}`}>
          <div class="flex justify-between items-center mb-4 flex-shrink-0">
            <h2 class={`text-lg font-semibold flex items-center gap-2 ${isDarkMode ? 'text-zinc-100' : 'text-gray-700'}`}>
              Notes
              {#if data?.notes && data.notes.length > 0}
                <span class={`text-xs font-normal px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'}`}>
                  {data.notes.length}
                </span>
              {/if}
            </h2>
            <div class="flex items-center gap-1">
              <button
                type="button"
                on:click={refreshData}
                disabled={isRefreshingNotes || isRefreshingTasks}
                class={`p-1.5 rounded-lg disabled:opacity-50 disabled:cursor-wait transition-colors ${isDarkMode ? 'hover:bg-zinc-600 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`}
                aria-label="Refresh Data"
              >
                {#if isRefreshingNotes || isRefreshingTasks}
                  <svg class="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                {:else}
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                {/if}
              </button>
              <button
                type="button"
                on:click={openAddNoteForm}
                class="ml-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl p-2.5 w-10 h-10 flex items-center justify-center shadow-lg hover:from-blue-600 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-150 ease-in-out z-20 transform hover:scale-105"
                aria-label="Add New Note"
                transition:scale={{ duration: 150, start: 0.8, opacity: 0.5 }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5"><path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" /></svg>
              </button>
            </div>
          </div>
          <div class="flex-grow overflow-y-auto mb-4 pr-2 -mr-2 custom-scrollbar">
            {#if data?.error && !data?.notes}
              <p class={`italic text-sm text-red-500`}>Error loading notes: {data.error}</p>
            {:else if data?.notes && data.notes.length > 0}
              <div class="space-y-3">
                {#each data.notes as note (note.id)}
                  <div class={`note-card rounded-xl p-3.5 flex justify-between items-start group relative transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${isDarkMode ? 'bg-zinc-600 border border-zinc-500 hover:bg-zinc-550' : 'bg-gradient-to-br from-yellow-50/50 to-amber-50/30 border border-yellow-200/50 hover:border-yellow-300/70'}`}>
                    <div class="flex-grow pr-2 overflow-hidden">
                      <h3 class={`font-semibold text-base truncate ${isDarkMode ? 'text-zinc-100' : 'text-gray-800'}`}>{note.title}</h3>
                      {#if expandedNoteId !== note.id}
                        <p class={`text-sm truncate mt-1 ${isDarkMode ? 'text-zinc-300' : 'text-gray-600'}`}>{note.content}</p>
                      {/if}
                      {#if expandedNoteId === note.id}
                        <div class="mt-2 space-y-1" transition:slide={{duration: 200}}>
                          <p class={`text-sm whitespace-pre-wrap break-words ${isDarkMode ? 'text-zinc-200' : 'text-gray-700'}`}>{note.content}</p>
                          {#if note.createdAt}
                            <p class={`text-xs pt-1 ${isDarkMode ? 'text-zinc-400' : 'text-gray-400'}`}>Created: {new Date(note.createdAt).toLocaleString()}</p>
                          {/if}
                        </div>
                      {/if}
                    </div>
                    <div class="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                      <button type="button" on:click={() => openEditNoteForm(note)} class={`p-1 rounded ${isDarkMode ? 'hover:bg-zinc-600 text-zinc-400' : 'hover:bg-gray-200 text-gray-500'}`} aria-label="Edit Note">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4" aria-hidden="true"><path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" /><path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" /></svg>
                      </button>
                      <button
                        type="button"
                        on:click={() => { pendingDeleteNoteId = note.id; showDeleteConfirmation = true; }}
                        class={`p-1 rounded ${isDarkMode ? 'hover:bg-zinc-600 text-zinc-400' : 'hover:bg-gray-200 text-gray-500'}`}
                        aria-label="Delete Note"
                        title="Delete Note"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4" aria-hidden="true"><path fill-rule="evenodd" d="M6 2.5A1.5 1.5 0 017.5 1h5A1.5 1.5 0 0114 2.5V3h3a.5.5 0 010 1h-.445l-.717 11.078A2.5 2.5 0 0113.35 17H6.65a2.5 2.5 0 01-2.488-1.922L3.45 4H3a.5.5 0 010-1h3v-.5zM8 6a.5.5 0 00-.5.5v7a.5.5 0 001 0v-7A.5.5 0 008 6zm4 0a.5.5 0 00-.5.5v7a.5.5 0 001 0v-7A.5.5 0 0012 6zM7 3v-.5a.5.5 0 00-.5-.5h-.5V3h1z" clip-rule="evenodd"/></svg>
                      </button>
                      <button
                        type="button"
                        on:click={() => { expandedNoteId = expandedNoteId === note.id ? null : note.id; }}
                        class={`p-1 rounded ${isDarkMode ? 'hover:bg-zinc-600 text-zinc-400' : 'hover:bg-gray-200 text-gray-500'}`}
                        aria-label={expandedNoteId === note.id ? 'Collapse Note' : 'Expand Note'}
                        transition:scale={{duration:100}}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4 transition-transform duration-200" style:transform={expandedNoteId === note.id ? 'rotate(180deg)' : 'rotate(0deg)'} aria-hidden="true"><path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.23 8.29a.75.75 0 01.02-1.06z" clip-rule="evenodd" /></svg>
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {:else if data?.notes}
              <p class={`italic text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>No notes yet. Click the '+' to add one!</p>
            {:else if !data?.error}
              <p class={`italic text-sm ${isDarkMode ? 'text-zinc-400' : 'text-gray-500'}`}>Loading notes...</p>
            {/if}
          </div>
          
        </section>
      </main>

      <!-- Calendar AI Panel -->
      <CalendarAIPanel
        {isDarkMode}
        tasks={data?.tasks || []}
        bind:isOpen={isAIPanelOpen}
        on:createTask={async (e) => {
          const task = e.detail;
          const formData = new FormData();
          formData.append('title', task.title);
          formData.append('description', task.description || '');
          formData.append('dueDate', task.dueDate);
          if (task.dueTime) formData.append('dueTime', task.dueTime);
          formData.append('priority', task.priority || 'standard');
          
          try {
            const response = await fetch('?/addTask', {
              method: 'POST',
              body: formData
            });
            if (response.ok) {
              await invalidateAll();
            }
          } catch (error) {
            console.error('Error creating task from AI:', error);
          }
        }}
        on:selectTask={(e) => {
          // Navigate to tasks page with task ID to open the task there
          goto(`/tasks?taskId=${e.detail.taskId}`);
        }}
      />
    </div>
  </div>

  {#if showNoteForm}
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm"
      on:click|self={closeForm}  transition:fade={{ duration: 150 }}
    >
      <div
        class={`rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden ${isDarkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-white text-gray-800'}`}
        role="dialog" aria-modal="true" aria-labelledby="note-modal-title"
        on:click|stopPropagation transition:scale={{ duration: 200, start: 0.95, opacity: 0.5 }}
      >
        <div class={`flex justify-between items-center p-4 sm:p-5 border-b flex-shrink-0 ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}>
          <h3 id="note-modal-title" class="text-lg sm:text-xl font-semibold">
            {editingNoteId ? 'Edit Note' : 'Add Note'}
          </h3>
          <button
            type="button"
            class={`p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 ${isDarkMode ? 'text-zinc-400 hover:bg-zinc-700 focus:ring-zinc-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:ring-gray-400'}`}
            on:click={closeForm}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          id="note-modal-form" 
          method="POST"
          action={editingNoteId ? '?/editNote' : '?/addNote'}
          use:enhance={noteFormEnhanceCallback}
          class={`flex-grow flex flex-col overflow-y-auto p-4 sm:p-5 custom-scrollbar relative`}
        >
        <!-- Delete confirmation moved to a global modal (see below) -->
          {#if editingNoteId} <input type="hidden" name="id" value={editingNoteId} /> {/if}

          <div class="mb-4">
            <label for="title" class="block text-sm font-medium mb-1">Title <span class="text-red-500">*</span></label>
            <input type="text" id="title" name="title" bind:value={noteTitle} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 placeholder-zinc-500' : 'border-gray-300 text-gray-800 placeholder-gray-400'}`} required />
          </div>

          <div class="mb-4 flex-grow flex flex-col">
            <label for="content" class="block text-sm font-medium mb-1">Content <span class="text-red-500">*</span></label>
            <textarea id="content" name="content" bind:value={noteContent} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 flex-grow min-h-[150px] sm:min-h-[200px] shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 placeholder-zinc-500' : 'border-gray-300 text-gray-800 placeholder-gray-400'}`} required ></textarea>
          </div>

          <div class={`flex flex-col sm:flex-row justify-end gap-3 mt-auto pt-4 border-t -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 px-4 py-3 sm:px-5 sm:py-3 rounded-b-lg flex-shrink-0 ${isDarkMode ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-50 border-gray-200'}`}>
            {#if editingNoteId}
              <button
                type="button" 
                on:click={(event) => { event.preventDefault(); showDeleteConfirmation = true; }}
                class="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150 order-3 sm:order-1"
              > Delete </button>
            {/if}
            <button type="button" class={`w-full sm:w-auto px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 order-2 sm:order-2 ${isDarkMode ? 'bg-zinc-600 text-zinc-300 hover:bg-zinc-500 focus:ring-zinc-500' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400'}`} on:click={closeForm}> Cancel </button>
            <button type="submit" class="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150 order-1 sm:order-3"> {editingNoteId ? 'Update Note' : 'Add Note'} </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  {#if showDeleteConfirmation}
    <div
      class="fixed inset-0 z-[80] flex items-center justify-center bg-black bg-opacity-30 backdrop-blur-sm"
      on:click|self={() => { showDeleteConfirmation = false; pendingDeleteNoteId = null; }}
      transition:fade={{ duration: 100 }}
    >
      <div
        class={`rounded-lg shadow-xl p-6 w-full max-w-sm mx-4 ${isDarkMode ? 'bg-zinc-700 text-zinc-300' : 'bg-white text-gray-800'}`}
        on:click|stopPropagation
        role="alertdialog"
        aria-labelledby="confirm-delete-title-global"
        aria-describedby="confirm-delete-desc-global"
        transition:scale={{ duration: 150, start: 0.95, opacity: 0.5 }}
      >
        <h4 id="confirm-delete-title-global" class="text-lg font-semibold mb-2">Confirm Deletion</h4>
        <p id="confirm-delete-desc-global" class="text-sm mb-4">Are you sure you want to delete this note? This action cannot be undone.</p>
        <div class="flex justify-end gap-3">
          <button
            type="button"
            class={`px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 ${isDarkMode ? 'bg-zinc-600 text-zinc-300 hover:bg-zinc-500 focus:ring-zinc-500' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400'}`}
            on:click={() => { showDeleteConfirmation = false; pendingDeleteNoteId = null; }}
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-150"
            on:click={confirmDelete}
          >
            Confirm Delete
          </button>
        </div>
      </div>
    </div>

  {/if}

  {#if showTaskForm}
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm"
      on:click|self={closeTaskForm} transition:fade={{ duration: 150 }}
    >
      <div
        class={`rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden ${isDarkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-white text-gray-800'}`}
        role="dialog" aria-modal="true" aria-labelledby="task-modal-title"
        on:click|stopPropagation transition:scale={{ duration: 200, start: 0.95, opacity: 0.5 }}
      >
        <div class={`flex justify-between items-center p-4 sm:p-5 border-b flex-shrink-0 ${isDarkMode ? 'border-zinc-700' : 'border-gray-200'}`}>
          <h3 id="task-modal-title" class="text-lg sm:text-xl font-semibold"> Add New Task </h3>
          <button
            type="button"
            class={`p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 ${isDarkMode ? 'text-zinc-400 hover:bg-zinc-700 focus:ring-zinc-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:ring-gray-400'}`}
            on:click={closeTaskForm}
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-6 h-6">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form
          method="POST"
          action="?/addTask"
          use:enhance={taskAddFormEnhanceCallback}
          class={`flex-grow flex flex-col overflow-y-auto p-4 sm:p-5 custom-scrollbar space-y-4`}
        >
          <div>
            <label for="task-title" class="block text-sm font-medium mb-1">Task Title <span class="text-red-500">*</span></label>
            <input type="text" id="task-title" name="title" bind:value={taskTitle} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 placeholder-zinc-500' : 'border-gray-300 text-gray-800 placeholder-gray-400'}`} required />
          </div>
          <div>
            <label for="task-description" class="block text-sm font-medium mb-1">Description</label>
            <textarea id="task-description" name="description" bind:value={taskDescription} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-h-[80px] ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 placeholder-zinc-500' : 'border-gray-300 text-gray-800 placeholder-gray-400'}`} ></textarea>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="task-due-date" class="block text-sm font-medium mb-1">Due Date (Optional)</label>
              <input type="date" id="task-due-date" name="dueDate" bind:value={taskDueDate} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 calendar-picker-dark' : 'border-gray-300 text-gray-800'}`} />
            </div>
            <div>
              <label for="task-due-time" class="block text-sm font-medium mb-1">Due Time (Optional)</label>
              <input type="time" id="task-due-time" name="dueTime" bind:value={taskDueTime} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 calendar-picker-dark' : 'border-gray-300 text-gray-800'}`} />
            </div>
          </div>

          <div>
            <label for="task-priority" class="block text-sm font-medium mb-1">Priority</label>
            <select id="task-priority" name="priority" bind:value={taskPriority} class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'border-gray-300 text-gray-800 bg-white'}`}>
              <option value="low">Low</option>
              <option value="standard" selected>Standard</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label for="task-tags" class="block text-sm font-medium mb-1">Tags (comma-separated)</label>
            <input type="text" id="task-tags" name="tags" bind:value={taskTags} placeholder="e.g., work, personal, urgent" class={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300 placeholder-zinc-500' : 'border-gray-300 text-gray-800 placeholder-gray-400'}`} />
          </div>

        <div class={`flex flex-col sm:flex-row justify-end gap-3 mt-auto pt-4 border-t -mx-4 -mb-4 sm:-mx-5 sm:-mb-5 px-4 py-3 sm:px-5 sm:py-3 rounded-b-lg flex-shrink-0 ${isDarkMode ? 'bg-zinc-700 border-zinc-600' : 'bg-gray-50 border-gray-200'}`}>
          <button type="button" class={`w-full sm:w-auto px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors duration-150 ${isDarkMode ? 'bg-zinc-600 text-zinc-300 hover:bg-zinc-500 focus:ring-zinc-500' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400'}`} on:click={closeTaskForm}> Cancel </button>
          <button type="submit" class="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-150"> Add Task </button>
        </div>
      </form>
    </div>
  </div>
{/if}

</div>

<style>
  .font-sans {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  :global(body, html) {
    height: 100%; margin: 0; padding: 0; overflow: hidden; 
  }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
  ::-webkit-scrollbar-thumb { background: #c5c5c5; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
  .custom-scrollbar { scrollbar-width: thin; scrollbar-color: #c5c5c5 #f1f1f1; }
  :global(.dark) ::-webkit-scrollbar-track { background: #2d3748; }
  :global(.dark) ::-webkit-scrollbar-thumb { background: #4a5568; }
  :global(.dark) ::-webkit-scrollbar-thumb:hover { background: #718096; }
  :global(.dark) .custom-scrollbar { scrollbar-color: #4a5568 #2d3748; }

  .relative { position: relative; }

  .ai-speech-bubble {
    position: absolute;
    bottom: calc(100% + 8px); 
    left: 50%;
    transform: translateX(-50%) translateY(10px); 
    background-color: white;
    color: #374151; 
    padding: 8px 12px;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
    z-index: 45; 
    opacity: 0;
    transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
    pointer-events: none; 
  }
  .ai-speech-bubble.visible {
    opacity: 1;
    transform: translateX(-50%) translateY(0px); 
  }
  .ai-speech-bubble::after { 
    content: ""; position: absolute; top: 100%; left: 50%;
    margin-left: -6px; border-width: 6px; border-style: solid;
    border-color: white transparent transparent transparent;
    transition: border-color 0.2s;
  }
  :global(.dark) .ai-speech-bubble {
    background-color: #374151; color: #d1d5db; 
    box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -1px rgba(0,0,0,0.15);
  }
  :global(.dark) .ai-speech-bubble::after {
    border-color: #374151 transparent transparent transparent;
  }

  #aiChatHeader { cursor: grab; }
  #aiChatHeader.grabbing { cursor: grabbing !important; }
  .user-select-none { user-select: none; -webkit-user-select: none; -ms-user-select: none; }
  
  #chatMessages:not(:has(.initial-prompt)) .initial-prompt { display: none; }
   #chatMessages > div:not(.initial-prompt) { 
      margin-bottom: 0.75rem; padding: 0.625rem 0.875rem;
      border-radius: 0.5rem; max-width: 80%;
      line-height: 1.4; word-wrap: break-word; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
   }
   #chatMessages > div[class*="bg-blue-500"], #chatMessages > div[class*="bg-blue-700"] { 
      align-self: flex-end; margin-left: auto;
   }
   #chatMessages > div[class*="bg-gray-200"], #chatMessages > div[class*="bg-zinc-700"] { 
      align-self: flex-start; margin-right: auto;
   }
    #chatMessages > #aiTyping {
      font-style: italic; box-shadow: none; padding: 0.5rem 0.875rem;
   }
  .chat-expanded { 
    display: flex !important; flex-direction: column;
    z-index: 1000 !important; border-radius: 0 !important;
    border: none !important; box-shadow: none !important;
  }
  .chat-expanded #chatMessages {
    padding: 1rem 5% !important; overflow-y: auto;
    position: relative; z-index: 10; flex-grow: 1;
  }
  .chat-expanded #chatMessages:not(:has(.initial-prompt)) {
    align-items: flex-start !important; justify-content: flex-start !important;
  }
  .chat-expanded #chatMessages > div:not(.initial-prompt) {
      margin-bottom: 1rem; padding: 0.75rem 1rem;
      border-radius: 0.75rem; max-width: 90%;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
  .chat-expanded #chatInput {
      border-color: #d1d5db;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      font-size: 1rem; padding: 0.75rem 3rem 0.75rem 1rem;
  }
  :global(.dark) .chat-expanded #chatInput {
      border-color: #4b5563;
  }
  .hidden { display: none !important; }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
  :global(.dark .top-header) { background-color: #1f2937; border-bottom-color: #374151; }
  :global(.dark .top-header .logo span) { color: #f3f4f6; }
  :global(.dark .dropdown-window) { background-color: #374151; border-color: #4b5563; color: #f3f4f6; }
  :global(.dark input), :global(.dark textarea), :global(.dark select) {
    background-color: #374151 !important; color: #f3f4f6 !important;
    border-color: #4b5563 !important;
  }
   :global(.dark input::placeholder), :global(.dark textarea::placeholder) { color: #6b7280; }
   :global(.dark .calendar-picker-dark::-webkit-calendar-picker-indicator) { filter: invert(0.8); }
  :global(a.bg-blue-600 svg), :global(a.bg-blue-800 svg) { fill: white !important; stroke: white !important; }
  :global(a.bg-blue-600 img), :global(a.bg-blue-800 img) { filter: brightness(0) invert(1); }
  :global(.dark .bg-zinc-800) { background-color: #1f2937; }
  :global(.dark .bg-zinc-700) { background-color: #374151; }
  :global(.dark .border-zinc-700) { border-color: #374151; }
  :global(.dark .border-zinc-600) { border-color: #4b5563; }
  :global(.dark .text-zinc-100) { color: #f3f4f6; }
  :global(.dark .text-zinc-300) { color: #d1d5db; }
  :global(.dark .text-zinc-400) { color: #9ca3af; }
  :global(.dark .text-zinc-500) { color: #6b7280; }
  :global(.dark .bg-zinc-600) { background-color: #4b5563; }
  :global(.dark .hover\:bg-zinc-700:hover) { background-color: #4b5563; } 
  :global(.dark .hover\:bg-zinc-600:hover) { background-color: #6b7280; } 
  :global(.dark .hover\:bg-zinc-500:hover) { background-color: #6b7280; } 
  :global(.dark .border-zinc-500) { border-color: #6b7280; }            
  :global(.dark .bg-blue-800) { background-color: #1d4ed8; }          
  :global(.dark .text-blue-400) { color: #60a5fa; }     
  
  
</style>
