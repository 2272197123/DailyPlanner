/* ═══════════════════════════════════════
   app.js — Boot & init sequence (v4.3)

   Key principles:
   - Server is the source of truth for plans
   - localStorage is a read cache, NOT a plan source
   - init() does NOT auto-generate plans — it fetches from server
   - navDay/goToday fetch from server for the target date
   - If server unreachable → fallback to localStorage cache → "今日无事"

   Load order:
   1. constants → 2. utils → 3. api → 4. storage → 5. store
   → 6-15. business modules → 16. render → 17-19. UI → 20. app.js
   ═══════════════════════════════════════ */
'use strict';

async function init() {
  // Ensure storage tables exist (first-run bootstrap)
  initStorage();

  // REMOVED: balance reset on first boot — balance must persist across sessions.
  // Only first-ever init sets balance to 0 (via initStorage's LS.set('balance', 0)).
  // The old dp_reset_balance_done flag was destructive on every code update.

  // Load localStorage cache into store (fast, works offline)
  initStoreFromLS();

  // Overwrite today with actual system date
  var realToday = toLocalDate(new Date());
  store.today = realToday;
  store.currentDate = realToday;

  // Fetch prefs from server
  await fetchPrefsFromServer();

  // Fetch long-term goals from server（服务器优先；本地有而服务器无则推上去）
  await fetchBigGoalsFromServer();

  // Fetch routines preset from server（v7.1）
  await fetchRoutinesFromServer();

  // ═══ Fetch today's plan from server ═══
  // No auto-generation. If server has a plan → show it. If not → "今日无事".
  var hasServerPlan = await fetchTodayPlanFromServer();
  if (!hasServerPlan) {
    console.log('📭 今日无计划 — 请导入 JSON 或通过 Claude 生成');
  }

  // Fetch timeline order/start config from server (overrides local cache)
  await fetchOrderFromServer(store.currentDate);

  // Fetch balance from server
  await fetchBalanceFromServer();

  // Apply progress snapshot
  var dp = store.progress[store.currentDate];
  if (dp) { store.rating = dp.rating || 0; store.mode = dp.mode || store.mode; }

  // Halt any timers that were running in a previous session
  var ids = Object.keys(store.timers);
  for (var i = 0; i < ids.length; i++) {
    var t = store.timers[ids[i]];
    if (t.running) { t.running = false; if (t.interval) clearInterval(t.interval); t.interval = null; }
  }
  var stIds = Object.keys(store.stTimers);
  for (var j = 0; j < stIds.length; j++) {
    var st = store.stTimers[stIds[j]];
    if (st.running) { st.running = false; if (st.interval) clearInterval(st.interval); st.interval = null; }
  }
  saveTimers();
  saveStTimers();

  // Apply visual theme
  applyTheme();

  // Apply purchased theme class
  if (store.prefs.activeTheme) {
    document.documentElement.classList.add(store.prefs.activeTheme);
  }

  // ── Override initStoreFromLS behavior: NEVER reset balance on app start ──
  // The previous reset_balance_done guard was wiping balances on first load.
  // Balance should persist across sessions — only reset when user explicitly clears.
  store._initBalance = getBalance();

  // Start subsystems
  startClock();
  store._tlFresh = true; // 首次渲染触发时间轴入场级联
  renderAll();

  // v9.0：初始化 AI 助手抽屉（必须在 renderAll 之后，确保 DOM 就绪）
  if (typeof initAiDrawer === 'function') initAiDrawer();

  requestNotif();
  scheduleReminderCheck();
  startArchiveTick();

  // Restore mode lock UI if today's mode is already locked
  if (isModeLocked(store.currentDate)) {
    // Small delay to let renderAll complete first
    setTimeout(function() { enableModeLockUI(store.mode); }, 50);
  }

  // Attach keyboard shortcuts
  document.addEventListener('keydown', keyHandler);

  // Periodic refresh for clock + progress (every 30s)
  setInterval(function() {
    updateClockDisplay();
    renderHeroProgress();
  }, 30000);

  console.log('📚 DailyPlan v9.0 ·', store.currentDate, '·', store.mode, '· XP:', getBalance() + (hasServerPlan ? ' · Server' : ''));
}

/* ── Init guard: prevent double-initialization from rapid page reloads ── */
var _initStarted = false;
document.addEventListener('DOMContentLoaded', function() {
  if (_initStarted) return;
  _initStarted = true;
  init();
});
