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

## Python (FastAPI + DB)

- **SQL dialect**: Write MySQL, adapters convert for SQLite/PostgreSQL
- **New tables**: Must be added to all three `init_tables()` methods
- **Business functions**: Use `get_db()`, never call adapter directly
- **JSON fields**: Use `json.dumps(data, ensure_ascii=False)` for Unicode safety
- **Date format**: `YYYY-MM-DD` as TEXT/VARCHAR(10)
