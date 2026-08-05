/* ═══════════════════════════════════════
   archive.js — 存档系统（v9.0 重写）

   核心改动：每日独立数据副本 + 存档快照不可变
   - 每个日期首次访问时，从模板 Copy 生成独立副本（dp_day_data_{date}）
   - 之后的修改只影响自己的副本，互不干扰
   - 存档后写入 archiveData 字段，该日期进入只读状态
   - 历史日期/今天过存档时间 → 只读；未来日期 → 可规划

   存储布局:
   - dp_day_data_{date}: 每日独立数据（blocks/routines/progress/timelineCfg）
   - dp_routines: 全局日课预设模板（仅 Copy 源，不直接渲染）
   - dp_archive_index: 存档日期索引
   - dp_prefs.archiveHour / dp_prefs.archiveMinute: 用户自定义存档时间
   ═══════════════════════════════════════ */
'use strict';

var DAY_DATA_PREFIX = 'day_data_';

/* ── 存档时间配置 ───────────────────────── */

function getArchiveTime() {
  var prefs = LS.get('prefs', {});
  return {
    hour: prefs.archiveHour !== undefined ? prefs.archiveHour : 23,
    minute: prefs.archiveMinute !== undefined ? prefs.archiveMinute : 30,
  };
}

function setArchiveTime(hour, minute) {
  var prefs = LS.get('prefs', {});
  prefs.archiveHour = hour;
  prefs.archiveMinute = minute;
  LS.set('prefs', prefs);
}

/* ── 每日独立数据读写 ─────────────────────── */

/** 返回 dp_day_data_{date}，不存在返回 null */
function getDailyData(date) {
  return LS.get(DAY_DATA_PREFIX + date, null);
}

/** 写入 dp_day_data_{date}，并异步同步到服务器 */
function saveDailyData(date, data) {
  LS.set(DAY_DATA_PREFIX + date, data);
  // 写通到服务器持久化（异步，失败静默降级）
  if (typeof API !== 'undefined' && API.saveDayData) {
    API.saveDayData(date, data).catch(function(){});
  }
}

/** 从全局模板 Copy 生成某日期的独立数据副本（幂等） */
function initDailyData(date) {
  var existing = getDailyData(date);
  if (existing) return existing;

  var routinesCopy = JSON.parse(JSON.stringify(store.routines || []));
  var goalsSnapshot = {};
  var goals = store.bigGoals || [];
  for (var gi = 0; gi < goals.length; gi++) {
    var g = goals[gi];
    if (g.status === 'done') continue;
    var pr = (typeof goalProgress === 'function') ? goalProgress(g) : {};
    goalsSnapshot[g.id] = {
      title: g.title,
      icon: g.icon,
      deadline: g.deadline,
      currentPhase: pr.current ? pr.current.name : '',
      phaseProgress: pr.pct || 0,
    };
  }

  var data = {
    blocks: [],
    routines: routinesCopy,
    routineProgress: {},
    goalsSnapshot: goalsSnapshot,
    timelineCfg: { start: null, order: {} },
    progress: {},
    initFromTemplate: new Date().toISOString(),
    archiveData: null,
  };

  saveDailyData(date, data);
  return data;
}

/** 加载某日数据到 store 中供渲染使用 */
function loadDailyData(date) {
  var data = getDailyData(date);
  if (!data) {
    // 尝试从旧格式迁移
    if (typeof migrateLegacyDayData === 'function') {
      data = migrateLegacyDayData(date);
    }
  }
  if (!data) {
    // 未来日期或从未访问的日期：初始化
    data = initDailyData(date);
  }

  // 同步到 store 的渲染入口
  store.schedules[date] = {
    date: date,
    mode: store.mode,
    blocks: data.blocks || [],
    encouragement: pickEncouragementSeeded(date, store.mode),
  };
  store.routineProgress[date] = data.routineProgress || {};
  store.progress[date] = data.progress || {};

  // 时间轴配置
  var tlCfg = data.timelineCfg;
  if (tlCfg) {
    var allTl = LS.get('timelineCfg', {});
    allTl[date] = tlCfg;
    LS.set('timelineCfg', allTl);
  }

  return data;
}

/** 将 store 中的当前状态同步回 dp_day_data_{date} */
function syncStoreToDailyData(date) {
  var data = getDailyData(date) || initDailyData(date);

  var sched = store.schedules[date];
  data.blocks = (sched && sched.blocks) ? sched.blocks : [];
  data.routineProgress = store.routineProgress[date] || {};
  data.progress = store.progress[date] || {};

  var tlCfg = getTimelineCfg(date);
  data.timelineCfg = tlCfg;

  saveDailyData(date, data);
  return data;
}

/* ── 旧格式迁移 ─────────────────────────── */

function migrateLegacyDayData(date) {
  var oldSchedules = LS.get('schedules', {});
  var oldProgress = LS.get('progress', {});
  var oldRp = LS.get('routineProgress', {});
  var oldSched = oldSchedules[date];

  // 如果没有旧数据，不迁移
  if (!oldSched && oldRp[date] === undefined) return null;

  var routinesCopy = JSON.parse(JSON.stringify(store.routines || []));
  var data = {
    blocks: (oldSched && oldSched.blocks) ? oldSched.blocks : [],
    routines: routinesCopy,
    routineProgress: oldRp[date] || {},
    goalsSnapshot: {},
    timelineCfg: getTimelineCfg(date),
    progress: oldProgress[date] || {},
    initFromTemplate: new Date().toISOString(),
    archiveData: null,
  };

  // 检查旧存档
  var oldArchive = localStorage.getItem(ARCHIVE_PREFIX + date);
  if (oldArchive) {
    try {
      var oldArch = JSON.parse(oldArchive);
      data.archiveData = {
        archivedAt: oldArch.archivedAt || new Date().toISOString(),
        selfReview: { rating: oldArch.progress ? oldArch.progress.rating || 0 : 0, note: oldArch.progress ? oldArch.progress.note || '' : '' },
        aiReview: '',
        summary: oldArch.summary || {},
      };
    } catch (e) {}
  }

  saveDailyData(date, data);
  console.log('📦 已迁移旧数据:', date);
  return data;
}

/* ── 锁定判断 ────────────────────────────── */

function isDateArchived(date) {
  var data = getDailyData(date);
  if (data && data.archiveData) return true;

  var now = new Date(), today = toLocalDate(now);
  if (date > today) return false;
  if (date === today) {
    var at = getArchiveTime();
    var h = now.getHours(), m = now.getMinutes();
    return h > at.hour || (h === at.hour && m >= at.minute);
  }
  // 历史日期：检查是否已存档
  return !!localStorage.getItem(ARCHIVE_PREFIX + date);
}

function isDateLocked(date) {
  var data = getDailyData(date);
  if (data && data.archiveData) return true;

  var now = new Date(), today = toLocalDate(now);
  if (date > today) return false;
  if (date === today) {
    var at = getArchiveTime();
    var h = now.getHours(), m = now.getMinutes();
    return h > at.hour || (h === at.hour && m >= at.minute);
  }
  return true; // 所有历史日期锁定
}

function canEarnToday() {
  var now = new Date(), h = now.getHours(), m = now.getMinutes();
  if (h < 4) return false;
  var at = getArchiveTime();
  if (h > at.hour || (h === at.hour && m >= at.minute)) return false;
  return true;
}

function getArchiveKey(date) { return ARCHIVE_PREFIX + date; }

/* ── 存档核心 ───────────────────────────── */

/**
 * 存档指定日期：用户自评 + 生成 summary + 调用 AI 评价
 * 写入 dp_day_data_{date}.archiveData
 */
function archiveDay(date) {
  var data = getDailyData(date);
  if (!data) return false;
  if (data.archiveData) return false; // 已存档，防重复

  var history = saveDailyHistory(date);
  var sched = store.schedules[date] || {};

  // 存档时同时刷新当日数据快照
  syncStoreToDailyData(date);
  data = getDailyData(date);

  data.archiveData = {
    archivedAt: new Date().toISOString(),
    selfReview: {
      rating: store.progress[date] ? store.progress[date].rating || 0 : 0,
      note: store.progress[date] ? store.progress[date].note || '' : '',
    },
    aiReview: '',
    summary: history,
    mode: sched.mode || store.mode,
  };

  saveDailyData(date, data);

  // 维护存档索引
  var idx = JSON.parse(localStorage.getItem('dp_archive_index') || '[]');
  if (idx.indexOf(date) === -1) { idx.push(date); idx.sort(); localStorage.setItem('dp_archive_index', JSON.stringify(idx)); }

  // 写通到服务器
  if (typeof API !== 'undefined' && API.saveArchive) {
    API.saveArchive(date, {
      date: date,
      archivedAt: data.archiveData.archivedAt,
      selfReview: data.archiveData.selfReview,
      aiReview: data.archiveData.aiReview,
      summary: data.archiveData.summary,
      blocks: data.blocks,
      routines: data.routines,
      routineProgress: data.routineProgress,
      progress: data.progress,
      timelineCfg: data.timelineCfg,
    }).catch(function(){});
  }
  return true;
}

/** 手动触发存档流程（含 UI 面板） */
function triggerArchive(date) {
  date = date || store.currentDate;
  var data = getDailyData(date);
  if (!data) { toast('该日期无数据可存档', 'err'); return; }
  if (data.archiveData) { toast('该日期已存档', 'err'); return; }

  // 弹出存档自评面板
  showArchiveSelfReview(date);
}

/** 展示存档自评面板 */
function showArchiveSelfReview(date) {
  var overlay = document.getElementById('archiveReviewOverlay');
  if (!overlay) {
    // 动态创建自评面板
    overlay = document.createElement('div');
    overlay.id = 'archiveReviewOverlay';
    overlay.className = 'overlay hidden';
    overlay.onclick = function(e) { if (e.target === overlay) closeArchiveSelfReview(); };
    overlay.innerHTML =
      '<div class="ov-panel arch-review-panel">' +
        '<div class="arch-head"><h3>📦 存档 · ' + date + '</h3><span class="focus-close" onclick="closeArchiveSelfReview()">✕</span></div>' +
        '<div class="arch-review-body">' +
          '<div class="field"><label>今日评分</label>' +
            '<div class="star-row" id="archReviewStars"></div></div>' +
          '<div class="field"><label>今日总结（可选）</label>' +
            '<textarea id="archReviewNote" rows="4" placeholder="今天做得怎么样？有什么想记录的？" style="width:100%;resize:vertical"></textarea></div>' +
          '<div class="field"><label>📝 导出格式</label>' +
            '<div style="display:flex;gap:8px">' +
              '<label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="archExportMd" checked> Markdown</label>' +
              '<label style="display:flex;align-items:center;gap:4px"><input type="checkbox" id="archExportPdf"> PDF</label>' +
            '</div></div>' +
        '</div>' +
        '<div class="modal-actions">' +
          '<button class="btn-cancel" onclick="closeArchiveSelfReview()">取消</button>' +
          '<button class="btn-primary ai-btn" id="btnArchiveConfirm" onclick="finalizeArchive(\'' + date + '\')">🤖 生成 AI 评价并存档</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  // 填充日期
  overlay.querySelector('.arch-head h3').textContent = '📦 存档 · ' + date;

  // 渲染星星评分
  var currentRating = store.progress[date] ? store.progress[date].rating || 0 : 0;
  var starHtml = '';
  for (var s = 1; s <= 5; s++) {
    starHtml += '<span class="star' + (s <= currentRating ? ' lit' : '') + '" onclick="setArchiveReviewRating(' + s + ')" id="archStar' + s + '">★</span>';
  }
  overlay.querySelector('#archReviewStars').innerHTML = starHtml;
  overlay.querySelector('#archReviewNote').value = (store.progress[date] && store.progress[date].note) ? store.progress[date].note : '';

  // 重置导出勾选
  var mdCb = overlay.querySelector('#archExportMd');
  var pdfCb = overlay.querySelector('#archExportPdf');
  if (mdCb) mdCb.checked = true;
  if (pdfCb) pdfCb.checked = false;

  overlay._archiveDate = date;
  overlay.classList.remove('hidden');
  overlay.classList.add('anim-open');
}

var _archiveSelfRating = 0;
function setArchiveReviewRating(r) {
  _archiveSelfRating = r;
  for (var s = 1; s <= 5; s++) {
    var el = document.getElementById('archStar' + s);
    if (el) { el.className = 'star' + (s <= r ? ' lit' : ''); }
  }
}

function closeArchiveSelfReview() {
  var overlay = document.getElementById('archiveReviewOverlay');
  if (overlay) {
    overlay.classList.add('hidden');
    overlay.classList.remove('anim-open', 'anim-done');
  }
  _archiveSelfRating = 0;
}

/** 最终确认存档：评分 + 文字 → archiveDay → AI 评价 → 导出 */
async function finalizeArchive(date) {
  var overlay = document.getElementById('archiveReviewOverlay');
  var btn = overlay ? overlay.querySelector('#btnArchiveConfirm') : null;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 存档中...'; }

  // 保存自评
  var note = overlay ? (overlay.querySelector('#archReviewNote').value || '').trim() : '';
  var rating = _archiveSelfRating || 0;

  if (!store.progress[date]) store.progress[date] = {};
  store.progress[date].rating = rating;
  store.progress[date].note = note;
  saveProgress();

  // 同步到每日数据
  syncStoreToDailyData(date);

  // 执行存档
  var ok = archiveDay(date);
  if (!ok) {
    toast('存档失败：无数据', 'err');
    if (btn) { btn.disabled = false; btn.textContent = '🤖 生成 AI 评价并存档'; }
    return;
  }

  // 尝试 AI 评价
  var aiCfg = (typeof getApiConfig === 'function') ? getApiConfig() : {};
  var hasKey = !!(aiCfg.apiKey && aiCfg.apiKey.trim());
  if (hasKey) {
    try {
      var aiReviewText = await requestAiArchiveReview(date);
      if (aiReviewText) {
        var data = getDailyData(date);
        if (data && data.archiveData) {
          data.archiveData.aiReview = aiReviewText;
          saveDailyData(date, data);
        }
      }
    } catch (e) { console.warn('AI 评价失败:', e); }
  }

  // 导出
  var exportMd = overlay ? !!(overlay.querySelector('#archExportMd') && overlay.querySelector('#archExportMd').checked) : true;
  var exportPdf = overlay ? !!(overlay.querySelector('#archExportPdf') && overlay.querySelector('#archExportPdf').checked) : false;
  if (exportMd) exportArchiveToMarkdown(date);
  if (exportPdf) exportArchiveToPDF(date);

  closeArchiveSelfReview();
  toast('📦 ' + date + ' 已存档' + (hasKey ? '（含 AI 评价）' : ''), 'ok');
  renderAll();
}

/* ── AI 评价 ─────────────────────────────── */

/** 获取用户配置的 AI 人设 prompt */
function getAiPersonaPrompt() {
  var prefs = LS.get('prefs', {});
  return prefs.aiPersonaPrompt || '';
}

/** 设置 AI 人设 prompt */
function setAiPersonaPrompt(prompt) {
  var prefs = LS.get('prefs', {});
  prefs.aiPersonaPrompt = prompt;
  LS.set('prefs', prefs);
}

/** 调用 AI 生成存档评价 */
function requestAiArchiveReview(date) {
  return new Promise(function(resolve, reject) {
    var cfg = getApiConfig();
    if (!cfg || !cfg.apiKey) { reject(new Error('无 API Key')); return; }

    var data = getDailyData(date);
    var summary = data && data.archiveData ? data.archiveData.summary : {};
    var selfReview = data && data.archiveData ? data.archiveData.selfReview : {};

    var personaPrompt = getAiPersonaPrompt();
    var systemPrompt = personaPrompt || '你是一位温和但严格的导师。你了解 ADHD 学习者的特点，先肯定用户的努力，再指出可以改进的地方，最后给一个明天的小建议。语气温暖、具体、不空洞。用中文回复，不超过 300 字。';

    var userPrompt = '请分析以下日期的完成情况并给出评价：\n\n' +
      '日期：' + date + '\n' +
      '任务完成：' + ((summary.tasks && summary.tasks.done) || 0) + '/' + ((summary.tasks && summary.tasks.total) || 0) + '\n' +
      '日常完成：' + ((summary.routines && summary.routines.done) || 0) + '/' + ((summary.routines && summary.routines.total) || 0) + '\n' +
      '用户自评分数：' + (selfReview.rating || 0) + '/5\n' +
      '用户自评总结：' + (selfReview.note || '(无)') + '\n\n' +
      '请从完成情况、心态评估、鼓励与建议三个方面进行简短的评价。';

    var url = (cfg.baseURL || 'https://api.deepseek.com').replace(/\/+$/, '');
    if (url.indexOf('/v1') === -1) url += '/v1';
    url += '/chat/completions';

    var body = {
      model: cfg.model || 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    };

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.apiKey.trim() },
      body: JSON.stringify(body),
    }).then(function(res) {
      if (!res.ok) return res.text().then(function(t) { throw new Error('HTTP ' + res.status + ': ' + t.slice(0, 100)); });
      return res.json();
    }).then(function(data) {
      var content = (data.choices && data.choices[0] && data.choices[0].message) ? data.choices[0].message.content : '';
      resolve(content);
    }).catch(function(err) {
      reject(err);
    });
  });
}

/* ── 导出 ────────────────────────────────── */

function exportArchiveToMarkdown(date) {
  var data = getDailyData(date);
  var arch = data && data.archiveData ? data.archiveData : null;
  var blocks = data ? data.blocks : [];
  var routines = data ? data.routines : [];
  var rp = data ? data.routineProgress : {};

  var md = '# DailyPlan 存档 · ' + date + '\n\n';

  if (arch) {
    md += '> 存档时间：' + new Date(arch.archivedAt).toLocaleString('zh-CN') + '\n\n';
    if (arch.selfReview && arch.selfReview.rating) {
      var stars = '';
      for (var s = 1; s <= 5; s++) stars += s <= arch.selfReview.rating ? '★' : '☆';
      md += '## 自评\n**评分：** ' + stars + '\n\n';
      if (arch.selfReview.note) md += arch.selfReview.note + '\n\n';
    }
    if (arch.aiReview) {
      md += '## AI 评价\n' + arch.aiReview + '\n\n';
    }
    if (arch.summary) {
      var sm = arch.summary;
      md += '## 统计\n' +
        '- 任务：' + ((sm.tasks && sm.tasks.done) || 0) + '/' + ((sm.tasks && sm.tasks.total) || 0) + '\n' +
        '- 日常：' + ((sm.routines && sm.routines.done) || 0) + '/' + ((sm.routines && sm.routines.total) || 0) + '\n\n';
    }
  }

  if (blocks.length) {
    md += '## 任务明细\n';
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var done = b.completed ? 'x' : ' ';
      md += '- [' + done + '] **' + (b.subject || '任务') + '** (' + (b.duration || 30) + ' 分钟)';
      var subs = b.subtasks || [];
      if (subs.length) {
        md += '\n';
        for (var si = 0; si < subs.length; si++) {
          md += '  - [' + (subs[si].done ? 'x' : ' ') + '] ' + (subs[si].text || '') + '\n';
        }
      } else {
        md += '\n';
      }
    }
  }

  if (routines.length) {
    md += '## 日常项\n';
    for (var ri = 0; ri < routines.length; ri++) {
      var r = routines[ri];
      var rd = rp[r.id] ? 'x' : ' ';
      md += '- [' + rd + '] ' + (r.name || '') + ' (' + (r.duration || 0) + ' 分钟)\n';
    }
  }

  downloadTextFile(date + '-DailyPlan.md', md);
  return md;
}

function exportArchiveToPDF(date) {
  var md = exportArchiveToMarkdown(date);
  // 将 markdown 包装为简易 HTML 后打印为 PDF
  var htmlContent = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>DailyPlan 存档 · ' + date + '</title>' +
    '<style>body{font-family:"Noto Serif SC",serif;max-width:700px;margin:40px auto;padding:20px;line-height:1.8;color:#1e2030}' +
    'h1{font-size:1.3rem}h2{font-size:1.1rem;margin-top:24px}' +
    'li{margin:4px 0}@media print{body{margin:0;padding:20px}}</style></head><body>' +
    md.replace(/\n/g, '<br>').replace(/## (.+)/g, '<h2>$1</h2>').replace(/- \[x\]/g, '☑').replace(/- \[ \]/g, '☐').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^# (.+)/gm, '<h1>$1</h1>').replace(/^> (.+)/gm, '<blockquote>$1</blockquote>') +
    '</body></html>';

  var blob = new Blob([htmlContent], { type: 'text/html' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = date + '-DailyPlan.pdf';
  a.click();
  URL.revokeObjectURL(url);
  toast('📄 PDF 已生成（建议用浏览器打印为 PDF 以获更好排版）', 'ok');
}

function downloadTextFile(filename, text) {
  var blob = new Blob([text], { type: 'text/markdown;charset=UTF-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  toast('📄 已导出 ' + filename, 'ok');
}

/* ── 自动存档 tick ────────────────────────── */

function tryArchive() {
  var now = new Date(), today = toLocalDate(now);
  var at = getArchiveTime();

  // 到达存档时间后存档今天
  var pastArchiveTime = now.getHours() > at.hour || (now.getHours() === at.hour && now.getMinutes() >= at.minute);
  if (pastArchiveTime) {
    var data = getDailyData(today);
    var hasTodayData = !!(data && data.blocks && data.blocks.length) ||
      (data && data.routineProgress && Object.keys(data.routineProgress).length > 0) ||
      (store.routineProgress[today] && Object.keys(store.routineProgress[today]).length > 0);
    if (!(data && data.archiveData) && hasTodayData) {
      // 同步数据
      syncStoreToDailyData(today);
      if (archiveDay(today)) {
        console.log('📦 Archived:', today);
      }
    }
  }

  // 凌晨补档昨天
  var y = new Date(now.getTime() - 86400000);
  var yesterday = toLocalDate(y);
  var yData = getDailyData(yesterday);
  var hasYesterdayData = !!(yData && yData.blocks && yData.blocks.length) ||
    (yData && yData.routineProgress && Object.keys(yData.routineProgress).length > 0);
  if (hasYesterdayData && !(yData && yData.archiveData)) {
    syncStoreToDailyData(yesterday);
    if (archiveDay(yesterday)) {
      console.log('📦 补档:', yesterday);
    }
  }
}

var _archiveTick = null;
function startArchiveTick() {
  if (_archiveTick) return;
  _archiveTick = setInterval(tryArchive, 60000);
  tryArchive();
}

/* ── Guard ──────────────────────────────── */

function guardEdit() {
  if (isDateLocked(store.currentDate)) {
    toast('📦 此日期已存档，仅供查看', 'err');
    return true;
  }
  return false;
}

function guardToggle() {
  if (isDateLocked(store.currentDate)) {
    toast('📦 此日期已存档，仅供查看', 'err');
    return true;
  }
  var now = new Date(), today = toLocalDate(now);
  if (store.currentDate === today) {
    var at = getArchiveTime();
    var h = now.getHours(), m = now.getMinutes();
    if (h > at.hour || (h === at.hour && m >= at.minute)) {
      toast('🌙 已过存档时间，任务已锁定', 'err');
      return true;
    }
    if (h < 4) {
      toast('🌙 凌晨 4:00 前任务暂不可操作，好好休息', 'err');
      return true;
    }
  }
  return false;
}

/* ═══════════════════════════════════════
   存档查看面板（Archive Viewer v9.0）
   ═══════════════════════════════════════ */

var _archiveView = { date: null };

async function openArchive() {
  _archiveView.date = null;
  _openWithAnim('archiveOverlay', function() {
    document.getElementById('archivePanel').innerHTML =
      '<div class="arch-head"><h3>📦 每日存档</h3><span class="arch-sub">加载中…</span></div>';
  });
  _closeWithAnim('modalOverlay');
  _closeWithAnim('focusOverlay');
  _closeWithAnim('shopOverlay');
  _closeWithAnim('ledgerOverlay');
  _closeWithAnim('accountingOverlay');

  // 合并本地存档索引
  var lsIdx = JSON.parse(localStorage.getItem('dp_archive_index') || '[]');
  var dates = {};
  var di;
  for (di = 0; di < lsIdx.length; di++) dates[lsIdx[di]] = true;

  // 也扫描 dp_day_data_{date} 中有 archiveData 的日期
  var now = new Date();
  for (var d = 0; d < 365; d++) {
    var checkDate = toLocalDate(new Date(now.getTime() - d * 86400000));
    var dd = getDailyData(checkDate);
    if (dd && dd.archiveData) dates[checkDate] = true;
  }

  var list = Object.keys(dates).sort().reverse();
  _renderArchiveList(list);
}

function closeArchive() { _closeWithAnim('archiveOverlay'); }
function closeArchiveIfOverlay(e) {
  if (e.target === document.getElementById('archiveOverlay')) closeArchive();
}

function _renderArchiveList(list) {
  var panel = document.getElementById('archivePanel');
  var today = toLocalDate(new Date());
  var at = getArchiveTime();

  var html = '<div class="arch-head"><h3>📦 每日存档</h3>' +
    '<span class="arch-sub">' + list.length + ' 天记录</span>' +
    '<span class="focus-close" onclick="closeArchive()">✕</span></div>';

  // 存档时间配置入口
  html += '<div class="arch-time-config">' +
    '<span>🕘 存档时间：</span>' +
    '<input type="number" id="archHourCfg" value="' + at.hour + '" min="0" max="23" style="width:50px" onchange="updateArchiveTimeCfg()">' +
    '<span>:</span>' +
    '<input type="number" id="archMinuteCfg" value="' + at.minute + '" min="0" max="59" style="width:50px" onchange="updateArchiveTimeCfg()">' +
    '<span class="f-hint">（到达该时间自动锁定当天）</span>' +
  '</div>';

  // 今天尚未存档时提供手动存档入口
  var todayData = getDailyData(today);
  if (!(todayData && todayData.archiveData) && (todayData || store.schedules[today])) {
    html += '<div class="arch-today-hint">' +
      '<span>📋 今天（' + today + '）尚未存档</span>' +
      '<button class="btn-secondary" onclick="triggerArchive(\'' + today + '\')">立即存档</button>' +
      '</div>';
  }

  if (!list.length) {
    html += '<div class="arch-empty"><div class="empty-icon">🗃</div><p>还没有任何存档</p>' +
      '<p class="arch-empty-sub">到达存档时间后自动存档，或点击上方「立即存档」</p></div>';
  } else {
    html += '<div class="arch-list">';
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      var dd = getDailyData(d);
      var arch = dd && dd.archiveData ? dd.archiveData : null;
      var summary = arch ? arch.summary : (getDailyHistory(d) || {});
      var tDone = summary && summary.tasks ? summary.tasks.done : 0;
      var tTotal = summary && summary.tasks ? summary.tasks.total : 0;
      var rDone = summary && summary.routines ? summary.routines.done : 0;
      var rTotal = summary && summary.routines ? summary.routines.total : 0;
      var total = tTotal + rTotal, done = tDone + rDone;
      var pct = total ? Math.round(done / total * 100) : 0;
      var dow = ['周日','周一','周二','周三','周四','周五','周六'][new Date(d + 'T00:00:00').getDay()];
      var hasAi = arch && arch.aiReview ? ' 🤖' : '';
      html += '<div class="arch-item" onclick="viewArchive(\'' + d + '\')">' +
        '<div class="arch-item-main"><span class="arch-date">' + d + '</span><span class="arch-dow">' + dow + '</span></div>' +
        '<div class="arch-item-stats"><span>' + done + '/' + total + ' 项' + hasAi + '</span>' +
        '<div class="arch-pbar"><div class="arch-pbar-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="arch-pct">' + pct + '%</span></div>' +
        '<span class="arch-chevron">›</span>' +
      '</div>';
    }
    html += '</div>';
  }
  panel.innerHTML = html;
}

function updateArchiveTimeCfg() {
  var h = parseInt(document.getElementById('archHourCfg').value) || 23;
  var m = parseInt(document.getElementById('archMinuteCfg').value) || 30;
  h = Math.min(23, Math.max(0, h));
  m = Math.min(59, Math.max(0, m));
  setArchiveTime(h, m);
  toast('存档时间已设为 ' + h + ':' + String(m).padStart(2, '0'), 'ok');
}

/** 查看某天的存档详情 */
function viewArchive(date) {
  _archiveView.date = date;
  var panel = document.getElementById('archivePanel');

  var data = getDailyData(date);
  if (!data) {
    // 尝试旧存档
    var oldArchive = localStorage.getItem(getArchiveKey(date));
    if (oldArchive) {
      try { data = JSON.parse(oldArchive); } catch (e) {}
    }
  }

  if (!data) {
    var dow = ['周日','周一','周二','周三','周四','周五','周六'][new Date(date + 'T00:00:00').getDay()];
    panel.innerHTML = '<div class="arch-head"><h3>📦 ' + date + ' · ' + dow + '</h3><span class="focus-close" onclick="closeArchive()">✕</span></div>' +
      '<div class="arch-empty"><p>未找到该日期的存档数据</p></div>' +
      '<div class="arch-actions"><button class="btn-secondary" onclick="openArchive()">← 返回列表</button></div>';
    return;
  }

  // 兼容旧格式（dp_archive_{date}）和新格式（dp_day_data_{date}）
  var arch = data.archiveData || null;
  var blocks, routines, rp, prog, summary, archivedAt;

  if (arch) {
    // 新格式：从 dp_day_data_{date} 读
    blocks = data.blocks || [];
    routines = data.routines || [];
    rp = data.routineProgress || {};
    prog = data.progress || {};
    summary = arch.summary || {};
    archivedAt = arch.archivedAt;
  } else if (data.schedule) {
    // 旧格式：dp_archive_{date}
    blocks = (data.schedule.blocks || []);
    routines = data.routines || [];
    rp = data.routineProgress || {};
    prog = data.progress || {};
    summary = data.summary || {};
    archivedAt = data.archivedAt;
  } else {
    blocks = [];
    routines = [];
    rp = {};
    prog = {};
    summary = {};
    archivedAt = '';
  }

  var dow = ['周日','周一','周二','周三','周四','周五','周六'][new Date(date + 'T00:00:00').getDay()];
  var html = '<div class="arch-head"><h3>📦 ' + date + ' · ' + dow + '</h3>' +
    '<span class="focus-close" onclick="closeArchive()">✕</span></div>';

  if (archivedAt) {
    html += '<div class="arch-meta">存档于 ' + new Date(archivedAt).toLocaleString('zh-CN') + '</div>';
  }

  // AI 评价优先展示
  if (arch && arch.aiReview) {
    html += '<div class="arch-ai-review"><div class="arch-sec-title">🤖 AI 评价</div>' +
      '<div class="arch-ai-text">' + escapeHtml(arch.aiReview) + '</div></div>';
  }

  // 自评
  var selfRev = arch ? arch.selfReview : null;
  if (selfRev && (selfRev.rating || selfRev.note)) {
    html += '<div class="arch-sec-title">💭 自评</div><div class="arch-feedback">';
    if (selfRev.rating) {
      html += '<div class="arch-stars">';
      for (var s = 1; s <= 5; s++) html += '<span class="star' + (s <= selfRev.rating ? ' lit' : '') + '">★</span>';
      html += '</div>';
    }
    if (selfRev.note) html += '<p class="arch-note">' + escapeHtml(selfRev.note) + '</p>';
    html += '</div>';
  } else if (!arch && (prog.note || prog.rating)) {
    html += '<div class="arch-sec-title">💭 当日反馈</div><div class="arch-feedback">';
    if (prog.rating) {
      html += '<div class="arch-stars">';
      for (s = 1; s <= 5; s++) html += '<span class="star' + (s <= prog.rating ? ' lit' : '') + '">★</span>';
      html += '</div>';
    }
    if (prog.note) html += '<p class="arch-note">' + escapeHtml(prog.note) + '</p>';
    html += '</div>';
  }

  // 统计概览
  var tDone = summary.tasks ? summary.tasks.done : 0, tTotal = summary.tasks ? summary.tasks.total : blocks.length;
  var rDone = summary.routines ? summary.routines.done : 0, rTotal = summary.routines ? summary.routines.total : routines.length;
  var total = tTotal + rTotal, done = tDone + rDone;
  var pct = total ? Math.round(done / total * 100) : 0;
  html += '<div class="arch-summary">' +
    '<div class="arch-stat"><span class="arch-stat-num">' + pct + '%</span><span class="arch-stat-label">完成率</span></div>' +
    '<div class="arch-stat"><span class="arch-stat-num">' + tDone + '/' + tTotal + '</span><span class="arch-stat-label">任务</span></div>' +
    '<div class="arch-stat"><span class="arch-stat-num">' + rDone + '/' + rTotal + '</span><span class="arch-stat-label">日常</span></div>' +
  '</div>';

  // 任务明细
  if (blocks.length) {
    html += '<div class="arch-sec-title">📋 任务</div><div class="arch-detail-list">';
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      var subs = b.subtasks || [];
      var subDone = subs.filter(function(st) { return st.done; }).length;
      html += '<div class="arch-detail-item' + (b.completed ? ' done' : '') + '">' +
        '<span class="arch-detail-check">' + (b.completed ? '✓' : '') + '</span>' +
        '<span class="arch-detail-icon">' + (b.icon || '📌') + '</span>' +
        '<span class="arch-detail-label">' + escapeHtml(b.subject || b.title || '任务') + '</span>' +
        (subs.length ? '<span class="arch-detail-sub">' + subDone + '/' + subs.length + '</span>' : '') +
      '</div>';
    }
    html += '</div>';
  }

  // 日课明细
  if (routines.length) {
    html += '<div class="arch-sec-title">🔁 日常项</div><div class="arch-detail-list">';
    for (var j = 0; j < routines.length; j++) {
      var r = routines[j];
      var rDoneFlag = !!rp[r.id];
      html += '<div class="arch-detail-item' + (rDoneFlag ? ' done' : '') + '">' +
        '<span class="arch-detail-check">' + (rDoneFlag ? '✓' : '') + '</span>' +
        '<span class="arch-detail-icon">' + (r.icon || '🔁') + '</span>' +
        '<span class="arch-detail-label">' + escapeHtml(r.name || r.label || '固定事务') + '</span>' +
      '</div>';
    }
    html += '</div>';
  }

  // 导出按钮
  html += '<div class="arch-actions">' +
    '<button class="btn-secondary" onclick="openArchive()">← 返回列表</button>' +
    '<button class="btn-secondary" onclick="exportArchiveToMarkdown(\'' + date + '\')">📄 导出 MD</button>' +
    '<button class="btn-secondary" onclick="exportArchiveToPDF(\'' + date + '\')">📕 导出 PDF</button>' +
  '</div>';

  panel.innerHTML = html;
}
