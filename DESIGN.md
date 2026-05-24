# Design System — LongboxLens

## Theme

Dark. Always dark. The app is used in comic shops, convention floors, and dim back rooms. Light mode would be a regression.

## Color

**Strategy: Restrained** — near-black surfaces, single amber accent used for all primary actions, focus, and key data. Cyan as a rare secondary signal (live status dots only).

| Token | Value | Role |
|---|---|---|
| `--ink` | `#0b0f14` | Deepest background, header |
| `--coal` | `#0f1419` | Body background |
| `--surface` | `#131820` | Base surface |
| `--sfc2` | `#1a1f28` | Cards, sidebar |
| `--sfc3` | `#252d38` | Input backgrounds |
| `--sfc4` | `#2e3748` | Elevated surfaces |
| `--cream` | `#e8eaed` | Primary text |
| `--cream2` | `#d4d8dd` | Secondary text |
| `--muted` | `#8b8f96` | Tertiary / labels |
| `--dim` | `#6b7280` | Disabled / placeholder |
| `--amber` | `#f5a623` | Primary accent — actions, focus, prices |
| `--amber-d` | `#d4860d` | Amber pressed/border |
| `--amber-glow` | `rgba(245,166,35,0.25)` | Ambient glow on primary elements |
| `--red` | `#ef4444` | Destructive / error |
| `--cyan` | `#00cfbe` | Live status indicator only |
| `--border` | `rgba(61,69,86,0.45)` | Subtle dividers |
| `--border2` | `rgba(61,69,86,0.75)` | Standard borders |
| `--border3` | `#3d4556` | Strong borders |

All neutrals are blue-shifted (not pure gray), keeping the cold-night atmosphere.

## Typography

Three-font system: display, mono, condensed.

| Role | Font | Sizes | Notes |
|---|---|---|---|
| Display / titles | Bebas Neue | 18–36px | Issue numbers, comic titles, stat values |
| Labels / UI chrome | Space Mono | 8–11px | ALL CAPS, 0.1–0.2em tracking |
| Body / details | Barlow Condensed | 12–15px | wt 400–600; readable at density |

**Rules:**
- Space Mono is for chrome only (labels, tab text, badges, button text, timestamps). Never use for multi-line content.
- Bebas Neue is for numbers and titles that need visual impact. Never for body copy or labels.
- Barlow Condensed is the workhorse: card bodies, descriptions, form inputs.
- No font mixing within a single UI element.

## Spacing

Tight density — this is a data tool. Base unit: 4px.

| Scale | px | Usage |
|---|---|---|
| xs | 4px | Icon gaps, badge padding |
| sm | 8px | Button padding (vertical), internal card padding |
| md | 12–14px | Panel padding, card padding |
| lg | 16–20px | Section padding, sidebar padding |
| xl | 28–40px | Between sections |

No random pixel values. All spacing pulls from this scale.

## Borders & Shape

- **Radius: 0** — sharp corners everywhere. No exceptions. The aesthetic is mechanical/print, not soft SaaS.
- Border style: 1px solid with opacity tokens. Never decorative thick borders.
- Corner brackets (CSS pseudo-elements) used on the camera viewfinder only — purposeful, not decorative.

## Elevation / Shadows

| Level | Value | Usage |
|---|---|---|
| sm | `0 2px 8px rgba(0,0,0,0.7)` | Cards on hover |
| md | `0 8px 28px rgba(0,0,0,0.65)` | Modals, dropdowns |
| lg | `0 20px 60px rgba(0,0,0,0.75)` | Large overlays |

Amber glow (`box-shadow: 0 0 16px var(--amber-glow)`) is reserved for primary buttons and focused inputs only.

## Motion

- Duration: 120–150ms for micro-interactions (hover, active). 200–250ms for state transitions.
- Easing: ease-out (CSS default `ease` or explicit `cubic-bezier(0.25, 0, 0, 1)`). Never bounce or elastic.
- `transform: translateY(1px)` on button `:active` — tactile press feedback.
- `prefers-reduced-motion`: all animations and transitions must be suppressed.

## Components

### Buttons

Three variants:
- **Default**: `--sfc2` background, `--border2` border, `--cream2` text. Hover: `--sfc3`.
- **Primary** (`btn-primary`): `--amber` background, `--ink` text, amber glow. Used for scan/export actions only.
- **Danger** (`btn-danger`): red tint background, `--red` text. Used for delete/clear actions.

All buttons: `border-radius: 0`, Space Mono font, uppercase, 0.1em tracking.

### Status messages

Left-accented strip (2px left border) in four states: `info` (cyan), `success` (amber), `error` (red), `warn` (amber-dim). Text in matching color, Space Mono font.

### Badges

Small amber-tinted pill (actually square — radius 0). Space Mono 8px, uppercase. Used for comic attributes (newsstand, CGC, signed, key issue).

### Chips / Filter buttons

Filter chips: transparent background → amber tint when active. Square, Space Mono 9px. Used in filter bar only.

### Cards (inventory items)

`--sfc2` background, `--border2` border. Full 4-side border — no side-stripe decorations. Hover state: border brightens to `--border3` or amber tint.

### Inputs / Selects

`--sfc3` background, `--border2` border, Barlow Condensed 14px. Focus: amber border + amber glow ring.

### Panel titles

Space Mono 9px, uppercase, 0.2em tracking, prefixed with `//` in amber. Used to label every sidebar section.

## Atmospheric Effects

- **CRT scanlines**: `body::before` — subtle repeating horizontal lines at 3px/1px rhythm, opacity 0.018. Adds texture without being distracting.
- **Film grain**: `body::after` — animated SVG turbulence noise, 200vw/vh layer, opacity 0.028, 0.6s step animation. Adds grit.

Both effects: `pointer-events: none`, `z-index: 9998/9999`. Never interfere with interaction.
