<script setup>
import { computed } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useCurrencyStore } from '@/stores/currency'
import { fmtDate } from '@/utils/format'

const scheduleStore = useScheduleStore()
const currencyStore = useCurrencyStore()

const displayDate = computed(() => fmtDate(scheduleStore.currentDate))
</script>

<template>
  <header class="app-header">
    <div class="header-left">
      <span class="header-logo">∿</span>
      <span class="header-title">DailyPlan</span>
    </div>

    <div class="header-center">
      <span class="header-date">{{ displayDate }}</span>
    </div>

    <div class="header-right">
      <div class="balance-display" title="XP 余额">
        <span class="balance-level">Lv.{{ currencyStore.level }}</span>
        <span class="balance-xp">{{ currencyStore.balance }} XP</span>
      </div>

      <button class="header-btn" title="AI 助手 (Shift+Space)">
        🤖
      </button>

      <button class="header-btn header-btn-primary" title="登录">
        👤 登录
      </button>
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-3) var(--space-6);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  backdrop-filter: blur(12px);
  background: rgba(255, 255, 255, 0.85);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.header-logo {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  color: var(--accent);
}

.header-title {
  font-family: var(--font-heading);
  font-weight: 600;
  font-size: var(--text-base);
  color: var(--text-primary);
}

.header-center {
  display: flex;
  align-items: center;
}

.header-date {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  background: var(--bg-muted);
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.balance-display {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: var(--accent-muted);
  border-radius: var(--radius-full);
  cursor: pointer;
  font-family: var(--font-data);
  font-size: var(--text-xs);
  transition: background var(--duration-fast) var(--ease-out);
}

.balance-display:hover {
  background: rgba(30, 32, 48, 0.1);
}

.balance-level {
  color: var(--accent);
  font-weight: 600;
}

.balance-xp {
  color: var(--text-secondary);
}

.header-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: var(--text-lg);
  transition: background var(--duration-fast) var(--ease-out);
}

.header-btn:hover {
  background: var(--bg-muted);
}

.header-btn-primary {
  width: auto;
  padding: 0 var(--space-3);
  font-size: var(--text-sm);
  gap: var(--space-1);
}
</style>
