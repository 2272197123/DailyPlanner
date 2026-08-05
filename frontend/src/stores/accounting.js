import { defineStore } from 'pinia'
import api from '@/api/client'

export const useAccountingStore = defineStore('accounting', {
  state: () => ({
    entries: [],          // [{ id, type, category, amount, date, note }]
    categories: { income: [], expense: [] },
    period: 'month',      // week | month | quarter | year | custom
    customRange: { from: '', to: '' },
    loading: false
  }),

  getters: {
    filteredEntries(state) {
      const { from, to } = this.periodRange
      return (state.entries || []).filter(e => {
        if (!e.date) return true
        return e.date >= from && e.date <= to
      })
    },

    periodRange() {
      const now = new Date()
      const today = now.toISOString().slice(0, 10)
      let from = today

      switch (this.period) {
        case 'week': {
          const d = new Date(now)
          d.setDate(d.getDate() - d.getDay())
          from = d.toISOString().slice(0, 10)
          break
        }
        case 'month': from = today.slice(0, 7) + '-01'; break
        case 'quarter': {
          const q = Math.floor(now.getMonth() / 3) * 3
          from = now.getFullYear() + '-' + String(q + 1).padStart(2, '0') + '-01'
          break
        }
        case 'year': from = now.getFullYear() + '-01-01'; break
        case 'custom':
          from = this.customRange.from || today
          return { from, to: this.customRange.to || today }
      }
      return { from, to: today }
    },

    summary() {
      const entries = this.filteredEntries
      const income = entries.filter(e => e.type === 'income').reduce((s, e) => s + (e.amount || 0), 0)
      const expense = entries.filter(e => e.type === 'expense').reduce((s, e) => s + (e.amount || 0), 0)
      return { income, expense, balance: income - expense, count: entries.length }
    },

    expenseByCategory() {
      const map = {}
      this.filteredEntries
        .filter(e => e.type === 'expense')
        .forEach(e => {
          const cat = e.category || '其他'
          map[cat] = (map[cat] || 0) + (e.amount || 0)
        })
      return Object.entries(map).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
    },

    trendByDay() {
      const map = {}
      this.filteredEntries.forEach(e => {
        if (!e.date) return
        if (!map[e.date]) map[e.date] = { income: 0, expense: 0 }
        if (e.type === 'income') map[e.date].income += e.amount || 0
        else map[e.date].expense += e.amount || 0
      })
      return Object.entries(map)
        .map(([date, val]) => ({ date, ...val }))
        .sort((a, b) => a.date.localeCompare(b.date))
    }
  },

  actions: {
    async fetchEntries() {
      this.loading = true
      try {
        const { data } = await api.get('/accounting')
        if (Array.isArray(data)) this.entries = data
        this.loading = false
      } catch {
        try {
          const raw = localStorage.getItem('dp_acc_entries')
          if (raw) this.entries = JSON.parse(raw)
        } catch { /* ignore */ }
        this.loading = false
      }
    },

    async addEntry(entry) {
      const e = { id: 'acc_' + Date.now(), ...entry, createdAt: new Date().toISOString() }
      this.entries.unshift(e)
      await this._persist()
      return e
    },

    async deleteEntry(id) {
      this.entries = this.entries.filter(e => e.id !== id)
      await this._persist()
    },

    setPeriod(p) { this.period = p },

    setCustomRange(from, to) {
      this.customRange = { from, to }
    },

    saveCategories() {
      try {
        localStorage.setItem('dp_acc_categories', JSON.stringify(this.categories))
      } catch { /* ignore */ }
    },

    async _persist() {
      try {
        localStorage.setItem('dp_acc_entries', JSON.stringify(this.entries))
        await api.put('/accounting', this.entries)
      } catch { /* silent */ }
    },

    initFromCache() {
      try {
        const raw = localStorage.getItem('dp_acc_entries')
        if (raw) this.entries = JSON.parse(raw)
      } catch { /* ignore */ }
      try {
        const cats = localStorage.getItem('dp_acc_categories')
        if (cats) this.categories = JSON.parse(cats)
      } catch { /* ignore */ }
      if (!this.categories.income.length && !this.categories.expense.length) {
        this.categories = {
          income: ['工资', '兼职', '理财', '红包', '其他收入'],
          expense: ['餐饮', '交通', '购物', '住房', '娱乐', '学习', '医疗', '其他']
        }
      }
    }
  }
})
