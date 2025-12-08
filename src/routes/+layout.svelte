<script lang="ts">
 	import '../app.css';
 	import { onMount } from 'svelte';
	import { navigating } from '$app/stores';
	import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';
	import { browser } from '$app/environment';

	// Update user's timezone on the server
	async function updateTimezone() {
		if (!browser) return;
		
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const lastSavedTimezone = localStorage.getItem('microtask_timezone');
		
		// Only update if timezone changed or never saved
		if (lastSavedTimezone === timezone) return;
		
		try {
			const response = await fetch('/api/auth/timezone', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ timezone })
			});
			
			if (response.ok) {
				localStorage.setItem('microtask_timezone', timezone);
				console.log('[Layout] Timezone updated to:', timezone);
			}
		} catch (err) {
			// Silently fail - user might not be logged in
			console.log('[Layout] Could not update timezone (user may not be logged in)');
		}
	}

 	onMount(() => {
 		const savedTheme = localStorage.getItem('theme');
 		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
 		if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
 			document.body.classList.add('dark');
 		} else {
 			document.body.classList.remove('dark');
 		}
		
		// Update timezone after a short delay to not block initial render
		setTimeout(updateTimezone, 1000);
 	});
</script>

{#if $navigating}
  <LoadingIndicator />
{/if}

<slot />
