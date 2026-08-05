import { defineStore } from 'pinia'
import { THEME_PRESETS } from '@/utils/constants'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    activeTheme: null,  // null = default ink palette
    customVars: {},     // user-overridden CSS variables { '--accent': '#xyz', ... }
    preferences: {}
  }),

  getters: {
    currentTheme(state) {
      return state.activeTheme ? THEME_PRESETS[state.activeTheme] : null
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
        root.style.setProperty('--accent', THEME_PRESETS[name].accent)
      } else {
        root.removeAttribute('data-theme')
        root.style.setProperty('--accent', '#1e2030')
      }

      // Apply custom overrides
      Object.entries(this.customVars).forEach(([key, val]) => {
        if (val) root.style.setProperty(key, val)
      })

      this._persist()
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
        customVars: this.customVars
      }))
    },

    initFromCache() {
      try {
        const raw = localStorage.getItem('dp_prefs')
        if (raw) {
          const prefs = JSON.parse(raw)
          this.activeTheme = prefs.activeTheme || null
          this.customVars = prefs.customVars || {}
          this.preferences = prefs
          this.applyTheme(this.activeTheme)
        }
      } catch { /* ignore corrupt cache */ }
    }
  }
})
