import { defineStore } from 'pinia'
import api, { unwrap } from '@/api/client'
import { useScheduleStore } from '@/stores/schedule'
import { queueDayDataMerge } from '@/utils/dayDataMerge'

/* 模板列表为日期无关全局数据：会话内只拉一次（并发单飞；失败允许重试） */
let _routinesLoaded = false
let _routinesInFlight = null

export const useRoutineStore = defineStore('routines', {
  state: () => ({
    routines: [],          // Global template (shared across uninitialized future dates)
    dailyCopies: {},       // { [date]: Routine[] } — per-date independent copies
    loading: false
  }),

  getters: {
    /** Routines for the currently viewed date — daily copy first, template fallback.
     *  注意用 key 存在性判断：某日删空所有 routine 时不应回落到模板 */
    routinesForCurrentDate(state) {
      const scheduleStore = useScheduleStore()
      const date = scheduleStore.currentDate
      if (date in state.dailyCopies) {
        return state.dailyCopies[date]
      }
      return state.routines || []
    },

    templateCount(state) {
      return (state.routines || []).length
    }
  },

  actions: {
    async fetchRoutines({ force = false } = {}) {
      if (_routinesLoaded && !force) return this.routines
      if (_routinesInFlight) return _routinesInFlight
      this.loading = true
      _routinesInFlight = (async () => {
        try {
          const { data } = await api.get('/routines')
          const list = unwrap(data)
          if (Array.isArray(list) && list.length > 0) {
            this.routines = list
          }
          /* 请求成功即标记（空列表也是有效结果）；失败不标记，下次进入重试 */
          _routinesLoaded = true
        } catch { /* keep local cache */ }
        this.loading = false
        _routinesInFlight = null
        return this.routines
      })()
      return _routinesInFlight
    },

    async persistTemplate() {
      try {
        // 后端读取 body.get("routines")
        await api.put('/routines', { routines: this.routines })
        localStorage.setItem('dp_routines', JSON.stringify(this.routines))
      } catch {
        localStorage.setItem('dp_routines', JSON.stringify(this.routines))
      }
    },

    /** Add a routine to the global template */
    addRoutine(routine) {
      this.routines.push(routine)
      this.persistTemplate()
    },

    /** Remove a routine from the global template */
    removeRoutine(routineId) {
      this.routines = this.routines.filter(r => r.id !== routineId)
      this.persistTemplate()
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

    async _persistDaily(date) {
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
      // 服务端 day-data 是覆盖式整写：先 GET 合并其他字段再 PUT，避免清空 blocks/archive 等。
      // 合并写经 per-date 队列串行：与 archive.js 的合并写并发时互覆盖会丢字段
      await queueDayDataMerge(date, async () => {
        try {
          const { data } = await api.get(`/day-data/${date}`)
          const existing = unwrap(data) || {}
          await api.put(`/day-data/${date}`, { ...existing, routines: this.dailyCopies[date] || [] })
        } catch { /* silent */ }
      })
    },

    initFromCache() {
      try {
        const raw = localStorage.getItem('dp_routines')
        if (raw) this.routines = JSON.parse(raw)
      } catch { /* ignore */ }
    }
  }
})
