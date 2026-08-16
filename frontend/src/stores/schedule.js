import { reactive } from 'vue'
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

/* ── 性能治理：请求防抖 / 缓存 / 计算 memoize（模块级，store 单例）── */

const SAVE_DEBOUNCE_MS = 400  // saveDay 网络 PUT 合并窗口
const DAY_CACHE_TTL = 30000   // fetchDay 缓存有效期（本地 mutation 立即刷新）

const _saveTimers = new Map()  // date → timeoutId（待发的 PUT /plan）
const _dayFetchedAt = {}       // date → ts；有 ts 且在 TTL 内即复用缓存
const _dayInFlight = new Map() // date → Promise（同 date 并发去重）
let _presetRulesLoaded = false // preset/rules 为日期无关全局数据，会话内只拉一次
let _presetRulesInFlight = null
let _presetJson = null         // 内存中预设快照指纹
let _lastPresetJson = null     // 上次已提交 /plan-preset 的指纹（相同则跳过 PUT）
let _presetDirty = false       // 有待提交的预设快照

/* 响应式版本号：getComputedTimeline 的 computed 调用方在缓存命中路径上
   不会触碰 blocks 深字段 / orderCfg（依赖被重新收集后会丢失订阅），
   必须靠 _bumpDay 触发重算——版本号因此必须可观察（普通对象会导致
   命中后勾选/换序不再刷新 UI） */
const _dayVersion = reactive({}) // date → int：schedules/orderCfg/timelineCfg 变更即 +1
const _timelineCache = {}        // date → { v, result, byId }（getComputedTimeline 缓存）

/** 奖励金额存证：award 时记录实发金额，退款按存证退（不依赖 calcTaskReward 重算）。
    持久化到 localStorage（earned 服务端只存 item_id 不存金额，刷新后从这里恢复）。
    只保留近 AWARD_AMOUNTS_KEEP_DAYS 天：更早的退款回退到重算口径，防止无限增长 */
const AWARD_AMOUNTS_KEY = 'dp_awardAmounts'
const AWARD_AMOUNTS_KEEP_DAYS = 14

function _pruneAwardAmounts(map) {
  const cutoff = new Date(Date.now() - AWARD_AMOUNTS_KEEP_DAYS * 864e5).toISOString().slice(0, 10)
  const out = {}
  for (const date of Object.keys(map)) {
    if (date >= cutoff && map[date] && Object.keys(map[date]).length) out[date] = map[date]
  }
  return out
}

function _loadAwardAmounts() {
  try {
    const raw = localStorage.getItem(AWARD_AMOUNTS_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return (parsed && typeof parsed === 'object') ? _pruneAwardAmounts(parsed) : {}
  } catch {
    return {}
  }
}

/* earn/refund 请求按条目串行：快速「完成→取消」交错时 fire-and-forget 的
   POST/DELETE 到达服务端顺序不保证，DELETE 先到会让 earned 残留登记，
   下次 fetchDay 把残留拉回 earnedToday → 再次完成不再发奖（余额与登记脱节）。
   同一 (date,itemId) 的后一个请求等前一个落地后再发 */
const _awardReqs = {} // `${date}/${itemId}` → 在飞请求 Promise 链尾

function _queueAwardReq(date, itemId, send) {
  const key = date + '/' + itemId
  const prev = _awardReqs[key] || Promise.resolve()
  const p = prev.then(() => send().catch(() => {}))
  _awardReqs[key] = p
  p.then(() => { if (_awardReqs[key] === p) delete _awardReqs[key] })
}

function _bumpDay(date) {
  _dayVersion[date] = (_dayVersion[date] || 0) + 1
}

/**
 * 行内容指纹：getComputedTimeline 重建时内容未变的行复用旧对象引用，
 * TaskCard 的 :block prop 不变 → 勾选单个任务不再整列重渲染。
 * 须覆盖模板渲染依赖的全部可变字段（store 内块对象为原地 mutation）。
 */
function _rowFingerprint(b) {
  let fp = b.id + '|' + (b.subject || '') + '|' + b.duration + '|' + (b.priority || '') + '|' +
    (b.category || '') + '|' + (b.time || '') + '|' + (b.note || '') + '|' + (b.goalId || '') + '|' +
    (b.phase || '') + '|' + (b.completed ? 1 : 0) + '|' + b._rank + '|' + b._startMin + '|' + b._endMin
  const sts = b.subtasks
  if (sts && sts.length) fp += '|' + sts.map(st => (st.done ? '1' : '0') + ':' + (st.text || '')).join(',')
  return fp
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
    awardAmounts: _loadAwardAmounts(), // { [date]: { [itemId]: amount } } — 实发金额存证（退款口径）
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
    async fetchDay(date, { force = false } = {}) {
      /* TTL 缓存：近期已拉取（或本地 mutation 刷新过）直接复用内存态 */
      if (!force && _dayFetchedAt[date] && Date.now() - _dayFetchedAt[date] < DAY_CACHE_TTL) {
        return this.schedules[date] || null
      }
      /* in-flight 去重：同 date 并发请求复用同一 Promise */
      if (_dayInFlight.has(date)) return _dayInFlight.get(date)
      const p = this._fetchDayRemote(date).finally(() => _dayInFlight.delete(date))
      _dayInFlight.set(date, p)
      return p
    },

    async _fetchDayRemote(date) {
      this.loading = true
      const startedAt = Date.now()
      try {
        // 并行拉取：计划 + 排序配置 + 当日已发放 XP 条目（后两者失败静默）
        const [planResp, orderResp, earnedResp] = await Promise.all([
          api.get(`/plan/${date}`),
          api.get(`/order/${date}`).catch(() => null),
          api.get(`/earned/${date}`).catch(() => null)
        ])
        /* 飞行期间本地已发生 mutation（saveDay 把 ts 刷新到 startedAt 及之后）：
           响应必然旧于内存态（本地防抖 PUT 尚未到达服务端），跳过覆盖——
           否则过期响应冲掉本地修改，随后的防抖 PUT 会把旧数据写回服务端 */
        if (_dayFetchedAt[date] && _dayFetchedAt[date] >= startedAt) {
          this.loading = false
          return this.schedules[date] || null
        }
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
        _dayFetchedAt[date] = Date.now()
        _bumpDay(date)
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
        _bumpDay(date)
        /* 失败不刷新 _dayFetchedAt：下次进入仍重新拉取（与旧行为一致） */
        this.loading = false
        return this.schedules[date] || null
      }
    },

    /**
     * 保存当日计划：内存态与 localStorage 即时生效（UI 零延迟），
     * 网络 PUT 按 date 防抖合并（SAVE_DEBOUNCE_MS）；immediate 立即发送。
     * 页面隐藏 / 路由离开前须调 flushAllSaves 兜底。
     */
    saveDay(date, { immediate = false } = {}) {
      const sched = this.schedules[date]
      if (!sched) return
      _bumpDay(date)
      /* 本地即最新：fetchDay TTL 不会因自己刚写的数据回滚 */
      _dayFetchedAt[date] = Date.now()
      // Local cache（即时：页面意外关闭时的兜底恢复源）
      try {
        const raw = localStorage.getItem('dp_schedules')
        const all = raw ? JSON.parse(raw) : {}
        all[date] = sched
        localStorage.setItem('dp_schedules', JSON.stringify(all))
      } catch { /* ignore */ }
      // v13：当日结构同步为"最近预设"，供次日自动预填（规则块来自周期日程，不进预设）
      this._snapshotPreset(date, sched)
      if (immediate) return this._flushSave(date)
      if (_saveTimers.has(date)) clearTimeout(_saveTimers.get(date))
      _saveTimers.set(date, setTimeout(() => this._flushSave(date), SAVE_DEBOUNCE_MS))
    },

    /** 立即发送指定 date 的待发 PUT /plan（并顺带 flush 预设快照） */
    async _flushSave(date) {
      if (_saveTimers.has(date)) {
        clearTimeout(_saveTimers.get(date))
        _saveTimers.delete(date)
      }
      const sched = this.schedules[date]
      if (sched) {
        try {
          // 后端 save_plan 读取 dayMode/energyLevel/specialNotes/blocks/routines/customBlocks/priorityShift/encouragement
          await api.put(`/plan/${date}`, {
            ...sched,
            dayMode: sched.dayMode || sched.mode || this.mode
          })
        } catch { /* silent */ }
      }
      this._flushPreset()
    },

    flushSave(date) {
      return this._flushSave(date)
    },

    /** 路由离开 / visibilitychange hidden / pagehide 时调用：发出全部待发保存 */
    flushAllSaves() {
      for (const date of [..._saveTimers.keys()]) this._flushSave(date)
      this._flushPreset()
    },

    /** 预设快照 PUT：内容指纹与上次提交一致则跳过；失败标脏下次重试 */
    _flushPreset() {
      if (!_presetDirty) return
      if (_presetJson === _lastPresetJson) {
        _presetDirty = false
        return
      }
      const snapshot = _presetJson
      _lastPresetJson = snapshot
      _presetDirty = false
      api.put('/plan-preset', { preset: this.preset }).catch(() => {
        /* 发送失败：回滚指纹，下次 flush 重试（语义同旧的静默失败，但不丢重试机会） */
        _lastPresetJson = null
        _presetDirty = true
      })
    },

    /* ── v13 计划预设链 + 周期固定日程 ── */

    /** 拉取预设与周期规则（日期无关全局数据：会话内只拉一次，并发单飞；失败回落 localStorage 并允许重试） */
    fetchPresetAndRules({ force = false } = {}) {
      if (_presetRulesLoaded && !force) return Promise.resolve()
      if (_presetRulesInFlight) return _presetRulesInFlight
      _presetRulesInFlight = this._fetchPresetAndRulesRemote().finally(() => {
        _presetRulesInFlight = null
      })
      return _presetRulesInFlight
    },

    async _fetchPresetAndRulesRemote() {
      const [presetResp, rulesResp] = await Promise.all([
        api.get('/plan-preset').catch(() => null),
        api.get('/recurring-rules').catch(() => null)
      ])
      if (presetResp) {
        this.preset = unwrap(presetResp.data) || null
        /* 服务端预设为准：同步提交指纹（剔除 savedAt 与 _snapshotPreset 同口径），
           随后内容不变的 saveDay 不再 PUT /plan-preset */
        _presetJson = _lastPresetJson = JSON.stringify(this.preset ? { ...this.preset, savedAt: '' } : null)
        _presetDirty = false
      } else {
        try {
          const raw = localStorage.getItem('dp_plan_preset')
          if (raw) {
            this.preset = JSON.parse(raw)
            _presetJson = JSON.stringify(this.preset ? { ...this.preset, savedAt: '' } : null)
          }
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
      /* 两个请求都失败（纯本地回落）时允许下次重试 */
      if (presetResp || rulesResp) _presetRulesLoaded = true
    },

    /** saveDay 内联动：把当天结构（剔除完成态、剔除规则块）快照为最近预设。
     *  内容指纹不变则不动 preset 引用、不标脏（跳过 PUT /plan-preset）。 */
    _snapshotPreset(date, sched) {
      const src = (sched.blocks || []).filter(b => !b.ruleId)
      const next = src.length
        ? { blocks: src.map(b => _stripBlock(b)), savedFrom: date, savedAt: new Date().toISOString() }
        : null
      /* savedAt 每次都变 → 比对时剔除时间戳，只看结构内容 */
      const json = JSON.stringify(next ? { ...next, savedAt: '' } : null)
      if (json === _presetJson) return
      _presetJson = json
      this.preset = next
      try { localStorage.setItem('dp_plan_preset', JSON.stringify(this.preset)) } catch { /* ignore */ }
      if (json !== _lastPresetJson) _presetDirty = true
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
      _bumpDay(date)
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
      _bumpDay(date)
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
    awardOnce(date, itemId, amount) {
      const earned = this.earnedToday[date] || []
      if (earned.includes(itemId)) return false
      this.earnedToday[date] = [...earned, itemId]
      /* 金额存证：记录实发金额，退款按存证退——中途改 duration/priority 后
         用 calcTaskReward 重算会对不上账 */
      if (amount != null) {
        this.awardAmounts[date] = { ...(this.awardAmounts[date] || {}), [itemId]: amount }
        this._persistAwardAmounts()
      }
      _queueAwardReq(date, itemId, () => api.post(`/earned/${date}/${itemId}`))
      return true
    },

    /**
     * 撤销发奖：移除 earnedToday 登记（保证再次完成可重新发奖）+ DELETE 服务端登记。
     * 返回退款金额（存证优先，无存证用 fallbackAmount——兼容本特性上线前的旧发放）；
     * 该条目当日未发过奖返回 null。
     */
    revokeAward(date, itemId, fallbackAmount = 0) {
      const earned = this.earnedToday[date] || []
      if (!earned.includes(itemId)) return null
      this.earnedToday[date] = earned.filter(id => id !== itemId)
      const map = this.awardAmounts[date]
      const recorded = map ? map[itemId] : null
      const amount = recorded != null ? recorded : fallbackAmount
      if (map && recorded != null) {
        const next = { ...map }
        delete next[itemId]
        this.awardAmounts[date] = next
        this._persistAwardAmounts()
      }
      _queueAwardReq(date, itemId, () => api.delete(`/earned/${date}/${itemId}`))
      return amount
    },

    _persistAwardAmounts() {
      try {
        this.awardAmounts = _pruneAwardAmounts(this.awardAmounts)
        localStorage.setItem(AWARD_AMOUNTS_KEY, JSON.stringify(this.awardAmounts))
      } catch { /* ignore */ }
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
      if (!sched || !sched.blocks) {
        delete _timelineCache[date]
        return []
      }
      /* memoize：数据版本（_bumpDay）未变直接返回旧结果——同输入同引用，
         FlowTimeline/TaskCard 多处调用不再重复全量计算 */
      const v = _dayVersion[date] || 0
      const cache = _timelineCache[date]
      if (cache && cache.v === v) return cache.result
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

      const computed = [...pinnedComputed, ...flowComputed].sort((a, b) => a._startMin - b._startMin || a._rank - b._rank)

      /* 行对象复用：内容指纹未变的块沿用旧引用，TaskCard prop 身份不变 →
         单个块变化（勾选/改时）不再导致整列卡片重渲染 */
      const prevById = cache ? cache.byId : null
      const byId = new Map()
      const result = computed.map(row => {
        const fp = _rowFingerprint(row)
        const prev = prevById ? prevById.get(row.id) : null
        if (prev && prev.fp === fp) {
          byId.set(row.id, prev)
          return prev.row
        }
        const entry = { row, fp }
        byId.set(row.id, entry)
        return row
      })
      _timelineCache[date] = { v, result, byId }
      return result
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
