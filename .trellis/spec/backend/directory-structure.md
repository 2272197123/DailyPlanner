# Directory Structure — DailyPlan

> How project code is organized. This project has two distinct packages: `server/` (Python backend) and `study_planner/` (vanilla JS frontend).

---

## Backend (`server/`)

```
server/
├── __init__.py           # Empty, makes server a package
├── main.py               # FastAPI app (32 endpoints), CORS, static files, no-cache middleware
├── db.py                 # DB abstraction: DBInterface + SQLiteDB + MySQLDB + PostgreSQLDB
├── models.py             # Pydantic models: Block, DailyPlan, UserCreate, AuthResponse (9 groups)
├── auth.py               # JWT + bcrypt: register, login, refresh, token validation, dependency
└── ai_proxy.py           # DeepSeek proxy: prompt building, API call, JSON extraction & validation
```

## Frontend (`study_planner/`)

```
study_planner/
├── index_modular.html    # Single-page entry — NO index.html
├── launcher.py           # FastAPI preferred, static fallback
├── css/
│   ├── style.css         # Design system + all component styles (~1950 LOC)
│   ├── timeline.css      # Timeline-specific styles
│   └── overlay-anim.css  # Overlay animation subsystem
└── js/                   # 26 modules, strict layered loading
    # L0: constants.js     — colors, skins, rewards, default templates
    # L1: utils.js         — date formatting, hashing, escapeHtml()
    # L2: api.js           — HTTP client + apiconfig.js (user API settings)
    # L3: storage.js       — localStorage wrapper (LS.get/set/remove)
    # L4: store.js         — central state (store.*)
    # L5: schedule.js currency.js archive.js goals.js routines.js modes.js
    #      auth.js toast.js timers.js toggles.js effects.js theme.js reminders.js
    # L6: render.js timeline.js events.js modal.js overlay-anim.js import.js ledger.js
    # L7: app.js           — async init() with _initStarted guard
```

## Module Organization Rules

- **L0→L7 loading order is strict** — no circular dependencies
- **Layer 5 modules may reference each other**; Layer 6 reads `store` and writes DOM
- **All functions on `window`** — no module system, all global
- **`store` and `LS` are the only globals** beyond functions

## Naming Conventions

- JS files: `kebab-case.js` (no exceptions)
- CSS classes: `kebab-case` with descriptive prefixes (`.tl-*` timeline, `.arch-*` archive)
- localStorage keys: `dp_` prefix (e.g., `dp_schedules`, `dp_bigGoals`)
- Python: standard `snake_case`
