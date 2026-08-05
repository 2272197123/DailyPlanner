import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

/* ── Request interceptor: inject JWT ── */
api.interceptors.request.use(config => {
  const token = localStorage.getItem('dp_authToken')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

/* ── Response interceptor: silent degradation ── */
api.interceptors.response.use(
  res => res,
  err => {
    if (!err.response) {
      console.warn('[API] Server unreachable, using local cache')
    } else if (err.response.status === 401) {
      // Token expired — clear and let auth flow handle
      localStorage.removeItem('dp_authToken')
      localStorage.removeItem('dp_authRefreshToken')
    }
    return Promise.reject(err)
  }
)

export default api
