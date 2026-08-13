/* ═══════════════════════════════════════
   auth.js — 认证状态（邮箱验证码注册 + 邮箱密码登录 + 游客）
   Tokens persist in localStorage:
     dp_authToken / dp_authRefreshToken / dp_authUser
   ═══════════════════════════════════════ */

import { defineStore } from 'pinia'
import api from '@/api/client'

const TOKEN_KEY = 'dp_authToken'
const REFRESH_KEY = 'dp_authRefreshToken'
const USER_KEY = 'dp_authUser'

function loadUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: loadUser(),
    token: localStorage.getItem(TOKEN_KEY) || null,
    refreshToken: localStorage.getItem(REFRESH_KEY) || null
  }),

  getters: {
    isLoggedIn: (s) => !!s.token,
    isAdmin: (s) => s.user?.role === 'admin',
    isGuest: (s) => !!s.user?.is_guest
  },

  actions: {
    _persist() {
      if (this.token) localStorage.setItem(TOKEN_KEY, this.token)
      else localStorage.removeItem(TOKEN_KEY)

      if (this.refreshToken) localStorage.setItem(REFRESH_KEY, this.refreshToken)
      else localStorage.removeItem(REFRESH_KEY)

      if (this.user) localStorage.setItem(USER_KEY, JSON.stringify(this.user))
      else localStorage.removeItem(USER_KEY)
    },

    _applyAuth(data) {
      this.user = data.user || null
      this.token = data.token || null
      this.refreshToken = data.refresh_token || null
      this._persist()
    },

    async sendEmailCode(email) {
      const { data } = await api.post('/auth/send-email-code', { email })
      return data
    },

    async login(email, password) {
      const { data } = await api.post('/auth/login', { email, password })
      this._applyAuth(data)
      return data
    },

    async register({ email, emailCode, password, nickname, inviteCode }) {
      const { data } = await api.post('/auth/register', { email, emailCode, password, nickname, inviteCode })
      this._applyAuth(data)
      return data
    },

    async guest() {
      const { data } = await api.post('/auth/guest')
      this._applyAuth(data)
      return data
    },

    async updateProfile(nickname) {
      const { data } = await api.put('/user/profile', { nickname })
      if (this.user) {
        this.user = { ...this.user, nickname }
        this._persist()
      }
      return data
    },

    async uploadAvatar(file) {
      const form = new FormData()
      form.append('file', file)
      const { data } = await api.post('/user/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      if (this.user && data.avatar) {
        this.user = { ...this.user, avatar: data.avatar }
        this._persist()
      }
      return data
    },

    async fetchMe() {
      const { data } = await api.get('/auth/me')
      this.user = data.user || null
      this._persist()
      return this.user
    },

    async refresh() {
      if (!this.refreshToken) throw new Error('没有可用的刷新令牌')
      const { data } = await api.post('/auth/refresh', { refresh_token: this.refreshToken })
      this.token = data.token
      this._persist()
      return this.token
    },

    async logout() {
      // 服务端无状态，尽力通知即可；本地必须清空
      try {
        await api.post('/auth/logout')
      } catch {
        /* ignore */
      }
      this.user = null
      this.token = null
      this.refreshToken = null
      this._persist()
    }
  }
})
