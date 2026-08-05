/* ═══════════════════════════════════════
   toggles.js — Complete/subtask/routine toggle logic
   ═══════════════════════════════════════ */
'use strict';

function toggleComplete(id) {
  if (guardToggle()) return;

  var sched = store.schedules[store.currentDate];
  if (sched) {
    var b = null;
    for (var bi = 0; bi < sched.blocks.length; bi++) {
      if (sched.blocks[bi].id === id) { b = sched.blocks[bi]; break; }
    }
    if (b) {
      b.completed = !b.completed;
      if (b.completed) {
        for (var si = 0; si < b.subtasks.length; si++) { b.subtasks[si].done = true; }
        lockModeIfNeeded();
      } else {
        b.subtasks.forEach(function(st) { st.done = false; });
        stopAllTimersForTask(id);
      }
      saveSchedules();
      saveDailyHistory(store.currentDate);
      if (typeof syncStoreToDailyData === 'function') syncStoreToDailyData(store.currentDate);
      return;
    }
  }

  var task = null;
  for (var ti = 0; ti < store.tasks.length; ti++) {
    if (store.tasks[ti].id === id) { task = store.tasks[ti]; break; }
  }
  if (!task) return;

  var wasCompleted = task.completed;
  task.completed = !task.completed;
  task.completedAt = task.completed ? new Date().toISOString() : null;
  if (task.completed) {
    for (var ui = 0; ui < task.subtasks.length; ui++) { task.subtasks[ui].done = true; }
    stopAllTimersForTask(id);
    if (!wasCompleted && !isEarned(store.currentDate, id)) {
      awardTaskReward(task, id);
    }
    lockModeIfNeeded();
  } else {
    // ── Undo: refund & cleanup ──
    if (isEarned(store.currentDate, id)) {
      var tReward = calcTaskReward(task) * WAFER_VALUE;
      setBalance(Math.max(0, getBalance() - tReward));
      recordTransaction('spend', tReward, '撤销任务: ' + (task.title || id), id);
      unmarkEarned(store.currentDate, id);
    }
    for (var uj = 0; uj < task.subtasks.length; uj++) {
      var subKey2 = id + '_' + uj;
      if (isEarned(store.currentDate, subKey2)) {
        unmarkEarned(store.currentDate, subKey2);
      }
    }
    task.subtasks.forEach(function(st) { st.done = false; });
    stopAllTimersForTask(id);
  }
  saveTasks();
  saveDailyHistory(store.currentDate);
}

function toggleSubtask(taskId, si) {
  if (guardToggle()) return;

  var sched = store.schedules[store.currentDate];
  if (sched) {
    var b = null;
    for (var bi = 0; bi < sched.blocks.length; bi++) {
      if (sched.blocks[bi].id === taskId) { b = sched.blocks[bi]; break; }
    }
    if (b && b.subtasks[si]) {
      var wasSubDone = b.subtasks[si].done;
      b.subtasks[si].done = !b.subtasks[si].done;
      b.completed = b.subtasks.every(function(st) { return st.done; });
      // Auto-stop subtask timer when marked done
      if (b.subtasks[si].done) {
        var stk = taskId + '_' + si;
        if (store.stTimers[stk] && store.stTimers[stk].running) pauseSubtaskTimer(taskId, si);
      }
      if (b.completed && !isEarned(store.currentDate, taskId)) {
        awardTaskReward(b, taskId);
      }
      lockModeIfNeeded();
      saveSchedules();
      saveDailyHistory(store.currentDate);
      if (typeof syncStoreToDailyData === 'function') syncStoreToDailyData(store.currentDate);
      return;
    }
  }

  var task = null;
  for (var ti = 0; ti < store.tasks.length; ti++) {
    if (store.tasks[ti].id === taskId) { task = store.tasks[ti]; break; }
  }
  if (!task || !task.subtasks[si]) return;

  var wasSubDone2 = task.subtasks[si].done;
  task.subtasks[si].done = !task.subtasks[si].done;
  task.completed = task.subtasks.every(function(st) { return st.done; });
  // Auto-stop subtask timer when marked done
  if (task.subtasks[si].done) {
    var stk2 = taskId + '_' + si;
    if (store.stTimers[stk2] && store.stTimers[stk2].running) pauseSubtaskTimer(taskId, si);
  }
  if (task.completed) {
    task.completedAt = new Date().toISOString();
    if (!isEarned(store.currentDate, taskId)) {
      awardTaskReward(task, taskId);
    }
  } else if (wasSubDone2) {
    if (task.completedAt) task.completedAt = null;
    // Subtask un-done → task no longer complete → refund
    if (isEarned(store.currentDate, taskId)) {
      var refund2 = calcTaskReward(task) * WAFER_VALUE;
      setBalance(Math.max(0, getBalance() - refund2));
      recordTransaction('spend', refund2, '撤销（子任务取消）: ' + (task.title || taskId), taskId);
      unmarkEarned(store.currentDate, taskId);
    }
  }
  lockModeIfNeeded();
  saveTasks();
  saveDailyHistory(store.currentDate);
}

function toggleRoutine(id) {
  // v8.1：固定事务统一走 routines.js 的 toggleFixedTask；保留此函数仅为兼容旧调用
  toggleFixedTask(id);
}

/* ── Completion feedback ───────────────────────── */

function completeWithFeedback(id) {
  toggleComplete(id);
  var card = document.getElementById('card-' + id);
  if (card) {
    card.classList.add('card-completing');
    spawnConfetti(card);
    setTimeout(function() { card.classList.remove('card-completing'); }, 700);
  }
  renderAll();
}

/**
 * Lock the current day's mode if it's not already locked.
 * Called after any completion action (task toggle, subtask toggle, routine toggle).
 * This prevents mode-hopping and currency farming.
 */
function lockModeIfNeeded() {
  if (!isModeLocked(store.currentDate)) {
    setModeLock(store.currentDate, store.mode);
    enableModeLockUI(store.mode);
  }
}

/**
 * Update mode segment UI to show the locked state.
 * Disables non-active mode buttons and adds a lock icon.
 */
function enableModeLockUI(lockedMode) {
  var seg = document.getElementById('modeSeg');
  if (!seg) return;
  var cfg = getModeCfg();
  var buttons = seg.querySelectorAll('button');
  for (var i = 0; i < buttons.length; i++) {
    var modeKey = null;
    var keys = MODE_ORDER;
    for (var k = 0; k < keys.length; k++) {
      if (cfg[keys[k]].label === buttons[i].textContent) {
        modeKey = keys[k];
        break;
      }
    }
    if (modeKey && modeKey !== lockedMode) {
      buttons[i].classList.add('mode-locked');
      buttons[i].title = '今日已锁定为「' + cfg[lockedMode].label + '」模式';
    }
  }
  // Add a lock indicator to the active button
  var activeBtn = seg.querySelector('button.active');
  if (activeBtn && !activeBtn.querySelector('.mode-lock-icon')) {
    var lockIcon = document.createElement('span');
    lockIcon.className = 'mode-lock-icon';
    lockIcon.textContent = ' 🔒';
    lockIcon.style.fontSize = '0.65rem';
    activeBtn.appendChild(lockIcon);
  }
}

/* ═══════════════════════════════════════
   Reset Today — one-click daily reset
   Undoes all today's completions, refunds crystals,
   clears earned records, clears mode lock.
   ═══════════════════════════════════════ */

function resetToday() {
  if (guardEdit()) return;
  var today = store.currentDate;
  var sched = store.schedules[today];
  var rp = store.routineProgress[today] || {};

  // Count what we're about to undo
  var taskCount = 0, routineCount = 0, refundTotal = 0;

  // Refund task rewards
  if (sched && sched.blocks) {
    for (var i = 0; i < sched.blocks.length; i++) {
      var b = sched.blocks[i];
      if (b.completed) {
        taskCount++;
        if (isEarned(today, b.id)) {
          var reward = calcTaskReward(b) * WAFER_VALUE;
          refundTotal += reward;
          unmarkEarned(today, b.id);
          recordTransaction('spend', reward, '重置退还: ' + (b.subject || b.id), b.id);
        }
        // Reset completion state
        b.completed = false;
        if (b.subtasks) {
          for (var si = 0; si < b.subtasks.length; si++) {
            b.subtasks[si].done = false;
          }
        }
        // Reset subtask earned states
        for (var si2 = 0; si2 < b.subtasks.length; si2++) {
          var subEarnedKey = b.id + '_' + si2;
          if (isEarned(today, subEarnedKey)) {
            unmarkEarned(today, subEarnedKey);
          }
        }
      }
    }
  }

  // Refund fixed-task rewards
  var routines = store.routines || [];
  for (var ri = 0; ri < routines.length; ri++) {
    var rid = routines[ri].id;
    if (rp[rid]) {
      routineCount++;
      var earnedKey = 'fixed_' + rid;
      if (isEarned(today, earnedKey)) {
        var ft = routines[ri];
        var fReward = (ft && typeof ft.wafers === 'number') ? ft.wafers : (ROUTINE_REWARD * WAFER_VALUE);
        refundTotal += fReward;
        unmarkEarned(today, earnedKey);
        recordTransaction('spend', fReward, '重置退还固定事务: ' + (ft ? ft.name : rid), earnedKey);
      }
    }
  }

  // Clear routine / fixed-task progress for today
  store.routineProgress[today] = {};
  saveRoutineProgress();

  // Clear task completions for user tasks
  for (var ti = 0; ti < store.tasks.length; ti++) {
    var t = store.tasks[ti];
    if (t.dueDate === today && t.completed) {
      taskCount++;
      if (isEarned(today, t.id)) {
        var tReward = calcTaskReward(t) * WAFER_VALUE;
        refundTotal += tReward;
        unmarkEarned(today, t.id);
        recordTransaction('spend', tReward, '重置退还: ' + t.title, t.id);
      }
      t.completed = false;
      t.completedAt = null;
      if (t.subtasks) {
        for (var ui = 0; ui < t.subtasks.length; ui++) {
          t.subtasks[ui].done = false;
        }
      }
    }
  }
  saveTasks();

  // Refund the balance (only if > 0)
  if (refundTotal > 0) {
    setBalance(Math.max(0, getBalance() - refundTotal));
  }

  // Clear mode lock for today
  localStorage.removeItem('dp_mode_lock_' + today);

  // Save schedule changes
  saveSchedules();
  saveDailyHistory(today);

  // Clear any running timers
  if (sched && sched.blocks) {
    for (var bi2 = 0; bi2 < sched.blocks.length; bi2++) {
      stopAllTimersForTask(sched.blocks[bi2].id);
    }
  }

  renderAll();
  toast('🔄 今日已重置！退还 ' + refundTotal + ' XP（' + taskCount + '个任务+' + routineCount + '个日常）', 'ok');
}
