import { defineStore } from 'pinia'
import api, { unwrap } from '@/api/client'
import { useScheduleStore } from '@/stores/schedule'
import { useRoutineStore } from '@/stores/routines'
import { useCurrencyStore } from '@/stores/currency'
import { useMoodStore } from '@/stores/mood'
import { hexToHsl } from '@/utils/color'
import { queueDayDataMerge } from '@/utils/dayDataMerge'

/* loadReview 同 date 并发去重（参照 schedule.js fetchDay 的 in-flight 模式） */
const _reviewInFlight = new Map() // date → Promise
/* 本地存档写入时间戳：loadReview 的 GET 响应若旧于本地写入（archiveDay 的 PUT
   尚未落地时并发读回），跳过覆盖，避免过期响应冲掉刚存档的复盘
   （同 schedule.js _fetchDayRemote 的 startedAt 守卫模式） */
const _reviewLocalWriteAt = {} // date → ts
/* 自动存档防重标记：值为已触发自动存档的日期（同日只触发一次） */
const AUTO_ARCHIVE_KEY = 'dp_auto_archive_done'
/* 补档检测回溯天数：昨日 + 前日 */
const MISSED_LOOKBACK_DAYS = 2

function _shiftDate(date, deltaDays) {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + deltaDays)
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

/* 由色相推出冷暖倾向（帮助 AI 判断情绪效价，不硬编码心情标签） */
function colorTendency(hex) {
  const h = hexToHsl(hex).h
  if (h < 70 || h >= 330) return '偏暖'
  if (h >= 150 && h < 300) return '偏冷'
  return '中性'
}

export const useArchiveStore = defineStore('archive', {
  state: () => ({
    reviewData: {},           // { [date]: { feedback, rating, aiReview, archivedAt } }
    missedDates: [],          // 近期已过存档点但未存档的日期（补档提示用）
    aiPersonaPrompt: '',
    archiveHour: 23,
    archiveMinute: 30,
    loading: false
  }),

  getters: {
    defaultAiPersona() {
      return '你是一位温和但严格的导师，善于发现学生的进步并给予真诚的鼓励。请根据当天任务完成情况，对用户进行评价：指出做得好的地方、可以改进的地方，并以温暖的语气鼓励用户明天继续努力。语气参考：循循善诱的心理医生 + 严格但温暖的老师。'
    },

    effectivePersona(state) {
      return state.aiPersonaPrompt || this.defaultAiPersona
    },

    /** Is a date archived (locked)? */
    isArchived(state) {
      return (date) => !!(state.reviewData[date] && state.reviewData[date].archivedAt)
    },

    /** Get review for a specific date */
    reviewForDate(state) {
      return (date) => state.reviewData[date] || null
    },

    /** Should we prompt the user to archive today? */
    shouldPromptArchive() {
      const scheduleStore = useScheduleStore()
      const today = scheduleStore.today
      if (this.isArchived(today)) return false
      const now = new Date()
      const deadline = new Date(today + 'T' +
        String(this.archiveHour).padStart(2, '0') + ':' +
        String(this.archiveMinute).padStart(2, '0') + ':00')
      return now >= deadline
    }
  },

  actions: {
    /** Archive today with feedback + optional AI review */
    async archiveDay(date, { feedback, rating, requestAi = false }) {
      const scheduleStore = useScheduleStore()
      const routineStore = useRoutineStore()
      const currencyStore = useCurrencyStore()

      const sched = scheduleStore.schedules[date] || { blocks: [], mode: scheduleStore.mode }
      const rp = scheduleStore.routineProgress[date] || {}
      const routines = routineStore.dailyCopies[date] || routineStore.routines || []

      // Completion stats
      const totalTasks = (sched.blocks || []).length
      const doneTasks = (sched.blocks || []).filter(b => b.completed).length
      const totalSubtasks = (sched.blocks || []).reduce((s, b) => s + (b.subtasks ? b.subtasks.length : 0), 0)
      const doneSubtasks = (sched.blocks || []).reduce((s, b) => s + (b.subtasks ? b.subtasks.filter(st => st.done).length : 0), 0)
      const routineTotal = routines.length
      const routineDone = routines.filter(r => rp[r.id]).length

      const stats = { totalTasks, doneTasks, totalSubtasks, doneSubtasks, routineTotal, routineDone }

      let aiReview = null
      if (requestAi) {
        try {
          aiReview = await this._requestAiReview(date, { feedback, rating, stats, blocks: sched.blocks, routines, routineProgress: rp })
        } catch {
          aiReview = null
        }
      }

      const review = {
        feedback: feedback || '',
        rating: rating || 0,
        aiReview: aiReview,
        stats,
        xpBalance: currencyStore.balance,
        mode: scheduleStore.mode,
        archivedAt: new Date().toISOString()
      }

      this.reviewData[date] = review
      _reviewLocalWriteAt[date] = Date.now()
      this.missedDates = this.missedDates.filter(d => d !== date)

      // Persist: localStorage + API
      this._persistLocal(date, review)
      // 服务端 day-data 是覆盖式整写：先 GET 合并其他字段再 PUT，
      // 避免存档清掉该日的 routines/routineProgress/timelineCfg（照 routines.js 模式）。
      // 合并写经 per-date 队列串行：与 routines.js 的合并写并发时互覆盖会丢字段
      await queueDayDataMerge(date, async () => {
        try {
          const { data } = await api.get(`/day-data/${date}`)
          const existing = unwrap(data) || {}
          await api.put(`/day-data/${date}`, { ...existing, archiveData: review })
        } catch { /* silent */ }
      })

      return review
    },

    /** 从服务端读回某日的存档复盘（含 AI 评价），灌回 reviewData。
     *  localStorage 先行兜底展示，服务端为最终真源；同 date 并发去重 */
    async loadReview(date) {
      if (!date) return null
      if (_reviewInFlight.has(date)) return _reviewInFlight.get(date)
      const p = (async () => {
        if (!this.reviewData[date]) {
          try {
            const raw = localStorage.getItem('dp_day_data_' + date)
            if (raw) {
              const cached = JSON.parse(raw)
              if (cached.archiveData) this.reviewData[date] = cached.archiveData
            }
          } catch { /* ignore */ }
        }
        const startedAt = Date.now()
        try {
          const { data } = await api.get(`/day-data/${date}`)
          const remote = unwrap(data)
          /* 服务端有存档才覆盖内存：服务端无存档时保留本地较新的存档（PUT 可能失败过）。
             飞行期间本地已发生存档写入（archiveDay 的 PUT 尚未落地）时响应必然更旧，
             跳过覆盖，否则过期响应会冲掉刚存档的复盘 */
          if (remote && remote.archiveData &&
              !(_reviewLocalWriteAt[date] && _reviewLocalWriteAt[date] >= startedAt)) {
            this.reviewData[date] = remote.archiveData
          }
        } catch { /* 离线/失败时保留本地缓存 */ }
        return this.reviewData[date] || null
      })().finally(() => _reviewInFlight.delete(date))
      _reviewInFlight.set(date, p)
      return p
    },

    /** 到点自动存档：now >= 存档时间且今日未存档时自动 archiveDay(today)。
     *  同日只触发一次（localStorage 持久化标记，先于执行写入，防定时器/visibilitychange 并发重入）。
     *  AI 评价失败时 archiveDay 内部已降级为无 AI 文本存档，不弹错 */
    async checkAutoArchive() {
      const scheduleStore = useScheduleStore()
      const today = scheduleStore.today
      if (!this.shouldPromptArchive) return false
      try {
        if (localStorage.getItem(AUTO_ARCHIVE_KEY) === today) return false
        localStorage.setItem(AUTO_ARCHIVE_KEY, today)
      } catch { /* localStorage 不可用时仍执行，由 isArchived 防重 */ }
      // 确保今日数据在内存中（统计口径需要 blocks/routineProgress/routines）
      try {
        if (!scheduleStore.schedules[today]) await scheduleStore.fetchDay(today)
        /* 本地缓存被清时 reviewData 为空、防重标记也丢了：先从服务端读回，
           已存档则不重复自动存档（否则空 feedback 的自动存档会覆盖已有的手动存档） */
        await this.loadReview(today)
        await scheduleStore.fetchRoutineProgress(today)
        await useRoutineStore().fetchRoutines()
      } catch { /* 数据拉取失败不阻塞存档，按已有内存态统计 */ }
      if (this.isArchived(today)) return false // 拉取期间可能已被手动存档
      try {
        await this.archiveDay(today, { requestAi: true })
      } catch {
        /* 存档意外失败：回滚防重标记，下个检查周期可重试（否则失败一次当天再不自动存档） */
        try { localStorage.removeItem(AUTO_ARCHIVE_KEY) } catch { /* ignore */ }
        return false
      }
      return true
    },

    /** 次日打开检测：近期（昨日/前日）未存档的日期，给补档入口 */
    async checkMissedArchives() {
      const scheduleStore = useScheduleStore()
      const today = scheduleStore.today
      const missed = []
      for (let back = 1; back <= MISSED_LOOKBACK_DAYS; back++) {
        const date = _shiftDate(today, -back)
        const review = await this.loadReview(date)
        if (!review || !review.archivedAt) missed.push(date)
      }
      this.missedDates = missed
      return missed
    },

    async _requestAiReview(date, { feedback, rating, stats, blocks, routines, routineProgress }) {
      const apiConfig = this._getApiConfig()
      if (!apiConfig || !apiConfig.apiKey) return null

      const doneBlocks = (blocks || []).filter(b => b.completed)
      const undoneBlocks = (blocks || []).filter(b => !b.completed)
      const doneRoutines = (routines || []).filter(r => routineProgress && routineProgress[r.id])
      const undoneRoutines = (routines || []).filter(r => !routineProgress || !routineProgress[r.id])

      /* 当日心情吐槽：每条一行（文本 + 冷暖倾向）；无吐槽则整段省略。
         心情标签非默认（'一般'）时一并附上 */
      const moodStore = useMoodStore()
      const vents = moodStore.getVents(date)
      const moodLabel = moodStore.getEntry(date)?.label
      const ventLines = []
      if (vents.length) {
        ventLines.push('当日心情吐槽：')
        if (moodLabel && moodLabel !== '一般') ventLines.push(`  当日心情：${moodLabel}`)
        vents.forEach(v => ventLines.push(`  · ${v.text}（${colorTendency(v.color)}）`))
      }

      const userPrompt = [
        `日期：${date}`,
        `用户自评：${feedback || '(无)'}`,
        `评分：${'★'.repeat(rating || 0)}${'☆'.repeat(5 - (rating || 0))}`,
        ...(ventLines.length ? ['', ...ventLines] : []),
        '',
        '已完成任务：',
        ...doneBlocks.map(b => `  ✓ ${b.subject} (${b.duration}min)${b.note ? ' — ' + b.note : ''}`),
        '',
        '未完成任务：',
        ...undoneBlocks.map(b => `  ✗ ${b.subject} (${b.duration}min)`),
        '',
        '已完成固定事务：',
        ...doneRoutines.map(r => `  ✓ ${r.name}`),
        '',
        '未完成固定事务：',
        ...undoneRoutines.map(r => `  ✗ ${r.name}`),
        '',
        `统计：任务 ${stats.doneTasks}/${stats.totalTasks}，日课 ${stats.routineDone}/${stats.routineTotal}，子任务 ${stats.doneSubtasks}/${stats.totalSubtasks}`
      ].join('\n')

      const resp = await fetch(apiConfig.baseUrl + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiConfig.apiKey
        },
        body: JSON.stringify({
          model: apiConfig.model || 'deepseek-chat',
          messages: [
            { role: 'system', content: this.effectivePersona },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 800,
          temperature: 0.7
        })
      })

      if (!resp.ok) return null
      const json = await resp.json()
      return (json.choices && json.choices[0] && json.choices[0].message) ? json.choices[0].message.content : null
    },

    /** Delete the archived review for a date (local + server) */
    async deleteReview(date) {
      delete this.reviewData[date]
      _reviewLocalWriteAt[date] = Date.now()
      // 清本地缓存中的 archiveData（保留其他字段）
      try {
        const key = 'dp_day_data_' + date
        const raw = localStorage.getItem(key)
        if (raw) {
          const data = JSON.parse(raw)
          delete data.archiveData
          localStorage.setItem(key, JSON.stringify(data))
        }
      } catch { /* ignore */ }
      // 服务端：day-data 是覆盖式整写，先 GET 合并再 PUT，仅清 archiveData
      // （与其他写方的合并写经同一 per-date 队列串行，防互覆盖）
      await queueDayDataMerge(date, async () => {
        try {
          const resp = await api.get(`/day-data/${date}`)
          const existing = unwrap(resp.data) || {}
          await api.put(`/day-data/${date}`, { ...existing, archiveData: null })
        } catch { /* silent */ }
      })
    },

    /** Set AI persona prompt */
    setAiPersona(prompt) {      this.aiPersonaPrompt = prompt
      this._persistPrefs()
    },

    /** Set archive time */
    setArchiveTime(hour, minute) {
      this.archiveHour = hour
      this.archiveMinute = minute
      this._persistPrefs()
    },

    /** Export review as Markdown */
    exportMarkdown(date) {
      const review = this.reviewData[date]
      if (!review) return ''

      const lines = [
        '# DailyPlan 每日复盘 — ' + date,
        '',
        '## 自评',
        (review.feedback || '(无)'),
        '',
        '## 评分',
        '★'.repeat(review.rating || 0) + '☆'.repeat(5 - (review.rating || 0)),
        '',
        '## AI 评价',
        review.aiReview || '(未请求 AI 评价)',
        '',
        '## 完成统计',
        '- 任务：' + (review.stats ? review.stats.doneTasks + '/' + review.stats.totalTasks : '—'),
        '- 日课：' + (review.stats ? review.stats.routineDone + '/' + review.stats.routineTotal : '—'),
        '- 子任务：' + (review.stats ? review.stats.doneSubtasks + '/' + review.stats.totalSubtasks : '—'),
        '- XP 余额：' + (review.xpBalance || 0),
        '',
        '> 存档时间：' + (review.archivedAt || '')
      ]
      return lines.join('\n')
    },

    _getApiConfig() {
      try {
        const raw = localStorage.getItem('dp_apiConfig')
        return raw ? JSON.parse(raw) : null
      } catch { return null }
    },

    _persistLocal(date, review) {
      try {
        const key = 'dp_day_data_' + date
        let existing = {}
        try {
          const raw = localStorage.getItem(key)
          if (raw) existing = JSON.parse(raw)
        } catch { /* ignore */ }
        existing.archiveData = review
        localStorage.setItem(key, JSON.stringify(existing))
      } catch { /* ignore */ }
    },

    _persistPrefs() {
      try {
        const prefs = {
          aiPersonaPrompt: this.aiPersonaPrompt,
          archiveHour: this.archiveHour,
          archiveMinute: this.archiveMinute
        }
        localStorage.setItem('dp_prefs', JSON.stringify(
          Object.assign(
            JSON.parse(localStorage.getItem('dp_prefs') || '{}'),
            prefs
          )
        ))
      } catch { /* ignore */ }
    },

    initFromCache() {
      try {
        const prefs = JSON.parse(localStorage.getItem('dp_prefs') || '{}')
        if (prefs.aiPersonaPrompt) this.aiPersonaPrompt = prefs.aiPersonaPrompt
        if (prefs.archiveHour !== undefined) this.archiveHour = prefs.archiveHour
        if (prefs.archiveMinute !== undefined) this.archiveMinute = prefs.archiveMinute
      } catch { /* ignore */ }
      // Load today's review if exists
      try {
        const scheduleStore = useScheduleStore()
        const today = scheduleStore.today
        const key = 'dp_day_data_' + today
        const raw = localStorage.getItem(key)
        if (raw) {
          const data = JSON.parse(raw)
          if (data.archiveData) {
            this.reviewData[today] = data.archiveData
          }
        }
      } catch { /* ignore */ }
    }
  }
})
