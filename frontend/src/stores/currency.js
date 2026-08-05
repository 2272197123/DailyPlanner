import { defineStore } from 'pinia'
import api from '@/api/client'
import { getLevel, xpToNextLevel } from '@/utils/format'
import { XP_LVL_BASE, XP_LVL_MULT } from '@/utils/constants'

export const useCurrencyStore = defineStore('currency', {
  state: () => ({
    balance: 0,
    transactions: [],
    loading: false
  }),

  getters: {
    level(state) {
      return getLevel(state.balance)
    },
    xpForNext(state) {
      return xpToNextLevel(state.balance)
    },
    levelProgress(state) {
      const total = this.xpForNext
      if (total <= 0) return 100
      // Calculate XP within current level
      let xp = state.balance
      let lvl = 1
      let threshold = XP_LVL_BASE
      while (xp >= threshold) {
        xp -= threshold
        lvl++
        threshold = Math.round(threshold * XP_LVL_MULT)
      }
      return Math.round((xp / threshold) * 100)
    }
  },

  actions: {
    /** Sole write point for XP balance */
    addXP(amount, reason) {
      this.balance += amount
      this._persist()
      this.recordTransaction('earn', amount, reason)
    },

    setBalance(value) {
      this.balance = Math.max(0, value)
      this._persist()
    },

    _persist() {
      localStorage.setItem('dp_balance', String(this.balance))
      api.setBalance(this.balance).catch(() => {})
    },

    recordTransaction(type, amount, reason, refId) {
      const txn = {
        id: 'txn_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        type,
        amount,
        reason,
        refId: refId || null,
        timestamp: new Date().toISOString()
      }
      this.transactions.unshift(txn)
      localStorage.setItem('dp_ledger', JSON.stringify(this.transactions))
    },

    async fetchLedger() {
      this.loading = true
      try {
        const { data } = await api.get('/ledger')
        this.transactions = data
        this.loading = false
        return data
      } catch {
        // Fall back to LS
        const raw = localStorage.getItem('dp_ledger')
        if (raw) this.transactions = JSON.parse(raw)
        this.loading = false
        return this.transactions
      }
    },

    initFromCache() {
      const raw = localStorage.getItem('dp_balance')
      if (raw) this.balance = Number(raw) || 0
      const ledger = localStorage.getItem('dp_ledger')
      if (ledger) {
        try { this.transactions = JSON.parse(ledger) } catch { this.transactions = [] }
      }
    }
  }
})
