/* ═══════════════════════════════════════
   storage.js — localStorage wrapper
   ═══════════════════════════════════════ */
'use strict';

const LS = {
  get(key, fallback) {
    try { const v = localStorage.getItem('dp_' + key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('dp_' + key, JSON.stringify(value)); } catch (e) {}
  },
  remove(key) {
    try { localStorage.removeItem('dp_' + key); } catch (e) {}
  },
};

/** Return a save-thunk: () => LS.set(k, store[k]) */
function saveThunk(key) {
  return () => LS.set(key, store[key]);
}

/** 读取用户自定义三档位配置（v7.1），缺省时复制默认配置 */
function getModeCfg() {
  var cfg = LS.get('modeCfg', null);
  if (!cfg) return JSON.parse(JSON.stringify(DEFAULT_MODE_CFG));
  var out = JSON.parse(JSON.stringify(DEFAULT_MODE_CFG));
  for (var k in cfg) if (cfg.hasOwnProperty(k)) out[k] = cfg[k];
  return out;
}

function saveModeCfg(cfg) {
  LS.set('modeCfg', cfg);
  if (typeof API !== 'undefined' && API.savePrefs) {
    API.savePrefs({ modeCfg: cfg }).catch(function() {});
  }
}

/** Compute "dp_earned_<date>" set */
function getEarnedSet(date) {
  try { return new Set(JSON.parse(localStorage.getItem('dp_earned_' + date) || '[]')); }
  catch (e) { return new Set(); }
}

function isEarned(date, id) { return getEarnedSet(date).has(id); }

function markEarned(date, id) {
  const set = getEarnedSet(date);
  set.add(id);
  localStorage.setItem('dp_earned_' + date, JSON.stringify([...set]));
}

function unmarkEarned(date, id) {
  const set = getEarnedSet(date);
  set.delete(id);
  localStorage.setItem('dp_earned_' + date, JSON.stringify([...set]));
}

/* ── Mode lock ──────────────────────────────────── */

/**
 * Once a user completes any task or routine for a given date,
 * the day's mode is locked. This prevents mode-hopping bugs and
 * currency farming.
 *
 * We store `dp_mode_lock_<date>` = { mode: 'full', lockedAt: ISO }
 */

function getModeLock(date) {
  try { return JSON.parse(localStorage.getItem('dp_mode_lock_' + date)); }
  catch (e) { return null; }
}

function setModeLock(date, mode) {
  localStorage.setItem('dp_mode_lock_' + date, JSON.stringify({
    mode: mode,
    lockedAt: new Date().toISOString(),
  }));
}

function isModeLocked(date) {
  return !!getModeLock(date);
}

/**
 * Check if a mode upgrade/downgrade is allowed for today.
 * Mode cannot be changed if any task or routine has been completed today.
 * @returns {boolean} true if the switch is BLOCKED
 */
function canSwitchMode(date, newMode) {
  const lock = getModeLock(date);
  if (lock && lock.mode !== newMode) {
    // Check if any progress exists for today
    const rp = LS.get('routineProgress', {});
    const todayRP = rp[date] || {};
    const hasRoutineDone = Object.values(todayRP).some(v => v);
    if (hasRoutineDone) return false;

    // Check schedule blocks for any completion
    const sched = LS.get('schedules', {});
    const todaySched = sched[date];
    if (todaySched && todaySched.blocks) {
      if (todaySched.blocks.some(b => b.completed)) return false;
      if (todaySched.blocks.some(b => b.subtasks && b.subtasks.some(st => st.done))) return false;
    }

    // Check user tasks for completion
    const tasks = LS.get('tasks', []);
    const todayTasks = tasks.filter(t => t.dueDate === date);
    if (todayTasks.some(t => t.completed)) return false;
    if (todayTasks.some(t => t.subtasks && t.subtasks.some(st => st.done))) return false;

    // Check earned set — if any rewards were already claimed today, lock it
    const earnedSet = getEarnedSet(date);
    if (earnedSet.size > 0) return false;
  }
  return true;
}

/* ── Daily completion history ───────────────────── */

/**
 * Save a snapshot of today's completion data for historical tracking.
 * Called whenever a task/routine is toggled.
 */
function saveDailyHistory(date) {
  /* v10.0: Read routines from daily data copy, not global LS key */
  var dd = typeof getDailyData === 'function' ? getDailyData(date) : null;
  var routines = (dd && dd.routines) ? dd.routines : (LS.get('routines', []));
  var rp = LS.get('routineProgress', {});
  var balance = LS.get('balance', 0);
  var todaySched = LS.get('schedules', {});
  var todayRP = rp[date] || {};
  var todaySchedDate = todaySched[date] || {};

  // Count completions
  var routines = LS.get('routines', []);
  const totalRoutines = routines.length;
  const doneRoutines = routines.filter(r => todayRP[r.id]).length;

  const blocks = todaySched.blocks || [];
  const totalTasks = blocks.length;
  const doneTasks = blocks.filter(b => b.completed).length;
  const totalSubtasks = blocks.reduce((sum, b) => sum + (b.subtasks ? b.subtasks.length : 0), 0);
  const doneSubtasks = blocks.reduce((sum, b) => sum + (b.subtasks ? b.subtasks.filter(st => st.done).length : 0), 0);

  const history = {
    date,
    mode: todaySched.mode || 'full',
    balance,
    routines: { total: totalRoutines, done: doneRoutines },
    tasks: { total: totalTasks, done: doneTasks },
    subtasks: { total: totalSubtasks, done: doneSubtasks },
    updatedAt: new Date().toISOString(),
  };

  LS.set('dayHistory_' + date, history);

  // Maintain an index of dates with history
  let idx = LS.get('dayHistoryIndex', []);
  if (!idx.includes(date)) {
    idx.push(date);
    idx.sort();
    LS.set('dayHistoryIndex', idx);
  }

  return history;
}

function getDailyHistory(date) {
  return LS.get('dayHistory_' + date, null);
}

function getAllDayHistories() {
  const idx = LS.get('dayHistoryIndex', []);
  return idx.map(d => getDailyHistory(d)).filter(Boolean);
}

/* ── Wallet Ledger (transaction log) ─────────────── */

/**
 * Record a balance change transaction.
 * @param {'earn'|'spend'} type
 * @param {number} amount  positive number
 * @param {string} reason  human-readable description
 * @param {string} [refId]  optional reference (task ID, shop item ID, etc.)
 */
function recordTransaction(type, amount, reason, refId) {
  const tx = {
    id:       'tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    type,
    amount,
    reason,
    refId:    refId || null,
    balanceAfter: getBalance(),
    createdAt: new Date().toISOString(),
  };
  const ledger = LS.get('ledger', []);
  ledger.push(tx);
  // Keep a rolling 365-day window
  const cutoff = Date.now() - 365 * 86400000;
  const trimmed = ledger.filter(t => new Date(t.createdAt).getTime() > cutoff || t.createdAt === tx.createdAt);
  LS.set('ledger', trimmed.slice(-2000)); // cap at 2000 entries
  return tx;
}

/**
 * Get all ledger entries, optionally filtered by date range.
 * @param {string} [from] YYYY-MM-DD inclusive
 * @param {string} [to]   YYYY-MM-DD inclusive
 * @returns {Array}
 */
function getLedger(from, to) {
  const ledger = LS.get('ledger', []);
  if (!from && !to) return ledger.slice(-500).reverse();
  const fromTs = from ? new Date(from + 'T00:00:00').getTime() : 0;
  const toTs   = to   ? new Date(to   + 'T23:59:59').getTime() : Infinity;
  return ledger.filter(t => {
    const ts = new Date(t.createdAt).getTime();
    return ts >= fromTs && ts <= toTs;
  }).reverse();
}

/**
 * Get ledger summary stats.
 */
function getLedgerSummary(from, to) {
  const entries = getLedger(from, to);
  let totalEarned = 0, totalSpent = 0;
  for (const e of entries) {
    if (e.type === 'earn') totalEarned += e.amount;
    else totalSpent += e.amount;
  }
  return { totalEarned, totalSpent, net: totalEarned - totalSpent, count: entries.length };
}

/* ── Accounting (daily income/expense journal) ───── */

/**
 * Accounting entry structure:
 * { id, date, type: 'income'|'expense', amount, category, description, createdAt }
 */

function addAccountingEntry(date, type, amount, category, description) {
  const entry = {
    id: 'acc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    date,
    type,
    amount: Math.abs(amount),
    category: category || (type === 'income' ? '其他收入' : '其他支出'),
    description: description || '',
    createdAt: new Date().toISOString(),
  };
  const key = 'acc_' + date;
  const entries = LS.get(key, []);
  entries.push(entry);
  LS.set(key, entries);

  // Maintain index
  let idx = LS.get('accIndex', []);
  if (!idx.includes(date)) { idx.push(date); idx.sort(); LS.set('accIndex', idx); }
  return entry;
}

function getAccountingEntries(date) {
  return LS.get('acc_' + date, []);
}

/** 编辑已有记账条目（v6.1：金额/分类/说明/类型均可改） */
function updateAccountingEntry(date, entryId, updates) {
  const entries = getAccountingEntries(date);
  const idx = entries.findIndex(e => e.id === entryId);
  if (idx === -1) return null;
  const e = entries[idx];
  if (updates.type) e.type = updates.type;
  if (updates.category) e.category = updates.category;
  if (updates.amount !== undefined) e.amount = Math.abs(updates.amount);
  if (updates.description !== undefined) e.description = updates.description;
  e.updatedAt = new Date().toISOString();
  LS.set('acc_' + date, entries);
  return e;
}

function deleteAccountingEntry(date, entryId) {
  const entries = LS.get('acc_' + date, []);
  const filtered = entries.filter(e => e.id !== entryId);
  LS.set('acc_' + date, filtered);
  if (filtered.length === 0) {
    let idx = LS.get('accIndex', []);
    idx = idx.filter(d => d !== date);
    LS.set('accIndex', idx);
  }
}

function getAccountingSummary(date) {
  const entries = getAccountingEntries(date);
  let income = 0, expense = 0;
  for (const e of entries) {
    if (e.type === 'income') income += e.amount;
    else expense += e.amount;
  }
  return { income, expense, balance: income - expense, count: entries.length };
}

function getAccountingRangeSummary(from, to) {
  var idx = LS.get('accIndex', []);
  var totalIncome = 0, totalExpense = 0;
  for (var i = 0; i < idx.length; i++) {
    var d = idx[i];
    if (d >= from && d <= to) {
      var s = getAccountingSummary(d);
      totalIncome += s.income;
      totalExpense += s.expense;
    }
  }
  return { totalIncome: totalIncome, totalExpense: totalExpense, net: totalIncome - totalExpense };
}

/** Return expense-by-category + daily income/expense breakdown for chart rendering */
function getAccountingRangeDetail(from, to) {
  var idx = LS.get('accIndex', []);
  var catExpense = {};   // category → total
  var catIncome = {};    // category → total
  var daily = {};        // date → { income, expense }
  var entries = [];      // all entries in range

  for (var i = 0; i < idx.length; i++) {
    var d = idx[i];
    if (d < from || d > to) continue;
    var dayEntries = getAccountingEntries(d);
    var dayIncome = 0, dayExpense = 0;
    for (var j = 0; j < dayEntries.length; j++) {
      var e = dayEntries[j];
      entries.push(e);
      if (e.type === 'income') {
        dayIncome += e.amount;
        catIncome[e.category] = (catIncome[e.category] || 0) + e.amount;
      } else {
        dayExpense += e.amount;
        catExpense[e.category] = (catExpense[e.category] || 0) + e.amount;
      }
    }
    daily[d] = { income: dayIncome, expense: dayExpense };
  }

  return {
    catExpense: catExpense,
    catIncome: catIncome,
    daily: daily,
    entries: entries,
  };
}

/** Load user-customized accounting categories from prefs, fall back to defaults */
function getAccountingCategories() {
  var prefs = LS.get('prefs', {});
  if (prefs.accountingCategories && prefs.accountingCategories.income && prefs.accountingCategories.expense) {
    return {
      income:  prefs.accountingCategories.income.slice(),
      expense: prefs.accountingCategories.expense.slice(),
    };
  }
  // Fall back to ACCOUNTING_CATEGORIES from constants (may be empty)
  if (typeof ACCOUNTING_CATEGORIES !== 'undefined') {
    return {
      income:  (ACCOUNTING_CATEGORIES.income || []).slice(),
      expense: (ACCOUNTING_CATEGORIES.expense || []).slice(),
    };
  }
  return { income: [], expense: [] };
}

/** Persist user-customized accounting categories into dp_prefs */
function saveAccountingCategories(cats) {
  var prefs = LS.get('prefs', {});
  prefs.accountingCategories = {
    income:  (cats.income || []).slice(),
    expense: (cats.expense || []).slice(),
  };
  LS.set('prefs', prefs);
}
