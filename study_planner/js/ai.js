/* ═══════════════════════════════════════
   ai.js — AI 助手抽屉面板（v9.0）

   单一入口：右下角悬浮按钮 + Shift+Space 快捷键
   右侧滑入抽屉，支持拖拽调整宽度
   对话历史按日期存储到服务器
   ═══════════════════════════════════════ */
'use strict';

/* ── State ── */
var _aiOpen = false;
var _aiWidth = 380;
var _aiMsgs = [];          // 当前对话
var _aiLoading = false;
var _aiPendingPlan = null; // AI 刚返回的任务预览

/* ── 初始化 ── */
function initAiDrawer() {
  if (document.getElementById('aiDrawer')) return;

  // 创建浮层 HTML
  var el = document.createElement('div');
  el.id = 'aiDrawer';
  el.className = 'ai-drawer';
  el.innerHTML =
    '<div class="ai-resize-handle" id="aiResizeHandle"></div>' +
    '<div class="ai-inner">' +
      '<div class="ai-head">' +
        '<span class="ai-head-title">🤖 AI 助手</span>' +
        '<div class="ai-head-actions">' +
          '<button class="ai-head-btn" onclick="aiClearChat()" title="清空对话">🗑</button>' +
          '<button class="ai-head-btn" onclick="aiClose()" title="关闭">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="ai-body" id="aiBody">' +
        '<div class="ai-empty" id="aiEmpty">' +
          '<div class="ai-empty-icon">🤖</div>' +
          '<p>告诉我你的目标或今天的计划，我会帮你拆解</p>' +
        '</div>' +
      '</div>' +
      '<div class="ai-foot">' +
        '<textarea id="aiInput" class="ai-input" rows="2" placeholder="输入消息..."' +
          ' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();aiSend();}"' +
          ' oninput="aiAutoGrow(this)"></textarea>' +
        '<button class="ai-send-btn" id="aiSendBtn" onclick="aiSend()">▶</button>' +
      '</div>' +
    '</div>';

  // 悬浮触发按钮
  var btn = document.createElement('button');
  btn.id = 'aiFloatBtn';
  btn.className = 'ai-float-btn';
  btn.innerHTML = '🤖';
  btn.title = 'AI 助手 (Shift+Space)';
  btn.onclick = function(){ aiToggle(); };

  document.body.appendChild(el);
  document.body.appendChild(btn);

  // 根据登录状态控制可见性
  updateAiButtonVisibility();

  // 拖拽调整宽度
  _aiBindResize();

  // 加载今天对话
  aiLoadHistory();
}

/* ── 开关 ── */
function aiToggle() {
  _aiOpen ? aiClose() : aiOpen();
}

function aiOpen() {
  _aiOpen = true;
  var drawer = document.getElementById('aiDrawer');
  var btn = document.getElementById('aiFloatBtn');
  if (!drawer) { initAiDrawer(); drawer = document.getElementById('aiDrawer'); btn = document.getElementById('aiFloatBtn'); }
  drawer.style.width = _aiWidth + 'px';
  drawer.classList.add('ai-open');
  drawer.classList.remove('ai-closing');
  btn.classList.add('ai-float-hidden');
  document.getElementById('appMain').classList.add('ai-shifted');
  document.getElementById('appMain').style.setProperty('--ai-width', _aiWidth + 'px');
  setTimeout(function(){ var inp = document.getElementById('aiInput'); if(inp) inp.focus(); }, 400);
}

function aiClose() {
  _aiOpen = false;
  var drawer = document.getElementById('aiDrawer');
  var btn = document.getElementById('aiFloatBtn');
  if (!drawer) return;
  drawer.classList.add('ai-closing');
  drawer.classList.remove('ai-open');
  btn.classList.remove('ai-float-hidden');
  document.getElementById('appMain').classList.remove('ai-shifted');
  setTimeout(function(){ drawer.classList.remove('ai-closing'); }, 350);
}

/* ── 宽度拖拽 ── */
function _aiBindResize() {
  var handle = document.getElementById('aiResizeHandle');
  if (!handle) return;
  var startX, startW;

  function onDown(e) {
    startX = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    startW = _aiWidth;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
  }
  function onMove(e) {
    var x = e.clientX || (e.touches && e.touches[0].clientX) || 0;
    var dx = startX - x;
    _aiWidth = Math.max(280, Math.min(620, startW + dx));
    var d = document.getElementById('aiDrawer');
    if (d) d.style.width = _aiWidth + 'px';
    var m = document.getElementById('appMain');
    if (m) m.style.setProperty('--ai-width', _aiWidth + 'px');
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onUp);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, {passive:false});
}

/* ── 对话加载/保存 ── */
function aiLoadHistory() {
  var today = store.currentDate || toLocalDate(new Date());
  if (typeof API !== 'undefined' && API.getChatHistory) {
    API.getChatHistory(today).then(function(res) {
      if (res.ok && res.data && res.data.messages) {
        _aiMsgs = res.data.messages;
      } else {
        _aiMsgs = [];
      }
      aiRender();
    }).catch(function() {
      _aiMsgs = [];
      aiRender();
    });
  } else {
    var raw = LS.get('aiChat_' + today, null);
    _aiMsgs = raw || [];
    aiRender();
  }
}

function aiSaveHistory() {
  var today = store.currentDate || toLocalDate(new Date());
  // 前端缓存兜底
  LS.set('aiChat_' + today, _aiMsgs);
  // 服务器持久化
  if (typeof API !== 'undefined' && API.saveChatHistory) {
    var summary = '';
    if (_aiMsgs.length > 10) {
      summary = '共 ' + _aiMsgs.length + ' 轮对话，最后更新于 ' + new Date().toLocaleString('zh-CN');
    }
    API.saveChatHistory(today, { messages: _aiMsgs, summary: summary }).catch(function(){});
  }
}

function aiClearChat() {
  if (!confirm('确定清空今天的 AI 对话？')) return;
  _aiMsgs = [];
  _aiPendingPlan = null;
  var today = store.currentDate;
  LS.remove('aiChat_' + today);
  if (typeof API !== 'undefined' && API.saveChatHistory) {
    API.saveChatHistory(today, { messages: [], summary: '' }).catch(function(){});
  }
  aiRender();
  toast('对话已清空', 'ok');
}

/* ── 渲染 ── */
function aiRender() {
  var body = document.getElementById('aiBody');
  var empty = document.getElementById('aiEmpty');
  if (!body) return;

  if (!_aiMsgs.length) {
    body.innerHTML = '';
    body.appendChild(empty || document.createElement('div'));
    if (empty) empty.style.display = 'flex';
    return;
  }
  if (empty) empty.style.display = 'none';

  var html = '';
  for (var i = 0; i < _aiMsgs.length; i++) {
    var m = _aiMsgs[i];
    if (m.role === 'user') {
      html += '<div class="ai-msg ai-msg-user"><div class="ai-bubble">' + escapeHtml(m.text) + '</div></div>';
    } else if (m.role === 'assistant') {
      html += '<div class="ai-msg ai-msg-ai">';
      if (m.planPreview && m.planPreview.blocks) {
        html += '<div class="ai-bubble"><div class="ai-plan-preview">' + _aiRenderPlanPreview(m.planPreview) + '</div></div>';
      } else {
        html += '<div class="ai-bubble">' + escapeHtml(m.text || '') + '</div>';
      }
      if (m.usage) {
        html += '<div class="ai-msg-meta">' + (m.usage.total_tokens || '?') + ' tokens</div>';
      }
      html += '</div>';
    }
  }

  if (_aiLoading) {
    html += '<div class="ai-msg ai-msg-ai"><div class="ai-bubble ai-loading">思考中<span class="ai-dots">...</span></div></div>';
  }

  body.innerHTML = html;
  body.scrollTop = body.scrollHeight;
  // 运行中给按钮呼吸光效
  _aiUpdateFloatGlow();
}

function _aiUpdateFloatGlow() {
  var btn = document.getElementById('aiFloatBtn');
  if (!btn) return;
  if (_aiMsgs.length > 0 && _aiMsgs[_aiMsgs.length - 1].role === 'assistant') {
    btn.classList.add('ai-has-msg');
  } else {
    btn.classList.remove('ai-has-msg');
  }
}

/* ── 发送 ── */
function aiSend() {
  var input = document.getElementById('aiInput');
  if (!input || _aiLoading) return;
  var text = input.value.trim();
  if (!text) return;
  input.value = '';
  aiAutoGrow(input);

  _aiMsgs.push({ role: 'user', text: text });
  _aiLoading = true;
  aiRender();
  aiSaveHistory();

  var cfg = _getEffectiveApiConfig();
  if (!cfg || !cfg.apiKey) {
    var hasKey = false;
    try { var c2 = _getEffectiveApiConfig(); hasKey = !!(c2 && c2.apiKey && c2.apiKey.trim()); } catch(e) {}
    if (!hasKey) {
      _aiMsgs.push({ role: 'assistant', text: '请先配置 AI API Key。点击顶栏 🧰 → 🔑 AI API 设置。' });
      _aiLoading = false;
      aiRender();
      aiSaveHistory();
      return;
    }
  }

  var forDate = store.currentDate || toLocalDate(new Date());

  // 构建上下文包
  var contextPack = _aiBuildContext(text, forDate);

  // 准备 messages
  var msgs = [];
  msgs.push({ role: 'system', content: _aiSystemPrompt() });
  msgs.push({ role: 'system', content: contextPack });

  // 对话摘要：最近 10 轮
  var startIdx = Math.max(0, _aiMsgs.length - 20);
  var recentMsgs = [];
  for (var ri = startIdx; ri < _aiMsgs.length - 1; ri++) {
    recentMsgs.push({ role: _aiMsgs[ri].role, content: _aiMsgs[ri].text });
  }

  // 加上历史摘要（如果对话太长）
  if (startIdx > 0 && _aiMsgs.length > 20) {
    recentMsgs.unshift({ role: 'system', content: '（之前对话摘要：用户讨论了目标和计划，AI 给出了建议。当前继续讨论。）' });
  }

  msgs = msgs.concat(recentMsgs);
  msgs.push({ role: 'user', content: text });

  _callAi(msgs, function(err, result) {
    _aiLoading = false;
    if (result) {
      var plan = _aiParsePlan(result.content);
      if (plan && plan.blocks && plan.blocks.length) {
        _aiMsgs.push({
          role: 'assistant',
          text: '已生成 ' + plan.blocks.length + ' 个任务',
          planPreview: plan,
          usage: result.usage,
          elapsed: result.elapsed,
        });
        _aiPendingPlan = plan;
      } else {
        _aiMsgs.push({
          role: 'assistant',
          text: result.content || '（AI 返回了空内容，请重试）',
          usage: result.usage,
          elapsed: result.elapsed,
        });
      }
    } else {
      _aiMsgs.push({ role: 'assistant', text: '⚠ AI 请求失败，请检查网络或 API Key 配置。' });
    }
    aiRender();
    aiSaveHistory();
  });
}

/* ── Prompt 构建 ── */
function _aiSystemPrompt() {
  return '你是一个 ADHD 友好的每日计划助手。你帮助用户拆解长期目标为可执行的每日任务。你可以和用户反复讨论、确认、修改计划。' +
    '当用户请求生成每日任务时，严格按照 JSON 格式返回。输出只包含 JSON，不要有多余解释。';
}

function _aiBuildContext(userText, forDate) {
  var parts = [];

  // 目标上下文
  var goals = store.bigGoals || [];
  if (goals.length) {
    parts.push('=== 用户长期目标 ===');
    for (var gi = 0; gi < goals.length; gi++) {
      var g = goals[gi];
      if (g.status === 'done') continue;
      var pr = (typeof goalProgress === 'function') ? goalProgress(g) : {};
      parts.push('- ' + g.icon + ' ' + g.title + '（goalId: ' + g.id + '）');
      if (g.deadline) parts.push('  截止: ' + g.deadline + '（剩 ' + (pr.daysLeft !== null ? pr.daysLeft : '?') + ' 天）');
      if (pr.current) {
        parts.push('  当前阶段: ' + pr.current.name + '（' + (pr.current.focus || '') + '）进度 ' + pr.pct + '%');
        var ms = pr.current.milestones || [];
        var undoneMs = ms.filter(function(m) { return !m.done; });
        if (undoneMs.length) {
          parts.push('  未完成里程碑: ' + undoneMs.slice(0, 5).map(function(m) { return m.text; }).join('; '));
        }
      }
    }
  }

  // 今日上下文
  parts.push('=== 今日信息 ===');
  parts.push('日期: ' + forDate);
  var modeCfg = (typeof getModeCfg === 'function') ? getModeCfg() : {};
  var curMode = modeCfg[store.mode] || { label: '完整', factor: 1.0 };
  parts.push('档位: ' + curMode.label + '（系数 ' + curMode.factor + '）');

  // 今日已有任务
  var sched = store.schedules[forDate];
  if (sched && sched.blocks && sched.blocks.length) {
    var totalDur = 0;
    for (var bi = 0; bi < sched.blocks.length; bi++) {
      totalDur += sched.blocks[bi].duration || 30;
    }
    parts.push('今日已有任务 ' + sched.blocks.length + ' 项，总用时 ' + totalDur + ' 分钟');
    for (var bj = 0; bj < sched.blocks.length; bj++) {
      var b = sched.blocks[bj];
      parts.push('  - ' + b.subject + ' (' + b.duration + 'min)' + (b.completed ? ' ✓已完成' : ''));
    }
  } else {
    parts.push('今日暂无任务');
  }

  // 输出格式提示
  parts.push('=== 输出任务 JSON 格式 ===');
  parts.push('{"blocks":[{"subject":"任务名","duration":60,"category":"study","priority":"high","goalId":"","phase":"","flowHint":"第一步动作","subtasks":[{"text":"子任务","estMin":20}]}]}');
  parts.push('- duration 必填，单位分钟');
  parts.push('- 子任务 2-4 个，符合启动→主体→验证三段式');
  parts.push('- flowHint 写 ADHD 友好的具体第一步');
  parts.push('- 如果任务是推进目标的，务必带 goalId 和 phase');

  return parts.join('\n');
}

/* ── AI 调用 ── */
function _getEffectiveApiConfig() {
  // 优先从服务器 prefs 读取，fallback 到 localStorage
  var cfg = { apiKey: '', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' };
  // 先读 localStorage
  var localCfg = (typeof getApiConfig === 'function') ? getApiConfig() : {};
  if (localCfg && localCfg.apiKey && localCfg.apiKey.trim()) {
    cfg.apiKey = localCfg.apiKey.trim();
    cfg.baseURL = localCfg.baseURL || cfg.baseURL;
    cfg.model = localCfg.model || cfg.model;
  }
  // 再读服务器 prefs（优先级更高）
  if (store.prefs && store.prefs.aiApiKey && store.prefs.aiApiKey.trim()) {
    cfg.apiKey = store.prefs.aiApiKey.trim();
    if (store.prefs.aiBaseUrl) cfg.baseURL = store.prefs.aiBaseUrl.trim();
    if (store.prefs.aiModel) cfg.model = store.prefs.aiModel.trim();
  }
  return cfg;
}

function _callAi(messages, callback) {
  var cfg = _getEffectiveApiConfig();
  var url = (cfg.baseURL || 'https://api.deepseek.com').replace(/\/+$/, '');
  if (url.indexOf('/v1') === -1) url += '/v1';
  url += '/chat/completions';

  var startTime = Date.now();

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey.trim() },
    body: JSON.stringify({ model: cfg.model || 'deepseek-chat', messages: messages, temperature: 0.7, max_tokens: 4096 }),
  }).then(function(res) {
    if (!res.ok) return res.text().then(function(t) { throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 200)); });
    return res.json();
  }).then(function(data) {
    var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    var content = (data.choices && data.choices[0] && data.choices[0].message) ? data.choices[0].message.content : '';
    callback(null, { content: content, usage: data.usage || {}, elapsed: parseFloat(elapsed) });
  }).catch(function(err) {
    callback(err, null);
  });
}

function _aiParsePlan(content) {
  try {
    var t = content || '';
    var m = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) t = m[1];
    var s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
    var plan = JSON.parse(t);
    if (!plan.blocks || !plan.blocks.length) return null;
    // 补全子任务字段
    plan.blocks.forEach(function(b) {
      b.subtasks = (b.subtasks || []).map(function(st) {
        return typeof st === 'string' ? { text: st, done: false, estMin: 25 } : st;
      });
      if (!b.duration) b.duration = 30;
      if (!b.category) b.category = 'study';
      if (!b.priority) b.priority = 'medium';
    });
    return plan;
  } catch (e) { return null; }
}

/* ── 任务预览渲染 ── */
function _aiRenderPlanPreview(plan) {
  var blocks = plan.blocks || [];
  var html = '<div class="ai-plan"><div class="ai-plan-head">📋 预览 · ' + blocks.length + ' 个任务</div>';

  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i];
    var subs = b.subtasks || [];
    html += '<div class="ai-plan-item" id="aiPlanItem' + i + '">' +
      '<div class="ai-plan-item-head">' +
        '<input type="text" class="ai-plan-subject" id="aiPlanSubj' + i + '" value="' + escapeHtml(b.subject || '') + '" placeholder="任务名" onchange="_aiUpdatePlanItem(' + i + ',\'subject\',this.value)">' +
        '<input type="number" class="ai-plan-dur" id="aiPlanDur' + i + '" value="' + (b.duration || 30) + '" min="5" max="480" step="5" onchange="_aiUpdatePlanItem(' + i + ',\'duration\',parseInt(this.value)||30)">' +
        '<span>min</span>' +
      '</div>';
    if (subs.length) {
      html += '<div class="ai-plan-subs">';
      for (var si = 0; si < subs.length; si++) {
        html += '<div class="ai-plan-sub">' +
          '<input type="text" value="' + escapeHtml(subs[si].text || '') + '" placeholder="子任务" onchange="_aiUpdateSubtask(' + i + ',' + si + ',this.value)">' +
        '</div>';
      }
      html += '</div>';
    }
    html += '<button class="ai-plan-remove" onclick="_aiRemovePlanItem(' + i + ')">移除</button></div>';
  }

  html += '<div class="ai-plan-actions">' +
    '<button class="btn-primary" onclick="aiAdoptPlan()">✅ 采纳并导入</button>' +
    '<button class="btn-secondary" onclick="aiAddPlanItem()">＋ 添加任务</button>' +
  '</div></div>';
  return html;
}

function _aiUpdatePlanItem(idx, field, val) {
  if (!_aiPendingPlan || !_aiPendingPlan.blocks) return;
  var b = _aiPendingPlan.blocks[idx];
  if (!b) return;
  b[field] = val;
}

function _aiUpdateSubtask(blockIdx, subIdx, val) {
  if (!_aiPendingPlan || !_aiPendingPlan.blocks || !_aiPendingPlan.blocks[blockIdx]) return;
  var s = _aiPendingPlan.blocks[blockIdx].subtasks;
  if (!s || !s[subIdx]) return;
  s[subIdx].text = val;
}

function _aiRemovePlanItem(idx) {
  if (!_aiPendingPlan || !_aiPendingPlan.blocks) return;
  _aiPendingPlan.blocks.splice(idx, 1);
  // 更新预览
  var m = _aiMsgs[_aiMsgs.length - 1];
  if (m && m.planPreview) m.planPreview = _aiPendingPlan;
  aiRender();
}

function aiAddPlanItem() {
  if (!_aiPendingPlan) { _aiPendingPlan = { blocks: [] }; }
  if (!_aiPendingPlan.blocks) _aiPendingPlan.blocks = [];
  _aiPendingPlan.blocks.push({
    subject: '', duration: 30, category: 'study', priority: 'medium',
    goalId: '', phase: '', flowHint: '', subtasks: [{ text: '', estMin: 15 }],
  });
  var m = _aiMsgs[_aiMsgs.length - 1];
  if (m && m.planPreview) m.planPreview = _aiPendingPlan;
  aiRender();
}

/* ── 采纳并导入 ── */
function aiAdoptPlan() {
  if (!_aiPendingPlan || !_aiPendingPlan.blocks || !_aiPendingPlan.blocks.length) {
    toast('没有可导入的任务', 'err'); return;
  }

  var forDate = store.currentDate;
  var cleaned = [];
  var seen = {};
  for (var i = 0; i < _aiPendingPlan.blocks.length; i++) {
    var b = _aiPendingPlan.blocks[i];
    var subj = (b.subject || '').trim();
    if (!subj) continue;
    if (seen[subj.toLowerCase()]) continue;
    seen[subj.toLowerCase()] = true;
    cleaned.push({
      id: 'ai_' + Date.now() + '_' + i,
      subject: subj,
      duration: Math.max(5, Math.min(480, b.duration || 30)),
      category: b.category || 'study',
      priority: b.priority || 'medium',
      goalId: b.goalId || '',
      phase: b.phase || '',
      flowHint: b.flowHint || '',
      subtasks: (b.subtasks || []).map(function(st) {
        return typeof st === 'string' ? { text: st, done: false, estMin: 15 } :
          { text: st.text || '', done: false, estMin: st.estMin || 15 };
      }),
      completed: false,
    });
  }

  if (!cleaned.length) { toast('没有有效的任务', 'err'); return; }

  var existing = store.schedules[forDate];
  var existingBlocks = (existing && existing.blocks) ? existing.blocks : [];
  var merged = existingBlocks.slice();
  for (var j = 0; j < cleaned.length; j++) {
    var dup = false;
    for (var k = 0; k < existingBlocks.length; k++) {
      if ((existingBlocks[k].subject || '').trim().toLowerCase() === cleaned[j].subject.toLowerCase()) { dup = true; break; }
    }
    if (!dup) merged.push(cleaned[j]);
  }

  store.schedules[forDate] = buildScheduleObject(forDate, { dayMode: store.mode, blocks: merged, encouragement: pickEncouragementSeeded(forDate, store.mode) });
  saveSchedules();
  syncPlanToServer(forDate);
  if (typeof syncStoreToDailyData === 'function') syncStoreToDailyData(forDate);
  store._tlFresh = true;

  _aiPendingPlan = null;
  _aiMsgs.push({ role: 'assistant', text: '✅ 已导入 ' + cleaned.length + ' 个任务到今日时间轴。', usage: null });
  aiSaveHistory();
  aiRender();
  renderAll();
  toast('✅ AI 任务已导入', 'ok');
}

/* ── textarea 自动撑高 ── */
function aiAutoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = Math.min(120, ta.scrollHeight) + 'px';
}
