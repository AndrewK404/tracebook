# tracebook · design

Lifted (with permission, same author) from the Leibniz design language.
Same family: dark, dense where it counts, generous where it should breathe.
Single-screen UI, calm motion, monospaced numerics.

## Color (zinc + emerald)

| Token            | Tailwind          | Hex          | Use                                     |
|------------------|-------------------|--------------|-----------------------------------------|
| `bg`             | `zinc-950`        | `#09090b`    | Page background                         |
| `bg-elevated`    | `zinc-900`        | `#18181b`    | Cards, panels, table                    |
| `bg-header`      | `zinc-900/60`     | `#18181b/60` | Sticky header (with `backdrop-blur`)    |
| `border`         | `zinc-800`        | `#27272a`    | Hairlines, card borders                 |
| `border-subtle`  | `zinc-800/60`     | `#27272a/60` | Inner dividers                          |
| `text`           | `zinc-100`        | `#f4f4f5`    | Primary text                            |
| `text-muted`     | `zinc-400`        | `#a1a1aa`    | Secondary, nav inactive                 |
| `text-faint`     | `zinc-500`        | `#71717a`    | Helper, captions                        |
| `text-ghost`     | `zinc-600`        | `#52525b`    | Empty-state icons                       |
| `accent`         | `emerald-400`     | `#34d399`    | Active state, key numbers, "live" dot   |
| `accent-bg`      | `emerald-500/15`  | —            | Active row background                   |
| `accent-border`  | `emerald-500/30`  | —            | Active border, ring                     |
| `warn`           | `amber-400`       | `#fbbf24`    | Soft warnings (none in v1, kept for parity) |
| `error`          | `rose-400`        | `#fb7185`    | Errors, tool errors                     |

Two accents: emerald for "OK / live / present", amber/rose only when something
genuinely needs attention.

## Typography

- **Sans:** Inter via `https://rsms.me/inter/inter.css` with the system stack
  as fallback.
- **Mono:** `ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas`.
  Used for: logo, session IDs, file paths, code blocks, key labels.
- **Numbers:** always `font-variant-numeric: tabular-nums`. CSS class `.num`.

| Token | Size / line-height | Weight   | Use                           |
|-------|--------------------|----------|-------------------------------|
| `xs`  | 12 / 16            | 500      | Labels, captions, table cells |
| `sm`  | 14 / 20            | 400/500  | Body, table content           |
| `base`| 16 / 24            | 400      | Default body                  |
| `lg`  | 18 / 26            | 500      | Logo, section headers         |
| `xl`  | 20 / 28            | 500      | Panel titles                  |
| `2xl` | 24 / 32            | 600      | KPI numbers, page titles      |
| `3xl` | 30 / 38            | 600      | Hero numbers (cost screen)    |

## Layout

- **Container:** `max-w-7xl mx-auto px-6` for body. `max-w-5xl` for prose.
- **Header:** sticky, `h-14`, `bg-zinc-900/60 backdrop-blur` with bottom hairline.
- **Sections:** `mb-8` between major blocks. Cards use `gap-3` (compact) or `gap-6` (loose).
- **Grid:**
  - 4-col KPI strip — `grid-cols-2 md:grid-cols-4 gap-3`
  - 2/3-1/3 main+aside — `lg:grid-cols-3 gap-6` with `lg:col-span-2`
  - Trace view — `lg:grid-cols-4` with `lg:col-span-1` aside + `lg:col-span-3` transcript

## Components

### Card

```html
<div class="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
  <div class="text-xs uppercase tracking-wide text-zinc-500">Label</div>
  <div class="text-2xl font-semibold num mt-1">42</div>
</div>
```

Border radius: always `rounded-lg` (8px). Never `rounded-xl` or larger — too soft.

### Status dot

```html
<span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 dot-live"></span>
```

CSS:

```css
.dot-live { box-shadow: 0 0 8px rgba(52, 211, 153, 0.5); }
.pulse    { animation: pulse 2s ease-in-out infinite; }
```

Colors: emerald = healthy/live, zinc-500 = idle, amber = warn, rose = error.

### Empty state — non-negotiable

Every empty state names the exact filesystem path the user would touch
to make data appear:

```
┌──────────────────────────────────────────────────┐
│                                                  │
│         ⌀  No Claude Code sessions yet           │
│                                                  │
│   Start a session with `claude` in any folder    │
│   and refresh this page. Tracebook is reading    │
│   from:                                          │
│                                                  │
│       ~/.claude/projects/                        │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Nav link

Inactive: `text-zinc-400 hover:text-zinc-100`.
Active: `text-zinc-100 border-b-2 border-emerald-400`.

## Iconography

Inline SVG, 16px, `stroke-width: 1.5`, `stroke: currentColor`. Pull from
[Lucide](https://lucide.dev/) shapes. Never icon fonts, never PNG.

## Motion

- Hover transitions: `transition-colors duration-150 ease-out`.
- No page transitions, no skeletons (data is local — instant).
- Pulse only on live indicators.

## Anti-patterns

- Glassmorphism beyond the header.
- Gradient text or buttons.
- Emoji as UI.
- Big-radius cards.
- Branded illustrations in empty states — typography only.
- Loading shimmers.
