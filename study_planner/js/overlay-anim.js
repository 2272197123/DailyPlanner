/* ═══════════════════════════════════════
   overlay-anim.js — JS-driven overlay open/close
   Uses .anim-open → animationend → .anim-done pattern.
   This guarantees animations run exactly once, never replay.
   ═══════════════════════════════════════ */
'use strict';

function _openWithAnim(overlayId, prepFn) {
  var ov = document.getElementById(overlayId);
  if (!ov) return;

  // Reset: hidden + strip anim classes + clear any stale inline style
  ov.classList.add('hidden');
  ov.classList.remove('anim-open', 'anim-done');
  ov.removeEventListener('animationend', ov._animDone);

  // Let caller populate content while hidden
  if (prepFn) prepFn();

  // Double rAF: ensures browser commits display:none before we switch to flex
  var self = this;
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      ov.classList.remove('hidden');
      ov.classList.add('anim-open');
    });
  });

  // On animationend, swap to stable .anim-done
  var done = function(e) {
    if (e.target !== ov) return;
    ov.classList.remove('anim-open');
    ov.classList.add('anim-done');
    ov.removeEventListener('animationend', done);
    ov._animDone = null;
  };
  ov._animDone = done;
  ov.addEventListener('animationend', done);

  // Safety timeout: if animationend never fires, force to done after 800ms
  ov._animTimer = setTimeout(function() {
    if (ov.classList.contains('anim-open')) {
      ov.classList.remove('anim-open');
      ov.classList.add('anim-done');
      ov.removeEventListener('animationend', done);
      ov._animDone = null;
    }
  }, 800);
}

function _closeWithAnim(overlayId) {
  var ov = document.getElementById(overlayId);
  if (!ov) return;
  // Clear timer and listener
  if (ov._animTimer) { clearTimeout(ov._animTimer); ov._animTimer = null; }
  if (ov._animDone) { ov.removeEventListener('animationend', ov._animDone); ov._animDone = null; }
  // Strip all animation states, go back to hidden
  ov.classList.add('hidden');
  ov.classList.remove('anim-open', 'anim-done');
}

/* ===== openTaskModal (overrides modal.js v9.0) ===== */
function openTaskModal(tid) {
  _closeWithAnim('focusOverlay');
  _closeWithAnim('shopOverlay');
  _closeWithAnim('ledgerOverlay');
  _closeWithAnim('accountingOverlay');
  _closeWithAnim('archiveOverlay');

  _openWithAnim('modalOverlay', function() {
    document.getElementById('subtaskEditor').innerHTML = '';
    var goalSel = document.getElementById('modalGoal');
    if (goalSel && typeof getBigGoals === 'function') {
      var gopts = '<option value="">（不关联目标）</option>';
      var bgs = getBigGoals();
      for (var gi = 0; gi < bgs.length; gi++) {
        if (bgs[gi].status === 'done') continue;
        gopts += '<option value="' + bgs[gi].id + '">' + bgs[gi].icon + ' ' + escapeHtml(bgs[gi].title) + '</option>';
      }
      goalSel.innerHTML = gopts;
    }
    if (tid) {
      // v9.0：双路径查找（tasks + schedules.blocks）
      var found = (typeof _findTaskAndSource === 'function') ? _findTaskAndSource(tid) : null;
      var t = found ? found.task : null;
      if (!t) return;
      document.getElementById('modalTitle').textContent = '编辑任务';
      document.getElementById('modalTaskId').value = tid;
      var source = found.source || 'tasks';
      document.getElementById('modalTaskId').setAttribute('data-source', source);
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
  });

  setTimeout(function() {
    var inp = document.getElementById('modalTitleInput');
    if (inp) inp.focus();
  }, 350);
}

function closeModal() { _closeWithAnim('modalOverlay'); }
function closeModalIfOverlay(e) {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
}

/* ===== openShop ===== */
openShop = function() {
  _closeWithAnim('modalOverlay');
  _closeWithAnim('focusOverlay');
  _closeWithAnim('ledgerOverlay');
  _closeWithAnim('accountingOverlay');
  _closeWithAnim('archiveOverlay');
  _openWithAnim('shopOverlay', function() {
    if (typeof renderShop === 'function') renderShop();
  });
};
closeShop = function() { _closeWithAnim('shopOverlay'); };
closeShopIfOverlay = function(e) { if (e.target === document.getElementById('shopOverlay')) closeShop(); };

/* ===== openFocus ===== */
openFocus = function(id) {
  _closeWithAnim('modalOverlay');
  _closeWithAnim('shopOverlay');
  _closeWithAnim('ledgerOverlay');
  _closeWithAnim('accountingOverlay');
  _closeWithAnim('archiveOverlay');
  store.focusTaskId = id;
  _openWithAnim('focusOverlay', function() {
    if (typeof _renderFocusCard === 'function') _renderFocusCard(id);
  });
};
closeFocus = function() { store.focusTaskId = null; _closeWithAnim('focusOverlay'); };
closeFocusIfOverlay = function(e) { if (e.target === document.getElementById('focusOverlay')) closeFocus(); };

/* ===== openLedger ===== */
openLedger = function() {
  _closeWithAnim('modalOverlay');
  _closeWithAnim('focusOverlay');
  _closeWithAnim('shopOverlay');
  _closeWithAnim('accountingOverlay');
  _closeWithAnim('archiveOverlay');
  _openWithAnim('ledgerOverlay', function() {
    if (typeof renderLedger === 'function') renderLedger();
  });
};
closeLedger = function() { _closeWithAnim('ledgerOverlay'); };
closeLedgerIfOverlay = function(e) { if (e.target === document.getElementById('ledgerOverlay')) closeLedger(); };

/* ===== openAccounting ===== */
openAccounting = function() {
  _closeWithAnim('modalOverlay');
  _closeWithAnim('focusOverlay');
  _closeWithAnim('shopOverlay');
  _closeWithAnim('ledgerOverlay');
  _openWithAnim('accountingOverlay', function() {
    // Init state before render (overlay-anim overwrites ledger.js's openAccounting)
    if (typeof _accPeriod === 'undefined') _accPeriod = 'month';
    _accPeriod = 'month';
    _accType = 'expense';
    _accCat = '';
    _accEditId = null;
    _accDraft = { amount: '', desc: '' };
    _accFrom = '';
    _accTo = '';
    _accShowCharts = true;
    _accShowEntries = true;
    _accShowManageCats = false;
    if (typeof _accApplyPeriod === 'function') _accApplyPeriod();
    if (typeof renderAccounting === 'function') renderAccounting();
  });
};
closeAccounting = function() { _closeWithAnim('accountingOverlay'); };
closeAccountingIfOverlay = function(e) { if (e.target === document.getElementById('accountingOverlay')) closeAccounting(); };
