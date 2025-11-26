<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores'; // For active link highlighting
  import { goto } from '$app/navigation'; // For logout
  import { browser } from '$app/environment';
  import { fly } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';

  let username = "User";
  let isSidebarOpen = false;
  let isDarkMode = false;
  let currentDateTime = "";
  let dateTimeInterval: ReturnType<typeof setInterval> | null = null;
  $: currentPath = $page.url.pathname;

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

  // --- Header Dropdown functions ---
  const topHeaderDropdownIds = ['notifWindow', 'helpWindow', 'profileWindow'];
  function toggleHeaderWindow(id: string) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden');
  }
  function closeOtherHeaderWindows(currentId: string) {
    topHeaderDropdownIds.forEach(id => {
      if (id !== currentId) {
        document.getElementById(id)?.classList.add('hidden');
      }
    });
  }

  // --- Lifecycle ---
  let globalClickListener: ((event: MouseEvent) => void) | null = null;
  let escKeyListener: ((event: KeyboardEvent) => void) | null = null;

  onMount(() => {
    username = getStoredUsername();

    if (browser) {
      const savedTheme = localStorage.getItem('theme');
      isDarkMode = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.body.classList.toggle('dark', isDarkMode);

      const darkModeButton = document.getElementById('darkModeToggle');
      if (darkModeButton) darkModeButton.addEventListener('click', toggleDarkMode);

      const setupIconListener = (iconId: string, windowId: string) => {
        const iconElement = document.getElementById(iconId);
        if (iconElement) {
          iconElement.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHeaderWindow(windowId);
            closeOtherHeaderWindows(windowId);
          });
        }
      };
      setupIconListener('bellIcon', 'notifWindow');
      setupIconListener('helpIcon', 'helpWindow');
      setupIconListener('profileIcon', 'profileWindow');

      // Update date/time
      updateDateTime();
      dateTimeInterval = setInterval(updateDateTime, 60000);
    }

    // Global click handler
    globalClickListener = (event: MouseEvent) => {
        const target = event.target as Node | null;
        let isClickInsideDropdownTrigger = false;
        const triggerIds = ['bellIcon', 'helpIcon', 'profileIcon'];
        triggerIds.forEach(triggerId => {
            const triggerEl = document.getElementById(triggerId);
            if (triggerEl && triggerEl.contains(target)) isClickInsideDropdownTrigger = true;
        });
        let isClickInsideDropdownWindow = false;
        topHeaderDropdownIds.forEach(windowId => {
            const windowEl = document.getElementById(windowId);
            if (windowEl && !windowEl.classList.contains('hidden') && windowEl.contains(target)) {
                isClickInsideDropdownWindow = true;
            }
        });
        if (!isClickInsideDropdownTrigger && !isClickInsideDropdownWindow) {
            closeOtherHeaderWindows('');
        }

        const sidebarEl = document.getElementById('sidebar');
        const hamburgerButton = document.getElementById('hamburgerButton');
        if (sidebarEl && !sidebarEl.contains(target) && hamburgerButton && !hamburgerButton.contains(target) && isSidebarOpen) {
            closeSidebar();
        }
    };
    document.addEventListener('click', globalClickListener);

    // ESC key handler
    escKeyListener = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            if (isSidebarOpen) closeSidebar();
            // Potentially close other modals if this page had them
        }
    };
    document.addEventListener('keydown', escKeyListener);

    // --- Chat functionality ---
    const sendBtn = document.getElementById('sendChat');
    const chatInput = document.getElementById('chatInput') as HTMLInputElement | null;
    const chatMessages = document.getElementById('chatMessages');
    const initialPlaceholder = document.getElementById('initialPlaceholder');

    if (sendBtn && chatInput && chatMessages) {
      const handleSendMessage = async () => {
          if (!browser) return;

          const userMsgText = chatInput.value.trim();
          if (!userMsgText) return;

          const aiContextPreamble = `You are Synthia, a helpful AI assistant integrated into the Microtask productivity app. Keep your answers concise and relevant to task management, scheduling, note-taking, and general productivity. The user's name is ${username || 'User'}. Today's date is ${new Date().toLocaleDateString()}. \n\nUser query: `;
          const fullMessageToSend = aiContextPreamble + userMsgText;
          // console.log("[AI Chat Page] Sending to API:", fullMessageToSend);

          const userMsgElement = document.createElement('div');
          userMsgElement.className = `p-3 rounded-lg shadow-sm self-end w-max max-w-[85%] ml-auto mb-3 break-words ${isDarkMode ? 'bg-blue-700 text-blue-100' : 'bg-blue-500 text-white'}`;
          userMsgElement.textContent = userMsgText;

          if (initialPlaceholder && !initialPlaceholder.classList.contains('hidden')) {
              initialPlaceholder.classList.add('hidden');
          }

          chatMessages.appendChild(userMsgElement);
          chatInput.value = "";
          chatMessages.scrollTop = chatMessages.scrollHeight;

          const typingMsg = document.createElement('div');
          typingMsg.id = 'aiTyping';
          typingMsg.className = `text-sm self-start italic px-3 py-2 rounded-lg shadow-sm w-max max-w-[85%] mb-3 ${isDarkMode ? 'bg-zinc-700 text-zinc-400' : 'bg-gray-200 text-gray-600'}`;
          typingMsg.textContent = 'Synthia is typing...';
          chatMessages.appendChild(typingMsg);
          chatMessages.scrollTop = chatMessages.scrollHeight;

          try {
            const response = await fetch("/api/chat", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: fullMessageToSend })
            });

            typingMsg.remove();

            if (!response.ok) {
              throw new Error(`API request failed with status ${response.status}`);
            }

            const responseData = await response.json();
            const aiReply = responseData?.reply;
            const finalText = aiReply || "Hmm, I couldn't get a response this time.";

            let formattedText = finalText
              .replace(/(?<!\*)\*(?!\*)/g, '')
              .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.*?)\*/g, '<em>$1</em>')
              .replace(/`([^`]+)`/g, '<code>$1</code>')
              .replace(/\n/g, '<br>');

            const aiMsgElement = document.createElement('div');
            aiMsgElement.className = `p-3 rounded-lg shadow-sm self-start w-max max-w-[85%] mb-3 break-words ${isDarkMode ? 'bg-zinc-700 text-zinc-200' : 'bg-white text-gray-800'}`;
            aiMsgElement.innerHTML = formattedText;

            chatMessages.appendChild(aiMsgElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;

          } catch (error) {
            console.error("[AI Chat Page] Chat API error:", error);
            const existingTypingMsg = document.getElementById('aiTyping');
             if (existingTypingMsg) {
                existingTypingMsg.textContent = "Oops! Something went wrong fetching the response.";
                existingTypingMsg.classList.remove('italic','bg-gray-200','text-gray-600','dark:bg-zinc-700','dark:text-zinc-400');
                existingTypingMsg.classList.add('font-medium', isDarkMode ? 'text-red-400 bg-red-900' : 'text-red-600 bg-red-100');
             } else {
                 const errorMsgEl = document.createElement('div');
                 errorMsgEl.className = `font-medium text-sm self-start p-3 rounded-lg shadow-sm mb-3 ${isDarkMode ? 'text-red-400 bg-red-900' : 'text-red-600 bg-red-100'}`;
                 errorMsgEl.textContent = "Oops! Something went wrong fetching the response.";
                 chatMessages.appendChild(errorMsgEl);
             }
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
      };

      sendBtn.addEventListener('click', handleSendMessage);
      chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          handleSendMessage();
        }
      });
    } else {
        console.error("[AI Chat Page] Chat UI elements not found!");
    }

    return () => {
        if (dateTimeInterval) clearInterval(dateTimeInterval);
        if (globalClickListener) document.removeEventListener('click', globalClickListener);
        if (escKeyListener) document.removeEventListener('keydown', escKeyListener);
    };
  });

  onDestroy(() => {
    if (browser) {
        const darkModeButton = document.getElementById('darkModeToggle');
        if (darkModeButton) darkModeButton.removeEventListener('click', toggleDarkMode);
        // Potentially remove listeners from bellIcon, helpIcon, profileIcon if they were added directly
    }
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
    <div class="flex items-center gap-2 {isDarkMode ? 'text-zinc-300' : 'text-gray-600'}">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
      <span class="text-sm font-medium">{currentDateTime}</span>
    </div>
    <div class="header-icons">
        <div class="relative">
          <button id="bellIcon" aria-label="Notifications">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M5.25 9a6.75 6.75 0 0113.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 01-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 11-7.48 0c-1.673-.253-3.287-.673-4.831-1.243a.75.75 0 01-.297-1.206C4.45 13.807 5.25 11.873 5.25 9.75V9zm4.502 8.9a2.25 2.25 0 104.496 0H9.752z" clip-rule="evenodd" /></svg>
          </button>
          <div id="notifWindow" class={`dropdown-window hidden ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
            <h3 class="font-semibold mb-2 text-sm">Notifications</h3><p class="text-xs">No new notifications.</p>
          </div>
        </div>
        <div class="relative">
          <button id="helpIcon" aria-label="Help & FAQ">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.042.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" /></svg>
          </button>
          <div id="helpWindow" class={`dropdown-window hidden ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
            <h3 class="font-semibold mb-2 text-sm">FAQ</h3>
            <ul class="list-disc list-inside space-y-1 text-xs"><li>How do I use AI Chat?</li><li>Where is my profile?</li></ul>
            <a href="/support" class="text-xs text-blue-600 hover:underline mt-2 block">Visit Support</a>
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
            {#if isDarkMode} <path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 0 0-.103.103l1.132 1.132a.75.75 0 0 0 1.06 0l1.132-1.132a.75.75 0 0 0-.103-1.06l-1.132-1.132a.75.75 0 0 0-1.06 0L9.63 1.615a.75.75 0 0 0-.102.103ZM12 3.75a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5a.75.75 0 0 1 .75-.75ZM18.282 5.282a.75.75 0 0 0-1.06 0l-1.132 1.132a.75.75 0 0 0 .103 1.06l1.132 1.132a.75.75 0 0 0 1.06 0l1.132-1.132a.75.75 0 0 0-.103-1.06l-1.132-1.132a.75.75 0 0 0 0-.103ZM19.5 12a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75ZM18.282 18.718a.75.75 0 0 0 0 1.06l1.132 1.132a.75.75 0 0 0 1.06 0l1.132-1.132a.75.75 0 0 0-.103-1.06l-1.132-1.132a.75.75 0 0 0-1.06 0l-1.132 1.132a.75.75 0 0 0 .103.103ZM12 18.75a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5a.75.75 0 0 1 .75.75ZM5.718 18.718a.75.75 0 0 0 1.06 0l1.132-1.132a.75.75 0 0 0-.103-1.06l-1.132-1.132a.75.75 0 0 0-1.06 0L4.586 17.686a.75.75 0 0 0 .103 1.06l1.132 1.132a.75.75 0 0 0 0 .103ZM4.5 12a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75ZM5.718 5.282a.75.75 0 0 0 0-1.06l-1.132-1.132a.75.75 0 0 0-1.06 0L2.39 4.114a.75.75 0 0 0 .103 1.06l1.132 1.132a.75.75 0 0 0 1.06 0l1.132-1.132a.75.75 0 0 0-.103-.103ZM12 6.75a5.25 5.25 0 0 1 5.25 5.25 5.25 5.25 0 0 1-5.25 5.25 5.25 5.25 0 0 1-5.25-5.25 5.25 5.25 0 0 1 5.25-5.25Z" clip-rule="evenodd" />
            {:else} <path fill-rule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9Z" clip-rule="evenodd" /> {/if}
          </svg>
        </button>
      </div>
    </header>

    <!-- Main Content Area for AI Chat -->
    <div class="flex-1 flex flex-col overflow-y-auto pt-[60px]"> 
      

        <div id="chatMessages" class="flex-1 flex flex-col space-y-3 p-4 sm:p-6 overflow-y-auto max-w-3xl w-full mx-auto custom-scrollbar">
            <div id="initialPlaceholder" class="flex-1 flex flex-col justify-center items-center text-center text-gray-500 dark:text-zinc-400">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-20 h-20 mb-4 opacity-30" aria-hidden="true">
                    <path d="M12.001 2.504a2.34 2.34 0 00-2.335 2.335v.583c0 .582.212 1.13.582 1.556l.03.035-.03.034a2.34 2.34 0 00-2.917 3.916A3.287 3.287 0 004.08 14.25a3.287 3.287 0 003.287 3.287h8.266a3.287 3.287 0 003.287-3.287 3.287 3.287 0 00-1.253-2.583 2.34 2.34 0 00-2.917-3.916l-.03-.034.03-.035c.37-.425.582-.973.582-1.555v-.583a2.34 2.34 0 00-2.335-2.336h-.002zM9.75 12.75a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" />
                    <path fill-rule="evenodd" d="M12 1.5c5.79 0 10.5 4.71 10.5 10.5S17.79 22.5 12 22.5 1.5 17.79 1.5 12 6.21 1.5 12 1.5zM2.85 12a9.15 9.15 0 019.15-9.15 9.15 9.15 0 019.15 9.15 9.15 9.15 0 01-9.15 9.15A9.15 9.15 0 012.85 12z" clip-rule="evenodd" />
                </svg>
                <p class="text-xl font-medium">Ask Synthia Anything!</p>
                <p class="text-sm">Your personal AI assistant for Microtask.</p>
            </div>
            <!-- Chat messages will be appended here -->
        </div>

        <div class={`p-4 border-t flex-shrink-0 ${isDarkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-white border-gray-200'}`}>
            <div class="relative max-w-3xl mx-auto">
                <input id="chatInput" type="text" placeholder="Send a message to Synthia..."
                       class={`w-full border rounded-lg px-4 py-3 text-base focus:outline-none focus:ring-2 shadow-sm pr-12
                              ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-100 placeholder-zinc-400 focus:ring-blue-500 focus:border-blue-500'
                                          : 'border-gray-300 text-gray-800 placeholder-gray-400 focus:ring-blue-500 focus:border-blue-500'}`} />
                <button id="sendChat" aria-label="Send Message"
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

  /* Header Styles (copied & adapted from previous combined styles) */
  .top-header {
    position: fixed; top: 0; left: 0; right: 0;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 1rem; height: 60px; z-index: 40; /* Lowered z-index from sidebar */
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    transition: background-color 0.2s, border-color 0.2s;
  }
  .header-left { display: flex; align-items: center; gap: 0.75rem; }
  .top-header .menu-btn {
    background: none; border: none; cursor: pointer; padding: 0.5rem;
    border-radius: 9999px; transition: background-color 0.15s ease;
    display: flex; align-items: center; justify-content: center;
  }
  .top-header .menu-btn:hover { background-color: #f3f4f6; }
  :global(.dark) .top-header .menu-btn:hover { background-color: #374151; }
  .top-header .menu-btn svg { /* For SVG Hamburger */
      width: 1.5rem; height: 1.5rem; display: block;
  }

  .top-header .logo { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; font-size: 1.125rem; text-decoration: none; }
  .top-header .logo img { height: 2rem; width: auto; }

  .top-header .header-icons { display: flex; align-items: center; gap: 0.25rem; }
  .top-header .header-icons button {
    background: none; border: none; cursor: pointer; padding: 0.5rem;
    line-height: 0; display: flex; align-items: center; justify-content: center;
    border-radius: 9999px; width: 36px; height: 36px;
    transition: background-color 0.15s ease;
  }
  .top-header .header-icons button:hover { background-color: #f3f4f6; }
  :global(.dark) .top-header .header-icons button:hover { background-color: #374151; }
  .top-header .header-icons svg { /* For SVG icons in header */
    height: 1.25rem; width: 1.25rem; opacity: 0.9;
  }
   :global(.dark) .top-header .header-icons svg {
    fill: #d1d5db; /* text-zinc-300 */
  }


  .relative { position: relative; }
  .dropdown-window {
    position: absolute; right: 0; top: calc(100% + 8px);
    border-radius: 0.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    padding: 0.75rem; width: 260px; z-index: 50;
    opacity: 0; transform: translateY(-5px) scale(0.98);
    transition: opacity 0.15s ease-out, transform 0.15s ease-out, visibility 0s linear 0.15s;
    pointer-events: none; visibility: hidden;
  }
  .dropdown-window:not(.hidden) { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; visibility: visible; transition-delay: 0s; }
  .hidden { display: none !important; }

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