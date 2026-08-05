# Error Handling — DailyPlan

---

## Frontend: Graceful Degradation

All `api.js` methods **silently fall back** to localStorage on any failure:

```javascript
function fetchPlan(date) {
  try {
    var resp = await fetch('/api/plan/' + date);
    if (resp.ok) return await resp.json();
  } catch(e) {
    // 404 is normal in static mode — don't log errors
  }
  return LS.get('dp_schedules')[date] || null;
}
```

**Rule**: The app MUST work in static mode (no backend) without console errors.

## Guard Functions

Two distinct guards, never mix them:

| Guard | Checks | Used For |
|-------|--------|----------|
| `guardEdit()` | Past date only | Import, create |
| `guardToggle()` | Past date + 23:30–04:00 lock | Complete, routine toggle |

## Loading Guards

- `app.js._initStarted` flag — `DOMContentLoaded` fires once only
- FastAPI serves entry via `FileResponse`, NOT 302 redirect (prevents double-load)

## Backend: Standard Error Shape

```python
@app.get("/api/plan/{date}")
async def get_plan(date: str):
    try:
        result = db.get_plan(date)
        return {"ok": True, "data": result}  # null data is valid (no plan)
    except Exception as e:
        return {"ok": False, "error": str(e)}
```

## AI Proxy Error Handling

- JSON extraction: strip markdown code blocks → loose parse → validate schema
- Fallback: at least 1 block must exist, otherwise returns error
- Timeout: 120s via Nginx `proxy_read_timeout`

## Common Mistakes

1. **Throwing errors in frontend** — always try/catch, always fallback to LS
2. **Logging errors in static mode** — API 404 is expected, don't error-log
3. **Using guardEdit for toggles** — use guardToggle (adds time window check)
