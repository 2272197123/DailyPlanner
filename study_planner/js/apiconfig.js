/* ═══════════════════════════════════════
   apiconfig.js — 用户 API 配置（v8.0）

   用户自行填入 API Key / Base URL / Model，
   存 localStorage（dp_apiConfig），前端直连 AI。
   不依赖后端代理——纯静态模式也能用。
   ═══════════════════════════════════════ */
'use strict';

var DEFAULT_API_CONFIG = {
  provider: 'deepseek',             // deepseek | openai | custom
  apiKey: '',
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-chat',
};

function getApiConfig() {
  var cfg = LS.get('apiConfig', null);
  if (!cfg) return JSON.parse(JSON.stringify(DEFAULT_API_CONFIG));
  // merge missing keys
  var out = JSON.parse(JSON.stringify(DEFAULT_API_CONFIG));
  for (var k in cfg) { if (cfg.hasOwnProperty(k)) out[k] = cfg[k]; }
  return out;
}

function saveApiConfig(cfg) {
  LS.set('apiConfig', cfg);
}

function hasApiKey() {
  var cfg = getApiConfig();
  return !!(cfg.apiKey && cfg.apiKey.trim());
}

/* ── API 配置面板 ── */

function openApiConfig() {
  _openWithAnim('apiConfigOverlay');
  _closeAllModalsExcept('apiConfigOverlay');
  _renderApiConfigPanel();
}

function closeApiConfig() { _closeWithAnim('apiConfigOverlay'); }
function closeApiConfigIfOverlay(e) {
  if (e.target === document.getElementById('apiConfigOverlay')) closeApiConfig();
}

function _renderApiConfigPanel() {
  var panel = document.getElementById('apiConfigPanel');
  var cfg = getApiConfig();
  var masked = cfg.apiKey ? cfg.apiKey.slice(0, 6) + '••••••••' + cfg.apiKey.slice(-4) : '';

  var html = '<div class="arch-head">' +
    '<h3>🔑 AI API 配置</h3>' +
    '<span class="arch-sub">填入你的 Key，AI 生成即可在浏览器直连工作</span>' +
    '<span class="focus-close" onclick="closeApiConfig()">✕</span></div>';

  html += '<div class="apicfg-form">';

  // Provider 选择
  html += '<div class="apicfg-field"><label>服务商</label>' +
    '<select id="apicfgProvider" onchange="_onApiProviderChange()">' +
      '<option value="deepseek"' + (cfg.provider === 'deepseek' ? ' selected' : '') + '>DeepSeek（推荐）</option>' +
      '<option value="openai"' + (cfg.provider === 'openai' ? ' selected' : '') + '>OpenAI</option>' +
      '<option value="custom"' + (cfg.provider === 'custom' ? ' selected' : '') + '>自定义（兼容 OpenAI 协议）</option>' +
    '</select></div>';

  // API Key
  html += '<div class="apicfg-field"><label>API Key</label>' +
    '<div class="apicfg-key-row">' +
      '<input type="password" id="apicfgKey" placeholder="sk-..." value="' + escapeHtml(cfg.apiKey) + '" autocomplete="off">' +
      '<button class="btn-secondary apicfg-toggle-btn" id="apicfgToggleBtn" onclick="_toggleKeyVisibility()" title="显示/隐藏">👁</button>' +
    '</div>';
  if (masked) {
    html += '<div class="apicfg-hint">当前: ' + escapeHtml(masked) + '</div>';
  }
  html += '</div>';

  // Base URL
  html += '<div class="apicfg-field"><label>API 地址</label>' +
    '<input type="text" id="apicfgBaseURL" placeholder="https://api.deepseek.com" value="' + escapeHtml(cfg.baseURL) + '"></div>';

  // Model
  html += '<div class="apicfg-field"><label>模型名</label>' +
    '<input type="text" id="apicfgModel" placeholder="deepseek-chat" value="' + escapeHtml(cfg.model) + '"></div>';

  // 快速切换按钮（预设几组常用配置）
  html += '<div class="apicfg-presets">' +
    '<span class="apicfg-presets-label">快速填入：</span>' +
    '<button class="btn-preset" onclick="_presetApiConfig(\'deepseek\')">🟢 DeepSeek</button>' +
    '<button class="btn-preset" onclick="_presetApiConfig(\'openai\')">⚪ OpenAI</button>' +
  '</div>';

  html += '</div>';

  html += '<div class="apicfg-tip">' +
    '💡 API Key 只保存在你的浏览器 localStorage 中，不会上传到任何服务器。<br>' +
    '前端直连模式下，请求直接从浏览器发到 AI 服务商（CORS 需服务商支持；DeepSeek 已确认可用）。' +
  '</div>';

  html += '<div class="modal-actions">' +
    '<button class="btn-cancel" onclick="closeApiConfig()">取消</button>' +
    '<button class="btn-danger-outline" id="btnClearKey" onclick="_clearApiKey()"' + (cfg.apiKey ? '' : ' style="display:none"') + '>🗑 清除 Key</button>' +
    '<button class="btn-save" onclick="_saveApiConfigFromForm()">💾 保存</button>' +
  '</div>';

  panel.innerHTML = html;
}

function _onApiProviderChange() {
  var p = document.getElementById('apicfgProvider').value;
  var presets = {
    deepseek: { baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
    openai:   { baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    custom:   { baseURL: '', model: '' },
  };
  var cfg = presets[p] || presets.custom;
  if (cfg.baseURL) document.getElementById('apicfgBaseURL').value = cfg.baseURL;
  if (cfg.model) document.getElementById('apicfgModel').value = cfg.model;
}

function _presetApiConfig(provider) {
  document.getElementById('apicfgProvider').value = provider;
  _onApiProviderChange();
}

function _toggleKeyVisibility() {
  var el = document.getElementById('apicfgKey');
  var btn = document.getElementById('apicfgToggleBtn');
  if (el.type === 'password') { el.type = 'text'; btn.textContent = '🙈'; }
  else { el.type = 'password'; btn.textContent = '👁'; }
}

function _clearApiKey() {
  document.getElementById('apicfgKey').value = '';
  document.getElementById('btnClearKey').style.display = 'none';
  toast('Key 已清空（未保存，请点保存按钮确认）', 'err');
}

function _saveApiConfigFromForm() {
  var cfg = {
    provider: document.getElementById('apicfgProvider').value,
    apiKey:   document.getElementById('apicfgKey').value.trim(),
    baseURL:  document.getElementById('apicfgBaseURL').value.trim(),
    model:    document.getElementById('apicfgModel').value.trim(),
  };
  saveApiConfig(cfg);
  closeApiConfig();
  toast('API 配置已保存', 'ok');
  // 如果导入面板开着，刷新 AI 按钮状态
  if (typeof _updateAiButtonState === 'function') _updateAiButtonState();
}

function _closeAllModalsExcept(exceptId) {
  var ids = ['modalOverlay','focusOverlay','shopOverlay','ledgerOverlay','accountingOverlay','archiveOverlay','goalOverlay','routineOverlay','modeOverlay','authOverlay','apiConfigOverlay'];
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] !== exceptId) _closeWithAnim(ids[i]);
  }
}
