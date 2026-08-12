/* ═══════════════════════════════════════
   ledger.js — XP ledger + Accounting UI (v9.0)
   ═══════════════════════════════════════ */
'use strict';

/* ── Ledger Overlay ─────────────────────────────── */

var _ledgerFilter = { from: '', to: '' };

function openLedger() {
  if (!document.getElementById('modalOverlay').classList.contains('hidden')) closeModal();
  if (!document.getElementById('shopOverlay').classList.contains('hidden')) closeShop();
  if (!document.getElementById('focusOverlay').classList.contains('hidden')) closeFocus();
  if (!document.getElementById('accountingOverlay').classList.contains('hidden')) closeAccounting();
  var d = new Date();
  var to = toLocalDate(d);
  d.setDate(d.getDate() - 30);
  var from = toLocalDate(d);
  _ledgerFilter = { from: from, to: to };
  renderLedger();
  document.getElementById('ledgerOverlay').classList.remove('hidden');
}

function closeLedger() {
  document.getElementById('ledgerOverlay').classList.add('hidden');
}

function closeLedgerIfOverlay(e) {
  if (e.target === document.getElementById('ledgerOverlay')) closeLedger();
}

function renderLedger() {
  var filter = _ledgerFilter;
  var from = filter.from, to = filter.to;
  var entries = getLedger(from, to);
  var summary = getLedgerSummary(from, to);
  var lvl = (typeof getLevel === 'function') ? getLevel() : 1;

  document.getElementById('ledgerPanel').innerHTML =
    '<span class="shop-close" onclick="closeLedger()">✕</span>' +
    '<h2>⭐ XP 明细 · Lv.' + lvl + '</h2>' +
    '<div class="ledger-summary">' +
      '<div class="ledger-stat earn"><span>📈 总收入</span><strong>+' + summary.totalEarned + ' XP</strong></div>' +
      '<div class="ledger-stat spend"><span>📉 总支出</span><strong>-' + summary.totalSpent + ' XP</strong></div>' +
      '<div class="ledger-stat net" style="color:' + (summary.net >= 0 ? 'var(--green)' : 'var(--red)') + '"><span>💰 净额</span><strong>' + (summary.net >= 0 ? '+' : '') + summary.net + ' XP</strong></div>' +
      '<div class="ledger-stat"><span>📊 笔数</span><strong>' + summary.count + '</strong></div>' +
    '</div>' +
    '<div class="ledger-filters">' +
      '<label>从: <input type="date" id="ledgerFrom" value="' + from + '" onchange="_ledgerFilter.from=this.value;renderLedger()"></label>' +
      '<label>到: <input type="date" id="ledgerTo" value="' + to + '" onchange="_ledgerFilter.to=this.value;renderLedger()"></label>' +
      '<button class="btn-ledger-quick" onclick="setLedgerRange(7)">近7天</button>' +
      '<button class="btn-ledger-quick" onclick="setLedgerRange(30)">近30天</button>' +
      '<button class="btn-ledger-quick" onclick="setLedgerRange(90)">近90天</button>' +
    '</div>' +
    '<div class="ledger-table-wrap">' +
      '<table class="ledger-table">' +
        '<thead><tr><th>时间</th><th>类型</th><th>金额</th><th>余额</th><th>说明</th></tr></thead>' +
        '<tbody>' + (entries.length === 0
          ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-tertiary)">暂无记录</td></tr>'
          : entries.map(function(e) {
              return '<tr class="ledger-row ' + e.type + '">' +
                '<td class="ledger-time">' + new Date(e.createdAt).toLocaleString('zh-CN', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) + '</td>' +
                '<td><span class="ledger-tag ' + e.type + '">' + (e.type === 'earn' ? '📈 收入' : '📉 支出') + '</span></td>' +
                '<td class="ledger-amt ' + e.type + '">' + (e.type === 'earn' ? '+' : '-') + e.amount + ' XP</td>' +
                '<td class="ledger-bal">' + e.balanceAfter + ' XP</td>' +
                '<td class="ledger-reason">' + escapeHtml(e.reason) + '</td>' +
              '</tr>';
            }).join('')
          ) +
        '</tbody>' +
      '</table>' +
    '</div>';
}

function setLedgerRange(days) {
  var to = toLocalDate(new Date());
  var d = new Date(); d.setDate(d.getDate() - days);
  var from = toLocalDate(d);
  _ledgerFilter = { from: from, to: to };
  document.getElementById('ledgerFrom').value = from;
  document.getElementById('ledgerTo').value = to;
  renderLedger();
}

/* ═══════════════════════════════════════
   Accounting Overlay — v2 重写

   时间段筛选 + 饼图（支出分类）+ 条形图（收支趋势）
   Canvas 渲染，不依赖外部库。
   ═══════════════════════════════════════ */

/* ── State ── */
var _accPeriod = 'month';      // 'week' | 'month' | 'quarter' | 'year' | 'custom'
var _accFrom = '';
var _accTo = '';
var _accType = 'expense';
var _accCat = '';
var _accEditId = null;
var _accDraft = { amount: '', desc: '' };
var _accShowCharts = true;     // toggle charts section
var _accShowEntries = true;    // toggle entries list
var _accShowManageCats = false; // category management pane

var CHART_COLORS = [
  '#c23b2a', '#2d7a52', '#1a4470', '#b07630', '#885028',
  '#6a5acd', '#288868', '#a83860', '#5068c0', '#507830',
  '#b8443a', '#886018', '#8a3a3a', '#5a7a4a', '#706050',
];

/* ── init / derive period ── */
function _accInitPeriod() {
  var now = new Date();
  var today = toLocalDate(now);
  if (!_accFrom) _accFrom = today;
  if (!_accTo) _accTo = today;
  _accApplyPeriod();
}

function _accApplyPeriod() {
  var now = new Date();
  var today = toLocalDate(now);
  switch (_accPeriod) {
    case 'week':
      var dow = now.getDay() || 7; // Mon=1..Sun=7
      var mon = new Date(now.getTime() - (dow - 1) * 86400000);
      _accFrom = toLocalDate(mon);
      _accTo = today;
      break;
    case 'month':
      _accFrom = today.slice(0, 7) + '-01';
      _accTo = today;
      break;
    case 'quarter':
      var m = now.getMonth();
      var qStart = m - (m % 3);
      now.setMonth(qStart);
      now.setDate(1);
      _accFrom = toLocalDate(now);
      _accTo = today;
      break;
    case 'year':
      _accFrom = today.slice(0, 4) + '-01-01';
      _accTo = today;
      break;
    case 'custom':
      // keep existing _accFrom / _accTo
      break;
  }
}

function _accSetPeriod(p) {
  _accPeriod = p;
  _accApplyPeriod();
  _accEditId = null;
  renderAccounting();
}

function _accSetCustomRange() {
  var f = document.getElementById('accFrom').value;
  var t = document.getElementById('accTo').value;
  if (!f || !t) return;
  if (f > t) { toast('起始日期不能晚于结束日期', 'err'); return; }
  _accPeriod = 'custom';
  _accFrom = f;
  _accTo = t;
  _accEditId = null;
  renderAccounting();
}

/* ── Open / Close (overlay-anim compatible) ── */
function openAccounting() {
  // 隐私保护：未登录用户不能使用记账功能
  if (!store.user) {
    toast('请先登录以使用记账功能', 'err');
    if (typeof openAuthOverlay === 'function') openAuthOverlay('login');
    return;
  }
  if (!document.getElementById('modalOverlay').classList.contains('hidden')) closeModal();
  if (!document.getElementById('shopOverlay').classList.contains('hidden')) closeShop();
  if (!document.getElementById('focusOverlay').classList.contains('hidden')) closeFocus();
  if (!document.getElementById('ledgerOverlay').classList.contains('hidden')) closeLedger();
  if (!document.getElementById('archiveOverlay').classList.contains('hidden')) closeArchive();
  _accPeriod = 'month';
  _accType = 'expense';
  _accCat = '';
  _accEditId = null;
  _accDraft = { amount: '', desc: '' };
  _accShowCharts = true;
  _accShowEntries = true;
  _accShowManageCats = false;
  _accApplyPeriod();
  renderAccounting();
  document.getElementById('accountingOverlay').classList.remove('hidden');
}

function closeAccounting() {
  document.getElementById('accountingOverlay').classList.add('hidden');
}

function closeAccountingIfOverlay(e) {
  if (e.target === document.getElementById('accountingOverlay')) closeAccounting();
}

/* ── Category management helpers ── */
function _accGetCats() {
  return getAccountingCategories();
}

function _accSaveCats(cats) {
  saveAccountingCategories(cats);
}

function _accAddCategory(type, name) {
  var cats = _accGetCats();
  if (cats[type].indexOf(name) !== -1) { toast('分类已存在', 'err'); return; }
  cats[type].push(name);
  _accSaveCats(cats);
  _accCat = name;
  _accDraft = { amount: '', desc: '' };
  renderAccounting();
  _accRestoreFormDraft();
  toast('已添加分类: ' + name, 'ok');
}

function _accRemoveCategory(type, name) {
  var cats = _accGetCats();
  var idx = cats[type].indexOf(name);
  if (idx === -1) return;
  cats[type].splice(idx, 1);
  _accSaveCats(cats);
  if (_accCat === name) _accCat = '';
  _accDraft = { amount: '', desc: '' };
  renderAccounting();
  _accRestoreFormDraft();
}

/* ── Main render ── */
function renderAccounting() {
  if (!_accFrom || !_accTo) _accInitPeriod();

  var summary = getAccountingRangeSummary(_accFrom, _accTo);
  var detail = getAccountingRangeDetail(_accFrom, _accTo);
  var cats = _accGetCats();

  // Filter entries by period
  var periodEntries = detail.entries.slice().reverse();

  var html = '<span class="shop-close" onclick="closeAccounting()">✕</span>' +
    '<h2>📒 记账本</h2>';

  // ── Period selector ──
  html += _renderAccPeriodBar();

  // ── Summary cards ──
  html += _renderAccSummary(summary);

  // ── Charts section ──
  html += _renderAccCharts(detail, summary);

  // ── Entry form ──
  html += _renderAccForm(cats);

  // ── Manage categories pane ──
  if (_accShowManageCats) {
    html += _renderAccManageCats(cats);
  }

  // ── Entries list ──
  html += '<div class="acc-section-header" onclick="_accToggleEntries()">' +
    '📋 收支明细 (' + periodEntries.length + '条) ' +
    '<span class="acc-toggle">' + (_accShowEntries ? '▲' : '▼') + '</span></div>';
  if (_accShowEntries) {
    html += '<div class="acc-entries">' +
      (periodEntries.length === 0
        ? '<div class="acc-empty">该时间段还没有收支记录</div>'
        : periodEntries.map(function(e) { return _renderAccEntryRow(e); }).join('')) +
    '</div>';
  }

  document.getElementById('accountingPanel').innerHTML = html;

  // Draw charts after DOM is ready
  if (_accShowCharts) {
    setTimeout(function() {
      _drawPieChart(detail);
      _drawBarChart(detail, _accFrom, _accTo);
    }, 50);
  }
}

/* ── Period bar ── */
function _renderAccPeriodBar() {
  var periods = [
    { key: 'week', label: '本周' },
    { key: 'month', label: '本月' },
    { key: 'quarter', label: '近三月' },
    { key: 'year', label: '今年' },
    { key: 'custom', label: '自定义' },
  ];
  var html = '<div class="acc-period-bar">';
  html += '<div class="acc-period-btns">';
  for (var i = 0; i < periods.length; i++) {
    var p = periods[i];
    html += '<button class="acc-period-btn' + (_accPeriod === p.key ? ' active' : '') + '" onclick="_accSetPeriod(\'' + p.key + '\')">' + p.label + '</button>';
  }
  html += '</div>';
  html += '<div class="acc-period-custom' + (_accPeriod === 'custom' ? '' : ' acc-period-custom-hide') + '">';
  html += '<label>从: <input type="date" id="accFrom" value="' + _accFrom + '" onchange="_accSetCustomRange()"></label>';
  html += '<label>到: <input type="date" id="accTo" value="' + _accTo + '" onchange="_accSetCustomRange()"></label>';
  html += '</div></div>';
  return html;
}

/* ── Summary cards ── */
function _renderAccSummary(summary) {
  var netClass = summary.net >= 0 ? 'pos' : 'neg';
  var netSign = summary.net >= 0 ? '+' : '';
  return '<div class="acc-summary-cards">' +
    '<div class="acc-summary-card income"><span class="acc-sum-label">总收入</span><span class="acc-sum-num">+' + summary.totalIncome + '</span></div>' +
    '<div class="acc-summary-card expense"><span class="acc-sum-label">总支出</span><span class="acc-sum-num">-' + summary.totalExpense + '</span></div>' +
    '<div class="acc-summary-card net ' + netClass + '"><span class="acc-sum-label">结余</span><span class="acc-sum-num">' + netSign + summary.net + '</span></div>' +
    '<div class="acc-summary-card"><span class="acc-sum-label">期间</span><span class="acc-sum-num acc-period-label">' + _accFrom + ' ~ ' + _accTo + '</span></div>' +
  '</div>';
}

/* ── Charts section ── */
function _renderAccCharts(detail, summary) {
  var hasData = summary.totalIncome > 0 || summary.totalExpense > 0;
  var catsCount = Object.keys(detail.catExpense).length;
  var html = '<div class="acc-section-header" onclick="_accToggleCharts()">' +
    '📊 图表分析 <span class="acc-toggle">' + (_accShowCharts ? '▲' : '▼') + '</span></div>';
  if (!_accShowCharts) return html;

  html += '<div class="acc-charts">';
  if (!hasData) {
    html += '<div class="acc-empty">暂无数据可展示图表</div>';
  } else {
    html += '<div class="acc-chart-row">' +
      '<div class="acc-chart-box"><div class="acc-chart-title">支出分类占比</div><canvas id="accPieCanvas" width="280" height="280"></canvas></div>' +
      '<div class="acc-chart-box"><div class="acc-chart-title">收支趋势</div><canvas id="accBarCanvas" width="420" height="280"></canvas></div>' +
    '</div>';
  }
  html += '</div>';
  return html;
}

/* ── Form ── */
function _renderAccForm(cats) {
  var typeCats = cats[_accType] || [];
  if (!_accCat || typeCats.indexOf(_accCat) === -1) _accCat = typeCats[0] || '';
  var editing = _accEditId !== null;

  var html = '<div class="acc-section-header" onclick="">' +
    '✏️ ' + (editing ? '编辑条目' : '记一笔') + '</div>' +
    '<div class="acc-form' + (editing ? ' editing' : '') + '">' +

    // type toggle
    '<div class="acc-type-seg">' +
      '<button class="' + (_accType === 'expense' ? 'active' : '') + '" onclick="_accChangeType(\'expense\')">💸 支出</button>' +
      '<button class="' + (_accType === 'income' ? 'active' : '') + '" onclick="_accChangeType(\'income\')">💰 收入</button>' +
    '</div>' +

    // category chips
    '<div class="acc-cat-chips">';
  for (var i = 0; i < typeCats.length; i++) {
    var c = typeCats[i];
    html += '<button class="acc-cat-chip' + (c === _accCat ? ' active' : '') + '" onclick="_accPickCat(\'' + c.replace(/'/g, "\\'") + '\')">' + escapeHtml(c) + '</button>';
  }
  html += '<button class="acc-cat-chip acc-cat-add-btn" onclick="_accToggleManageCats()" title="管理分类">+ 分类</button>';
  html += '</div>';

  // input row
  html += '<div class="acc-input-row">' +
    '<div class="acc-amount-wrap"><span class="acc-yen">¥</span><input type="number" id="accAmount" placeholder="0" min="1" max="999999"></div>' +
    '<input type="text" id="accDesc" placeholder="说明（可选）" style="flex:1">' +
    '<input type="date" id="accEntryDate" value="' + _accDateOfEntry() + '" style="padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg);color:var(--text);font-size:.8rem;width:130px">' +
    '<button class="btn-save" onclick="submitAccEntry()">' + (editing ? '保存' : '添加') + '</button>' +
    (editing ? '<button class="btn-cancel" onclick="cancelAccEdit()">取消</button>' : '') +
  '</div>';

  html += '</div>';
  return html;
}

function _accDateOfEntry() {
  // For new entries, use today by default; period can be different
  return toLocalDate(new Date());
}

/* ── Manage categories pane ── */
function _renderAccManageCats(cats) {
  var html = '<div class="acc-manage-cats">' +
    '<div class="acc-manage-head">管理分类 <button class="btn-cancel" onclick="_accToggleManageCats()" style="padding:2px 8px;font-size:.7rem">关闭</button></div>';

  // Income categories
  html += '<div class="acc-manage-group"><strong>收入分类</strong>';
  for (var i = 0; i < cats.income.length; i++) {
    html += '<span class="acc-manage-tag">' + escapeHtml(cats.income[i]) + '<button onclick="_accRemoveCategory(\'income\',\'' + cats.income[i].replace(/'/g, "\\'") + '\')">✕</button></span>';
  }
  html += '</div>';
  html += '<div class="acc-manage-add-row"><input type="text" id="accNewIncCat" placeholder="新收入分类"><button onclick="_accAddFromInput(\'income\')">+</button></div>';

  // Expense categories
  html += '<div class="acc-manage-group"><strong>支出分类</strong>';
  for (var j = 0; j < cats.expense.length; j++) {
    html += '<span class="acc-manage-tag">' + escapeHtml(cats.expense[j]) + '<button onclick="_accRemoveCategory(\'expense\',\'' + cats.expense[j].replace(/'/g, "\\'") + '\')">✕</button></span>';
  }
  html += '</div>';
  html += '<div class="acc-manage-add-row"><input type="text" id="accNewExpCat" placeholder="新支出分类"><button onclick="_accAddFromInput(\'expense\')">+</button></div>';

  html += '</div>';
  return html;
}

function _accAddFromInput(type) {
  var id = type === 'income' ? 'accNewIncCat' : 'accNewExpCat';
  var el = document.getElementById(id);
  if (!el || !el.value.trim()) return;
  _accAddCategory(type, el.value.trim());
  el.value = '';
}

function _accChangeType(t) {
  _accSaveFormDraft();
  _accType = t;
  _accCat = '';
  renderAccounting();
  _accRestoreFormDraft();
}

function _accPickCat(c) {
  _accSaveFormDraft();
  _accCat = c;
  renderAccounting();
  _accRestoreFormDraft();
}

function _accToggleCharts() {
  _accShowCharts = !_accShowCharts;
  renderAccounting();
}

function _accToggleEntries() {
  _accShowEntries = !_accShowEntries;
  renderAccounting();
}

function _accToggleManageCats() {
  _accShowManageCats = !_accShowManageCats;
  renderAccounting();
}

/* ── Form draft save/restore ── */
function _accSaveFormDraft() {
  var a = document.getElementById('accAmount');
  var d = document.getElementById('accDesc');
  if (a) _accDraft.amount = a.value;
  if (d) _accDraft.desc = d.value;
}
function _accRestoreFormDraft() {
  var a = document.getElementById('accAmount');
  var d = document.getElementById('accDesc');
  if (a && _accDraft.amount) a.value = _accDraft.amount;
  if (d && _accDraft.desc) d.value = _accDraft.desc;
}

/* ── Single entry row ── */
function _renderAccEntryRow(e) {
  var editing = e.id === _accEditId;
  return '<div class="acc-entry ' + e.type + (editing ? ' editing' : '') + '">' +
    '<span class="acc-entry-date">' + e.date.slice(5).replace('-', '/') + '</span>' +
    '<span class="acc-entry-icon">' + (e.type === 'income' ? '💰' : '💸') + '</span>' +
    '<span class="acc-entry-cat">' + escapeHtml(e.category) + '</span>' +
    '<span class="acc-entry-desc">' + escapeHtml(e.description || '—') + '</span>' +
    '<span class="acc-entry-amt ' + e.type + '">' + (e.type === 'income' ? '+' : '-') + e.amount + '</span>' +
    '<button class="acc-entry-edit" onclick="startAccEdit(\'' + e.id + '\',\'' + e.date + '\')" title="编辑">✎</button>' +
    '<button class="acc-entry-del" onclick="deleteAccEntry(\'' + e.date + '\',\'' + e.id + '\')" title="删除">✕</button>' +
  '</div>';
}

/* ── Submit (add or update) ── */
function submitAccEntry() {
  var amount = parseInt(document.getElementById('accAmount').value);
  var description = document.getElementById('accDesc').value.trim();
  var entryDate = document.getElementById('accEntryDate').value;
  if (!amount || amount <= 0) { toast('请输入有效金额', 'err'); return; }
  if (!entryDate) { entryDate = toLocalDate(new Date()); }

  if (_accEditId !== null) {
    var oldDate = document.getElementById('accEntryDate').dataset.origDate || entryDate;
    // If date changed, delete from old and add to new
    if (oldDate !== entryDate) {
      deleteAccountingEntry(oldDate, _accEditId);
      addAccountingEntry(entryDate, _accType, amount, _accCat, description);
      toast('已保存修改（日期已更新）', 'ok');
    } else {
      updateAccountingEntry(entryDate, _accEditId, {
        type: _accType, category: _accCat, amount: amount, description: description,
      });
      toast('已保存修改', 'ok');
    }
    _accEditId = null;
  } else {
    addAccountingEntry(entryDate, _accType, amount, _accCat, description);
    toast((_accType === 'income' ? '收入' : '支出') + ' ' + amount + ' 已记录', 'ok');
  }
  _accDraft = { amount: '', desc: '' };
  renderAccounting();
}

function startAccEdit(id, date) {
  var entries = getAccountingEntries(date);
  var e = null;
  for (var i = 0; i < entries.length; i++) { if (entries[i].id === id) { e = entries[i]; break; } }
  if (!e) return;
  _accEditId = id;
  _accType = e.type;
  _accCat = e.category;
  _accDraft = { amount: String(e.amount), desc: e.description || '' };
  renderAccounting();
  _accRestoreFormDraft();
  // Set date input and store original date for cross-date move support
  var di = document.getElementById('accEntryDate');
  if (di) { di.value = date; di.dataset.origDate = date; }
  var a = document.getElementById('accAmount');
  if (a) a.focus();
}

function cancelAccEdit() {
  _accEditId = null;
  _accDraft = { amount: '', desc: '' };
  renderAccounting();
}

function deleteAccEntry(date, id) {
  deleteAccountingEntry(date, id);
  if (_accEditId === id) _accEditId = null;
  renderAccounting();
  toast('已删除', 'err');
}

/* ═══════════════════════════════════════
   Canvas Chart Drawing
   ═══════════════════════════════════════ */

/**
 * Draw pie chart: expense by category on #accPieCanvas
 */
function _drawPieChart(detail) {
  var canvas = document.getElementById('accPieCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  var cats = Object.keys(detail.catExpense);
  // Already filtered to expense only in getAccountingRangeDetail
  if (cats.length === 0) {
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-tertiary').trim() || '#8a8990';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('暂无支出数据', w / 2, h / 2);
    return;
  }

  var values = [];
  var total = 0;
  for (var i = 0; i < cats.length; i++) {
    var v = detail.catExpense[cats[i]];
    values.push(v);
    total += v;
  }
  if (total === 0) return;

  var cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2 - 50;
  var angle = -Math.PI / 2; // start from top

  for (var j = 0; j < cats.length; j++) {
    var slice = (values[j] / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[j % CHART_COLORS.length];
    ctx.fill();

    // Label
    var midAngle = angle + slice / 2;
    var lx = cx + Math.cos(midAngle) * (r * 0.7);
    var ly = cy + Math.sin(midAngle) * (r * 0.7);
    var pct = Math.round((values[j] / total) * 100);
    if (pct >= 5) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pct + '%', lx, ly);
    }

    angle += slice;
  }

  // Legend
  var ly = h - 30;
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  var lx = 10;
  for (var k = 0; k < cats.length; k++) {
    var pctTxt = Math.round((values[k] / total) * 100) + '%';
    var txt = cats[k] + ' ' + pctTxt;
    var tw = ctx.measureText(txt).width;
    var totalW = tw + 18;
    if (lx + totalW > w - 10) { lx = 10; ly -= 16; }
    ctx.fillStyle = CHART_COLORS[k % CHART_COLORS.length];
    ctx.fillRect(lx, ly - 4, 8, 8);
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#55545a';
    ctx.fillText(txt, lx + 12, ly);
    lx += totalW + 14;
  }
}

/**
 * Draw bar chart: daily/weekly income vs expense on #accBarCanvas
 * Auto-chooses daily or weekly bars based on date range length
 */
function _drawBarChart(detail, from, to) {
  var canvas = document.getElementById('accBarCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var w = canvas.width;
  var h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  var days = [];
  var parts = from.split('-').map(Number);
  var cur = new Date(parts[0], parts[1] - 1, parts[2]);
  var toParts = to.split('-').map(Number);
  var end = new Date(toParts[0], toParts[1] - 1, toParts[2]);

  // Determine granularity: >60 days → weekly, else daily
  var diffDays = Math.round((end.getTime() - cur.getTime()) / 86400000) + 1;
  var useWeekly = diffDays > 60;

  if (useWeekly) {
    // Aggregate into weeks
    var weekData = [];
    var wStart = cur;
    var wi = 0;
    var wiIncome = 0, wiExpense = 0;
    while (cur <= end) {
      var ds = toLocalDate(cur);
      var dd = detail.daily[ds] || { income: 0, expense: 0 };
      wiIncome += dd.income;
      wiExpense += dd.expense;
      wi++;
      if (wi === 7 || cur.getTime() === end.getTime()) {
        weekData.push({ label: toLocalDate(wStart).slice(5).replace('-', '/'), income: wiIncome, expense: wiExpense });
        wStart = new Date(cur.getTime() + 86400000);
        wiIncome = 0; wiExpense = 0; wi = 0;
      }
      cur.setDate(cur.getDate() + 1);
    }
    days = weekData;
  } else {
    while (cur <= end) {
      var ds2 = toLocalDate(cur);
      var d2 = detail.daily[ds2] || { income: 0, expense: 0 };
      days.push({ label: ds2.slice(5).replace('-', '/'), income: d2.income, expense: d2.expense });
      cur.setDate(cur.getDate() + 1);
    }
  }

  if (days.length === 0) return;

  var maxVal = 1;
  for (var i = 0; i < days.length; i++) {
    if (days[i].income > maxVal) maxVal = days[i].income;
    if (days[i].expense > maxVal) maxVal = days[i].expense;
  }

  var pad = { top: 20, right: 20, bottom: 40, left: 50 };
  var plotW = w - pad.left - pad.right;
  var plotH = h - pad.top - pad.bottom;

  // Determine tick interval
  var maxTicks = Math.min(days.length, 12);
  var tickStep = Math.max(1, Math.ceil(days.length / maxTicks));

  // Y axis grid
  var ySteps = 4;
  var yStepVal = Math.ceil(maxVal / ySteps);
  if (yStepVal < 1) yStepVal = 1;
  ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--border').trim() || '#e8e4dc';
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-tertiary').trim() || '#8a8990';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'right';
  for (var yi = 0; yi <= ySteps; yi++) {
    var yv = yi * yStepVal;
    var yy = pad.top + plotH - (yv / maxVal) * plotH;
    ctx.beginPath();
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(w - pad.right, yy);
    ctx.stroke();
    ctx.fillText(String(yv), pad.left - 6, yy + 3);
  }

  // Bar width
  var barGap = Math.max(1, Math.min(4, plotW / days.length * 0.3));
  var groupW = (plotW - barGap * (days.length - 1)) / days.length;
  var barW = Math.max(2, (groupW - 2) / 2);

  // X axis labels
  ctx.textAlign = 'center';
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-tertiary').trim() || '#8a8990';
  for (var xi = 0; xi < days.length; xi++) {
    if (xi % tickStep !== 0) continue;
    var xx = pad.left + xi * (groupW + barGap) + groupW / 2;
    ctx.fillText(days[xi].label, xx, h - pad.bottom + 14);
  }

  // Bars
  var accent = getComputedStyle(document.body).getPropertyValue('--green').trim() || '#2d7a52';
  var red = getComputedStyle(document.body).getPropertyValue('--red').trim() || '#c23b2a';

  for (var bi = 0; bi < days.length; bi++) {
    var bx = pad.left + bi * (groupW + barGap);
    // Income bar (left side of group, green)
    var ih = (days[bi].income / maxVal) * plotH;
    if (ih > 0) {
      ctx.fillStyle = accent;
      ctx.fillRect(bx, pad.top + plotH - ih, barW, ih);
    }
    // Expense bar (right side of group, red)
    var eh = (days[bi].expense / maxVal) * plotH;
    if (eh > 0) {
      ctx.fillStyle = red;
      ctx.fillRect(bx + barW + 1, pad.top + plotH - eh, barW, eh);
    }
  }

  // Legend
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'left';
  var lx2 = w - pad.right - 100;
  var ly2 = pad.top - 10;
  ctx.fillStyle = accent;
  ctx.fillRect(lx2, ly2 - 5, 10, 10);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#55545a';
  ctx.fillText('收入', lx2 + 14, ly2 + 1);
  lx2 += 50;
  ctx.fillStyle = red;
  ctx.fillRect(lx2, ly2 - 5, 10, 10);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-secondary').trim() || '#55545a';
  ctx.fillText('支出', lx2 + 14, ly2 + 1);
}
