# Database Guidelines — DailyPlan

> This project uses a custom DB abstraction layer with raw SQL. No ORM.

---

## Architecture

```
DBInterface (abstract base)
├── SQLiteDB      — Development / standalone
├── MySQLDB       — Self-hosted, pymysql
└── PostgreSQLDB  — Production recommended, psycopg2
```

## SQL Compatibility Strategy

**Business code writes MySQL dialect** as canonical. Each adapter converts at runtime:

- `%s` placeholders → SQLiteDB: `?`, PostgreSQLDB: `%s` (psycopg2 native)
- Backtick `` `col` `` → SQLiteDB strips, PostgreSQLDB: `"col"`
- `INSERT IGNORE` → SQLiteDB: `INSERT OR IGNORE`
- `ON DUPLICATE KEY UPDATE` → SQLiteDB/PostgreSQLDB: `ON CONFLICT ... DO UPDATE`
- `MEDIUMTEXT` → PostgreSQLDB: `TEXT`
- `TINYINT` → PostgreSQLDB: `SMALLINT`

## Critical SQLite Pitfalls

1. **`VALUES (` must have a space** — otherwise `excluded.column` regex replacement breaks:
   ```sql
   -- CORRECT (space after VALUES)
   INSERT INTO table VALUES (%s, %s)
   -- WRONG (no space → excluded regex matches)
   INSERT INTO table VALUES(%s, %s)
   ```

2. **`ON DUPLICATE KEY UPDATE col=VALUES(col)`** — `VALUES(col)` has NO space between `VALUES` and `(`

3. **`INSERT IGNORE`** → auto-converted to `INSERT OR IGNORE`

## Tables (10)

| Table | PK | Purpose |
|-------|-----|---------|
| `plans` | `date` TEXT | Daily plans (blocks JSON) |
| `progress` | `date` TEXT | Daily feedback (note + rating) |
| `routine_done` | `(date, routine_id)` | Routine completion marks |
| `earned` | `(date, item_id)` | Crystal reward anti-duplicate |
| `state` | `key` TEXT | Global K/V (balance, theme, prefs, biggoals, routines, order_*) |
| `archives` | `date` TEXT | Daily archive snapshots |
| `day_data` | `date` TEXT | v9.0 Daily independent copies (blocks+routines+progress+timelineCfg+archiveData) |
| `ai_chat_history` | `(id, chat_date)` | v9.0 AI chat history per-date (messages JSON + summary) |
| `users` | `id` SERIAL/INTEGER | User accounts (username UNIQUE + password_hash) |
| `ai_requests` | `id` SERIAL/INTEGER | AI request logs |

## v9.0 New Tables

### `day_data` — Daily Independent Data Copy

Each date gets its own copy from the template on first access. Subsequent modifications only affect that date's copy.

```
Columns:
  date                  TEXT PRIMARY KEY
  blocks_json           TEXT DEFAULT '[]'       — Task blocks with completion state
  routines_json         TEXT DEFAULT '[]'       — Routine copy for this date
  routine_progress_json TEXT DEFAULT '{}'       — Routine completion flags
  goals_snapshot_json   TEXT DEFAULT '{}'       — Goal state snapshot at init time
  timeline_cfg_json     TEXT DEFAULT '{}'       — Timeline start + drag order
  progress_json         TEXT DEFAULT '{}'       — Feedback + rating
  archive_data_json     TEXT                    — Archive data (self-review + AI review + summary)
  created_at / updated_at TIMESTAMP
```

**API endpoints:**
- `GET /api/day-data/{date}` — Pull full daily copy
- `PUT /api/day-data/{date}` — Save full daily copy (frontend dual-write: LS + Server)

**Key design rule:** When a date is archived, `archive_data_json` is populated and the date becomes read-only. Historical dates load from this table, not from global templates.

### `ai_chat_history` — AI Chat History Per-Date

```
Columns:
  id              SERIAL PRIMARY KEY (auto)
  chat_date       VARCHAR(10) NOT NULL
  messages_json   TEXT DEFAULT '[]'           — Full message array [{role,text,planPreview?}]
  summary         TEXT DEFAULT ''             — Auto-generated summary when >10 messages
  created_at / updated_at TIMESTAMP
```

**API endpoints:**
- `GET /api/chat-history/{date}` — Load today's conversation
- `PUT /api/chat-history/{date}` — Save today's conversation

**Design rule:** One record per date. New day = fresh conversation. The server table is the source of truth; localStorage is a fast cache.

## Business Functions

All in `server/db.py` (~800 LOC):
`get_plan`, `save_plan`, `delete_plan`, `get_plans_list`, `get_progress`, `save_progress`,
`get_routine_done`, `set_routine_done`, `get_state`, `set_state`, `get_earned`, `mark_earned`,
`save_archive`, `get_archive`, `list_archives`, `create_user`, `get_user_by_username`,
`get_user_by_id`, `log_ai_request`, `get_ai_usage`,
`save_day_data`, `get_day_data`, `save_chat_history`, `get_chat_history`.

## Migration Path

```
SQLite (dev) → MySQL (self-hosted) or PostgreSQL (production)

Just change DP_DB_TYPE env var. All tables auto-create via init_tables().
The DB abstraction layer handles dialect conversion transparently.
```

## Key Conventions

- **No ORM** — raw SQL with runtime dialect conversion
- **State table key format**: `biggoals`, `routines`, `modeCfg`, `order_YYYY-MM-DD`
- **DB type selected by** `DP_DB_TYPE` env var (default: `sqlite`)
- **All new tables MUST be added to all three adapters** (SQLiteDB, MySQLDB, PostgreSQLDB init_tables())
- **Business functions use get_db()**, never call adapter directly
- **Dates are YYYY-MM-DD format**, stored as TEXT/VARCHAR(10)
