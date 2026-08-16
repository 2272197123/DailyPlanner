/* ═══════════════════════════════════════
   dishes.js — 恰饭菜品库（全站共享，服务端为准）
   列表会话内只拉一次（菜品无防作弊需求，随机抽取在前端做）；
   增删改后原地更新内存态，同时刷新 loaded 缓存。
   ═══════════════════════════════════════ */

import { defineStore } from 'pinia'
import api, { unwrap } from '@/api/client'

let _inFlight = null // 并发去重

export const useDishStore = defineStore('dishes', {
  state: () => ({
    dishes: [],
    loaded: false,
    loading: false
  }),

  actions: {
    async fetchDishes({ force = false } = {}) {
      if (this.loaded && !force) return this.dishes
      if (_inFlight) return _inFlight
      this.loading = true
      _inFlight = api.get('/dishes')
        .then(({ data }) => {
          this.dishes = unwrap(data) || []
          this.loaded = true
          return this.dishes
        })
        .catch(() => this.dishes)
        .finally(() => {
          this.loading = false
          _inFlight = null
        })
      return _inFlight
    },

    async createDish(dish) {
      const { data } = await api.post('/dishes', dish)
      const created = unwrap(data)
      if (created) this.dishes.push(created)
      return created
    },

    async updateDish(id, dish) {
      const { data } = await api.put(`/dishes/${id}`, dish)
      /* 用服务端清洗后的行回填，避免本地态与服务端（image 白名单/价格钳制）不一致 */
      const updated = unwrap(data)
      const idx = this.dishes.findIndex(d => d.id === id)
      if (idx !== -1) this.dishes[idx] = updated || { ...this.dishes[idx], ...dish, id }
    },

    async deleteDish(id) {
      await api.delete(`/dishes/${id}`)
      this.dishes = this.dishes.filter(d => d.id !== id)
    }
  }
})
