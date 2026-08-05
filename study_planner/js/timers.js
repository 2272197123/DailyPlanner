/* ═══════════════════════════════════════
   timers.js — Master & subtask countdown timers (v7.0)
   ═══════════════════════════════════════ */
'use strict';

/* ── Timer helpers ────────────────────────────── */

function getTaskDuration(taskId) {
  var s = store.schedules[store.currentDate];
  if (s) { var b = s.blocks.find(function(x) { return x.id === taskId; }); if (b && b.duration) return b.duration; }
  var t = store.tasks.find(function(x) { return x.id === taskId; });
  if (t && t.duration) return t.duration;
  if (t && t.time) return dur(t.time);
  return 25;
}

function getTaskTitle(id) {
  var s = store.schedules[store.currentDate];
  if (s) { var b = s.blocks.find(function(x) { return x.id === id; }); if (b) return b.subject || ''; }
  var t = store.tasks.find(function(x) { return x.id === id; });
  return t ? t.title : '';
}

function getTaskIcon(id) {
  var s = store.schedules[store.currentDate];
  if (s) { var b = s.blocks.find(function(x) { return x.id === id; }); if (b) return b.icon || '📌'; }
  var t = store.tasks.find(function(x) { return x.id === id; });
  return t ? (t.icon || '📌') : '📌';
}

function getTaskSub(id) {
  var s = store.schedules[store.currentDate];
  if (s) { var b = s.blocks.find(function(x) { return x.id === id; }); if (b) return (b.time || '') + ' · ' + (b.focus || ''); }
  var t = store.tasks.find(function(x) { return x.id === id; });
  return t ? (t.time || '') : '';
}

/* ── Master timer ──────────────────────────────── */

function toggleTaskTimer(tid) {
  var tm = store.timers[tid];
  if (tm && tm.running) pauseMasterTimer(tid);
  else startMasterTimer(tid);
}

function startMasterTimer(tid) {
  if (!store.timers[tid]) {
    store.timers[tid] = { seconds: 0, total: getTaskDuration(tid)*60, running: false, interval: null, startedAt: null };
  }
  var tm = store.timers[tid];
  // Reset to 0 and start fresh each press (re-entry from pause resumes existing state)
  if (!tm.startedAt) tm.startedAt = Date.now();
  tm.running = true;
  store.focusTaskId = tid;
  var capTid = tid;
  tm.interval = setInterval(function() {
    var tm2 = store.timers[capTid];
    tm2.seconds++;
    updateMasterTimerUI(capTid);
    updateFocusUI(capTid);
    saveTimers();
  }, 1000);
  updateMasterTimerUI(tid);
  openFocus(tid);
  saveTimers();
}

function pauseMasterTimer(tid) {
  var tm = store.timers[tid];
  if (!tm) return;
  clearInterval(tm.interval);
  tm.running = false;
  store.focusTaskId = null;
  updateMasterTimerUI(tid);
  updateFocusUI(tid);
  saveTimers();
}

function resetMasterTimer(tid) {
  var tm = store.timers[tid];
  if (tm && tm.interval) clearInterval(tm.interval);
  store.timers[tid] = { seconds: 0, total: getTaskDuration(tid)*60, running: false, interval: null, startedAt: null };
  store.focusTaskId = null;
  updateMasterTimerUI(tid);
  updateFocusUI(tid);
  saveTimers();
  closeFocus();
}

/* ── Subtask timer ────────────────────────────── */

function toggleSubtaskTimer(tid, si) {
  var k = tid + '_' + si;
  var tm = store.stTimers[k];
  if (tm && tm.running) pauseSubtaskTimer(tid, si);
  else startSubtaskTimer(tid, si);
}

function getSubEstMin(tid, si) {
  var s = store.schedules[store.currentDate];
  if (s) { var b = s.blocks.find(function(x) { return x.id === tid; }); if (b && b.subtasks[si] && b.subtasks[si].estMin) return b.subtasks[si].estMin; }
  var t = store.tasks.find(function(x) { return x.id === tid; });
  if (t && t.subtasks[si] && t.subtasks[si].estMin) return t.subtasks[si].estMin;
  return 25;
}

function startSubtaskTimer(tid, si) {
  var k = tid + '_' + si;
  if (!store.stTimers[k]) {
    store.stTimers[k] = { seconds: 0, total: getSubEstMin(tid, si)*60, running: false, interval: null, startedAt: null };
  }
  var tm = store.stTimers[k];
  tm.running = true;
  if (!tm.startedAt) tm.startedAt = Date.now();
  var capTid = tid, capSi = si;
  tm.interval = setInterval(function() {
    var stm = store.stTimers[capTid + '_' + capSi];
    stm.seconds++;
    recordActualTime(capTid, capSi);
    updateSubTimerUI(capTid, capSi);
    saveStTimers();
  }, 1000);
  updateSubTimerUI(tid, si);
  saveStTimers();
}

function pauseSubtaskTimer(tid, si) {
  var k = tid + '_' + si, tm = store.stTimers[k];
  if (!tm) return;
  clearInterval(tm.interval);
  tm.running = false;
  recordActualTime(tid, si);
  updateSubTimerUI(tid, si);
  saveStTimers();
}

function resetSubTimer(tid, si) {
  var k = tid + '_' + si;
  var tm = store.stTimers[k];
  if (tm && tm.interval) clearInterval(tm.interval);
  delete store.subtaskActual[k];
  store.stTimers[k] = { seconds: 0, total: getSubEstMin(tid,si)*60, running: false, interval: null, startedAt: null };
  updateSubTimerUI(tid, si);
  saveStTimers();
  saveSubtaskActual();
}

function recordActualTime(tid, si) {
  var k = tid + '_' + si, tm = store.stTimers[k];
  if (!tm) return;
  var elapsed = tm.seconds || 0;
  store.subtaskActual[k] = elapsed;
  saveSubtaskActual();
}

function stopAllTimersForTask(tid) {
  closeFocus();
  if (store.timers[tid]) { clearInterval(store.timers[tid].interval); delete store.timers[tid]; }
  Object.keys(store.stTimers).forEach(function(k) {
    if (k.indexOf(tid + '_') === 0) { clearInterval(store.stTimers[k].interval); delete store.stTimers[k]; }
  });
  saveTimers();
  saveStTimers();
}

/* ── UI updaters (imperative DOM patches) ─────── */

function updateMasterTimerUI(tid) {
  var d = document.getElementById('td-' + tid);
  var b = document.getElementById('tb-' + tid);
  var r = document.getElementById('tbar-' + tid);
  var card = document.getElementById('card-' + tid);
  var pbar = document.getElementById('tbar-fill-' + tid);
  var pulseDot = document.getElementById('tbar-dot-' + tid);
  if (!d) return;
  var tm = store.timers[tid];
  var estSec = getTaskDuration(tid) * 60;
  // Show elapsed time as HH:MM:SS
  var secs = tm ? tm.seconds : 0;
  d.textContent = fmtTimeHMS(secs);
  // Update progress bar fill
  if (pbar) {
    var pct = estSec > 0 ? Math.min(100, (secs / estSec) * 100) : 0;
    pbar.style.width = pct + '%';
    // Color by threshold
    var ratio = estSec > 0 ? secs / estSec : 0;
    if (ratio > 1.5) {
      pbar.className = 'tbar-fill state-over-red';
    } else if (ratio > 1.0) {
      pbar.className = 'tbar-fill state-over-amber';
    } else {
      pbar.className = 'tbar-fill';
    }
  }
  // Running/paused UI
  if (tm && tm.running) {
    d.classList.add('running');
    if (b) { b.textContent = '⏸'; b.title = '暂停计时'; }
    if (r) r.classList.add('has-running');
    if (card) card.classList.add('card-timer-active');
    if (pulseDot) pulseDot.classList.add('pulsing');
  } else {
    d.classList.remove('running');
    if (b) { b.textContent = '▶'; b.title = '开始计时'; }
    if (r) r.classList.remove('has-running');
    if (card) card.classList.remove('card-timer-active');
    if (pulseDot) pulseDot.classList.remove('pulsing');
  }
}

function updateSubTimerUI(tid, si) {
  var k = tid + '_' + si, d = document.getElementById('std-' + k);
  if (!d) return;
  var tm = store.stTimers[k];
  var estSec = getSubEstMin(tid, si) * 60;
  var secs = tm ? tm.seconds : 0;
  if (tm) {
    d.textContent = '⏱' + fmtTimeHMS(secs);
  }
  // Color by overtime
  var ratio = estSec > 0 ? secs / estSec : 0;
  d.className = 'st-timer-inline';
  if (tm && tm.running) {
    d.className += ' running';
    if (ratio > 1.5) d.className += ' st-overtime-red';
    else if (ratio > 1.0) d.className += ' st-overtime-amber';
  }
}

/* ── Focus overlay ────────────────────────────── */

function _renderFocusCard(id) {
  var tm = store.timers[id];
  var running = tm ? tm.running : false;
  var sec = tm ? Math.max(0, tm.seconds) : 0;
  var icon = getTaskIcon(id);
  var title = getTaskTitle(id);
  var sub = getTaskSub(id);

  document.getElementById('focusCard').innerHTML =
    '<span class="focus-close" onclick="closeFocus()">✕</span>' +
    '<div class="focus-icon">' + escapeHtml(icon) + '</div>' +
    '<div class="focus-title">' + escapeHtml(title || '无标题') + '</div>' +
    '<div class="focus-sub">' + escapeHtml(sub) + '</div>' +
    '<div class="focus-timer' + (running ? ' running' : '') + '" id="focusTimerDisplay">' + fmtTimeHMS(sec) + '</div>' +
    '<div class="focus-btns">' +
      '<button class="' + (running ? 'btn-focus-pause' : 'btn-focus-start') + '" onclick="event.stopPropagation();toggleTaskTimer(\'' + id + '\')">' + (running ? '⏸ 暂停' : '▶ 开始') + '</button>' +
      '<button class="btn-focus-reset" onclick="event.stopPropagation();resetMasterTimer(\'' + id + '\')">↺ 重置</button>' +
    '</div>' +
    '<div class="focus-subtask-note">' + (running ? '计时中 — 可关闭此窗口继续操作' : '') + '</div>';
}

function openFocus(id) {
  if (!document.getElementById('modalOverlay').classList.contains('hidden')) closeModal();
  if (!document.getElementById('shopOverlay').classList.contains('hidden')) closeShop();
  if (!document.getElementById('ledgerOverlay').classList.contains('hidden')) closeLedger();
  if (!document.getElementById('accountingOverlay').classList.contains('hidden')) closeAccounting();
  store.focusTaskId = id;
  _renderFocusCard(id);
  document.getElementById('focusOverlay').classList.remove('hidden');
}

function closeFocus() {
  document.getElementById('focusOverlay').classList.add('hidden');
  store.focusTaskId = null;
}

function closeFocusIfOverlay(e) {
  if (e.target === document.getElementById('focusOverlay')) closeFocus();
}

function updateFocusUI(id) {
  if (store.focusTaskId !== id) return;
  var tm = store.timers[id];
  var running = tm ? tm.running : false;
  var sec = tm ? Math.max(0, tm.seconds) : 0;

  // DOM patch: update only textContent, never innerHTML (avoids CSS animation replay)
  var display = document.getElementById('focusTimerDisplay');
  if (display) {
    display.textContent = fmtTimeHMS(sec);
    if (running) display.classList.add('running'); else display.classList.remove('running');
  }

  var btns = document.querySelectorAll('#focusCard .focus-btns button');
  for (var i = 0; i < btns.length; i++) {
    var btn = btns[i];
    if (btn.className.indexOf('btn-focus-pause') !== -1 || btn.className.indexOf('btn-focus-start') !== -1) {
      btn.className = running ? 'btn-focus-pause' : 'btn-focus-start';
      btn.textContent = running ? '⏸ 暂停' : '▶ 开始';
      btn.setAttribute('onclick', "event.stopPropagation();toggleTaskTimer('" + id + "')");
    }
  }

  var note = document.querySelector('#focusCard .focus-subtask-note');
  if (note) {
    note.textContent = running ? '计时中 — 可关闭此窗口继续操作' : '';
  }
}
