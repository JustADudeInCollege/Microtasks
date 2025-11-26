<script lang="ts">
    import { onMount } from 'svelte';
    import { writable } from 'svelte/store';
    import { page } from '$app/stores'; // Needed for sidebar active link
    import { slide, scale, fly, fade } from 'svelte/transition'; // For transitions
    import { quintOut } from 'svelte/easing'; // For transitions
    import { goto } from '$app/navigation'; // For logout redirect
    import { browser } from '$app/environment'; // For browser-specific code

    let isSidebarOpen = false;
    let isDarkMode = false; // This will be the main dark mode state

    const dropdownIds = ['notifWindow', 'helpWindow', 'profileWindow'];

    // Functions from home/+page.svelte
    function toggleDarkMode() {
        isDarkMode = !isDarkMode;
        if (browser) {
            document.body.classList.toggle('dark', isDarkMode);
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        }
    }

    function toggleSidebar() {
        isSidebarOpen = !isSidebarOpen;
    }

    function toggleWindow(id: string) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('hidden');
    }

    function closeOtherWindows(currentId: string) {
        dropdownIds.forEach(id => {
            if (id !== currentId) {
                const el = document.getElementById(id);
                if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
            }
        });
    }

    function handleLogout() {
        if (browser) {
            localStorage.removeItem('microtask_username');
            document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
            goto('/login');
        }
    }

    const handleEscKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            if (isSidebarOpen) closeSidebar();
        }
    };

    function closeSidebar() {
        isSidebarOpen = false;
    }

    onMount(() => {
        if (browser) {
            const savedTheme = localStorage.getItem('theme');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            isDarkMode = savedTheme === 'dark' || (!savedTheme && prefersDark);
            document.body.classList.toggle('dark', isDarkMode);
        }

        const setupIconListener = (iconId: string, windowId: string) => {
            const iconElement = document.getElementById(iconId);
            if (iconElement) {
                iconElement.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleWindow(windowId);
                    closeOtherWindows(windowId);
                });
            }
        };
        setupIconListener('bellIcon', 'notifWindow');
        setupIconListener('helpIcon', 'helpWindow');
        setupIconListener('profileIcon', 'profileWindow');
        const darkModeButton = document.getElementById('darkModeToggle');
        if (darkModeButton) darkModeButton.addEventListener('click', toggleDarkMode);
        
        const handleGlobalClick = (event: MouseEvent) => {
            const target = event.target as Node | null;
            let isClickInsideHeaderDropdownTrigger = false;
            const headerTriggerIds = ['bellIcon', 'helpIcon', 'profileIcon'];
            headerTriggerIds.forEach(triggerId => {
                const triggerEl = document.getElementById(triggerId);
                if (triggerEl && triggerEl.contains(target)) isClickInsideHeaderDropdownTrigger = true;
            });
            let isClickInsideHeaderDropdownWindow = false;
            dropdownIds.forEach(windowId => {
                const windowEl = document.getElementById(windowId);
                if (windowEl && windowEl.contains(target)) isClickInsideHeaderDropdownWindow = true;
            });
            if (!isClickInsideHeaderDropdownTrigger && !isClickInsideHeaderDropdownWindow) {
                closeOtherWindows('');
            }
            const sidebarEl = document.getElementById('sidebar');
            const hamburgerButton = document.getElementById('hamburgerButton');
            if (isSidebarOpen && sidebarEl && !sidebarEl.contains(target) && hamburgerButton && !hamburgerButton.contains(target)) {
                closeSidebar();
            }
        };
        document.addEventListener('click', handleGlobalClick);
        document.addEventListener('keydown', handleEscKey);

        return () => {
            document.removeEventListener('click', handleGlobalClick);
            document.removeEventListener('keydown', handleEscKey);
        };
    });
</script>

<style>
    /* Styles copied from home/+page.svelte */
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

    .top-header {
        position: fixed; top: 0; left: 0; right: 0;
        display: flex; align-items: center; justify-content: space-between;
        padding: 0 1rem; height: 60px; z-index: 40;
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
    .top-header .logo {
        display: flex; align-items: center; gap: 0.5rem;
        font-weight: 600; font-size: 1.125rem; text-decoration: none;
    }
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
    .relative { position: relative; }
    .dropdown-window {
        position: absolute; right: 0; top: calc(100% + 8px);
        border-radius: 0.5rem; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        padding: 0.75rem; width: 260px; z-index: 50;
        opacity: 0; transform: translateY(-5px) scale(0.98);
        transition: opacity 0.15s ease-out, transform 0.15s ease-out;
        pointer-events: none; visibility: hidden;
    }
    .dropdown-window:not(.hidden) {
        opacity: 1; transform: translateY(0) scale(1);
        pointer-events: auto; visibility: visible;
    }

    /* Dark mode specific styles from home/+page.svelte */
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

    /* Original dark theme for body - adapt colors as needed */
    body.dark {
        background-color: #1f2937; /* Example: bg-zinc-800 */
        color: #d1d5db; /* Example: text-zinc-300 */
    }
    body.dark header {
        background-color: #374151; /* Example: bg-zinc-700 */
        border-color: #4b5563; /* Example: border-zinc-600 */
    }
    body.dark header h1,
    body.dark header a {
        color: #f3f4f6; /* Example: text-zinc-100 for header elements */
    }
    body.dark main h1, 
    body.dark main h2, 
    body.dark main h3 {
        color: #f3f4f6; /* Example: text-zinc-100 for main content headings */
    }
    body.dark main p, 
    body.dark main li {
        color: #d1d5db; /* Example: text-zinc-300 for main content text */
    }
    /* Adapting Tailwind classes for dark mode */
    body.dark .bg-gray-100 { background-color: #1f2937; } /* Overrides light mode body bg */
    body.dark .bg-white {
         background-color: #374151; /* Example: bg-zinc-700 for cards */
         border-color: #4b5563; /* Example: border-zinc-600 for cards */
    }
    body.dark .text-gray-800 { color: #f3f4f6; }
    body.dark .text-gray-700 { color: #e5e7eb; }
    body.dark .text-gray-600 { color: #d1d5db; }
    body.dark .border-gray-200 { border-color: #4b5563; }
    body.dark .border-gray-300 { border-color: #52525b; }
    body.dark footer.bg-gray-200 { /* Specificity for footer */
        background-color: #374151;
        color: #9ca3af;
        border-color: #4b5563;
    }
    body.dark .text-blue-500 {
        color: #60a5fa; /* Example: text-blue-400 */
    }
</style>

<div class={`flex h-screen font-sans ${isDarkMode ? 'dark bg-zinc-900 text-zinc-300' : 'bg-gray-100 text-gray-800'}`}>
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
                    <a href="/home" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:bg-blue-600={!isDarkMode && $page.url.pathname === '/home'} class:bg-blue-800={isDarkMode && $page.url.pathname === '/home'} class:text-white={$page.url.pathname === '/home'} class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode}>
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
                    <a href="/ai-chat" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode} class:text-gray-700={!isDarkMode} class:text-zinc-300={isDarkMode}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path d="M12.001 2.504a2.34 2.34 0 00-2.335 2.335v.583c0 .582.212 1.13.582 1.556l.03.035-.03.034a2.34 2.34 0 00-2.917 3.916A3.287 3.287 0 004.08 14.25a3.287 3.287 0 003.287 3.287h8.266a3.287 3.287 0 003.287-3.287 3.287 3.287 0 00-1.253-2.583 2.34 2.34 0 00-2.917-3.916l-.03-.034.03-.035c.37-.425.582-.973.582-1.555v-.583a2.34 2.34 0 00-2.335-2.336h-.002zM9.75 12.75a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" /><path fill-rule="evenodd" d="M12 1.5c5.79 0 10.5 4.71 10.5 10.5S17.79 22.5 12 22.5 1.5 17.79 1.5 12 6.21 1.5 12 1.5zM2.85 12a9.15 9.15 0 019.15-9.15 9.15 9.15 0 019.15 9.15 9.15 9.15 0 01-9.15 9.15A9.15 9.15 0 012.85 12z" clip-rule="evenodd" /></svg>
                        <span>Ask Synthia</span>
                    </a>
                    <a href="/support" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150" class:bg-blue-600={!isDarkMode && $page.url.pathname === '/support'} class:bg-blue-800={isDarkMode && $page.url.pathname === '/support'} class:text-white={$page.url.pathname === '/support'} class:hover:bg-gray-100={!isDarkMode} class:hover:bg-zinc-700={isDarkMode}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.042.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clip-rule="evenodd" /></svg>
                        <span>Support</span>
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
                        <ul class="list-disc list-inside space-y-1 text-xs"><li>How do I add a task?</li><li>Where is the calendar?</li></ul>
                        <a href="/support" class="text-xs text-blue-600 hover:underline mt-2 block">Visit Support</a>
                    </div>
                </div>
                <div class="relative">
                    <button id="profileIcon" aria-label="Profile Menu">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M18.685 19.097A9.723 9.723 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 003.065 7.097A9.716 9.716 0 0012 21.75a9.716 9.716 0 006.685-2.653zm-12.54-1.285A7.486 7.486 0 0112 15a7.486 7.486 0 015.855 2.812A8.224 8.224 0 0112 20.25a8.224 8.224 0 01-5.855-2.438zM15.75 9a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" clip-rule="evenodd" /></svg>
                    </button>
                    <div id="profileWindow" class={`dropdown-window hidden ${isDarkMode ? 'bg-zinc-700 border-zinc-600 text-zinc-300' : 'bg-white border-gray-200 text-gray-700'}`}>
                        <h3 class="font-semibold mb-2 text-sm">Profile</h3>
                        <p class="text-xs mb-2 truncate">Welcome, User!</p>
                        <button on:click={handleLogout} class={`text-xs px-2 py-1.5 rounded w-full text-left transition-colors duration-150 ${isDarkMode ? 'bg-red-700 hover:bg-red-600 text-zinc-300' : 'bg-red-100 hover:bg-red-200 text-red-700'}`}>Logout</button>
                    </div>
                </div>
                <button id="darkModeToggle" aria-label="Toggle Dark Mode" class={`ml-2 p-1.5 rounded-full transition-colors duration-150 ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-300' : 'hover:bg-gray-100 text-gray-700'}`}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5">
                        {#if isDarkMode} <path fill-rule="evenodd" d="M9.528 1.718a.75.75 0 0 0-.103.103l1.132 1.132a.75.75 0 0 0 1.06 0l1.132-1.132a.75.75 0 0 0-.103-1.06l-1.132-1.132a.75.75 0 00-1.06 0L9.63 1.615a.75.75 0 00-.102.103ZM12 3.75a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75ZM18.282 5.282a.75.75 0 0 0-1.06 0l-1.132 1.132a.75.75 0 00.103 1.06l1.132 1.132a.75.75 0 001.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 000-.103ZM19.5 12a.75.75 0 01-.75.75h-1.5a.75.75 0 01 0-1.5h1.5a.75.75 0 01 .75.75ZM18.282 18.718a.75.75 0 00 0 1.06l1.132 1.132a.75.75 0 00 1.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 00-1.06 0l-1.132 1.132a.75.75 0 00 .103.103ZM12 18.75a.75.75 0 01-.75.75h-1.5a.75.75 0 01 0-1.5h1.5a.75.75 0 01 .75.75ZM5.718 18.718a.75.75 0 00 1.06 0l1.132-1.132a.75.75 0 00-.103-1.06l-1.132-1.132a.75.75 0 00-1.06 0L4.586 17.686a.75.75 0 00 .103 1.06l1.132 1.132a.75.75 0 00 0 .103ZM4.5 12a.75.75 0 01 .75-.75h1.5a.75.75 0 01 0 1.5h-1.5a.75.75 0 01-.75-.75ZM5.718 5.282a.75.75 0 00 0-1.06l-1.132-1.132a.75.75 0 00-1.06 0L2.39 4.114a.75.75 0 00 .103 1.06l1.132 1.132a.75.75 0 00 1.06 0l1.132-1.132a.75.75 0 00-.103-.103ZM12 6.75a5.25 5.25 0 01 5.25 5.25 5.25 5.25 0 01-5.25 5.25 5.25 5.25 0 01-5.25-5.25 5.25 5.25 0 01 5.25-5.25Z" clip-rule="evenodd" />
                        {:else} <path fill-rule="evenodd" d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM12 16.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 01 0 9Z" clip-rule="evenodd" /> {/if}
                    </svg>
                </button>
            </div>
        </header>

        <div class="flex-1 overflow-y-auto pt-[60px] pb-20 flex flex-col">
            <main class="container mx-auto py-10 px-6">
                <h1 class="text-3xl font-bold text-gray-800 mb-6">Support Page</h1>

                <section class="mb-8">
                    <h2 class="text-2xl font-semibold text-gray-700 mb-4">Frequently Asked Questions</h2>
                    <div class="space-y-4">
                        <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <h3 class="text-lg font-semibold text-gray-800 mb-2">How do I create a new task?</h3>
                            <p class="text-sm text-gray-600">
                                To create a new task, click on the "Add Task" button on the dashboard and fill in the details.
                            </p>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <h3 class="text-lg font-semibold text-gray-800 mb-2">Where can I see my completed tasks?</h3>
                            <p class="text-sm text-gray-600">
                                You can view your completed tasks in the "Completed Tasks" section of your profile.
                            </p>
                        </div>
                         <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <h3 class="text-lg font-semibold text-gray-800 mb-2">How do I edit a task?</h3>
                            <p class="text-sm text-gray-600">
                               Click on the task that you want to edit, and then click on the "Edit" button.
                            </p>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <h3 class="text-lg font-semibold text-gray-800 mb-2">How do I delete a task?</h3>
                            <p class="text-sm text-gray-600">
                               Click on the task that you want to delete, and then click on the "Delete" button.
                            </p>
                        </div>
                        <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                            <h3 class="text-lg font-semibold text-gray-800 mb-2">How do I mark a task as complete?</h3>
                            <p class="text-sm text-gray-600">
                               Click on the checkbox next to the task that you want to mark as complete.
                            </p>
                        </div>
                    </div>
                </section>

                <section>
                    <h2 class="text-2xl font-semibold text-gray-700 mb-4">Contact Us</h2>
                    <p class="text-sm text-gray-600 mb-4">
                        If you have any other questions or need further assistance, please contact us using the information below.
                    </p>
                    <div class="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                        <p class="text-sm text-gray-600">Email: support@microtask.com</p>
                        <p class="text-sm text-gray-600">Phone: +123 456 7890</p>
                    </div>
                </section>
            </main>
        </div>
    </div>
</div>
