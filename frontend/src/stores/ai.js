import { defineStore } from 'pinia'
import api from '@/api/client'
import { useScheduleStore } from '@/stores/schedule'
import { toLocalDate } from '@/utils/format'

/** Lightweight goal reader — avoids circular dependency with full goal store */
function _readGoals() {
  try {
    const raw = localStorage.getItem('dp_bigGoals')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export const useAiStore = defineStore('ai', {
  state: () => ({
    drawerOpen: false,
    messages: [],           // { role: 'user'|'assistant'|'system', content, time }
    previewBlocks: [],      // Editable task blocks from AI
    loading: false,
    summary: '',            // Compressed summary of old messages
    conversationCount: 0
  }),

  getters: {
    hasApiKey() {
      try {
        const cfg = JSON.parse(localStorage.getItem('dp_apiConfig') || '{}')
        return !!(cfg.apiKey)
      } catch { return false }
    },

    /** Smart greeting based on time + context */
    greeting() {
      const scheduleStore = useScheduleStore()
      const bigGoals = _readGoals()
      const now = new Date()
      const hour = now.getHours()

      // Time-based greeting
      let timeGreeting
      if (hour < 9) timeGreeting = '早安 🌅'
      else if (hour < 12) timeGreeting = '上午好 ☀️'
      else if (hour < 14) timeGreeting = '中午好 🍜'
      else if (hour < 18) timeGreeting = '下午好 🌤️'
      else if (hour < 22) timeGreeting = '晚上好 🌙'
      else timeGreeting = '夜深了 🌙'

      // Context-based addition
      let contextParts = []

      // Active goals
      const activeGoals = (bigGoals || []).filter(g => !g.completed)
      if (activeGoals.length > 0) {
        const nearest = activeGoals[0]
        const daysLeft = nearest.deadline ? Math.ceil((new Date(nearest.deadline) - now) / 86400000) : null
        contextParts.push('你正在推进' + activeGoals.length + '个目标')
        if (daysLeft !== null && daysLeft > 0) {
          contextParts.push('距「' + (nearest.title || '目标') + '」还有' + daysLeft + '天')
        }
      } else {
        contextParts.push('还没有活跃目标 — 要不要一起制定一个？')
      }

      // Today's plan
      const sched = scheduleStore.schedules[scheduleStore.currentDate]
      const blocks = (sched && sched.blocks) ? sched.blocks : []
      if (blocks.length > 0) {
        const done = blocks.filter(b => b.completed).length
        if (done === 0) contextParts.push('今日有' + blocks.length + '个任务等待开始')
        else if (done === blocks.length) contextParts.push('今日任务已全部完成！')
        else contextParts.push('今日已完成' + done + '/' + blocks.length + '个任务')
      } else {
        contextParts.push('今天还没有安排 — 我可以帮你生成计划')
      }

      return { timeGreeting, contextParts, hour }
    },

    /** Quick suggestion chips */
    suggestions() {
      const scheduleStore = useScheduleStore()
      const bigGoals = _readGoals()
      const chips = []

      const activeGoals = (bigGoals || []).filter(g => !g.completed)
      const sched = scheduleStore.schedules[scheduleStore.currentDate]
      const blocks = (sched && sched.blocks) ? sched.blocks : []
      const doneAll = blocks.length > 0 && blocks.every(b => b.completed)

      if (activeGoals.length > 0) {
        chips.push({ text: '帮我为今天生成每日任务', icon: '📋' })
        chips.push({ text: '查看「' + (activeGoals[0].title || '目标') + '」的进度', icon: '📊' })
      }
      if (blocks.length > 0 && !doneAll) {
        chips.push({ text: '帮我调整未完成的任务', icon: '🔄' })
      }
      if (doneAll && blocks.length > 0) {
        chips.push({ text: '回顾今天的完成情况', icon: '✅' })
      }
      chips.push({ text: '我想设定一个新目标', icon: '🎯' })
      chips.push({ text: '聊聊学习方法和建议', icon: '💡' })

      return chips.slice(0, 5)
    }
  },

  actions: {
    toggle() {
      this.drawerOpen = !this.drawerOpen
    },

    open() { this.drawerOpen = true },
    close() { this.drawerOpen = false },

    async sendMessage(text) {
      if (!text.trim()) return
      this.messages.push({ role: 'user', content: text, time: new Date().toISOString() })

      // Build context
      const context = this._buildContext()

      this.loading = true
      try {
        const reply = await this._callAi(text, context)
        if (reply) {
          this.messages.push({ role: 'assistant', content: reply, time: new Date().toISOString() })
          this.conversationCount++
          // Try to extract plan preview from reply
          this._extractPreview(reply)
          // Compress if needed
          if (this.messages.length > 20) await this._compress()
        }
      } catch (err) {
        this.messages.push({ role: 'assistant', content: '抱歉，AI 服务暂时不可用。请检查网络或 API 配置。', time: new Date().toISOString() })
      }
      this.loading = false

      // Persist
      this._saveHistory()
    },

    _buildContext() {
      const scheduleStore = useScheduleStore()
      const bigGoals = _readGoals()
      const today = scheduleStore.currentDate

      const parts = ['## 当前状态', '日期：' + today]

      // Goals
      const activeGoals = (bigGoals || []).filter(g => !g.completed)
      if (activeGoals.length > 0) {
        parts.push('活跃目标：')
        activeGoals.slice(0, 3).forEach(g => {
          const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline) - new Date(today)) / 86400000) : '无截止'
          parts.push('  - ' + (g.title || '未命名') + '（剩余' + daysLeft + '天）')
        })
      }

      // Today's plan
      const sched = scheduleStore.schedules[today]
      const blocks = (sched && sched.blocks) ? sched.blocks : []
      if (blocks.length > 0) {
        parts.push('今日计划：')
        blocks.forEach(b => {
          parts.push('  - [' + (b.completed ? '✓' : ' ') + '] ' + (b.subject || '') + ' (' + (b.duration || '?') + 'min)')
        })
      }

      // Yesterday's carry-over
      const yesterday = new Date(today + 'T00:00:00')
      yesterday.setDate(yesterday.getDate() - 1)
      const yDate = toLocalDate(yesterday)
      const ySched = scheduleStore.schedules[yDate]
      const yBlocks = (ySched && ySched.blocks) ? ySched.blocks : []
      const unfinished = yBlocks.filter(b => !b.completed)
      if (unfinished.length > 0) {
        parts.push('昨日未完成：')
        unfinished.forEach(b => {
          parts.push('  - ' + (b.subject || '') + ' (' + (b.duration || '?') + 'min)')
        })
      }

      return parts.join('\n')
    },

    /** 服务端 /generate-plan 回包处理：{ok, plan:{blocks}, usage, message} */
    _handlePlanResponse(data) {
      if (!data) return null
      if (data.ok && data.plan && Array.isArray(data.plan.blocks) && data.plan.blocks.length) {
        this.previewBlocks = data.plan.blocks.map((b, i) => ({
          duration: 30,
          subtasks: [],
          ...b,
          id: b.id || 'ai_' + Date.now() + '_' + i
        }))
        return (data.message || '已生成计划') + '\n（可在下方预览并导入任务）'
      }
      if (data.message) return data.message
      if (data.plan) return '已生成计划：\n' + JSON.stringify(data.plan, null, 2)
      return null
    },

    async _callAi(text, context) {
      const cfg = this._getApiConfig()
      if (!cfg || !cfg.apiKey) {
        // Try server fallback
        try {
          const scheduleStore = useScheduleStore()
          const { data } = await api.post('/generate-plan', {
            date: scheduleStore.currentDate,
            dayMode: scheduleStore.mode,
            feedback: text
          })
          const reply = this._handlePlanResponse(data)
          if (reply) return reply
        } catch { /* fall through to error */ }
        return null
      }

      // Direct API call
      const systemPrompt = [
        '你是 DailyPlan 的学习规划助手。你帮助用户拆解长期目标为每日计划、调整任务安排、提供学习建议。',
        '当用户请求生成任务时，请在回复末尾附上 JSON 格式的任务列表：',
        '```json',
        '[{"subject":"任务标题","duration":分钟,"subtasks":[{"text":"子任务"}],"category":"study","priority":"medium"}]',
        '```',
        '',
        context
      ].join('\n')

      const resp = await fetch(cfg.baseUrl + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.apiKey
        },
        body: JSON.stringify({
          model: cfg.model || 'deepseek-chat',
          messages: [
            { role: 'system', content: systemPrompt },
            ...this._recentMessages(10),
            { role: 'user', content: text }
          ],
          max_tokens: 2000,
          temperature: 0.7
        })
      })

      if (!resp.ok) {
        // Fallback to server
        try {
          const scheduleStore = useScheduleStore()
          const { data } = await api.post('/generate-plan', {
            date: scheduleStore.currentDate,
            dayMode: scheduleStore.mode,
            feedback: text
          })
          const reply = this._handlePlanResponse(data)
          if (reply) return reply
        } catch { /* fall through */ }
        return null
      }

      const json = await resp.json()
      return (json.choices && json.choices[0] && json.choices[0].message) ? json.choices[0].message.content : null
    },

    _recentMessages(n) {
      const recent = this.messages.slice(-n * 2)
      return recent.map(m => ({ role: m.role, content: m.content }))
    },

    _extractPreview(text) {
      // Try to find JSON block in AI reply
      const match = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      if (match) {
        try {
          const parsed = JSON.parse(match[1])
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].subject) {
            this.previewBlocks = parsed
          }
        } catch { /* not valid JSON */ }
      }
    },

    async _compress() {
      // Use AI to compress old messages
      const oldMessages = this.messages.slice(0, -10)
      if (oldMessages.length < 5) return

      const cfg = this._getApiConfig()
      if (!cfg || !cfg.apiKey) {
        this.summary = '(对话已截断 — 请配置 API Key 以使用自动摘要)'
        this.messages = this.messages.slice(-10)
        return
      }

      try {
        const resp = await fetch(cfg.baseUrl + '/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + cfg.apiKey
          },
          body: JSON.stringify({
            model: cfg.model || 'deepseek-chat',
            messages: [
              { role: 'system', content: '请将以下对话压缩为一段简短摘要，保留关键信息（目标、任务、决策）。' },
              ...oldMessages.map(m => ({ role: m.role, content: m.content })),
              { role: 'user', content: '请生成摘要。' }
            ],
            max_tokens: 300,
            temperature: 0.3
          })
        })

        if (resp.ok) {
          const json = await resp.json()
          const compressed = (json.choices && json.choices[0]) ? json.choices[0].message.content : null
          if (compressed) this.summary = compressed
        }
      } catch { /* silent */ }

      this.messages = this.messages.slice(-10)
    },

    adoptPreview() {
      if (!this.previewBlocks.length) return 0
      const scheduleStore = useScheduleStore()
      return scheduleStore.importPlan(scheduleStore.currentDate, this.previewBlocks)
    },

    clearPreviewBlocks() { this.previewBlocks = [] },

    clearChat() {
      this.messages = []
      this.summary = ''
      this.conversationCount = 0
    },

    /** Check for yesterday's unfinished tasks */
    getCarryOverTasks() {
      const scheduleStore = useScheduleStore()
      const yesterday = new Date(scheduleStore.currentDate + 'T00:00:00')
      yesterday.setDate(yesterday.getDate() - 1)
      const yDate = toLocalDate(yesterday)
      const ySched = scheduleStore.schedules[yDate]
      if (!ySched || !ySched.blocks) return []
      return ySched.blocks.filter(b => !b.completed).map(b => ({
        id: b.id,
        subject: b.subject || '',
        duration: b.duration || 30,
        category: b.category || 'study',
        priority: b.priority || 'medium'
      }))
    },

    /** Carry-over: move to today with optional workload increase */
    async carryOver(tasks, increaseFactor) {
      const scheduleStore = useScheduleStore()
      const adjusted = tasks.map(t => ({
        ...t,
        id: 'co_' + t.id + '_' + Date.now(),
        duration: Math.round((t.duration || 30) * (increaseFactor || 1.0)),
        subtasks: t.subtasks || []
      }))
      return scheduleStore.importPlan(scheduleStore.currentDate, adjusted)
    },

    _getApiConfig() {
      try {
        const raw = localStorage.getItem('dp_apiConfig')
        return raw ? JSON.parse(raw) : null
      } catch { return null }
    },

    _saveHistory() {
      const scheduleStore = useScheduleStore()
      try {
        localStorage.setItem('dp_aiChat_' + scheduleStore.currentDate, JSON.stringify(this.messages))
      } catch { /* ignore */ }
      // Server persistence
      api.put('/chat-history/' + scheduleStore.currentDate, {
        messages: this.messages,
        summary: this.summary
      }).catch(() => {})
    },

    initFromCache() {
      const scheduleStore = useScheduleStore()
      try {
        const raw = localStorage.getItem('dp_aiChat_' + scheduleStore.currentDate)
        if (raw) this.messages = JSON.parse(raw)
      } catch { /* ignore */ }
    }
  }
})
