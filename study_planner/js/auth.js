/* ═══════════════════════════════════════
   auth.js — 登录/注册 UI（v8.0）

   顶部栏右侧显示登录按钮或用户名。
   登录/注册复用同一个 overlay。
   ═══════════════════════════════════════ */
'use strict';

function getAuthUser() { return store.user || null; }

function openAuthOverlay(tab) {
  // tab: 'login' | 'register'
  _openWithAnim('authOverlay');
  _closeAllModalsExcept('authOverlay');
  _renderAuthPanel(tab || 'login');
}

function closeAuthOverlay() { _closeWithAnim('authOverlay'); }
function closeAuthIfOverlay(e) {
  if (e.target === document.getElementById('authOverlay')) closeAuthOverlay();
}

function _renderAuthPanel(tab) {
  var panel = document.getElementById('authPanel');
  var isLogin = tab === 'login';
  var html = '<div class="arch-head">' +
    '<h3>' + (isLogin ? '登录' : '注册') + '</h3>' +
    '<span class="arch-sub">' + (isLogin ? '欢迎回来' : '创建账号以保存数据到云端') + '</span>' +
    '<span class="focus-close" onclick="closeAuthOverlay()">✕</span></div>';

  html += '<div class="auth-form">' +
    '<div class="auth-field"><label>用户名</label><input type="text" id="authUsername" placeholder="2-30个字符" maxlength="30" autocomplete="username"></div>' +
    '<div class="auth-field"><label>密码</label><input type="password" id="authPassword" placeholder="至少4个字符" autocomplete="' + (isLogin ? 'current-password' : 'new-password') + '"></div>';

  if (!isLogin) {
    html += '<div class="auth-field"><label>邮箱（可选）</label><input type="email" id="authEmail" placeholder="用于找回密码"></div>';
  }

  html += '</div>';

  html += '<div class="auth-error" id="authError" style="display:none"></div>';

  html += '<div class="modal-actions">' +
    '<button class="btn-cancel" onclick="closeAuthOverlay()">取消</button>' +
    '<button class="btn-save" id="btnAuthSubmit" onclick="' + (isLogin ? 'doLogin()' : 'doRegister()') + '">' + (isLogin ? '登录' : '注册') + '</button>' +
  '</div>';

  html += '<div class="auth-switch">' +
    (isLogin
      ? '还没有账号？<a href="javascript:void(0)" onclick="_renderAuthPanel(\'register\')">注册</a>'
      : '已有账号？<a href="javascript:void(0)" onclick="_renderAuthPanel(\'login\')">登录</a>') +
  '</div>';

  // 首次使用提示
  html += '<div class="auth-tip">💡 DailyPlan v8.0 支持多用户了！注册后你的目标、计划和日课都会安全保存在服务器，换设备也能同步。</div>';

  panel.innerHTML = html;
  setTimeout(function() {
    var el = document.getElementById('authUsername');
    if (el) el.focus();
  }, 100);
}

function _showAuthError(msg) {
  var el = document.getElementById('authError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function doLogin() {
  var username = (document.getElementById('authUsername').value || '').trim();
  var password = (document.getElementById('authPassword').value || '').trim();
  if (!username || !password) { _showAuthError('请填写用户名和密码'); return; }

  var btn = document.getElementById('btnAuthSubmit');
  btn.disabled = true; btn.textContent = '登录中...';

  API.login(username, password).then(function(res) {
    if (!res.ok) { _showAuthError(res.message || '登录失败'); btn.disabled = false; btn.textContent = '登录'; return; }
    setAuthToken(res.token, res.refresh_token);
    store.user = res.user;
    LS.set('user', res.user);
    closeAuthOverlay();
    renderHeader();
    // 同步服务器数据
    fetchAllFromServer();
    toast('👋 欢迎回来，' + res.user.username, 'ok');
  }).catch(function() { _showAuthError('网络错误'); btn.disabled = false; btn.textContent = '登录'; });
}

function doRegister() {
  var username = (document.getElementById('authUsername').value || '').trim();
  var password = (document.getElementById('authPassword').value || '').trim();
  var email = (document.getElementById('authEmail').value || '').trim();
  if (!username || !password) { _showAuthError('请填写用户名和密码'); return; }
  if (password.length < 4) { _showAuthError('密码至少4个字符'); return; }

  var btn = document.getElementById('btnAuthSubmit');
  btn.disabled = true; btn.textContent = '注册中...';

  API.register(username, password, email).then(function(res) {
    if (!res.ok) { _showAuthError(res.message || '注册失败'); btn.disabled = false; btn.textContent = '注册'; return; }
    setAuthToken(res.token, res.refresh_token);
    store.user = res.user;
    LS.set('user', res.user);
    closeAuthOverlay();
    renderHeader();
    toast('🎉 注册成功！你的数据将会保存到服务器', 'ok');
  }).catch(function() { _showAuthError('网络错误'); btn.disabled = false; btn.textContent = '注册'; });
}

function doLogout() {
  clearAuth();
  renderHeader();
  toast('已退出登录', 'ok');
}

/* ── 渲染当前登录状态到 header ── */

function renderAuthBadge() {
  var badge = document.getElementById('authBadge');
  if (!badge) return;
  var user = store.user || null;
  if (user) {
    badge.innerHTML = '<span class="auth-user" onclick="openAuthOverlay(\'login\')" title="已登录">👤 ' + escapeHtml(user.username) + '</span>' +
      '<button class="auth-logout-btn" onclick="doLogout()" title="退出登录">↪</button>';
  } else {
    badge.innerHTML = '<button class="auth-login-btn" onclick="openAuthOverlay(\'login\')">👤 登录</button>';
  }
}

function _closeAllModalsExcept(exceptId) {
  var ids = ['modalOverlay','focusOverlay','shopOverlay','ledgerOverlay','accountingOverlay','archiveOverlay','goalOverlay','routineOverlay','modeOverlay'];
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] !== exceptId) _closeWithAnim(ids[i]);
  }
}
