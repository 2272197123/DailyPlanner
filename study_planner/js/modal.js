/* ═══════════════════════════════════════
   modal.js — Task editor modal (v9.0)

   编辑弹窗双路径查找：
   1. store.tasks[] — 用户手动创建的任务
   2. store.schedules[date].blocks[] — AI生成/导入的计划任务
   保存时写回对应源数组。
   ═══════════════════════════════════════ */
'use strict';

/** 在 store.tasks 和 store.schedules[date].blocks 中查找任务 */
function _findTaskAndSource(tid) {
  var ti = -1;
  for (var i = 0; i < store.tasks.length; i++) {
    if (store.tasks[i].id === tid) { ti = i; break; }
  }
  if (ti !== -1) return { task: store.tasks[ti], source: 'tasks', index: ti };

  var sched = store.schedules[store.currentDate];
  if (sched && sched.blocks) {
    for (var bi = 0; bi < sched.blocks.length; bi++) {
      if (sched.blocks[bi].id === tid) {
        return { task: sched.blocks[bi], source: 'blocks', index: bi };
      }
    }
  }

  return null;
}

function openTaskModal(tid) {
  if (!document.getElementById('focusOverlay').classList.contains('hidden')) closeFocus();
  if (!document.getElementById('shopOverlay').classList.contains('hidden')) closeShop();
  if (!document.getElementById('ledgerOverlay').classList.contains('hidden')) closeLedger();
  if (!document.getElementById('accountingOverlay').classList.contains('hidden')) closeAccounting();

  var ov = document.getElementById('modalOverlay');
  ov.classList.add('hidden');
  ov.classList.remove('showing');

  document.getElementById('subtaskEditor').innerHTML = '';

  var goalSel = document.getElementById('modalGoal');
  if (goalSel && typeof getBigGoals === 'function') {
    var opts = '<option value="">（不关联目标）</option>';
    var bgs = getBigGoals();
    for (var gi = 0; gi < bgs.length; gi++) {
      if (bgs[gi].status === 'done') continue;
      opts += '<option value="' + bgs[gi].id + '">' + bgs[gi].icon + ' ' + escapeHtml(bgs[gi].title) + '</option>';
    }
    goalSel.innerHTML = opts;
  }

  if (tid) {
    var found = _findTaskAndSource(tid);
    if (!found) return;
    var t = found.task;

    document.getElementById('modalTitle').textContent = '编辑任务';
    document.getElementById('modalTaskId').value = tid;
    document.getElementById('modalTaskId').setAttribute('data-source', found.source);
    document.getElementById('modalTitleInput').value = t.title || t.subject || '';
    document.getElementById('modalCategory').value = t.category || 'other';
    document.getElementById('modalPriority').value = t.priority || 'medium';
    if (goalSel) goalSel.value = t.goalId || '';
    document.getElementById('modalTime').value = t.time || '';
    document.getElementById('modalDueDate').value = t.dueDate || '';
    document.getElementById('modalDueTime').value = t.dueTime || '';
    document.getElementById('modalDuration').value = t.duration || '';
    document.getElementById('modalFlowHint').value = t.flowHint || '';
    document.getElementById('modalNote').value = t.note || '';
    document.getElementById('modalReminder').checked = t.reminder || false;
    (t.subtasks || []).forEach(function(st) { addSubtaskField(st.text, st.estMin); });
  } else {
    document.getElementById('modalTitle').textContent = '新建任务';
    document.getElementById('modalTaskId').value = '';
    document.getElementById('modalTaskId').removeAttribute('data-source');
    document.getElementById('modalTitleInput').value = '';
    document.getElementById('modalCategory').value = 'study';
    document.getElementById('modalPriority').value = 'medium';
    if (goalSel) goalSel.value = '';
    document.getElementById('modalTime').value = '';
    document.getElementById('modalDueDate').value = '';
    document.getElementById('modalDueTime').value = '';
    document.getElementById('modalDuration').value = '';
    document.getElementById('modalFlowHint').value = '';
    document.getElementById('modalNote').value = '';
    document.getElementById('modalReminder').checked = false;
  }

  ov.classList.remove('hidden');
  ov.classList.add('showing');

  setTimeout(function() {
    document.getElementById('modalTitleInput').focus();
  }, 300);
}

function closeModal() {
  var ov = document.getElementById('modalOverlay');
  ov.classList.add('hidden');
  ov.classList.remove('showing');
}

function closeModalIfOverlay(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

function addSubtaskField(text, estMin) {
  var container = document.getElementById('subtaskEditor');
  var row = document.createElement('div');
  row.className = 'subtask-row';
  row.innerHTML = '<input type="text" placeholder="子任务内容..." value="' + escapeHtml(text || '') + '">' +
    '<input type="number" placeholder="分钟" value="' + escapeHtml(estMin || '') + '" min="1" max="180">' +
    '<button class="btn-remove" onclick="this.closest(\'.subtask-row\').remove()">✕</button>';
  container.appendChild(row);
}

function saveTask() {
  if (guardEdit()) return;

  var tidEl = document.getElementById('modalTaskId');
  var tid = tidEl.value;
  var title = document.getElementById('modalTitleInput').value.trim();
  if (!title) { toast('请输入任务名称', 'err'); return; }

  var rows = document.querySelectorAll('#subtaskEditor .subtask-row');
  var subs = [];
  rows.forEach(function(r) {
    var txt = r.querySelector('input[type=text]').value.trim();
    if (txt) subs.push({ text: txt, done: false, estMin: parseInt(r.querySelector('input[type=number]').value) || 25 });
  });

  var timeVal = document.getElementById('modalTime').value.trim();
  var durVal  = document.getElementById('modalDuration').value;

  var data = {
    title,
    subject: title,
    category:  document.getElementById('modalCategory').value,
    priority:  document.getElementById('modalPriority').value,
    time:      timeVal,
    dueDate:   document.getElementById('modalDueDate').value,
    dueTime:   document.getElementById('modalDueTime').value,
    duration:  durVal ? parseInt(durVal) : (timeVal ? dur(timeVal) : null),
    goalId:    document.getElementById('modalGoal') ? document.getElementById('modalGoal').value : '',
    flowHint:  document.getElementById('modalFlowHint').value.trim(),
    subtasks:  subs,
    note:      document.getElementById('modalNote').value.trim(),
    reminder:  document.getElementById('modalReminder').checked,
  };

  var source = tidEl.getAttribute('data-source');

  if (tid && source === 'blocks') {
    var sched = store.schedules[store.currentDate];
    var bi = -1;
    for (var bj = 0; bj < sched.blocks.length; bj++) {
      if (sched.blocks[bj].id === tid) { bi = bj; break; }
    }
    if (bi !== -1) {
      var block = sched.blocks[bi];
      block.subject = data.subject;
      block.category = data.category;
      block.priority = data.priority;
      block.duration = data.duration || block.duration;
      block.goalId = data.goalId;
      block.flowHint = data.flowHint;
      block.subtasks = data.subtasks;
      block.time = data.time;
      if (typeof syncStoreToDailyData === 'function') syncStoreToDailyData(store.currentDate);
      saveSchedules();
      syncPlanToServer(store.currentDate);
      toast('任务已更新', 'ok');
    }
  } else if (tid) {
    updateTask(tid, data);
    if (store.timers[tid]) {
      clearInterval(store.timers[tid].interval);
      delete store.timers[tid];
      saveTimers();
    }
    toast('任务已更新', 'ok');
  } else {
    addTask(data);
    toast('任务已创建', 'ok');
  }

  closeModal();
  renderAll();
  scheduleReminderCheck();
}
