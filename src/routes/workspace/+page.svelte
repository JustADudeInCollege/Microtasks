<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores'; // For active link highlighting
	import { goto } from '$app/navigation'; // For logout
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation'; // Crucial for reloading data
	import type { PageData, ActionData } from './$types';
	import AppHeader from '$lib/components/AppHeader.svelte';
	import PendingInvitations from '$lib/components/PendingInvitations.svelte';
	import DatePicker from '$lib/components/DatePicker.svelte';

	export let data: PageData;
	export let form: ActionData; // This is ActionData from ./$types

	// Page state
	let username = data.user?.name || "User"; // Initialize from server, fallback
	$: boards = data.boards || []; 
	
	let pageError = data.error || null;
	let pageSuccessMessage: string | null = null;

	// UI state
	let isSidebarOpen = false;
	let isDarkMode = false; // This will be set by onMount from localStorage or system
	let currentDateTime = "";
	let dateTimeInterval: ReturnType<typeof setInterval> | null = null;
	let showLogoutConfirm = false;
	$: currentPath = $page.url.pathname;

	function getStoredUsername(): string {
		if (browser) {
			return localStorage.getItem('microtask_username') || "User";
		}
		return "User";
	}

	function toggleSidebar() { isSidebarOpen = !isSidebarOpen; }
	function closeSidebar() { isSidebarOpen = false; }

	function toggleDarkMode() {
		isDarkMode = !isDarkMode;
		if (browser) {
			document.body.classList.toggle('dark', isDarkMode);
			localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
		}
	}

	function handleLogout() {
		showLogoutConfirm = true;
	}

	function confirmLogout() {
		showLogoutConfirm = false;
		if (browser) {
			localStorage.removeItem('microtask_username');
			document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
			goto('/login'); 
		}
	}

	function cancelLogout() {
		showLogoutConfirm = false;
	}

    // Adapted from example
	const dropdownIds = ['notifWindow', 'helpWindow', 'profileWindow'];
	function toggleWindow(id: string) {
        const el = document.getElementById(id);
        if (el) {
            const isHidden = el.classList.contains('hidden');
            el.classList.toggle('hidden');
            if (isHidden) { // If it *was* hidden, and now it's being shown
                closeOtherWindows(id);
            }
        }
    }
    function closeOtherWindows(currentId: string) {
        dropdownIds.forEach(id => {
            if (id !== currentId) {
                const el = document.getElementById(id);
                // Only add if not already hidden, to avoid redundant class operations
                if (el && !el.classList.contains('hidden')) {
                    el.classList.add('hidden');
                }
            }
        });
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

	// Add Board Modal
	let showAddBoardModal = false;
	let workspaceNameInput = '';
	let isSubmittingWorkspace = false;
	let formActionError: string | null = null;

	// Delete Board Confirm Modal
	let showDeleteBoardConfirm = false;
	let boardToConfirmDelete: { id: string; title: string } | null = null;
	let isDeletingBoard = false;

	interface TemplateStep {
		text: string;
		inputPrompt?: string;
		inputType?: 'text' | 'textarea';
		requiresContext?: boolean;
	}
	interface Template {
		title: string;
		iconKey: string;
		goal: string;
		steps: TemplateStep[];
	}

	const templates: Template[] = [
		{
			title: 'Study Plan',
			iconKey: 'study',
			goal: 'Ace your exams with a structured plan.',
			steps: [
				{ text: 'Define subjects & topics to cover', inputPrompt: 'List the main subjects or topics you need to cover for your exams (e.g., "Calculus II, Organic Chemistry - Chapters 1-5, World History 1800-1900")?', inputType: 'textarea' },
				{ text: 'Allocate specific study hours per subject/topic', requiresContext: true },
				{ text: 'Schedule regular practice tests and quizzes for each subject/topic', requiresContext: true },
				{ text: 'Identify and review weak areas based on test results', requiresContext: true },
				{ text: 'Plan short, regular breaks during study sessions' },
				{ text: 'Schedule a final comprehensive review week before exams' }
			]
		},
		{
			title: 'New Project Kickoff',
			iconKey: 'work',
			goal: 'Successfully launch a new project.',
			steps: [
				{ text: 'Define project scope and primary objectives', inputPrompt: 'What is the overall scope and what are the main objectives of this project?', inputType: 'textarea' },
				{ text: 'Identify key stakeholders and their roles', inputPrompt: 'List key stakeholders and their primary roles/responsibilities (e.g., "Jane Doe - Product Owner, Marketing Team - Feedback & Promotion")?', inputType: 'textarea' },
				{ text: 'Develop a detailed project plan and initial timeline estimate', requiresContext: true },
				{ text: 'Set up communication channels and recurring meeting schedules' },
				{ text: 'Outline necessary resources (budget, team members, tools)' },
				{ text: 'Define Key Performance Indicators (KPIs) for measuring project success' }
			]
		},
		{
			title: 'Habit Building',
			iconKey: 'self-improvement',
			goal: 'Build a new positive habit or skill.',
			steps: [
				{ text: 'Clearly define the new habit or skill you want to build', inputPrompt: 'What specific habit or skill are you aiming to develop (e.g., "Meditate for 10 minutes daily", "Learn conversational Spanish")?', inputType: 'text' },
				{ text: 'Break the habit/skill into small, actionable daily or weekly steps', requiresContext: true },
				{ text: 'Set a SMART goal for this habit/skill', inputPrompt: 'What is your Specific, Measurable, Achievable, Relevant, and Time-bound (SMART) goal (e.g., "Meditate 5 days a week for 1 month", "Be able to hold a 5-minute basic conversation in Spanish in 3 months")?', inputType: 'textarea'},
				{ text: 'Choose a method for tracking consistency' },
				{ text: 'Schedule weekly review and reflection on progress and challenges' },
				{ text: 'Identify potential obstacles and plan strategies to overcome them' }
			]
		}
	];

	let showTemplateUsageModal = false;
	let selectedTemplateForUsage: Template | null = null;
	let newWorkspaceNameFromTemplate = '';
	let projectStartDate: string = new Date().toISOString().split('T')[0];
	let projectEndDate: string = '';
	let projectNotes: string = '';
	let stepSpecificInputs: Record<number, string> = {};
	let isSubmittingTemplateWorkspace = false;
	let templateFormActionError: string | null = null;
	let templateFormSuccessMessage: string | null = null;

	function openAddBoardModal() {
		workspaceNameInput = '';
		formActionError = null;
		showAddBoardModal = true;
	}
	function closeAddBoardModal() {
		showAddBoardModal = false;
	}

	function requestDeleteBoard(board: { id: string; title: string }) {
		boardToConfirmDelete = board;
		showDeleteBoardConfirm = true;
	}
	function closeDeleteBoardConfirm() {
		boardToConfirmDelete = null;
		showDeleteBoardConfirm = false;
		isDeletingBoard = false;
	}
	
	function openTemplateUsageModal(template: Template) {
		selectedTemplateForUsage = template;
		newWorkspaceNameFromTemplate = `${template.title} Initiative`;
		projectStartDate = new Date().toISOString().split('T')[0];
		projectEndDate = '';
		projectNotes = '';
		stepSpecificInputs = {};
		templateFormActionError = null;
		templateFormSuccessMessage = null;
		isSubmittingTemplateWorkspace = false;
		showTemplateUsageModal = true;
	}

	function closeTemplateUsageModal() {
		showTemplateUsageModal = false;
		selectedTemplateForUsage = null;
	}

	$: {
		if (form) {
			formActionError = null;
			templateFormActionError = null;

			if (form.boardForm) {
				isSubmittingWorkspace = false;
				if ('error' in form.boardForm) { 
					formActionError = form.boardForm.error;
					if ('title' in form.boardForm && typeof form.boardForm.title === 'string') {
						workspaceNameInput = form.boardForm.title;
					}
				} else if ('success' in form.boardForm) { 
					pageSuccessMessage = form.boardForm.message;
					invalidateAll(); 
					closeAddBoardModal();
					setTimeout(() => pageSuccessMessage = null, 3000);
				}
			} else if (form.deleteBoardForm) {
				isDeletingBoard = false;
				if ('error' in form.deleteBoardForm) {
					pageError = form.deleteBoardForm.error; 
				} else if ('success' in form.deleteBoardForm) {
					pageSuccessMessage = form.deleteBoardForm.message;
					invalidateAll(); 
					closeDeleteBoardConfirm();
					setTimeout(() => pageSuccessMessage = null, 3000);
				}
			} else if (form.templateForm) {
				isSubmittingTemplateWorkspace = false;
				if ('error' in form.templateForm) { 
					templateFormActionError = form.templateForm.error;
				} else if ('success' in form.templateForm) { 
					templateFormSuccessMessage = form.templateForm.message; 
                    const newBoardTitle = form.templateForm.newBoard.title;
					pageSuccessMessage = `Workspace "${newBoardTitle}" and AI tasks created! View tasks inside.`;
					invalidateAll(); 
					closeTemplateUsageModal();
					setTimeout(() => {
						pageSuccessMessage = null;
						templateFormSuccessMessage = null; 
					}, 5000);
				}
			}
		}
	}

	let handleGlobalClickListener: ((event: MouseEvent) => void) | null = null;
	let handleEscKeyListener: ((event: KeyboardEvent) => void) | null = null;

	onMount(() => {
		username = data.user?.name || getStoredUsername(); 
		if (browser && data.user?.name) { 
			localStorage.setItem('microtask_username', data.user.name);
		}

		if (browser) {
			const savedTheme = localStorage.getItem('theme');
			const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
			isDarkMode = savedTheme === 'dark' || (!savedTheme && prefersDark);
			if (isDarkMode) {
				document.body.classList.add('dark');
			} else {
				document.body.classList.remove('dark');
			}

			// Update date/time
			updateDateTime();
			dateTimeInterval = setInterval(updateDateTime, 60000);
		}

		handleGlobalClickListener = (event: MouseEvent) => {
			const target = event.target as Node | null;
			let isClickInsideDropdownTrigger = false;
			const triggerIds = ['bellIcon', 'helpIcon', 'profileIcon'];
			triggerIds.forEach(triggerId => {
				const triggerEl = document.getElementById(triggerId);
				if (triggerEl && triggerEl.contains(target)) isClickInsideDropdownTrigger = true;
			});

			let isClickInsideDropdownWindow = false;
			dropdownIds.forEach(windowId => {
				const windowEl = document.getElementById(windowId);
				if (windowEl && !windowEl.classList.contains('hidden') && windowEl.contains(target)) {
					isClickInsideDropdownWindow = true;
				}
			});

			if (!isClickInsideDropdownTrigger && !isClickInsideDropdownWindow) {
				closeOtherWindows(''); // Pass empty string or null to close all
			}

			const sidebarEl = document.getElementById('sidebar');
			const hamburgerButton = document.getElementById('hamburgerButton');
			if (sidebarEl && !sidebarEl.contains(target) && hamburgerButton && !hamburgerButton.contains(target) && isSidebarOpen) {
				closeSidebar();
			}

			const modals = [
				{ modalId: 'addBoardModalContent', condition: showAddBoardModal, closeFn: closeAddBoardModal },
				{ modalId: 'deleteBoardModalContent', condition: showDeleteBoardConfirm, closeFn: closeDeleteBoardConfirm },
				{ modalId: 'templateUsageModalContent', condition: showTemplateUsageModal, closeFn: closeTemplateUsageModal }
			];
			modals.forEach(modal => {
				const modalEl = document.getElementById(modal.modalId);
				if (modal.condition && modalEl && !modalEl.contains(target as Node)) {
					const overlayEl = modalEl.parentElement; 
                    if (overlayEl && overlayEl.classList.contains('modal-overlay') && overlayEl === event.target) {
						modal.closeFn();
					}
				}
			});
		};
		if (browser) document.addEventListener('click', handleGlobalClickListener);

		handleEscKeyListener = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				if (isSidebarOpen) closeSidebar();
				if (showAddBoardModal) closeAddBoardModal();
				if (showDeleteBoardConfirm) closeDeleteBoardConfirm();
				if (showTemplateUsageModal) closeTemplateUsageModal();
				closeOtherWindows(''); 
			}
		};
		if (browser) document.addEventListener('keydown', handleEscKeyListener);
	});

	onDestroy(() => {
		if (browser) {
			if (dateTimeInterval) clearInterval(dateTimeInterval);
			if(handleGlobalClickListener) document.removeEventListener('click', handleGlobalClickListener);
			if(handleEscKeyListener) document.removeEventListener('keydown', handleEscKeyListener);
		}
	});

</script>

<div class="app-layout">
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
          <a href="/home" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150 nav-link" 
             class:active={$page.url.pathname === '/home' || $page.url.pathname === '/'}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 nav-link-icon" aria-hidden="true">
              <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
              <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
            </svg>
            <span>Home</span>
          </a>
          <a href="/dashboard" 
             class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150 nav-link"
             class:active={$page.url.pathname === '/dashboard'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5 nav-link-icon" aria-hidden="true">
              <path fill-rule="evenodd" d="M1.5 3A1.5 1.5 0 013 1.5h18A1.5 1.5 0 0122.5 3v18a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 21V3zm1.5.75v16.5h16.5V3.75H3zM10.5 4.5a1.5 1.5 0 00-3 0v15a1.5 1.5 0 003 0V4.5zm-6 6a1.5 1.5 0 000 3h15a1.5 1.5 0 000-3h-15z" clip-rule="evenodd" />
            </svg>
            <span>Dashboard</span>
          </a>
          <a href="/kanban" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150 nav-link"
             class:active={$page.url.pathname.startsWith('/tasks')}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 nav-link-icon-stroked" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
            <span>All Tasks</span>
          </a>
          <a href="/calendar" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150 nav-link"
             class:active={$page.url.pathname === '/calendar'}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 nav-link-icon" aria-hidden="true">
              <path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" /><path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/></svg>
            <span>Calendar</span>
          </a>
          <a href="/workspace" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150 nav-link"
             class:active={$page.url.pathname.startsWith('/workspace')}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 nav-link-icon-stroked" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.098a2.25 2.25 0 0 1-2.25 2.25h-12a2.25 2.25 0 0 1-2.25-2.25V14.15M18 18.75h.75A2.25 2.25 0 0 0 21 16.5v-1.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 15v1.5A2.25 2.25 0 0 0 3.75 18.75H4.5M12 12.75a3 3 0 0 0-3-3H5.25V7.5a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3v2.25H15a3 3 0 0 0-3 3Z" />
            </svg>
            <span>Workspace</span>
          </a>
          <a href="/ai-chat" class="flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150 nav-link"
            class:active={$page.url.pathname === '/ai-chat'}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 nav-link-icon" aria-hidden="true"><path d="M12.001 2.504a2.34 2.34 0 00-2.335 2.335v.583c0 .582.212 1.13.582 1.556l.03.035-.03.034a2.34 2.34 0 00-2.917 3.916A3.287 3.287 0 004.08 14.25a3.287 3.287 0 003.287 3.287h8.266a3.287 3.287 0 003.287-3.287 3.287 3.287 0 00-1.253-2.583 2.34 2.34 0 00-2.917-3.916l-.03-.034.03-.035c.37-.425.582-.973.582-1.555v-.583a2.34 2.34 0 00-2.335-2.336h-.002zM9.75 12.75a.75.75 0 000 1.5h4.5a.75.75 0 000-1.5h-4.5z" /><path fill-rule="evenodd" d="M12 1.5c5.79 0 10.5 4.71 10.5 10.5S17.79 22.5 12 22.5 1.5 17.79 1.5 12 6.21 1.5 12 1.5zM2.85 12a9.15 9.15 0 019.15-9.15 9.15 9.15 0 019.15 9.15 9.15 9.15 0 01-9.15 9.15A9.15 9.15 0 012.85 12z" clip-rule="evenodd" /></svg>
            <span>Ask Synthia</span>
          </a>
        </nav>
      </div>
      <button on:click={handleLogout} class="logout-button flex items-center gap-3 px-3 py-2 rounded-md font-semibold w-full mt-auto transition-colors duration-150">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5 logout-button-icon" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
        <span>Log out</span>
      </button>
    </div>
  {/if}

	<div class="main-content-wrapper">
	<AppHeader {isDarkMode} {username} {currentDateTime} on:toggleSidebar={toggleSidebar} on:toggleDarkMode={toggleDarkMode} on:logout={handleLogout} />

		{#if pageError && !formActionError && !templateFormActionError }
			<div class="alert alert-error" role="alert">
				<strong>Error:</strong>
				<span>{pageError}</span>
				<button on:click={() => pageError = null} class="alert-close-button" aria-label="Close error">
					<span class="alert-close-icon">×</span>
				</button>
			</div>
		{/if}
		{#if pageSuccessMessage }
			<div class="alert alert-success" role="alert">
				<span>{pageSuccessMessage}</span>
				<button on:click={() => pageSuccessMessage = null} class="alert-close-button" aria-label="Close message">
					<span class="alert-close-icon">×</span>
				</button>
			</div>
		{/if}
		
		<main class="main-area">
			<div class="container">
				<!-- Pending Invitations Section -->
				<PendingInvitations on:accepted={() => invalidateAll()} />
				
				<h2 class="section-title">Your Workspaces</h2>
					
				<section class="workspace-section">
					<h3 class="sub-section-title sr-only">List of Your Workspaces</h3>
					{#if boards && boards.length > 0}
						<div class="workspace-grid">
							{#each boards as board (board.id)}
								<a href="/workspace/{board.id}" class="board-card">
									<div class="board-card-header">
										<h4 class="board-card-title">{board.title}</h4>
										{#if board.isCollaborative}
											<span class="collab-badge" title="Shared workspace">
												<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
													<circle cx="9" cy="7" r="4"></circle>
													<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
													<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
												</svg>
											</span>
										{/if}
									</div>
									<div class="board-card-info">
										{#if board.createdAtISO}
											<p class="board-card-meta">
												Created: {new Date(board.createdAtISO).toLocaleDateString()}
											</p>
										{/if}
										{#if !board.isOwner}
											<span class="role-badge {board.userRole}">{board.userRole}</span>
										{/if}
									</div>
									{#if board.isOwner}
										<button
											on:click|stopPropagation|preventDefault={() => requestDeleteBoard(board)}
											aria-label={`Delete workspace ${board.title}`}
											class="board-card-delete-btn"
											disabled={isDeletingBoard && boardToConfirmDelete?.id === board.id}
										>
											{#if isDeletingBoard && boardToConfirmDelete?.id === board.id}
												<svg class="spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
													<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
													<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
												</svg>
											{:else}
												<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="icon-sm">
													<path fill-rule="evenodd" d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.519.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z" clip-rule="evenodd" />
												</svg>
											{/if}
										</button>
									{/if}
								</a>
							{/each}
						<button on:click={openAddBoardModal} class="add-workspace-card">
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="icon-lg"><path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" /></svg>
							<span class="text-sm font-medium">Add Workspace</span>
						</button>
					</div>
				{:else if !data.error}
					<div class="empty-state-workspaces">
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="icon-xl">
							<path d="M2.25 21h19.5A2.25 2.25 0 0024 18.75V5.25A2.25 2.25 0 0021.75 3H2.25A2.25 2.25 0 000 5.25v13.5A2.25 2.25 0 002.25 21zM18.75 10.5A.75.75 0 0118 9.75H6a.75.75 0 010-1.5h12a.75.75 0 01.75.75v3a.75.75 0 01-1.5 0v-1.5H9.75V15A.75.75 0 019 15.75H7.5a.75.75 0 01-.75-.75V9.362a2.251 2.251 0 011.437-2.097l4.5-.818a2.25 2.25 0 012.563 2.097v1.875H18a.75.75 0 01.75.75v.375z" />
						</svg>
						<h3>No Workspaces Yet</h3>
						<p>
							It looks like you haven't created any workspaces. <br />
							Workspaces help you organize your tasks into projects or different areas of focus.
						</p>
						<button on:click={openAddBoardModal} class="button button-success">
							Create Your First Workspace
						</button>
					</div>
				{/if}
			</section>

			<section class="template-section">
				<h3 class="sub-section-title">AI-assisted templates</h3>
				<p class="section-description">
					Having a hard time getting started? Use our ai assisted workspace templates to jump right in and stay productive—no stress, just progress.
				</p>
				<div class="template-grid">
					{#each templates as template (template.title)}
						<div class="template-card">
							<div class="template-card-header">
								<span class="template-card-icon-wrapper">
									{#if template.iconKey === "study"}
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M2.5 1A1.5 1.5 0 0 0 1 2.5v15A1.5 1.5 0 0 0 2.5 19h15a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 17.5 1h-15ZM2.75 5.24v11.261c0 .136.11.25.25.25h13.998a.25.25 0 0 0 .251-.25V5.239c-.54.091-1.12.15-1.749.17P12.5 5.5 10 6l-2.5-.5c-.63-.02-1.209-.079-1.751-.17Z" /></svg>
									{:else if template.iconKey === "work"}
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 3.75A2.75 2.75 0 0 1 8.75 1h2.5A2.75 2.75 0 0 1 14 3.75v.438A2.5 2.5 0 0 0 12.5 3h-5A2.5 2.5 0 0 0 6 4.188V3.75ZM13.5 6A1.5 1.5 0 0 1 15 7.5v6A1.5 1.5 0 0 1 13.5 15h-7A1.5 1.5 0 0 1 5 13.5v-6A1.5 1.5 0 0 1 6.5 6h7Zm0 1.5H6.5V13h7V7.5Z" clip-rule="evenodd" /></svg>
									{:else if template.iconKey === "self-improvement"}
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M11.213 4.042S8.446 3.214 6.83 4.83c-1.224 1.223-1.037 3.304.196 4.537l-.392.393a.75.75 0 001.06 1.061l.393-.392c1.233 1.233 3.314 1.037 4.537.196 1.617-1.617.789-4.384.789-4.384S12.436 5.266 11.213 4.042ZM10 9.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3Z" /><path d="M17.5 6.5c0 .69-.56 1.25-1.25 1.25S15 7.19 15 6.5s.56-1.25 1.25-1.25S17.5 5.81 17.5 6.5ZM14.452 2.456a1.25 1.25 0 011.768 0l.022.021c.48.48.48 1.256 0 1.736L15.25 5.206a1.25 1.25 0 01-1.736-1.736l.938-.914Z" /></svg>
									{:else} <!-- Default icon -->
										<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3.75a2.25 2.25 0 1 0 0 4.5 2.25 2.25 0 0 0 0-4.5ZM9.25 9.545v4.578A.75.75 0 0 0 10 14.873a.75.75 0 0 0 .75-.75V9.546A2.265 2.265 0 0 1 10 9.25c-.134 0-.265.01-.393.029a2.257 2.257 0 0 1-.357.266ZM7.625 5.155A2.255 2.255 0 0 1 7.5 5.5c0 .481.153.923.412 1.285A2.255 2.255 0 0 1 7.625 5.155ZM5.155 7.625A2.255 2.255 0 0 1 5.5 7.5c.481 0 .923.153 1.285.412A2.255 2.255 0 0 1 5.155 7.625ZM12.375 5.155A2.255 2.255 0 0 1 12.5 5.5c0 .481-.153.923-.412 1.285A2.255 2.255 0 0 1 12.375 5.155ZM14.845 7.625A2.255 2.255 0 0 1 14.5 7.5c-.481 0-.923.153-1.285.412A2.255 2.255 0 0 1 14.845 7.625Z" /></svg>
									{/if}
								</span>
								<h4 class="template-card-title">{template.title}</h4>
							</div>
							<p class="template-card-goal">
								<strong class="font-medium">Goal:</strong> {template.goal}
							</p>
							<ul class="template-card-steps">
								{#each template.steps.slice(0, 4) as step}
									<li>{step.text}</li>
								{/each}
								{#if template.steps.length > 4}
									<li>...and more</li>
								{/if}
							</ul>
							<button
								on:click={() => openTemplateUsageModal(template)}
								class="button button-success template-card-button"
							>
								Use Template
							</button>
						</div>
					{/each}
				</div>
			</section>
		</div>
	</main>
</div>

<!-- Modals -->
{#if showAddBoardModal}
<div class="modal-overlay" id="addBoardModalOverlay">
	<div id="addBoardModalContent" class="modal-content">
		<div class="modal-header">
			<h3 class="modal-title">Create New Workspace</h3>
			<button on:click={closeAddBoardModal} class="modal-close-button">
				<span>×</span>
			</button>
		</div>
		<form method="POST" action="?/addBoard" use:enhance={() => {
            isSubmittingWorkspace = true;
            formActionError = null; 
            return async ({ update }) => { await update(); };
        }}>
			<div class="modal-form-group">
				<label for="workspaceNameModalInput" class="modal-label">Workspace Name <span class="required-asterisk">*</span></label>
				<input type="text" id="workspaceNameModalInput" name="title" bind:value={workspaceNameInput} required maxlength="100"
					class="modal-input" placeholder="e.g., Q3 Project, Home Renovation"
				/>
			</div>
			{#if formActionError}
				<p class="form-action-error">{formActionError}</p>
			{/if}
			<div class="modal-actions">
				<button type="button" on:click={closeAddBoardModal} class="button button-default" disabled={isSubmittingWorkspace}>
					Cancel
				</button>
				<button type="submit" class="button button-primary" disabled={isSubmittingWorkspace || !workspaceNameInput.trim()}>
					{#if isSubmittingWorkspace}
						<svg class="button-spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg> Creating...
					{:else}
						Create Workspace
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
{/if}

{#if showDeleteBoardConfirm && boardToConfirmDelete}
<div class="modal-overlay" id="deleteBoardModalOverlay">
	<div id="deleteBoardModalContent" class="modal-content">
		<div class="modal-header">
			<h3 class="modal-title modal-title-danger">Confirm Deletion</h3>
			<button on:click={closeDeleteBoardConfirm} class="modal-close-button">
				<span>×</span>
			</button>
		</div>
		<form method="POST" action="?/deleteBoard" use:enhance={() => {
            isDeletingBoard = true;
            return async ({ update }) => { await update(); };
        }}>
			<input type="hidden" name="boardId" value={boardToConfirmDelete.id} />
			<p class="modal-text-confirm">
				Are you sure you want to delete the workspace "<strong>{boardToConfirmDelete.title}</strong>"?
			</p>
			<p class="modal-text-warning">
				This action cannot be undone and will also delete ALL tasks within this workspace.
			</p>
			<div class="modal-actions">
				<button type="button" on:click={closeDeleteBoardConfirm} class="button button-default" disabled={isDeletingBoard}>
					Cancel
				</button>
				<button type="submit" class="button button-danger" disabled={isDeletingBoard}>
					{#if isDeletingBoard}
						<svg class="button-spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg> Deleting...
					{:else}
						Delete Workspace
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
{/if}

{#if showLogoutConfirm}
<div class="modal-overlay" id="logoutModalOverlay" on:click|self={cancelLogout} on:keydown={(e) => e.key === 'Escape' && cancelLogout()} role="dialog" aria-modal="true">
	<div class="modal-content">
		<div class="modal-header">
			<h3 class="modal-title">Confirm Logout</h3>
			<button on:click={cancelLogout} class="modal-close-button">
				<span>×</span>
			</button>
		</div>
		<p class="modal-text-confirm">
			Are you sure you want to log out?
		</p>
		<p class="modal-text-secondary">
			You will need to sign in again to access your tasks.
		</p>
		<div class="modal-actions">
			<button type="button" on:click={cancelLogout} class="button button-default">
				Cancel
			</button>
			<button type="button" on:click={confirmLogout} class="button button-danger">
				Log out
			</button>
		</div>
	</div>
</div>
{/if}

{#if showTemplateUsageModal && selectedTemplateForUsage}
<div class="modal-overlay" id="templateUsageModalOverlay">
	<div id="templateUsageModalContent" class="modal-content modal-content-large">
		<div class="modal-header">
			<h3 class="modal-title">Use Template: {selectedTemplateForUsage.title}</h3>
			<button on:click={closeTemplateUsageModal} class="modal-close-button">
				<span>×</span>
			</button>
		</div>
		<form method="POST" action="?/createWorkspaceFromTemplate" use:enhance={() => {
			isSubmittingTemplateWorkspace = true;
			templateFormActionError = null;
			templateFormSuccessMessage = null; 
			return async ({ update }) => { await update(); };
		}} class="modal-form-flex-grow">
			<div class="modal-form-scrollable custom-scrollbar">
				<p class="template-modal-goal"><strong class="font-medium">Template Goal:</strong> {selectedTemplateForUsage.goal}</p>
				
				<input type="hidden" name="templateTitle" value={selectedTemplateForUsage.title} />
				<input type="hidden" name="templateGoal" value={selectedTemplateForUsage.goal} />
				<input type="hidden" name="templateStepsJSON" value={JSON.stringify(selectedTemplateForUsage.steps)} />
				<input type="hidden" name="stepSpecificInputsJSON" value={JSON.stringify(stepSpecificInputs)} />

				<div class="modal-form-group">
					<label for="newWorkspaceNameFromTemplate" class="modal-label">Name for your new workspace <span class="required-asterisk">*</span></label>
					<input type="text" id="newWorkspaceNameFromTemplate" name="workspaceName" bind:value={newWorkspaceNameFromTemplate} required maxlength="100"
						class="modal-input" placeholder="e.g., My Study Plan for Finals" />
				</div>

				<div class="date-input-grid">
					<div>
						<label class="modal-label">Plan Start Date</label>
						<DatePicker bind:value={projectStartDate} name="projectStartDate" id="projectStartDate" {isDarkMode} />
						<p class="input-hint">Tasks will be scheduled from this date.</p>
					</div>
					<div>
						<label class="modal-label">Plan End Date (Optional)</label>
						<DatePicker bind:value={projectEndDate} name="projectEndDate" id="projectEndDate" {isDarkMode} />
						<p class="input-hint">Distribute tasks until this date if set.</p>
					</div>
				</div>
				
				<hr class="modal-divider"/>
				<p class="ai-prompt-section-title">Help the AI tailor your tasks:</p>

				{#each selectedTemplateForUsage.steps as step, i}
					{#if step.inputPrompt}
						<div class="step-input-container">
							<label for={`step-input-${i}`} class="step-input-label">{step.inputPrompt}</label>
							{#if step.inputType === 'textarea'}
								<textarea id={`step-input-${i}`} name={`step_input_${i}`} bind:value={stepSpecificInputs[i]} rows="2" class="modal-textarea"></textarea>
							{:else}
								<input type="text" id={`step-input-${i}`} name={`step_input_${i}`} bind:value={stepSpecificInputs[i]} class="modal-input" />
							{/if}
							<p class="step-input-hint">AI will use this to customize the task: "<em>{step.text}</em>".</p>
						</div>
					{/if}
				{/each}

				<hr class="modal-divider"/>

				<div class="modal-form-group">
					<label for="projectNotes" class="modal-label">General Notes/Additional Context (Optional)</label>
					<textarea id="projectNotes" name="projectNotes" bind:value={projectNotes} rows="2" class="modal-textarea"
						placeholder="Any other details for the AI to consider for all tasks."></textarea>
				</div>

				{#if templateFormActionError}
					<p class="form-action-error">{templateFormActionError}</p>
				{/if}
				{#if templateFormSuccessMessage && !pageSuccessMessage}
					<p class="form-success-message">{templateFormSuccessMessage}</p>
				{/if}
			</div>
			
			<div class="modal-footer-actions">
				<button type="button" on:click={closeTemplateUsageModal} class="button button-default" disabled={isSubmittingTemplateWorkspace}>
					Cancel
				</button>
				<button type="submit" class="button button-success" disabled={isSubmittingTemplateWorkspace || !newWorkspaceNameFromTemplate.trim()}>
					{#if isSubmittingTemplateWorkspace}
						<svg class="button-spinner" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg> Creating...
					{:else}
						Create Workspace & AI Tasks
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
{/if}
</div>
<style>
:root {
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;

    /* Refined Light Theme */
    --light-bg-app: #F8F9FA; /* Page background */
    --light-bg-content: #FFFFFF; /* Cards, Modals, Sidebar, Header */
    --light-bg-hover: #E9ECEF; /* Hover for list items, buttons */
    --light-bg-input: #FFFFFF;
    --light-bg-backdrop: rgba(33, 37, 41, 0.6); /* Modal backdrop */
    --light-bg-subtle: #F1F3F5; /* Subtle backgrounds like template step inputs */

    --light-text-primary: #212529; /* Main text, headings */
    --light-text-secondary: #495057; /* Secondary text, descriptions */
    --light-text-tertiary: #868E96; /* Meta text, hints */
    --light-text-placeholder: #ADB5BD;
    --light-text-on-accent: #FFFFFF; /* Text on colored buttons */
    --light-text-link: #007BFF;

    --light-border-primary: #DEE2E6; /* Main borders for layout elements */
    --light-border-secondary: #CED4DA; /* Borders for inputs, cards */
    --light-border-focus: #80BDFF; /* Focus ring for inputs */
    --light-border-dashed: #ADB5BD;

    --light-accent-primary: #007BFF; /* Primary blue */
    --light-accent-primary-hover: #0056b3;
    --light-accent-primary-active: #007BFF; /* For nav-link.active */
    --light-accent-primary-text: var(--light-text-link); /* For text links or icons needing this blue */

    --light-accent-success: #28A745; /* Green */
    --light-accent-success-hover: #1e7e34;
    --light-accent-success-bg: #D4EDDA; /* Light green background for alerts */
    --light-accent-success-border: #B8DFC2;
    --light-accent-success-text: #155724;

    --light-accent-danger: #DC3545; /* Red */
    --light-accent-danger-hover: #c82333;
    --light-accent-danger-bg: #F8D7DA; /* Light red background for alerts */
    --light-accent-danger-border: #F1B0B7;
    --light-accent-danger-text: #721c24;

    --light-accent-info-bg: #E6F2FF; /* For icon wrappers */
    --light-accent-info-icon: var(--light-accent-primary);

    /* Dark Theme */
    --dark-bg-app: #12181B; /* Darker page background */
    --dark-bg-content: #1A2025; /* Cards, Modals, Sidebar, Header */
    --dark-bg-hover: #2C343A; /* Hover for list items, buttons */
    --dark-bg-input: #252B30;
    --dark-bg-backdrop: rgba(10, 12, 14, 0.7);
    --dark-bg-subtle: #20262B; /* Subtle backgrounds like template step inputs */

    --dark-text-primary: #E8ECEF; /* Main text */
    --dark-text-secondary: #B0B8BF; /* Secondary text */
    --dark-text-tertiary: #7D8790; /* Meta text, hints */
    --dark-text-placeholder: #6C757D;
    --dark-text-on-accent: #FFFFFF;
    --dark-text-link: #36A3FF;

    --dark-border-primary: #303840; /* Main borders for layout elements */
    --dark-border-secondary: #3E4850; /* Borders for inputs, cards */
    --dark-border-focus: #36A3FF; /* Focus ring for inputs */
    --dark-border-dashed: #505860;

    --dark-accent-primary: #36A3FF; /* Primary blue for dark mode */
    --dark-accent-primary-hover: #0B8EFF;
    --dark-accent-primary-active: #1E40AF; /* For nav-link.active in dark mode (example used bg-blue-800) */
    --dark-accent-primary-text: var(--dark-text-link);

    --dark-accent-success: #34D399; /* Green */
    --dark-accent-success-hover: #28B880;
    --dark-accent-success-bg: rgba(52, 211, 153, 0.1);
    --dark-accent-success-border: rgba(52, 211, 153, 0.3);
    --dark-accent-success-text: #A7F3D0;

    --dark-accent-danger: #F87171; /* Red */
    --dark-accent-danger-hover: #F05252;
    --dark-accent-danger-bg: rgba(248, 113, 113, 0.1);
    --dark-accent-danger-border: rgba(248, 113, 113, 0.3);
    --dark-accent-danger-text: #FDD8D8;
    
    /* Error for alerts (using danger for consistency) */
    --light-accent-error-bg: var(--light-accent-danger-bg);
    --dark-accent-error-bg: var(--dark-accent-danger-bg);


    --dark-accent-info-bg: rgba(54, 163, 255, 0.15); /* For icon wrappers */
    --dark-accent-info-icon: var(--dark-accent-primary);

    /* Sizing & Spacing */
    --space-0_5: 0.125rem; --space-1: 0.25rem; --space-1_5: 0.375rem; --space-2: 0.5rem;
    --space-2_5: 0.625rem;
    --space-3: 0.75rem; --space-4: 1rem; --space-6: 1.5rem; --space-8: 2rem;
    --space-10: 2.5rem; --space-12: 3rem;

    /* Borders */
    --rounded-sm: 0.2rem;
    --rounded-md: 0.375rem; /* Standard border radius */
    --rounded-lg: 0.5rem; /* For cards and modals */
    --rounded-full: 9999px;

    /* Shadows - Softer and more modern */
    --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.03);
    --shadow-md: 0 3px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
    --shadow-lg: 0 8px 15px -3px rgba(0, 0, 0, 0.07), 0 4px 6px -2px rgba(0, 0, 0, 0.04);
    --shadow-xl: 0 15px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -5px rgba(0, 0, 0, 0.04);
    --shadow-focus-ring: 0 0 0 3px rgba(0, 123, 255, 0.25); /* For input focus, using primary accent */

    /* Dark Shadows (can be more subtle or different color) */
    --dark-shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.1);
    --dark-shadow-md: 0 3px 6px -1px rgba(0, 0, 0, 0.15), 0 2px 4px -1px rgba(0, 0, 0, 0.1);
    --dark-shadow-lg: 0 8px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.15);
    --dark-shadow-xl: 0 15px 25px -5px rgba(0, 0, 0, 0.25), 0 8px 10px -5px rgba(0, 0, 0, 0.2);
    --dark-shadow-focus-ring: 0 0 0 3px rgba(54, 163, 255, 0.3);


    /* Transitions */
    --transition-duration: 0.2s;
    --transition-timing: ease-in-out;
}

:global(body) {
    font-family: var(--font-sans);
    height: 100%; margin: 0; padding: 0; overflow: hidden;
    background-color: var(--light-bg-app);
    color: var(--light-text-primary);
    transition: background-color var(--transition-duration) var(--transition-timing), color var(--transition-duration) var(--transition-timing);
    font-size: 16px; /* Base font size */
    line-height: 1.6;
}
:global(body.dark) {
    background-color: var(--dark-bg-app);
    color: var(--dark-text-primary);
}

/* Scrollbar styles */
:global(::-webkit-scrollbar) { width: 8px; height: 8px; }
:global(::-webkit-scrollbar-track) { background: var(--light-bg-app); border-radius: 4px; }
:global(::-webkit-scrollbar-thumb) { background: #bdc1c5; border-radius: 4px; }
:global(::-webkit-scrollbar-thumb:hover) { background: #a8adb1; }
.custom-scrollbar { scrollbar-width: thin; scrollbar-color: #bdc1c5 var(--light-bg-app); }

:global(body.dark ::-webkit-scrollbar-track) { background: var(--dark-bg-app); }
:global(body.dark ::-webkit-scrollbar-thumb) { background: #4F5B64; }
:global(body.dark ::-webkit-scrollbar-thumb:hover) { background: #606C76; }
:global(body.dark) .custom-scrollbar { scrollbar-color: #4F5B64 var(--dark-bg-app); }


.sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;
}
/* GENERAL LAYOUT */
.app-layout { display: flex; height: 100vh; }
.main-content-wrapper { flex: 1 1 0%; display: flex; flex-direction: column; overflow: hidden; }
.main-area {
    flex: 1 1 0%; 
    display: flex; 
    flex-direction: column; 
    overflow-x: hidden;
    overflow-y: auto; 
    padding: var(--space-6);
    padding-top: calc(60px + var(--space-4)); /* 60px header height + padding */
}
.container {
    margin-left: auto;
    margin-right: auto;
    max-width: 1280px;
    padding: 0 var(--space-4);
    display: flex; 
    flex-direction: column; 
    flex-grow: 1; 
    width: 100%; 
}
.workspace-section { margin-bottom: var(--space-12); }
.template-section {
    margin-top: var(--space-12);
    display: flex; 
    flex-direction: column; 
    flex-grow: 1; 
    min-height: 0; 
}

/* Titles & Descriptions */
.section-title {
    font-size: 1.75rem; font-weight: 600;
    color: var(--light-text-primary);
    margin-bottom: var(--space-8);
}
:global(body.dark) .section-title { color: var(--dark-text-primary); }
.sub-section-title {
    font-size: 1.375rem; font-weight: 600;
    color: var(--light-text-secondary);
    margin-bottom: var(--space-4);
}
:global(body.dark) .sub-section-title { color: var(--dark-text-secondary); }
.section-description {
    font-size: 0.95rem;
    color: var(--light-text-tertiary);
    margin-bottom: var(--space-6);
    max-width: 70ch; 
}
:global(body.dark) .section-description { color: var(--dark-text-tertiary); }

/* SIDEBAR */
#sidebar { /* Using ID selector to match HTML */
    /* Tailwind classes mapped: fixed top-0 left-0 h-full w-64 shadow-lg z-50 flex flex-col justify-between p-4 border-r */
    position: fixed; top: 0; left: 0;
    height: 100%; width: 16rem; /* w-64 */
    box-shadow: var(--shadow-lg);
    z-index: 50;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: var(--space-4);
    border-right-width: 1px; border-style: solid;
    /* Light mode from HTML: bg-white border-gray-200 */
    background-color: var(--light-bg-content); 
    border-color: var(--light-border-primary);
    transition: background-color var(--transition-duration) var(--transition-timing), border-color var(--transition-duration) var(--transition-timing);
}
/* Dark mode from HTML: dark:bg-zinc-800 dark:border-zinc-700 */
:global(body.dark) #sidebar {
    background-color: var(--dark-bg-content); 
    border-color: var(--dark-border-primary);
    box-shadow: var(--dark-shadow-lg);
}
/* Sidebar Header (div with logo and title) */
/* Tailwind: flex items-center gap-2 mb-8 pb-4 border-b */
#sidebar > div > .flex.items-center.gap-2 {
    display: flex; align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-8);
    padding-bottom: var(--space-4);
    border-bottom-width: 1px; border-style: solid;
    /* Light mode: border-gray-200 */
    border-color: var(--light-border-primary);
}
/* Dark mode: dark:border-zinc-700 */
:global(body.dark) #sidebar > div > .flex.items-center.gap-2 {
    border-color: var(--dark-border-primary);
}
/* Sidebar Logo Img */
/* Tailwind: w-8 h-8 */
#sidebar img[alt="Microtask Logo"] { width: 2rem; height: 2rem; }
/* Sidebar Title H1 */
/* Tailwind: text-xl font-bold */
#sidebar h1 {
    font-size: 1.25rem; line-height: 1.75rem; /* text-xl */
    font-weight: 700; /* font-bold */
    /* Light mode: text-gray-800 */
    color: var(--light-text-primary);
}
/* Dark mode: dark:text-zinc-100 */
:global(body.dark) #sidebar h1 { color: var(--dark-text-primary); }

/* Sidebar Nav */
/* Tailwind: flex flex-col gap-2 */
#sidebar nav { display: flex; flex-direction: column; gap: var(--space-2); }
/* Nav Link (<a> tags) */
/* Tailwind: flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150 */
.nav-link { /* Added this class to <a> tags in HTML */
    display: flex; align-items: center;
    gap: var(--space-3); 
    padding: var(--space-2) var(--space-3); 
    border-radius: var(--rounded-md);
    font-weight: 600; /* font-semibold */
    transition: background-color var(--transition-duration), color var(--transition-duration);
    text-decoration: none;
    /* Default text color based on mode, overridden by active/hover */
    color: var(--light-text-secondary); /* Default for light */
}
:global(body.dark) .nav-link {
    color: var(--dark-text-secondary); /* Default for dark */
}
/* Nav Link Hover */
/* Tailwind: hover:bg-gray-100 (light), hover:bg-zinc-700 (dark) */
.nav-link:hover {
    background-color: var(--light-bg-hover);
}
:global(body.dark) .nav-link:hover {
    background-color: var(--dark-bg-hover);
}
/* Nav Link Active */
/* Tailwind: class:bg-blue-600={!isDarkMode} class:bg-blue-800={isDarkMode} class:text-white={true} */
.nav-link.active {
    background-color: var(--light-accent-primary-active); /* bg-blue-600 */
    color: var(--light-text-on-accent); /* text-white */
}
:global(body.dark) .nav-link.active {
    background-color: var(--dark-accent-primary-active); /* bg-blue-800 */
    color: var(--dark-text-on-accent); /* text-white */
}
/* Nav Link Icons */
/* Tailwind: w-5 h-5 */
.nav-link .nav-link-icon, .nav-link .nav-link-icon-stroked {
    width: 1.25rem; height: 1.25rem;
    /* Color is handled by currentColor of parent <a>, or overridden for active */
}
/* Ensure active link icons are white, filled or stroked */
.nav-link.active .nav-link-icon { fill: var(--light-text-on-accent); }
.nav-link.active .nav-link-icon-stroked { stroke: var(--light-text-on-accent); fill: none; }


/* Logout Button */
/* Tailwind: flex items-center gap-3 px-3 py-2 rounded-md font-semibold w-full mt-auto transition-colors duration-150 */
.logout-button { /* Added this class to button in HTML */
    display: flex; align-items: center;
    gap: var(--space-3); 
    padding: var(--space-3) var(--space-3); 
    border-radius: var(--rounded-md);
    font-weight: 600; /* font-semibold */
    width: 100%; /* w-full */
    margin-top: auto; /* mt-auto */
    transition: background-color var(--transition-duration), color var(--transition-duration);
    background-color: transparent; border: none; cursor: pointer; text-align: left;
    font-size: 0.95rem;
    min-height: 44px; /* Minimum touch target size */
    box-sizing: border-box;
     /* Light: text-gray-700 */
    color: var(--light-text-secondary);
}
/* Logout Button Hover */
/* Light: hover:bg-gray-100 */
.logout-button:hover { background-color: var(--light-bg-hover); }
/* Logout Button Icon */
/* Tailwind: w-5 h-5 */
.logout-button .logout-button-icon {
    width: 1.25rem; height: 1.25rem;
    stroke: currentColor; /* Inherits color from button's text color */
}
/* Dark mode Logout Button */
/* Dark: text-zinc-300, hover:bg-zinc-700 */
:global(body.dark) .logout-button {
    color: var(--dark-text-secondary);
}
:global(body.dark) .logout-button:hover {
    background-color: var(--dark-bg-hover);
}


/* ALERTS */
.alert {
    margin: var(--space-4); padding: var(--space-4);
    border-width: 1px; border-style: solid;
    border-radius: var(--rounded-lg); position: relative;
    box-shadow: var(--shadow-sm);
    font-size: 0.95rem;
}
.alert-error {
    background-color: var(--light-accent-error-bg);
    border-color: var(--light-accent-danger-border);
    color: var(--light-accent-danger-text);
}
.alert-success {
    background-color: var(--light-accent-success-bg);
    border-color: var(--light-accent-success-border);
    color: var(--light-accent-success-text);
}
:global(body.dark) .alert-error {
    background-color: var(--dark-accent-error-bg);
    border-color: var(--dark-accent-danger-border);
    color: var(--dark-accent-danger-text);
    box-shadow: var(--dark-shadow-sm);
}
:global(body.dark) .alert-success {
    background-color: var(--dark-accent-success-bg);
    border-color: var(--dark-accent-success-border);
    color: var(--dark-accent-success-text);
    box-shadow: var(--dark-shadow-sm);
}
.alert strong { font-weight: 600; }
.alert-close-button {
    position: absolute; top: var(--space-2); bottom: 0; right: var(--space-2);
    padding: var(--space-1) var(--space-2); line-height: 1;
    background: none; border: none; cursor: pointer; color: inherit; opacity: 0.7;
}
.alert-close-button:hover { opacity: 1; }
.alert-close-icon { font-size: 1.5rem; line-height: 1; }

/* WORKSPACE & TEMPLATE CARDS */
.workspace-grid, .template-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--space-6);
    flex-grow: 1; 
}

.board-card, .template-card {
    background-color: var(--light-bg-content);
    border-radius: var(--rounded-lg);
    box-shadow: var(--shadow-md);
    transition: box-shadow var(--transition-duration), transform var(--transition-duration);
    padding: var(--space-6);
    position: relative;
    display: flex;
    flex-direction: column;
}
.board-card:hover, .template-card:hover { box-shadow: var(--shadow-lg); transform: translateY(-3px); }
:global(body.dark) .board-card, :global(body.dark) .template-card {
    background-color: var(--dark-bg-content);
    box-shadow: var(--dark-shadow-md);
}
:global(body.dark) .board-card:hover, :global(body.dark) .template-card:hover { box-shadow: var(--dark-shadow-lg); }

.board-card { text-decoration: none; }
.board-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--space-2);
    padding-right: 2rem; /* Make room for the absolute-positioned delete button */
}
.board-card-title {
    font-size: 1.25rem; font-weight: 600;
    color: var(--light-accent-primary-text);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    flex: 1;
}
.collab-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem;
    background-color: #dbeafe;
    color: #1e40af;
    border-radius: 4px;
    flex-shrink: 0;
}
:global(body.dark) .collab-badge {
    background-color: #1e3a8a;
    color: #93c5fd;
}
.board-card-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
}
.role-badge {
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    padding: 0.15rem 0.4rem;
    border-radius: 9999px;
}
.role-badge.admin {
    background-color: #dbeafe;
    color: #1e40af;
}
.role-badge.editor {
    background-color: #dcfce7;
    color: #166534;
}
.role-badge.viewer {
    background-color: #f3f4f6;
    color: #374151;
}
:global(body.dark) .role-badge.admin {
    background-color: #1e3a8a;
    color: #dbeafe;
}
:global(body.dark) .role-badge.editor {
    background-color: #14532d;
    color: #dcfce7;
}
:global(body.dark) .role-badge.viewer {
    background-color: #374151;
    color: #d1d5db;
}
:global(body.dark) .board-card-title { color: var(--dark-accent-primary-text); }
.board-card-meta { font-size: 0.8rem; color: var(--light-text-tertiary); }
:global(body.dark) .board-card-meta { color: var(--dark-text-tertiary); }
.board-card-delete-btn {
    position: absolute; top: var(--space-3); right: var(--space-3);
    padding: var(--space-1_5); border-radius: var(--rounded-md);
    transition: color var(--transition-duration), background-color var(--transition-duration);
    color: var(--light-text-tertiary);
    background-color: transparent; border: none; cursor: pointer; line-height: 1;
}
.board-card-delete-btn:hover:not(:disabled) {
    background-color: var(--light-accent-danger-bg);
    color: var(--light-accent-danger-text);
}
.board-card-delete-btn:disabled { opacity: 0.5; cursor: not-allowed; }
:global(body.dark) .board-card-delete-btn { color: var(--dark-text-tertiary); }
:global(body.dark) .board-card-delete-btn:hover:not(:disabled) {
    background-color: var(--dark-accent-danger-bg);
    color: var(--dark-accent-danger-text);
}
.board-card-delete-btn .icon-sm, .board-card-delete-btn .spinner {
    width: 1rem; height: 1rem; display: inline-block; vertical-align: middle;
}
.spinner { animation: spin 1s linear infinite; } /* Add spinner animation if not already present */

.add-workspace-card {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    background-color: var(--light-bg-content);
    border: 2px dashed var(--light-border-dashed);
    border-radius: var(--rounded-lg); box-shadow: var(--shadow-sm);
    transition: all var(--transition-duration);
    padding: var(--space-6); color: var(--light-text-tertiary);
    min-height: 150px; cursor: pointer; text-align: center;
}
.add-workspace-card:hover {
    box-shadow: var(--shadow-md);
    border-color: var(--light-accent-primary);
    color: var(--light-accent-primary);
    transform: translateY(-2px);
}
:global(body.dark) .add-workspace-card {
    background-color: var(--dark-bg-content);
    border-color: var(--dark-border-dashed);
    color: var(--dark-text-tertiary);
    box-shadow: var(--dark-shadow-sm);
}
:global(body.dark) .add-workspace-card:hover {
    border-color: var(--dark-accent-primary);
    color: var(--dark-accent-primary);
    box-shadow: var(--dark-shadow-md);
}
.add-workspace-card .icon-lg { width: 2.5rem; height: 2.5rem; margin-bottom: var(--space-3); fill: currentColor; }
.add-workspace-card .text-sm { font-size: 0.9rem; }
.add-workspace-card .font-medium { font-weight: 500; }

.empty-state-workspaces {
    text-align: center; padding: var(--space-10) var(--space-6);
    background-color: var(--light-bg-content);
    border-radius: var(--rounded-lg); box-shadow: var(--shadow-md);
}
:global(body.dark) .empty-state-workspaces { background-color: var(--dark-bg-content); box-shadow: var(--dark-shadow-md); }
.empty-state-workspaces .icon-xl {
    width: 4.5rem; height: 4.5rem; color: var(--light-text-placeholder);
    margin: 0 auto var(--space-6); fill: currentColor;
}
:global(body.dark) .empty-state-workspaces .icon-xl { color: var(--dark-text-tertiary); }
.empty-state-workspaces h3 {
    font-size: 1.5rem; font-weight: 600;
    color: var(--light-text-primary); margin-bottom: var(--space-3);
}
:global(body.dark) .empty-state-workspaces h3 { color: var(--dark-text-primary); }
.empty-state-workspaces p { color: var(--light-text-secondary); margin-bottom: var(--space-6); line-height: 1.7; }
:global(body.dark) .empty-state-workspaces p { color: var(--dark-text-secondary); }


.template-card-header { display: flex; align-items: center; margin-bottom: var(--space-4); }
.template-card-icon-wrapper {
    padding: var(--space-2_5); 
    background-color: var(--light-accent-info-bg);
    border-radius: var(--rounded-full); margin-right: var(--space-3);
    display: inline-flex; align-items: center; justify-content: center;
    width: 44px; height: 44px; 
}
.template-card-icon-wrapper svg { width: 1.5rem; height: 1.5rem; color: var(--light-accent-info-icon); fill: currentColor; }
:global(body.dark) .template-card-icon-wrapper { background-color: var(--dark-accent-info-bg); }
:global(body.dark) .template-card-icon-wrapper svg { color: var(--dark-accent-info-icon); }
.template-card-title { font-size: 1.25rem; font-weight: 600; color: var(--light-text-primary); }
:global(body.dark) .template-card-title { color: var(--dark-text-primary); }
.template-card-goal { font-size: 0.9rem; color: var(--light-text-secondary); margin-bottom: var(--space-3); }
.template-card-goal strong { font-weight: 500; color: var(--light-text-primary); }
:global(body.dark) .template-card-goal { color: var(--dark-text-secondary); }
:global(body.dark) .template-card-goal strong { color: var(--dark-text-primary); }
.template-card-steps {
    list-style-type: disc; list-style-position: inside;
    font-size: 0.875rem; color: var(--light-text-tertiary);
    margin-bottom: var(--space-4); flex-grow: 1; padding-left: var(--space-1_5);
}
.template-card-steps li { margin-bottom: var(--space-1_5); }
:global(body.dark) .template-card-steps { color: var(--dark-text-tertiary); }
.template-card-button { margin-top: auto; width: 100%; }

/* FOOTER */
.app-footer {
    text-align: center; padding: var(--space-6);
    font-size: 0.875rem; color: var(--light-text-tertiary);
    border-top: 1px solid var(--light-border-primary);
}
:global(body.dark) .app-footer {
    color: var(--dark-text-tertiary);
    border-top-color: var(--dark-border-primary);
}

/* MODALS */
.modal-overlay {
    position: fixed; inset: 0; z-index: 100;
    display: flex; align-items: center; justify-content: center;
    background-color: var(--light-bg-backdrop);
    padding: var(--space-4);
    backdrop-filter: blur(3px);
}
:global(body.dark) .modal-overlay { background-color: var(--dark-bg-backdrop); }
.modal-content {
    background-color: var(--light-bg-content);
    padding: var(--space-8); border-radius: var(--rounded-lg); 
    box-shadow: var(--shadow-xl); width: 100%; max-width: 32rem; 
    display: flex; flex-direction: column;
    max-height: 90vh; 
}
:global(body.dark) .modal-content {
    background-color: var(--dark-bg-content);
    box-shadow: var(--dark-shadow-xl);
}
.modal-header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: var(--space-6); padding-bottom: var(--space-4);
    border-bottom: 1px solid var(--light-border-primary);
}
:global(body.dark) .modal-header { border-bottom-color: var(--dark-border-primary); }
.modal-title { font-size: 1.5rem; font-weight: 600; color: var(--light-text-primary); }
:global(body.dark) .modal-title { color: var(--dark-text-primary); }
.modal-close-button {
    color: var(--light-text-tertiary);
    transition: color var(--transition-duration);
    background: none; border: none; cursor: pointer; padding: 0; line-height: 1;
    font-size: 1.75rem; 
}
.modal-close-button:hover { color: var(--light-text-secondary); }
:global(body.dark) .modal-close-button { color: var(--dark-text-tertiary); }
:global(body.dark) .modal-close-button:hover { color: var(--dark-text-secondary); }

.modal-form-group { margin-bottom: var(--space-4); }
.modal-label {
    display: block; font-size: 0.9rem; font-weight: 500;
    color: var(--light-text-secondary); margin-bottom: var(--space-2);
}
.modal-label .required-asterisk { color: var(--light-accent-danger); margin-left: var(--space-0_5); }
:global(body.dark) .modal-label { color: var(--dark-text-secondary); }
.modal-input, .modal-textarea {
    width: 100%; padding: var(--space-2_5) var(--space-3); 
    border: 1px solid var(--light-border-secondary);
    border-radius: var(--rounded-md); box-shadow: var(--shadow-sm);
    background-color: var(--light-bg-input); color: var(--light-text-primary);
    transition: border-color var(--transition-duration), box-shadow var(--transition-duration);
    font-size: 0.95rem;
}
.modal-textarea { line-height: 1.5; min-height: 80px; }
.modal-input:focus, .modal-textarea:focus {
    outline: none; border-color: var(--light-accent-primary);
    box-shadow: var(--shadow-focus-ring);
}
:global(body.dark) .modal-input, :global(body.dark) .modal-textarea {
    background-color: var(--dark-bg-input);
    border-color: var(--dark-border-secondary);
    color: var(--dark-text-primary);
    box-shadow: var(--dark-shadow-sm);
}
:global(body.dark) .modal-input::placeholder, :global(body.dark) .modal-textarea::placeholder { color: var(--dark-text-placeholder); }
:global(body.dark) .modal-input:focus, :global(body.dark) .modal-textarea:focus {
    border-color: var(--dark-accent-primary);
    box-shadow: var(--dark-shadow-focus-ring);
}
.form-action-error, .form-success-message { font-size: 0.875rem; margin-bottom: var(--space-3); padding: var(--space-2) var(--space-3); border-radius: var(--rounded-md); }
.form-action-error { color: var(--light-accent-danger-text); background-color: var(--light-accent-danger-bg); border: 1px solid var(--light-accent-danger-border); }
:global(body.dark) .form-action-error { color: var(--dark-accent-danger-text); background-color: var(--dark-accent-danger-bg); border-color: var(--dark-accent-danger-border); }
.form-success-message { color: var(--light-accent-success-text); background-color: var(--light-accent-success-bg); border: 1px solid var(--light-accent-success-border); }
:global(body.dark) .form-success-message { color: var(--dark-accent-success-text); background-color: var(--dark-accent-success-bg); border-color: var(--dark-accent-success-border); }
.modal-actions { display: flex; justify-content: flex-end; gap: var(--space-3); margin-top: var(--space-6); }

/* General Button Styles */
.button {
    padding: var(--space-2_5) var(--space-4); font-size: 0.9rem; font-weight: 500;
    border-radius: var(--rounded-md); border: 1px solid transparent;
    transition: background-color var(--transition-duration), border-color var(--transition-duration), color var(--transition-duration), box-shadow var(--transition-duration), transform var(--transition-duration);
    cursor: pointer; display: inline-flex; align-items: center; justify-content: center;
    line-height: 1.5; text-decoration: none;
    box-shadow: var(--shadow-sm);
}
.button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.button:active:not(:disabled) { transform: translateY(0px); box-shadow: var(--shadow-sm); }
.button:disabled { opacity: 0.6; cursor: not-allowed; box-shadow: none !important; transform: none !important; }
.button-spinner { animation: spin 1s linear infinite; margin-right: 0.5rem; width: 1rem; height: 1rem; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.button-default {
    color: var(--light-text-secondary);
    background-color: var(--light-bg-hover);
    border-color: var(--light-border-secondary);
}
.button-default:hover:not(:disabled) { background-color: var(--light-border-primary); color: var(--light-text-primary); }
:global(body.dark) .button-default {
    color: var(--dark-text-secondary);
    background-color: var(--dark-bg-hover);
    border-color: var(--dark-border-secondary);
}
:global(body.dark) .button-default:hover:not(:disabled) { background-color: var(--dark-border-primary); color: var(--dark-text-primary); }

.button-primary { color: var(--light-text-on-accent); background-color: var(--light-accent-primary); }
.button-primary:hover:not(:disabled) { background-color: var(--light-accent-primary-hover); }
.button-primary:focus-visible { outline: none; box-shadow: var(--shadow-sm), var(--shadow-focus-ring); }
:global(body.dark) .button-primary { background-color: var(--dark-accent-primary); }
:global(body.dark) .button-primary:hover:not(:disabled) { background-color: var(--dark-accent-primary-hover); }
:global(body.dark) .button-primary:focus-visible { box-shadow: var(--dark-shadow-sm), var(--dark-shadow-focus-ring); }

.button-danger { color: var(--light-text-on-accent); background-color: var(--light-accent-danger); }
.button-danger:hover:not(:disabled) { background-color: var(--light-accent-danger-hover); }
.button-danger:focus-visible { outline: none; box-shadow: var(--shadow-sm), 0 0 0 3px rgba(220, 53, 69, 0.25); }
:global(body.dark) .button-danger { background-color: var(--dark-accent-danger); }
:global(body.dark) .button-danger:hover:not(:disabled) { background-color: var(--dark-accent-danger-hover); }
:global(body.dark) .button-danger:focus-visible { box-shadow: var(--dark-shadow-sm), 0 0 0 3px rgba(248, 113, 113, 0.3); }

.button-success { color: var(--light-text-on-accent); background-color: var(--light-accent-success); }
.button-success:hover:not(:disabled) { background-color: var(--light-accent-success-hover); }
.button-success:focus-visible { outline: none; box-shadow: var(--shadow-sm), 0 0 0 3px rgba(40, 167, 69, 0.25); }
:global(body.dark) .button-success { background-color: var(--dark-accent-success); }
:global(body.dark) .button-success:hover:not(:disabled) { background-color: var(--dark-accent-success-hover); }
:global(body.dark) .button-success:focus-visible { box-shadow: var(--dark-shadow-sm), 0 0 0 3px rgba(52, 211, 153, 0.3); }

/* Delete Modal Specifics */
.modal-title-danger { color: var(--light-accent-danger); }
:global(body.dark) .modal-title-danger { color: var(--dark-accent-danger); }
.modal-text-confirm { color: var(--light-text-secondary); margin-bottom: var(--space-2); font-size: 1rem; }
:global(body.dark) .modal-text-confirm { color: var(--dark-text-secondary); }
.modal-text-secondary { color: var(--light-text-tertiary); margin-bottom: var(--space-6); font-size: 0.9rem; }
:global(body.dark) .modal-text-secondary { color: var(--dark-text-tertiary); }
.modal-text-warning {
    font-size: 0.9rem; color: var(--light-accent-danger-text);
    background-color: var(--light-accent-danger-bg);
    border: 1px solid var(--light-accent-danger-border);
    padding: var(--space-3); border-radius: var(--rounded-md);
    margin-bottom: var(--space-6);
}
:global(body.dark) .modal-text-warning {
    color: var(--dark-accent-danger-text);
    background-color: var(--dark-accent-danger-bg);
    border-color: var(--dark-accent-danger-border);
}

/* Template Usage Modal Specifics */
.modal-content-large { max-width: 40rem; } 
.modal-form-flex-grow { display: flex; flex-direction: column; flex-grow: 1; overflow: hidden; }
.modal-form-scrollable { overflow-y: auto; padding-right: var(--space-2); flex-grow: 1; margin-bottom: var(--space-4); }
.template-modal-goal { font-size: 0.95rem; color: var(--light-text-secondary); margin-bottom: var(--space-4); }
.template-modal-goal strong { font-weight: 500; color: var(--light-text-primary); }
:global(body.dark) .template-modal-goal { color: var(--dark-text-secondary); }
:global(body.dark) .template-modal-goal strong { color: var(--dark-text-primary); }
.date-input-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4); margin-bottom: var(--space-4); }
.input-hint { font-size: 0.8rem; color: var(--light-text-tertiary); margin-top: var(--space-1_5); }
:global(body.dark) .input-hint { color: var(--dark-text-tertiary); }
.modal-divider { margin: var(--space-6) 0; border: 0; border-top: 1px solid var(--light-border-primary); }
:global(body.dark) .modal-divider { border-top-color: var(--dark-border-primary); }
.ai-prompt-section-title { font-size: 1rem; font-weight: 500; color: var(--light-text-secondary); margin-bottom: var(--space-3); }
:global(body.dark) .ai-prompt-section-title { color: var(--dark-text-secondary); }
.step-input-container {
    margin-bottom: var(--space-4); padding: var(--space-4);
    background-color: var(--light-bg-subtle);
    border-radius: var(--rounded-md); border: 1px solid var(--light-border-primary);
}
:global(body.dark) .step-input-container {
    background-color: var(--dark-bg-subtle);
    border-color: var(--dark-border-primary);
}
.step-input-label { display: block; font-size: 0.9rem; font-weight: 500; color: var(--light-text-secondary); margin-bottom: var(--space-2); }
:global(body.dark) .step-input-label { color: var(--dark-text-secondary); }
.step-input-hint { font-size: 0.8rem; color: var(--light-text-tertiary); margin-top: var(--space-1_5); }
.step-input-hint em { font-style: italic; color: var(--light-text-primary); }
:global(body.dark) .step-input-hint { color: var(--dark-text-tertiary); }
:global(body.dark) .step-input-hint em { color: var(--dark-text-primary); }

.modal-footer-actions {
    padding-top: var(--space-6); border-top: 1px solid var(--light-border-primary);
    flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--space-3);
}
:global(body.dark) .modal-footer-actions { border-top-color: var(--dark-border-primary); }

/* Icon Helpers */
.icon-sm { width: 1rem; height: 1rem; fill: currentColor; }
.icon-md { width: 1.25rem; height: 1.25rem; fill: currentColor; }
.icon-lg { width: 2rem; height: 2rem; fill: currentColor; }
.icon-xl { width: 4rem; height: 4rem; fill: currentColor; }
</style>