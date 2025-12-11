<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
    import { browser } from '$app/environment';
	import { Chart, registerables, type ChartConfiguration, type ChartItem } from 'chart.js';
    import { globalChartDisplayType, type GlobalChartType } from '$lib/stores/chartTypeStore';
    import { fly } from 'svelte/transition';
    import { quintOut } from 'svelte/easing';
    import AppHeader from '$lib/components/AppHeader.svelte';
    import CalendarAIPanel from '$lib/components/CalendarAIPanel.svelte';

	export let data: import('./$types').PageData;

	let username: string = data.user?.name || 'User';
	let isSidebarOpen = false;
	let isDarkMode = false; // This will control the body.dark class
	let isAIPanelOpen = false;
	let currentDateTime = "";

	$: dashboardStats = data.dashboardStats;
	$: pageError = data.error;

    $: if (data && data.user?.name) {
        username = data.user.name;
    } else if (data && !data.user?.name) {
        username = 'User';
    }

	let prioritiesChartCanvas: HTMLCanvasElement | undefined;
	let prioritiesChart: Chart<GlobalChartType> | undefined;
    let lastPrioritiesChartRenderedType: GlobalChartType | undefined = undefined;

	let timelinessChartCanvas: HTMLCanvasElement | undefined;
	let timelinessChart: Chart<GlobalChartType> | undefined;
    let lastTimelinessChartRenderedType: GlobalChartType | undefined = undefined;

	let tasksCompletedChartCanvas: HTMLCanvasElement | undefined;
	let tasksCompletedChart: Chart<GlobalChartType> | undefined;
    let lastTasksCompletedChartRenderedType: GlobalChartType | undefined = undefined;

	const chartColorPalette = {
        red: { light: 'rgba(255, 99, 132, 0.8)', dark: 'rgba(255, 99, 132, 0.9)', border: 'rgba(255, 99, 132, 1)'},
        blue: { light: 'rgba(54, 162, 235, 0.8)', dark: 'rgba(54, 162, 235, 0.9)', border: 'rgba(54, 162, 235, 1)'},
        yellow: { light: 'rgba(255, 206, 86, 0.8)', dark: 'rgba(255, 206, 86, 0.9)', border: 'rgba(255, 206, 86, 1)'},
        green: { light: 'rgba(75, 192, 192, 0.8)', dark: 'rgba(75, 192, 192, 0.9)', border: 'rgba(75, 192, 192, 1)'},
        purple: { light: 'rgba(153, 102, 255, 0.8)', dark: 'rgba(153, 102, 255, 0.9)', border: 'rgba(153, 102, 255, 1)'},
        orange: { light: 'rgba(255, 159, 64, 0.8)', dark: 'rgba(255, 159, 64, 0.9)', border: 'rgba(255, 159, 64, 1)'},
        gray: { light: 'rgba(201, 203, 207, 0.8)', dark: 'rgba(100, 116, 139, 0.9)', border: 'rgba(201, 203, 207, 1)'}
    };

    let unsubscribeGlobalChartType: () => void;

    function toggleSidebar() {
        isSidebarOpen = !isSidebarOpen;
    }

    function closeSidebar() {
        isSidebarOpen = false;
    }

    function toggleDarkMode() {
		isDarkMode = !isDarkMode;
        if (browser) {
		    document.documentElement.classList.toggle('dark', isDarkMode);
		    document.body.classList.toggle('dark', isDarkMode);
            localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
        }
        initOrUpdateAllCharts();
	}

    let handleEscKeyListener: ((event: KeyboardEvent) => void) | null = null;

	onMount(() => {
		Chart.register(...registerables);
        const storedDarkMode = localStorage.getItem('theme');
		if (storedDarkMode === 'dark' || (!storedDarkMode && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
			isDarkMode = true;
			if (browser) document.body.classList.add('dark');
		} else {
            isDarkMode = false;
            if (browser) document.body.classList.remove('dark');
        }

        if (browser) {
            const localUsername = localStorage.getItem('microtask_username');
            if (data.user?.name && localUsername && localUsername !== data.user.name) {
                username = data.user.name;
            } else if (localUsername && !data.user?.name) {
                 username = localUsername;
            }
        }

        unsubscribeGlobalChartType = globalChartDisplayType.subscribe(_value => {
            if (browser && dashboardStats && prioritiesChartCanvas && timelinessChartCanvas && tasksCompletedChartCanvas) {
                initOrUpdateAllCharts();
            }
        });
        
        handleEscKeyListener = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (isSidebarOpen) closeSidebar();
            }
        };
		if (browser) document.addEventListener('keydown', handleEscKeyListener);

        if (dashboardStats) {
            initOrUpdateAllCharts();
        }

		return () => {
			prioritiesChart?.destroy();
			timelinessChart?.destroy();
			tasksCompletedChart?.destroy();
            if (unsubscribeGlobalChartType) unsubscribeGlobalChartType();
            if (browser) {
			    if (handleEscKeyListener) document.removeEventListener('keydown', handleEscKeyListener);
            }
		};
	});

    function updateChartGlobalDefaults() {
        if (!browser) return;
        Chart.defaults.color = isDarkMode ? '#d1d5db' : '#374151';
        Chart.defaults.borderColor = isDarkMode ? 'rgba(75, 85, 99, 0.5)' : 'rgba(229, 231, 235, 0.7)';
    }

	$: if (
		browser &&
		dashboardStats &&
		prioritiesChartCanvas &&
		timelinessChartCanvas &&
		tasksCompletedChartCanvas &&
        typeof isDarkMode === 'boolean'
	) {
		initOrUpdateAllCharts();
	}

    function initOrUpdateAllCharts() {
        if (browser && dashboardStats && prioritiesChartCanvas && timelinessChartCanvas && tasksCompletedChartCanvas) {
            updateChartGlobalDefaults();
            createOrUpdatePrioritiesChart(dashboardStats, $globalChartDisplayType);
            createOrUpdateTimelinessChart(dashboardStats, $globalChartDisplayType);
            createOrUpdateTasksCompletedChart(dashboardStats, $globalChartDisplayType);
        }
    }
    
    function createOrUpdatePrioritiesChart(stats: NonNullable<typeof dashboardStats>, displayType: GlobalChartType) {
        if (!prioritiesChartCanvas) return;
        if (prioritiesChart && lastPrioritiesChartRenderedType !== displayType) {
            prioritiesChart.destroy();
            prioritiesChart = undefined;
            lastPrioritiesChartRenderedType = undefined;
        }
        const labelsBase: string[] = [];
        const dataPointsBase: number[] = [];
        const priorityColorMap = { high: chartColorPalette.red, standard: chartColorPalette.blue, low: chartColorPalette.green, unprioritized: chartColorPalette.purple };
        let totalPriorityTasks = 0;
        const sortedPriorities = ['high', 'standard', 'low', 'unprioritized'];
        
        for (const priority of sortedPriorities) { 
            const count = stats.priorityCounts[priority] || 0; 
            labelsBase.push(priority.charAt(0).toUpperCase() + priority.slice(1)); 
            dataPointsBase.push(count); 
            totalPriorityTasks += count; 
        }

        let chartConfig: ChartConfiguration<GlobalChartType>;
        if (displayType === 'doughnut') {
            const bgColors: string[] = [], borderColors: string[] = []; let finalLabels = [...labelsBase], finalData = [...dataPointsBase];
            if (totalPriorityTasks > 0) {
                const activeL: string[] = [], activeD: number[] = [];
                sortedPriorities.forEach((p, i) => { if (dataPointsBase[i] > 0) { activeL.push(labelsBase[i]); activeD.push(dataPointsBase[i]); const cKey = p as keyof typeof priorityColorMap, clr = priorityColorMap[cKey] || chartColorPalette.orange; bgColors.push(isDarkMode ? clr.dark : clr.light); borderColors.push(isDarkMode ? clr.dark : clr.border); } });
                finalLabels = activeL; finalData = activeD;
            } else { finalLabels = ["No Tasks with Priority"]; finalData = [1]; bgColors.push(isDarkMode ? chartColorPalette.gray.dark : chartColorPalette.gray.light); borderColors.push(isDarkMode ? chartColorPalette.gray.dark : chartColorPalette.gray.border); }
            chartConfig = { type: 'doughnut', data: { labels: finalLabels, datasets: [{ label: 'Task Priorities', data: finalData, backgroundColor: bgColors, borderColor: borderColors, borderWidth: 1.5, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: isDarkMode ? '#d1d5db' : '#374151', boxWidth:12, padding:15 } }, tooltip: { bodyColor: isDarkMode ? '#d1d5db' : '#374151', titleColor: isDarkMode ? '#d1d5db' : '#374151', backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.9)' : 'rgba(255, 255, 255, 0.9)', borderColor: isDarkMode ? 'rgba(75, 85, 99, 0.9)' : 'rgba(229, 231, 235, 0.9)', borderWidth: 1 } } } } as ChartConfiguration<'doughnut'>;
        } else { /* bar */
            const maxVal = Math.max(0, ...dataPointsBase), step = Math.max(1, Math.ceil(maxVal / 5));
            chartConfig = { type: 'bar', data: { labels: labelsBase, datasets: [{ label: 'Priority Counts', data: dataPointsBase, backgroundColor: labelsBase.map((_, i) => { const pKey = sortedPriorities[i] as keyof typeof priorityColorMap, clr = priorityColorMap[pKey] || chartColorPalette.orange; return isDarkMode ? clr.dark : clr.light; }), borderColor: labelsBase.map((_, i) => { const pKey = sortedPriorities[i] as keyof typeof priorityColorMap, clr = priorityColorMap[pKey] || chartColorPalette.orange; return isDarkMode ? clr.dark : clr.border; }), borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: isDarkMode ? '#d1d5db' : '#374151', stepSize: step }, grid: { color: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)' } }, x: { ticks: { color: isDarkMode ? '#d1d5db' : '#374151' }, grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { bodyColor: isDarkMode ? '#d1d5db' : '#374151', titleColor: isDarkMode ? '#d1d5db' : '#374151', backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.9)' : 'rgba(255, 255, 255, 0.9)', borderColor: isDarkMode ? 'rgba(75, 85, 99, 0.9)' : 'rgba(229, 231, 235, 0.9)', borderWidth: 1 } } } } as ChartConfiguration<'bar'>;
        }
        if (prioritiesChart) { prioritiesChart.data = chartConfig.data as any; prioritiesChart.options = chartConfig.options as any; prioritiesChart.update(); }
        else { prioritiesChart = new Chart(prioritiesChartCanvas as ChartItem, chartConfig); lastPrioritiesChartRenderedType = displayType; }
    }

    function createOrUpdateTimelinessChart(stats: NonNullable<typeof dashboardStats>, displayType: GlobalChartType) {
        if (!timelinessChartCanvas) return;
        if (timelinessChart && lastTimelinessChartRenderedType !== displayType) { timelinessChart.destroy(); timelinessChart = undefined; lastTimelinessChartRenderedType = undefined; }
        const totalCompleted = stats.tasksDoneOnTime + stats.tasksDoneLate; let labels = ['On Time', 'Late'], dataPoints = [stats.tasksDoneOnTime, stats.tasksDoneLate]; let chartConfig: ChartConfiguration<GlobalChartType>;
        if (displayType === 'doughnut') {
            let bgColors = [ isDarkMode ? chartColorPalette.green.dark : chartColorPalette.green.light, isDarkMode ? chartColorPalette.orange.dark : chartColorPalette.orange.light ];
            let borderColors = [ isDarkMode ? chartColorPalette.green.dark : chartColorPalette.green.border, isDarkMode ? chartColorPalette.orange.dark : chartColorPalette.orange.border ];
            if (totalCompleted === 0) { labels = ["No Completed Tasks"]; dataPoints = [1]; bgColors = [isDarkMode ? chartColorPalette.gray.dark : chartColorPalette.gray.light]; borderColors = [isDarkMode ? chartColorPalette.gray.dark : chartColorPalette.gray.border]; }
            chartConfig = { type: 'doughnut', data: { labels, datasets: [{ label: 'Completion Timeliness', data: dataPoints, backgroundColor: bgColors, borderColor: borderColors, borderWidth: 1.5, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: isDarkMode ? '#d1d5db' : '#374151', boxWidth:12, padding:15 } }, tooltip: { bodyColor: isDarkMode ? '#d1d5db' : '#374151', titleColor: isDarkMode ? '#d1d5db' : '#374151', backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.9)' : 'rgba(255, 255, 255, 0.9)', borderColor: isDarkMode ? 'rgba(75, 85, 99, 0.9)' : 'rgba(229, 231, 235, 0.9)', borderWidth: 1 } } } } as ChartConfiguration<'doughnut'>;
        } else { /* bar */
            const step = Math.max(1, Math.ceil(Math.max(0, ...dataPoints) / 2));
            let bgColors = [ isDarkMode ? chartColorPalette.green.dark : chartColorPalette.green.light, isDarkMode ? chartColorPalette.orange.dark : chartColorPalette.orange.light ];
            let borderColors = [ isDarkMode ? chartColorPalette.green.dark : chartColorPalette.green.border, isDarkMode ? chartColorPalette.orange.dark : chartColorPalette.orange.border ];
            if (totalCompleted === 0) { labels = ["No Data"]; dataPoints = [0]; bgColors = [isDarkMode ? chartColorPalette.gray.dark : chartColorPalette.gray.light]; borderColors = [isDarkMode ? chartColorPalette.gray.dark : chartColorPalette.gray.border]; }
            chartConfig = { type: 'bar', data: { labels, datasets: [{ label: 'Timeliness', data: dataPoints, backgroundColor: bgColors, borderColor: borderColors, borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: isDarkMode ? '#d1d5db' : '#374151', stepSize: step }, grid: { color: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)' } }, x: { ticks: { color: isDarkMode ? '#d1d5db' : '#374151' }, grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { bodyColor: isDarkMode ? '#d1d5db' : '#374151', titleColor: isDarkMode ? '#d1d5db' : '#374151', backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.9)' : 'rgba(255, 255, 255, 0.9)', borderColor: isDarkMode ? 'rgba(75, 85, 99, 0.9)' : 'rgba(229, 231, 235, 0.9)', borderWidth: 1 } } } } as ChartConfiguration<'bar'>;
        }
        if (timelinessChart) { timelinessChart.data = chartConfig.data as any; timelinessChart.options = chartConfig.options as any; timelinessChart.update(); }
        else { timelinessChart = new Chart(timelinessChartCanvas as ChartItem, chartConfig); lastTimelinessChartRenderedType = displayType; }
    }

    function createOrUpdateTasksCompletedChart(stats: NonNullable<typeof dashboardStats>, displayType: GlobalChartType) {
        if (!tasksCompletedChartCanvas) return;
        if (tasksCompletedChart && lastTasksCompletedChartRenderedType !== displayType) { tasksCompletedChart.destroy(); tasksCompletedChart = undefined; lastTasksCompletedChartRenderedType = undefined; }
        const labels = ['This Month', 'This Week', 'All Time'], dataPoints = [stats.tasksDoneThisMonth, stats.tasksDoneThisWeek, stats.tasksDoneAllTime]; const totalTasks = dataPoints.reduce((s, v) => s + v, 0); let chartConfig: ChartConfiguration<GlobalChartType>;
        const defaultBgColors = [isDarkMode?chartColorPalette.blue.dark:chartColorPalette.blue.light, isDarkMode?chartColorPalette.green.dark:chartColorPalette.green.light, isDarkMode?chartColorPalette.purple.dark:chartColorPalette.purple.light];
        const defaultBorderColors = [isDarkMode?chartColorPalette.blue.dark:chartColorPalette.blue.border, isDarkMode?chartColorPalette.green.dark:chartColorPalette.green.border, isDarkMode?chartColorPalette.purple.dark:chartColorPalette.purple.border];
        if (displayType === 'doughnut') {
            let bgColors = [...defaultBgColors], borderColors = [...defaultBorderColors], finalLbls = [...labels], finalData = [...dataPoints];
            if(totalTasks === 0) { finalLbls = ["No Tasks Completed"]; finalData = [1]; bgColors = [isDarkMode ? chartColorPalette.gray.dark : chartColorPalette.gray.light]; borderColors = [isDarkMode ? chartColorPalette.gray.dark : chartColorPalette.gray.border];}
            chartConfig = { type: 'doughnut', data: { labels: finalLbls, datasets: [{ label: 'Tasks Completed', data: finalData, backgroundColor: bgColors, borderColor: borderColors, borderWidth: 1.5, hoverOffset: 8 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: isDarkMode ? '#d1d5db' : '#374151', boxWidth: 12, padding: 15 } }, tooltip: { bodyColor: isDarkMode ? '#d1d5db' : '#374151', titleColor: isDarkMode ? '#d1d5db' : '#374151', backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.9)' : 'rgba(255, 255, 255, 0.9)', borderColor: isDarkMode ? 'rgba(75, 85, 99, 0.9)' : 'rgba(229, 231, 235, 0.9)', borderWidth: 1 } } } } as ChartConfiguration<'doughnut'>;
        } else { /* bar */
            const maxVal = Math.max(0, ...dataPoints), step = Math.max(1, Math.ceil(maxVal / 5));
            chartConfig = { type: 'bar', data: { labels, datasets: [{ label: 'Tasks Completed', data: dataPoints, backgroundColor: defaultBgColors, borderColor: defaultBorderColors, borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { color: isDarkMode ? '#d1d5db' : '#374151', stepSize: step }, grid: { color: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(229, 231, 235, 0.5)' } }, x: { ticks: { color: isDarkMode ? '#d1d5db' : '#374151' }, grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { bodyColor: isDarkMode ? '#d1d5db' : '#374151', titleColor: isDarkMode ? '#d1d5db' : '#374151', backgroundColor: isDarkMode ? 'rgba(55, 65, 81, 0.9)' : 'rgba(255, 255, 255, 0.9)', borderColor: isDarkMode ? 'rgba(75, 85, 99, 0.9)' : 'rgba(229, 231, 235, 0.9)', borderWidth: 1 } } } } as ChartConfiguration<'bar'>;
        }
        if (tasksCompletedChart) { tasksCompletedChart.data = chartConfig.data as any; tasksCompletedChart.options = chartConfig.options as any; tasksCompletedChart.update(); }
        else { tasksCompletedChart = new Chart(tasksCompletedChartCanvas as ChartItem, chartConfig); lastTasksCompletedChartRenderedType = displayType; }
    }

    function handleLogout() {
		if (browser) {
			localStorage.removeItem('microtask_username');
			document.cookie = "userId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax;";
			goto('/login');
		}
  	}
</script>

<svelte:head>
	<title>Dashboard - Microtask</title>
</svelte:head>

<div class="page-wrapper font-sans">
	{#if isSidebarOpen}
<aside
    id="sidebar"
    class="sidebar-container fixed top-0 left-0 h-full w-64 shadow-lg z-50 flex flex-col justify-between p-4 border-r"
    transition:fly={{ x: -300, duration: 300, easing: quintOut }}
>
  <div>
    <div class="sidebar-header flex items-center justify-between mb-8 pb-4 border-b">
      <div class="flex items-center gap-2">
        <img src={isDarkMode ? "/logonamindarkmode.png" : "/logonamin.png"} alt="Microtask Logo" class="w-8 h-8" />
        <h1 class="sidebar-title text-xl font-bold">Microtask</h1>
      </div>
      <button on:click={closeSidebar} class={`p-1 rounded-md transition-colors ${isDarkMode ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-gray-100 text-gray-500'}`} aria-label="Close sidebar">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
        <nav class="flex flex-col gap-2">
          <a href="/home"
             class="nav-link flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:active={$page.url.pathname === '/home' || $page.url.pathname === '/'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true">
              <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
              <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
            </svg>
            <span>Home</span>
          </a>
          <a href="/dashboard"
             class="nav-link flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:active={$page.url.pathname === '/dashboard'}
          >
             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M1 4a1 1 0 011-1h16a1 1 0 011 1v2.5a1 1 0 01-1 1H2a1 1 0 01-1-1V4zM2 9.5a1 1 0 011-1h4.5a1 1 0 011 1v6.5a1 1 0 01-1 1H3a1 1 0 01-1-1V9.5zM12.5 9.5A1 1 0 0011.5 10.5v6.5a1 1 0 001 1h4.5a1 1 0 001-1V9.5a1 1 0 00-1-1h-4.5z" clip-rule="evenodd" /></svg>
            <span>Dashboard</span>
          </a>
          <a href="/kanban"
            class="nav-link flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
            class:active={$page.url.pathname.startsWith('/tasks')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
            </svg>
            <span>All Tasks</span>
          </a>
          <a href="/calendar"
             class="nav-link flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:active={$page.url.pathname === '/calendar'}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5" aria-hidden="true"><path fill-rule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zM5.25 6.75c-.621 0-1.125.504-1.125 1.125V18a1.125 1.125 0 001.125 1.125h13.5A1.125 1.125 0 0019.875 18V7.875c0-.621-.504-1.125-1.125-1.125H5.25z" clip-rule="evenodd" /><path d="M10.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM10.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H10.5v-.01a.75.75 0 000-1.5zM13.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM13.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H13.5v-.01a.75.75 0 000-1.5zM16.5 9.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 12.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5zM16.5 15.75a.75.75 0 00-1.5 0v.01c0 .414.336.75.75.75H16.5v-.01a.75.75 0 000-1.5z"/></svg>
            <span>Calendar</span>
          </a>
          <a href="/workspace"
             class="nav-link flex items-center gap-3 px-3 py-2 rounded-md font-semibold transition-colors duration-150"
             class:active={$page.url.pathname.startsWith('/workspace')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.098a2.25 2.25 0 0 1-2.25 2.25h-12a2.25 2.25 0 0 1-2.25-2.25V14.15M18 18.75h.75A2.25 2.25 0 0 0 21 16.5v-1.5a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 15v1.5A2.25 2.25 0 0 0 3.75 18.75H4.5M12 12.75a3 3 0 0 0-3-3H5.25V7.5a3 3 0 0 1 3-3h7.5a3 3 0 0 1 3 3v2.25H15a3 3 0 0 0-3 3Z" />
            </svg>
            <span>Workspace</span>
          </a>
        </nav>
      </div>
			<button on:click={handleLogout} class="logout-button flex items-center gap-3 px-3 py-2 rounded-md font-semibold w-full mt-auto transition-colors duration-150">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>
        <span>Log out</span>
      </button>
    </aside>
	{/if}

	<div class="flex-1 flex flex-col overflow-hidden">
	<AppHeader {isDarkMode} {username} {currentDateTime} on:toggleSidebar={toggleSidebar} on:toggleDarkMode={toggleDarkMode} on:logout={handleLogout} />

		<main class="main-content flex-1 overflow-x-hidden overflow-y-auto p-4 md:p-6 relative">
      <div class="dashboard-header flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <h1 class="dashboard-title text-2xl font-bold">Dashboard</h1>
      </div>

			{#if pageError}
				<div class="error-alert border px-4 py-3 rounded relative mb-4" role="alert">
					<strong class="font-bold">Error:</strong> <span class="block sm:inline">{pageError}</span>
				</div>
			{/if}

			{#if dashboardStats}
        <!-- Hero Stats Row -->
        <div class="hero-stats-grid grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <!-- Productivity Score -->
          <div class="stat-card stat-card-productivity p-4 md:p-5 rounded-xl shadow-lg">
            <div class="stat-icon-wrapper productivity-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                <path fill-rule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.75.75 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516 11.209 11.209 0 01-7.877-3.08z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="stat-value text-3xl font-bold">{dashboardStats.productivityScore}<span class="text-lg opacity-60">%</span></div>
            <div class="stat-label text-sm opacity-70">Productivity Score</div>
            <div class="stat-progress mt-2">
              <div class="progress-bar" style="width: {dashboardStats.productivityScore}%"></div>
            </div>
          </div>

          <!-- Current Streak -->
          <div class="stat-card stat-card-streak p-4 md:p-5 rounded-xl shadow-lg">
            <div class="stat-icon-wrapper streak-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                <path fill-rule="evenodd" d="M12.963 2.286a.75.75 0 00-1.071-.136 9.742 9.742 0 00-3.539 6.176 7.547 7.547 0 01-1.705-1.715.75.75 0 00-1.152-.082A9 9 0 1021 12.504a.75.75 0 00-.783-.678 9.016 9.016 0 01-3.768-1.036.75.75 0 00-.951.228 7.509 7.509 0 01-2.535 2.268z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="stat-value text-3xl font-bold">{dashboardStats.currentStreak}<span class="text-lg opacity-60"> days</span></div>
            <div class="stat-label text-sm opacity-70">Current Streak</div>
          </div>

          <!-- Tasks Done Today -->
          <div class="stat-card stat-card-today p-4 md:p-5 rounded-xl shadow-lg">
            <div class="stat-icon-wrapper today-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                <path fill-rule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="stat-value text-3xl font-bold">{dashboardStats.tasksDoneToday}</div>
            <div class="stat-label text-sm opacity-70">Done Today</div>
          </div>

          <!-- Due Today / Overdue -->
          <div class="stat-card stat-card-alert p-4 md:p-5 rounded-xl shadow-lg">
            <div class="stat-icon-wrapper alert-icon">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-6 h-6">
                <path fill-rule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="stat-value text-3xl font-bold">{dashboardStats.tasksDueToday}</div>
            <div class="stat-label text-sm opacity-70">Due Today</div>
            {#if dashboardStats.overdueTasks > 0}
              <div class="overdue-badge mt-1">{dashboardStats.overdueTasks} overdue</div>
            {/if}
          </div>
        </div>

        <!-- Quick Summary Cards Row -->
        <div class="summary-grid grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div class="mini-stat-card p-3 rounded-lg">
            <div class="mini-stat-value text-xl font-bold">{dashboardStats.totalTasks}</div>
            <div class="mini-stat-label text-xs opacity-60">Total Tasks</div>
          </div>
          <div class="mini-stat-card p-3 rounded-lg">
            <div class="mini-stat-value text-xl font-bold">{dashboardStats.pendingTasks}</div>
            <div class="mini-stat-label text-xs opacity-60">Pending</div>
          </div>
          <div class="mini-stat-card p-3 rounded-lg">
            <div class="mini-stat-value text-xl font-bold">{dashboardStats.completionRate}%</div>
            <div class="mini-stat-label text-xs opacity-60">Completion Rate</div>
          </div>
          <div class="mini-stat-card p-3 rounded-lg">
            <div class="mini-stat-value text-xl font-bold">{dashboardStats.avgTasksPerDay}</div>
            <div class="mini-stat-label text-xs opacity-60">Avg/Day This Week</div>
          </div>
        </div>

        <!-- Charts Row -->
				<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-6 pb-16">
					<div class="chart-card p-4 md:p-6 rounded-xl shadow-lg flex flex-col">
						<h2 class="chart-title chart-title-completed text-lg font-semibold mb-4 flex-shrink-0">
              <span class="chart-title-icon"></span> Tasks Completed
            </h2>
						<div class="chart-canvas-wrapper h-60 md:h-72 w-full relative flex-grow">
                            <canvas bind:this={tasksCompletedChartCanvas}></canvas>
                        </div>
                        <div class="chart-summary mt-4 text-sm space-y-1 flex-shrink-0">
                            <p><strong>This Month:</strong> {dashboardStats.tasksDoneThisMonth}</p>
							<p><strong>This Week:</strong> {dashboardStats.tasksDoneThisWeek}</p>
							<p><strong>All Time:</strong> {dashboardStats.tasksDoneAllTime}</p>
                        </div>
					</div>

					<div class="chart-card p-4 md:p-6 rounded-xl shadow-lg flex flex-col">
						<h2 class="chart-title chart-title-timeliness text-lg font-semibold mb-4 flex-shrink-0">
              <span class="chart-title-icon"></span> Completion Timeliness
            </h2>
						<div class="chart-canvas-wrapper h-60 md:h-72 w-full relative flex-grow">
                            <canvas bind:this={timelinessChartCanvas}></canvas>
                        </div>
                        <div class="chart-summary mt-4 text-sm space-y-1 flex-shrink-0">
                            <p><strong>Done On Time:</strong> {dashboardStats.tasksDoneOnTime}</p>
							<p><strong>Done Late:</strong> {dashboardStats.tasksDoneLate}</p>
                        </div>
					</div>

					<div class="chart-card p-4 md:p-6 rounded-xl shadow-lg flex flex-col">
                        <h2 class="chart-title chart-title-priorities text-lg font-semibold mb-4 flex-shrink-0">
              <span class="chart-title-icon"></span> Task Priorities
            </h2>
						<div class="chart-canvas-wrapper h-60 md:h-72 w-full relative flex-grow">
                            <canvas bind:this={prioritiesChartCanvas}></canvas>
                        </div>
                        <div class="chart-summary mt-4 text-sm space-y-1 flex-shrink-0">
							{#each Object.entries(dashboardStats.priorityCounts) as [priority, count]}
								{#if priority !== 'unprioritized' || (priority === 'unprioritized' && count > 0)}
									<p><strong class="capitalize">{priority}:</strong> {count}</p>
								{/if}
							{/each}
                        </div>
					</div>
				</div>

                <div class="chart-toggle-bar fixed bottom-4 left-1/2 -translate-x-1/2 z-10
                            flex space-x-2 p-2 rounded-lg shadow-xl border">
                    <button
                        on:click={() => globalChartDisplayType.set('doughnut')}
                        class="chart-type-button px-3 py-1.5 text-sm rounded-md transition-colors font-medium"
                        class:active={$globalChartDisplayType === 'doughnut'}
                    >Pie / Doughnut</button>
                    <button
                        on:click={() => globalChartDisplayType.set('bar')}
                        class="chart-type-button px-3 py-1.5 text-sm rounded-md transition-colors font-medium"
                        class:active={$globalChartDisplayType === 'bar'}
                    >Bar Chart</button>
                </div>

			{:else if !pageError}
                <div class="loading-message flex justify-center items-center h-full">
                    <p class="loading-text text-lg">Loading dashboard data or no data available...</p>
                </div>
			{/if}
		</main>
	</div>
</div>

<!-- AI Assistant Panel -->
<CalendarAIPanel
    {isDarkMode}
    tasks={dashboardStats?.tasks || []}
    bind:isOpen={isAIPanelOpen}
    on:selectTask={(e) => {
      // Navigate to tasks page with task ID to auto-open it
      goto(`/tasks?taskId=${e.detail.taskId}`);
    }}
/>

<style>
	/* --- Base Styles & Font --- */
    .font-sans {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .page-wrapper { /* Applied to the root div */
        display: flex;
        height: 100vh;
        color: #1f2937; /* text-gray-800 */
    }
    canvas { display: block; }
    .h-60 { height: 15rem; }
    .h-72 { height: 18rem; }
    .w-full { width: 100%; } /* Basic utilities, can be defined if not globally available */
    .relative { position: relative; }
    .flex-grow { flex-grow: 1; }
    .hidden-dropdown { display: none !important; } /* For dropdowns */
    .capitalize { text-transform: capitalize; }


	/* --- Sidebar --- */
    .sidebar-container {
        background-color: #ffffff; 
        border-right: 1px solid #e5e7eb; 
        color: #374151; 
    }
    .sidebar-header {
        border-bottom-color: #e5e7eb;
    }
    .sidebar-title {
        color: #1f2937;
    }
    .nav-link {
        color: #374151; 
    }
    .nav-link:hover {
        background-color: #f3f4f6; 
    }
    .nav-link.active {
        background-color: #2563eb; 
        color: #ffffff; 
    }
    .nav-link.active svg, .nav-link.active img {
        fill: white !important;
        stroke: white !important; 
        filter: brightness(0) invert(1);
    }
    .logout-button {
        color: #374151;
    }
    .logout-button:hover {
        background-color: #f3f4f6;
    }

    /* --- Main Content Area --- */
    .main-content {
        background-color: #f3f4f6;
        padding-top: calc(60px + 1rem); /* Must match header height */
    }
    @media (min-width: 768px) {
      .main-content { padding-top: calc(60px + 1.5rem); }
    }
    .dashboard-title { color: #1f2937; }
    .greeting-text { color: #6b7280; }
    .error-alert { background-color: #fee2e2; border-color: #f87171; color: #b91c1c; }

    /* --- Hero Stat Cards --- */
    .stat-card {
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        border: 1px solid rgba(0,0,0,0.05);
        position: relative;
        overflow: hidden;
    }
    .stat-card::before {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        width: 80px;
        height: 80px;
        background: radial-gradient(circle, rgba(59,130,246,0.1) 0%, transparent 70%);
        border-radius: 50%;
        transform: translate(30%, -30%);
    }
    .stat-icon-wrapper {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 12px;
    }
    .productivity-icon { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; }
    .streak-icon { background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; }
    .today-icon { background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); color: white; }
    .alert-icon { background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; }
    
    .stat-value { color: #1f2937; }
    .stat-label { color: #6b7280; }
    
    .stat-progress {
        height: 6px;
        background: #e5e7eb;
        border-radius: 3px;
        overflow: hidden;
    }
    .progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #3b82f6 0%, #1d4ed8 100%);
        border-radius: 3px;
        transition: width 0.5s ease;
    }
    .overdue-badge {
        display: inline-block;
        padding: 2px 8px;
        background: #fef2f2;
        color: #dc2626;
        border-radius: 12px;
        font-size: 0.7rem;
        font-weight: 600;
    }

    /* --- Mini Stat Cards --- */
    .mini-stat-card {
        background: rgba(255,255,255,0.7);
        border: 1px solid rgba(0,0,0,0.05);
    }
    .mini-stat-value { color: #1f2937; }
    .mini-stat-label { color: #6b7280; }

    /* --- Chart Cards --- */
    .chart-card { background-color: #ffffff; }
    .chart-title { display: flex; align-items: center; gap: 8px; }
    .chart-title-icon { font-size: 1.2em; }
    .chart-title-completed { color: #2563eb; }
    .chart-title-timeliness { color: #16a34a; }
    .chart-title-priorities { color: #7c3aed; }
    .chart-summary { color: #4b5563; }
    .loading-message .loading-text { color: #6b7280; }


    /* --- Chart Toggle Bar --- */
    .chart-toggle-bar {
        background-color: #ffffff; 
        border: 1px solid #e5e7eb; 
    }
    .chart-type-button {
        background-color: #e5e7eb; 
        color: #374151; 
    }
    .chart-type-button:hover {
        background-color: #d1d5db; 
    }
    .chart-type-button.active {
        background-color: #2563eb; 
        color: #ffffff; 
    }

    /* --- Footer --- */
    .page-footer {
        color: #6b7280; 
        border-top: 1px solid #e5e7eb; 
    }

    /* === DARK MODE STYLES === */
    :global(body.dark) .page-wrapper {
        color: #d1d5db; /* text-zinc-300 */
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
        background-color: #1e40af; /* bg-blue-800 */
    }
    :global(body.dark) .logout-button {
        color: #d1d5db;
    }
    :global(body.dark) .logout-button:hover {
        background-color: #374151;
    }
    
    :global(body.dark) .main-content {
        background-color: #18181b; 
    }
    :global(body.dark) .dashboard-title { color: #f3f4f6; }
    :global(body.dark) .greeting-text { color: #9ca3af; }
    :global(body.dark) .error-alert { background-color: rgba(159, 18, 57, 0.3); border-color: #dc2626; color: #fda4af; }
    
    /* Dark mode stat cards */
    :global(body.dark) .stat-card {
        background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
        border-color: rgba(255,255,255,0.05);
    }
    :global(body.dark) .stat-card::before {
        background: radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%);
    }
    :global(body.dark) .stat-value { color: #f3f4f6; }
    :global(body.dark) .stat-label { color: #9ca3af; }
    :global(body.dark) .stat-progress { background: #374151; }
    :global(body.dark) .overdue-badge {
        background: rgba(220, 38, 38, 0.2);
        color: #f87171;
    }
    
    :global(body.dark) .mini-stat-card {
        background: rgba(31,41,55,0.7);
        border-color: rgba(255,255,255,0.05);
    }
    :global(body.dark) .mini-stat-value { color: #f3f4f6; }
    :global(body.dark) .mini-stat-label { color: #9ca3af; }
    
    :global(body.dark) .chart-card { background-color: #1f2937; }
    :global(body.dark) .chart-title-completed { color: #60a5fa; }
    :global(body.dark) .chart-title-timeliness { color: #4ade80; }
    :global(body.dark) .chart-title-priorities { color: #a78bfa; }
    :global(body.dark) .chart-summary { color: #9ca3af; }
    :global(body.dark) .loading-message .loading-text { color: #9ca3af; }


    :global(body.dark) .chart-toggle-bar {
        background-color: #1f2937; 
        border-color: #374151; 
    }
    :global(body.dark) .chart-type-button {
        background-color: #374151; 
        color: #d1d5db; 
    }
    :global(body.dark) .chart-type-button:hover {
        background-color: #4b5563; 
    }
    :global(body.dark) .chart-type-button.active {
        background-color: #1d4ed8; 
        color: #ffffff; 
    }

    :global(body.dark) .page-footer {
        color: #9ca3af; 
        border-top-color: #374151; 
    }
    
    :global(body.dark input), 
    :global(body.dark textarea), 
    :global(body.dark select) {
        background-color: #374151 !important; 
        color: #f3f4f6 !important; 
        border-color: #4b5563 !important;
    }
    :global(body.dark input::placeholder), 
    :global(body.dark textarea::placeholder) { 
        color: #6b7280; 
    }
    :global(body.dark .calendar-picker-dark::-webkit-calendar-picker-indicator) { 
        filter: invert(0.8); 
    }
</style>