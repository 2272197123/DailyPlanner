import { defineStore } from 'pinia'
import { toLocalDate } from '@/utils/format'
import api, { unwrap } from '@/api/client'

/* ── v13 模块级工具 ── */

/** "HH:MM" 格式校验 */
function _isTimeStr(t) {
  return typeof t === 'string' && /^\d{1,2}:\d{2}$/.test(t)
}

/** "HH:MM" → 分钟数 */
function _parseTime(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** 分钟数 → "HH:MM" */
function _fmtMin(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0')
}

/** 两个 "HH:MM" 之间的分钟数（结束 ≤ 开始返回 0） */
function _minutesBetween(start, end) {
  if (!_isTimeStr(start) || !_isTimeStr(end)) return 0
  return Math.max(0, _parseTime(end) - _parseTime(start))
}

/** 克隆任务块并清零完成态（预设快照 / 次日预填用） */
function _stripBlock(b) {
  const clone = JSON.parse(JSON.stringify(b))
  clone.completed = false
  clone.completedAt = null
  delete clone._prevSubtaskDone
  delete clone._startMin
  delete clone._endMin
  delete clone._startStr
  delete clone._endStr
  if (Array.isArray(clone.subtasks)) {
    clone.subtasks.forEach(st => { st.done = false })
  }
  return clone
}

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
    preset: null,           // 最近计划结构快照（v13：次日自动预填；服务端 /plan-preset 为准）
    recurringRules: [],     // 周期固定日程规则（v13：课表/班表；服务端 /recurring-rules 为准）
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
      // v13：当日结构同步为"最近预设"，供次日自动预填（规则块来自周期日程，不进预设）
      this._snapshotPreset(date, sched)
    },

    /* ── v13 计划预设链 + 周期固定日程 ── */

    /** 拉取预设与周期规则（随 loadDay 并行调用；失败回落 localStorage） */
    async fetchPresetAndRules() {
      const [presetResp, rulesResp] = await Promise.all([
        api.get('/plan-preset').catch(() => null),
        api.get('/recurring-rules').catch(() => null)
      ])
      if (presetResp) {
        this.preset = unwrap(presetResp.data) || null
      } else {
        try {
          const raw = localStorage.getItem('dp_plan_preset')
          if (raw) this.preset = JSON.parse(raw)
        } catch { /* ignore */ }
      }
      if (rulesResp) {
        const d = unwrap(rulesResp.data)
        this.recurringRules = Array.isArray(d) ? d : []
      } else {
        try {
          const raw = localStorage.getItem('dp_recurring_rules')
          if (raw) this.recurringRules = JSON.parse(raw)
        } catch { /* ignore */ }
      }
    },

    /** saveDay 内联动：把当天结构（剔除完成态、剔除规则块）快照为最近预设 */
    _snapshotPreset(date, sched) {
      const src = (sched.blocks || []).filter(b => !b.ruleId)
      this.preset = src.length
        ? { blocks: src.map(b => _stripBlock(b)), savedFrom: date, savedAt: new Date().toISOString() }
        : null
      try { localStorage.setItem('dp_plan_preset', JSON.stringify(this.preset)) } catch { /* ignore */ }
      api.put('/plan-preset', { preset: this.preset }).catch(() => {})
    },

    saveRecurringRules(rules) {
      this.recurringRules = rules
      try { localStorage.setItem('dp_recurring_rules', JSON.stringify(rules)) } catch { /* ignore */ }
      api.put('/recurring-rules', { rules }).catch(() => {})
    },

    /** 把匹配某日期的周期规则物化为钉时任务块 */
    materializeRules(dateStr) {
      const d = new Date(dateStr + 'T00:00:00')
      const weekday = d.getDay() || 7 // 1=周一 … 7=周日
      const out = []
      for (const rule of this.recurringRules) {
        if (!Array.isArray(rule.weekdays) || !rule.weekdays.includes(weekday)) continue
        if (rule.dateStart && dateStr < rule.dateStart) continue
        if (rule.dateEnd && dateStr > rule.dateEnd) continue
        const dur = _minutesBetween(rule.startTime, rule.endTime)
        if (dur <= 0) continue
        out.push({
          id: `rule_${rule.id}_${dateStr}`,
          ruleId: rule.id,
          subject: rule.name,
          time: rule.startTime,
          duration: dur,
          category: rule.category || 'other',
          priority: rule.priority || 'medium',
          note: rule.note || '',
          subtasks: [],
          completed: false,
          completedAt: null
        })
      }
      return out
    },

    /**
     * 空白日期（今天/未来）自动建计划：仅物化周期规则（钉时）。
     * v14：预设不再自动导入，改为用户手动「导入前一天」并按需取舍。
     */
    async ensureDayPlan(date) {
      if (date < this.today) return false
      const sched = this.schedules[date]
      if (sched && Array.isArray(sched.blocks) && sched.blocks.length > 0) return false

      const blocks = this.materializeRules(date)
      if (!blocks.length) return false

      if (!this.schedules[date]) {
        this.schedules[date] = { blocks: [], dayMode: this.mode, startTime: '09:00' }
      }
      this.schedules[date].blocks = blocks
      await this.saveDay(date)
      return true
    },

    /** 手动把缺失的规则块合并进已存在的当天计划（按 ruleId 去重） */
    syncRulesToDate(date) {
      const ruleBlocks = this.materializeRules(date)
      if (!ruleBlocks.length) return 0
      if (!this.schedules[date]) {
        this.schedules[date] = { blocks: [], dayMode: this.mode, startTime: '09:00' }
      }
      const existing = new Set(this.schedules[date].blocks.map(b => b.ruleId).filter(Boolean))
      const fresh = ruleBlocks.filter(b => !existing.has(b.ruleId))
      if (fresh.length) {
        this.schedules[date].blocks.push(...fresh)
        this.saveDay(date)
      }
      return fresh.length
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

    /**
     * Calculate cumulative start times（先按 orderCfg 排序，再推算 _startMin）
     * v13：block.time 非空的为"钉时块"（固定日程），保持其时间不变；
     * 其余为"流动块"，从 timelineStart 顺排，与钉时块重叠时自动绕到其后。
     * 最终输出按 _startMin 升序。
     */
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

      const pinned = []
      const flow = []
      for (const b of blocks) {
        if (_isTimeStr(b.time)) pinned.push(b)
        else flow.push(b)
      }

      const pinnedComputed = pinned
        .map(b => {
          const start = _parseTime(b.time)
          const end = start + (b.duration || 30)
          return { ...b, _startMin: start, _endMin: end, _startStr: _fmtMin(start), _endStr: _fmtMin(end) }
        })
        .sort((a, b) => a._startMin - b._startMin)

      const [sh, sm] = this.timelineStart.split(':').map(Number)
      let cursor = sh * 60 + sm
      const flowComputed = flow.map(b => {
        const dur = b.duration || 30
        // 与钉时块重叠 → 顺延到其后（钉时块已按开始时间升序）
        for (const p of pinnedComputed) {
          if (cursor < p._endMin && cursor + dur > p._startMin) cursor = p._endMin
        }
        const start = cursor
        cursor = start + dur
        return { ...b, _startMin: start, _endMin: cursor, _startStr: _fmtMin(start), _endStr: _fmtMin(cursor) }
      })

      return [...pinnedComputed, ...flowComputed].sort((a, b) => a._startMin - b._startMin)
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
