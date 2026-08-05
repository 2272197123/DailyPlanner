import { defineStore } from 'pinia'

/* Placeholder stores — filled in later migration phases */

export const useGoalStore = defineStore('goals', {
  state: () => ({ bigGoals: [], goals: {}, loading: false }),
  actions: {
    async fetchGoals() { this.loading = true; try { const { data } = await (await import('@/api/client')).default.get('/goals'); this.bigGoals = data || []; this.loading = false } catch { this.loading = false } }
  }
})

export const useArchiveStore = defineStore('archive', {
  state: () => ({ archives: {}, aiPersonaPrompt: '', loading: false }),
  actions: {}
})

export const useAiStore = defineStore('ai', {
  state: () => ({ messages: [], previewBlocks: [], loading: false, drawerOpen: false }),
  actions: {}
})

export const useAccountingStore = defineStore('accounting', {
  state: () => ({ entries: [], period: 'month', loading: false }),
  actions: {}
})

export const useTimerStore = defineStore('timer', {
  state: () => ({ timers: {}, stTimers: {} }),
  actions: {}
})

export const useAuthStore = defineStore('auth', {
  state: () => ({ user: null, token: null, refreshToken: null }),
  actions: {}
})
