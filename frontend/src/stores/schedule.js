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
          /* v2 起 order 为全局顺序（钉时 id 由拖拽落点显式写入、作为锚点）。
             旧版写入的 order 可能混入钉时 id（旧 setTimelineStart 兜底按计划数组
             原始序整列写入、旧拖拽按展示序整列写入），那些钉时排位并非锚点意图——
             迁移时剔除，否则旧数据里的钉时块会把排在它之后的流动块错推到其结束之后 */
          if (order.v !== 2 && Array.isArray(order.order)) {
            const pinnedIds = new Set(
              (this.schedules[date]?.blocks || []).filter(b => _isTimeStr(b.time)).map(b => b.id)
            )
            if (pinnedIds.size) order.order = order.order.filter(id => !pinnedIds.has(id))
          }
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
      const wasPinned = _isTimeStr(sched.blocks[idx].time)
      Object.assign(sched.blocks[idx], updates)
      /* 流动→钉时（轮盘钉住 / 编辑面板设时间）：与拖拽钉住一致，从全局顺序移除——
         残留的流动排位会变成钉时锚点，把排在它之后的流动块错推到钉时块结束之后。
         转为流动（清除时间）不动 order：该 id 自然按兜底规则排到末尾（同新建块） */
      if (!wasPinned && _isTimeStr(sched.blocks[idx].time)) {
        const oc = this.orderCfg[date]
        if (oc && Array.isArray(oc.order) && oc.order.includes(blockId)) {
          oc.order = oc.order.filter(id => id !== blockId)
          this._persistOrderCfg(date)
        }
      }
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
      /* v:2 = 全局顺序语义（钉时 id 在列即锚点）；无 v 的旧数据在 fetchDay 迁移 */
      api.put(`/order/${date}`, { start: cfg.start || '09:00', order: cfg.order || [], v: 2 }).catch(() => {})
    },

    setTimelineStart(date, time) {
      const existing = this.orderCfg[date]
      this.orderCfg[date] = {
        start: time,
        order: Array.isArray(existing?.order) && existing.order.length
          ? existing.order
          /* 无既有顺序时以当前展示序（含钉时块、按计算时间）初始化全局顺序，
             避免用计划数组原始序导致钉时锚点错位 */
          : this.getComputedTimeline(date).map(b => b.id)
      }
      this._persistOrderCfg(date)
    },

    applyOrder(date, orderIds) {
      /* order 语义 = 全局顺序（钉时 + 流动 id 皆在列，即用户的排列意图）。
         兼容旧数据：旧 order 只含流动 id 也可直接使用（未出现的 id 按兜底规则排序）。 */
      const existing = this.orderCfg[date]
      this.orderCfg[date] = {
        start: existing?.start || this.timelineCfg[date]?.start || '09:00',
        order: orderIds
      }
      this._persistOrderCfg(date)
    },

    /**
     * 拖拽落点动作解析（useDragSort 的 onDrop 回调）
     * target = { beforeId }（插入到某块之前；null = 末尾）或 { onId }（落在钉时块上）
     * - 流动块落间隙 → 插入全局顺序对应位置（钉时块 id 也在序列中，落钉时块前间隙
     *   不再误追加到末尾）；纯重排，不改任何块的时间
     * - 流动块落到钉时块上 → 钉住被拖块（时间=目标开始，冲突只顺延被拖块自身，5min 取整）
     * - 钉时块拖动 → 只改被拖块自身时间（落点映射时间，避开其他钉时块）
     * 铁律：以上任何路径都不改写「既有钉时块」的 time/duration。
     */
    resolveDrop(date, dragId, target) {
      const sched = this.schedules[date]
      if (!sched || !sched.blocks || !target) return
      const dragged = sched.blocks.find(b => b.id === dragId)
      if (!dragged) return
      const timeline = this.getComputedTimeline(date)
      const dur = dragged.duration || 30
      const pinnedOthers = timeline.filter(b => b.id !== dragId && _isTimeStr(b.time))

      /* 5 分钟取整 + 避开钉时块（与其他钉时块重叠则顺延到其后） */
      const settle = (min) => {
        let s = Math.round(min / 5) * 5
        for (let i = 0; i < 6; i++) {
          let moved = false
          for (const p of pinnedOthers) {
            if (s < p._endMin && s + dur > p._startMin) {
              s = Math.round(p._endMin / 5) * 5
              moved = true
            }
          }
          if (!moved) break
        }
        return Math.max(0, Math.min(s, 24 * 60 - dur))
      }

      if (_isTimeStr(dragged.time)) {
        /* 钉时块拖动 → 改时间 */
        let base = null
        if (target.onId && target.onId !== dragId) {
          const t = timeline.find(b => b.id === target.onId)
          base = t ? t._startMin : null
        } else {
          /* 间隙：取前后相邻块时间中点（无前块用时间轴起点，无后块用前块结束） */
          const others = timeline.filter(b => b.id !== dragId)
          let idx = target.beforeId ? others.findIndex(b => b.id === target.beforeId) : others.length
          if (idx === -1) idx = others.length
          const prev = idx > 0 ? others[idx - 1] : null
          const next = idx < others.length ? others[idx] : null
          if (prev && next) base = Math.round((prev._startMin + next._startMin) / 2)
          else if (next) base = _parseTime(this.orderCfg[date]?.start || this.timelineCfg[date]?.start || '09:00')
          else if (prev) base = prev._endMin
          else base = 9 * 60
        }
        if (base === null) return
        dragged.time = _fmtMin(settle(base))
        this.saveDay(date)
        return
      }

      if (target.onId && target.onId !== dragId) {
        /* 流动块落到钉时块上 → 钉住被拖块：时间=目标开始，冲突只顺延被拖块自身；
           目标钉时块与其他块一律不动。随后从全局顺序移除——钉住后位置由 time 决定，
           残留的旧流动排位会变成钉时锚点、错误地把后续流动块推到其结束之后 */
        const t = timeline.find(b => b.id === target.onId)
        if (!t || !_isTimeStr(t.time)) return
        dragged.time = _fmtMin(settle(t._startMin))
        this.saveDay(date)
        const oc = this.orderCfg[date]
        if (oc && Array.isArray(oc.order) && oc.order.includes(dragId)) {
          this.applyOrder(date, oc.order.filter(id => id !== dragId))
        }
        return
      }

      /* 流动块落间隙 → 插入全局顺序的对应位置。
         工作序列 = 当前展示序（钉时 + 流动）：beforeId 是钉时块 id 时同样精确插入，
         不再因 flowIds.indexOf = -1 而追加到流动序末尾（视觉落点与结果一致） */
      const ids = timeline.map(b => b.id)
      const from = ids.indexOf(dragId)
      if (from === -1) return
      ids.splice(from, 1)
      let to = target.beforeId ? ids.indexOf(target.beforeId) : ids.length
      if (to === -1) to = ids.length
      ids.splice(to, 0, dragId)
      if (ids.every((id, i) => id === timeline[i].id)) return // 位置未变，省去一次写盘
      this.applyOrder(date, ids)
    },

    /** 把任务块移到另一天：两边 saveDay；目标日全局顺序追加（流动块） */
    moveBlockToDate(fromDate, toDate, blockId) {
      if (fromDate === toDate) return
      const from = this.schedules[fromDate]
      if (!from || !from.blocks) return
      const idx = from.blocks.findIndex(b => b.id === blockId)
      if (idx === -1) return
      const [block] = from.blocks.splice(idx, 1)
      if (!this.schedules[toDate]) {
        this.schedules[toDate] = { blocks: [], dayMode: this.mode, startTime: '09:00' }
      }
      this.schedules[toDate].blocks.push(block)
      /* 原日全局顺序移除 */
      const oc = this.orderCfg[fromDate]
      if (oc && Array.isArray(oc.order) && oc.order.includes(blockId)) {
        oc.order = oc.order.filter(id => id !== blockId)
        this._persistOrderCfg(fromDate)
      }
      /* 目标日全局顺序追加（无既有顺序时以当前展示序初始化，避免数组原始序错位锚点） */
      if (!_isTimeStr(block.time)) {
        const toc = this.orderCfg[toDate]
        const order = Array.isArray(toc?.order)
          ? [...toc.order]
          : this.getComputedTimeline(toDate).map(b => b.id).filter(id => id !== blockId)
        order.push(blockId)
        this.orderCfg[toDate] = { start: toc?.start || this.timelineCfg[toDate]?.start || '09:00', order }
        this._persistOrderCfg(toDate)
      }
      this.saveDay(fromDate)
      this.saveDay(toDate)
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
     * Calculate cumulative start times（全局顺序 → 推算 _startMin）
     * v15：orderCfg.order 升级为「全局顺序」——钉时 + 流动 id 皆在列，即用户排列意图。
     * - 钉时块（block.time 非空）：时间固定，只按开始时间排序展示，永不被推算改动；
     * - 流动块：按全局顺序从 timelineStart 起依次放入钉时块之间的空档——
     *   排在钉时块 P 之前的流动块须整体放入 [cursor, P.start)；放不下则顺延到
     *   P.end 之后的空档继续按顺序放（流动块间相对顺序不变，钉时块不动）；
     * - 钉时锚点：在 order 中有明确排位的钉时块，排在它之后的流动块不得早于它结束；
     * - 兼容旧数据：旧 order 只含流动 id 时，未出现的 id 排在已知 id 之后
     *   （保持计划数组原始相对顺序），未排位的钉时块不锚定，行为与旧版
     *   「流动顺排、遇钉时绕行」完全一致。
     * 最终输出按 _startMin 升序，并列按全局顺序索引。
     */
    getComputedTimeline(date) {
      const sched = this.schedules[date]
      if (!sched || !sched.blocks) return []
      const order = this.orderCfg[date]?.order
      const rank = new Map()
      if (Array.isArray(order)) order.forEach((id, i) => { if (!rank.has(id)) rank.set(id, i) })
      const base = Array.isArray(order) ? order.length : 0
      const items = sched.blocks.map((b, i) => ({
        b,
        ranked: rank.has(b.id),
        rank: rank.has(b.id) ? rank.get(b.id) : base + i
      }))
      items.sort((x, y) => x.rank - y.rank)

      /* 钉时块：按 time 固定，仅排序展示 */
      const pinnedComputed = []
      for (const { b, rank } of items) {
        if (!_isTimeStr(b.time)) continue
        const start = _parseTime(b.time)
        const end = start + (b.duration || 30)
        pinnedComputed.push({ ...b, _rank: rank, _startMin: start, _endMin: end, _startStr: _fmtMin(start), _endStr: _fmtMin(end) })
      }
      pinnedComputed.sort((a, b) => a._startMin - b._startMin || a._rank - b._rank)

      /* 按所查日期取起点（不用 timelineStart getter——它只看 currentDate，
         moveBlockToDate/setTimelineStart 会为其他日期调用本函数）；
         对 currentDate 而言与 getter 完全等价（同一优先级链） */
      const startStr = this.orderCfg[date]?.start || this.timelineCfg[date]?.start || '09:00'
      const [sh, sm] = startStr.split(':').map(Number)
      let cursor = sh * 60 + sm
      const flowComputed = []
      for (const { b, rank, ranked } of items) {
        if (_isTimeStr(b.time)) {
          /* 钉时锚点（仅 order 中有明确排位时）：后续流动块不得早于它结束 */
          if (ranked) {
            const end = _parseTime(b.time) + (b.duration || 30)
            if (end > cursor) cursor = end
          }
          continue
        }
        const dur = b.duration || 30
        /* 空档放不下（与钉时块重叠）→ 整体顺延到该钉时块结束之后 */
        for (const p of pinnedComputed) {
          if (cursor < p._endMin && cursor + dur > p._startMin) cursor = p._endMin
        }
        const start = cursor
        cursor = start + dur
        flowComputed.push({ ...b, _rank: rank, _startMin: start, _endMin: cursor, _startStr: _fmtMin(start), _endStr: _fmtMin(cursor) })
      }

      return [...pinnedComputed, ...flowComputed].sort((a, b) => a._startMin - b._startMin || a._rank - b._rank)
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
