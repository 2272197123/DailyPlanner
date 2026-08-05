/* ═══════════════════════════════════════
   render.js — Full-page render orchestration

   All render functions read from store.* (read-only).
   DOM mutations are purely a projection of current store state.
   ═══════════════════════════════════════ */
'use strict';

function renderAll() {
  // Safety net: close all overlays before any innerHTML rewrite.
  var modals = ['modalOverlay','focusOverlay','shopOverlay','ledgerOverlay','accountingOverlay','archiveOverlay','goalOverlay','routineOverlay','modeOverlay','authOverlay','apiConfigOverlay','importOverlay'];
  for (var i = 0; i < modals.length; i++) {
    var el = document.getElementById(modals[i]);
    if (el) { el.classList.add('hidden'); el.classList.remove('anim-open','anim-done'); }
  }
  renderHeader();
  renderDate();
  renderCountdownMenu();
  renderMode();
  renderHeroProgress();
  renderGoalBoard();
  renderEncouragement();
  renderTimeline();
  renderStars();
  restoreFeedback();
  // Sync balance display from LS (single source of truth)
  updateBalanceUI();
}

/* ── Header ───────────────────────────────────── */

function renderHeader() {
  document.getElementById('headerDate').textContent = store.currentDate;
  // v8.0：登录状态 Badge
  if (typeof renderAuthBadge === 'function') renderAuthBadge();
  // v7.0：头部倒计时改读新目标系统（goals.js）
  var g = (typeof getActiveBigGoal === 'function') ? getActiveBigGoal() : null;
  if (!g) {
    document.getElementById('cdIcon').textContent = '🎯';
    document.getElementById('cdText').textContent = '设定目标';
    updateClockDisplay();
    return;
  }
  if (g.deadline) {
    var days = Math.max(0, Math.ceil((new Date(g.deadline + 'T00:00:00') - new Date()) / 86400000));
    document.getElementById('cdText').textContent = '距' + g.title.split(' ')[0] + ' ' + days + ' 天';
  } else {
    document.getElementById('cdText').textContent = g.title.split(' ')[0];
  }
  document.getElementById('cdIcon').textContent = g.icon;
  updateClockDisplay();
}

function renderDate() {
  var dow = ['周日','周一','周二','周三','周四','周五','周六'][new Date(store.currentDate+'T00:00:00').getDay()];
  var todayStr = toLocalDate(new Date());
  var marker = store.currentDate === todayStr ? ' 📍' : (store.currentDate < todayStr ? ' 🔙' : ' 🔜');
  document.getElementById('dateTitle').textContent = store.currentDate + ' · ' + dow + marker;
}

function renderCountdownMenu() {
  // v7.0：倒计时菜单列出新目标系统中的目标，底部提供管理入口
  var goals = (typeof getBigGoals === 'function') ? getBigGoals() : [];
  if (!goals.length) {
    document.getElementById('countdownMenu').innerHTML =
      '<div class="countdown-menu-item" onclick="openGoals()"><span>🎯</span>创建你的第一个目标</div>';
    return;
  }
  var goalsHTML = '';
  for (var i = 0; i < goals.length; i++) {
    var g = goals[i];
    if (g.status === 'done') continue;
    goalsHTML += '<div class="countdown-menu-item' + (g.id === store.activeGoal ? ' active' : '') + '" onclick="switchGoal(\'' + g.id + '\')"><span>' + g.icon + '</span>' + escapeHtml(g.title) + '<span class="cd-date">' + (g.deadline || '') + '</span></div>';
  }
  goalsHTML += '<div class="countdown-menu-item cd-manage" onclick="openGoals()"><span>⚙️</span>管理目标</div>';
  document.getElementById('countdownMenu').innerHTML = goalsHTML;
}

function renderMode() {
  var modeHTML = '';
  var modeKeys = MODE_ORDER;
  var cfg = getModeCfg();
  for (var i = 0; i < modeKeys.length; i++) {
    var k = modeKeys[i];
    modeHTML += '<button class="' + (store.mode === k ? 'active' : '') + '" onclick="setMode(\'' + k + '\')">' + escapeHtml(cfg[k].label) + '</button>';
  }
  document.getElementById('modeSeg').innerHTML = modeHTML;

  // Restore lock UI if mode is already locked
  if (isModeLocked(store.currentDate)) {
    enableModeLockUI(store.mode);
  }
}

/* ── Clock ────────────────────────────────────── */

var _clockInterval = null;
function startClock() {
  if (_clockInterval) return;
  _clockInterval = setInterval(updateClockDisplay, 1000);
  updateClockDisplay();
}

function updateClockDisplay() {
  var now = new Date();
  var timeStr = now.toLocaleTimeString('zh-CN', {hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false});
  var dow = ['周日','周一','周二','周三','周四','周五','周六'][now.getDay()];
  var dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0') + ' · ' + dow;

  var clockEl = document.getElementById('hpClock');
  var dateEl  = document.getElementById('hpClockDate');
  if (clockEl) clockEl.textContent = timeStr;
  if (dateEl)  dateEl.textContent  = dateStr;
}

/* ── Hero progress ring ───────────────────────── */

function renderHeroProgress() {
  if (!store.schedules[store.currentDate]) {
    document.getElementById('heroProgress').innerHTML =
      '<div class="hp-ring-wrap"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="22" fill="none" stroke="var(--ring)" stroke-width="4"/><circle cx="25" cy="25" r="22" fill="none" stroke="var(--ring)" stroke-width="4" stroke-dasharray="' + (2*Math.PI*22) + '" stroke-dashoffset="0"/></svg><div class="hp-pct">--</div></div>' +
      '<div class="hp-info"><div class="hp-title">📭 今日无事</div><div class="hp-sub">请先导入 ' + store.currentDate + ' 的计划</div></div>' +
      '<div class="hp-clock-wrap"><div class="hp-clock" id="hpClock">--:--:--</div><div class="hp-clock-date" id="hpClockDate">----</div></div>';
    updateClockDisplay();
    return;
  }

  var tasks   = getDisplayTasks();
  var rp      = store.routineProgress[store.currentDate] || {};
  var routines = store.routines || [];

  var tr = routines.length;
  var rd = routines.filter(function(r) { return rp[r.id]; }).length;
  var td = tasks.filter(function(t) { return t.completed; }).length;
  var tt = tasks.length || 0;

  var ti = tr + tt;
  var totalDone = rd + td;
  var pct = ti ? Math.round(totalDone / ti * 100) : 0;
  var circumference = 2 * Math.PI * 22;
  var dashOffset = circumference * (1 - pct/100);

  document.getElementById('heroProgress').innerHTML =
    '<div class="hp-ring-wrap"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="22" fill="none" stroke="var(--ring)" stroke-width="4"/><circle cx="25" cy="25" r="22" fill="none" stroke="var(--green)" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + dashOffset + '" style="transition:stroke-dashoffset .6s cubic-bezier(0.22,1,0.36,1)"/></svg><div class="hp-pct" id="hpPct">' + pct + '%</div></div>' +
    '<div class="hp-info"><div class="hp-title">今日完成 <strong>' + totalDone + '</strong> / ' + ti + ' 项</div><div class="hp-sub">固定 ' + rd + '/' + tr + ' · 任务 ' + td + '/' + tt + '</div></div>' +
    '<div class="hp-clock-wrap"><div class="hp-clock" id="hpClock">--:--:--</div><div class="hp-clock-date" id="hpClockDate">----</div></div>';
  updateClockDisplay();
  _tweenHpPct(pct);
}

/* 百分比数字滚动：从上次值平滑过渡到当前值 */
function _tweenHpPct(target) {
  var el = document.getElementById('hpPct');
  if (!el) return;
  var from = (typeof store._hpPct === 'number') ? store._hpPct : target;
  store._hpPct = target;
  if (from === target) { el.textContent = target + '%'; return; }
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = target + '%'; return;
  }
  if (store._hpTween) cancelAnimationFrame(store._hpTween);
  var start = null, durMs = 550;
  function step(ts) {
    if (!start) start = ts;
    var t = Math.min(1, (ts - start) / durMs);
    var eased = 1 - Math.pow(1 - t, 3); /* easeOutCubic */
    var v = Math.round(from + (target - from) * eased);
    if (el.isConnected) el.textContent = v + '%';
    if (t < 1) store._hpTween = requestAnimationFrame(step);
  }
  store._hpTween = requestAnimationFrame(step);
}

/* ── Encouragement ────────────────────────────── */

function renderEncouragement() {
  if (!store.schedules[store.currentDate]) {
    document.getElementById('encouragement').innerHTML = '<span>📭 今日无事 — 请先导入今日计划（JSON）</span>';
    return;
  }
  if (isDateLocked(store.currentDate)) {
    var arch = JSON.parse(localStorage.getItem(getArchiveKey(store.currentDate)) || '{}');
    if (arch.archivedAt) {
      document.getElementById('encouragement').innerHTML = '<span>📦 此日期已于 ' + new Date(arch.archivedAt).toLocaleString('zh-CN') + ' 存档，仅供查看</span>';
      return;
    }
  }
  var s = store.schedules[store.currentDate];
  var encText = s.encouragement || pickEncouragementSeeded(store.currentDate, store.mode);
  var cfg = getModeCfg();
  var modeTag = cfg[store.mode] ? cfg[store.mode].label : '';
  document.getElementById('encouragement').innerHTML =
    '<span style="flex:1">' + encText + '</span><span class="enc-mode-tag">' + escapeHtml(modeTag) + '</span>';
}

/* ── Routines & Tasks 列表渲染已迁移至 timeline.js（v6.0 统一时间轴） ── */

/* ── Single card ──────────────────────────────── */

function renderCardTimer(task) {
  var tid = task.id;
  var tm = store.timers[tid];
  var estSec = (task.duration || 0) * 60;
  var secs = tm ? tm.seconds : 0;
  var running = tm ? tm.running : false;
  // Progress bar width (capped at 100% for display, overtime is handled by color)
  var pct = estSec > 0 ? Math.min(100, (secs / estSec) * 100) : 0;
  var ratio = estSec > 0 ? secs / estSec : 0;
  var barClass = 'tbar-fill';
  if (ratio > 1.5) barClass += ' state-over-red';
  else if (ratio > 1.0) barClass += ' state-over-amber';

  var hasAnyRunning = (Object.keys(store.stTimers).some(function(k) {
    return k.indexOf(tid + '_') === 0 && store.stTimers[k].running;
  }) || running);

  var html = '<div class="card-timer' + (hasAnyRunning ? ' has-running' : '') + '" id="tbar-' + tid + '">';
  // Green pulsing indicator dot
  html += '<span class="tbar-dot' + (running ? ' pulsing' : '') + '" id="tbar-dot-' + tid + '"></span>';
  // HH:MM:SS display
  html += '<span class="tbar-display' + (running ? ' running' : '') + '" id="td-' + tid + '">' + fmtTimeHMS(secs) + '</span>';
  // Inline progress bar
  html += '<span class="tbar-track"><span class="' + barClass + '" id="tbar-fill-' + tid + '" style="width:' + pct + '%"></span></span>';
  // Play/pause toggle
  html += '<button class="tbar-btn-play' + (running ? ' active' : '') + '" id="tb-' + tid + '" onclick="event.stopPropagation();toggleTaskTimer(\'' + tid + '\')" title="' + (running ? '暂停计时' : '开始计时') + '">' + (running ? '⏸' : '▶') + '</button>';
  // Small reset button
  html += '<button class="tbar-btn-reset" onclick="event.stopPropagation();resetMasterTimer(\'' + tid + '\')" title="重置计时">↺</button>';
  html += '</div>';
  return html;
}

function renderCardSubtasks(task) {
  var subs = task.subtasks || [];
  if (!subs.length) return '';
  var tid = task.id;
  return '<div class="subtask-chips">' + subs.map(function(st, si) {
    var sk = tid + '_' + si;
    var stm = store.stTimers[sk];
    var stSecs = stm ? stm.seconds : 0;
    var stRun = stm ? stm.running : false;
    var act = store.subtaskActual ? store.subtaskActual[sk] : undefined;
    var stEst = (st.estMin || 0) * 60;
    var stRatio = stEst > 0 ? stSecs / stEst : 0;
    var stTimerCls = 'st-timer-inline';
    if (stRun) stTimerCls += ' running';
    if (stRatio > 1.5) stTimerCls += ' st-overtime-red';
    else if (stRatio > 1.0) stTimerCls += ' st-overtime-amber';
    return '<div class="subtask-chip ' + (st.done ? 'done' : '') + '" onclick="event.stopPropagation();toggleSubtask(\'' + tid + '\',' + si + ');renderTimeline();renderHeroProgress();">' +
      '<span class="chip-dot"></span>' + escapeHtml(st.text) +
      (stm ? '<span class="' + stTimerCls + '" id="std-' + sk + '" onclick="event.stopPropagation();toggleSubtaskTimer(\'' + tid + '\',' + si + ')">⏱' + fmtTimeHMS(stSecs) + '</span>' : '<span class="st-timer-inline" id="std-' + sk + '" onclick="event.stopPropagation();toggleSubtaskTimer(\'' + tid + '\',' + si + ')">⏱--:--:--</span>') +
      (act ? '<span class="st-actual">实' + fmtTimeHMS(act) + '</span>' : '') +
      '</div>';
  }).join('') + '</div>';
}

function renderCardDue(task) {
  if (!task.dueDate) return '';
  var today = toLocalDate(new Date());
  var cls = task.dueDate < today ? 'badge-pri-high' : '';
  return '<span class="badge ' + cls + '" style="font-size:.6rem">📅 ' + task.dueDate + (task.dueTime ? ' ' + task.dueTime : '') + '</span>';
}

function renderGoalBadge(goalId) {
  var g = (typeof getBigGoal === 'function') ? getBigGoal(goalId) : null;
  if (!g) return '';
  return '<span class="badge badge-goal" title="关联目标：' + escapeHtml(g.title) + '">' + g.icon + ' ' + escapeHtml(g.title) + '</span>';
}

function renderCard(task) {
  var tid = task.id;
  var subs = task.subtasks || [];
  var doneCount = subs.filter(function(s) { return s.done; }).length;
  var pct = subs.length ? Math.round(doneCount / subs.length * 100) : (task.completed ? 100 : 0);

  var reward = calcTaskReward(task) * WAFER_VALUE;
  var earned = isEarned(store.currentDate, tid);
  var skinIcon = (WAFER_SKINS[store.prefs.waferSkin || 'wafer'] || {}).icon || '💎';

  // 用时（分钟 → 人性化显示）
  var durMin = task.duration || (task.time ? dur(task.time) : 0);
  var durLabel = durMin >= 60
    ? (Math.floor(durMin / 60) + 'h' + (durMin % 60 ? durMin % 60 + 'm' : ''))
    : (durMin ? durMin + ' 分钟' : '');

  return '<div class="card cat-' + (task.category || 'other') + ' ' + (task.completed ? 'completed' : '') + '" id="card-' + tid + '" data-id="' + tid + '">' +
    '<div class="card-stripe"></div>' +
    '<div class="card-check-overlay ' + (task.completed ? 'done' : '') + '" onclick="event.stopPropagation();completeWithFeedback(\'' + tid + '\')">' + (task.completed ? '✓' : '') + '</div>' +
    '<div class="card-header">' +
      '<span class="card-icon">' + (task.icon || '📌') + '</span>' +
      '<span class="card-title">' + escapeHtml(task.title || task.subject || '无标题') + '</span>' +
      (durLabel ? '<span class="card-dur" title="预计用时">⏱ ' + durLabel + '</span>' : '') +
    '</div>' +
    '<div class="card-badges">' +
      '<span class="badge badge-cat-' + (task.category || 'other') + '">' + (CAT_LABELS[task.category] || task.category || '其他') + '</span>' +
      '<span class="badge badge-pri-' + (task.priority || 'medium') + '">' + (PRI_LABELS[task.priority] || '🟡 中') + '</span>' +
      (task.phase ? '<span class="badge" style="background:rgba(43,58,92,.08);color:var(--accent)">' + escapeHtml(task.phase) + '</span>' : '') +
      (task.goalId ? renderGoalBadge(task.goalId) : '') +
      renderCardDue(task) +
      '<div class="card-actions" style="margin-left:auto"><button class="btn-edit" onclick="event.stopPropagation();openTaskModal(\'' + tid + '\')">✎</button><button class="btn-delete" onclick="event.stopPropagation();deleteTaskCard(\'' + tid + '\')">✕</button></div>' +
    '</div>' +
    (task.flowHint ? '<div class="card-flow">💡 ' + escapeHtml(task.flowHint) + '</div>' : '') +
    renderCardSubtasks(task) +
    renderCardTimer(task) +
    '<div class="card-footer"><span>' + doneCount + '/' + subs.length + '</span><div class="pbar"><div class="pbar-fill" style="width:' + pct + '%"></div></div><span>' + pct + '%</span></div>' +
  '</div>';
}

function renderStars() {
  var starHTML = '';
  for (var i = 1; i <= 5; i++) {
    starHTML += '<span class="star' + (i <= store.rating ? ' lit' : '') + '" onclick="setRating(' + i + ')">★</span>';
  }
  document.getElementById('starRow').innerHTML = starHTML;
}

function restoreFeedback() {
  var dp = store.progress[store.currentDate];
  document.getElementById('feedbackInput').value = dp ? (dp.note || dp.feedback || '') : '';
  setRating(dp ? (dp.rating || 0) : 0);
}

function setRating(r) {
  store.rating = r;
  renderStars();
}
