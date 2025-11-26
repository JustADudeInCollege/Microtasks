<script lang="ts">
 	import '../app.css';
 	import { onMount } from 'svelte';
	import { navigating } from '$app/stores';
	import LoadingIndicator from '$lib/components/LoadingIndicator.svelte';

 	onMount(() => {
 		const savedTheme = localStorage.getItem('theme');
 		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
 		if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
 			document.body.classList.add('dark');
 		} else {
 			document.body.classList.remove('dark');
 		}
 	});
</script>

{#if $navigating}
  <LoadingIndicator />
{/if}

<slot />
