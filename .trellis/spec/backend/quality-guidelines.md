# Quality Guidelines — DailyPlan

> Code quality rules for this vanilla JS + Python project. These are enforced by convention, not tooling.

---

## JavaScript (vanilla, no bundler, `'use strict'`)

### FORBIDDEN — ES6+ syntax

```javascript
// NEVER use:
const x = ...     // use var x = ...
let x = ...       // use var x = ...
() => {...}       // use function() {...}
`template ${x}`   // use 'string ' + x
```

**Reason**: `const` in `'use strict'` + Python http.server can cause **silent function body skip** — the file loads but entire function definitions are dropped with zero errors. Verified in v5.3.

Exception: `async/await` is allowed in `api.js`, `store.js`, and archive panel code (already used there).

### REQUIRED — XSS prevention

```javascript
// ALL user data through escapeHtml() before innerHTML
card.innerHTML = '<div class="title">' + escapeHtml(task.subject) + '</div>';
```

User data includes: task titles, subtask text, routine labels, goal descriptions, ledger entries, JSON import content.

### REQUIRED — No hardcoded user data

```javascript
// NEVER — hardcoded example data in production code
DEFAULT_TEMPLATE = { blocks: [{ subject: '托福考试...', ... }] };
CAT_LABELS = { comm: '通信原理', toefl: '托福', jp: '日语N2' };

// CORRECT — parameterized, empty defaults
var DEFAULT_TEMPLATE = { date: '', dayMode: 'full', startTime: '09:00', blocks: [] };
var CAT_LABELS = { study: '学习', work: '工作', life: '生活', health: '健康', review: '复盘', other: '其他' };
```

### REQUIRED — Balance/XP write path

```javascript
// CORRECT — only two write functions
addBalance(100, 'task reward');
setBalance(newTotal);

// NEVER bypass:
LS.set('dp_balance', xxx);
document.getElementById('balanceText').textContent = xxx;
```

### Overlay Open Rule

**Render first, then show.** CSS animations bind to elements — re-showing mid-render triggers animation replay.

```javascript
// CORRECT
function openShop() {
  renderShop();                                    // 1. innerHTML
  document.getElementById('shopOverlay').classList.remove('hidden'); // 2. show
}
```

### Dual-Edit Trap

`overlay-anim.js` has its **own copies** of `openTaskModal`, `openShop`, `openLedger`, `openAccounting`. When adding fields to task modal, edit **both**:
1. `js/modal.js` — the actual logic
2. `js/overlay-anim.js` — the wrapper copy

### Daily Data Pattern (v9.0)

```javascript
// CORRECT — daily independent copy
var data = getDailyData(date);
data.blocks.push(newBlock);
saveDailyData(date, data); // writes LS + server

// NEVER — global shared data
store.routines.push(newRoutine); // affects ALL dates
```

### AI Context Pattern (v9.0)

```javascript
// CORRECT — read from data anchor, not chat history
var goals = store.bigGoals; // fresh structured data every time
var context = _aiBuildContext(userText, forDate); // from store, not old messages

// NEVER — rely on AI "remembering" from old messages
```

## CSS

### FORBIDDEN

- `transition: all` → specify exact properties
- Hardcoded colors in components → use CSS variables only
- Font: Inter / Roboto / Arial → Noto Serif SC + JetBrains Mono + system sans-serif
- Color: `#4F46E5` or `#2b3a5c` → `var(--accent)` is `#1e2030` (indigo ink)
- Category-specific hardcoded CSS classes beyond the 6 generic ones

### REQUIRED

```css
color: var(--text-primary);
background: var(--surface);
border: 1px solid var(--border);
transition: opacity var(--ease), transform var(--ease-spring);
```

### AI Drawer Variables (v9.0)

```css
/* Width adjustable from 280-620px via drag handle, default 380px */
#appMain.ai-shifted { margin-right: var(--ai-width, 380px); }
.ai-drawer { width: 380px; transform: translateX(100%); }
.ai-drawer.ai-open { transform: translateX(0); }
```

### Atmosphere (DO NOT REMOVE)

- `.ambient-orb` × 3 (indigo / jade / vermilion gradient spheres)
- `.paper-texture` (SVG noise Data URL tile)
- `body::after` (ink vignette, dual radial-gradient)
- `.hanko-seal` (SVG completion stamp, elastic cubic-bezier)
- 8 themes: sakura / forest / ocean / sunset / noir / vapor / aurora / ember

### Time State Colors (v9.0)

```css
--state-past: #d4a76a; --state-past-bg: #faf3e6;    /* archived — warm amber */
--state-future: #8a7bb8; --state-future-bg: #f2eef8;  /* planning — cool violet */
```

## HTML

- **Single entry**: `index_modular.html` — never create `index.html`
- **Script order**: L0 → L7 (see directory-structure.md), plus `ai.js` after `effects.js`
- **CSS order**: `style.css` → `overlay-anim.css` → `timeline.css`
- **appMain wrapper**: `<div id="appMain">` wraps the container for drawer push animation

## Vue3 frontend (`frontend/`, post-v10)

The vanilla-JS rules above apply to legacy pages only. The Vue 3 + Vite frontend has its own enforced constraints:

- **CSS target chrome80** (`vite.config.js` `build.target es2020` + `cssTarget chrome80`): no `color-mix()`, no `:has()`, no media range syntax (`@media (width<=768px)`). Use hex-alpha vars (`#e8c87433`) for transparency. Old WebKit (Quark/UC) silently drops unsupported CSS — this broke all mobile styles once.
- **Fixed-position overlays MUST be `<Teleport to="body">`**: `backdrop-filter` / `transform` / `overflow` ancestors (sidebar blur, card 3D flips, scrollable grids) become containing blocks and clip fixed descendants (Session 8 mood-picker glitch; TaskCard flip edit panel).
- **Drag interactions: Pointer Events, never HTML5 DnD** — HTML5 drag does not fire on touchscreens. Pattern in `composables/useDragSort.js`: 6px threshold (mouse), long-press 280ms arm (touch, aborts to native scroll on early move), floating clone teleported to body, edge auto-scroll, residual-click suppression.
- **Animation hygiene**: anime.js for JS animation; particle spans removed in `complete`; rAF loops cancelled on unmount AND paused on `document.hidden` (visibilitychange); all effect entry points respect `prefers-reduced-motion` (see `composables/useAnime.js`).
- **Mobile (≤768px) perf**: no `backdrop-filter` on full-screen/persistent elements (sidebar, header, glass cards, backdrops) — old mobile GPUs repaint the whole screen per scroll frame. Replace with a near-opaque solid (`--glass-bg-solid` in variables.css) inside a legacy-syntax media query; desktop keeps blur. Never put `filter`/`drop-shadow` on an element animated per-frame by rAF/JS — paint the glow on a separate static layer that only transforms.
- **Timeline order contract (08-15, `orderCfg` v2)**: `orderCfg[date].order` is the GLOBAL arrangement of pinned + flow block ids. Iron rule: no flow-block operation (reorder, pin, import, delete) may mutate an existing pinned block's `time`/`duration` — only explicit time edit or dragging that pinned block itself. Flows are placed in global order into gaps between pinned blocks; overflow spills past the pinned end (never shifts it). Any pin transition (drag-drop, StarDial, edit panel) must remove the id from `order` (a stale flow-rank becomes a false anchor). Persisted orders carry `v: 2`; unversioned orders are migrated on `fetchDay` by stripping pinned ids.
- **Per-instance SVG ids**: counters must live in a module-level `<script>` block, not `<script setup>` (which is per-instance) — 7+ copies of one component on a page (MoodWeek minis) will collide otherwise.
- **Clipped SVG layer paths**: each layer's path must cover only its own band (+small seam), never run to the container bottom — the last-painted layer would hide everything below (WishingBottle waveD bug, 08-15).
- **Mobile verification**: CDP headless Chrome blocks bare-IP navigation — audit through a 127.0.0.1 reverse proxy instead.
- **CSS keyframes override static transforms**: a `fill: both` animation animating `transform` replaces any static `transform` on the element — merge the resting offset INTO the keyframes (`100% { transform: translateX(26px) rotate(360deg) }`), or the element snaps back when the animation ends (ThemeToggle moon, 08-16). Also: `transform` does not apply to non-replaced inline elements — give wrapper spans `display: block` before animating them.
- **Pinia store memoize must use reactive version keys**: a plain-object cache/version field breaks computed dependency tracking — on cache hit the computed stops touching reactive state and loses its subscriptions, so later mutations never re-render (08-16 plan-page-perf, reproduced with node+vue). Pattern: `reactive({})` version map read on every hit + bump on every mutation; plus content-fingerprint row reuse so unchanged rows keep object identity (a prop array rebuilt each time defeats it — fingerprint the derived array too).
- **In-flight GET vs debounced PUT guard**: with a TTL cache + debounced save, a refetch in flight when a local mutation lands can overwrite newer memory state and the pending PUT then persists the stale data. Record `startedAt` on the fetch; on response, skip the overwrite if the local mutation timestamp is newer (schedule.js, 08-16).
- **Large-N stagger animations**: never run `anime.stagger(Nms)` over hundreds of cells — 365×60ms is a ~22s main-thread tail on mobile (MoodGrid year view, 08-16). Skip entirely on ≤768px / reduced-motion (one `matchMedia` decision, same pattern as App.vue orbsDisabled), and cap desktop staggers to the first ~N visible items (`staggerEnter(..., maxCount)` in useAnime.js). Related: a `::after` glow ring with `z-index:-1` escapes to an ancestor stacking context and gets painted UNDER the parent's background unless the element itself creates one — always pair it with `position:relative; z-index:0` on the host (TaskCard ctp-dot / MoodCell is-today pattern).

## Python (FastAPI + DB)

- **SQL dialect**: Write MySQL, adapters convert for SQLite/PostgreSQL
- **New tables**: Must be added to all three `init_tables()` methods
- **Business functions**: Use `get_db()`, never call adapter directly
- **JSON fields**: Use `json.dumps(data, ensure_ascii=False)` for Unicode safety
- **Date format**: `YYYY-MM-DD` as TEXT/VARCHAR(10)
