<script lang="ts">
  import { createEventDispatcher, onMount, onDestroy, tick } from 'svelte';

  export let value: string | null = null; // Initial time "HH:MM" (24-hour) or null

  const dispatch = createEventDispatcher<{ change: string | null; cancel: void }>();

  let selectedHour12: number = 7; // 1-12 for display and analog clock
  let selectedMinute: number = 0;  // 0-59
  let selectedPeriod: 'AM' | 'PM' = 'AM';
  let selectionMode: 'hour' | 'minute' = 'hour'; // To toggle between hour and minute selection on the clock

  let clockElement: SVGSVGElement; // Reference to the SVG element
  let isDragging = false;

  // --- Time Conversion Utilities ---
  function to24Hour(hour12: number, period: 'AM' | 'PM'): number {
    if (period === 'PM' && hour12 !== 12) return hour12 + 12;
    if (period === 'AM' && hour12 === 12) return 0; // Midnight
    return hour12;
  }

  function from24Hour(hour24: number): { hour12: number; period: 'AM' | 'PM' } {
    const period = hour24 >= 12 ? 'PM' : 'AM';
    let h12 = hour24 % 12;
    if (h12 === 0) h12 = 12;
    return { hour12: h12, period };
  }

  // --- Update internal state from 'value' prop ---
  // isInitialMount: True only when called from onMount
  function updateFromValue(newValue: string | null, isInitialMount: boolean = false) {
    console.log('[DragDebug] updateFromValue called with:', newValue, 'isInitialMount:', isInitialMount);

    if (newValue && /^\d{2}:\d{2}$/.test(newValue)) { // Case 1: Prop is a valid time string format
        const [h24, m] = newValue.split(':').map(Number);
        if (!isNaN(h24) && !isNaN(m) && h24 >= 0 && h24 <= 23 && m >= 0 && m <= 59) { // Parsed successfully
            const { hour12, period } = from24Hour(h24);
            
            // Only update if the new prop time is actually different from the current internal time.
            // This prevents redundant updates/re-renders if the parent sets the prop to what was just emitted.
            const currentInternalHour24 = to24Hour(selectedHour12, selectedPeriod);
            if (h24 !== currentInternalHour24 || m !== selectedMinute) {
                selectedHour12 = hour12;
                selectedMinute = m;
                selectedPeriod = period;
                console.log('[DragDebug] Time updated from valid prop:', {selectedHour12, selectedMinute, selectedPeriod});
            } else {
                console.log('[DragDebug] Prop value matches internal state, no update needed from prop.');
            }
            return;
        }
        // Prop was a string but failed h24/m number validation (e.g., "99:99")
        console.warn('[DragDebug] Prop was a time string but failed h24/m validation:', newValue);
        if (isInitialMount) { // Only reset to default on initial mount if prop is an unparsable time string
            selectedHour12 = 7; selectedMinute = 0; selectedPeriod = 'AM';
            console.log('[DragDebug] Initial mount with unparsable time string, reset to default.');
        }
        // If not initial mount, and prop is an unparsable time string, retain current state.
        return;
    }

    // Case 2: Prop is null, empty string, or fails regex (i.e., not a "HH:MM" string)
    if (isInitialMount) {
        // On initial mount, if prop is not a valid time string (e.g., null, undefined, empty, "abc"), set to default.
        selectedHour12 = 7;
        selectedMinute = 0;
        selectedPeriod = 'AM';
        console.log('[DragDebug] Initial mount: prop is null or invalid format, set to default.');
    } else {
        // If NOT initial mount, and prop is null or invalid format, DO NOTHING to the internal state.
        // The component's state should only be driven by valid "HH:MM" time strings from the prop
        // after initialization, or by user interaction. If the parent sends null later,
        // it implies "no controlling input from parent", so the component keeps its current interactive state.
        console.log('[DragDebug] updateFromValue: Prop is null or invalid format, and not initial mount. No change to internal state from this prop update.');
    }
  }

  onMount(() => {
    console.log('[DragDebug] Component Mounted');
    updateFromValue(value, true); // Initialize from prop, isInitialMount = true
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchend', handleMouseUp);
  });

  onDestroy(() => {
    console.log('[DragDebug] Component Destroyed');
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('touchend', handleMouseUp);
  });


  // --- React to external changes to 'value' ---
  // This reactive block synchronizes the component's internal state
  // with the 'value' prop when the prop changes externally.
  // It will NOT reset the internal state if the user is actively dragging.
  $: if (value !== undefined && !isDragging) {
    const internalHour24 = to24Hour(selectedHour12, selectedPeriod);
    const currentInternalValueAsString = `${String(internalHour24).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;

    // Only call updateFromValue if the 'value' prop is different from what the component currently represents.
    // This is crucial. If `value` is `null` and `currentInternalValueAsString` is "07:57", they are different.
    // `updateFromValue(null, false)` will be called. As per the new logic in `updateFromValue`,
    // for a non-initial mount, a null `value` will NOT cause a reset to default.
    if (value !== currentInternalValueAsString) {
      console.log('[DragDebug] External value prop changed AND not dragging. Prop:', value, 'Internal was:', currentInternalValueAsString, 'Calling updateFromValue.');
      updateFromValue(value, false); // isInitialMount is false here
    }
  }

  // --- Event Handlers ---
  function emitChange() {
    const hour24 = to24Hour(selectedHour12, selectedPeriod);
    const formattedTime = `${String(hour24).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;
    console.log('[DragDebug] Emitting change:', formattedTime);
    dispatch('change', formattedTime);
  }

  function handleOkClick() {
    emitChange();
  }

  function handleCancelClick() {
    // Revert to the current 'value' prop if cancellation happens.
    // This ensures that if a user drags and then cancels, it goes back to the state defined by the prop.
    console.log('[DragDebug] Cancel clicked. Reverting to prop value:', value);
    updateFromValue(value, false); // Treat as a non-initial update from prop.
                                  // If 'value' is null, it will reset to default if that's the desired cancel behavior for null prop.
                                  // Or, keep current state if value is null and updateFromValue is designed to ignore nulls post-init.
                                  // Given current updateFromValue, if value is null, it will do nothing.
                                  // If you want cancel to *always* reset to original prop value (even if it means default for null):
                                  // updateFromValue(value, true) could be used, but that's a bit of a hack.
                                  // A dedicated "originalValue" state might be better for complex cancel logic.
    dispatch('cancel');
  }

  function setSelectionMode(mode: 'hour' | 'minute') {
    console.log('[DragDebug] Setting selection mode to:', mode);
    selectionMode = mode;
  }

  function cycleDigitalMinutes() {
    selectedMinute = (selectedMinute + 1) % 60;
    console.log('[DragDebug] Cycled digital minutes to:', selectedMinute);
    // emitChange(); // Consider if digital changes should emit immediately or on OK
  }
  function cycleDigitalHours() {
    selectedHour12 = (selectedHour12 % 12) + 1;
    console.log('[DragDebug] Cycled digital hours to:', selectedHour12);
    // emitChange(); // Consider if digital changes should emit immediately or on OK
  }

  function togglePeriod(p: 'AM' | 'PM') {
    if (selectedPeriod !== p) {
      selectedPeriod = p;
      console.log('[DragDebug] Toggled period to:', selectedPeriod);
      // emitChange(); // Consider if period changes should emit immediately or on OK
    }
  }

  // --- Analog Clock Setup ---
  const clockRadius = 80;
  const numberRadius = clockRadius - 15;
  const selectedDotRadius = 12;

  interface ClockPoint {
    value: number;
    display: string;
    x: number;
    y: number;
  }
  let clockPoints: ClockPoint[] = [];

  $: {
    const points = selectionMode === 'hour' ? 12 : 12;
    const valueStep = selectionMode === 'hour' ? 1 : 5;
    const startValue = selectionMode === 'hour' ? 12 : 0;

    clockPoints = Array.from({ length: points }).map((_, i) => {
      const angle = (i * Math.PI / (points / 2)) - (Math.PI / 2);
      let currentValue: number;
      let displayValue: string;
      if (selectionMode === 'hour') {
        currentValue = (startValue + i) % 12;
        if (currentValue === 0) currentValue = 12;
        displayValue = String(currentValue);
      } else {
        currentValue = (i * valueStep) % 60;
        displayValue = String(currentValue).padStart(2, '0');
      }
      return {
        value: currentValue,
        display: displayValue,
        x: clockRadius + numberRadius * Math.cos(angle),
        y: clockRadius + numberRadius * Math.sin(angle),
      };
    });
  }
  
  // --- Hand Calculation (Reactive) ---
  $: activeValueForHand = selectionMode === 'hour' ? selectedHour12 : selectedMinute;
  $: totalStepsForHand = selectionMode === 'hour' ? 12 : 60;
  $: handAngle = ((activeValueForHand % totalStepsForHand) / totalStepsForHand) * 2 * Math.PI - (Math.PI / 2);
  $: handEndX = clockRadius + (numberRadius - (selectionMode === 'hour' ? selectedDotRadius : 8) - 2) * Math.cos(handAngle);
  $: handEndY = clockRadius + (numberRadius - (selectionMode === 'hour' ? selectedDotRadius : 8) - 2) * Math.sin(handAngle);

  $: console.log('[DragDebug] Hand End Coords Updated:', { handEndX, handEndY, selectedHour12, selectedMinute, selectionMode });


  // --- Draggable Hand Logic ---
  function getAngle(event: MouseEvent | TouchEvent): number | null {
    if (!clockElement) {
      console.error('[DragDebug] getAngle: clockElement is not defined!');
      return null;
    }
    const rect = clockElement.getBoundingClientRect();
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    
    const x = clientX - rect.left - clockRadius;
    const y = clientY - rect.top - clockRadius;
    let angle = Math.atan2(y, x) + Math.PI / 2;
    if (angle < 0) angle += 2 * Math.PI;
    return angle;
  }

  function updateValueFromAngle(angle: number) {
    if (selectionMode === 'hour') {
      let hour = Math.round(angle / (2 * Math.PI / 12)) % 12;
      if (hour === 0) hour = 12;
      if (selectedHour12 !== hour) {
        // console.log('[DragDebug] updateValueFromAngle (Hour): Old:', selectedHour12, 'New:', hour, 'from angle (deg):', angle * 180 / Math.PI);
        selectedHour12 = hour;
      }
    } else { // minute mode
      let minute = Math.round(angle / (2 * Math.PI / 60)) % 60;
      if (selectedMinute !== minute) {
        // console.log('[DragDebug] updateValueFromAngle (Minute): Old:', selectedMinute, 'New:', minute, 'from angle (deg):', angle * 180 / Math.PI);
        selectedMinute = minute;
      }
    }
  }
  
  function handleMouseDown(event: MouseEvent | TouchEvent) {
    console.log('[DragDebug] handleMouseDown fired. Current mode:', selectionMode);
    event.preventDefault();
    isDragging = true;
    console.log('[DragDebug] isDragging set to true');
    const angle = getAngle(event);
    if (angle !== null) {
      updateValueFromAngle(angle);
    } else {
      console.error('[DragDebug] handleMouseDown: Could not get angle.');
    }
  }

  function handleMouseMove(event: MouseEvent | TouchEvent) {
    if (!isDragging) return;
    event.preventDefault();
    const angle = getAngle(event);
    if (angle !== null) {
      updateValueFromAngle(angle);
    }
  }

  function handleMouseUp(event: MouseEvent | TouchEvent) {
    if (isDragging) {
      console.log('[DragDebug] handleMouseUp fired. Target:', event.target);
      isDragging = false;
      console.log('[DragDebug] isDragging set to false');
      emitChange(); // Emit the final change after dragging is complete
    }
  }

  function selectValueOnClock(value: number) {
    console.log('[DragDebug] selectValueOnClock called with value:', value, 'in mode:', selectionMode);
    if (selectionMode === 'hour') {
        selectedHour12 = value;
    } else {
        selectedMinute = value;
    }
    // emitChange(); // Consider if click selection should emit immediately or on OK
  }

</script>

<div class="picker-dialog">
  <div class="picker-header">SELECT TIME</div>

  <div class="digital-display">
    <span
      class="digital-value"
      class:active={selectionMode === 'hour'}
      role="button" tabindex="0"
      on:click={() => setSelectionMode('hour')}
      on:keydown={(e) => e.key === 'Enter' && setSelectionMode('hour')}
    >{String(selectedHour12).padStart(selectedHour12 > 9 ? 2 : 1, ' ')}</span>
    <span class="digital-colon">:</span>
    <span
      class="digital-value"
      class:active={selectionMode === 'minute'}
      role="button" tabindex="0"
      on:click={() => setSelectionMode('minute')}
      on:keydown={(e) => e.key === 'Enter' && setSelectionMode('minute')}
    >{String(selectedMinute).padStart(2, '0')}</span>

    <div class="period-toggle">
      <button class:active={selectedPeriod === 'AM'} on:click={() => togglePeriod('AM')}>AM</button>
      <button class:active={selectedPeriod === 'PM'} on:click={() => togglePeriod('PM')}>PM</button>
    </div>
  </div>

  <div
    class="analog-clock-container"
    on:mousedown={handleMouseDown}
    on:mousemove={handleMouseMove}
    on:mouseup={handleMouseUp} 
    on:touchstart={handleMouseDown} 
    on:touchmove={handleMouseMove}
    on:touchend={handleMouseUp} 
    role="slider"
    aria-valuemin={selectionMode === 'hour' ? 1 : 0}
    aria-valuemax={selectionMode === 'hour' ? 12 : 59}
    aria-valuenow={selectionMode === 'hour' ? selectedHour12 : selectedMinute}
    aria-label={selectionMode === 'hour' ? "Select hour" : "Select minute"}
  >
    <svg bind:this={clockElement} class="analog-clock" viewBox="0 0 {clockRadius * 2} {clockRadius * 2}" width={clockRadius * 2} height={clockRadius * 2}>
      <circle cx={clockRadius} cy={clockRadius} r={clockRadius} fill="#f0f0f0" class="clock-face-bg"/>
      <circle cx={clockRadius} cy={clockRadius} r="3" fill="#5856d6" /> 
      <line
        x1={clockRadius} y1={clockRadius}
        x2={handEndX} y2={handEndY}
        stroke="#5856d6" stroke-width="2" class="clock-hand"
      />

      <circle
        cx={handEndX} cy={handEndY}
        r={selectionMode === 'hour' ? "8" : "6" } class="hand-tip-highlight"
        fill="#5856d6"
      />
      
      {#each clockPoints as cp (cp.display + selectionMode)}
        <text
          x={cp.x} y={cp.y}
          text-anchor="middle" dominant-baseline="central"
          class="clock-point-text"
          class:selected-value-on-clock={ (selectionMode === 'hour' && cp.value === selectedHour12) || (selectionMode === 'minute' && cp.value === Math.round(selectedMinute/5)*5 && cp.value === selectedMinute) }
          on:click|stopPropagation={() => selectValueOnClock(cp.value)}
        >{cp.display}</text>
      {/each}
    </svg>
  </div>

  <div class="picker-footer">
    <span class="keyboard-icon" title="Switch to keyboard input (not implemented)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20 5H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zm-3 0h2v2H8v-2zm-3 0h2v2H5v-2zm3-3h2v2H8V8zm3 6h8v2H11v-2zm-3 0h2v2H8v-2zm-3 0h2v2H5v-2z"/></svg>
    </span>
    <div>
        <button class="footer-btn" on:click={handleCancelClick}>Cancel</button>
        <button class="footer-btn" on:click={handleOkClick}>OK</button>
    </div>
  </div>
</div>

<style>
  .picker-dialog {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: #ffffff;
    border-radius: 4px;
    box-shadow: 0 8px 16px rgba(0,0,0,0.15);
    width: 280px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    color: #000;
    user-select: none; /* Prevent text selection during drag */
  }

  .picker-header {
    font-size: 0.8rem;
    color: #666;
    margin-bottom: 20px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .digital-display {
    display: flex;
    align-items: baseline;
    justify-content: center;
    margin-bottom: 20px;
    position: relative;
  }

  .digital-value {
    font-size: 3.5rem;
    font-weight: 300;
    color: #999; /* Default to grey */
    padding: 0 5px;
    cursor: pointer;
    transition: color 0.2s;
  }
  .digital-value.active {
    color: #5856d6; /* Purple for active selection mode */
  }
  .digital-value:not(.active):hover {
    color: #555;
  }


  .digital-colon {
    font-size: 3rem;
    font-weight: 300;
    color: #ccc;
    margin: 0 -5px;
    transform: translateY(-3px);
  }

  .period-toggle {
    display: flex;
    flex-direction: column;
    margin-left: 15px;
  }

  .period-toggle button {
    background-color: transparent;
    border: 1px solid #e0e0e0;
    color: #555;
    padding: 4px 8px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
    border-radius: 0;
  }
  .period-toggle button:first-child {
    border-bottom: none;
    border-top-left-radius: 4px;
    border-top-right-radius: 4px;
  }
  .period-toggle button:last-child {
    border-bottom-left-radius: 4px;
    border-bottom-right-radius: 4px;
  }

  .period-toggle button.active {
    background-color: #5856d6;
    color: white;
    border-color: #5856d6;
  }
  .period-toggle button:not(.active):hover {
    background-color: #f5f5f5;
  }

  .analog-clock-container {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 20px;
    height: 160px; /* clockRadius * 2 */
    cursor: grab; /* Indicate draggable area */
  }
  .analog-clock-container:active {
      cursor: grabbing;
  }

  .analog-clock {
    width: 160px; /* clockRadius * 2 */
    height: 160px; /* clockRadius * 2 */
    touch-action: none; /* Prevent scrolling on touch devices during drag, ensure this is effective */
  }
  .clock-face-bg {
      /* fill: #f0f0f0; */ /* Already set in SVG element */
  }
  .clock-hand {
      /* stroke: #5856d6; stroke-width: 2; */ /* Already set in SVG element */
  }
  .hand-tip-highlight {
      /* fill: #5856d6; */ /* Already set in SVG element */
  }

  .clock-point-text {
    cursor: pointer;
    user-select: none;
    font-size: 12px;
    fill: #333;
  }
  .clock-point-text:hover {
    font-weight: bold;
    fill: #5856d6;
  }
  .clock-point-text.selected-value-on-clock {
      fill: #5856d6; /* Highlight the selected number on the clock face */
      font-weight: bold;
      font-size: 14px; /* Make it slightly larger */
  }

  .picker-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: 10px;
    border-top: 1px solid #f0f0f0;
  }
  .keyboard-icon {
    color: #888;
    cursor: pointer;
  }
  .keyboard-icon:hover {
    color: #5856d6;
  }

  .footer-btn {
    background-color: transparent;
    border: none;
    padding: 8px 12px;
    font-size: 0.9rem;
    font-weight: 500;
    text-transform: uppercase;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.2s;
    color: #5856d6;
  }
  .footer-btn:hover {
    background-color: rgba(88, 86, 214, 0.1);
  }
</style>
