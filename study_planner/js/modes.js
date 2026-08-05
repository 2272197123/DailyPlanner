/* ═══════════════════════════════════════
   modes.js — 三档位个性化配置（v7.1）

   用户可以自定义「完整 / 最低 / 恢复」三个档位的：
   - 显示名称与图标（label）
   - 任务量系数（factor，完整=1.0，最低≈0.55，恢复≈0.25）
   - 建议学习时长（hours）
   - 简短说明（desc）

   切换档位时，当天的生成任务会按系数比例自动缩放时长。
   ═══════════════════════════════════════ */
'use strict';

function openModeSettings() {
  _openWithAnim('modeOverlay', function() { _renderModePanel(); });
  _closeWithAnim('modalOverlay');
  _closeWithAnim('focusOverlay');
  _closeWithAnim('shopOverlay');
  _closeWithAnim('ledgerOverlay');
  _closeWithAnim('accountingOverlay');
  _closeWithAnim('archiveOverlay');
  _closeWithAnim('goalOverlay');
  _closeWithAnim('routineOverlay');
}

function closeModeSettings() { _closeWithAnim('modeOverlay'); }
function closeModeSettingsIfOverlay(e) {
  if (e.target === document.getElementById('modeOverlay')) closeModeSettings();
}

function _renderModePanel() {
  var panel = document.getElementById('modePanel');
  var cfg = getModeCfg();
  var html = '<div class="arch-head">' +
    '<h3>⚙️ 三档位设置</h3>' +
    '<span class="arch-sub">自定义任务量</span>' +
    '<span class="focus-close" onclick="closeModeSettings()">✕</span></div>';

  html += '<div class="m-form">';
  var keys = MODE_ORDER;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var c = cfg[k];
    html += '<div class="m-card">' +
      '<div class="m-card-title">' + (c.label || k) + '</div>' +
      '<div class="m-row">' +
        '<div class="m-field"><label>名称</label><input type="text" class="m-label" data-key="' + k + '" value="' + escapeHtml(c.label) + '"></div>' +
        '<div class="m-field m-field-sm"><label>系数</label><input type="number" class="m-factor" data-key="' + k + '" value="' + c.factor + '" step="0.05" min="0.1" max="1.5"></div>' +
      '</div>' +
      '<div class="m-row">' +
        '<div class="m-field"><label>建议时长</label><input type="text" class="m-hours" data-key="' + k + '" value="' + escapeHtml(c.hours) + '" placeholder="如 3-4h"></div>' +
        '<div class="m-field"><label>说明</label><input type="text" class="m-desc" data-key="' + k + '" value="' + escapeHtml(c.desc) + '"></div>' +
      '</div>' +
    '</div>';
  }
  html += '</div>';

  html += '<div class="m-tip">💡 系数表示相对于「完整」档位的任务量。例如最低档系数 0.55，则每项预计用时变为 55%（向上取整到 5 分钟）。</div>';
  html += '<div class="modal-actions">' +
    '<button class="btn-cancel" onclick="closeModeSettings()">取消</button>' +
    '<button class="btn-save" onclick="saveModeSettings()">💾 保存设置</button>' +
  '</div>';

  panel.innerHTML = html;
}

function saveModeSettings() {
  var labels  = document.querySelectorAll('.m-label');
  var factors = document.querySelectorAll('.m-factor');
  var hours   = document.querySelectorAll('.m-hours');
  var descs   = document.querySelectorAll('.m-desc');
  var cfg = getModeCfg();

  function byKey(list, key) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].getAttribute('data-key') === key) return list[i].value.trim();
    }
    return '';
  }

  var keys = MODE_ORDER;
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    cfg[k].label  = byKey(labels, k) || cfg[k].label;
    cfg[k].factor = Math.max(0.1, Math.min(2.0, parseFloat(byKey(factors, k)) || 1));
    cfg[k].hours  = byKey(hours, k) || cfg[k].hours;
    cfg[k].desc   = byKey(descs, k) || cfg[k].desc;
  }

  saveModeCfg(cfg);
  renderMode();
  renderEncouragement();
  closeModeSettings();
  toast('档位设置已保存', 'ok');
}
