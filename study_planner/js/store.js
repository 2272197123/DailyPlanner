/* ═══════════════════════════════════════
   store.js — Central state store (v4.2 backend-aware)

   Data flow:
   - On init: fetch from /api/plan/{today} → if found, use it
     → if not, fallback to localStorage (backward compat)
   - On save: write-through to API + localStorage cache
   - localStorage is now a fast cache, server is source of truth
   ═══════════════════════════════════════ */
'use strict';

const STORE_KEYS = [
  'today', 'currentDate', 'mode', 'activeGoal',
  'goals', 'bigGoals', 'routines', 'schedules', 'progress', 'tasks',
  'routineProgress', 'theme', 'rating',
  'timers', 'stTimers', 'subtaskActual',
  'focusTaskId', 'prefs', 'user',
];

const store = {};
for (const k of STORE_KEYS) store[k] = undefined;

/* ── Initialization ────────────────────────────── */

function initStoreFromLS() {
  store.today   = toLocalDate(new Date());
  store.currentDate = store.today;
  store.mode    = LS.get('mode', 'full');
  // v11.1：recovery 模式已移除，自动回退到 minimum
  if (store.mode === 'recovery') store.mode = 'minimum';
  store.rating  = 0;
  store.theme   = 'system';
  store.focusTaskId = null;
  store.timers  = LS.get('timers', {});
  store.stTimers = LS.get('stTimers', {});
  store.subtaskActual = LS.get('subtaskActual', {});
  store.schedules = LS.get('schedules', {});
  store.progress  = LS.get('progress', {});
  store.tasks     = LS.get('tasks', []);
  store.routineProgress = LS.get('routineProgress', {});
  store.goals     = LS.get('goals', {});
  store.bigGoals  = LS.get('bigGoals', []);
  if (typeof migrateLegacyGoals === 'function') migrateLegacyGoals();
  store.routines  = LS.get('routines', []);
  if (typeof migrateFixedTasks === 'function') migrateFixedTasks();
  store.prefs     = LS.get('prefs', { waferSkin:'wafer', ownedSkins:['wafer'], activeTheme:null });
  store.user      = LS.get('user', null);

  var settings = LS.get('settings', {});
  store.theme      = settings.theme || 'system';
  store.activeGoal = settings.activeGoal || store.goals.active || '';

  // v9.0：每日独立数据模型 — 从 dp_day_data_{date} 加载当天数据
  if (typeof initDailyData === 'function') {
    initDailyData(store.currentDate);
  }
  if (typeof loadDailyData === 'function') {
    loadDailyData(store.currentDate);
  }

  var dp = store.progress[store.currentDate];
  if (dp) { store.rating = dp.rating || 0; store.mode = dp.mode || store.mode; }
  // v11.1：recovery 模式已移除，自动回退到 minimum
  if (store.mode === 'recovery') store.mode = 'minimum';
}

/**
 * Fetch today's plan from server on boot.
 * If the server returns a plan → load it into store (schedules, routines, mode).
 * If not → keep whatever localStorage had (which may be empty → "今日无事").
 */
async function fetchTodayPlanFromServer() {
  try {
    const res = await API.getPlan(store.currentDate);
    if (!res.ok || !res.data) {
      console.log('📭 服务器无今日计划，使用本地缓存');
      return false;
    }
    const plan = res.data;
    // Use shared factory to normalize the plan
    // v8.1：每日计划只包含目标 blocks；固定任务 routines 是全局预设，
    // 不应被某一天的计划覆盖。
    store.schedules[plan.date] = buildScheduleObject(plan.date, plan);
    store.mode = plan.dayMode || 'full';
    // Also cache to localStorage for offline
    LS.set('schedules', store.schedules);
    LS.set('mode', store.mode);
    console.log('📡 从服务器加载了', plan.date, '的计划:', plan.blocks.length, '个任务');
    return true;
  } catch (e) {
    console.warn('⚠️ 无法连接服务器，使用本地缓存:', e.message);
    return false;
  }
}

/** Fetch prefs from server, fallback to localStorage */
async function fetchPrefsFromServer() {
  try {
    const res = await API.getPrefs();
    if (res.ok && res.data) {
      store.prefs = {
        waferSkin:   res.data.waferSkin || 'wafer',
        ownedSkins:  res.data.ownedSkins || ['wafer'],
        activeTheme: res.data.activeTheme || null,
        aiApiKey:    res.data.aiApiKey || '',
        aiBaseUrl:   res.data.aiBaseUrl || '',
        aiModel:     res.data.aiModel || '',
      };
      store.theme      = res.data.theme || 'system';
      store.activeGoal = res.data.activeGoal || '';
      if (res.data.modeCfg) {
        LS.set('modeCfg', res.data.modeCfg);
      }
      LS.set('prefs', store.prefs);
      LS.set('settings', { theme: store.theme, activeGoal: store.activeGoal });
      return true;
    }
  } catch (e) { /* fallback to LS values already loaded */ }
  return false;
}

/** Fetch balance from server */
async function fetchBalanceFromServer() {
  try {
    const res = await API.getBalance();
    if (res.ok) {
      LS.set('balance', res.balance);
      return res.balance;
    }
  } catch (e) {}
  return LS.get('balance', 0);
}

/* ── Save helpers (localStorage cache) ─────────── */

function saveSchedules()  { LS.set('schedules', store.schedules); }
function saveProgress()   { LS.set('progress', store.progress); }
function saveTasks()      { LS.set('tasks', store.tasks); }
function saveRoutineProgress() { LS.set('routineProgress', store.routineProgress); }
function saveTimers()     { LS.set('timers', store.timers); }
function saveStTimers()   { LS.set('stTimers', store.stTimers); }
function saveSubtaskActual(){ LS.set('subtaskActual', store.subtaskActual); }
function saveSettings()   { LS.set('settings', { theme:store.theme, activeGoal:store.activeGoal }); }
function savePrefs()      { LS.set('prefs', store.prefs); }

/* ── Init storage (first-run) ──────────────────── */

function initStorage() {
  if (LS.get('init')) return;
  LS.set('goals',     {});
  LS.set('routines',  []);
  LS.set('template',  DEFAULT_TEMPLATE);
  LS.set('schedules', {});
  LS.set('progress',  {});
  LS.set('tasks',     []);
  LS.set('settings',  { theme:'system', activeGoal:null });
  LS.set('routineProgress', {});
  LS.set('stTimers',  {});
  LS.set('balance',   0);
  LS.set('prefs',     { waferSkin:'wafer', ownedSkins:['wafer'], activeTheme:null });
  LS.set('dayHistoryIndex', []);
  LS.set('init',      true);
}

/* ── XP ────────────────────────────────────── */

/** 计算当前等级（从总 XP 推算） */
function getLevel() {
  var xp = getBalance();
  var lvl = 1;
  var threshold = XP_LVL_BASE;
  while (xp >= threshold) {
    xp -= threshold;
    lvl++;
    threshold = Math.round(threshold * XP_LVL_MULT);
  }
  return lvl;
}

/** 计算升到下一级所需 XP */
function xpToNextLevel() {
  var xp = getBalance();
  var lvl = 1;
  var threshold = XP_LVL_BASE;
  var totalNeeded = threshold;
  while (xp >= threshold) {
    xp -= threshold;
    lvl++;
    threshold = Math.round(threshold * XP_LVL_MULT);
    totalNeeded += threshold;
  }
  return totalNeeded - getBalance();
}

function getBalance()             { return LS.get('balance', 0); }
function setBalance(v)            { LS.set('balance', v); updateBalanceUI(); }
function spendBalance(amount)     { var b = getBalance(); if (b < amount) { return false; } var nb = b - amount; LS.set('balance', nb); recordTransaction('spend', amount, '商城消费', null); updateBalanceUI(); return true; }

function addBalance(amount, date, id) {
  var nb = getBalance() + amount;
  LS.set('balance', nb);
  updateBalanceUI();
  if (date && id) {
    markEarned(date, id);
    recordTransaction('earn', amount, '任务奖励 #' + id, id);
  }
  API.setBalance(nb).catch(function(){});
}

/** 完成任务发放 XP 奖励（v9.0 晶圆 → XP） */
function awardTaskReward(task, id) {
  var reward = calcTaskReward(task) * WAFER_VALUE;
  addBalance(reward, store.currentDate, id);
}
