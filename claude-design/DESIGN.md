# Leibniz — Design System

The visual source of truth. Built to feel like a precision instrument: dark, dense where it counts, generous where it should breathe. The reference is `cctrace` — same family, slightly more deliberate.

## Aesthetic

- **Mood:** late-night terminal. Calm dark surface, monospaced numerics, a single vivid accent.
- **Voice:** lowercase-first, technical, no decoration. Labels are uppercase tracking-wide; everything else is sentence case.
- **Density:** tight on data, loose on chrome. Cards are 16px-padded with hairline borders.
- **Motion:** none on load, 150ms ease-out on hover/click only.

## Color (zinc + emerald)

| Token            | Tailwind          | Hex          | Use                                   |
|------------------|-------------------|--------------|---------------------------------------|
| `bg`             | `zinc-950`        | `#09090b`    | Page background                       |
| `bg-elevated`    | `zinc-900`        | `#18181b`    | Cards, panels                         |
| `bg-header`      | `zinc-900/60`     | `#18181b/60` | Sticky header (with backdrop-blur)    |
| `border`         | `zinc-800`        | `#27272a`    | Hairlines, card borders               |
| `border-subtle`  | `zinc-800/60`     | `#27272a/60` | Inner dividers                        |
| `text`           | `zinc-100`        | `#f4f4f5`    | Primary text                          |
| `text-muted`     | `zinc-400`        | `#a1a1aa`    | Secondary, nav                        |
| `text-faint`     | `zinc-500`        | `#71717a`    | Helper, captions                      |
| `text-ghost`     | `zinc-600`        | `#52525b`    | Empty-state icons                     |
| `accent`         | `emerald-400`     | `#34d399`    | Active state, key numbers, "live" dot |
| `accent-bg`      | `emerald-500/15`  | —            | Active row background                 |
| `accent-border`  | `emerald-500/30`  | —            | Active border                         |
| `warn`           | `amber-400`       | `#fbbf24`    | Soft warnings                         |
| `error`          | `rose-400`        | `#fb7185`    | Errors                                |

Two accents only: emerald for "system OK / live / present", amber/rose for problems.

## Typography

- **Sans:** `ui-sans-serif, system-ui, -apple-system, "Inter", "Segoe UI", Roboto`. Native stack.
- **Mono:** `ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace`. Used for: logo, IDs, numbers, code, paths.
- **Numbers:** always `font-variant-numeric: tabular-nums`. CSS class `.num`.
- **Scale:**

| Token | Size / line-height | Weight   | Use                           |
|-------|--------------------|----------|-------------------------------|
| `xs`  | 12 / 16            | 500      | Labels, captions              |
| `sm`  | 14 / 20            | 400/500  | Body, table cells             |
| `base`| 16 / 24            | 400      | Default body                  |
| `lg`  | 18 / 26            | 500      | Logo, section headers         |
| `xl`  | 20 / 28            | 500      | Panel titles                  |
| `2xl` | 24 / 32            | 600      | KPI numbers                   |
| `3xl` | 30 / 38            | 600      | Hero numbers                  |

Headings never go bigger than `3xl`. Long-form text never goes wider than 65ch.

## Layout

- **Container:** `max-w-7xl mx-auto px-6` for the body. `max-w-5xl` for prose pages.
- **Header:** sticky, `h-14`, `bg-zinc-900/60 backdrop-blur` border-bottom hairline.
- **Sections:** `mb-8` between major blocks. Cards inside sections use `gap-3` (compact) or `gap-6` (loose).
- **Grid:**
  - 4-col KPI strip: `grid-cols-2 md:grid-cols-4 gap-3`
  - 2-col content: `lg:grid-cols-3 gap-6` (main span 2, side span 1)
  - 3-pane shortcut grid: `md:grid-cols-3 gap-6`

## Components

### Card

```html
<div class="rounded-lg bg-zinc-900 border border-zinc-800 p-4">
  <div class="text-xs uppercase tracking-wide text-zinc-500">Label</div>
  <div class="text-2xl font-semibold num mt-1">42</div>
</div>
```

Border-radius is consistent at `rounded-lg` (8px). Never `rounded-xl` or `rounded-2xl` — too soft.

### Empty state

The non-negotiable UX commitment: **every empty state is intentional and instructive**. It tells the user what to do, with the exact path.

```
┌──────────────────────────────────────────────────┐
│                                                  │
│              ⌀  No memory files yet              │
│                                                  │
│   Drop *.md, *.json, or *.txt files into        │
│   ~/.leibniz/memory/ and they'll show here.     │
│                                                  │
│   Your CLI agent reads them via the              │
│   leibniz-memory MCP server.                     │
│                                                  │
│              [ open in finder ]                  │
│                                                  │
└──────────────────────────────────────────────────┘
```

### Status dot

A 6px circle with a soft glow:

```html
<span class="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400/50"></span>
```

Colors: emerald = healthy, zinc-500 = idle, amber = warn, rose = error.

### Nav link

Inactive `text-zinc-400 hover:text-zinc-100`, active `text-zinc-100 border-b border-emerald-400`. Underline sits 6px below baseline.

## Iconography

Inline SVG, 16px, `stroke-width: 1.5`, `stroke: currentColor`. Source from [Lucide](https://lucide.dev/) — the same family Linear and Vercel use. No icon fonts, no PNG.

## Motion

- Hover transitions: `transition-colors duration-150 ease-out`.
- Card-press: `active:scale-[0.99]`.
- No page transitions. No skeletons (we're local; data is instant).

## Accessibility floor

- All focus states keyboard-visible (`focus:outline-none focus:ring-1 focus:ring-emerald-400`).
- Contrast ratio ≥ 4.5:1 for body text, ≥ 3:1 for large text. The zinc-100-on-zinc-950 pair is 17:1.
- All interactive elements ≥ 32px tap target.
- Tables have explicit `<th scope>` and caption.

## Anti-patterns we avoid

- **Glassmorphism beyond the header.** No frosted cards, no semi-transparent overlays.
- **Gradient text or buttons.** Solid colors only.
- **Emoji as UI** (✓ status dots, ✗ icons).
- **Big-radius cards** (`rounded-2xl` and up read as "consumer SaaS").
- **Branded illustrations.** Empty states are typographic.
- **Loading shimmers.** This is a local app — the data is already on disk.

## Reference

The visual reference is `cctrace` running at `127.0.0.1:4173`. Leibniz inherits its zinc palette, sticky header, KPI-strip pattern, and `font-variant-numeric: tabular-nums` discipline. We extend it with: a richer empty-state pattern, dedicated mono pairing, two-color accent system (emerald + amber/rose), and a 65ch reading width for prose.
