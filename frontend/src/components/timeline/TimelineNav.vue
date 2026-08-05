<script setup>
import { computed } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { fmtDate } from '@/utils/format'

const scheduleStore = useScheduleStore()

const displayDate = computed(() => fmtDate(scheduleStore.currentDate))

function prevDay() {
  const d = new Date(scheduleStore.currentDate + 'T00:00:00')
  d.setDate(d.getDate() - 1)
  scheduleStore.setDate(d.toISOString().slice(0, 10))
}

function nextDay() {
  const d = new Date(scheduleStore.currentDate + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  scheduleStore.setDate(d.toISOString().slice(0, 10))
}

function goToday() {
  const today = new Date().toISOString().slice(0, 10)
  scheduleStore.setDate(today)
}
</script>

<template>
  <nav class="timeline-nav">
    <button class="nav-arrow" @click="prevDay" title="前一天">←</button>
    <h2 class="nav-date" @click="goToday">{{ displayDate }} 📍</h2>
    <button class="nav-arrow" @click="nextDay" title="后一天">→</button>
    <button class="nav-today" @click="goToday">今天</button>
  </nav>
</template>

<style scoped>
.timeline-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-4) 0;
}

.nav-arrow {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: var(--text-lg);
  color: var(--text-secondary);
  transition: background var(--duration-fast) var(--ease-out);
}

.nav-arrow:hover {
  background: var(--bg-muted);
  color: var(--accent);
}

.nav-date {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.nav-date:hover {
  background: var(--bg-muted);
}

.nav-today {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  color: var(--accent);
  border: 1px solid var(--accent);
  border-radius: var(--radius-full);
  transition: background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out);
}

.nav-today:hover {
  background: var(--accent);
  color: var(--text-inverse);
}
</style>
