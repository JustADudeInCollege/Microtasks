<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { page } from '$app/stores'; // For active link highlighting
  import { goto } from '$app/navigation'; // For logout
  import { browser } from '$app/environment';
  import { fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import AppHeader from '$lib/components/AppHeader.svelte';

  let username = "User";
  let isSidebarOpen = false;
  let isDarkMode = false;
  let currentDateTime = "";
  let dateTimeInterval: ReturnType<typeof setInterval> | null = null;
  $: currentPath = $page.url.pathname;

  // Chat state
  let chatInput = '';
  let isTyping = false;
  let showInitialPlaceholder = true;
  let chatMessagesContainer: HTMLDivElement;
  
  const CONTEXT_WINDOW_SIZE = 10; // Number of messages to include in context
  
  interface ChatMessage {
    id: number;
    text: string;
    isUser: boolean;
    isError: boolean;
  }
  
  // For API - simplified message format
  interface APIMessage {
    role: 'user' | 'assistant';
    content: string;
  }
  
  let messages: ChatMessage[] = [];
  let messageIdCounter = 0;

  // --- Helper to get username ---
  function getStoredUsername(): string {
    if (browser) {
      return localStorage.getItem('microtask_username') || "User";
    }
    return "User";
  }

  // --- Sidebar and Dark Mode functions ---
  function toggleSidebar() { isSidebarOpen = !isSidebarOpen; }
  function closeSidebar() { isSidebarOpen = false; }

  function toggleDarkMode() {
    isDarkMode = !isDarkMode;
    if (browser) {
      document.documentElement.classList.toggle('dark', isDarkMode);
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

  function handleLogout() {
    if (browser) {
      localStorage.removeItem('microtask_username');
      document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
      goto('/login');
    }
  }

  // --- Chat functionality ---
  async function sendMessage() {
    if (!browser || !chatInput.trim() || isTyping) return;

    const userMsgText = chatInput.trim();
    chatInput = '';
    showInitialPlaceholder = false;

    // Add user message to local display
    messages = [...messages, {
      id: messageIdCounter++,
      text: userMsgText,
      isUser: true,
      isError: false
    }];

    await tick();
    scrollToBottom();

    isTyping = true;

    // Build conversation history for API (last N messages, excluding errors)
    const conversationHistory: APIMessage[] = messages
      .filter(msg => !msg.isError) // Exclude error messages
      .slice(-CONTEXT_WINDOW_SIZE) // Get last N messages
      .map(msg => ({
        role: msg.isUser ? 'user' as const : 'assistant' as const,
        content: msg.text.replace(/<[^>]*>/g, '') // Strip HTML tags for API
      }));

    // System prompt with context
    const systemPrompt = `You are Synthia, a helpful AI assistant integrated into the Microtask productivity app. 
Rules:
- Give direct, concise answers without asking follow-up questions.
- Do NOT offer to create tasks, set reminders, or log anything unless explicitly asked.
- Do NOT end responses with yes/no questions or "Would you like me to...?" prompts.
- Just answer the question directly and helpfully.
- Keep responses brief and to the point.

The user's name is ${username || 'User'}. Today's date is ${new Date().toLocaleDateString()}.`;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          messages: conversationHistory,
          systemPrompt: systemPrompt
        })
      });

      const responseData = await response.json();
      const aiReply = responseData?.reply || "Hmm, I couldn't get a response this time.";
      const hasError = responseData?.error === true;

      // Format the reply
      let formattedText = aiReply
        .replace(/(?<!\*)\*(?!\*)/g, '')
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
      console.error("[AI Chat Page] Chat API error:", error);
      messages = [...messages, {
        id: messageIdCounter++,
        text: "Oops! Something went wrong fetching the response.",
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
    if (chatMessagesContainer) {
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }
  }

  function handleKeypress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  // --- Lifecycle ---
  let globalClickListener: ((event: MouseEvent) => void) | null = null;
  let escKeyListener: ((event: KeyboardEvent) => void) | null = null;

  onMount(() => {
    username = getStoredUsername();

    if (browser) {
      const savedTheme = localStorage.getItem('theme');
      isDarkMode = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', isDarkMode);
      document.body.classList.toggle('dark', isDarkMode);

      // Update date/time
      updateDateTime();
      dateTimeInterval = setInterval(updateDateTime, 60000);
    }

    // Header icon listeners are now handled by the AppHeader component

    // Global click handler for sidebar
    globalClickListener = (event: MouseEvent) => {
        const target = event.target as Node | null;
        const sidebarEl = document.getElementById('sidebar');
        const hamburgerButton = document.getElementById('hamburgerButton');
        // Also check if click is on header icons/dropdowns - don't interfere with those
        const headerIcons = ['bellIcon', 'helpIcon', 'profileIcon', 'notifWindow', 'helpWindow', 'profileWindow'];
        const isClickOnHeader = headerIcons.some(id => {
            const el = document.getElementById(id);
            return el && el.contains(target);
        });
        if (!isClickOnHeader && sidebarEl && !sidebarEl.contains(target) && hamburgerButton && !hamburgerButton.contains(target) && isSidebarOpen) {
            closeSidebar();
        }
    };
    document.addEventListener('click', globalClickListener);

    // ESC key handler
    escKeyListener = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            if (isSidebarOpen) closeSidebar();
        }
    };
    document.addEventListener('keydown', escKeyListener);

    return () => {
        if (dateTimeInterval) clearInterval(dateTimeInterval);
        if (globalClickListener) document.removeEventListener('click', globalClickListener);
        if (escKeyListener) document.removeEventListener('keydown', escKeyListener);
    };
  });


</script>

<div class={`flex h-screen font-sans ${isDarkMode ? 'dark bg-zinc-900 text-zinc-300' : 'bg-gray-100 text-gray-800'}`}>
  {#if isSidebarOpen}
  <aside
    id="sidebar"
    class={`fixed top-0 left-0 h-full w-64 shadow-lg z-50 flex flex-col justify-between p-4 border-r
           ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}
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
          <a href="/tasks"
             class={`flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150
                    ${currentPath === '/tasks' ? (isDarkMode ? 'bg-blue-700 text-white' : 'bg-blue-600 text-white') : (isDarkMode ? 'text-zinc-300 hover:bg-zinc-700' : 'text-gray-700 hover:bg-gray-100')}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" class={`w-5 h-5 ${currentPath === '/tasks' ? 'stroke-white' : (isDarkMode ? 'stroke-zinc-300' : 'stroke-gray-700')}`}><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" /></svg>
            <span>All tasks</span>
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
    </aside>
  {/if}

  <div class="flex-1 flex flex-col overflow-hidden">
    <AppHeader {isDarkMode} {username} {currentDateTime} on:toggleSidebar={toggleSidebar} on:toggleDarkMode={toggleDarkMode} on:logout={handleLogout} />

    <!-- Main Content Area for AI Chat -->
    <div class="flex-1 flex flex-col overflow-y-auto pt-[60px]"> 
      
        <div bind:this={chatMessagesContainer} class="flex-1 flex flex-col space-y-3 p-4 sm:p-6 overflow-y-auto max-w-3xl w-full mx-auto custom-scrollbar">
            {#if showInitialPlaceholder && messages.length === 0}
            <div class="flex-1 flex flex-col justify-center items-center text-center text-gray-500 dark:text-zinc-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-20 h-20 mb-4 opacity-30" aria-hidden="true">
                    <path d="M12.001 2.504a2.34 2.34 0 00-2.335 2.335v.583c0 .582.212 1.13.582 1.556l.03.035-.03.034a2.34 2.34 0 00-2.917 3.916A3.287 3.287 0 004.08 14.25a3.287 3.287 0 003.287 3.287h8.266a3.287 3.287 0 003.287-3.287 3.287 3.287 0 00-1.253-2.583 2.34 2.34 0 00-2.917-3.916l-.03-.034.03-.035c.37-.425.582-.973.582-1.555v-.583a2.34 2.34 0 00-2.335-2.336h-.002zM9.75 12.75a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" />
                    <path fill-rule="evenodd" d="M12 1.5c5.79 0 10.5 4.71 10.5 10.5S17.79 22.5 12 22.5 1.5 17.79 1.5 12 6.21 1.5 12 1.5zM2.85 12a9.15 9.15 0 019.15-9.15 9.15 9.15 0 019.15 9.15 9.15 9.15 0 01-9.15 9.15A9.15 9.15 0 012.85 12z" clip-rule="evenodd" />
                </svg>
                <p class="text-xl font-medium">Ask Synthia Anything!</p>
                <p class="text-sm">Your personal AI assistant for Microtask.</p>
            </div>
            {/if}
            
            {#each messages as message (message.id)}
                {#if message.isUser}
                    <div class={`p-3 rounded-lg shadow-sm self-end w-max max-w-[85%] ml-auto mb-3 break-words ${isDarkMode ? 'bg-blue-700 text-blue-100' : 'bg-blue-500 text-white'}`}>
                        {message.text}
                    </div>
                {:else}
                    <div class={`p-3 rounded-lg shadow-sm self-start w-max max-w-[85%] mb-3 break-words ${
                        message.isError 
                            ? (isDarkMode ? 'bg-amber-900 text-amber-200' : 'bg-amber-100 text-amber-800')
                            : (isDarkMode ? 'bg-zinc-700 text-zinc-200' : 'bg-white text-gray-800')
                    }`}>
                        {@html message.text}
                    </div>
                {/if}
            {/each}
            
            {#if isTyping}
                <div class={`text-sm self-start italic px-3 py-2 rounded-lg shadow-sm w-max max-w-[85%] mb-3 ${isDarkMode ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-200 text-gray-600'}`}>
                    Synthia is typing...
                </div>
            {/if}
        </div>

        <div class={`p-4 border-t flex-shrink-0 ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
            <div class="relative max-w-3xl mx-auto">
                <input 
                    type="text" 
                    placeholder="Send a message to Synthia..."
                    bind:value={chatInput}
                    on:keypress={handleKeypress}
                    class={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 shadow-sm pr-12
                           ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-100 placeholder-zinc-400 focus:ring-blue-500 focus:border-blue-500'
                                       : 'border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500'}`} />
                <button 
                    on:click={sendMessage}
                    aria-label="Send Message"
                    class={`absolute right-2 top-1/2 transform -translate-y-1/2 p-2 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2
                           ${isDarkMode ? 'text-zinc-400 hover:text-blue-400 focus:ring-blue-500 focus:ring-offset-zinc-800'
                                       : 'text-gray-500 hover:text-blue-600 focus:ring-blue-500 focus:ring-offset-white'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 16 16" class="w-5 h-5">
                        <path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76z"/>
                    </svg>
                </button>
            </div>
        </div>
    </div> <!-- End of Main Content Area for AI Chat -->
  </div> <!-- End of flex-1 flex flex-col -->
</div> <!-- End of root flex h-screen -->

<style>
  .font-sans { font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  :global(body, html) { height: 100%; margin: 0; padding: 0; overflow: hidden; }

  /* Custom Scrollbars (same as other pages) */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
  ::-webkit-scrollbar-thumb { background: #c5c5c5; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
  .custom-scrollbar { scrollbar-width: thin; scrollbar-color: #c5c5c5 #f1f1f1; }
  :global(.dark) ::-webkit-scrollbar-track { background: #2d3748; }
  :global(.dark) ::-webkit-scrollbar-thumb { background: #4a5568; }
  :global(.dark) ::-webkit-scrollbar-thumb:hover { background: #718096; }
  :global(.dark) .custom-scrollbar { scrollbar-color: #4a5568 #2d3748; }



  /* Ensure SVGs in active sidebar links are white */
  :global(aside nav a.bg-blue-600 svg), :global(aside nav a.bg-blue-700 svg) {
    fill: white !important;
    stroke: white !important; /* If stroke-based */
  }
  :global(aside nav a.bg-blue-600 img), :global(aside nav a.bg-blue-700 img) { /* Keep for logonamin.png or other images */
    filter: brightness(0) invert(1);
  }

  /* Dark mode specific global styles (simplified) */
  :global(.dark .bg-zinc-900) { background-color: #18181b; }
  :global(.dark .text-zinc-300) { color: #d4d4d8; }
  :global(.dark .bg-gray-100) { background-color: #18181b; } /* Fallback if not using zinc */
  :global(.dark .text-gray-800) { color: #d4d4d8; }

  :global(.dark .bg-zinc-800) { background-color: #27272a; }
  :global(.dark .border-zinc-700) { border-color: #3f3f46; }
  :global(.dark .text-zinc-100) { color: #f4f4f5; }
  :global(.dark .hover\:bg-zinc-700:hover) { background-color: #3f3f46; }

  :global(.dark .bg-white) { background-color: #27272a; }
  :global(.dark .border-gray-200) { border-color: #3f3f46; }
  :global(.dark .text-gray-700) { color: #a1a1aa; }
  :global(.dark .placeholder-gray-400::placeholder) { color: #71717a; }

  :global(.dark .bg-blue-700) { background-color: #2563eb; } /* Adjusted active blue for dark */
  :global(.dark .text-blue-600) { color: #60a5fa; }
  :global(.dark .hover\:text-blue-800:hover) { color: #93c5fd; }
  :global(.dark .focus\:ring-blue-500:focus) { --tw-ring-color: #60a5fa; }

  /* Chat message specific dark mode (already inlined for bg-white/bg-zinc-700, but good to have) */
  :global(.dark #chatMessages .bg-blue-500) { background-color: #2563eb; } /* User message in dark */
  :global(.dark #chatMessages .bg-white) { background-color: #3f3f46; color: #e4e4e7; } /* AI message in dark */
  :global(.dark #chatMessages .bg-gray-200) { background-color: #3f3f46; color: #a1a1aa; } /* Typing indicator in dark */
  :global(.dark #initialPlaceholder) { color: #71717a; }

  /* Ensure input in dark mode is styled correctly */
  :global(.dark #chatInput) {
      background-color: #3f3f46;
      border-color: #52525b;
      color: #e4e4e7;
  }
  :global(.dark #chatInput::placeholder) {
      color: #a1a1aa;
  }
  :global(.dark #sendChat) {
      color: #a1a1aa;
  }
  :global(.dark #sendChat:hover) {
      color: #60a5fa;
  }

</style>