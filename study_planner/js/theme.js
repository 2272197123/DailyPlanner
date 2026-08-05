/* ═══════════════════════════════════════
   theme.js — Light/dark theme toggle
   ═══════════════════════════════════════ */
'use strict';

function applyTheme() {
  var t = store.theme;
  // Resolve 'system' → actual resolved mode for display purposes
  var resolved = t;
  if (resolved === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', resolved);
  document.getElementById('themeToggle').textContent = resolved === 'dark' ? '☀️' : '🌙';

  // Apply purchased theme class — remove all previous, add current
  var html = document.documentElement;
  var themeClasses = ['theme-forest','theme-ocean','theme-sunset','theme-noir','theme-vapor','theme-sakura'];
  for (var i = 0; i < themeClasses.length; i++) {
    html.classList.remove(themeClasses[i]);
  }
  if (store.prefs && store.prefs.activeTheme) {
    html.classList.add(store.prefs.activeTheme);
  }
}

function toggleTheme() {
  // Simple two-state flip: toggle between dark and light.
  // 'system' is only the initial value on first boot — once the user
  // clicks the button we resolve it and flip from the resolved state.
  var resolved = store.theme;
  if (resolved === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
  }
  store.theme = resolved === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveSettings();
}

window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', function() {
  if (store.theme === 'system') applyTheme();
});
