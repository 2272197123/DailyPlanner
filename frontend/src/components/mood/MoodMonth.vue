<script setup>
/* ═══════════════════════════════════════
   MoodMonth.vue — 近一月视图
   当月月历网格：cell = 当日混合色块（多条吐槽 → 多色渐变）；
   点过去/今天的格子切到「当日」补记，未来日期禁用。
   ═══════════════════════════════════════ */
import { computed } from 'vue'
import { useMoodStore } from '@/stores/mood'
import { toLocalDate } from '@/utils/format'
import { withAlpha } from '@/utils/color'

const emit = defineEmits(['select'])
const moodStore = useMoodStore()

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

const monthLabel = computed(() => {
  const d = new Date()
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月`
})

/* 周一开头的月历格子（含前后月占位 null） */
const cells = computed(() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const first = new Date(y, m, 1)
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const lead = (first.getDay() + 6) % 7  // 周一=0
  const list = Array(lead).fill(null)
  for (let d = 1; d <= daysInMonth; d++) {
    list.push(toLocalDate(new Date(y, m, d)))
  }
  return list
})

const todayStr = computed(() => moodStore.today)

function isFuture(date) {
  return date && date > todayStr.value
}

/* 混合色块；多条吐槽 → 135deg 多色渐变（hex-alpha 透明度） */
function cellStyle(date) {
  if (!date) return {}
  const color = moodStore.dayColor(date)
  if (!color) return {}
  const vents = moodStore.getVents(date)
  if (vents.length > 1) {
    const stops = vents.map(v => withAlpha(v.color, 0.8)).join(', ')
    return { background: `linear-gradient(135deg, ${stops})` }
  }
  return { backgroundColor: withAlpha(color, 0.8) }
}

function pick(date) {
  if (!date || isFuture(date)) return
  emit('select', date)
}
</script>

<template>
  <div class="mood-month">
    <div class="mm-head">
      <span class="mm-title">{{ monthLabel }}</span>
      <span class="mm-hint">点格子可补记当天吐槽</span>
    </div>
    <div class="mm-grid">
      <span v-for="w in WEEKDAYS" :key="w" class="mm-weekday">{{ w }}</span>
      <button
        v-for="(date, i) in cells"
        :key="date || `pad-${i}`"
        class="mm-cell"
        :class="{ pad: !date, today: date === todayStr, future: isFuture(date) }"
        :style="cellStyle(date)"
        :disabled="!date || isFuture(date)"
        :title="date || ''"
        @click="pick(date)"
      >
        <span v-if="date" class="mm-num">{{ Number(date.slice(-2)) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.mm-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
  margin-bottom: var(--space-3);
}

.mm-title {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  color: var(--text-primary);
}

.mm-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.mm-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.mm-weekday {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding-bottom: var(--space-1);
}

.mm-cell {
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  background: var(--bg-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}

.mm-cell:not(.pad):not(.future):hover {
  transform: scale(1.08);
  box-shadow: 0 0 0 2px var(--accent-muted);
}

.mm-cell.pad {
  background: transparent;
}

.mm-cell.future {
  opacity: 0.35;
  cursor: not-allowed;
}

.mm-cell.today {
  box-shadow: 0 0 0 2px var(--accent);
}

.mm-num {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-primary);
  text-shadow: 0 0 6px var(--bg-elevated);
}
</style>
