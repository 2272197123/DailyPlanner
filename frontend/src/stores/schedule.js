import { defineStore } from 'pinia'
import { toLocalDate } from '@/utils/format'
import api from '@/api/client'

export const useScheduleStore = defineStore('schedule', {
  state: () => ({
    currentDate: toLocalDate(new Date()),
    today: toLocalDate(new Date()),
    mode: 'full',
    schedules: {},          // { [date]: { blocks, customBlocks, startTime, mode, ... } }
    tasks: [],              // manually created tasks (global)
    routineProgress: {},    // { [date]: { [routineId]: true } }
    timelineCfg: {},        // { [date]: { start, order } }
    loading: false
  }),

  getters: {
    isPast(state) {
      return state.currentDate < state.today
    },
    isFuture(state) {
      return state.currentDate > state.today
    },
    isToday(state) {
      return state.currentDate === state.today
    },
    dateState(state) {
      if (state.currentDate < state.today) return 'past'
      if (state.currentDate > state.today) return 'future'
      return 'present'
    },
    todaySchedule(state) {
      return state.schedules[state.currentDate] || { blocks: [], mode: state.mode, startTime: '09:00' }
    },
    todayBlocks(state) {
      const s = state.schedules[state.currentDate]
      return (s && s.blocks) ? s.blocks : []
    },
    timelineStart(state) {
      const cfg = state.timelineCfg[state.currentDate]
      return (cfg && cfg.start) ? cfg.start : '09:00'
    }
  },

  actions: {
    async fetchDay(date) {
      this.loading = true
      try {
        const { data } = await api.get(`/plan/${date}`)
        if (data) {
          this.schedules[date] = data
        }
        this.loading = false
        return data
      } catch {
        // Fall back to localStorage
        try {
          const raw = localStorage.getItem('dp_schedules')
          if (raw) {
            const all = JSON.parse(raw)
            if (all[date]) this.schedules[date] = all[date]
          }
        } catch { /* ignore */ }
        this.loading = false
        return this.schedules[date] || null
      }
    },

    async saveDay(date) {
      const sched = this.schedules[date]
      if (!sched) return
      try {
        await api.put(`/plan/${date}`, sched)
      } catch { /* silent */ }
      // Local cache
      try {
        const raw = localStorage.getItem('dp_schedules')
        const all = raw ? JSON.parse(raw) : {}
        all[date] = sched
        localStorage.setItem('dp_schedules', JSON.stringify(all))
      } catch { /* ignore */ }
    },

    setDate(date) {
      this.currentDate = date
    },

    goToday() {
      this.currentDate = this.today
    },

    prevDay() {
      const d = new Date(this.currentDate + 'T00:00:00')
      d.setDate(d.getDate() - 1)
      this.currentDate = d.toISOString().slice(0, 10)
    },

    nextDay() {
      const d = new Date(this.currentDate + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      this.currentDate = d.toISOString().slice(0, 10)
    },

    setMode(mode) {
      if (['full', 'minimum', 'recovery'].includes(mode)) {
        this.mode = mode
      }
    },

    addBlock(date, block) {
      if (!this.schedules[date]) {
        this.schedules[date] = { blocks: [], mode: this.mode, startTime: '09:00' }
      }
      this.schedules[date].blocks.push(block)
      this.saveDay(date)
    },

    updateBlock(date, blockId, updates) {
      const sched = this.schedules[date]
      if (!sched || !sched.blocks) return
      const idx = sched.blocks.findIndex(b => b.id === blockId)
      if (idx === -1) return
      Object.assign(sched.blocks[idx], updates)
      this.saveDay(date)
    },

    removeBlock(date, blockId) {
      const sched = this.schedules[date]
      if (!sched || !sched.blocks) return
      const idx = sched.blocks.findIndex(b => b.id === blockId)
      if (idx === -1) return
      sched.blocks.splice(idx, 1)
      this.saveDay(date)
    },

    toggleBlockDone(date, blockId) {
      const sched = this.schedules[date]
      if (!sched || !sched.blocks) return
      const block = sched.blocks.find(b => b.id === blockId)
      if (!block) return
      block.completed = !block.completed
      if (block.completed) {
        block.completedAt = new Date().toISOString()
        // Mark all subtasks done
        if (block.subtasks) block.subtasks.forEach(st => { st.done = true })
      } else {
        block.completedAt = null
      }
      this.saveDay(date)
      return block.completed
    },

    toggleSubtask(date, blockId, si) {
      const sched = this.schedules[date]
      if (!sched || !sched.blocks) return
      const block = sched.blocks.find(b => b.id === blockId)
      if (!block || !block.subtasks || !block.subtasks[si]) return
      block.subtasks[si].done = !block.subtasks[si].done
      block.completed = block.subtasks.every(st => st.done)
      this.saveDay(date)
      return { subtask: block.subtasks[si], allDone: block.completed }
    },

    importPlan(date, blocks) {
      if (!this.schedules[date]) {
        this.schedules[date] = { blocks: [], mode: this.mode, startTime: '09:00' }
      }
      // Merge: deduplicate by id
      const existingIds = new Set(this.schedules[date].blocks.map(b => b.id))
      const newBlocks = blocks.filter(b => !existingIds.has(b.id))
      this.schedules[date].blocks.push(...newBlocks)
      this.timelineCfg[date] = null // Clear timeline cache so start time recalculates
      this.saveDay(date)
      return newBlocks.length
    },

    setTimelineStart(date, time) {
      if (!this.timelineCfg[date]) this.timelineCfg[date] = {}
      this.timelineCfg[date].start = time
    },

    /** Calculate cumulative start times */
    getComputedTimeline(date) {
      const sched = this.schedules[date]
      if (!sched || !sched.blocks) return []
      const startTime = this.timelineStart
      const [sh, sm] = startTime.split(':').map(Number)
      let cursor = sh * 60 + sm
      return sched.blocks.map(block => {
        const dur = block.duration || 30
        const start = cursor
        cursor += dur
        return {
          ...block,
          _startMin: start,
          _endMin: cursor,
          _startStr: Math.floor(start / 60).toString().padStart(2, '0') + ':' + (start % 60).toString().padStart(2, '0'),
          _endStr: Math.floor(cursor / 60).toString().padStart(2, '0') + ':' + (cursor % 60).toString().padStart(2, '0')
        }
      })
    },

    initFromCache() {
      try {
        const raw = localStorage.getItem('dp_schedules')
        if (raw) this.schedules = JSON.parse(raw)
      } catch { /* ignore */ }
      try {
        const rp = localStorage.getItem('dp_routineProgress')
        if (rp) this.routineProgress = JSON.parse(rp)
      } catch { /* ignore */ }
      try {
        const cfg = localStorage.getItem('dp_timelineCfg')
        if (cfg) this.timelineCfg = JSON.parse(cfg)
      } catch { /* ignore */ }
      try {
        const tasks = localStorage.getItem('dp_tasks')
        if (tasks) this.tasks = JSON.parse(tasks)
      } catch { /* ignore */ }
    }
  }
})
