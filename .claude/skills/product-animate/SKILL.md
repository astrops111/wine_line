---
name: product-animate
description: >
  Build scroll-driven product deconstruct/reconstruct animation websites. The product image
  splits into a grid of pieces that fly apart as the user scrolls down (deconstruct), then
  reassemble as they continue scrolling (reconstruct). Use this skill whenever the user mentions
  scroll animation, product deconstruct, exploded view animation, product split animation,
  frame-by-frame scroll, Apple-style product reveal, canvas scroll effect, parallax product
  animation, or wants to build a site where a product breaks apart and comes back together on
  scroll. Also use when the user wants to turn a product image into an interactive scrolling
  experience, or asks about the Wisk → Google Flow → Easy GIF pipeline for scroll animations.
---

# Product Deconstruct/Reconstruct Animation Builder

Build production-ready scroll-driven websites where a product image deconstructs into individual
pieces that fly apart, then reconstructs as the user continues scrolling. Two modes:

1. **Real-time deconstruct** — A single product image is sliced into an NxN grid; each piece
   animates outward with unique trajectory, rotation, scale, and depth. No pre-rendered frames needed.
2. **Frame-by-frame** — Pre-rendered frames from a video play sequentially on scroll (classic approach).

Default to Mode 1 (real-time) unless the user specifically has frame images or requests frame-by-frame.

## When to Use

- User wants a product that breaks apart / explodes on scroll
- User wants an Apple-style scroll animation
- User wants a product landing page with scroll-driven visuals
- User has a product image and wants an interactive reveal
- User has sequential frame images from Easy GIF, FFmpeg, etc.
- User references the Wisk → Google Flow → Easy GIF → code workflow

---

## Mode 1: Real-Time Deconstruct (Default)

### Architecture

```
project/
├── index.html          # Hero, scroll animation section with overlays, closing CTA
├── style.css           # Dark theme, sticky canvas, overlay transitions
├── script.js           # Deconstruct engine — grid slicing + scroll-driven animation
└── product.png         # User drops their product image here (transparent BG preferred)
```

### Core Mechanics

1. **Sticky Canvas** — `<canvas>` in a `position: sticky` wrapper inside a tall `1000vh` scroll section
2. **Grid Slicing** — Product image is logically divided into `GRID_COLS × GRID_ROWS` pieces (default 8×8 = 64 pieces)
3. **Scroll Mapping** — Progress 0→1 maps to: assembled → fully deconstructed → assembled again
   - `0.0 – 0.5`: Deconstruct phase (pieces fly outward)
   - `0.5 – 1.0`: Reconstruct phase (pieces return home)
4. **Per-Piece Animation** — Each piece has unique:
   - **Trajectory** — Flies outward from center at a unique angle + distance
   - **Rotation** — Spins independently
   - **Scale** — Shrinks/grows
   - **Depth** — Z-axis simulation via scale + shadow (painter's algorithm sorting)
   - **Stagger** — Outer pieces move first when deconstructing; inner pieces arrive first when reconstructing
   - **Opacity** — Fades slightly when deconstructed
5. **Text Overlays** — Fixed-position text with `data-appear-at` / `data-disappear-at` (0–1 range)
6. **Demo Mode** — When no product image found, renders colored grid pieces with component-like details
7. **Background Glow** — Subtle radial gradient that intensifies during peak deconstruction

### Key Configuration

| Setting | Default | Purpose |
|---------|---------|---------|
| `PRODUCT_IMAGE` | `"product.png"` | Path to product image |
| `GRID_COLS` | 8 | Horizontal grid divisions |
| `GRID_ROWS` | 8 | Vertical grid divisions |
| `MAX_SPREAD` | 1.8 | How far pieces fly (multiplier) |
| `MAX_ROTATION` | `Math.PI * 1.5` | Max rotation per piece |
| `MAX_DEPTH` | 400 | Z-depth simulation range |
| Scroll section height | `1000vh` | Animation speed (more = slower) |

### Animation Math

**Scroll progress to piece state:**

```javascript
// progress: 0 = assembled, 0.5 = fully deconstructed, 1 = assembled again
function getPieceState(piece, progress) {
  let t;
  if (progress <= 0.5) {
    // Deconstruct: ease pieces outward with stagger
    const localP = progress / 0.5;
    const staggered = clamp((localP - piece.staggerOut * 0.3) / (1 - piece.staggerOut * 0.3));
    t = easeInOutCubic(staggered);
  } else {
    // Reconstruct: ease pieces back with easeOutBack for satisfying snap
    const localP = (progress - 0.5) / 0.5;
    const staggered = clamp((localP - piece.staggerIn * 0.3) / (1 - piece.staggerIn * 0.3));
    t = 1 - easeOutBack(staggered);
  }
  return {
    offsetX: piece.targetX * t,
    offsetY: piece.targetY * t,
    rotation: piece.targetRotation * t,
    scale: 1 + (piece.targetScale - 1) * t,
    opacity: 1 - (1 - piece.minOpacity) * t,
    depth: piece.targetDepth * t,
  };
}
```

**Piece trajectory generation (seeded random for consistency):**

```javascript
// Each piece flies outward from center
const cx = (col + 0.5) / GRID_COLS - 0.5; // -0.5 to 0.5
const cy = (row + 0.5) / GRID_ROWS - 0.5;
const distFromCenter = Math.sqrt(cx * cx + cy * cy);
const angle = Math.atan2(cy, cx);
const spreadAngle = angle + (rand() - 0.5) * 0.8; // add randomness
const spreadDist = (0.5 + distFromCenter * 1.5 + rand() * 0.5) * MAX_SPREAD;
```

**Depth sorting (painter's algorithm):**

```javascript
const sortedPieces = pieces
  .map(p => ({ ...p, state: getPieceState(p, progress) }))
  .sort((a, b) => a.state.depth - b.state.depth);
```

### Easing Functions

- **easeInOutCubic** — Smooth acceleration/deceleration for deconstruct
- **easeOutBack** — Slight overshoot "snap" effect for reconstruct (pieces bounce into place)

### Critical CSS

```css
.scroll-animation {
  position: relative;
  height: 1000vh;
}

.canvas-wrapper {
  position: sticky;
  top: 0;
  width: 100%;
  height: 100vh;
}

.overlay-text {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  opacity: 0;
  transition: opacity 0.4s ease;
  pointer-events: none;
  z-index: 10;
  mix-blend-mode: difference; /* text readable over any background */
}
```

### Customization Options

- **Grid density**: More cols/rows = more pieces = finer detail but heavier rendering
- **Spread distance**: `MAX_SPREAD` controls explosion radius
- **Scroll speed**: CSS `height` on `.scroll-animation`
- **Asymmetric phases**: Make deconstruct slower than reconstruct by adjusting the 0.5 midpoint
- **Color theme**: CSS variables in `:root`
- **Multiple products**: Stack multiple scroll-animation sections with different canvases
- **Particle trails**: Add fading trails behind pieces during movement
- **3D perspective**: Use CSS `perspective` on wrapper + `transform: translateZ()` for true 3D

---

## Mode 2: Frame-by-Frame (When User Has Frames)

Use this mode when the user already has pre-rendered frame images from a video.

### Frame Generation Pipeline

1. **Create keyframes** — Wisk, Midjourney, or any image tool
2. **Animate** — Google Flow, Runway, or Pika to generate transition video
3. **Extract frames** — Easy GIF (ezgif.com) at 30 FPS, or FFmpeg: `ffmpeg -i video.mp4 -vf fps=30 frames/frame_%04d.png`
4. **Drop into `frames/`** — Zero-padded names: `frame_0001.png` through `frame_NNNN.png`

### Architecture

```
project/
├── index.html
├── style.css
├── script.js           # Frame preloader + scroll-to-frame mapper
└── frames/
    ├── frame_0001.png
    └── ...
```

### Core JS Pattern

```javascript
const TOTAL_FRAMES = 240;
function onScroll() {
  const progress = clamp(sectionScrollTop / (sectionHeight - viewportHeight));
  const frameIndex = Math.min(TOTAL_FRAMES - 1, Math.floor(progress * TOTAL_FRAMES));
  drawFrame(frameIndex); // cover-fit image onto canvas
}
```

---

## Build Process

1. **Determine mode**: Does the user have frame images? → Mode 2. Otherwise → Mode 1 (default).
2. **Ask** (only if unclear): Product name/theme for text overlays? Any product image ready?
3. **Generate files**: `index.html`, `style.css`, `script.js`, and either `frames/` dir or prompt for `product.png`
4. **Customize**: Hero title, overlay text, CTA copy based on product/theme
5. **Start server**: `npx serve .` or `python -m http.server` for immediate testing
6. **Guide**: Explain how to add their product image or frame images

## Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| Animation too fast | Scroll section too short | Increase `.scroll-animation` height |
| Animation too slow | Scroll section too tall | Decrease height |
| Canvas blurry | No retina scaling | `canvas.width = innerWidth * devicePixelRatio` |
| Pieces look blocky | Grid too coarse | Increase `GRID_COLS` / `GRID_ROWS` |
| Performance issues | Grid too fine or canvas too large | Reduce grid size, skip frames on low-end devices |
| Overlays hard to read | Text over bright image area | Use `mix-blend-mode: difference` or add text shadow |
| Product image cut off | Canvas sizing wrong | Use contain-fit logic when drawing image |
