/* ═══════════════════════════════════════
   api.js — Backend API client

   All server communication goes through here.
   localStorage is kept as a fast cache layer (read-first, write-through).
   ═══════════════════════════════════════ */
'use strict';

const API_BASE = '';  // same-origin, no prefix needed

const API = {
  async _fetch(url, opts = {}) {
    try {
      const res = await fetch(API_BASE + url, {
        headers: { 'Content-Type': 'application/json', ...opts.headers },
        ...opts,
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn('API error:', url, e.message);
      return { ok: false, _error: e.message };
    }
  },

  // Plan
  getPlan(date)       { return this._fetch(`/api/plan/${date}`); },
  savePlan(date, body){ return this._fetch(`/api/plan/${date}`, { method: 'PUT', body: JSON.stringify(body) }); },
  deletePlan(date)    { return this._fetch(`/api/plan/${date}`, { method: 'DELETE' }); },
  listPlans(limit=60) { return this._fetch(`/api/plans?limit=${limit}`); },

  // Progress
  getProgress(date)       { return this._fetch(`/api/progress/${date}`); },
  saveProgress(date, body){ return this._fetch(`/api/progress/${date}`, { method: 'PUT', body: JSON.stringify(body) }); },

  // Routine done
  getRoutineDone(date)    { return this._fetch(`/api/routine-done/${date}`); },
  setRoutineDone(date, rid, done) {
    return this._fetch(`/api/routine-done/${date}/${rid}`, { method: 'PUT', body: JSON.stringify({ done }) });
  },

  // Balance & earned
  getBalance()              { return this._fetch(`/api/balance`); },
  setBalance(balance)       { return this._fetch(`/api/balance`, { method: 'PUT', body: JSON.stringify({ balance }) }); },
  getEarned(date)           { return this._fetch(`/api/earned/${date}`); },
  markEarned(date, itemId)  { return this._fetch(`/api/earned/${date}/${itemId}`, { method: 'POST' }); },

  // Prefs
  getPrefs()                { return this._fetch(`/api/prefs`); },
  savePrefs(body)           { return this._fetch(`/api/prefs`, { method: 'PUT', body: JSON.stringify(body) }); },

  // Archive（每日完成情况存档）
  listArchives(limit=365)   { return this._fetch(`/api/archives?limit=${limit}`); },
  getArchive(date)          { return this._fetch(`/api/archive/${date}`); },
  saveArchive(date, body)   { return this._fetch(`/api/archive/${date}`, { method: 'PUT', body: JSON.stringify(body) }); },

  // Timeline order（时间轴顺序 + 起点）
  getOrder(date)            { return this._fetch(`/api/order/${date}`); },
  saveOrder(date, body)     { return this._fetch(`/api/order/${date}`, { method: 'PUT', body: JSON.stringify(body) }); },

  // Big goals（长期目标，v7.0）
  getGoals()                { return this._fetch(`/api/goals`); },
  saveGoals(goals)          { return this._fetch(`/api/goals`, { method: 'PUT', body: JSON.stringify({ goals }) }); },

  // Routines preset（每日固定任务预设，v7.1）
  getRoutines()             { return this._fetch(`/api/routines`); },
  saveRoutines(routines)    { return this._fetch(`/api/routines`, { method: 'PUT', body: JSON.stringify({ routines }) }); },

  // AI daily plan generation（v8.0：DeepSeek 代理端点）
  generatePlan(data)        { return this._fetch(`/api/generate-plan`, { method: 'POST', body: JSON.stringify(data) }); },
  getAiUsage(limit)         { return this._fetch(`/api/ai-usage?limit=` + (limit || 30)); },

  // 每日独立数据（v9.0：完整副本持久化）
  getDayData(date)          { return this._fetch(`/api/day-data/${date}`); },
  saveDayData(date, body)   { return this._fetch(`/api/day-data/${date}`, { method: 'PUT', body: JSON.stringify(body) }); },

  // AI 对话历史持久化（v9.0）
  getChatHistory(date)      { return this._fetch(`/api/chat-history/${date}`); },
  saveChatHistory(date, body) { return this._fetch(`/api/chat-history/${date}`, { method: 'PUT', body: JSON.stringify(body) }); },

  // Auth（v8.0：JWT 用户认证）
  register(username, password, email) {
    return this._fetch(`/api/auth/register`, { method: 'POST', body: JSON.stringify({ username, password, email }) });
  },
  login(username, password) {
    return this._fetch(`/api/auth/login`, { method: 'POST', body: JSON.stringify({ username, password }) });
  },
  refreshToken(refreshToken) {
    return this._fetch(`/api/auth/refresh`, { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) });
  },
  getMe() { return this._fetch(`/api/auth/me`); },
};

/* ── Token 管理（v8.0） ── */

function setAuthToken(token, refreshToken) {
  LS.set('authToken', token);
  if (refreshToken) LS.set('authRefreshToken', refreshToken);
}

function getAuthToken() {
  return LS.get('authToken', null);
}

function clearAuth() {
  LS.remove('authToken');
  LS.remove('authRefreshToken');
  store.user = null;
}

/** 为所有 API 请求自动附带 Bearer token（monkey-patch API._fetch） */
(function() {
  var _orig = API._fetch;
  API._fetch = function(url, opts) {
    opts = opts || {};
    var token = getAuthToken();
    if (token) {
      opts.headers = opts.headers || {};
      if (!opts.headers['Authorization']) {
        opts.headers['Authorization'] = 'Bearer ' + token;
      }
    }
    return _orig.call(this, url, opts);
  };
})();
