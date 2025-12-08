<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    
    export let value: string = ''; // YYYY-MM-DD format
    export let required: boolean = false;
    export let id: string = '';
    export let name: string = '';
    export let isDarkMode: boolean = false;
    
    const dispatch = createEventDispatcher();
    
    // Parse initial value
    let selectedYear: string = '';
    let selectedMonth: string = '';
    let selectedDay: string = '';
    
    // Generate year options (current year - 1 to current year + 5)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 7 }, (_, i) => currentYear - 1 + i);
    
    // Month names
    const months = [
        { value: '01', name: 'January' },
        { value: '02', name: 'February' },
        { value: '03', name: 'March' },
        { value: '04', name: 'April' },
        { value: '05', name: 'May' },
        { value: '06', name: 'June' },
        { value: '07', name: 'July' },
        { value: '08', name: 'August' },
        { value: '09', name: 'September' },
        { value: '10', name: 'October' },
        { value: '11', name: 'November' },
        { value: '12', name: 'December' }
    ];
    
    // Calculate days in month
    function getDaysInMonth(year: number, month: number): number {
        return new Date(year, month, 0).getDate();
    }
    
    // Generate day options based on selected month/year
    $: daysInMonth = selectedYear && selectedMonth 
        ? getDaysInMonth(parseInt(selectedYear), parseInt(selectedMonth))
        : 31;
    
    $: days = Array.from({ length: daysInMonth }, (_, i) => 
        (i + 1).toString().padStart(2, '0')
    );
    
    // Parse value when it changes externally
    $: if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-');
        selectedYear = y;
        selectedMonth = m;
        selectedDay = d;
    }
    
    // Combine into date string when all fields are selected
    function updateValue() {
        if (selectedYear && selectedMonth && selectedDay) {
            // Validate day is still valid for the month
            const maxDays = getDaysInMonth(parseInt(selectedYear), parseInt(selectedMonth));
            if (parseInt(selectedDay) > maxDays) {
                selectedDay = maxDays.toString().padStart(2, '0');
            }
            value = `${selectedYear}-${selectedMonth}-${selectedDay}`;
            dispatch('change', value);
        } else {
            value = '';
            dispatch('change', '');
        }
    }
    
    // Pre-fill with today's date if empty and user starts selecting
    function initializeIfEmpty() {
        if (!selectedYear && !selectedMonth && !selectedDay) {
            const today = new Date();
            selectedYear = today.getFullYear().toString();
            selectedMonth = (today.getMonth() + 1).toString().padStart(2, '0');
            selectedDay = today.getDate().toString().padStart(2, '0');
        }
    }
</script>

<!-- Hidden input for form submission -->
<input type="hidden" {name} {id} bind:value {required} />

<div class="date-picker-container">
    <select 
        class="date-select month-select"
        class:dark={isDarkMode}
        bind:value={selectedMonth}
        on:change={updateValue}
        on:focus={initializeIfEmpty}
        aria-label="Month"
    >
        <option value="" disabled>Month</option>
        {#each months as month}
            <option value={month.value}>{month.name}</option>
        {/each}
    </select>
    
    <select 
        class="date-select day-select"
        class:dark={isDarkMode}
        bind:value={selectedDay}
        on:change={updateValue}
        on:focus={initializeIfEmpty}
        aria-label="Day"
    >
        <option value="" disabled>Day</option>
        {#each days as day}
            <option value={day}>{parseInt(day)}</option>
        {/each}
    </select>
    
    <select 
        class="date-select year-select"
        class:dark={isDarkMode}
        bind:value={selectedYear}
        on:change={updateValue}
        on:focus={initializeIfEmpty}
        aria-label="Year"
    >
        <option value="" disabled>Year</option>
        {#each years as year}
            <option value={year.toString()}>{year}</option>
        {/each}
    </select>
</div>

<style>
    .date-picker-container {
        display: flex;
        gap: 0.5rem;
        width: 100%;
    }
    
    .date-select {
        padding: 0.5rem 0.75rem;
        border: 1px solid #d1d5db;
        border-radius: 0.375rem;
        background-color: white;
        color: #1f2937;
        font-size: 0.875rem;
        cursor: pointer;
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    
    .date-select:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    
    .date-select.dark {
        background-color: #3f3f46;
        border-color: #52525b;
        color: #e4e4e7;
    }
    
    .date-select.dark:focus {
        border-color: #3b82f6;
    }
    
    .month-select {
        flex: 1.5;
        min-width: 0;
    }
    
    .day-select {
        flex: 0.8;
        min-width: 0;
    }
    
    .year-select {
        flex: 1;
        min-width: 0;
    }
    
    /* Mobile responsive */
    @media (max-width: 400px) {
        .date-picker-container {
            flex-wrap: wrap;
        }
        
        .month-select {
            flex: 1 1 100%;
        }
        
        .day-select, .year-select {
            flex: 1 1 45%;
        }
    }
</style>
