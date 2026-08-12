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
  var remembered = LS.get('rememberedUser', '');
  var html = '<div class="arch-head">' +
    '<h3>' + (isLogin ? '登录' : '注册') + '</h3>' +
    '<span class="arch-sub">' + (isLogin ? '欢迎回来' : '创建账号以保存数据到云端') + '</span>' +
    '<span class="focus-close" onclick="closeAuthOverlay()">✕</span></div>';

  html += '<div class="auth-form">' +
    '<div class="auth-field"><label>用户名</label><input type="text" id="authUsername" placeholder="2-30个字符" maxlength="30" autocomplete="username" value="' + escapeHtml(remembered) + '"></div>' +
    '<div class="auth-field"><label>密码</label><input type="password" id="authPassword" placeholder="至少4个字符" autocomplete="' + (isLogin ? 'current-password' : 'new-password') + '"></div>';

  if (!isLogin) {
    html += '<div class="auth-field"><label>邮箱（可选）</label><input type="email" id="authEmail" placeholder="用于找回密码"></div>';
    html += '<div class="auth-field"><label>邀请码' + (store.user && store.user.role === 'admin' ? '（管理员可跳过）' : '') + '</label><input type="text" id="authInviteCode" placeholder="管理员提供的8位邀请码" maxlength="20" autocomplete="off"></div>';
  } else {
    // 记住密码复选框
    html += '<div class="auth-field"><label><input type="checkbox" id="authRemember" style="width:auto;margin-right:6px" checked>记住用户名</label></div>';
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
  html += '<div class="auth-tip">💡 DailyPlan 支持多用户了！注册后你的目标、计划和日课都会安全保存在服务器，换设备也能同步。</div>';

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

  // 记住用户名
  var rememberEl = document.getElementById('authRemember');
  if (rememberEl && rememberEl.checked) {
    LS.set('rememberedUser', username);
  } else {
    LS.remove('rememberedUser');
  }

  API.login(username, password).then(function(res) {
    if (!res.ok) { _showAuthError(res.message || '登录失败'); btn.disabled = false; btn.textContent = '登录'; return; }
    setAuthToken(res.token, res.refresh_token);
    store.user = res.user;
    LS.set('user', res.user);
    closeAuthOverlay();
    renderHeader();
    updateAiButtonVisibility();
    // 同步服务器数据
    fetchAllFromServer();
    toast('👋 欢迎回来，' + res.user.username, 'ok');
  }).catch(function() { _showAuthError('网络错误'); btn.disabled = false; btn.textContent = '登录'; });
}

function doRegister() {
  var username = (document.getElementById('authUsername').value || '').trim();
  var password = (document.getElementById('authPassword').value || '').trim();
  var email = (document.getElementById('authEmail').value || '').trim();
  var inviteCode = '';
  var inviteEl = document.getElementById('authInviteCode');
  if (inviteEl) inviteCode = inviteEl.value.trim();
  if (!username || !password) { _showAuthError('请填写用户名和密码'); return; }
  if (password.length < 4) { _showAuthError('密码至少4个字符'); return; }

  var btn = document.getElementById('btnAuthSubmit');
  btn.disabled = true; btn.textContent = '注册中...';

  API.register(username, password, email, inviteCode).then(function(res) {
    if (!res.ok) { _showAuthError(res.message || '注册失败'); btn.disabled = false; btn.textContent = '注册'; return; }
    setAuthToken(res.token, res.refresh_token);
    store.user = res.user;
    LS.set('user', res.user);
    closeAuthOverlay();
    renderHeader();
    updateAiButtonVisibility();
    toast('🎉 注册成功！你的数据将会保存到服务器', 'ok');
  }).catch(function() { _showAuthError('网络错误'); btn.disabled = false; btn.textContent = '注册'; });
}

function doLogout() {
  clearAuth();
  renderHeader();
  updateAiButtonVisibility();
  toast('已退出登录', 'ok');
}

/* ── AI 按钮可见性控制 ── */

function updateAiButtonVisibility() {
  var btn = document.getElementById('aiFloatBtn');
  var user = store.user || null;
  if (btn) {
    btn.style.display = user ? 'flex' : 'none';
  }
  // 如果未登录且 AI 抽屉打开着，关闭它
  if (!user && _aiOpen) {
    aiClose();
  }
}

/* ── 管理员邀请码面板 ── */

function openAdminPanel() {
  _openWithAnim('authOverlay');
  _closeAllModalsExcept('authOverlay');
  _renderAdminInvitePanel();
}

function _renderAdminInvitePanel() {
  var panel = document.getElementById('authPanel');
  var html = '<div class="arch-head">' +
    '<h3>🔑 邀请码管理</h3>' +
    '<span class="arch-sub">生成并管理注册邀请码</span>' +
    '<span class="focus-close" onclick="closeAuthOverlay()">✕</span></div>';

  html += '<div class="admin-invite-section">' +
    '<button class="btn-save" onclick="generateInviteCode()" style="margin-bottom:12px">＋ 生成新邀请码</button>' +
    '<div class="admin-code-list" id="adminCodeList">' +
      '<div style="text-align:center;color:var(--text-tertiary);padding:12px">加载中...</div>' +
    '</div>' +
    '<div class="admin-tip" style="margin-top:12px;font-size:.75rem;color:var(--text-tertiary)">' +
      '💡 邀请码可分享给新用户注册使用。每个码仅限一人使用，使用后即作废。</div>' +
  '</div>';

  html += '<div class="modal-actions">' +
    '<button class="btn-cancel" onclick="closeAuthOverlay()">关闭</button>' +
  '</div>';

  panel.innerHTML = html;
  listInviteCodes();
}

function generateInviteCode() {
  var btn = document.querySelector('.admin-invite-section .btn-save');
  if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }
  API.createInviteCode().then(function(res) {
    if (!res.ok) { toast(res.message || '生成失败', 'err'); if (btn) { btn.disabled = false; btn.textContent = '＋ 生成新邀请码'; } return; }
    toast('✅ 邀请码已生成: ' + res.code, 'ok');
    listInviteCodes();
    if (btn) { btn.disabled = false; btn.textContent = '＋ 生成新邀请码'; }
  }).catch(function() {
    toast('网络错误', 'err');
    if (btn) { btn.disabled = false; btn.textContent = '＋ 生成新邀请码'; }
  });
}

function listInviteCodes() {
  var container = document.getElementById('adminCodeList');
  if (!container) return;
  API.listInviteCodes().then(function(res) {
    if (!res.ok || !res.data) { container.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:12px">暂无数据</div>'; return; }
    if (!res.data.length) {
      container.innerHTML = '<div style="text-align:center;color:var(--text-tertiary);padding:12px">还没有邀请码，点击上方按钮生成</div>';
      return;
    }
    var html = '<table class="ledger-table" style="width:100%"><thead><tr><th>邀请码</th><th>状态</th><th>使用者</th><th>创建时间</th></tr></thead><tbody>';
    for (var i = 0; i < res.data.length; i++) {
      var c = res.data[i];
      var statusHtml = c.used_by ? '<span style="color:var(--text-tertiary)">已使用</span>' : '<span style="color:var(--green);font-weight:600">可用</span>';
      var userHtml = c.used_by ? '#' + c.used_by : '—';
      var created = c.created_at ? c.created_at.slice(0, 10) : '—';
      html += '<tr>' +
        '<td><code style="font-family:var(--font-mono);background:var(--bg);padding:2px 8px;border-radius:4px">' + escapeHtml(c.code) + '</code>' +
        ' <button class="btn-secondary" style="font-size:.65rem;padding:2px 6px" onclick="navigator.clipboard.writeText(\'' + escapeHtml(c.code) + '\');toast(\'已复制\',\'ok\')">📋</button></td>' +
        '<td>' + statusHtml + '</td>' +
        '<td>' + userHtml + '</td>' +
        '<td style="font-size:.7rem">' + created + '</td>' +
      '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
  }).catch(function() {
    container.innerHTML = '<div style="text-align:center;color:var(--red);padding:12px">加载失败</div>';
  });
}

/* ── 渲染当前登录状态到 header ── */

function renderAuthBadge() {
  var badge = document.getElementById('authBadge');
  if (!badge) return;
  var user = store.user || null;
  if (user) {
    var isAdmin = user.role === 'admin';
    badge.innerHTML = '<span class="auth-user" onclick="' + (isAdmin ? 'openAdminPanel()' : "openAuthOverlay('login')") + '" title="' + (isAdmin ? '管理员: 邀请码管理' : '已登录') + '">' + (isAdmin ? '👑 ' : '👤 ') + escapeHtml(user.username) + '</span>' +
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
