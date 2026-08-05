import { defineStore } from 'pinia'
import api from '@/api/client'
import { useScheduleStore } from '@/stores/schedule'

export const useRoutineStore = defineStore('routines', {
  state: () => ({
    routines: [],          // Global template (shared across uninitialized future dates)
    dailyCopies: {},       // { [date]: Routine[] } — per-date independent copies
    loading: false
  }),

  getters: {
    /** Routines for the currently viewed date — daily copy first, template fallback */
    routinesForCurrentDate(state) {
      const scheduleStore = useScheduleStore()
      const date = scheduleStore.currentDate
      if (state.dailyCopies[date] && state.dailyCopies[date].length > 0) {
        return state.dailyCopies[date]
      }
      return state.routines || []
    },

    templateCount(state) {
      return (state.routines || []).length
    }
  },

  actions: {
    async fetchRoutines() {
      this.loading = true
      try {
        const { data } = await api.get('/routines')
        if (data && data.length > 0) {
          this.routines = data
        }
        this.loading = false
        return this.routines
      } catch {
        this.loading = false
        return this.routines
      }
    },

    async persistTemplate() {
      try {
        await api.put('/routines', this.routines)
        localStorage.setItem('dp_routines', JSON.stringify(this.routines))
      } catch {
        localStorage.setItem('dp_routines', JSON.stringify(this.routines))
      }
    },

    /** Save routines for a specific date — writes to daily copy, NOT global template */
    saveForDate(date, routineList) {
      this.dailyCopies[date] = JSON.parse(JSON.stringify(routineList))
      this._persistDaily(date)
    },

    /** Initialize a date's daily copy from the global template */
    initDailyCopy(date) {
      if (!this.dailyCopies[date]) {
        this.dailyCopies[date] = JSON.parse(JSON.stringify(this.routines))
        this._persistDaily(date)
      }
    },

    /** Push a specific date's routines to the global template.
     *  Only affects future uninitialized dates — already-initialized dates are untouched. */
    pushToTemplate(date) {
      const copy = this.dailyCopies[date]
      if (!copy || !copy.length) return false
      this.routines = JSON.parse(JSON.stringify(copy))
      this.persistTemplate()
      return true
    },

    /** Delete a routine from a specific date's copy only (not global template) */
    removeFromDate(date, routineId) {
      if (!this.dailyCopies[date]) return false
      const idx = this.dailyCopies[date].findIndex(r => r.id === routineId)
      if (idx === -1) return false
      this.dailyCopies[date].splice(idx, 1)
      this._persistDaily(date)
      return true
    },

    _persistDaily(date) {
      try {
        const key = 'dp_day_data_' + date
        let existing = {}
        try {
          const raw = localStorage.getItem(key)
          if (raw) existing = JSON.parse(raw)
        } catch { /* ignore */ }
        existing.routines = this.dailyCopies[date] || []
        localStorage.setItem(key, JSON.stringify(existing))
      } catch { /* silent degrade */ }
    },

    initFromCache() {
      try {
        const raw = localStorage.getItem('dp_routines')
        if (raw) this.routines = JSON.parse(raw)
      } catch { /* ignore */ }
    }
  }
})
