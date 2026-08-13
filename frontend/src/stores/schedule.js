import { defineStore } from 'pinia'
import { toLocalDate } from '@/utils/format'
import api, { unwrap } from '@/api/client'

export const useScheduleStore = defineStore('schedule', {
  state: () => ({
    currentDate: toLocalDate(new Date()),
    today: toLocalDate(new Date()),
    mode: 'full',
    schedules: {},          // { [date]: { blocks, customBlocks, startTime, dayMode, encouragement, ... } }
    tasks: [],              // manually created tasks (global)
    routineProgress: {},    // { [date]: { [routineId]: true } }
    timelineCfg: {},        // { [date]: { start, order } }（legacy 本地缓存）
    orderCfg: {},           // { [date]: { start, order } } — 服务端 /order/{date} 为准
    earnedToday: {},        // { [date]: [itemId...] } — 当日已发放 XP 的条目（防刷分）
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
      return state.schedules[state.currentDate] || { blocks: [], dayMode: state.mode, startTime: '09:00' }
    },
    todayBlocks(state) {
      const s = state.schedules[state.currentDate]
      return (s && s.blocks) ? s.blocks : []
    },
    timelineStart(state) {
      const oc = state.orderCfg[state.currentDate]
      if (oc && oc.start) return oc.start
      const cfg = state.timelineCfg[state.currentDate]
      return (cfg && cfg.start) ? cfg.start : '09:00'
    }
  },

  actions: {
    async fetchDay(date) {
      this.loading = true
      try {
        // 并行拉取：计划 + 排序配置 + 当日已发放 XP 条目（后两者失败静默）
        const [planResp, orderResp, earnedResp] = await Promise.all([
          api.get(`/plan/${date}`),
          api.get(`/order/${date}`).catch(() => null),
          api.get(`/earned/${date}`).catch(() => null)
        ])
        // 响应为 {ok, data} 包裹；无计划时 data 为 null → 展示"今日无事"
        const plan = unwrap(planResp.data)
        if (plan) {
          this.schedules[date] = plan
        } else {
          delete this.schedules[date]
        }
        const order = orderResp ? unwrap(orderResp.data) : null
        if (order && (order.start || Array.isArray(order.order))) {
          this.orderCfg[date] = order
        }
        const earned = earnedResp ? earnedResp.data?.earned : null
        if (Array.isArray(earned)) {
          this.earnedToday[date] = earned
        }
        this.loading = false
        return plan
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
        // 后端 save_plan 读取 dayMode/energyLevel/specialNotes/blocks/routines/customBlocks/priorityShift/encouragement
        await api.put(`/plan/${date}`, {
          ...sched,
          dayMode: sched.dayMode || sched.mode || this.mode
        })
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
      this.currentDate = toLocalDate(d)
    },

    nextDay() {
      const d = new Date(this.currentDate + 'T00:00:00')
      d.setDate(d.getDate() + 1)
      this.currentDate = toLocalDate(d)
    },

    addBlock(date, block) {
      if (!this.schedules[date]) {
        this.schedules[date] = { blocks: [], dayMode: this.mode, startTime: '09:00' }
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
        // 快照子任务完成状态，撤销时还原（而不是保留全 done）
        if (block.subtasks) {
          block._prevSubtaskDone = block.subtasks.map(st => !!st.done)
          block.subtasks.forEach(st => { st.done = true })
        }
      } else {
        block.completedAt = null
        if (block.subtasks && Array.isArray(block._prevSubtaskDone)) {
          block.subtasks.forEach((st, i) => {
            st.done = block._prevSubtaskDone[i] ?? st.done
          })
          delete block._prevSubtaskDone
        }
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
        this.schedules[date] = { blocks: [], dayMode: this.mode, startTime: '09:00' }
      }
      // Merge: deduplicate by id
      const existingIds = new Set(this.schedules[date].blocks.map(b => b.id))
      const newBlocks = blocks.filter(b => !existingIds.has(b.id))
      this.schedules[date].blocks.push(...newBlocks)
      this.timelineCfg[date] = null // Clear timeline cache so start time recalculates
      this.saveDay(date)
      return newBlocks.length
    },

    /* ── 固定事务打卡：服务端持久化 + 本地缓存 ── */
    async fetchRoutineProgress(date) {
      try {
        const { data } = await api.get(`/routine-done/${date}`)
        const done = unwrap(data) || {}
        this.routineProgress[date] = { ...(this.routineProgress[date] || {}), ...done }
      } catch { /* keep local cache */ }
    },

    setRoutineDone(date, routineId, done) {
      if (!this.routineProgress[date]) this.routineProgress[date] = {}
      this.routineProgress[date][routineId] = done
      try {
        localStorage.setItem('dp_routineProgress', JSON.stringify(this.routineProgress))
      } catch { /* ignore */ }
      api.put(`/routine-done/${date}/${routineId}`, { done }).catch(() => {})
    },

    /* ── 排序 / 起点持久化（PUT /order/{date}，body {start, order:[blockId...]}）── */
    _persistOrderCfg(date) {
      const cfg = this.orderCfg[date]
      if (!cfg) return
      api.put(`/order/${date}`, { start: cfg.start || '09:00', order: cfg.order || [] }).catch(() => {})
    },

    setTimelineStart(date, time) {
      const blocks = this.schedules[date]?.blocks || []
      const existing = this.orderCfg[date]
      this.orderCfg[date] = {
        start: time,
        order: Array.isArray(existing?.order) && existing.order.length
          ? existing.order
          : blocks.map(b => b.id)
      }
      this._persistOrderCfg(date)
    },

    applyOrder(date, orderIds) {
      const existing = this.orderCfg[date]
      this.orderCfg[date] = {
        start: existing?.start || this.timelineCfg[date]?.start || '09:00',
        order: orderIds
      }
      this._persistOrderCfg(date)
    },

    /* ── XP 防刷分：每个条目每天只发一次（服务端幂等）── */
    awardOnce(date, itemId) {
      const earned = this.earnedToday[date] || []
      if (earned.includes(itemId)) return false
      this.earnedToday[date] = [...earned, itemId]
      api.post(`/earned/${date}/${itemId}`).catch(() => {})
      return true
    },

    /** Calculate cumulative start times（先按 orderCfg 排序，再推算 _startMin） */
    getComputedTimeline(date) {
      const sched = this.schedules[date]
      if (!sched || !sched.blocks) return []
      const order = this.orderCfg[date]?.order
      let blocks = sched.blocks
      if (Array.isArray(order) && order.length) {
        const rank = new Map(order.map((id, i) => [id, i]))
        blocks = [...sched.blocks].sort((a, b) => {
          const ra = rank.has(a.id) ? rank.get(a.id) : order.length
          const rb = rank.has(b.id) ? rank.get(b.id) : order.length
          return ra - rb
        })
      }
      const startTime = this.timelineStart
      const [sh, sm] = startTime.split(':').map(Number)
      let cursor = sh * 60 + sm
      return blocks.map(block => {
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
