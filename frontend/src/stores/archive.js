import { defineStore } from 'pinia'
import api from '@/api/client'
import { useScheduleStore } from '@/stores/schedule'
import { useRoutineStore } from '@/stores/routines'
import { useCurrencyStore } from '@/stores/currency'

export const useArchiveStore = defineStore('archive', {
  state: () => ({
    reviewData: {},           // { [date]: { feedback, rating, aiReview, archivedAt } }
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

      // Persist: localStorage + API
      this._persistLocal(date, review)
      try {
        await api.put(`/day-data/${date}`, { archiveData: review })
      } catch { /* silent */ }

      return review
    },

    async _requestAiReview(date, { feedback, rating, stats, blocks, routines, routineProgress }) {
      const apiConfig = this._getApiConfig()
      if (!apiConfig || !apiConfig.apiKey) return null

      const doneBlocks = (blocks || []).filter(b => b.completed)
      const undoneBlocks = (blocks || []).filter(b => !b.completed)
      const doneRoutines = (routines || []).filter(r => routineProgress && routineProgress[r.id])
      const undoneRoutines = (routines || []).filter(r => !routineProgress || !routineProgress[r.id])

      const userPrompt = [
        `日期：${date}`,
        `用户自评：${feedback || '(无)'}`,
        `评分：${'★'.repeat(rating || 0)}${'☆'.repeat(5 - (rating || 0))}`,
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
      try {
        const resp = await api.get(`/day-data/${date}`)
        const existing = (resp.data && resp.data.data) || {}
        await api.put(`/day-data/${date}`, { ...existing, archiveData: null })
      } catch { /* silent */ }
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
