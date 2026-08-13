import axios from 'axios'
import { useToastStore } from '@/stores/toast'

const TOKEN_KEY = 'dp_authToken'
const REFRESH_KEY = 'dp_authRefreshToken'
const USER_KEY = 'dp_authUser'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

/* ── Request interceptor: inject JWT ── */
api.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/* ── Error message helper (FastAPI detail / catch-all message) ── */
export function errMsg(err, fallback = '操作失败，请稍后重试') {
  const detail = err?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail.length) {
    return detail[0]?.msg || '输入内容不符合要求，请检查后重试'
  }
  return err?.response?.data?.message || fallback
}

/* ── Unwrap {ok, data} envelope → business payload ── */
export function unwrap(respData) {
  if (respData && typeof respData === 'object' && 'ok' in respData && 'data' in respData) {
    return respData.data
  }
  return respData
}

function clearAuthKeys() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_KEY)
  localStorage.removeItem(USER_KEY)
}

function forceReLogin() {
  clearAuthKeys()
  try {
    useToastStore().warn('登录已过期，请重新登录')
  } catch {
    /* pinia not active yet */
  }
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login'
  }
}

/* ── Single in-flight refresh promise to avoid refresh storms ── */
let refreshPromise = null

function doRefresh() {
  const refreshToken = localStorage.getItem(REFRESH_KEY)
  if (!refreshToken) return Promise.reject(new Error('no refresh token'))
  return api.post('/auth/refresh', { refresh_token: refreshToken }).then(({ data }) => {
    localStorage.setItem(TOKEN_KEY, data.token)
    return data.token
  })
}

const isAuthCall = (url = '') => /\/auth\/(login|register|refresh)/.test(url)

/* ── Response interceptor: 401 → refresh once → replay ── */
api.interceptors.response.use(
  res => res,
  async err => {
    if (!err.response) {
      console.warn('[API] Server unreachable, using local cache')
      return Promise.reject(err)
    }

    const { status } = err.response
    const config = err.config || {}

    if (status === 401 && !isAuthCall(config.url) && !config._retry) {
      config._retry = true

      if (localStorage.getItem(REFRESH_KEY)) {
        const mine = !refreshPromise
        refreshPromise = refreshPromise || doRefresh().finally(() => {
          refreshPromise = null
        })
        try {
          await refreshPromise
          return api(config)
        } catch (refreshErr) {
          if (mine) forceReLogin()
          return Promise.reject(refreshErr)
        }
      }

      // 有 token 但没有 refresh token —— 会话已失效
      if (localStorage.getItem(TOKEN_KEY)) {
        forceReLogin()
      }
    }

    return Promise.reject(err)
  }
)

export default api
