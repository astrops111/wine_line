# Design System Document: The Executive Insight

## 1. Overview & Creative North Star
**Creative North Star: The Precision Curator**

In the world of high-stakes operations, data is often chaotic. This design system is built to serve as "The Precision Curator"—a framework that transforms raw metrics into an editorial experience. We reject the "boxed-in" aesthetic of legacy dashboards in favor of an open, breathing architecture.

By utilizing intentional asymmetry and high-contrast typography scales, we create a hierarchy that guides the eye naturally. We move away from rigid, line-heavy grids toward a more sophisticated "Tonal Architecture." The goal is not just to display information, but to present it with the authority and clarity of a premium financial publication.

---

## 2. Colors: Tonal Architecture
The palette is rooted in deep professional blues and sophisticated neutrals, punctuated by energetic tertiary accents for status and urgency.

### Color Tokens
- **Primary (Core Brand):** `#004b78` (Primary) | `#10639b` (Container)
- **Secondary (Utility/Metadata):** `#505f76` (Secondary) | `#d0e1fb` (Container)
- **Tertiary (Action/Urgency):** `#663f00` (Tertiary) | `#865400` (Container)
- **Neutral Surface:** `#f7f9fb` (Background) | `#ffffff` (Surface Lowest)

### The "No-Line" Rule
Traditional dashboards rely on 1px borders to separate modules, creating visual noise. **This design system prohibits the use of 1px solid borders for sectioning.**
- Separation must be achieved through background shifts. For example, a global sidebar should reside on `surface-container-low`, while the main workspace sits on the `background` token.
- Use the `surface-container` tiers (Lowest to Highest) to create natural breaks in content.

### The "Glass & Gradient" Rule
To elevate the experience from "software" to "service," use Glassmorphism for floating overlays (modals, dropdowns). Apply `surface-container-lowest` with a 80% opacity and a `backdrop-filter: blur(20px)`.
- **Signature Textures:** For high-impact CTAs, use a linear gradient transitioning from `primary` to `primary_container` at a 135-degree angle. This adds "soul" and depth that static fills lack.

---

## 3. Typography: Editorial Authority
We use a dual-typeface system to balance technical precision with executive elegance.

- **Display & Headlines (Manrope):** Chosen for its modern, geometric structure. Use `display-lg` (3.5rem) and `headline-md` (1.75rem) to establish a clear "Editorial Anchor" on each page.
- **Body & Labels (Inter):** A workhorse for legibility. Inter provides the high X-height required for data-heavy tables and stat cards.
- **Visual Hierarchy:** Large headers should be tight-tracked and bold, while `label-sm` (0.6875rem) elements should utilize `on_surface_variant` to recede into the background, ensuring the data remains the hero.

---

## 4. Elevation & Depth: Tonal Layering
We do not "box" content; we "layer" it.

- **The Layering Principle:** Depth is achieved by stacking. Place a `surface_container_lowest` (#ffffff) card on a `surface_container_low` (#f2f4f6) workspace. The delta in luminance creates a soft, natural lift.
- **Ambient Shadows:** When a component must float (e.g., a "New Task" button), use an extra-diffused shadow: `box-shadow: 0 12px 32px rgba(25, 28, 30, 0.06)`. This mimics natural light rather than digital "glow."
- **The "Ghost Border" Fallback:** If a boundary is required for accessibility, use the `outline_variant` token at 15% opacity. It should be felt, not seen.

---

## 5. Components: The Building Blocks

### Stat Cards
Stat cards should be borderless. Use a `surface_container_lowest` background.
- **Iconography:** Use a subtle background circle (20% opacity of the status color—e.g., `primary_fixed`) behind a high-contrast icon.
- **Spacing:** Use `spacing-5` (1.1rem) for internal padding.

### Data Tables
Tables are the heart of operations.
- **No Horizontal Dividers:** Instead of lines, use alternating row tints using `surface_container_low` or simply generous vertical spacing (`spacing-4`).
- **Header:** Table headers must use `label-md` in all caps with increased letter spacing to provide a clear structural anchor.

### Sidebars & Navigation
The sidebar should feel integrated. Use `surface_container_low` for the background.
- **Active State:** Instead of a full-box highlight, use a "Signature Notch"—a 3px vertical pill of `primary` on the far left, with the menu text shifting to `primary` color.

### Buttons
- **Primary:** Gradient fill (`primary` to `primary_container`), `xl` (0.75rem) roundedness.
- **Secondary:** Surface-only (no border), using `secondary_container` background with `on_secondary_container` text.

---

## 6. Do's and Don'ts

### Do
- **Do** use `spacing-10` and `spacing-12` between major layout sections to provide "Executive Breathing Room."
- **Do** use `tertiary_fixed` for warning states to keep the palette sophisticated and avoid the "harsh red" of standard UIs.
- **Do** utilize `surface_bright` for interactive hover states on cards to provide immediate, tactile feedback.

### Don't
- **Don't** use high-contrast black (#000000) for text; always use `on_surface` (#191c1e) to reduce eye strain in data-heavy views.
- **Don't** use `none` roundedness unless for full-bleed background elements. Everything else follows the `lg` (0.5rem) or `xl` (0.75rem) scale to feel modern and approachable.
- **Don't** crowd the interface. If a view feels "heavy," increase the spacing scale rather than shrinking the typography.

---

## 7. Spacing & Grid Logic
The system relies on a mathematical progression to ensure harmony:
- **Inner Padding:** `spacing-4` (0.9rem)
- **Section Gaps:** `spacing-8` (1.75rem)
- **Container Margins:** `spacing-12` (2.75rem)

By adhering to these specific increments, the dashboard will feel intentional and architecturally sound, regardless of the data density.
