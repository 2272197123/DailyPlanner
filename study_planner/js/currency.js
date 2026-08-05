/* ═══════════════════════════════════════
   currency.js — XP + Theme system (v9.0)
   ═══════════════════════════════════════ */
'use strict';

/* ── Helpers ──────────────────────────────────── */

function _prefs() {
  if (store && store.prefs) return store.prefs;
  return { activeTheme: null };
}

/* ── XP display ── */

function updateBalanceUI() {
  var xp = getBalance();
  var lvl = getLevel();
  var be = document.getElementById('balanceText');
  if (be) { be.textContent = 'Lv.' + lvl + ' · ' + xp + ' XP'; }
  var bi = document.getElementById('balanceIcon');
  if (bi) { bi.textContent = '⭐'; }
}

/* ── Shop / Theme gallery ── */

function openShop() {
  if (!document.getElementById('modalOverlay').classList.contains('hidden')) closeModal();
  if (!document.getElementById('focusOverlay').classList.contains('hidden')) closeFocus();
  if (!document.getElementById('ledgerOverlay').classList.contains('hidden')) closeLedger();
  if (!document.getElementById('accountingOverlay').classList.contains('hidden')) closeAccounting();
  renderShop();
  document.getElementById('shopOverlay').classList.remove('hidden');
}

function closeShop() {
  document.getElementById('shopOverlay').classList.add('hidden');
}

function closeShopIfOverlay(e) {
  if (e.target === document.getElementById('shopOverlay')) closeShop();
}

function renderShop() {
  document.getElementById('shopPanel').innerHTML = buildShopHTML();
}

function buildShopHTML() {
  var p = _prefs();
  var xp = getBalance();
  var lvl = getLevel();
  var nextXp = xpToNextLevel();

  var html = '<span class="shop-close" onclick="closeShop()">✕</span>' +
    '<h2>🎨 主题实验室</h2>' +
    '<div class="shop-balance">⭐ Lv.' + lvl + ' · ' + xp + ' XP（升级还需 ' + nextXp + ' XP）</div>';

  html += '<div class="theme-grid">';
  var themeKeys = Object.keys(THEME_PRESETS);
  for (var ti = 0; ti < themeKeys.length; ti++) {
    var tk = themeKeys[ti];
    var th = THEME_PRESETS[tk];
    var isActive = p.activeTheme === tk;
    html += '<div class="theme-card' + (isActive ? ' active' : '') + '" onclick="applyTheme(\'' + tk + '\')">' +
      '<div class="theme-card-preview" style="background:' + (th.previewBg || th['--accent'] || '#1e2030') + '"></div>' +
      '<div class="theme-card-name">' + (th.label || tk) + '</div>' +
      (isActive ? '<span class="theme-card-check">✓</span>' : '') +
    '</div>';
  }
  html += '</div>';

  html += '<div class="shop-actions" style="margin-top:14px;display:flex;gap:8px;justify-content:center">' +
    '<button class="btn-secondary" onclick="applyTheme(null)">🔄 恢复默认</button>' +
    '</div>';

  return html;
}

/* ── Theme presets ── */

var THEME_PRESETS = {
  sakura: { label: '🌸 桜', previewBg: '#f8e8ec', '--accent': '#c05068', '--accent-light': '#e08098', '--bg': '#fdf8f9', '--surface': '#fffcfd', '--surface-hover': '#fdf4f6' },
  forest: { label: '🌿 森林', previewBg: '#e8f0e4', '--accent': '#3a6040', '--accent-light': '#5a8a60', '--bg': '#f2f6ef', '--surface': '#fbfdf9', '--surface-hover': '#f5f8f0' },
  ocean:  { label: '🌊 海洋', previewBg: '#e4ecf4', '--accent': '#2e5080', '--accent-light': '#4a78b0', '--bg': '#f4f7fa', '--surface': '#fcfdff', '--surface-hover': '#f0f4f8' },
  sunset: { label: '🌅 日落', previewBg: '#f4e8d8', '--accent': '#a05830', '--accent-light': '#d08858', '--bg': '#fdf8f2', '--surface': '#fffcf7', '--surface-hover': '#faf4ea' },
  noir:   { label: '🖤 夜墨', previewBg: '#1a1a24', '--accent': '#c8c4e0', '--accent-light': '#e0dcf8', '--bg': '#0c0c14', '--surface': '#161622', '--surface-hover': '#1a1a2a' },
  vapor:  { label: '💜 蒸汽', previewBg: '#2a1a3c', '--accent': '#b070d8', '--accent-light': '#d890f8', '--bg': '#1a1028', '--surface': '#241a34', '--surface-hover': '#2a1e3c' },
  aurora: { label: '🌌 极光', previewBg: '#182a38', '--accent': '#40a8a0', '--accent-light': '#68d0c8', '--bg': '#f2f8f8', '--surface': '#fafdfd', '--surface-hover': '#f0f4f4' },
  ember:  { label: '🔥 余烬', previewBg: '#3a2014', '--accent': '#d87040', '--accent-light': '#f89868', '--bg': '#fdf6f2', '--surface': '#fffaf7', '--surface-hover': '#faf0e8' },
};

function applyTheme(themeKey) {
  var p = _prefs();
  var html = document.documentElement;

  // 清除之前的主题 class
  var prev = p.activeTheme || '';
  if (prev && prev !== themeKey) {
    html.classList.remove('theme-' + prev);
  }

  if (themeKey && THEME_PRESETS[themeKey]) {
    p.activeTheme = themeKey;
    html.classList.add('theme-' + themeKey);
    var th = THEME_PRESETS[themeKey];
    for (var k in th) {
      if (th.hasOwnProperty(k) && k !== 'label' && k !== 'previewBg') {
        html.style.setProperty(k, th[k]);
      }
    }
  } else {
    p.activeTheme = null;
    // 恢复默认 CSS 变量
    var keys = ['--accent','--accent-light','--bg','--surface','--surface-hover'];
    for (var i = 0; i < keys.length; i++) {
      html.style.removeProperty(keys[i]);
    }
  }

  savePrefs();
  updateBalanceUI();
  renderShop();
  renderAll();
  toast((themeKey && THEME_PRESETS[themeKey] ? THEME_PRESETS[themeKey].label : '默认') + ' 主题已应用', 'ok');
}
