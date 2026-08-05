# Logging Guidelines — DailyPlan

> Lightweight logging. No structured logging framework — use `print()` (backend) and `console.log()` (frontend).

---

## Backend

```python
# Pattern: [module] message — context
print(f"[plan] GET /api/plan/{date} — 200")
print(f"[auth] user '{username}' login — success")
print(f"[ai] generate plan for {date} — {tokens} tokens, {elapsed}s")
print(f"[db] SQLite connection initialized at {db_path}")
```

## Frontend

```javascript
// Pattern: [DailyPlan] subsystem: message
console.log('[DailyPlan] init: mode=' + store.mode + ', date=' + store.currentDate);
console.log('[DailyPlan] fetch: plan loaded from server for ' + date);
console.log('[DailyPlan] fallback: using LS cache for ' + date);
```

## AI Request Logging

Each AI proxy call writes to `ai_requests` table:
- `user_id`, `request_type` (generate_plan / generate_goal), `model`
- `prompt_tokens`, `completion_tokens`, `total_tokens`
- `latency_ms`, `success` (0/1), `error_message`
- `created_at`

Query: `GET /api/ai-usage?days=7`

## Rules

1. **Never error-log normal fallback paths** — API 404 in static mode is expected
2. **Never log secrets** — API keys, JWT secrets, user passwords
3. **All API errors get context**: endpoint, user, date, error message
4. **Frontend silent on recovery** — if LS fallback succeeds, don't log
