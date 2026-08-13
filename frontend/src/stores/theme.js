import { defineStore } from 'pinia'
import { THEME_PRESETS } from '@/utils/constants'

/* 主题通过 data-theme / data-mode 属性驱动（见 assets/styles/themes.css），
   不再内联设置 CSS 变量；customVars 仍允许用户级覆盖 */

export const useThemeStore = defineStore('theme', {
  state: () => ({
    activeTheme: null,  // null = default ink palette
    mode: 'light',      // 'light' | 'dark'
    customVars: {},     // user-overridden CSS variables { '--accent': '#xyz', ... }
    preferences: {}
  }),

  getters: {
    currentTheme(state) {
      return state.activeTheme ? THEME_PRESETS[state.activeTheme] : null
    },
    isDark(state) {
      return state.mode === 'dark'
    },
    allThemes() {
      return Object.entries(THEME_PRESETS).map(([key, val]) => ({ key, ...val }))
    }
  },

  actions: {
    applyTheme(name) {
      if (name && !THEME_PRESETS[name]) return
      this.activeTheme = name

      const root = document.documentElement
      if (name && THEME_PRESETS[name]) {
        root.setAttribute('data-theme', name)
      } else {
        root.removeAttribute('data-theme')
      }

      // Apply custom overrides
      Object.entries(this.customVars).forEach(([key, val]) => {
        if (val) root.style.setProperty(key, val)
      })

      this._persist()
    },

    setMode(mode) {
      if (mode !== 'light' && mode !== 'dark') return
      this.mode = mode
      const root = document.documentElement
      if (mode === 'dark') {
        root.setAttribute('data-mode', 'dark')
      } else {
        root.removeAttribute('data-mode')
      }
      this._persist()
    },

    toggleMode() {
      this.setMode(this.mode === 'dark' ? 'light' : 'dark')
    },

    setCustomVar(key, value) {
      this.customVars[key] = value
      document.documentElement.style.setProperty(key, value)
      this._persist()
    },

    removeCustomVar(key) {
      delete this.customVars[key]
      document.documentElement.style.removeProperty(key)
      this._persist()
    },

    _persist() {
      localStorage.setItem('dp_prefs', JSON.stringify({
        ...this.preferences,
        activeTheme: this.activeTheme,
        mode: this.mode,
        customVars: this.customVars
      }))
    },

    initFromCache() {
      try {
        const raw = localStorage.getItem('dp_prefs')
        const prefs = raw ? JSON.parse(raw) : {}
        this.activeTheme = prefs.activeTheme || null
        this.customVars = prefs.customVars || {}
        this.preferences = prefs
        // 未显式选择过模式时跟随系统
        this.mode = prefs.mode
          || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        this.setMode(this.mode)
        this.applyTheme(this.activeTheme)
      } catch { /* ignore corrupt cache */ }
    }
  }
})
