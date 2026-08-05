/* ═══════════════════════════════════════
   routines.js — 固定事务管理器（v8.1）

   用户可自行增删改每日固定事务：名称、备注、用时、晶圆数。
   预设保存到 dp_routines / 服务器 state key "routines"。
   固定事务与目标任务在时间轴中统一排序、统一渲染，仅视觉区分。

   数据结构：
   {
     id, name, note, duration(分钟), wafers,
     icon, category, priority, flowHint
   }
   ═══════════════════════════════════════ */
'use strict';

function migrateFixedTasks() {
  // 把旧 routines（日课，含 time）迁移为新固定事务（duration + wafers）
  // 同时丢弃无名称的垃圾条目（历史脏数据），防止时间轴出现无标题固定事务
  // v8.2：'固定事务' 字面量是旧迁移的兜底值，属于脏数据，一并丢弃
  var old = store.routines || [];
  var out = [];
  var changed = false;
  for (var i = 0; i < old.length; i++) {
    var r = old[i];
    var nm = ((r.name || r.label || '') + '').trim();
    if (!nm || nm === '固定事务') { changed = true; continue; }
    if (r.duration && typeof r.wafers === 'number' && r.name) {
      out.push(r);
      continue;
    }
    changed = true;
    var d = 0;
    if (r.time) {
      d = dur(r.time);
      if (d < 0) d = 0;
    }
    if (!d) d = 30;
    out.push({
      id:      r.id || ('ft_' + i + '_' + stableHash(nm)),
      name:    nm,
      note:    r.note || '',
      duration: d,
      wafers:  ROUTINE_REWARD * WAFER_VALUE,  // 默认 50 円
      icon:    r.icon || '🔁',
      category: 'life',
      priority: 'low',
      flowHint: '',
    });
  }
  if (changed) {
    store.routines = out;
    LS.set('routines', out);
    // 注意：迁移只清理本地缓存，不回写服务器。
    // 服务器同步由 fetchRoutinesFromServer（服务器优先）或用户显式保存触发，
    // 否则启动顺序 race 会用刚清空的本地数据覆盖掉服务器上的有效预设。
  }
}

function fetchRoutinesFromServer() {
  if (typeof API === 'undefined' || !API.getRoutines) return Promise.resolve(false);
  return API.getRoutines().then(function(res) {
    if (res.ok && res.data && res.data.length) {
      store.routines = res.data;
      LS.set('routines', store.routines);
      // 服务端返回的也可能是旧格式，尝试迁移
      if (typeof migrateFixedTasks === 'function') migrateFixedTasks();
      return true;
    }
    if ((store.routines || []).length) {
      API.saveRoutines(store.routines).catch(function() {});
    }
    return false;
  }).catch(function() { return false; });
}

function saveRoutines() {
  LS.set('routines', store.routines);
  if (typeof API !== 'undefined' && API.saveRoutines) {
    API.saveRoutines(store.routines).catch(function() {});
  }
}

function openRoutines() {
  _openWithAnim('routineOverlay', function() { _renderRoutinePanel(); });
  _closeWithAnim('modalOverlay');
  _closeWithAnim('focusOverlay');
  _closeWithAnim('shopOverlay');
  _closeWithAnim('ledgerOverlay');
  _closeWithAnim('accountingOverlay');
  _closeWithAnim('archiveOverlay');
  _closeWithAnim('goalOverlay');
}

function closeRoutines() { _closeWithAnim('routineOverlay'); }
function closeRoutinesIfOverlay(e) {
  if (e.target === document.getElementById('routineOverlay')) closeRoutines();
}

function _renderRoutinePanel() {
  var panel = document.getElementById('routinePanel');
  var html = '<div class="arch-head">' +
    '<h3>🔁 每日固定事务</h3>' +
    '<span class="arch-sub">' + (store.routines || []).length + ' 项 · 拖拽每行左侧 ⋮⋮ 即可排序</span>' +
    '<button class="btn-secondary" onclick="loadRoutineTemplate()">📄 加载示例</button>' +
    '<span class="focus-close" onclick="closeRoutines()">✕</span></div>';

  html += '<div class="r-list" id="rList">';
  var routines = store.routines || [];
  for (var i = 0; i < routines.length; i++) {
    html += _routineRowHTML(i, routines[i]);
  }
  html += '</div>';

  html += '<div class="r-actions">' +
    '<button class="btn-add-sub" onclick="addRoutineField()">＋ 添加固定事务</button>' +
    '<button class="btn-primary" onclick="saveRoutineForm()">💾 保存预设</button>' +
    '</div>';

  html += '<div class="r-tip">💡 每个日期的日课副本独立存储。修改仅影响今天；推送至模板后，新日期使用此预设。</div>';
  panel.innerHTML = html;

  // 绑定拖拽事件
  _bindRoutineDrag();
}

function _routineRowHTML(i, r) {
  var icon = r.icon || '🔁';
  return '<div class="r-row" draggable="true" data-idx="' + i + '" data-id="' + escapeHtml(r.id || '') + '">' +
    '<span class="r-drag-handle" title="拖拽排序">⋮⋮</span>' +
    '<button class="r-icon-btn" onclick="_openIconPicker(this,' + i + ')" title="选择图标">' + icon + '</button>' +
    '<input type="text" class="r-name" value="' + escapeHtml(r.name || '') + '" placeholder="名称，如 早餐" title="名称">' +
    '<input type="number" class="r-duration" value="' + (r.duration || '') + '" placeholder="分钟" title="用时（分钟）" style="width:70px">' +
    '<span class="r-wafers-fixed">💎 50</span>' +
    '<input type="text" class="r-note" value="' + escapeHtml(r.note || '') + '" placeholder="备注（可选）" title="备注">' +
    '<button class="btn-remove" onclick="removeRoutineField(this)">✕</button>' +
  '</div>';
}

function _openIconPicker(btn, idx) {
  var existing = document.querySelector('.r-icon-picker');
  if (existing) existing.remove();
  // 如果打开的是同一个按钮的 picker，只是关闭
  if (btn._pickerOpen) { btn._pickerOpen = false; return; }
  btn._pickerOpen = true;

  var COMMON_ICONS = '😴🥣🍚🍜🚿📖🎮🟢⚔️🏃🧘🎵📱💊🐱💧📝🎯☕🍵🧹🧺🛒🚶💻🎨🛌⏰🧠';
  var html = '<div class="r-icon-picker" onclick="event.stopPropagation();">';
  for (var i = 0; i < COMMON_ICONS.length; i += 2) {
    var ch = COMMON_ICONS.slice(i, i+2);
    html += '<button class="r-ip-emoji" onclick="var r=this.closest(\'.r-row\');var b=r.querySelector(\'.r-icon-btn\');b.textContent=\'' + ch + '\';this.closest(\'.r-icon-picker\').remove();">' + ch + '</button>';
  }
  html += '</div>';

  // 干掉父元素上的行级拖拽，保证按钮可点击
  var row = btn.closest('.r-row');
  if (row) { row.draggable = false; }

  var wrapper = document.createElement('span');
  wrapper.innerHTML = html;
  btn.parentNode.appendChild(wrapper.firstElementChild);

  // 按钮失焦或 picker 外部点击时关闭
  var pickerEl = document.querySelector('.r-icon-picker');
  if (pickerEl) {
    setTimeout(function(){
      var handler = function(ev) {
        if (!pickerEl.contains(ev.target)) {
          pickerEl.remove();
          if (row) row.draggable = true;
          btn._pickerOpen = false;
          document.removeEventListener('click', handler);
        }
      };
      document.addEventListener('click', handler);
    }, 0);
  }
}

function addRoutineField() {
  var list = document.getElementById('rList');
  var idx = list.children.length;
  var empty = {icon:'🔁', name:'', duration:30, note:''};
  list.insertAdjacentHTML('beforeend', _routineRowHTML(idx, empty));
  var rows = list.querySelectorAll(':scope > .r-row');
  var last = rows[rows.length - 1];
  if (last) last.querySelector('.r-name').focus();
  // 新行必须绑定拖拽事件
  _bindRoutineDrag();
}

function removeRoutineField(btn) {
  var row = btn.closest('.r-row');
  if (row) row.remove();
  // 重新编号
  var updated = document.querySelectorAll('#rList > .r-row');
  for (var j = 0; j < updated.length; j++) {
    updated[j].setAttribute('data-idx', j);
    var b = updated[j].querySelector('.btn-remove');
    if (b) b.setAttribute('onclick', 'removeRoutineField(this)');
  }
  // 重新绑定（drag handlers 里存的 idx 已过时）
  _bindRoutineDrag();
}

function saveRoutineForm() {
  var rows = document.querySelectorAll('#rList > .r-row');
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var name = rows[i].querySelector('.r-name').value.trim();
    if (!name) continue;
    var duration = parseInt(rows[i].querySelector('.r-duration').value) || 30;
    out.push({
      id:       rows[i].getAttribute('data-id') || ('ft_' + i + '_' + stableHash(name)),
      icon:     rows[i].querySelector('.r-icon-btn').textContent.trim() || '🔁',
      name:     name,
      duration: duration,
      wafers:   ROUTINE_REWARD * WAFER_VALUE,  // 固定 50 円
      note:     rows[i].querySelector('.r-note').value.trim(),
      category: 'life',
      priority: 'low',
      flowHint: '',
    });
  }
  store.routines = out;
  saveRoutines();
  renderTimeline();
  renderHeroProgress();
  // 保存后刷新面板保持 data-id 同步 + 拖拽重新绑定
  _renderRoutinePanel();
  _bindRoutineDrag();
  toast('已保存 ' + out.length + ' 项固定事务预设', 'ok');
}

function _bindRoutineDrag() {
  var list = document.getElementById('rList');
  if (!list) return;
  var rows = list.querySelectorAll(':scope > .r-row');
  rows.forEach(function(row) {
    row.addEventListener('dragstart', function(e) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.getAttribute('data-idx'));
      row.classList.add('r-dragging');
    });
    row.addEventListener('dragend', function() { row.classList.remove('r-dragging'); });
    row.addEventListener('dragover', function(e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('r-drag-over');
    });
    row.addEventListener('dragleave', function() { row.classList.remove('r-drag-over'); });
    row.addEventListener('drop', function(e) {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('r-drag-over');
      var fromIdx = parseInt(e.dataTransfer.getData('text/plain'));
      var toIdx = parseInt(row.getAttribute('data-idx'));
      if (isNaN(fromIdx) || isNaN(toIdx) || fromIdx === toIdx) return;
      var allRows = list.querySelectorAll(':scope > .r-row');
      var fromRow = allRows[fromIdx];
      if (!fromRow) return;
      fromRow.parentNode.removeChild(fromRow);
      if (fromIdx < toIdx) {
        row.parentNode.insertBefore(fromRow, row.nextSibling);
      } else {
        row.parentNode.insertBefore(fromRow, row);
      }
      // 重新编号
      var updated = list.querySelectorAll(':scope > .r-row');
      for (var j = 0; j < updated.length; j++) {
        updated[j].setAttribute('data-idx', j);
        var b = updated[j].querySelector('.btn-remove');
        if (b) b.setAttribute('onclick', 'removeRoutineField(this)');
        var ib = updated[j].querySelector('.r-icon-btn');
        if (ib) ib.setAttribute('onclick', '_openIconPicker(this,' + j + ')');
      }
    });
  });
}

function loadRoutineTemplate() {
  // 参数化模板 — 仅作为用户填写示例，不使用具体硬编码数据
  var tpl = [
    {name:'', duration:30, icon:'🔁', note:''},
    {name:'', duration:30, icon:'🔁', note:''},
    {name:'', duration:30, icon:'🔁', note:''},
  ];
  var list = document.getElementById('rList');
  list.innerHTML = '';
  for (var i = 0; i < tpl.length; i++) {
    tpl[i].wafers = ROUTINE_REWARD * WAFER_VALUE;
    tpl[i].category = 'life';
    tpl[i].priority = 'low';
    var row = document.createElement('div');
    row.className = 'r-row';
    row.setAttribute('data-idx', i);
    row.innerHTML = _routineRowHTML(i, tpl[i]);
    list.appendChild(row);
  }
  _bindRoutineDrag();
  toast('已加载示例，检查/修改后点「保存预设」', 'ok');
}

/* ── 固定事务完成状态（替代旧 routineProgress） ── */

function toggleFixedTask(id) {
  if (guardToggle()) return;

  var today = store.currentDate;
  if (!store.routineProgress[today]) store.routineProgress[today] = {};
  var wasDone = !!store.routineProgress[today][id];
  var newState = !wasDone;
  store.routineProgress[today][id] = newState;
  saveRoutineProgress();

  var ft = null;
  var routines = store.routines || [];
  for (var i = 0; i < routines.length; i++) {
    if (routines[i].id === id) { ft = routines[i]; break; }
  }
  var reward = ft ? ft.wafers : (ROUTINE_REWARD * WAFER_VALUE);

  if (newState) {
    var el = document.getElementById('fixedtask-' + id);
    if (el) {
      el.classList.add('fixedtask-completing');
      spawnSparks(el);
      setTimeout(function(){ el.classList.remove('fixedtask-completing'); }, 550);
    }
    if (!isEarned(store.currentDate, 'fixed_' + id)) {
      addBalance(reward, store.currentDate, 'fixed_' + id);
    }
    lockModeIfNeeded();
  } else {
    // Undo: refund
    var earnedKey = 'fixed_' + id;
    if (isEarned(store.currentDate, earnedKey)) {
      setBalance(Math.max(0, getBalance() - reward));
      recordTransaction('spend', reward, '撤销固定事务: ' + (ft ? ft.name : id), earnedKey);
      unmarkEarned(store.currentDate, earnedKey);
      toast('已撤销，退回 ' + reward + ' 円', 'ok');
    }
  }
  renderTimeline();
  renderHeroProgress();
  saveDailyHistory(store.currentDate);
  // v9.0：同步到每日独立数据
  if (typeof syncStoreToDailyData === 'function') syncStoreToDailyData(store.currentDate);
}