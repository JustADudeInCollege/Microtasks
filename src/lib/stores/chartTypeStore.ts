// src/lib/stores/chartTypeStore.ts
import { writable } from 'svelte/store';

export type GlobalChartType = 'doughnut' | 'bar';

export const globalChartDisplayType = writable<GlobalChartType>('doughnut');