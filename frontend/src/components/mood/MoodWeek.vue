<script setup>
/* ═══════════════════════════════════════
   MoodWeek.vue — 近 7 天视图
   7 个迷你许愿瓶横排：每天混合色液层 + 吐槽数；
   点击切换到「当日」视图查看/补记该日。
   ═══════════════════════════════════════ */
import { computed } from 'vue'
import { useMoodStore } from '@/stores/mood'
import { toLocalDate } from '@/utils/format'
import WishingBottle from './WishingBottle.vue'

const emit = defineEmits(['select'])
const moodStore = useMoodStore()

const WEEKDAYS = '日一二三四五六'

const days = computed(() => {
  const list = []
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const date = toLocalDate(d)
    list.push({
      date,
      dayLabel: i === 0 ? '今天' : `周${WEEKDAYS[d.getDay()]}`,
      dateLabel: `${d.getMonth() + 1}/${d.getDate()}`,
      vents: moodStore.getVents(date),
      hasEntry: !!moodStore.getEntry(date)
    })
  }
  return list
})

function pick(date) {
  emit('select', date)
}
</script>

<template>
  <div class="mood-week-strip">
    <button
      v-for="d in days"
      :key="d.date"
      class="mw-day"
      :class="{ empty: !d.hasEntry }"
      @click="pick(d.date)"
    >
      <span class="mw-day-label">{{ d.dayLabel }}</span>
      <WishingBottle :vents="d.vents" mini />
      <span class="mw-date">{{ d.dateLabel }}</span>
      <span class="mw-count" :class="{ dim: !d.vents.length }">
        {{ d.vents.length ? `${d.vents.length} 条` : '—' }}
      </span>
    </button>
  </div>
</template>

<style scoped>
.mood-week-strip {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: var(--space-2);
}

.mw-day {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-1);
  border-radius: var(--radius-md);
  border: 1px solid transparent;
  background: var(--bg-elevated);
  transition: transform var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
}

.mw-day:hover {
  transform: translateY(-3px);
  border-color: var(--accent-muted);
}

.mw-day.empty {
  opacity: 0.55;
}

.mw-day-label {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-primary);
}

.mw-date {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.mw-count {
  font-size: var(--text-xs);
  color: var(--accent);
}

.mw-count.dim {
  color: var(--text-muted);
}

@media (max-width: 768px) {
  .mood-week-strip {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
