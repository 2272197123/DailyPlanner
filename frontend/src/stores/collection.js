/* ═══════════════════════════════════════
   collection.js — 卡牌收集（掉卡 / 签到 / 成就，服务端为准）

   - 抽卡随机与面值都在服务端；前端只负责展示与揭示动效
   - drawFromTask 幂等键 = `{date}:{blockId}`：同一任务同一天只掉 1 张，
     取消完成不回收、重复完成不重复掉（与 XP 退还链路完全独立）
   - 新达成的成就随 draw / checkin 响应返回，由调用方弹祝贺
   ═══════════════════════════════════════ */

import { defineStore } from 'pinia'
import api, { unwrap } from '@/api/client'

let _inFlight = null // fetchAll 并发去重

export const useCollectionStore = defineStore('collection', {
  state: () => ({
    cards: [],        // 已获得的卡（含 faceValue/source/obtainedAt）
    defs: [],         // 完整卡牌定义库（图鉴占位用）
    achievements: [], // 成就墙（含 progress/achieved）
    checkin: { todayChecked: false, streak: 0, totalDays: 0, recentDates: [] },
    revealQueue: [], // 待揭示队列 [{card, achievements}]，由 CardReveal（App.vue 全局挂载）消费
    loaded: false,
    loading: false
  }),

  getters: {
    /** cardId → { count, faceValues[], firstObtainedAt } 聚合（图鉴数量角标用） */
    ownedMap(state) {
      const map = {}
      for (const c of state.cards) {
        const e = map[c.id] || (map[c.id] = { count: 0, faceValues: [], obtainedAt: c.obtainedAt })
        e.count++
        e.faceValues.push(c.faceValue)
      }
      return map
    },
    totalOwned(state) {
      return state.cards.length
    },
    distinctOwned(state) {
      return new Set(state.cards.map(c => c.id)).size
    },
    /** series → defs 分组（保持 defs 原始顺序） */
    seriesGroups(state) {
      const groups = {}
      for (const d of state.defs) {
        (groups[d.series] || (groups[d.series] = { series: d.series, seriesName: d.seriesName, cards: [] }))
          .cards.push(d)
      }
      return Object.values(groups)
    },
    achievedCount(state) {
      return state.achievements.filter(a => a.achieved).length
    }
  },

  actions: {
    /** 收集页/签到状态一次拉齐（会话内缓存，force 强制刷新） */
    async fetchAll({ force = false } = {}) {
      if (this.loaded && !force) return
      if (_inFlight) return _inFlight
      this.loading = true
      _inFlight = Promise.all([
        api.get('/cards'),
        api.get('/achievements'),
        api.get('/checkin/status')
      ]).then(([cardsResp, achResp, ciResp]) => {
        const d = unwrap(cardsResp.data) || {}
        this.cards = d.cards || []
        this.defs = d.defs || []
        this.achievements = unwrap(achResp.data) || []
        this.checkin = unwrap(ciResp.data) || this.checkin
        this.loaded = true
      }).catch(() => { /* 保持旧缓存 */ })
        .finally(() => {
          this.loading = false
          _inFlight = null
        })
      return _inFlight
    },

    /** 完成任务掉卡：成功返回 {card, duplicate, newAchievements}；失败静默返回 null */
    async drawFromTask(date, blockId) {
      try {
        const { data } = await api.post('/cards/draw', {
          source: 'task',
          sourceId: `${date}:${blockId}`
        })
        if (!data?.ok) return null
        if (!data.duplicate && data.card) {
          this.cards.push(data.card)
        }
        if (Array.isArray(data.newAchievements)) this._applyAchievements(data.newAchievements)
        return data
      } catch {
        return null
      }
    },

    /** 每日签到（幂等）。返回响应体；失败返回 null */
    async checkinToday() {
      try {
        const { data } = await api.post('/checkin')
        if (!data?.ok) return null
        if (!data.already && data.card) {
          this.cards.push(data.card)
        }
        this.checkin.todayChecked = true
        this.checkin.streak = data.streak ?? this.checkin.streak
        if (!data.already) {
          this.checkin.totalDays++
          const today = new Date()
          const ds = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') +
            '-' + String(today.getDate()).padStart(2, '0')
          this.checkin.recentDates = [ds, ...(this.checkin.recentDates || [])].slice(0, 7)
        }
        if (Array.isArray(data.newAchievements)) this._applyAchievements(data.newAchievements)
        return data
      } catch {
        return null
      }
    },

    /** 把新达成的成就合并进本地成就墙（避免整墙重拉） */
    _applyAchievements(newly) {
      for (const n of newly) {
        const idx = this.achievements.findIndex(a => a.id === n.id)
        if (idx !== -1) {
          this.achievements[idx] = {
            ...this.achievements[idx],
            achieved: true,
            achievedAt: n.achievedAt || this.achievements[idx].achievedAt,
            progress: this.achievements[idx].target
          }
        }
      }
    },

    /** 推入揭示队列（CardReveal 全局消费；card 可为 null 仅播成就） */
    enqueueReveal(item) {
      if (!item || (!item.card && !(item.achievements || []).length)) return
      this.revealQueue.push({ card: item.card || null, achievements: item.achievements || [] })
    }
  }
})
