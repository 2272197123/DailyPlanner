import { defineStore } from 'pinia'
import api from '@/api/client'

export const useRoutineStore = defineStore('routines', {
  state: () => ({
    routines: [],          // Global template
    dailyCopies: {},       // { [date]: Routine[] }
    loading: false
  }),

  getters: {
    routinesForToday(state) {
      const currentDate = this._getCurrentDate()
      return state.dailyCopies[currentDate] || state.routines || []
    }
  },

  actions: {
    _getCurrentDate() {
      // Inject currentDate from scheduleStore at call time — composable pattern
      const scheduleStore = null // Will be resolved in component via composable
      return null
    },

    async fetchRoutines() {
      this.loading = true
      try {
        const { data } = await api.get('/routines')
        this.routines = data
        this.loading = false
        return data
      } catch {
        this.loading = false
        return null
      }
    },

    async saveRoutine(routine) {
      try {
        await api.put(`/routines/${routine.id}`, routine)
      } catch {
        // silent degrade
      }
    },

    /** Push today's copy back to the global template */
    pushToTemplate(date) {
      if (this.dailyCopies[date]) {
        this.routines = JSON.parse(JSON.stringify(this.dailyCopies[date]))
      }
    },

    /** Initialize daily copy from template */
    initDailyCopy(date) {
      if (!this.dailyCopies[date]) {
        this.dailyCopies[date] = JSON.parse(JSON.stringify(this.routines))
      }
    }
  }
})
