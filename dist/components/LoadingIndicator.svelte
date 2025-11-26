<!-- src/lib/components/Loader.svelte -->
<script lang="ts">
    export let type: 'circle' | 'triangle' | 'rect' = 'rect';

    let viewBox: string;
    $: {
        if (type === 'triangle') {
            viewBox = '0 0 86 80';
        } else {
            viewBox = '0 0 80 80';
        }
    }
</script>

<div class="loader-overlay"> 
    <div class="loader" class:triangle={type === 'triangle'}> 
        <svg {viewBox}>
            {#if type === 'circle'}
                <circle id="test" cx="40" cy="40" r="32"></circle>
            {:else if type === 'triangle'}
                <polygon points="43 8 79 72 7 72"></polygon>
            {:else if type === 'rect'}
                <rect x="8" y="8" width="64" height="64"></rect>
            {/if}
        </svg>
    </div>
</div>

<style>.loader-overlay {
  position: fixed; /* Position fixed to cover the entire viewport */
  top: 0;
  left: 0;
  width: 100vw; /* Full viewport width */
  height: 100vh; /* Full viewport height */
  display: flex; /* Use flexbox to center the content */
  align-items: center; /* Center vertically */
  justify-content: center; /* Center horizontally */
  background-color: rgba(0, 0, 0, 0.5); /* Optional: semi-transparent background to dim page content */
  z-index: 100000; /* High z-index to ensure it's on top of other content */
}

.loader { /* Original .loader styles, now apply to the centered animation box */
  --path: #2F3545;
  --dot: #5628EE;
  --duration: 3s;
  width: 44px;
  height: 44px;
  position: relative; /* Remains relative for positioning the ::before pseudo-element (the dot) */
  /* The original z-index: 100000; is now handled by .loader-overlay */
}
.loader:before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  position: absolute;
  display: block;
  background: var(--dot);
  top: 37px;
  left: 19px;
  transform: translate(-18px, -18px);
  animation: dotRect var(--duration) cubic-bezier(0.785, 0.135, 0.15, 0.86) infinite;
}
.loader svg {
  display: block;
  width: 100%;
  height: 100%;
}
.loader svg rect,
.loader svg polygon,
.loader svg circle {
  fill: none;
  stroke: var(--path);
  stroke-width: 10px;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.loader svg polygon {
  stroke-dasharray: 145 76 145 76;
  stroke-dashoffset: 0;
  animation: pathTriangle var(--duration) cubic-bezier(0.785, 0.135, 0.15, 0.86) infinite;
}
.loader svg rect {
  stroke-dasharray: 192 64 192 64;
  stroke-dashoffset: 0;
  animation: pathRect 3s cubic-bezier(0.785, 0.135, 0.15, 0.86) infinite;
}
.loader svg circle {
  stroke-dasharray: 150 50 150 50;
  stroke-dashoffset: 75;
  animation: pathCircle var(--duration) cubic-bezier(0.785, 0.135, 0.15, 0.86) infinite;
}
.loader.triangle {
  width: 48px;
}
.loader.triangle:before {
  left: 21px;
  transform: translate(-10px, -18px);
  animation: dotTriangle var(--duration) cubic-bezier(0.785, 0.135, 0.15, 0.86) infinite;
}

/* Keyframes remain the same as they operate on the .loader element's dimensions and ::before pseudo-element */
@keyframes pathTriangle {
  33% {
    stroke-dashoffset: 74;
  }
  66% {
    stroke-dashoffset: 147;
  }
  100% {
    stroke-dashoffset: 221;
  }
}
@keyframes dotTriangle {
  33% {
    transform: translate(0, 0);
  }
  66% {
    transform: translate(10px, -18px);
  }
  100% {
    transform: translate(-10px, -18px);
  }
}
@keyframes pathRect {
  25% {
    stroke-dashoffset: 64;
  }
  50% {
    stroke-dashoffset: 128;
  }
  75% {
    stroke-dashoffset: 192;
  }
  100% {
    stroke-dashoffset: 256;
  }
}
@keyframes dotRect {
  25% {
    transform: translate(0, 0);
  }
  50% {
    transform: translate(18px, -18px);
  }
  75% {
    transform: translate(0, -36px);
  }
  100% {
    transform: translate(-18px, -18px);
  }
}
@keyframes pathCircle {
  25% {
    stroke-dashoffset: 125;
  }
  50% {
    stroke-dashoffset: 175;
  }
  75% {
    stroke-dashoffset: 225;
  }
  100% {
    stroke-dashoffset: 275;
  }
}</style>