import { defineStore } from 'pinia'

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: []
  }),

  actions: {
    show(message, type = '', duration = 3000) {
      const id = 'ts_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5)
      this.toasts.push({ id, message, type })
      setTimeout(() => this.dismiss(id), duration)
      return id
    },

    dismiss(id) {
      const idx = this.toasts.findIndex(t => t.id === id)
      if (idx !== -1) this.toasts.splice(idx, 1)
    },

    ok(msg) { return this.show(msg, 'ok') },
    err(msg) { return this.show(msg, 'err', 5000) },
    warn(msg) { return this.show(msg, 'warn', 4000) }
  }
})
