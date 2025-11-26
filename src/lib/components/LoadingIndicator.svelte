<!-- Loader.svelte -->
<script lang="ts">
  // ... (script tag remains the same as the previous correct version)
  /**
   * If true, the indicator will take up the full screen with a semi-transparent overlay.
   * @default true
   */
  export let fullScreen: boolean = true;

  /**
   * The message to display below the indicator.
   * @default "Microtasks is getting ready..."
   */
  export let message: string = "Loading, please wait...";

  /**
   * Animation duration.
   * @default 1.5
   */
  export let duration: number = 1.5; // seconds

  /**
   * Overall width of the animation container.
   * @default "200px"
   */
  export let containerSize: string = "200px";

  /**
   * Size of each box (width and height).
   * @default "27px"
   */
  export let boxSize: string = "27px";

  /**
   * Border radius for the boxes.
   * @default "15%"
   */
  export let boxBorderRadius: string = "15%";

  /**
   * Background color for the full-screen overlay.
   * @default "rgba(30, 41, 59, 0.7)"
   */
  export let overlayBackgroundColor: string = "rgba(30, 41, 59, 0.7)";

  /**
   * Text color for the message.
   * @default "#e2e8f0"
   */
  export let messageTextColor: string = "#e2e8f0";

  export let slideBoxAfterStartColor: string = "#1795FF";
  export let slideBoxAfterEndColor: string = "#23D3FB";
  export let box2AfterColor: string = "#1C9FFF";
  export let box3AfterColor: string = "#1FB1FD";
  export let box4AfterColor: string = "#22C7FB";
  export let box5AfterColor: string = "#23D3FB";
  export let boxShadowBaseColor: string = "#1C9FFF";
</script>

{#if fullScreen}
  <div
    class="loader-overlay"
    style:--overlay-bg-color={overlayBackgroundColor}
    role="status"
    aria-live="polite"
  >
    <div
      class="animation-wrapper"
      style:--duration="{duration}s"
      style:--container-size={containerSize}
      style:--box-size={boxSize}
      style:--box-border-radius={boxBorderRadius}
      style:--slide-box-after-start-color={slideBoxAfterStartColor}
      style:--slide-box-after-end-color={slideBoxAfterEndColor}
      style:--box2-after-color={box2AfterColor}
      style:--box3-after-color={box3AfterColor}
      style:--box4-after-color={box4AfterColor}
      style:--box5-after-color={box5AfterColor}
      style:--box-shadow-base-color={boxShadowBaseColor}
    >
      <div class="container">
        <div class="box"></div> <!-- Box 1 -->
        <div class="box"></div> <!-- Box 2 -->
        <div class="box"></div> <!-- Box 3 -->
        <div class="box"></div> <!-- Box 4 -->
        <div class="box"></div> <!-- Box 5 -->
      </div>
    </div>
    {#if message}
      <p class="loader-message" style:color={messageTextColor}>{message}</p>
    {/if}
  </div>
{:else}
  <div
    class="animation-wrapper"
    style:--duration="{duration}s"
    style:--container-size={containerSize}
    style:--box-size={boxSize}
    style:--box-border-radius={boxBorderRadius}
    style:--slide-box-after-start-color={slideBoxAfterStartColor}
    style:--slide-box-after-end-color={slideBoxAfterEndColor}
    style:--box2-after-color={box2AfterColor}
    style:--box3-after-color={box3AfterColor}
    style:--box4-after-color={box4AfterColor}
    style:--box5-after-color={box5AfterColor}
    style:--box-shadow-base-color={boxShadowBaseColor}
  >
    <div class="container">
      <div class="box"></div>
      <div class="box"></div>
      <div class="box"></div>
      <div class="box"></div>
      <div class="box"></div>
    </div>
    {#if message}
      <p class="loader-message-inline" style:color={messageTextColor}>{message}</p>
    {/if}
  </div>
{/if}

<style lang="scss">
  .loader-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background-color: var(--overlay-bg-color);
    z-index: 100000;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }

  .animation-wrapper {
    // CSS variables are set here
  }

  .loader-message {
    margin-top: 20px;
    font-size: 1rem;
    font-weight: 500;
  }
  .loader-message-inline {
    font-size: 0.9rem;
    margin-top: 10px;
  }

  .container {
    width: var(--container-size);
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: relative;
  }

  .box {
    width: var(--box-size);
    height: var(--box-size);
    position: relative;
    display: block;
    transform-origin: -50% center;
    border-radius: var(--box-border-radius);

    &:after {
      content: '';
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      right: 0;
      border-radius: var(--box-border-radius);
      box-shadow: 0px 0px 10px 0px rgba(var(--box-shadow-base-color), 0.4);
    }

    &:nth-child(1) {
      animation: slide var(--duration) ease-in-out infinite alternate;
      &:after {
        animation: color-change var(--duration) ease-in-out infinite alternate;
      }
    }

    &:nth-child(2) {
      animation: flip-1 var(--duration) ease-in-out infinite alternate;
      &:after {
        background-color: var(--box2-after-color);
        animation: squidge-1 var(--duration) ease-in-out infinite alternate;
      }
    }
    &:nth-child(3) {
      animation: flip-2 var(--duration) ease-in-out infinite alternate;
      &:after {
        background-color: var(--box3-after-color);
        animation: squidge-2 var(--duration) ease-in-out infinite alternate;
      }
    }
    &:nth-child(4) {
      animation: flip-3 var(--duration) ease-in-out infinite alternate;
      &:after {
        background-color: var(--box4-after-color);
        animation: squidge-3 var(--duration) ease-in-out infinite alternate;
      }
    }
    &:nth-child(5) {
      animation: flip-4 var(--duration) ease-in-out infinite alternate;
      &:after {
        background-color: var(--box5-after-color);
        animation: squidge-4 var(--duration) ease-in-out infinite alternate;
      }
    }
  }

  @keyframes slide {
    0% {
      background-color: var(--slide-box-after-start-color);
      transform: translatex(0vw);
    }
    100% {
      background-color: var(--slide-box-after-end-color);
      transform: translatex(calc(var(--container-size) - (var(--box-size) * 1.25)));
    }
  }

  @keyframes color-change {
    0% { background-color: var(--slide-box-after-start-color); }
    100% { background-color: var(--slide-box-after-end-color); }
  }

  // --- Staggered Keyframes with static percentages ---

  // For .box:nth-child(2)
  @keyframes flip-1 {
    0%, 15% { transform: rotate(0); }
    35%, 100% { transform: rotate(-180deg); }
  }
  @keyframes squidge-1 {
    5% { transform-origin: center bottom; transform: scalex(1) scaley(1); }
    15% { transform-origin: center bottom; transform: scalex(1.3) scaley(0.7); }
    20%, 25% { transform-origin: center bottom; transform: scalex(0.8) scaley(1.4); }
    40% { transform-origin: center top; transform: scalex(1.3) scaley(0.7); }
    55%, 100% { transform-origin: center top; transform: scalex(1) scaley(1); }
  }

  // For .box:nth-child(3)
  @keyframes flip-2 {
    0%, 30% { transform: rotate(0); }
    50%, 100% { transform: rotate(-180deg); }
  }
  @keyframes squidge-2 {
    20% { transform-origin: center bottom; transform: scalex(1) scaley(1); }
    30% { transform-origin: center bottom; transform: scalex(1.3) scaley(0.7); }
    35%, 40% { transform-origin: center bottom; transform: scalex(0.8) scaley(1.4); }
    55% { transform-origin: center top; transform: scalex(1.3) scaley(0.7); }
    70%, 100% { transform-origin: center top; transform: scalex(1) scaley(1); }
  }

  // For .box:nth-child(4)
  @keyframes flip-3 {
    0%, 45% { transform: rotate(0); }
    65%, 100% { transform: rotate(-180deg); }
  }
  @keyframes squidge-3 {
    35% { transform-origin: center bottom; transform: scalex(1) scaley(1); }
    45% { transform-origin: center bottom; transform: scalex(1.3) scaley(0.7); }
    50%, 55% { transform-origin: center bottom; transform: scalex(0.8) scaley(1.4); }
    70% { transform-origin: center top; transform: scalex(1.3) scaley(0.7); }
    85%, 100% { transform-origin: center top; transform: scalex(1) scaley(1); }
  }

  // For .box:nth-child(5)
  @keyframes flip-4 {
    0%, 60% { transform: rotate(0); }
    80%, 100% { transform: rotate(-180deg); }
  }
  @keyframes squidge-4 {
    50% { transform-origin: center bottom; transform: scalex(1) scaley(1); }
    60% { transform-origin: center bottom; transform: scalex(1.3) scaley(0.7); }
    65%, 70% { transform-origin: center bottom; transform: scalex(0.8) scaley(1.4); }
    85% { transform-origin: center top; transform: scalex(1.3) scaley(0.7); }
    100% { transform-origin: center top; transform: scalex(1) scaley(1); } // Only 100% for the last step
  }
</style>