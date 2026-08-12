/* ═══════════════════════════════════════
   import.js — JSON import + AI daily plan generator
   ═══════════════════════════════════════ */
'use strict';

/* ── 导入弹窗（v8.0：从底部面板移为独立 overlay） ── */

function openQuickImport() {
  _openWithAnim('importOverlay', function() { _renderImportPanel(); });
  _closeAllImportModals('importOverlay');
}

function closeImport() {
  _closeWithAnim('importOverlay');
  store._importChatMsgs = null; // 清空聊天缓存
}
function closeImportIfOverlay(e) {
  if (e.target === document.getElementById('importOverlay')) closeImport();
}

function _closeAllImportModals(exceptId) {
  var ids = ['modalOverlay','focusOverlay','shopOverlay','ledgerOverlay','accountingOverlay','archiveOverlay','goalOverlay','routineOverlay','modeOverlay','authOverlay','apiConfigOverlay'];
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] !== exceptId) _closeWithAnim(ids[i]);
  }
}

function _renderImportPanel() {
  var panel = document.getElementById('importPanel');
  var cfg = _getEffectiveApiConfig();
  var hasKey = !!(cfg.apiKey && cfg.apiKey.trim());

  var html = '<div class="arch-head">' +
    '<h3>📥 导入计划</h3>' +
    '<span class="arch-sub">告诉 AI 你今天想做什么，对话确认后导入</span>' +
    '<span class="focus-close" onclick="closeImport()">✕</span></div>';

  // ── 第一行：快速填入事务名称 + 用时 + AI发送 ──
  html += '<div class="im-chat-area" id="imChatArea">' +
    '<div class="im-msgs" id="imMsgs"></div>' +
    '<div class="im-input-row">' +
      '<input type="text" class="im-subject" id="imSubject" placeholder="事务名称，如 阅读第3章" autocomplete="off"' +
        ' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();_imSend();}">' +
      '<input type="text" class="im-duration" id="imDuration" placeholder="用时，如 60分钟" autocomplete="off" style="width:110px"' +
        ' onkeydown="if(event.key===\'Enter\'&&!event.shiftKey){event.preventDefault();_imSend();}">' +
      '<button class="btn-primary ai-btn" id="btnImSend" onclick="_imSend()"' + (hasKey ? '' : ' disabled') + '>🤖 发送</button>' +
    '</div>';

  if (!hasKey) {
    html += '<div class="im-no-key">⚠ 未配置 AI Key，请先在顶栏 🧰 → 🔑 AI API 设置</div>';
  }

  html += '<div class="im-actions-row">' +
    '<button class="btn-secondary" onclick="_imAdopt()" id="btnImAdopt" style="display:none">✅ 采纳并导入</button>' +
    '<button class="btn-secondary" onclick="_imClear()">🗑 清空对话</button>' +
  '</div></div>';

  // ── 底部：粘贴 JSON / 模板（降级入口） ──
  html += '<details class="im-advanced"><summary>⚙ 高级：粘贴 JSON / 模板导入</summary>' +
    '<textarea id="importJson" placeholder=\'{"date":"' + store.currentDate + '","dayMode":"full","startTime":"09:00","blocks":[{"subject":"任务名","duration":60,"category":"study"}]}\'></textarea>' +
    '<div class="modal-actions">' +
      '<button class="btn-primary" onclick="generateFromImport()">⚡ 从 JSON 导入</button>' +
      '<button class="btn-secondary" onclick="loadTemplate()">📄 每日模板</button>' +
      '<button class="btn-secondary" onclick="loadGoalTemplate()">🎯 目标模板</button>' +
    '</div>' +
    '<div class="ai-status" id="aiStatus"></div>' +
  '</details>';

  // ── 恢复聊天消息 ──
  panel.innerHTML = html;
  _imRenderMsgs();
}

function _qiRowHTML(idx) {
  return '<div class="qi-item" data-qi="' + idx + '">' +
    '<input type="text" class="qi-subject" placeholder="事务名称，如 阅读第3章" autocomplete="off">' +
    '<input type="text" class="qi-duration" placeholder="用时，如 60分钟 或 09:00-10:00" style="width:130px" autocomplete="off">' +
    (idx > 0 ? '<button class="btn-remove qi-remove" onclick="_removeQiRow(this)">✕</button>' : '') +
  '</div>';
}

function _parseQiDuration(raw) {
  raw = (raw || '').trim();
  if (!raw) return null;
  var m = raw.match(/^(\d+(?:\.\d+)?)\s*(分钟|min|分|m)?$/i);
  if (m) { var v = parseFloat(m[1]); return Math.round(v); }
  var range = raw.match(/^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/);
  if (range) {
    var sh = parseInt(range[1]), sm = parseInt(range[2]);
    var eh = parseInt(range[3]), em = parseInt(range[4]);
    return (eh * 60 + em) - (sh * 60 + sm);
  }
  var hm = raw.match(/^(\d+(?:\.\d+)?)\s*(小时|h|hrs?)?$/i);
  if (hm) return Math.round(parseFloat(hm[1]) * 60);
  var num = parseFloat(raw);
  if (!isNaN(num) && num > 0) return Math.round(num);
  return null;
}

function _buildQuickPrompt(items, forDate, dayMode) {
  var itemLines = items.map(function(it) {
    return '- ' + it.subject + (it.duration ? '（约' + it.duration + '分钟）' : '（用时待定）');
  }).join('\n');
  var modeCfg = getModeCfg();
  var curMode = modeCfg[dayMode] || modeCfg.full;
  return '你是一个 ADHD 友好的每日计划助手。用户只需要你帮忙把模糊的任务描述变成结构化的每日计划。\n\n' +
    '=== 用户今天想做的事 ===\n' + itemLines + '\n' +
    '=== 当前档位 ===\n' + curMode.label + '（约' + curMode.hours + '小时学习量）\n\n' +
    '=== 输出要求 ===\n' +
    '1. 只输出一个 JSON 对象，不要写解释。\n' +
    '2. 根据用户写的事务名称，你自己推断 category（study/work/life/health/review/other）、priority（high/medium/low）、flowHint（ADHD 友好的第一步动作）、subtasks（2-4个，每个含 text 和 estMin）。\n' +
    '3. 格式：{"date":"' + forDate + '","dayMode":"' + dayMode + '","startTime":"09:00","blocks":[{"subject":"...","duration":60,"category":"study","priority":"high","goalId":"","phase":"","flowHint":"打开书→看目录→找到今天要读的章节","subtasks":[{"text":"浏览目录","estMin":5},{"text":"读第一小节","estMin":20},{"text":"做3道练习题","estMin":25}]}]}\n' +
    '4. 不要输出 routines。\n' +
    '5. duration 填用户给的分钟数（没给就合理估计，一般 25-90 分钟）。\n' +
    '6. flowHint 要非常具体，是 ADHD 用户看到就能做的第一步。\n' +
    '7. 任务名保持用户原话，不要改写。';
}

/* ── AI 聊天式导入（v8.2：发送→确认→导入） ── */

function _imRenderMsgs() {
  var msgs = store._importChatMsgs || [];
  var el = document.getElementById('imMsgs');
  if (!el) return;
  var html = '';
  for (var i = 0; i < msgs.length; i++) {
    var m = msgs[i];
    if (m.role === 'user') {
      html += '<div class="im-msg im-msg-user"><div class="im-msg-bubble">' + escapeHtml(m.text) + '</div></div>';
    } else if (m.role === 'assistant') {
      html += '<div class="im-msg im-msg-ai"><div class="im-msg-bubble">';
      if (m.plan) {
        html += '<div class="im-plan-preview"><strong>🤖 AI 生成了 ' + (m.plan.blocks ? m.plan.blocks.length : '?') + ' 个任务：</strong><ol>';
        for (var j = 0; j < (m.plan.blocks || []).length; j++) {
          var b = m.plan.blocks[j];
          html += '<li>' + escapeHtml(b.subject) + ' <span class="im-dur-chip">' + b.duration + 'min</span></li>';
        }
        html += '</ol></div>';
        html += '<div class="im-plan-actions"><button class="btn-primary" onclick="_imAdopt()">✅ 采纳并导入</button></div>';
      } else {
        html += escapeHtml(m.text);
      }
      html += '</div></div>';
      if (m.usage) {
        html += '<div class="im-msg-meta">' + m.usage.total_tokens + ' tokens · ' + (m.elapsed || '?') + 's</div>';
      }
    }
  }
  if (!msgs.length) {
    html = '<div class="im-empty">告诉 AI 你今天要做什么，会先给你预览确认再导入</div>';
  }
  el.innerHTML = html;
  el.scrollTop = el.scrollHeight;
  // 采纳按钮可见性
  var lastPlan = _imLastPlan();
  var adoptBtn = document.getElementById('btnImAdopt');
  if (adoptBtn) adoptBtn.style.display = lastPlan ? 'inline-block' : 'none';
}

function _imAddMsg(role, data) {
  if (!store._importChatMsgs) store._importChatMsgs = [];
  store._importChatMsgs.push(data);
  _imRenderMsgs();
}

function _imLastPlan() {
  var msgs = store._importChatMsgs || [];
  for (var i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant' && msgs[i].plan) return msgs[i].plan;
  }
  return null;
}

function _imSend() {
  var subject = (document.getElementById('imSubject').value || '').trim();
  var durRaw  = (document.getElementById('imDuration').value || '').trim();
  if (!subject) { toast('请输入事务名称', 'err'); return; }
  var dur = _parseQiDuration(durRaw);
  var text = subject + (durRaw ? '（≈' + dur + '分钟）' : '');
  document.getElementById('imSubject').value = '';
  document.getElementById('imDuration').value = '';
  _imAddMsg('user', { role: 'user', text: text, subject: subject, duration: dur });

  var cfg = _getEffectiveApiConfig();
  var d = new Date(store.currentDate + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  var nextDate = d.toISOString().split('T')[0];

  var btn = document.getElementById('btnImSend');
  btn.disabled = true; btn.textContent = '⏳';

  var allItems = [];
  var msgs = store._importChatMsgs || [];
  for (var i = 0; i < msgs.length; i++) {
    if (msgs[i].role === 'user' && msgs[i].subject) {
      allItems.push({ subject: msgs[i].subject, duration: msgs[i].duration });
    }
  }

  var prompt = _buildQuickPrompt(allItems, nextDate, store.mode);
  _callAiDirect(cfg, prompt, nextDate, function(err, result) {
    btn.disabled = false; btn.textContent = '🤖 发送';
    if (result) {
      var plan = _parseAiJson(result.content);
      if (plan) {
        _imAddMsg('assistant', {
          role: 'assistant',
          text: '已生成 ' + (plan.blocks ? plan.blocks.length : '?') + ' 个任务',
          plan: plan,
          usage: result.usage,
          elapsed: result.elapsed,
        });
      } else {
        _imAddMsg('assistant', {
          role: 'assistant',
          text: 'AI 返回格式异常，请重试。「' + (result.content || '').slice(0, 60) + '...」',
        });
      }
    } else {
      _imAddMsg('assistant', {
        role: 'assistant',
        text: '⚠ 请求失败（请检查 AI Key 是否已配置：顶栏 🧰 → 🔑 AI API）',
      });
    }
  });
}

function _parseAiJson(content) {
  try {
    var t = content || '';
    var m = t.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) t = m[1];
    var s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s !== -1 && e !== -1) t = t.slice(s, e + 1);
    var plan = JSON.parse(t);
    if (plan.blocks && plan.blocks.length > 0) return plan;
    return null;
  } catch (x) { return null; }
}

function _imAdopt() {
  var plan = _imLastPlan();
  if (!plan) return;
  document.getElementById('importJson').value = JSON.stringify(plan, null, 2);
  generateFromImport();
  closeImport();
}

function _imClear() {
  store._importChatMsgs = [];
  _imRenderMsgs();
}

function sendFeedback() {
  if (guardEdit()) return;
  var fb = document.getElementById('feedbackInput').value;
  if (!store.progress[store.currentDate]) store.progress[store.currentDate] = {};
  var dp = store.progress[store.currentDate];
  dp.note = fb;
  dp.rating = store.rating;
  dp.mode = store.mode;
  dp.updated = new Date().toISOString();
  saveProgress();
  toast('✅ 已保存', 'ok');
}

function generatePrompt() {
  sendFeedback();
  var fb = document.getElementById('feedbackInput').value;

  var d = new Date(store.currentDate + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  var nextDate = d.toISOString().split('T')[0];

  // v7.1：档位配置（用户可自定义名称/系数/时长）
  var modeCfg = getModeCfg();
  var modeDesc = '';
  var keys = MODE_ORDER;
  for (var mi = 0; mi < keys.length; mi++) {
    var mc = modeCfg[keys[mi]];
    modeDesc += '- ' + mc.label + '：系数 ' + mc.factor + '（约 ' + mc.hours + '）';
    if (mc.desc) modeDesc += '，' + mc.desc;
    modeDesc += '\n';
  }

  // v7.0：长期目标上下文
  var goalsSection = (typeof buildGoalsPromptSection === 'function') ? buildGoalsPromptSection() : '';

  var prompt = '请根据以下信息，生成 ' + nextDate + ' 的每日计划。输出格式必须是 JSON，我可以直接粘贴进网页。\n\n' +
    '=== 当前档位 ===\n' +
    '明天默认档位：' + modeCfg[store.mode].label + '（系数 ' + modeCfg[store.mode].factor + '，约 ' + modeCfg[store.mode].hours + '）\n' +
    '三档位说明（系数越大，任务量越多）：\n' + modeDesc + '\n' +
    (goalsSection ? '=== 长期目标 ===\n' + goalsSection + '\n' : '') +
    '=== 今日反馈 ===\n' + (fb || '（无）') + '\n\n' +
    '=== 输出要求 ===\n' +
    '1. 只输出一个 JSON 对象，不要写解释。\n' +
    '2. 字段说明（按这个格式填）：\n' +
    '   - date: "' + nextDate + '"\n' +
    '   - dayMode: "full" 或 "minimum" 或 "recovery"（对应上面的档位）\n' +
    '   - startTime: "09:00"（时间轴从几点开始）\n' +
    '   - energyLevel: "normal" / "low" / "bad"\n' +
    '   - blocks: 目标任务数组。格式：[{subject:"任务名", duration:60, category:"study/work/life/health/review/other", priority:"high/medium/low", goalId:"关联目标id（可选）", phase:"阶段名（可选）", flowHint:"具体第一步动作", subtasks:[{text:"子任务", estMin:20}]}]\n' +
    '3. 不要输出 routines（固定任务由用户在网页「🔁 日课」面板维护，会自动合并到时间轴）。\n' +
    '4. duration 是预计用时（分钟），必填；time 字段可选，只用来默认排序。\n' +
    '5. 明天的任务量请匹配当前档位的系数（' + modeCfg[store.mode].label + ' 系数 ' + modeCfg[store.mode].factor + '）。\n' +
    '6. 如果某个任务在推进长期目标，请带上 goalId 和 phase。\n' +
    '7. 子任务建议 2-4 个，符合「启动→主任务→验证」三段式，越具体越好。\n\n' +
    '=== 完整示例 ===\n' +
    '{\n' +
    '  "date": "' + nextDate + '",\n' +
    '  "dayMode": "' + store.mode + '",\n' +
    '  "startTime": "09:00",\n' +
    '  "energyLevel": "normal",\n' +
    '  "blocks": [\n' +
    '    {\n' +
    '      "subject": "阅读训练 — 第3章",\n' +
    '      "duration": 60,\n' +
    '      "category": "study",\n' +
    '      "priority": "high",\n' +
    '      "goalId": "",\n' +
    '      "phase": "",\n' +
    '      "flowHint": "先打开书看第一段，不用想太多",\n' +
    '      "subtasks": [\n' +
    '        {"text": "快速浏览标题和小标题", "estMin": 5},\n' +
    '        {"text": "读第一段并划出关键词", "estMin": 15},\n' +
    '        {"text": "做 3 道理解题", "estMin": 25}\n' +
    '      ]\n' +
    '    },\n' +
    '    {\n' +
    '      "subject": "晚间复盘",\n' +
    '      "duration": 20,\n' +
    '      "category": "review",\n' +
    '      "priority": "medium",\n' +
    '      "flowHint": "只写三行：今天做了什么、明天最重要的一件事",\n' +
    '      "subtasks": [{"text": "写复盘", "estMin": 15}]\n' +
    '    }\n' +
    '  ]\n' +
    '}';

  var box = document.getElementById('promptOutput');
  box.textContent = prompt;
  box.classList.add('show');
  document.getElementById('btnCopy').style.display = 'inline-block';
}

function copyPrompt() {
  navigator.clipboard.writeText(document.getElementById('promptOutput').textContent)
    .then(function() {
      var btn = document.getElementById('btnCopy');
      btn.textContent = '✅ 已复制';
      setTimeout(function() { btn.textContent = '📋 复制'; }, 2000);
      toast('已复制', 'ok');
    })
    .catch(function() { toast('复制失败', 'err'); });
}

function loadTemplate() {
  var tpl = {
    date: store.currentDate, dayMode: store.mode, startTime: '09:00', energyLevel: 'normal',
    specialNotes: '', priorityShift: null,
    blocks: [
      { subject:'示例：核心学习任务', duration:60, category:'study', priority:'high', goalId:'', phase:'',
        flowHint:'先打开资料第一页，只看第一段',
        subtasks:[{text:'浏览目录',estMin:5},{text:'读第一小节并做笔记',estMin:30},{text:'做3道练习题并批改',estMin:20}] },
      { subject:'示例：整理与复盘', duration:20, category:'review', priority:'medium',
        flowHint:'只写三行：做了什么、卡住的地方、明天重点',
        subtasks:[{text:'写今日复盘',estMin:15}] }
    ]
  };
  document.getElementById('importJson').value = JSON.stringify(tpl, null, 2);
}

function loadGoalTemplate() {
  var tpl = {
    title: '我的长期目标',
    icon: '🎯',
    desc: '一句话说明期望成果',
    startDate: toLocalDate(new Date()),
    deadline: '',
    phases: [
      {
        name: '阶段1：启动',
        focus: '了解全貌，建立最小习惯',
        start: toLocalDate(new Date()),
        end: '',
        milestones: ['完成 1 次整体浏览', '列出 3 个最常考点']
      },
      {
        name: '阶段2：深入',
        focus: '逐块突破核心难点',
        start: '',
        end: '',
        milestones: ['完成第 1 个知识模块练习', '整理 1 页错题']
      }
    ]
  };
  document.getElementById('importJson').value = JSON.stringify(tpl, null, 2);
}

function generateFromImport() {
  if (guardEdit()) return;

  var data;
  try { data = JSON.parse(document.getElementById('importJson').value); }
  catch (e) { toast('JSON格式有误', 'err'); return; }

  // v7.0：含 title + phases 的 JSON 识别为「目标拆解」导入，而非每日计划
  if (data.title && data.phases && !data.blocks) {
    var savedGoal = importBigGoalData(data);
    renderAll();
    toast('🎯 目标「' + savedGoal.title + '」已导入（' + (savedGoal.phases || []).length + ' 个阶段）', 'ok');
    return;
  }

  // v8.1：每日计划 JSON 不携带 routines（固定事务独立维护），忽略 data.routines。
  // 同时清理空标题 / 重复 block，避免 AI 误输出造成重复卡片。
  var cleanedBlocks = [];
  var seenSubjects = {};
  if (data.blocks) {
    for (var bi = 0; bi < data.blocks.length; bi++) {
      var b = data.blocks[bi];
      var subj = (b.subject || b.title || '').trim();
      if (!subj) continue;                      // 跳过无标题任务
      if (seenSubjects[subj.toLowerCase()]) continue; // 跳过重复任务
      seenSubjects[subj.toLowerCase()] = true;
      b.subject = subj;
      cleanedBlocks.push(b);
    }
  }
  data.blocks = cleanedBlocks;

  if (data.goals) {
    store.goals = data.goals;
    LS.set('goals', store.goals);
    if (data.goals.active) store.activeGoal = data.goals.active;
    else if (data.goals.goals) store.activeGoal = Object.keys(data.goals.goals)[0] || null;
  }

  store.mode = data.dayMode || 'full';
  store.currentDate = data.date || store.currentDate;

  // 新计划 → 清除该日的时间轴拖拽顺序/起点缓存，恢复默认锚点排序
  clearTimelineCfg(store.currentDate);
  store._tlFresh = true;

  generateSchedule(store.currentDate, data);

  // JSON 可指定时间轴起点（startTime），导入后写入时间轴配置
  if (data.startTime && /^\d{1,2}:\d{2}$/.test(data.startTime)) {
    var cfg = getTimelineCfg(store.currentDate);
    cfg.start = data.startTime;
    saveTimelineCfg(store.currentDate, cfg);
  }

  // Write-through: save the daily plan (targets only) to server
  var plan = store.schedules[store.currentDate];
  if (plan) {
    API.savePlan(store.currentDate, {
      dayMode: store.mode,
      energyLevel: data.energyLevel || 'normal',
      specialNotes: data.specialNotes || '',
      blocks: plan.blocks.map(function(b) {
        return {
          id: b.id, subject: b.subject, time: b.time, icon: b.icon,
          category: b.category, priority: b.priority, duration: b.duration,
          goalId: b.goalId || '', phase: b.phase || '',
          flowHint: b.flowHint, subtasks: b.subtasks,
        };
      }),
      customBlocks: data.customBlocks || [],
      priorityShift: data.priorityShift || null,
    }).catch(function(){});
  }

  renderAll();
  toast('已为 ' + store.currentDate + ' 生成 ' + cleanedBlocks.length + ' 个目标任务' + ' (已同步到服务器)', 'ok');
}

/* ── File import (drag & drop + file picker) ──── */

function handleFileDrop(e) {
  e.preventDefault();
  e.target.style.borderColor = '';
  e.target.style.background = '';
  var file = e.dataTransfer.files[0];
  if (file) readImportFile(file);
}

function handleFileSelect(e) {
  var file = e.target.files[0];
  if (file) readImportFile(file);
}

function readImportFile(file) {
  if (file.name.indexOf('.json') === -1) { toast('请选择 .json 文件', 'err'); return; }
  var reader = new FileReader();
  reader.onload = function (ev) {
    document.getElementById('importJson').value = ev.target.result;
    toast('✅ 文件已加载，点击「生成计划」导入', 'ok');
  };
  reader.readAsText(file);
}

function showImportGuide() {
  toast('导入指南：① 每日计划：{date,dayMode,startTime,blocks:[{subject,duration,category,goalId?}]}，固定任务请在「🔁 日课」维护；② 目标拆解：{title,phases:[{name,focus,start,end,milestones:[]}]}.', 'ok');
}

/* ── AI 一键生成（v8.0：前端直连 + 后端代理双模） ──── */

/**
 * 1. 优先前端直连用户配置的 API（Key 来自 apiconfig）
 * 2. CORS 被拦截 → 回退到后端 /api/generate-plan
 * 3. 都失败 → 回到手动复制粘贴流程
 */
function generateFromAI() {
  if (guardEdit()) return;

  sendFeedback();
  var fb = document.getElementById('feedbackInput').value;

  var d = new Date(store.currentDate + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  var nextDate = d.toISOString().split('T')[0];

  var apiCfg = _getEffectiveApiConfig();
  var hasKey = !!(apiCfg.apiKey && apiCfg.apiKey.trim());

  var btn = document.getElementById('btnAiGenerate');
  var origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '⏳ AI 思考中...';
  var statusEl = document.getElementById('aiStatus');
  if (statusEl) statusEl.textContent = '';

  // 构建 prompt
  var prompt = _buildAiPrompt(nextDate, store.mode, fb);

  if (hasKey) {
    // ── 路径 1：前端直连 ──
    _callAiDirect(apiCfg, prompt, nextDate, function(err, result) {
      if (result) {
        _handleAiResult(result, nextDate, statusEl, btn, origHTML);
        return;
      }
      // CORS 或网络错误 → 尝试服务端代理
      if (statusEl) statusEl.textContent = '⚠ 直连失败（CORS），尝试服务端代理...';
      _callAiServer(nextDate, fb, statusEl, btn, origHTML);
    });
  } else {
    // ── 路径 2：无 Key → 服务端代理（需服务端配 DEEPSEEK_API_KEY） ──
    _callAiServer(nextDate, fb, statusEl, btn, origHTML);
  }
}

function _buildAiPrompt(forDate, dayMode, feedback) {
  var modeCfg = getModeCfg();
  var modeDesc = '';
  var keys = MODE_ORDER;
  for (var mi = 0; mi < keys.length; mi++) {
    var mc = modeCfg[keys[mi]];
    modeDesc += '- ' + mc.label + '：系数 ' + mc.factor + '（约 ' + mc.hours + '），' + (mc.desc || '') + '\n';
  }
  var curMode = modeCfg[dayMode] || modeCfg.full;

  var goalsSection = (typeof buildGoalsPromptSection === 'function') ? buildGoalsPromptSection() : '';

  return '请根据以下信息，生成 ' + forDate + ' 的每日计划。输出格式必须是 JSON。\n\n' +
    '=== 当前档位 ===\n' +
    '默认档位：' + curMode.label + '（系数 ' + curMode.factor + '，约 ' + curMode.hours + '）\n' +
    '三档位说明：\n' + modeDesc + '\n' +
    (goalsSection ? '=== 长期目标 ===\n' + goalsSection + '\n' : '') +
    '=== 今日反馈 ===\n' + (feedback || '（无）') + '\n\n' +
    '=== 输出要求 ===\n' +
    '1. 只输出一个 JSON 对象，不要写解释、不要写 markdown 代码块标记。\n' +
    '2. 字段：{"date":"' + forDate + '","dayMode":"' + dayMode + '","startTime":"09:00","energyLevel":"normal","blocks":[{"subject":"任务名","duration":60,"category":"study","priority":"high/medium/low","goalId":"","phase":"","flowHint":"第一步动作","subtasks":[{"text":"子任务","estMin":20}]}]}\n' +
    '3. 不要输出 routines（固定任务由用户在网页「🔁 日课」面板维护，会自动合并到时间轴）。\n' +
    '4. duration 必填（分钟），time 字段可选（仅默认排序）。\n' +
    '5. 任务量匹配当前档位系数 ' + curMode.factor + '。推进目标的任务请带 goalId 和 phase。\n' +
    '6. 子任务 2-4 个，越具体越好，ADHD 用户需要明确的第一步指令。';
}

function _callAiDirect(apiCfg, prompt, forDate, callback) {
  var url = (apiCfg.baseURL || 'https://api.deepseek.com').replace(/\/+$/, '') + '/v1/chat/completions';
  // DeepSeek 的 baseURL 是 https://api.deepseek.com，但 /v1/chat/completions 需要加 /v1
  // 如果用户填的是 https://api.deepseek.com/v1，则不加 /v1
  if (apiCfg.baseURL && apiCfg.baseURL.indexOf('/v1') !== -1) {
    url = apiCfg.baseURL.replace(/\/+$/, '') + '/chat/completions';
  }

  var body = {
    model: apiCfg.model || 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 4096,
  };

  var startTime = Date.now();

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiCfg.apiKey.trim(),
    },
    body: JSON.stringify(body),
  }).then(function(res) {
    if (!res.ok) {
      return res.text().then(function(t) { throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 200)); });
    }
    return res.json();
  }).then(function(data) {
    var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    var content = (data.choices && data.choices[0] && data.choices[0].message)
      ? data.choices[0].message.content
      : '';
    var usage = data.usage || {};
    callback(null, { content: content, usage: usage, elapsed: parseFloat(elapsed), mode: 'direct' });
  }).catch(function(err) {
    callback(err, null);
  });
}

function _callAiServer(forDate, feedback, statusEl, btn, origHTML) {
  API.generatePlan({
    date: forDate,
    dayMode: store.mode,
    feedback: feedback,
    goalId: store.activeGoal || null,
  }).then(function(res) {
    if (!res.ok || !res.plan) {
      if (statusEl) statusEl.textContent = '❌ 服务端也失败，请检查 Key 配置或手动导入';
      toast('AI 生成失败：' + (res.message || '未知错误'), 'err');
      btn.disabled = false;
      btn.innerHTML = origHTML;
      // 回退到手动模式 — 把 prompt 填入文本框供复制
      _fallbackToManual(forDate);
      return;
    }
    _handleAiResult({
      content: JSON.stringify(res.plan),
      usage: res.usage,
      elapsed: res.elapsed,
      mode: 'server',
    }, forDate, statusEl, btn, origHTML);
  }).catch(function() {
    if (statusEl) statusEl.textContent = '❌ 网络错误，请检查服务';
    btn.disabled = false;
    btn.innerHTML = origHTML;
    _fallbackToManual(forDate);
  });
}

function _fallbackToManual(forDate) {
  // 回退：把 prompt 填入文本框，让用户手动复制到外部 AI
  generatePrompt(); // 这个函数会把 prompt 写入 promptOutput
  toast('已切换到手动模式：复制下方提示词到 AI → 粘贴 JSON 回来', 'ok');
}

function _handleAiResult(result, forDate, statusEl, btn, origHTML) {
  var plan;
  try {
    // 从 AI 回复中提取 JSON
    var text = result.content || '';
    // 去 markdown 包裹
    var m = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (m) text = m[1];
    var start = text.indexOf('{');
    var end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) text = text.slice(start, end + 1);
    plan = JSON.parse(text);
  } catch (e) {
    if (statusEl) statusEl.textContent = '❌ AI 返回格式异常，请重试';
    toast('AI 返回的不是有效 JSON，请重试', 'err');
    btn.disabled = false;
    btn.innerHTML = origHTML;
    return;
  }

  // 写入 import textarea 并自动导入
  document.getElementById('importJson').value = JSON.stringify(plan, null, 2);
  generateFromImport();

  var tokens = result.usage ? (result.usage.total_tokens || 0) : '?';
  var sec = result.elapsed || '?';
  var modeLabel = result.mode === 'direct' ? '浏览器直连' : '服务端代理';
  if (statusEl) statusEl.textContent = '✅ 已生成（' + tokens + ' tokens，' + sec + 's，' + modeLabel + '）';
  toast('🤖 AI 已生成 ' + (plan.date || forDate) + ' 计划（' + tokens + ' tokens）', 'ok');

  btn.disabled = false;
  btn.innerHTML = origHTML;
}

function _updateAiButtonState() {
  var btn = document.getElementById('btnAiGenerate');
  if (!btn) return;
  var cfg = _getEffectiveApiConfig();
  if (cfg.apiKey && cfg.apiKey.trim()) {
    btn.title = '前端直连 ' + cfg.provider + '（' + cfg.model + '）';
  } else {
    btn.title = '未配置 Key — 将尝试服务端代理';
  }
}
