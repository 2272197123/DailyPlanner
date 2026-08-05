/* ═══════════════════════════════════════
   schedule.js — Plan generation and daily blocks
   ═══════════════════════════════════════ */
'use strict';

/* ── Shared schedule-object factory ────────────── */

/**
 * Build a normalized schedule object from a server plan or local generator.
 * This is the single source of truth for the schedule shape — used by
 * generateSchedule(), fetchTodayPlanFromServer(), navDay(), and goToday().
 *
 * @param {string} date   YYYY-MM-DD
 * @param {object} plan   Raw plan from server or generator (must have date, dayMode, blocks)
 * @returns {object}       Normalized schedule object
 */
function buildScheduleObject(date, plan) {
  // v7.1: 给所有 block 补稳定 id（服务器/旧 LS 数据可能没有 id，影响时间轴拖拽键）
  var blocks = (plan.blocks || []).map(function(b, i) {
    if (!b.id) b.id = 'block_' + i + '_' + stableHash((b.subject || '') + '_' + (b.time || '') + '_' + date);
    return b;
  });
  return {
    date:          date,
    mode:          plan.dayMode || 'full',
    blocks:        blocks,
    dayOfWeek:     ['周日','周一','周二','周三','周四','周五','周六'][new Date(date + 'T00:00:00').getDay()],
    encouragement: plan.encouragement || pickEncouragementSeeded(date, plan.dayMode || 'full'),
    generatedAt:   new Date().toISOString(),
  };
}

function syncPlanToServer(date) {
  var plan = store.schedules[date];
  if (!plan || typeof API === 'undefined' || !API.savePlan) return;
  // v8.1：每日计划只保存目标 blocks，固定任务 routines 作为独立预设单独存取
  API.savePlan(date, {
    dayMode: plan.mode || store.mode,
    energyLevel: 'normal',
    specialNotes: '',
    blocks: plan.blocks.map(function(b) {
      return {
        id: b.id, subject: b.subject, time: b.time || '', icon: b.icon || '📌',
        category: b.category, priority: b.priority, duration: b.duration,
        goalId: b.goalId || '', phase: b.phase || '',
        flowHint: b.flowHint || '', subtasks: b.subtasks || [],
      };
    }),
    customBlocks: [],
    priorityShift: null,
  }).catch(function() {});
}

/**
 * Core schedule generator.
 * If customData.blocks is non-empty, those blocks are used verbatim.
 * Otherwise no plan — "今日无事".
 *
 * @param {string} forDate  YYYY-MM-DD
 * @param {object} [customData]  Imported JSON payload (blocks, routines, dayMode, etc.)
 * @returns {object} schedule snapshot
 */
function generateSchedule(forDate, customData) {
  var today = forDate || store.currentDate;
  var mode = (customData && customData.dayMode) ? customData.dayMode : store.mode;
  var importBlocks = (customData && customData.blocks) ? customData.blocks : [];

  // ── Route A: explicit imported blocks（目标任务） ──
  if (importBlocks.length > 0) {
    var blocks = importBlocks.map(function(b, i) {
      return {
        id:        'import_' + i + '_' + Date.now(),
        subject:   b.subject || b.title || '任务',
        time:      b.time || '',
        icon:      b.icon || '📌',
        category:  b.category || 'other',
        priority:  b.priority || 'medium',
        duration:  b.duration || (b.time ? dur(b.time) : 60),
        goalId:    b.goalId || (b.goal && typeof resolveGoalId === 'function' ? resolveGoalId(b.goal) : ''),
        phase:     b.phase || '',
        flowHint:  b.flowHint || '',
        subtasks:  (b.subtasks || []).map(function(s) {
          return typeof s === 'string'
            ? {text:s, done:false, estMin:25}
            : {text:s.text || s, done:false, estMin:s.estMin || 25};
        }),
        completed: false,
        generated: true,
      };
    });

    var schedule = buildScheduleObject(today, {
      dayMode: mode,
      blocks:  blocks,
      encouragement: pickEncouragementSeeded(today, mode),
    });
    store.schedules[today] = schedule;
    saveSchedules();

    return schedule;
  }

  // ── Route B: No imported blocks → no plan ──
  delete store.schedules[today];
  saveSchedules();

  return null;
}

/** Resolved tasks for display: schedule blocks + date-matched user tasks */
function getDisplayTasks() {
  const sched = store.schedules[store.currentDate];
  const result = [];
  const seen = new Set();

  if (sched && sched.blocks) {
    for (const b of sched.blocks) {
      result.push({ ...b, generated: true });
      seen.add(b.id);
    }
  }

  for (const t of store.tasks) {
    if (t.generated) continue;
    if (t.dueDate && t.dueDate !== store.currentDate) continue;
    if (!seen.has(t.id)) {
      result.push(t);
      seen.add(t.id);
    }
  }

  return result;
}

/* ── Task CRUD (user tasks, not schedule blocks) ── */

function createTask(data) {
  return {
    id:          't_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    title:       data.title || '',
    category:    data.category || 'other',
    priority:    data.priority || 'medium',
    time:        data.time || '',
    dueDate:     data.dueDate || '',
    dueTime:     data.dueTime || '',
    duration:    data.duration || (data.time ? dur(data.time) : null),
    goalId:      data.goalId || '',
    flowHint:    data.flowHint || '',
    subtasks:    data.subtasks || [],
    note:        data.note || '',
    reminder:    data.reminder || false,
    completed:   false,
    completedAt: null,
    createdAt:   new Date().toISOString(),
    order:       store.tasks.length,
    generated:   false,
  };
}

function addTask(data) {
  const t = createTask(data);
  store.tasks.push(t);
  saveTasks();
  return t;
}

function updateTask(id, updates) {
  const idx = store.tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  Object.assign(store.tasks[idx], updates);
  saveTasks();
  return store.tasks[idx];
}

function deleteTask(id) {
  store.tasks = store.tasks.filter(t => t.id !== id);
  stopAllTimersForTask(id);
  saveTasks();
}
