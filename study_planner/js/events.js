/* ═══════════════════════════════════════
   events.js — User actions: navigation, drag, mode, keys

   navDay / goToday now fetch the target date's plan from the server.
   If the server has a plan → load into store → render
   If not → clear that date's schedule → render "今日无事"
   ═══════════════════════════════════════ */
'use strict';

/* ── Navigation ───────────────────────────────── */

async function navDay(delta) {
  var parts = store.currentDate.split('-').map(Number);
  var dt = new Date(parts[0], parts[1] - 1, parts[2]);
  dt.setDate(dt.getDate() + delta);
  var targetDate = toLocalDate(dt);
  store.currentDate = targetDate;

  // v9.0：加载每日独立数据副本
  if (typeof initDailyData === 'function') initDailyData(targetDate);
  if (typeof loadDailyData === 'function') loadDailyData(targetDate);

  // 服务器有数据则覆盖本地副本
  try {
    var result = await API.getPlan(targetDate);
    if (result.ok && result.data) {
      var plan = result.data;
      store.schedules[targetDate] = buildScheduleObject(targetDate, plan);
      store.mode = plan.dayMode || 'full';
      LS.set('schedules', store.schedules);
      if (typeof syncStoreToDailyData === 'function') syncStoreToDailyData(targetDate);
    }
  } catch (e) { /* 静态模式静默 */ }

  store._tlFresh = true;
  renderAll();
  fetchOrderFromServer(targetDate).then(function(cfg) { if (cfg) renderTimeline(); });
}

async function goToday() {
  var t = toLocalDate(new Date());
  store.today = t;
  store.currentDate = t;

  // v9.0：加载每日独立数据副本
  if (typeof initDailyData === 'function') initDailyData(t);
  if (typeof loadDailyData === 'function') loadDailyData(t);

  try {
    var result = await API.getPlan(t);
    if (result.ok && result.data) {
      var plan = result.data;
      store.schedules[t] = buildScheduleObject(t, plan);
      store.mode = plan.dayMode || 'full';
      LS.set('schedules', store.schedules);
      if (typeof syncStoreToDailyData === 'function') syncStoreToDailyData(t);
    }
  } catch (e) { /* 静态模式静默 */ }

  store._tlFresh = true;
  renderAll();
  fetchOrderFromServer(t).then(function(cfg) { if (cfg) renderTimeline(); });
}

/* ── Mode ─────────────────────────────────────── */

function setMode(m) {
  if (guardEdit()) return;

  // v11.1：recovery 模式已移除，回退到 minimum
  if (m === 'recovery') m = 'minimum';

  var cfg = getModeCfg();

  // Check if mode is locked for today
  if (isModeLocked(store.currentDate) && store.mode !== m) {
    const lock = getModeLock(store.currentDate);
    toast('🔒 今日模式已在 ' + new Date(lock.lockedAt).toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit'}) + ' 锁定为「' + cfg[lock.mode].label + '」\n完成任意任务后模式无法更改', 'err');
    return;
  }

  // Prevent downgrading from a higher-intensity mode after progress has been made
  if (!canSwitchMode(store.currentDate, m)) {
    toast('🔒 今日已有完成记录，模式无法更改', 'err');
    return;
  }

  var oldMode = store.mode;
  store.mode = m;
  LS.set('mode', m);

  // v7.1：切换档位时，自动按系数缩放当天生成任务的预计用时，不再清空计划
  const sched = store.schedules[store.currentDate];
  if (sched && sched.blocks && sched.blocks.length) {
    var oldFactor = (cfg[oldMode] && cfg[oldMode].factor) || 1;
    var newFactor = (cfg[m] && cfg[m].factor) || 1;
    if (oldFactor !== newFactor) {
      var ratio = newFactor / oldFactor;
      var changed = false;
      for (const b of sched.blocks) {
        if (b.duration) {
          b.duration = Math.max(10, Math.round(b.duration * ratio / 5) * 5);
          changed = true;
        }
        if (b.subtasks) {
          for (const st of b.subtasks) {
            if (st.estMin) { st.estMin = Math.max(5, Math.round(st.estMin * ratio / 5) * 5); changed = true; }
          }
        }
      }
      if (changed) {
        saveSchedules();
        syncPlanToServer(store.currentDate);
      }
      toast('已切换为 ' + cfg[m].label + '，任务量按 ' + Math.round(ratio * 100) + '% 调整', 'ok');
    }
    sched.mode = m;
    sched.encouragement = pickEncouragementSeeded(store.currentDate, m);
  }

  // Reset all running timers on the current schedule
  if (sched && sched.blocks) {
    for (const b of sched.blocks) {
      if (store.timers[b.id]) { clearInterval(store.timers[b.id].interval); delete store.timers[b.id]; }
      Object.keys(store.stTimers).forEach(k => {
        if (k.startsWith(b.id + '_')) { clearInterval(store.stTimers[k].interval); delete store.stTimers[k]; }
      });
    }
  }
  saveTimers();
  saveStTimers();

  store._tlFresh = true;
  renderAll();
}

/* ── Countdown goal switch ────────────────────── */

function toggleCountdownMenu(e) {
  e.stopPropagation();
  const menu = document.getElementById('countdownMenu');
  menu.classList.toggle('show');
  if (menu.classList.contains('show')) {
    document.getElementById('moreMenu') && document.getElementById('moreMenu').classList.remove('show');
    const handler = function h(ev) {
      if (!ev.target.closest('.countdown-badge') && !ev.target.closest('.countdown-menu')) {
        menu.classList.remove('show');
        document.removeEventListener('click', h);
      }
    };
    document.addEventListener('click', handler);
  }
}

function toggleMoreMenu(e) {
  if (e) e.stopPropagation();
  const menu = document.getElementById('moreMenu');
  menu.classList.toggle('show');
  if (menu.classList.contains('show')) {
    document.getElementById('countdownMenu') && document.getElementById('countdownMenu').classList.remove('show');
    const handler = function h(ev) {
      if (!ev.target.closest('.topbar-more-btn') && !ev.target.closest('.more-menu')) {
        menu.classList.remove('show');
        document.removeEventListener('click', h);
      }
    };
    document.addEventListener('click', handler);
  }
}

function switchGoal(k) {
  store.activeGoal = k;
  if (store.goals && store.goals.goals) store.goals.active = k;
  LS.set('goals', store.goals);
  saveSettings();
  renderHeader();
  renderCountdownMenu();
  renderGoalBoard();
  document.getElementById('countdownMenu').classList.remove('show');
  var g = (typeof getBigGoal === 'function') ? getBigGoal(k) : null;
  toast('已切换到 ' + (g ? g.title : k), 'ok');
}

/* ── Drag & drop 已迁移至 timeline.js（v6.0 统一时间轴，含 FLIP 动画） ── */

/* ── Task card deletion ───────────────────────── */

function deleteTaskCard(id) {
  if (!confirm('确定删除？')) return;
  deleteTask(id);
  renderAll();
  toast('已删除', 'err');
}

/* ── Keyboard shortcuts ───────────────────────── */

function keyHandler(e) {
  if (e.key === 'Escape') {
    if (!document.getElementById('modalOverlay').classList.contains('hidden')) closeModal();
    if (!document.getElementById('focusOverlay').classList.contains('hidden')) closeFocus();
    if (!document.getElementById('shopOverlay').classList.contains('hidden')) closeShop();
    var importOv = document.getElementById('importOverlay');
    if (importOv && !importOv.classList.contains('hidden')) closeImport();
    var apiOv = document.getElementById('apiConfigOverlay');
    if (apiOv && !apiOv.classList.contains('hidden')) closeApiConfig();
    var authOv = document.getElementById('authOverlay');
    if (authOv && !authOv.classList.contains('hidden')) closeAuthOverlay();
    var modeOv = document.getElementById('modeOverlay');
    if (modeOv && !modeOv.classList.contains('hidden')) closeModeSettings();
    var routineOv = document.getElementById('routineOverlay');
    if (routineOv && !routineOv.classList.contains('hidden')) closeRoutines();
    var goalOv = document.getElementById('goalOverlay');
    if (goalOv && !goalOv.classList.contains('hidden')) closeGoals();
    document.getElementById('countdownMenu').classList.remove('show');
  }
  if (e.ctrlKey && e.key === 'n') { e.preventDefault(); openTaskModal(); }
  // v9.0：Shift+Space 打开/关闭 AI 助手
  if (e.shiftKey && e.key === ' ') { e.preventDefault(); if (typeof aiToggle === 'function') aiToggle(); }
  if (e.ctrlKey && e.key === 's') { e.preventDefault(); sendFeedback(); }
}
