import { defineStore } from 'pinia'
import api, { unwrap } from '@/api/client'

export const useGoalStore = defineStore('goals', {
  state: () => ({
    bigGoals: [],     // [{ id, title, deadline, phases, completed, createdAt, ... }]
    loading: false
  }),

  getters: {
    /* 倒数日（kind === 'countdown'）与长期目标共用同一份存储，按日期升序 */
    countdowns(state) {
      return (state.bigGoals || [])
        .filter(g => g.kind === 'countdown' && g.date)
        .slice()
        .sort((a, b) => a.date < b.date ? -1 : 1)
    },
    activeGoals(state) {
      return (state.bigGoals || []).filter(g => g.kind !== 'countdown' && !g.completed)
    },
    completedGoals(state) {
      return (state.bigGoals || []).filter(g => g.kind !== 'countdown' && g.completed)
    },
    totalProgress(state) {
      const active = this.activeGoals
      if (!active.length) return 0
      const sum = active.reduce((s, g) => {
        const phases = g.phases || []
        if (!phases.length) return s + (g.completed ? 100 : 0)
        const done = phases.filter(p => p.done).length
        return s + Math.round(done / phases.length * 100)
      }, 0)
      return Math.round(sum / active.length)
    }
  },

  actions: {
    async fetchGoals() {
      this.loading = true
      try {
        const { data } = await api.get('/goals')
        const list = unwrap(data)
        if (Array.isArray(list)) this.bigGoals = list
        this.loading = false
      } catch {
        // LS fallback
        try {
          const raw = localStorage.getItem('dp_bigGoals')
          if (raw) this.bigGoals = JSON.parse(raw)
        } catch { /* ignore */ }
        this.loading = false
      }
    },

    async saveGoal(goal) {
      const idx = this.bigGoals.findIndex(g => g.id === goal.id)
      if (idx >= 0) {
        this.bigGoals[idx] = goal
      } else {
        this.bigGoals.push(goal)
      }
      await this._persist()
    },

    async deleteGoal(id) {
      this.bigGoals = this.bigGoals.filter(g => g.id !== id)
      await this._persist()
    },

    async togglePhase(goalId, phaseIdx) {
      const goal = this.bigGoals.find(g => g.id === goalId)
      if (!goal) return
      const phases = goal.phases || []
      if (!phases[phaseIdx]) return
      phases[phaseIdx].done = !phases[phaseIdx].done
      // Check if all phases done
      goal.completed = phases.every(p => p.done)
      if (goal.completed) goal.completedAt = new Date().toISOString()
      await this._persist()
      return phases[phaseIdx]
    },

    async toggleMilestone(goalId, msId) {
      const goal = this.bigGoals.find(g => g.id === goalId)
      if (!goal) return
      const ms = (goal.milestones || []).find(m => m.id === msId)
      if (!ms) return
      ms.done = !ms.done
      await this._persist()
      return ms
    },

    async _persist() {
      try {
        localStorage.setItem('dp_bigGoals', JSON.stringify(this.bigGoals))
        // 后端读取 body.get("goals")
        await api.put('/goals', { goals: this.bigGoals })
      } catch { /* silent */ }
    },

    initFromCache() {
      try {
        const raw = localStorage.getItem('dp_bigGoals')
        if (raw) this.bigGoals = JSON.parse(raw)
      } catch { /* ignore */ }
    }
  }
})
