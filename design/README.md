# Leibniz · design mockups

Static HTML prototypes of every Leibniz screen. No daemon, no build, no JS framework
— same stack as the production templates (Tailwind CDN + system fonts).

## Preview

```
open leibniz-platform/design/index.html
```

The gallery links to every mockup. Each file is fully self-contained.

## Files

| File | Status | Maps to |
|---|---|---|
| `index.html` | gallery | — |
| `dashboard.html` | refined | `templates/dashboard.html` |
| `sessions.html` | refined | `templates/sessions.html` |
| `session-detail.html` | **new shape** | `templates/session_detail.html` |
| `approvals.html` | **new — the wedge** | `templates/approvals.html` (v0.2) |
| `memory.html` | refined | `templates/memory.html` |
| `cost.html` | **new** | `templates/cost.html` (v0.1) |
| `settings.html` | **new** | `templates/settings.html` (v0.1) |

## Design rules (mirrors `DESIGN.md`)

- **Surface:** `zinc-950` page · `zinc-900` cards · `zinc-800` borders
- **Accent:** `emerald-400` only (live, active, key numbers); `amber-400` warn; `rose-400` error
- **Radius:** `rounded-lg` (8px) — never larger
- **Numbers:** always `.num` (tabular)
- **Mono:** IDs, paths, code, key labels
- **Empty states:** every one tells the user the exact path to fix it

## Workflow

1. Open `index.html` in a browser.
2. Iterate on the static mockup until the design feels right.
3. Port to `leibniz/templates/<name>.html` — class names and structure transfer 1:1.
4. Wire up Jinja loops + filters + real data.

## What's missing on purpose

- **No JS interactivity.** Click handlers, SSE, and form submissions land in the Jinja
  port, not here. These are visual prototypes.
- **No build step.** Tailwind CDN plus a tiny inline `<style>` block per file. We
  inline the few rules `ui.css` adds rather than maintain a shared file across
  static + Jinja.
- **No icon library.** Inline SVG or unicode glyphs only. Matches `DESIGN.md` rule
  ("Inline SVG, 16px, stroke-width 1.5, source from Lucide").
