/* ═══════════════════════════════════════
   goals.js — 长期目标系统（v7.0）

   通用目标管理：用户自定义大目标 → AI 拆解为阶段(phases)
   与里程碑(milestones) → 每日任务通过 goalId 关联目标。

   数据结构（dp_bigGoals / 服务器 state key "biggoals"）：
   {
     id, title, icon, desc, deadline, startDate,
     status: 'active' | 'paused' | 'done',
     createdAt,
     phases: [{ id, name, focus, start, end,
                milestones: [{ id, text, done }] }]
   }

   进度口径：有里程碑 → 里程碑完成率；无里程碑 → 时间进度。
   ═══════════════════════════════════════ */
'use strict';

/* ── 数据层 ─────────────────────────────── */

function getBigGoals() { return store.bigGoals || []; }

function getBigGoal(id) {
  var goals = getBigGoals();
  for (var i = 0; i < goals.length; i++) {
    if (goals[i].id === id) return goals[i];
  }
  return null;
}

/** 当前激活目标：精确匹配 → g_ 前缀兼容（旧 id）→ 第一个进行中目标 */
function getActiveBigGoal() {
  var goals = getBigGoals();
  if (!goals.length) return null;
  var g = getBigGoal(store.activeGoal);
  if (!g && store.activeGoal) g = getBigGoal('g_' + store.activeGoal);
  if (!g) {
    for (var i = 0; i < goals.length; i++) {
      if (goals[i].status !== 'done') { g = goals[i]; break; }
    }
    g = g || goals[0];
  }
  return g;
}

/** 写通：localStorage 立即生效 + 服务器异步同步 */
function saveBigGoals() {
  LS.set('bigGoals', store.bigGoals);
  if (typeof API !== 'undefined' && API.saveGoals) {
    API.saveGoals(store.bigGoals).catch(function() {});
  }
}

function _goalUid(prefix) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function createGoal(data) {
  var g = {
    id:        _goalUid('g'),
    title:     data.title || '未命名目标',
    icon:      data.icon || '🎯',
    desc:      data.desc || '',
    deadline:  data.deadline || '',
    startDate: data.startDate || toLocalDate(new Date()),
    dailyMax:  data.dailyMax || 180,  // 完整状态下每日最多用时（分钟），用户自定义
    status:    data.status || 'active',
    createdAt: new Date().toISOString(),
    phases:    data.phases || [],
  };
  store.bigGoals.push(g);
  saveBigGoals();
  return g;
}

function updateGoal(id, updates) {
  var g = getBigGoal(id);
  if (!g) return null;
  for (var k in updates) {
    if (updates.hasOwnProperty(k) && k !== 'id') g[k] = updates[k];
  }
  saveBigGoals();
  return g;
}

function deleteGoal(id) {
  store.bigGoals = getBigGoals().filter(function(g) { return g.id !== id; });
  if (store.activeGoal === id) {
    var next = getActiveBigGoal();
    store.activeGoal = next ? next.id : null;
    saveSettings();
  }
  saveBigGoals();
}

/** 按 id 或名称解析目标（JSON 导入的 blocks.goal 字段可用名字引用） */
function resolveGoalId(ref) {
  if (!ref) return '';
  var goals = getBigGoals();
  var i;
  for (i = 0; i < goals.length; i++) if (goals[i].id === ref) return goals[i].id;
  var low = String(ref).toLowerCase();
  for (i = 0; i < goals.length; i++) {
    if (String(goals[i].title).toLowerCase() === low) return goals[i].id;
  }
  for (i = 0; i < goals.length; i++) {
    if (String(goals[i].title).toLowerCase().indexOf(low) !== -1) return goals[i].id;
  }
  return '';
}

/* ── 旧版倒计时目标迁移（dp_goals → dp_bigGoals） ── */

function migrateLegacyGoals() {
  if (getBigGoals().length > 0) return;
  var legacy = store.goals && store.goals.goals;
  if (!legacy) return;
  var keys = Object.keys(legacy);
  if (!keys.length) return;
  store.bigGoals = [];
  for (var i = 0; i < keys.length; i++) {
    var g = legacy[keys[i]];
    store.bigGoals.push({
      id:        'g_' + keys[i],
      title:     g.name || keys[i],
      icon:      g.icon || '🎯',
      desc:      g.desc || '',
      deadline:  g.date || '',
      startDate: '',
      status:    'active',
      createdAt: new Date().toISOString(),
      phases:    [],
    });
  }
  if (store.goals.active && getBigGoal('g_' + store.goals.active)) {
    store.activeGoal = 'g_' + store.goals.active;
    saveSettings();
  }
  saveBigGoals();
  console.log('🎯 已迁移 ' + keys.length + ' 个旧版倒计时目标到新目标系统');
}

/** 从服务器拉取目标；服务器为空而本地非空时把本地推上去 */
async function fetchBigGoalsFromServer() {
  try {
    var res = await API.getGoals();
    if (!res.ok) return false;
    if (res.data && res.data.length) {
      store.bigGoals = res.data;
      LS.set('bigGoals', store.bigGoals);
      return true;
    }
    if (getBigGoals().length) API.saveGoals(store.bigGoals).catch(function() {});
  } catch (e) { /* 静态模式静默 */ }
  return false;
}

/* ── 进度计算 ───────────────────────────── */

function _goalDaysBetween(a, b) {
  return Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
}

function goalDaysLeft(g) {
  if (!g.deadline) return null;
  return Math.max(0, _goalDaysBetween(toLocalDate(new Date()), g.deadline));
}

/** 时间进度：startDate→deadline 之间的流逝比例（缺日期返回 0） */
function _goalTimeProgress(start, end) {
  if (!start || !end || end <= start) return 0;
  var today = toLocalDate(new Date());
  if (today <= start) return 0;
  if (today >= end) return 100;
  var total = _goalDaysBetween(start, end);
  var elapsed = _goalDaysBetween(start, today);
  return Math.round(elapsed / total * 100);
}

function phaseProgress(p) {
  var ms = p.milestones || [];
  if (ms.length) {
    var d = 0;
    for (var i = 0; i < ms.length; i++) if (ms[i].done) d++;
    return Math.round(d / ms.length * 100);
  }
  return _goalTimeProgress(p.start, p.end);
}

/** 当前阶段：今天落在日期区间内 → 该阶段；否则第一个未完成阶段 */
function currentPhase(g) {
  var phases = g.phases || [];
  if (!phases.length) return null;
  var today = toLocalDate(new Date());
  var i;
  for (i = 0; i < phases.length; i++) {
    var p = phases[i];
    if (p.start && p.end && today >= p.start && today <= p.end) return p;
  }
  for (i = 0; i < phases.length; i++) {
    if (phaseProgress(phases[i]) < 100) return phases[i];
  }
  return phases[phases.length - 1];
}

/** 关联每日任务统计：扫描所有日期计划 blocks + 用户任务中的 goalId */
function goalLinkedStats(goalId) {
  var total = 0, done = 0;
  var dates = Object.keys(store.schedules || {});
  var i, j;
  for (i = 0; i < dates.length; i++) {
    var blocks = (store.schedules[dates[i]] && store.schedules[dates[i]].blocks) || [];
    for (j = 0; j < blocks.length; j++) {
      if (blocks[j].goalId === goalId) { total++; if (blocks[j].completed) done++; }
    }
  }
  for (i = 0; i < (store.tasks || []).length; i++) {
    var t = store.tasks[i];
    if (t.goalId === goalId) { total++; if (t.completed) done++; }
  }
  return { total: total, done: done };
}

function goalProgress(g) {
  var phases = g.phases || [];
  var totMs = 0, doneMs = 0, i, j;
  for (i = 0; i < phases.length; i++) {
    var ms = phases[i].milestones || [];
    totMs += ms.length;
    for (j = 0; j < ms.length; j++) if (ms[j].done) doneMs++;
  }
  var pct;
  if (totMs > 0) {
    pct = Math.round(doneMs / totMs * 100);
  } else if (phases.length) {
    var sum = 0;
    for (i = 0; i < phases.length; i++) sum += phaseProgress(phases[i]);
    pct = Math.round(sum / phases.length);
  } else {
    pct = _goalTimeProgress(g.startDate, g.deadline);
  }
  return {
    pct:      pct,
    doneMs:   doneMs,
    totMs:    totMs,
    current:  currentPhase(g),
    linked:   goalLinkedStats(g.id),
    daysLeft: goalDaysLeft(g),
  };
}

/* ── 主页面目标板块 ─────────────────────── */

function renderGoalBoard() {
  var el = document.getElementById('goalBoard');
  if (!el) return;
  var goals = getBigGoals().filter(function(g) { return g.status !== 'done'; });
  var cnt = document.getElementById('goalBoardCount');
  if (cnt) cnt.textContent = goals.length ? goals.length + ' 个进行中' : '';

  if (!goals.length) {
    el.innerHTML =
      '<div class="gb-empty" onclick="openGoals()">' +
        '<span class="gb-empty-icon">🎯</span>' +
        '<span>还没有长期目标 — 点击创建你的第一个目标，让 AI 帮你拆解成可执行的阶段计划</span>' +
      '</div>';
    return;
  }

  var html = '';
  for (var i = 0; i < goals.length; i++) {
    var g = goals[i];
    var pr = goalProgress(g);
    var phaseLine = pr.current
      ? '当前阶段：' + escapeHtml(pr.current.name) + (pr.current.focus ? ' · ' + escapeHtml(pr.current.focus) : '')
      : (g.phases && g.phases.length ? '阶段已全部完成 🎉' : '尚未拆解阶段');
    html +=
      '<div class="gb-card' + (g.id === store.activeGoal ? ' gb-active' : '') + '" onclick="openGoals(\'' + g.id + '\')" title="点击查看目标详情">' +
        '<span class="gb-icon">' + g.icon + '</span>' +
        '<div class="gb-main">' +
          '<div class="gb-title-row"><span class="gb-title">' + escapeHtml(g.title) + '</span>' +
            (pr.daysLeft !== null ? '<span class="gb-days">剩 ' + pr.daysLeft + ' 天</span>' : '') +
            (g.status === 'paused' ? '<span class="gb-paused">已暂停</span>' : '') +
          '</div>' +
          '<div class="gb-phase">' + phaseLine + '</div>' +
          '<div class="gb-bar"><div class="gb-bar-fill" style="width:' + pr.pct + '%"></div></div>' +
        '</div>' +
        '<span class="gb-pct">' + pr.pct + '%</span>' +
      '</div>';
  }
  html += '<div class="gb-card gb-add" onclick="openGoals()" title="管理全部目标">＋</div>';
  el.innerHTML = html;
}

/* ═══════════════════════════════════════
   目标管理面板（Goal Overlay）
   ═══════════════════════════════════════ */

var _goalView = { mode: 'list', goalId: null }; /* mode: list | detail | form */

function openGoals(goalId) {
  _goalView.mode = goalId ? 'detail' : 'list';
  _goalView.goalId = goalId || null;
  _openWithAnim('goalOverlay', function() { _renderGoalPanel(); });
  _closeWithAnim('modalOverlay');
  _closeWithAnim('focusOverlay');
  _closeWithAnim('shopOverlay');
  _closeWithAnim('ledgerOverlay');
  _closeWithAnim('accountingOverlay');
  _closeWithAnim('archiveOverlay');
  var cm = document.getElementById('countdownMenu');
  if (cm) cm.classList.remove('show');
}

function closeGoals() { _closeWithAnim('goalOverlay'); }
function closeGoalsIfOverlay(e) {
  if (e.target === document.getElementById('goalOverlay')) closeGoals();
}

function _renderGoalPanel() {
  if (_goalView.mode === 'form') { _renderGoalForm(); return; }
  if (_goalView.mode === 'detail' && _goalView.goalId) { _renderGoalDetail(_goalView.goalId); return; }
  _renderGoalList();
}

/* ── 列表视图 ───────────────────────────── */

function _renderGoalList() {
  var panel = document.getElementById('goalPanel');
  var goals = getBigGoals();

  var html = '<div class="arch-head"><h3>🎯 长期目标</h3>' +
    '<span class="arch-sub">' + goals.length + ' 个目标</span>' +
    '<button class="btn-primary g-new-btn" onclick="openGoalForm()">＋ 新建目标</button>' +
    '<span class="focus-close" onclick="closeGoals()">✕</span></div>';

  if (!goals.length) {
    html += '<div class="g-empty">' +
      '<div class="g-empty-icon">🌱</div>' +
      '<p>人生会有很多目标，把它们一个个种在这里。</p>' +
      '<p class="g-empty-tip">新建目标后点「🤖 AI拆解」，让本地 Claude 帮你拆成阶段与里程碑，粘贴回来即可导入。</p>' +
    '</div>';
    panel.innerHTML = html;
    return;
  }

  for (var i = 0; i < goals.length; i++) {
    var g = goals[i];
    var pr = goalProgress(g);
    var statusTag = g.status === 'done' ? '<span class="g-tag g-tag-done">已完成</span>'
      : g.status === 'paused' ? '<span class="g-tag g-tag-paused">已暂停</span>' : '';
    var sub = [];
    if (g.deadline) sub.push('截止 ' + g.deadline + (pr.daysLeft !== null ? ' · 剩 ' + pr.daysLeft + ' 天' : ''));
    if (g.phases && g.phases.length) sub.push(g.phases.length + ' 个阶段');
    if (pr.totMs) sub.push('里程碑 ' + pr.doneMs + '/' + pr.totMs);
    if (pr.linked.total) sub.push('关联任务 ' + pr.linked.done + '/' + pr.linked.total);
    html +=
      '<div class="g-item" onclick="openGoalDetail(\'' + g.id + '\')">' +
        '<span class="g-item-icon">' + g.icon + '</span>' +
        '<div class="g-item-main">' +
          '<div class="g-item-title">' + escapeHtml(g.title) + statusTag + '</div>' +
          '<div class="g-item-sub">' + escapeHtml(sub.join(' · ') || '未设置截止日期') + '</div>' +
          '<div class="g-bar"><div class="g-bar-fill" style="width:' + pr.pct + '%"></div></div>' +
        '</div>' +
        '<span class="g-item-pct">' + pr.pct + '%</span>' +
      '</div>';
  }
  panel.innerHTML = html;
}

function openGoalDetail(id) {
  _goalView.mode = 'detail';
  _goalView.goalId = id;
  _renderGoalDetail(id);
}

/* ── 详情视图 ───────────────────────────── */

function _renderGoalDetail(id) {
  var panel = document.getElementById('goalPanel');
  var g = getBigGoal(id);
  if (!g) { _renderGoalList(); return; }
  var pr = goalProgress(g);
  var i, j;

  var html = '<div class="arch-head">' +
    '<span class="g-back" onclick="_renderGoalList();_goalView.mode=\'list\'">‹ 返回</span>' +
    '<h3>' + g.icon + ' ' + escapeHtml(g.title) + '</h3>' +
    '<span class="focus-close" onclick="closeGoals()">✕</span></div>';

  /* 统计行 */
  html += '<div class="g-stats">' +
    '<div class="g-stat"><div class="g-stat-num">' + pr.pct + '%</div><div class="g-stat-label">总进度</div></div>' +
    '<div class="g-stat"><div class="g-stat-num">' + pr.doneMs + '/' + pr.totMs + '</div><div class="g-stat-label">里程碑</div></div>' +
    '<div class="g-stat"><div class="g-stat-num">' + (pr.daysLeft !== null ? pr.daysLeft : '—') + '</div><div class="g-stat-label">剩余天数</div></div>' +
    '<div class="g-stat"><div class="g-stat-num">' + pr.linked.done + '/' + pr.linked.total + '</div><div class="g-stat-label">关联任务</div></div>' +
  '</div>';

  if (g.desc) html += '<div class="g-desc">📌 ' + escapeHtml(g.desc) + '</div>';

  /* 阶段 stepper */
  var phases = g.phases || [];
  if (phases.length) {
    html += '<div class="g-stepper">';
    for (i = 0; i < phases.length; i++) {
      var p = phases[i];
      var pp = phaseProgress(p);
      var isCur = pr.current && pr.current.id === p.id;
      var cls = pp >= 100 ? 'g-step-done' : (isCur ? 'g-step-current' : '');
      html += '<div class="g-step ' + cls + '">' +
        '<div class="g-step-dot">' + (pp >= 100 ? '✓' : (i + 1)) + '</div>' +
        '<div class="g-step-name">' + escapeHtml(p.name) + '</div>' +
        '<div class="g-step-pct">' + pp + '%</div>' +
      '</div>';
    }
    html += '</div>';
  }

  /* 各阶段里程碑清单 */
  if (phases.length) {
    for (i = 0; i < phases.length; i++) {
      var ph = phases[i];
      var php = phaseProgress(ph);
      var isCurP = pr.current && pr.current.id === ph.id;
      html += '<div class="g-phase' + (isCurP ? ' g-phase-current' : '') + '" id="gphase-' + ph.id + '">' +
        '<div class="g-phase-head">' +
          '<span class="g-phase-name">' + (isCurP ? '▶ ' : '') + escapeHtml(ph.name) + '</span>' +
          (ph.start || ph.end ? '<span class="g-phase-range">' + (ph.start || '?') + ' ~ ' + (ph.end || '?') + '</span>' : '') +
          '<span class="g-phase-pct">' + php + '%</span>' +
        '</div>' +
        (ph.focus ? '<div class="g-phase-focus">🎯 ' + escapeHtml(ph.focus) + '</div>' : '');
      var ms = ph.milestones || [];
      if (ms.length) {
        html += '<div class="g-ms-list">';
        for (j = 0; j < ms.length; j++) {
          var m = ms[j];
          html += '<div class="g-ms' + (m.done ? ' done' : '') + '" onclick="toggleMilestone(\'' + g.id + '\',\'' + ph.id + '\',\'' + m.id + '\',this)">' +
            '<span class="g-ms-check">' + (m.done ? '✓' : '') + '</span>' +
            '<span class="g-ms-text">' + escapeHtml(m.text) + '</span>' +
          '</div>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
  } else {
    html += '<div class="g-nophase">尚未拆解阶段 — 点击下方「🤖 AI拆解提示词」，把生成的提示词发给本地 Claude，再把返回的 JSON 粘贴到编辑页的导入框即可。</div>';
  }

  /* 操作行 */
  html += '<div class="g-actions">' +
    '<button class="btn-primary" onclick="openGoalForm(\'' + g.id + '\')">✎ 编辑 / 导入JSON</button>' +
    '<button class="btn-primary ai-btn" onclick="_goalAiOpenChat(\'' + g.id + '\')">🤖 AI 拆解调整</button>' +
    '<button class="btn-secondary" onclick="_goalAISyncToday(\'' + g.id + '\')">📅 AI 生成今日任务</button>' +
    (g.status !== 'done'
      ? '<button class="btn-secondary" onclick="setGoalStatus(\'' + g.id + '\',\'done\')">🎓 标记完成</button>'
      : '<button class="btn-secondary" onclick="setGoalStatus(\'' + g.id + '\',\'active\')">↩ 重新激活</button>') +
    (g.status === 'active'
      ? '<button class="btn-secondary" onclick="setGoalStatus(\'' + g.id + '\',\'paused\')">⏸ 暂停</button>'
      : g.status === 'paused'
      ? '<button class="btn-secondary" onclick="setGoalStatus(\'' + g.id + '\',\'active\')">▶ 继续</button>'
      : '') +
    '<button class="btn-secondary g-del" onclick="removeGoalConfirm(\'' + g.id + '\')">🗑 删除</button>' +
  '</div>';

  /* AI 聊天区（目标拆解确认流程）*/
  html += '<div class="g-chat-wrap" id="gChatWrap" style="display:none">' +
    '<div class="g-chat-msgs" id="gChatMsgs"></div>' +
    '<div class="g-chat-input-row">' +
      '<input type="text" class="g-chat-input" id="gChatInput" placeholder="告诉我你的目标或调整要求，如：阶段3太长了，再拆细一点"' +
        ' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();_goalAiChatSend(\'' + g.id + '\');}">' +
      '<button class="btn-primary ai-btn" id="btnGChatSend" onclick="_goalAiChatSend(\'' + g.id + '\')">🤖 发送</button>' +
    '</div>' +
  '</div>';

  panel.innerHTML = html;
}

function setGoalStatus(id, status) {
  updateGoal(id, { status: status });
  if (status === 'done') toast('🎓 恭喜完成目标！它已移入已完成列表', 'ok');
  _renderGoalDetail(id);
  renderGoalBoard();
  renderHeader();
  renderCountdownMenu();
}

function removeGoalConfirm(id) {
  var g = getBigGoal(id);
  if (!g) return;
  if (!confirm('确定删除目标「' + g.title + '」？此操作不可恢复。')) return;
  deleteGoal(id);
  toast('目标已删除', 'err');
  _goalView.mode = 'list';
  _goalView.goalId = null;
  _renderGoalPanel();
  renderGoalBoard();
  renderHeader();
  renderCountdownMenu();
}

/* ── 里程碑勾选（含 XP 正反馈） ─────────── */

function toggleMilestone(goalId, phaseId, msId, el) {
  var g = getBigGoal(goalId);
  if (!g) return;
  var phases = g.phases || [];
  for (var i = 0; i < phases.length; i++) {
    if (phases[i].id !== phaseId) continue;
    var ms = phases[i].milestones || [];
    for (var j = 0; j < ms.length; j++) {
      if (ms[j].id !== msId) continue;
      ms[j].done = !ms[j].done;
      saveBigGoals();
      if (ms[j].done) {
        addBalance(GOAL_MS_REWARD);
        recordTransaction('earn', GOAL_MS_REWARD, '里程碑达成「' + ms[j].text.slice(0, 24) + '」', msId);
        toast('🎉 里程碑达成！+' + GOAL_MS_REWARD + ' XP', 'ok');
      } else {
        setBalance(Math.max(0, getBalance() - GOAL_MS_REWARD));
        recordTransaction('spend', GOAL_MS_REWARD, '里程碑撤销「' + ms[j].text.slice(0, 24) + '」', msId);
      }
      _renderGoalDetail(goalId);
      renderGoalBoard();
      /* 阶段 100% → 撒花 */
      if (ms[j].done && phaseProgress(phases[i]) >= 100) {
        var phEl = document.getElementById('gphase-' + phaseId);
        if (phEl && typeof spawnConfetti === 'function') spawnConfetti(phEl);
        toast('🌟 阶段「' + phases[i].name + '」全部里程碑达成！', 'ok');
      }
      return;
    }
  }
}

/* ── 新建 / 编辑表单 ────────────────────── */

function openGoalForm(id) {
  _goalView.mode = 'form';
  _goalView.goalId = id || null;
  _renderGoalForm();
}

function _renderGoalForm() {
  var panel = document.getElementById('goalPanel');
  var g = _goalView.goalId ? getBigGoal(_goalView.goalId) : null;

  var html = '<div class="arch-head">' +
    '<span class="g-back" onclick="' + (g ? 'openGoalDetail(\'' + g.id + '\')' : '_goalView.mode=\'list\';_renderGoalList()') + '">‹ 返回</span>' +
    '<h3>' + (g ? '✎ 编辑目标' : '＋ 新建目标') + '</h3>' +
    '<span class="focus-close" onclick="closeGoals()">✕</span></div>';

  html += '<div class="g-form">' +
    '<div class="field-row">' +
      '<div class="field g-grow"><label>目标名称 *</label><input type="text" id="gFormTitle" maxlength="60" placeholder="" value="' + escapeHtml(g ? g.title : '') + '"></div>' +
      '<div class="field"><label>图标</label><input type="text" id="gFormIcon" maxlength="4" style="width:64px" value="' + escapeHtml(g ? g.icon : '🎯') + '"></div>' +
    '</div>' +
    '<div class="field-row">' +
      '<div class="field"><label>开始日期</label><input type="date" id="gFormStart" value="' + (g ? (g.startDate || '') : toLocalDate(new Date())) + '"></div>' +
      '<div class="field"><label>截止日期</label><input type="date" id="gFormDeadline" value="' + (g ? (g.deadline || '') : '') + '"></div>' +
    '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label>一句话说明</label><input type="text" id="gFormDesc" maxlength="80" placeholder="如：≥70分 / 高分通过 / 减重5kg" value="' + escapeHtml(g ? g.desc : '') + '"></div>' +
        '<div class="field field-sm"><label>每日最多用时<br><span class="f-hint">完整状态下，分钟</span></label><input type="number" id="gFormDailyMax" min="15" max="480" step="5" style="width:80px" value="' + (g ? (g.dailyMax || 180) : 180) + '"></div>' +
      '</div>' +

    '<div class="field"><label>阶段拆解（可手动填写，或用下方 AI 导入）</label>' +
      '<div id="gPhasesWrap"></div>' +
      '<button class="btn-add-sub" onclick="goalFormAddPhase()">＋ 添加阶段</button>' +
    '</div>' +

    '<div class="g-ai-box">' +
      '<div class="g-ai-title">🤖 AI 辅助拆解</div>' +
      '<div class="g-ai-row">' +
        '<button class="btn-primary ai-btn" onclick="_goalAiOpenChatForm()">🤖 对话拆解目标</button>' +
        '<span class="g-ai-tip">告诉 AI 你的目标，确认后自动填入阶段</span>' +
      '</div>' +
      '<div class="g-chat-wrap" id="gChatWrapForm" style="display:none">' +
        '<div class="g-chat-msgs" id="gChatMsgsForm"></div>' +
        '<div class="g-chat-input-row">' +
          '<input type="text" class="g-chat-input" id="gChatInputForm" placeholder="描述你的目标，或对当前拆解提出调整要求"' +
            ' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();_goalAiChatSendForm();}">' +
          '<button class="btn-primary ai-btn" id="btnGChatSendForm" onclick="_goalAiChatSendForm()">🤖 发送</button>' +
        '</div>' +
      '</div>' +
      '<textarea class="g-import-json" id="gImportJson" placeholder=\'粘贴目标 JSON 快速填充...\'></textarea>' +
    '</div>' +

    '<div class="modal-actions">' +
      '<button class="btn-cancel" onclick="' + (g ? 'openGoalDetail(\'' + g.id + '\')' : '_goalView.mode=\'list\';_renderGoalList()') + '">取消</button>' +
      '<button class="btn-save" onclick="saveGoalForm()">💾 保存目标</button>' +
    '</div>' +
  '</div>';

  panel.innerHTML = html;

  /* 填充阶段行 */
  var phases = g ? (g.phases || []) : [];
  for (var i = 0; i < phases.length; i++) _goalFormAddPhaseRow(phases[i]);
}

function _goalFormReadPhases() {
  var rows = document.querySelectorAll('#gPhasesWrap .g-phase-row');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    out.push({
      name:  rows[i].querySelector('.gp-name').value.trim(),
      focus: rows[i].querySelector('.gp-focus').value.trim(),
      start: rows[i].querySelector('.gp-start').value,
      end:   rows[i].querySelector('.gp-end').value,
      msText: rows[i].querySelector('.gp-ms').value,
    });
  }
  return out;
}

function _goalFormAddPhaseRow(p) {
  var wrap = document.getElementById('gPhasesWrap');
  var row = document.createElement('div');
  row.className = 'g-phase-row';
  var msText = '';
  if (p && p.milestones) {
    var arr = [];
    for (var i = 0; i < p.milestones.length; i++) {
      arr.push(typeof p.milestones[i] === 'string' ? p.milestones[i] : p.milestones[i].text);
    }
    msText = arr.join('\n');
  }
  row.innerHTML =
    '<div class="g-phase-row-head">' +
      '<input type="text" class="gp-name" placeholder="阶段名，如 P1 基础夯实" value="' + escapeHtml(p ? p.name : '') + '">' +
      '<button class="btn-remove" onclick="goalFormRemovePhase(this)" title="删除该阶段">✕</button>' +
    '</div>' +
    '<input type="text" class="gp-focus" placeholder="阶段重点，如 词汇+阅读入门" value="' + escapeHtml(p ? (p.focus || '') : '') + '">' +
    '<div class="g-phase-row-dates">' +
      '<input type="date" class="gp-start" value="' + (p ? (p.start || '') : '') + '">' +
      '<span>~</span>' +
      '<input type="date" class="gp-end" value="' + (p ? (p.end || '') : '') + '">' +
    '</div>' +
    '<textarea class="gp-ms" placeholder="里程碑（可勾选验证的具体成果），每行一条&#10;如：做完3套真题并批改&#10;如：CH1-CH3公式默写全对">' + escapeHtml(msText) + '</textarea>';
  wrap.appendChild(row);
}

function goalFormAddPhase() {
  _goalFormAddPhaseRow(null);
}

function goalFormRemovePhase(btn) {
  btn.closest('.g-phase-row').remove();
}

function saveGoalForm() {
  var title = document.getElementById('gFormTitle').value.trim();
  if (!title) { toast('请输入目标名称', 'err'); return; }

  var rawPhases = _goalFormReadPhases();
  var phases = [];
  for (var i = 0; i < rawPhases.length; i++) {
    var rp = rawPhases[i];
    if (!rp.name && !rp.focus && !rp.msText.trim()) continue;
    var msLines = rp.msText.split('\n');
    var milestones = [];
    for (var j = 0; j < msLines.length; j++) {
      var t = msLines[j].trim();
      if (t) milestones.push({ id: _goalUid('ms'), text: t, done: false });
    }
    phases.push({
      id: _goalUid('p'),
      name: rp.name || ('阶段 ' + (i + 1)),
      focus: rp.focus,
      start: rp.start || '',
      end: rp.end || '',
      milestones: milestones,
    });
  }

  /* 编辑时按文本保留原里程碑的完成状态 */
  var existing = _goalView.goalId ? getBigGoal(_goalView.goalId) : null;
  if (existing) {
    var doneMap = {};
    var oldPhases = existing.phases || [];
    for (i = 0; i < oldPhases.length; i++) {
      var oms = oldPhases[i].milestones || [];
      for (var j2 = 0; j2 < oms.length; j2++) {
        if (oms[j2].done) doneMap[oms[j2].text] = true;
      }
    }
    for (i = 0; i < phases.length; i++) {
      for (j2 = 0; j2 < phases[i].milestones.length; j2++) {
        if (doneMap[phases[i].milestones[j2].text]) phases[i].milestones[j2].done = true;
      }
    }
  }

  var data = {
    title:     title,
    icon:      document.getElementById('gFormIcon').value.trim() || '🎯',
    desc:      document.getElementById('gFormDesc').value.trim(),
    startDate: document.getElementById('gFormStart').value || '',
    deadline:  document.getElementById('gFormDeadline').value || '',
    dailyMax:  parseInt(document.getElementById('gFormDailyMax').value) || 180,
    phases:    phases,
  };

  var saved;
  if (existing) {
    saved = updateGoal(existing.id, data);
    toast('目标已更新', 'ok');
  } else {
    saved = createGoal(data);
    if (!store.activeGoal || !getBigGoal(store.activeGoal)) {
      store.activeGoal = saved.id;
      saveSettings();
    }
    toast('🎯 目标已创建' + (phases.length ? '，含 ' + phases.length + ' 个阶段' : ''), 'ok');
  }

  renderGoalBoard();
  renderHeader();
  renderCountdownMenu();
  openGoalDetail(saved.id);
}

/* ── AI 目标拆解聊天（v8.2） ──── */

var _goalChatCtx = {}; // { goalId: { msgs:[], mode:'decompose'|'daily', _plans:[] } }
var _goalFormChatMsgs = [];
var _currentGoalChatId = null;

function _goalAiOpenChat(goalId) {
  var wrap = document.getElementById('gChatWrap');
  if (!wrap) return;
  wrap.style.display = 'block';
  var ctx = _goalChatCtx[goalId] || { msgs: [], mode: 'decompose' };
  ctx.mode = 'decompose';
  _goalChatCtx[goalId] = ctx;
  _renderGoalChat(goalId, 'detail');
  // auto-focus input
  setTimeout(function(){ var inp = document.getElementById('gChatInput'); if(inp) inp.focus(); }, 150);
}

function _goalAISyncToday(goalId) {
  var g = getBigGoal(goalId);
  if (!g) { toast('目标不存在', 'err'); return; }
  var pr = goalProgress(g);
  if (!pr.current) { toast('当前目标无进行中阶段，请先通过 AI 拆解后在详情页勾选里程碑推进', 'err'); return; }

  var wrap = document.getElementById('gChatWrap');
  if (!wrap) return;
  wrap.style.display = 'block';
  wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  var ctx = _goalChatCtx[goalId] || { msgs: [], mode: 'daily' };
  ctx.msgs = []; // fresh chat for today
  ctx.mode = 'daily';
  _goalChatCtx[goalId] = ctx;

  // 构建今日任务拆解 prompt 并直发 AI
  var prompts = _buildDailyTaskPrompt(g, pr);
  ctx.msgs.push({ role: 'user', text: prompts.userText });
  _renderGoalChat(goalId, 'detail');

  var cfg = getApiConfig();
  var btn = document.getElementById('btnGChatSend');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
  _callAiDirect(cfg, prompts.aiPrompt, '', function(err, result) {
    if (btn) { btn.disabled = false; btn.textContent = '🤖 发送'; }
    if (result) {
      var plan = _parseDailyJson(result.content);
      if (plan && plan.blocks && plan.blocks.length) {
        ctx.msgs.push({ role: 'assistant', text: plan.blocks.length + ' 个今日任务', plan: plan, usage: result.usage, elapsed: result.elapsed, forToday: true });
      } else {
        ctx.msgs.push({ role: 'assistant', text: 'AI 返回格式异常，请重试。「' + (result.content || '').slice(0, 80) + '...」' });
      }
    } else {
      ctx.msgs.push({ role: 'assistant', text: '⚠ AI 请求失败，请检查 Key 配置' });
    }
    _renderGoalChat(goalId, 'detail');
  });
}

function _buildDailyTaskPrompt(g, pr) {
  var today = toLocalDate(new Date());
  var modeCfg = getModeCfg();
  var curMode = modeCfg[store.mode] || modeCfg.full;
  var phase = pr.current;

  var undoneMs = (phase.milestones || []).filter(function(m) { return !m.done; });
  var msText = undoneMs.map(function(m, i) { return (i+1) + '. ' + m.text; }).join('\n');

  var sched = store.schedules[today];
  var existingTasks = '';
  var existingTotal = 0;
  if (sched && sched.blocks && sched.blocks.length) {
    existingTasks = '今日已有任务：\n';
    for (var i = 0; i < sched.blocks.length; i++) {
      var b = sched.blocks[i];
      existingTasks += '- ' + b.subject + '（' + (b.duration || 30) + ' 分钟）\n';
      existingTotal += (b.duration || 30);
    }
  }

  // 每日每目标上限：使用该目标设置的 dailyMax（默认 180 分钟），按档位调整。
  var dailyMax = g.dailyMax || 180;
  var dailyCap = Math.round(dailyMax * curMode.factor);
  dailyCap = Math.max(15, Math.min(dailyMax, dailyCap));
  // 减去已有任务耗时
  var remaining = Math.max(0, dailyCap - existingTotal);

  var userText = '帮我规划今天（' + today + '）的任务：目标「' + g.title + '」，' +
    undoneMs.length + ' 个待办里程碑，档位 ' + curMode.label + '，每日上限 ' + dailyCap + ' 分钟';

  var aiPrompt = '你是一个 ADHD 友好的每日计划助手。请为一个正在备考的学习者精确生成今天的任务清单。\n\n' +
    '=== 目标上下文 ===\n' +
    '🎯 长期目标：' + g.title + '\n' +
    (g.desc ? '期望成果：' + g.desc + '\n' : '') +
    (g.deadline ? '截止日期：' + g.deadline + '（剩余 ' + pr.daysLeft + ' 天）\n' : '') +
    '总进度：' + pr.pct + '%\n' +
    '当前阶段：' + phase.name + (phase.focus ? ' — ' + phase.focus : '') + '\n\n' +
    '未完成里程碑（' + undoneMs.length + ' 个）：\n' + msText + '\n\n' +
    '=== 今日时间 ===\n' +
    '档位：' + curMode.label + '（系数 ' + curMode.factor + '，约 ' + curMode.hours + '）\n' +
    '每日该目标的时间上限：**' + dailyCap + ' 分钟（必须严格遵守，不能超过）**\n' +
    (existingTotal > 0 ? '已有任务总时长 ' + existingTotal + ' 分钟，剩余可用 ' + remaining + ' 分钟\n' + existingTasks : '今日尚无任务\n') + '\n' +
    '=== 学习规律（必须遵守） ===\n' +
    '1. 每个任务 15-60 分钟，单任务不得超过 60 分钟（超过 60 分钟的必须拆成独立子任务）\n' +
    '2. 任务之间要有逻辑顺序：热身/复习（10-15min）→ 核心学习（30-40min）→ 练习/巩固（20-30min）→ 简短复盘（10-15min）\n' +
    '3. 不同技能交替排布（如：阅读 → 听力 → 口语/写作 穿插，不要连续做同类型 2 小时）\n' +
    '4. 每个里程碑只取对应今天适量的一部分，不要试图一天做完一个里程碑\n' +
    '5. 如果里程碑很多，只选最重要的 **2-3 个**，其余留给明天\n' +
    '\n=== 输出要求 ===\n' +
    '1. 只输出 JSON，格式：{"blocks":[{"subject":"任务名","duration":30,"category":"study","priority":"high","goalId":"' + g.id + '","phase":"' + phase.name + '","flowHint":"第一步动作","subtasks":[{"text":"子任务","estMin":15}]}]}\n' +
    '2. 所有任务 duration 加起来 **不得超过 ' + dailyCap + ' 分钟**。请在输出前校验总量。\n' +
    '3. subject 格式：用 emoji 前缀标明类型（如 📖 阅读 / 🎧 听力 / ✍️ 写作 / 📝 练习 / 🔄 复习）\n' +
    '4. flowHint 写 ADHD 友好的第一步具体动作，如"打开书翻到 XX 页→读第一段→划关键词"\n' +
    '5. 每个 task 拆 2-3 个 subtasks，符合「启动→主体→检查」三段式\n' +
    '6. 末尾可加一个 10-15 分钟的「复盘」任务\n' +
    '7. 不输出 routines。';

  return { userText: userText, aiPrompt: aiPrompt, dailyCap: dailyCap };
}

function _goalAiOpenChatForm() {
  var wrap = document.getElementById('gChatWrapForm');
  if (!wrap) return;
  wrap.style.display = 'block';
  // form-mode 用 '_form_' 做统一缓存 key
  if (!_goalChatCtx['_form_']) _goalChatCtx['_form_'] = { msgs: _goalFormChatMsgs, _plans: [], mode: 'decompose' };
  _renderGoalChat('_form_', 'form');
}

function _renderGoalChat(goalId, mode) {
  var isDetail = mode === 'detail';
  var msgsId = isDetail ? 'gChatMsgs' : 'gChatMsgsForm';
  var el = document.getElementById(msgsId);
  if (!el) return;
  if (goalId) _currentGoalChatId = goalId;

  var msgs = isDetail ? ((_goalChatCtx[goalId] || {}).msgs || []) : ((_goalChatCtx['_form_'] || {}).msgs || _goalFormChatMsgs);
  var chatMode = isDetail ? ((_goalChatCtx[goalId] || {}).mode || 'decompose') : ((_goalChatCtx['_form_'] || {}).mode || 'decompose');

  var html = '';
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    if (m.role === 'user') {
      html += '<div class="g-chat-msg g-chat-msg-user"><div class="g-chat-bubble">' + escapeHtml(m.text) + '</div></div>';
    } else if (m.role === 'assistant') {
      html += '<div class="g-chat-msg g-chat-msg-ai"><div class="g-chat-bubble">';
      if (m.plan) {
        if (chatMode === 'daily' && m.plan.blocks) {
          html += _renderDailyPlanPreview(m.plan);
        } else {
          html += _renderGoalPlanPreview(m.plan);
        }
      } else {
        html += escapeHtml(m.text || 'AI 正在思考...');
      }
      html += '</div></div>';
      if (m.usage) html += '<div class="g-chat-meta">' + m.usage.total_tokens + ' tokens · ' + (m.elapsed || '?') + 's</div>';
    }
  }
  if (!msgs.length) {
    html = '<div class="g-chat-empty">🤖 ' + (chatMode === 'daily' ? '点击「📅 AI 生成今日任务」会自动帮你拆解今天的任务' : '描述你的目标，AI 会拆解成阶段和里程碑，确认后采纳') + '</div>';
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
}

function _renderDailyPlanPreview(plan) {
  var chatId = _currentGoalChatId || '_form_';
  var ctx = _goalChatCtx[chatId] || {};
  if (!ctx._plans) ctx._plans = [];
  var pi = ctx._plans.length;
  ctx._plans.push(plan);

  // 计算当前档位上限
  var goal = getBigGoal(_currentGoalChatId);
  var baseMax = goal ? (goal.dailyMax || 180) : 180;
  var modeCfg = getModeCfg();
  var modes = ['full', 'minimum', 'recovery'];
  var curDailyCap = Math.max(15, Math.round(baseMax * (modeCfg[store.mode] || modeCfg.full).factor));

  var blocks = plan.blocks || [];
  var totalDur = 0;
  for (var i = 0; i < blocks.length; i++) { totalDur += blocks[i].duration || 30; }

  var html = '<div class="g-plan-preview"><strong>📅 今日任务清单</strong>' +
    ' <span style="font-size:.72rem;color:var(--text-secondary)">' +
    '共 ' + blocks.length + ' 项 · ' + totalDur + ' min' +
    (totalDur > curDailyCap ? ' <span style="color:var(--red)">⚠ 超上限</span>' : '') +
    '</span></div>';

  // ── 三档位快捷切换（仅影响采纳时的截断阈值，不重新调 AI） ──
  html += '<div class="g-plan-mode-row"><span class="g-plan-mode-label">采纳上限：</span>';
  for (var mi = 0; mi < modes.length; mi++) {
    var cap = Math.max(15, Math.round(baseMax * (modeCfg[modes[mi]] || modeCfg.full).factor));
    html += '<button class="g-plan-mode-btn' + (store.mode === modes[mi] ? ' active' : '') +
      '" onclick="_goalSetAdoptMode(\'' + modes[mi] + '\',' + pi + ',\'' + _currentGoalChatId + '\')" title="以「' +
      (modeCfg[modes[mi]] || {}).label + '」档位截断（≤' + cap + 'min）">' +
      (modeCfg[modes[mi]] || {}).label + ' ≤' + cap + 'min</button>';
  }
  html += '</div>';

  // ── 可编辑任务清单 ──
  html += '<div class="g-plan-edit-list" id="gPlanEditList' + pi + '">';
  if (blocks.length) {
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      html += '<div class="g-plan-edit-row" data-plan-idx="' + pi + '" data-item-idx="' + i + '">' +
        '<input type="text" class="g-plan-edit-subject" value="' + escapeHtml(b.subject || '') + '" placeholder="任务名">' +
        '<input type="number" class="g-plan-edit-dur" value="' + (b.duration || 30) + '" min="5" max="480" step="5" style="width:60px" title="分钟">' +
        '<button class="btn-remove" onclick="_goalRemovePlanRow(this,' + pi + ')" title="移除此任务">✕</button>' +
      '</div>';
    }
  }
  html += '<button class="btn-add-sub" onclick="_goalAddPlanRow(' + pi + ')">＋ 添加任务</button>' +
    '</div>';

  html += '<div class="g-plan-actions">' +
    '<button class="btn-primary" onclick="_goalAdoptDailyPlan(' + pi + ')">✅ 采纳并导入</button>' +
  '</div></div>';
  return html;
}

function _goalSetAdoptMode(mode, planIdx, goalId) {
  // 先把当前 DOM 里的编辑保存到缓存 plan
  _goalSaveEditsToPlan(planIdx);
  store.mode = mode;
  LS.set('mode', mode);
  // 只更新模式按钮高亮和上限提示，不调用 renderAll（会重建 DOM 丢失编辑）
  var seg = document.getElementById('modeSeg');
  if (seg) {
    var cfg = getModeCfg();
    var btns = seg.querySelectorAll('button');
    for (var i = 0; i < btns.length; i++) {
      var btnMode = MODE_ORDER[i];
      if (btnMode === mode) btns[i].classList.add('active');
      else btns[i].classList.remove('active');
    }
  }
  // 更新预览中的按钮高亮
  var el = document.querySelector('.g-plan-mode-row');
  if (el) {
    var goal = getBigGoal(goalId);
    var baseMax = goal ? (goal.dailyMax || 180) : 180;
    var modeCfg = getModeCfg();
    var modes = ['full', 'minimum', 'recovery'];
    el.innerHTML = '<span class="g-plan-mode-label">采纳上限：</span>';
    for (var mi = 0; mi < modes.length; mi++) {
      var cap = Math.max(15, Math.round(baseMax * (modeCfg[modes[mi]] || modeCfg.full).factor));
      el.innerHTML += '<button class="g-plan-mode-btn' + (mode === modes[mi] ? ' active' : '') +
        '" onclick="_goalSetAdoptMode(\'' + modes[mi] + '\',' + planIdx + ',\'' + goalId + '\')">' +
        (modeCfg[modes[mi]] || {}).label + ' ≤' + cap + 'min</button>';
    }
  }
  renderMode();
}

function _goalSaveEditsToPlan(planIdx) {
  var chatId = _currentGoalChatId || '_form_';
  var ctx = _goalChatCtx[chatId] || {};
  var plan = (ctx._plans || [])[planIdx];
  if (!plan) return;
  var list = document.getElementById('gPlanEditList' + planIdx);
  if (!list) return;  // DOM 不存在时不去覆盖 plan.blocks
  var rows = list.querySelectorAll(':scope > .g-plan-edit-row');
  var newBlocks = [];
  for (var i = 0; i < rows.length; i++) {
    var subjInput = rows[i].querySelector('.g-plan-edit-subject');
    var durInput = rows[i].querySelector('.g-plan-edit-dur');
    var subj = (subjInput ? subjInput.value : '').trim();
    if (!subj) continue;
    newBlocks.push({
      subject: subj,
      duration: parseInt(durInput ? durInput.value : '') || 30,
    });
  }
  plan.blocks = newBlocks;
}

function _goalRemovePlanRow(btn, planIdx) {
  var row = btn.closest('.g-plan-edit-row');
  if (row) row.remove();
}

function _goalAddPlanRow(planIdx) {
  var list = document.getElementById('gPlanEditList' + planIdx);
  if (!list) return;
  var idx = list.querySelectorAll('.g-plan-edit-row').length;
  list.insertAdjacentHTML('beforeend',
    '<div class="g-plan-edit-row" data-plan-idx="' + planIdx + '" data-item-idx="' + idx + '">' +
      '<input type="text" class="g-plan-edit-subject" value="" placeholder="新任务名">' +
      '<input type="number" class="g-plan-edit-dur" value="30" min="5" max="480" step="5" style="width:60px">' +
      '<button class="btn-remove" onclick="_goalRemovePlanRow(this,' + planIdx + ')">✕</button>' +
    '</div>'
  );
}

function _goalAdoptDailyPlan(pi) {
  var chatId = _currentGoalChatId || '_form_';
  var ctx = _goalChatCtx[chatId] || {};
  var plan = (ctx._plans || [])[pi];
  if (!plan) { toast('数据丢失，请重新生成', 'err'); return; }

  // 先把 DOM 里的用户编辑同步到 plan，后续统一从 plan.blocks 读
  _goalSaveEditsToPlan(pi);
  var today = store.currentDate;
  var cleaned = [];
  var seen = {};
  var srcBlocks = plan.blocks || [];
  for (var i = 0; i < srcBlocks.length; i++) {
    var subj = (srcBlocks[i].subject || '').trim();
    if (!subj) continue;
    if (seen[subj.toLowerCase()]) continue;
    seen[subj.toLowerCase()] = true;
    cleaned.push({
      subject: subj,
      duration: Math.max(5, Math.min(480, srcBlocks[i].duration || 30)),
      category: 'study',
      priority: 'high',
      goalId: _currentGoalChatId || '',
      phase: '',
      flowHint: '',
      subtasks: [],
    });
  }

  // 兜底截断：按目标的 dailyMax 硬限制
  var goal = getBigGoal(_currentGoalChatId);
  var dailyCap = Math.round((goal && goal.dailyMax || 180) * (getModeCfg()[store.mode] || getModeCfg().full).factor);
  dailyCap = Math.max(15, dailyCap);
  var totalC = 0;
  var capped = [];
  for (var ci = 0; ci < cleaned.length; ci++) {
    if (totalC + (cleaned[ci].duration || 30) > dailyCap) break;
    totalC += (cleaned[ci].duration || 30);
    capped.push(cleaned[ci]);
  }
  var dropped = cleaned.length - capped.length;
  cleaned = capped;

  var existing = store.schedules[today];
  var existingBlocks = (existing && existing.blocks) ? existing.blocks : [];
  var merged = existingBlocks.slice();
  for (var j = 0; j < cleaned.length; j++) {
    var dup2 = false;
    for (var k = 0; k < existingBlocks.length; k++) {
      if ((existingBlocks[k].subject || '').trim() === cleaned[j].subject) { dup2 = true; break; }
    }
    if (!dup2) merged.push(cleaned[j]);
  }

  store.schedules[today] = buildScheduleObject(today, { dayMode: store.mode, blocks: merged, encouragement: pickEncouragementSeeded(today, store.mode) });
  saveSchedules();
  syncPlanToServer(today);
  store._tlFresh = true;
  renderAll();
  toast('📅 已导入 ' + cleaned.length + ' 个今日任务' + (dropped ? '（' + dropped + ' 个因超 ' + dailyCap + ' 分钟上限被自动裁切）' : ''), 'ok');
}

function _renderGoalPlanPreview(plan) {
  // 暂存到聊天缓存，用索引引用，避免 escapeHtml 破坏 JSON
  var chatId = _currentGoalChatId || '_form_';
  var ctx = _goalChatCtx[chatId] || {};
  if (!ctx._plans) ctx._plans = [];
  var pi = ctx._plans.length;
  ctx._plans.push(plan);

  var html = '<div class="g-plan-preview"><strong>🎯 ' + escapeHtml(plan.title || '目标') + '</strong>';
  if (plan.deadline) html += ' · 截止 ' + escapeHtml(plan.deadline);
  if (plan.desc) html += '<div class="g-plan-desc">' + escapeHtml(plan.desc) + '</div>';

  var phases = plan.phases || [];
  if (phases.length) {
    html += '<div class="g-plan-phases">共 ' + phases.length + ' 个阶段：<ol>';
    for (var i = 0; i < phases.length; i++) {
      var p = phases[i];
      html += '<li><strong>' + escapeHtml(p.name) + '</strong>';
      if (p.start || p.end) html += ' <span class="g-plan-dates">(' + escapeHtml(p.start || '') + ' → ' + escapeHtml(p.end || '') + ')</span>';
      if (p.focus) html += ' — ' + escapeHtml(p.focus);
      var ms = p.milestones || [];
      if (ms.length) {
        html += '<ul>';
        for (var j = 0; j < ms.length; j++) {
          html += '<li>' + escapeHtml(typeof ms[j] === 'string' ? ms[j] : ms[j].text) + '</li>';
        }
        html += '</ul>';
      }
      html += '</li>';
    }
    html += '</ol></div>';
  }
  html += '<div class="g-plan-actions"><button class="btn-primary" onclick="_goalAdoptPlan(' + pi + ')">✅ 采纳并导入</button></div>';
  return html + '</div>';
}

function _goalAdoptPlan(pi) {
  var chatId = _currentGoalChatId || '_form_';
  var ctx = _goalChatCtx[chatId] || {};
  var plan = (ctx._plans || [])[pi];
  if (!plan) { toast('数据丢失，请重新生成', 'err'); return; }
  plan.startDate = plan.startDate || toLocalDate(new Date());
  var goal = importBigGoalData(plan);
  // 清理聊天状态
  _goalChatCtx = {};
  _goalFormChatMsgs = [];
  // 刷新并打开详情
  renderAll();
  openGoalDetail(goal.id);
  toast('🎯 目标「' + goal.title + '」已导入（' + (goal.phases || []).length + ' 个阶段）', 'ok');
}

function _goalAiChatSend(goalId) {
  var input = document.getElementById('gChatInput');
  var text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  var btn = document.getElementById('btnGChatSend');

  var ctx = _goalChatCtx[goalId] || { msgs: [] };
  _goalChatCtx[goalId] = ctx;
  ctx.msgs.push({ role: 'user', text: text });
  _renderGoalChat(goalId, 'detail');

  // 拼接目标上下文
  var g = getBigGoal(goalId);
  var prompt = _buildGoalChatPrompt(g, text, ctx);

  btn.disabled = true; btn.textContent = '⏳';
  var cfg = getApiConfig();
  _callAiDirect(cfg, prompt, '', function(err, result) {
    btn.disabled = false; btn.textContent = '🤖 发送';
    if (result) {
      var plan = _parseGoalJson(result.content);
      if (plan) {
        ctx.msgs.push({ role: 'assistant', text: '已拆解 ' + (plan.phases ? plan.phases.length : '?') + ' 个阶段', plan: plan, usage: result.usage, elapsed: result.elapsed });
      } else {
        ctx.msgs.push({ role: 'assistant', text: '格式异常，请重试。' + (result.content || '').slice(0, 60) });
      }
    } else {
      ctx.msgs.push({ role: 'assistant', text: '⚠ AI 请求失败，请检查 Key 配置' });
    }
    _renderGoalChat(goalId, 'detail');
  });
}

function _goalAiChatSendForm() {
  var input = document.getElementById('gChatInputForm');
  var text = (input.value || '').trim();
  if (!text) return;
  input.value = '';
  var btn = document.getElementById('btnGChatSendForm');

  // form 聊天使用统一缓存
  var ctx = _goalChatCtx['_form_'] || { msgs: _goalFormChatMsgs, _plans: [], mode: 'decompose' };
  _goalChatCtx['_form_'] = ctx;
  ctx.msgs.push({ role: 'user', text: text });
  _renderGoalChat('_form_', 'form');

  var title = document.getElementById('gFormTitle').value.trim() || '';
  var desc  = document.getElementById('gFormDesc').value.trim() || '';
  var deadline = document.getElementById('gFormDeadline').value || '';

  var prompt = _buildGoalChatPrompt({title: title || '我的长期目标', desc: desc, deadline: deadline}, text, ctx);
  btn.disabled = true; btn.textContent = '⏳';
  var cfg = getApiConfig();
  _callAiDirect(cfg, prompt, '', function(err, result) {
    btn.disabled = false; btn.textContent = '🤖 发送';
    if (result) {
      var plan = _parseGoalJson(result.content);
      if (plan) {
        ctx.msgs.push({ role: 'assistant', text: '已拆解 ' + (plan.phases ? plan.phases.length : '?') + ' 个阶段', plan: plan, usage: result.usage, elapsed: result.elapsed });
      } else {
        ctx.msgs.push({ role: 'assistant', text: '格式异常，请重试。' + (result.content || '').slice(0, 60) });
      }
    } else {
      ctx.msgs.push({ role: 'assistant', text: '⚠ AI 请求失败，请检查 Key 配置' });
    }
    _renderGoalChat('_form_', 'form');
  });
}

function _buildGoalChatPrompt(goal, latestMsg, ctx) {
  var modeCfg = getModeCfg();
  var today = toLocalDate(new Date());
  var existingPhases = goal && goal.phases && goal.phases.length ? goal.phases : null;

  var base = '你是一个目标规划助手。根据用户描述，把长期目标拆解为可执行的阶段计划。输出 JSON。\n\n';
  base += '=== 当前目标 ===\n';
  base += '目标名称：' + (goal ? (goal.title || '我的长期目标') : '待定') + '\n';
  if (goal && goal.desc) base += '说明：' + goal.desc + '\n';
  if (goal && goal.deadline) {
    var dl = goal.deadline;
    var daysLeft = _goalDaysBetween(today, dl);
    base += '截止日期：' + dl + '（剩余 ' + daysLeft + ' 天）\n';
  }
  base += '今天：' + today + '\n\n';

  base += '=== 现有阶段（如有，可修改调整） ===\n';
  if (existingPhases) {
    for (var i = 0; i < existingPhases.length; i++) {
      var p = existingPhases[i];
      var doneMs = (p.milestones || []).filter(function(m){ return m.done; }).length;
      var totalMs = (p.milestones || []).length;
      base += '- ' + p.name + '（' + p.start + ' → ' + p.end + '）里程碑 ' + doneMs + '/' + totalMs + '\n';
    }
  } else {
    base += '（尚未拆解，请从零创建）\n';
  }

  base += '\n=== 档位与可用时间 ===\n';
  var keys = ['full', 'minimum', 'recovery'];
  for (var k = 0; k < keys.length; k++) {
    var mc = modeCfg[keys[k]];
    base += mc.label + '：约 ' + mc.hours + '/天（系数 ' + mc.factor + '）\n';
  }
  base += '任务量应根据剩余天数和档位设置合理分配。\n\n';

  base += '=== 对话历史 ===\n';
  var msgs = ctx.msgs || [];
  for (var m = 0; m < msgs.length; m++) {
    base += (msgs[m].role === 'user' ? '用户' : 'AI') + '：' + msgs[m].text.slice(0, 200) + '\n';
  }

  base += '\n=== 输出要求 ===\n';
  base += '1. 只输出 JSON，格式：{"title":"目标名","icon":"🎯","desc":"说明","startDate":"' + today + '","deadline":"...","phases":[{"name":"阶段名","focus":"重点（一句话）","start":"YYYY-MM-DD","end":"YYYY-MM-DD","milestones":["具体可勾选的里程碑1","里程碑2"]}]}\n';
  base += '2. 3-8 个阶段，覆盖完整路径，阶段不重叠、时间衔接。\n';
  base += '3. 每阶段 2-5 个里程碑：必须具体可验证（如"做完3套真题并批改"），不写抽象口号。\n';
  base += '4. ADHD 友好：前几个阶段启动门槛要低，里程碑小到"下一步就能做"。\n';
  base += '5. 结合剩余天数合理分配每个阶段时长，并据此设定每日任务量标准。\n';

  return base;
}

/** 解析 AI 返回的每日任务 JSON（{blocks: [...]}），不要求 title/phases */
function _parseDailyJson(content) {
  try {
    var t = content || '';
    var m = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) t = m[1];
    var s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
    var plan = JSON.parse(t);
    if (!plan.blocks || !plan.blocks.length) return null;
    // 规范化 subasks
    plan.blocks.forEach(function(b) {
      b.subtasks = (b.subtasks || []).map(function(st) {
        return typeof st === 'string' ? { text: st, done: false, estMin: 25 } : st;
      });
    });
    return plan;
  } catch (e) { return null; }
}

function _parseGoalJson(content) {
  try {
    var t = content || '';
    var m = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) t = m[1];
    var s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
    var plan = JSON.parse(t);
    if (!plan.title) return null;
    if (!plan.phases || !plan.phases.length) return null;
    // 规范化：确保 milestones 是对象数组
    plan.phases.forEach(function(p) {
      p.milestones = (p.milestones || []).map(function(ms, mi) {
        return typeof ms === 'string' ? { id: 'ms_' + Date.now() + '_' + mi, text: ms, done: false } : ms;
      });
      p.id = p.id || ('ph_' + Date.now() + '_' + Math.random().toString(36).slice(2,8));
    });
    return plan;
  } catch (e) { return null; }
}

/* ── 同步目标到今日时间轴 ──────────── */

function _goalSyncToTimeline(goalId) {
  var g = getBigGoal(goalId);
  if (!g) { toast('目标不存在', 'err'); return; }
  var pr = goalProgress(g);
  if (!pr.current) { toast('当前目标无进行中阶段，请先通过 AI 拆解后在详情页勾选里程碑推进', 'err'); return; }

  var phase = pr.current;
  var undoneMs = (phase.milestones || []).filter(function(m) { return !m.done; });
  if (!undoneMs.length) { toast('当前阶段全部里程碑已完成 🎉 请在详情页手动推进到下一阶段', 'ok'); return; }

  var toSync = undoneMs.slice(0, 5);
  var blocks = toSync.map(function(m) {
    return {
      subject: '[' + g.title.split(' ')[0] + '] ' + m.text,
      duration: 30,
      category: 'study',
      priority: 'high',
      goalId: g.id,
      phase: phase.name,
      flowHint: '打开相关材料，找到「' + (phase.focus || m.text) + '」对应的部分，先看第一页',
      subtasks: [{ text: m.text, estMin: 25 }],
    };
  });

  var modeCfg = getModeCfg();
  var curMode = modeCfg[store.mode] || modeCfg.full;
  var factor = curMode.factor || 1;
  for (var i = 0; i < blocks.length; i++) {
    blocks[i].duration = Math.max(10, Math.round(blocks[i].duration * factor / 5) * 5);
  }

  var today = store.currentDate;
  // 兜底截断：按目标的 dailyMax 硬限制
  var goal = getBigGoal(_currentGoalChatId);
  var dailyCap = Math.round((goal && goal.dailyMax || 180) * (getModeCfg()[store.mode] || getModeCfg().full).factor);
  dailyCap = Math.max(15, dailyCap);
  var totalC = 0;
  var capped = [];
  for (var ci = 0; ci < cleaned.length; ci++) {
    if (totalC + (cleaned[ci].duration || 30) > dailyCap) break;
    totalC += (cleaned[ci].duration || 30);
    capped.push(cleaned[ci]);
  }
  var dropped = cleaned.length - capped.length;
  cleaned = capped;

  var existing = store.schedules[today];
  var existingBlocks = (existing && existing.blocks) ? existing.blocks : [];
  var filtered = [];
  for (var j = 0; j < blocks.length; j++) {
    var dup = false;
    for (var k = 0; k < existingBlocks.length; k++) {
      if ((existingBlocks[k].subject || '').trim() === (blocks[j].subject || '').trim()) { dup = true; break; }
    }
    if (!dup) filtered.push(blocks[j]);
  }

  if (!filtered.length) { toast('当前阶段的里程碑已全部同步到今日任务，无新增', 'ok'); return; }

  var mergedBlocks = existingBlocks.concat(filtered);
  store.schedules[today] = buildScheduleObject(today, { dayMode: store.mode, blocks: mergedBlocks, encouragement: pickEncouragementSeeded(today, store.mode) });
  saveSchedules();
  syncPlanToServer(today);
  store._tlFresh = true;
  renderAll();
  toast('📅 已同步 ' + filtered.length + ' 个里程碑到今日任务', 'ok');
}

/* ── 旧兼容函数（保留签名，内部 redirect 到 AI 聊天） ── */

function generateGoalPrompt(goalId) {
  // 已废弃：直接打开 AI 聊天
  _goalAiOpenChat(goalId || null);
}

function copyGoalPrompt() { toast('请直接在 AI 聊天框中对话', 'ok'); }

/* ── 给 generatePrompt 用的目标上下文 ───── */

/**
 * 从手动粘贴的 JSON 解析并填充新建目标表单（编辑页内）。
 * 仍可从下方 textarea 粘贴 JSON 快速填充。
 */
function fillGoalFormFromJson() {
  var ta = document.getElementById('gImportJson');
  if (!ta || !ta.value.trim()) { toast('请先粘贴目标 JSON', 'err'); return; }
  var data;
  try { data = JSON.parse(ta.value); }
  catch (e) { toast('JSON 格式有误：' + e.message, 'err'); return; }
  if (!data.title || !data.phases) { toast('需要包含 title 和 phases 字段', 'err'); return; }

  document.getElementById('gFormTitle').value = data.title || '';
  if (data.icon) document.getElementById('gFormIcon').value = data.icon;
  if (data.desc !== undefined) document.getElementById('gFormDesc').value = data.desc;
  if (data.startDate) document.getElementById('gFormStart').value = data.startDate;
  if (data.deadline) document.getElementById('gFormDeadline').value = data.deadline;

  document.getElementById('gPhasesWrap').innerHTML = '';
  for (var i = 0; i < data.phases.length; i++) _goalFormAddPhaseRow(data.phases[i]);
  toast('✅ 已解析 ' + data.phases.length + ' 个阶段，检查无误后点「保存目标」', 'ok');
}

/** 从任意来源（如每日计划导入框）导入一个完整目标 JSON */
function importBigGoalData(data) {
  var phases = [];
  var raw = data.phases || [];
  for (var i = 0; i < raw.length; i++) {
    var p = raw[i];
    var ms = [];
    var rawMs = p.milestones || [];
    for (var j = 0; j < rawMs.length; j++) {
      ms.push({
        id: _goalUid('ms'),
        text: typeof rawMs[j] === 'string' ? rawMs[j] : (rawMs[j].text || ''),
        done: !!(rawMs[j] && rawMs[j].done),
      });
    }
    phases.push({
      id: p.id || _goalUid('p'),
      name: p.name || ('阶段 ' + (i + 1)),
      focus: p.focus || '',
      start: p.start || '',
      end: p.end || '',
      milestones: ms,
    });
  }

  /* 同 id 或同标题 → 更新，否则新建 */
  var existing = null;
  var goals = getBigGoals();
  for (i = 0; i < goals.length; i++) {
    if ((data.id && goals[i].id === data.id) || goals[i].title === data.title) { existing = goals[i]; break; }
  }

  var saved;
  if (existing) {
    saved = updateGoal(existing.id, {
      title: data.title, icon: data.icon || existing.icon,
      desc: data.desc !== undefined ? data.desc : existing.desc,
      deadline: data.deadline || existing.deadline,
      startDate: data.startDate || existing.startDate,
      phases: phases,
    });
  } else {
    saved = createGoal({
      title: data.title, icon: data.icon, desc: data.desc,
      deadline: data.deadline, startDate: data.startDate, phases: phases,
    });
  }
  if (!store.activeGoal || !getBigGoal(store.activeGoal)) {
    store.activeGoal = saved.id;
    saveSettings();
  }
  return saved;
}

/* ── 给 generatePrompt 用的目标上下文 ───── */

function buildGoalsPromptSection() {
  var goals = getBigGoals().filter(function(g) { return g.status === 'active'; });
  if (!goals.length) return '【长期目标】（用户尚未设定，可在 blocks 中省略 goalId）\n';
  var s = '【进行中的长期目标】\n';
  for (var i = 0; i < goals.length; i++) {
    var g = goals[i];
    var pr = goalProgress(g);
    s += '- ' + g.icon + ' ' + g.title + '（goalId: "' + g.id + '"）';
    if (g.deadline) s += ' | 截止 ' + g.deadline + ' 剩 ' + pr.daysLeft + ' 天';
    s += ' | 总进度 ' + pr.pct + '%\n';
    if (pr.current) {
      s += '  当前阶段: ' + pr.current.name + (pr.current.focus ? '（' + pr.current.focus + '）' : '');
      if (pr.current.end) s += ' | 阶段截止 ' + pr.current.end;
      s += '\n';
      var ms = pr.current.milestones || [];
      var remaining = [];
      for (var j = 0; j < ms.length; j++) if (!ms[j].done) remaining.push(ms[j].text);
      if (remaining.length) s += '  未完成里程碑: ' + remaining.slice(0, 3).join('；') + '\n';
    }
  }
  return s;
}
