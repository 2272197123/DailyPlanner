/* ═══════════════════════════════════════
   timeline.js — 统一时间轴（v6.0）

   将「每日固定」与「学习任务」合并为单一时间轴：
   - 每项只显示用时（duration），开始/完成时间由起点 + 顺序动态计算
   - 拖拽排序 → 实时重算所有时间点，并持久化（localStorage + 服务器）
   - 起点默认取当天最早一项的时间，可手动修改
   - FLIP 动画保证重排丝滑；入场级联仅在日期切换/导入时播放
   ═══════════════════════════════════════ */
'use strict';

var TL_DEFAULT_START = 9 * 60; /* 09:00 */
var TL_CFG_KEY = 'timelineCfg'; /* dp_timelineCfg = { date: {start:'HH:MM', order:{key:idx}} } */

/* ── 配置读写（顺序 + 起点） ────────────── */

function getTimelineCfg(date) {
  var all = LS.get(TL_CFG_KEY, {});
  var cfg = all[date] || null;
  if (cfg && (cfg.start || cfg.order)) return cfg;

  // 兼容 v5.x 的 dp_taskOrder（仅任务 id → order）
  var legacy = LS.get('taskOrder', {});
  if (legacy[date]) {
    return { start: null, order: legacy[date] };
  }
  return cfg || { start: null, order: {} };
}

function saveTimelineCfg(date, cfg) {
  var all = LS.get(TL_CFG_KEY, {});
  all[date] = cfg;
  LS.set(TL_CFG_KEY, all);
  // 写通到服务器（静态模式下静默失败，无影响）
  if (typeof API !== 'undefined' && API.saveOrder) {
    API.saveOrder(date, cfg).catch(function(){});
  }
}

function clearTimelineCfg(date) {
  var all = LS.get(TL_CFG_KEY, {});
  delete all[date];
  LS.set(TL_CFG_KEY, all);
  var legacy = LS.get('taskOrder', {});
  delete legacy[date];
  LS.set('taskOrder', legacy);
}

/** 从服务器拉取某天的时间轴配置（服务器优先，覆盖本地缓存） */
async function fetchOrderFromServer(date) {
  try {
    var res = await API.getOrder(date);
    if (res.ok && res.data) {
      var all = LS.get(TL_CFG_KEY, {});
      all[date] = res.data;
      LS.set(TL_CFG_KEY, all);
      return res.data;
    }
  } catch (e) { /* 静态模式下静默 */ }
  return null;
}

/* ── 时间轴数据模型 ─────────────────────── */

/** 把 "HH:MM-HH:MM" 转为分钟数（跨天返回 0） */
function _tlAnchor(timeStr) {
  if (!timeStr) return Infinity;
  var parts = timeStr.split('-');
  if (!parts[0] || parts[0].indexOf(':') === -1) return Infinity;
  return p2m(parts[0].trim());
}

/** 获取该日期应使用的日课副本（优先每日独立数据，兜底全局模板） */
function _getRoutinesForDate(date) {
  var dd = (typeof getDailyData === 'function') ? getDailyData(date) : null;
  if (dd && dd.routines && dd.routines.length) return dd.routines;
  // 兜底：首次加载时全局模板就是用户的预设
  if (store.routines && store.routines.length) return store.routines;
  return [];
}

/**
 * 合并 routines（固定事务） + 目标任务为统一时间轴项。
 * 每项: { key, kind, id, icon, label, duration, anchor, done, routine|task }
 */
function getTimelineItems() {
  var items = [];
  var rp = store.routineProgress[store.currentDate] || {};
  // v9.0：从每日独立副本读取日课，而非全局模板
  var routines = _getRoutinesForDate(store.currentDate);
  var i;

  for (i = 0; i < routines.length; i++) {
    var r = routines[i];
    var fl = ((r.name || r.label || '') + '').trim();
    if (!fl) continue;
    items.push({
      key:      'fixed_' + r.id,
      kind:     'fixed',
      id:       r.id,
      icon:     r.icon || '🔁',
      label:    fl,
      note:     r.note || '',
      duration: r.duration && r.duration > 0 ? r.duration : 0,
      anchor:   Infinity,
      done:     !!rp[r.id],
      routine:  r,
    });
  }

  var tasks = getDisplayTasks();
  var seenLabels = {};
  for (i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var tl = ((t.title || t.subject || '') + '').trim();
    if (!tl) continue;                          // 跳过无标题任务
    if (seenLabels[tl.toLowerCase()]) continue; // 同一天内按标题去重（防 AI 重复输出）
    seenLabels[tl.toLowerCase()] = true;
    items.push({
      key:      t.id,
      kind:     'task',
      id:       t.id,
      icon:     t.icon || '📌',
      label:    tl,
      duration: t.duration || (t.time && dur(t.time) > 0 ? dur(t.time) : 25),
      anchor:   Infinity,
      done:     !!t.completed,
      task:     t,
    });
  }

  // 默认排序：时间轴首次出现（无 order）时，保持当前顺序；全部可由用户拖拽
  items = items.map(function(it, idx) { it._idx = idx; return it; });

  // 应用已保存的拖拽顺序
  var cfg = getTimelineCfg(store.currentDate);
  var orderMap = (cfg && cfg.order) || {};
  var hasOrder = Object.keys(orderMap).length > 0;
  if (hasOrder) {
    items.sort(function(a, b) {
      var oa = orderMap.hasOwnProperty(a.key) ? orderMap[a.key] : null;
      var ob = orderMap.hasOwnProperty(b.key) ? orderMap[b.key] : null;
      if (oa === null && ob === null) return a._idx - b._idx;
      if (oa === null) return 1;
      if (ob === null) return -1;
      return oa - ob;
    });
  }

  for (i = 0; i < items.length; i++) delete items[i]._idx;
  return items;
}

/** 起点：手动设置 > 今日取当前系统时间（向下取整 5 分钟）> 09:00 */
function getTimelineStart(items) {
  var cfg = getTimelineCfg(store.currentDate);
  if (cfg && cfg.start) return p2m(cfg.start);
  var todayStr = toLocalDate(new Date());
  if (store.currentDate === todayStr) {
    var now = new Date();
    return Math.floor((now.getHours() * 60 + now.getMinutes()) / 5) * 5;
  }
  return TL_DEFAULT_START;
}

/** 动态计算每一项的开始/结束时间（分钟） */
function computeTimelineTimes(items, startMin) {
  var cursor = startMin;
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var d = items[i].duration || 0;
    out.push({ start: cursor, end: cursor + d });
    cursor += d;
  }
  return out;
}

function _m2h(min) {
  var h = Math.floor(min / 60) % 24;
  var m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

function _fmtDur(min) {
  if (min <= 0) return '跨天';
  if (min < 60) return min + ' 分钟';
  var h = Math.floor(min / 60), m = min % 60;
  return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
}

/* ── 渲染 ───────────────────────────────── */

function renderTimeline() {
  var container = document.getElementById('timeline');
  var bar = document.getElementById('timelineBar');
  var empty = document.getElementById('emptyState');
  if (!container) return;

  var items = getTimelineItems();
  var hasPlanTasks = items.some(function(it) { return it.kind === 'task'; });
  var hasAnyFixed = items.some(function(it) { return it.kind === 'fixed'; });

  document.getElementById('timelineCount').textContent = items.length + ' 项';

  if (items.length === 0) {
    container.innerHTML = '';
    if (bar) bar.innerHTML = '';
    if (empty) {
      empty.style.display = 'block';
      empty.innerHTML = '<div class="empty-icon" style="font-size:2rem">🍃</div>' +
        '<p style="font-size:.9rem">今日本无事，庸人自扰之</p>' +
        '<p style="font-size:.72rem;color:var(--text-tertiary)">该日期未导入计划 — 点「📥 导入」生成目标任务，或在「🔁 固定事务」添加日常预设</p>';
    }
    return;
  }
  if (empty) empty.style.display = 'none';

  var startMin = getTimelineStart(items);
  var times = computeTimelineTimes(items, startMin);
  var totalMin = 0, doneCount = 0, i;
  for (i = 0; i < items.length; i++) { totalMin += items[i].duration || 0; if (items[i].done) doneCount++; }
  var endMin = startMin + totalMin;

  // 顶部控制条：起点设置 + 汇总
  if (bar) {
    var locked = isDateLocked(store.currentDate);
    bar.innerHTML =
      '<div class="tl-bar-left">' +
        '<span class="tl-bar-label">🕘 起点</span>' +
        '<input type="time" class="tl-start-input" id="tlStartInput" value="' + _m2h(startMin) + '"' + (locked ? ' disabled' : '') +
          ' onchange="setTimelineStart(this.value)" title="修改后所有计划的开始/完成时间将重新计算">' +
      '</div>' +
      '<div class="tl-bar-right">' +
        '<span class="tl-bar-stat">已完成 <strong>' + doneCount + '</strong>/' + items.length + '</span>' +
        '<span class="tl-bar-stat">总计 ' + _fmtDur(totalMin) + '</span>' +
        '<span class="tl-bar-stat tl-bar-end">预计 <strong>' + _m2h(endMin) + '</strong> 完成</span>' +
      '</div>';
  }

  // 入场级联动画：仅日期切换/导入/初次加载时播放（由 store._tlFresh 控制）
  var fresh = !!store._tlFresh;
  store._tlFresh = false;

  var lockedDrag = isDateLocked(store.currentDate);
  var html = '';

  // 无目标任务的日期：时间轴顶部显示「今日本无事，庸人自扰之」，固定事务照常列出
  if (!hasPlanTasks) {
    html += '<div class="tl-noplan">' +
      '<div class="tl-noplan-text">🍃 今日本无事，庸人自扰之</div>' +
      '<div class="tl-noplan-sub">该日期未导入目标任务 · 点「📥 导入」让 AI 拆解生成</div>' +
    '</div>';
  }

  for (i = 0; i < items.length; i++) {
    var it = items[i];
    var tm = times[i];
    var timeLabel = it.duration > 0
      ? '<span class="tl-time-start">' + _m2h(tm.start) + '</span><span class="tl-time-sep">→</span><span class="tl-time-end">' + _m2h(tm.end) + '</span>'
      : '<span class="tl-time-start tl-time-na">——</span>';

    var body;
    if (it.kind === 'fixed') {
      var skinIcon = (WAFER_SKINS[store.prefs.waferSkin || 'wafer'] || {}).icon || '💎';
      var rw = it.wafers || (ROUTINE_REWARD * WAFER_VALUE);
      var rEarned = isEarned(store.currentDate, 'fixed_' + it.id);
      body =
        '<div class="tl-routine' + (it.done ? ' done' : '') + '" id="fixedtask-' + it.id + '" onclick="toggleFixedTask(\'' + it.id + '\')">' +
          '<span class="tl-r-icon">' + it.icon + '</span>' +
          '<div class="tl-r-info"><div class="tl-r-label">' + escapeHtml(it.label) + '<span class="tl-kind">固定</span></div>' +
          (it.note ? '<div class="tl-r-note">' + escapeHtml(it.note) + '</div>' : '') + '</div>' +
          '<span class="wafer-reward' + (rEarned ? ' done' : '') + '">' + skinIcon + ' ' + (rEarned ? '已获得' : '+' + rw + ' XP') + '</span>' +
          '<span class="tl-r-check">✓</span>' +
        '</div>' +
        '<button class="tl-del-btn" onclick="tlDeleteTask(event,\'' + it.id + '\',\'fixed\')" title="移除此项">✕</button>';
    } else {
      body = renderCard(it.task) +
        '<button class="tl-del-btn" onclick="tlDeleteTask(event,\'' + it.id + '\',\'task\')" title="删除此任务">✕</button>';
    }

    html +=
      '<div class="tl-item' + (it.done ? ' tl-done' : '') + (fresh ? ' tl-enter' : '') + '"' +
        ' data-key="' + it.key + '"' +
        (fresh ? ' style="--tl-i:' + Math.min(i, 14) + '"' : '') +
        ' draggable="' + (!lockedDrag) + '"' +
        ' ondragstart="tlDragStart(event)" ondragend="tlDragEnd(event)"' +
        ' ondragover="tlDragOver(event)" ondragleave="tlDragLeave(event)" ondrop="tlDrop(event)">' +
        '<div class="tl-gutter">' +
          '<div class="tl-times">' + timeLabel + '</div>' +
          '<div class="tl-dur-chip">' + _fmtDur(it.duration) + '</div>' +
        '</div>' +
        '<div class="tl-rail"><span class="tl-dot"></span></div>' +
        '<div class="tl-body">' + body + '</div>' +
        (lockedDrag ? '' : '<span class="tl-grip" title="拖拽调整顺序">⋮⋮</span>') +
      '</div>';
  }
  container.innerHTML = html;

  // 同步计时器 UI 状态（原 renderTasks 的职责）
  var timerKeys = Object.keys(store.timers);
  for (var tki = 0; tki < timerKeys.length; tki++) { updateMasterTimerUI(timerKeys[tki]); }
  var stKeys = Object.keys(store.stTimers);
  for (var ski = 0; ski < stKeys.length; ski++) {
    var k = stKeys[ski];
    var parts = k.split('_');
    var si = parseInt(parts.pop());
    var tid = parts.join('_');
    if (!isNaN(si)) updateSubTimerUI(tid, si);
  }
}

/** 修改起点 → 全量重算 */
function setTimelineStart(v) {
  if (!v) return;
  if (guardEdit()) { renderTimeline(); return; }
  var cfg = getTimelineCfg(store.currentDate);
  cfg.start = v;
  saveTimelineCfg(store.currentDate, cfg);
  renderTimeline();
  _tlFlashTimes();
  toast('起点已设为 ' + v + '，全部时间已重算', 'ok');
}

/* ── 删除时间轴项 ──────────────── */

function tlDeleteTask(e, id, kind) {
  e.stopPropagation();
  if (guardEdit()) return;

  var label = '';
  if (kind === 'fixed') {
    /* v10.0: Remove from daily copy only, NOT from global template */
    var dd = getDailyData(store.currentDate);
    var routines = (dd && dd.routines) ? dd.routines : (store.routines || []);
    var idx = -1;
    for (var i = 0; i < routines.length; i++) { if (routines[i].id === id) { idx = i; label = routines[i].name; break; } }
    if (idx === -1) return;
    routines.splice(idx, 1);
    if (dd) { dd.routines = routines; saveDailyData(store.currentDate, dd); }
    if (store.routineProgress[store.currentDate]) delete store.routineProgress[store.currentDate][id];
    saveRoutineProgress();
    var earnedKey = 'fixed_' + id;
    if (isEarned(store.currentDate, earnedKey)) unmarkEarned(store.currentDate, earnedKey);
  } else {
    var sched = store.schedules[store.currentDate];
    if (!sched || !sched.blocks) return;
    var bi = -1;
    for (var j = 0; j < sched.blocks.length; j++) { if (sched.blocks[j].id === id) { bi = j; label = sched.blocks[j].subject; break; } }
    if (bi === -1) return;
    var block = sched.blocks[bi];
    if (isEarned(store.currentDate, id) && block) {
      var reward = Math.min(Math.round((block.duration || 30) / 5), 20) * WAFER_VALUE;
      setBalance(Math.max(0, getBalance() - reward));
      recordTransaction('spend', reward, '删除任务: ' + (block.subject || id), id);
      unmarkEarned(store.currentDate, id);
    }
    sched.blocks.splice(bi, 1);
    saveSchedules();
    syncPlanToServer(store.currentDate);
  }
  store._tlFresh = true;
  renderAll();
  toast('已移除「' + (label || id) + '」', 'ok');
}

/* ── 拖拽排序（FLIP 动画） ──────────────── */

var _tlDragKey = null;

function tlDragStart(e) {
  var row = e.target.closest('.tl-item');
  if (!row) { e.preventDefault(); return; }
  _tlDragKey = row.getAttribute('data-key');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', _tlDragKey);
  // 拖拽图像用整行
  try { e.dataTransfer.setDragImage(row, 30, 20); } catch (err) {}
  row.classList.add('tl-dragging');
}

function tlDragEnd(e) {
  var row = e.target.closest('.tl-item');
  if (row) row.classList.remove('tl-dragging');
  var marks = document.querySelectorAll('.tl-item.drop-before, .tl-item.drop-after');
  for (var i = 0; i < marks.length; i++) marks[i].classList.remove('drop-before', 'drop-after');
  _tlDragKey = null;
}

function tlDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  var row = e.target.closest('.tl-item');
  if (!row || row.getAttribute('data-key') === _tlDragKey) return;
  var rect = row.getBoundingClientRect();
  var before = (e.clientY - rect.top) < rect.height / 2;
  row.classList.toggle('drop-before', before);
  row.classList.toggle('drop-after', !before);
}

function tlDragLeave(e) {
  var row = e.target.closest('.tl-item');
  if (row) row.classList.remove('drop-before', 'drop-after');
}

function tlDrop(e) {
  e.preventDefault();
  var row = e.target.closest('.tl-item');
  if (!row || !_tlDragKey) { _tlDragKey = null; return; }

  var targetKey = row.getAttribute('data-key');
  var insertBefore = row.classList.contains('drop-before');
  row.classList.remove('drop-before', 'drop-after');
  if (!targetKey || targetKey === _tlDragKey) { _tlDragKey = null; return; }

  // 当前顺序
  var items = getTimelineItems();
  var keys = items.map(function(it) { return it.key; });
  var from = keys.indexOf(_tlDragKey);
  var to = keys.indexOf(targetKey);
  if (from === -1 || to === -1) { _tlDragKey = null; return; }

  // 计算新顺序
  keys.splice(from, 1);
  to = keys.indexOf(targetKey);
  keys.splice(insertBefore ? to : to + 1, 0, _tlDragKey);
  _tlDragKey = null;

  // 持久化
  var cfg = getTimelineCfg(store.currentDate);
  cfg.order = {};
  for (var i = 0; i < keys.length; i++) cfg.order[keys[i]] = i;
  saveTimelineCfg(store.currentDate, cfg);

  // FLIP 动画重排
  _tlFlipToNewOrder();
  toast('顺序已更新，时间已重算', 'ok');
}

/** FLIP：记录旧位置 → 重渲染 → 反向位移 → 过渡到新位置 */
function _tlFlipToNewOrder() {
  var container = document.getElementById('timeline');
  if (!container) { renderTimeline(); return; }

  var before = {};
  var rows = container.querySelectorAll('.tl-item');
  var i;
  for (i = 0; i < rows.length; i++) {
    before[rows[i].getAttribute('data-key')] = rows[i].getBoundingClientRect().top;
  }

  renderTimeline();

  var rows2 = container.querySelectorAll('.tl-item');
  var moved = [];
  for (i = 0; i < rows2.length; i++) {
    var key = rows2[i].getAttribute('data-key');
    if (before[key] === undefined) continue;
    var dy = before[key] - rows2[i].getBoundingClientRect().top;
    if (Math.abs(dy) > 2) {
      rows2[i].style.transition = 'none';
      rows2[i].style.transform = 'translateY(' + dy + 'px)';
      moved.push(rows2[i]);
    }
  }
  if (!moved.length) { _tlFlashTimes(); return; }

  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      for (var i = 0; i < moved.length; i++) {
        moved[i].style.transition = 'transform .38s cubic-bezier(0.22, 1, 0.36, 1)';
        moved[i].style.transform = '';
      }
      setTimeout(function() {
        for (var j = 0; j < moved.length; j++) moved[j].style.transition = '';
      }, 420);
    });
  });
  _tlFlashTimes();
}

/** 时间点变化高亮（短暂脉冲，提示所有时间已重算） */
function _tlFlashTimes() {
  var container = document.getElementById('timeline');
  if (!container) return;
  container.classList.remove('tl-times-shift');
  void container.offsetWidth; /* 强制回流以重启动画 */
  container.classList.add('tl-times-shift');
  setTimeout(function() { container.classList.remove('tl-times-shift'); }, 700);
}
