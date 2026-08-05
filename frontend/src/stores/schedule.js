import { defineStore } from 'pinia'
import { toLocalDate } from '@/utils/format'
import api from '@/api/client'

export const useScheduleStore = defineStore('schedule', {
  state: () => ({
    currentDate: toLocalDate(new Date()),
    mode: 'full',
    schedules: {},       // { [date]: { blocks, customBlocks, ... } }
    tasks: [],           // manually created tasks (global)
    routineProgress: {}, // { [date]: { [routineId]: true } }
    loading: false
  }),

  getters: {
    todaySchedule(state) {
      return state.schedules[state.currentDate] || { blocks: [], customBlocks: [] }
    },
    todayBlocks(state) {
      const s = state.schedules[state.currentDate] || { blocks: [] }
      return s.blocks || []
    }
  },

  actions: {
    async fetchDay(date) {
      this.loading = true
      try {
        const { data } = await api.get(`/plan/${date}`)
        this.schedules[date] = data
        this.loading = false
        return data
      } catch {
        // Fall back to localStorage (handled by the consumer)
        this.loading = false
        return null
      }
    },

    async saveDay(date) {
      try {
        await api.put(`/plan/${date}`, this.schedules[date])
        localStorage.setItem('dp_schedules', JSON.stringify(this.schedules))
      } catch {
        // Silent degrade — LS is already written by consumer
      }
    },

    setDate(date) {
      this.currentDate = date
    },

    setMode(mode) {
      if (['full', 'minimum', 'recovery'].includes(mode)) {
        this.mode = mode
      }
    }
  }
})
