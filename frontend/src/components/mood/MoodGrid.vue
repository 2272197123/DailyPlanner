<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useMoodStore } from '@/stores/mood'
import { useToastStore } from '@/stores/toast'
import { toLocalDate } from '@/utils/format'
import { useAnime } from '@/composables/useAnime'
import MoodCell from './MoodCell.vue'
import MoodPicker from './MoodPicker.vue'

const props = defineProps({
  year: { type: Number, default: () => new Date().getFullYear() },
  cellSize: { type: Number, default: 14 },
  gap: { type: Number, default: 3 }
})

const moodStore = useMoodStore()
const toastStore = useToastStore()
const { staggerEnter, burst } = useAnime()

const gridRef = ref(null)
const pickerOpen = ref(false)
const pickerDate = ref('')

/* ── 已填写格子的小菜单（修改 / 清除记录）── */
const cellMenu = ref(null) // { date, x, y }

const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const yearDates = computed(() => {
  const dates = []
  const start = new Date(props.year, 0, 1)
  const end = new Date(props.year, 11, 31)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(toLocalDate(new Date(d)))
  }
  return dates
})

// Group by week columns for GitHub-style grid
const weeks = computed(() => {
  const all = yearDates.value
  const firstDate = new Date(all[0])
  const dayOfWeek = firstDate.getDay() || 7 // 1-7, Monday=1
  const padded = Array(dayOfWeek - 1).fill(null).concat(all)

  const cols = []
  for (let i = 0; i < padded.length; i += 7) {
    cols.push(padded.slice(i, i + 7))
  }
  // Ensure last column has 7 days
  const last = cols[cols.length - 1]
  if (last && last.length < 7) {
    while (last.length < 7) last.push(null)
  }
  return cols
})

function getMood(date) {
  return date ? moodStore.getEntry(date) : null
}

function openPicker(date, event) {
  pickerDate.value = date
  pickerOpen.value = true

  if (event && event.target) {
    const rect = event.target.getBoundingClientRect()
    burst(rect.left + rect.width / 2, rect.top + rect.height / 2, {
      count: 10,
      colors: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6']
    })
  }
}

function onCellClick(date, event) {
  if (!date) return

  // 已填写 → 弹出小菜单（修改 / 清除记录）
  if (getMood(date)) {
    const rect = event.target.getBoundingClientRect()
    cellMenu.value = {
      date,
      x: Math.min(rect.left, window.innerWidth - 160),
      y: rect.bottom + 6
    }
    return
  }

  // 过去日期的空白格子 → 防止误点，需确认补记（当天不确认）
  if (date < moodStore.today) {
    const d = new Date(date + 'T00:00:00')
    if (!window.confirm(`要为 ${d.getMonth() + 1}月${d.getDate()}日 补记心情吗？`)) return
  }

  openPicker(date, event)
}

function onMenuEdit() {
  if (!cellMenu.value) return
  pickerDate.value = cellMenu.value.date
  pickerOpen.value = true
  cellMenu.value = null
}

async function onMenuClear() {
  if (!cellMenu.value) return
  await moodStore.deleteMood(cellMenu.value.date)
  toastStore.ok('已清除该日心情记录')
  cellMenu.value = null
}

async function onSaveMood(payload) {
  await moodStore.saveMood(pickerDate.value, payload)
  pickerOpen.value = false
  await nextTick()
  if (gridRef.value) {
    staggerEnter('.mood-year-cell', gridRef.value, 'pop')
  }
}

function onDeleteMood() {
  moodStore.deleteMood(pickerDate.value)
  pickerOpen.value = false
}

watch(() => props.year, async (newYear) => {
  await moodStore.fetchMoods(newYear)
  await nextTick()
  if (gridRef.value) {
    staggerEnter('.mood-year-cell', gridRef.value)
  }
}, { immediate: true })
</script>

<template>
  <div class="mood-grid" ref="gridRef">
    <div class="mood-months" :style="{ marginLeft: `${cellSize + gap + 24}px` }">
      <span v-for="month in months" :key="month" class="month-label">{{ month }}</span>
    </div>

    <div class="mood-grid-body">
      <div class="mood-weekdays" :style="{ width: `${cellSize + gap + 16}px` }">
        <span v-for="day in weekDays" :key="day" class="weekday-label">{{ day }}</span>
      </div>

      <div class="mood-weeks" :style="{ gap: `${gap}px` }">
        <div
          v-for="(week, wIndex) in weeks"
          :key="wIndex"
          class="mood-week"
          :style="{ gap: `${gap}px` }"
        >
          <MoodCell
            v-for="(date, dIndex) in week"
            :key="date || `empty-${wIndex}-${dIndex}`"
            :date="date"
            :mood="getMood(date)"
            :size="cellSize"
            :gap="gap"
            class="mood-year-cell"
            @click="onCellClick"
          />
        </div>
      </div>
    </div>

    <MoodPicker
      v-if="pickerOpen"
      :date="pickerDate"
      :mood="getMood(pickerDate)"
      @close="pickerOpen = false"
      @save="onSaveMood"
      @delete="onDeleteMood"
    />

    <!-- 已填写格子的操作小菜单 -->
    <Teleport to="body">
      <div v-if="cellMenu" class="mood-menu-overlay" @click.self="cellMenu = null">
        <div class="mood-menu" :style="{ left: `${cellMenu.x}px`, top: `${cellMenu.y}px` }">
          <button class="mood-menu-item" @click="onMenuEdit">✏️ 修改</button>
          <button class="mood-menu-item danger" @click="onMenuClear">🗑 清除记录</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.mood-grid {
  width: 100%;
  overflow-x: auto;
  padding-bottom: var(--space-2);
}

.mood-months {
  display: flex;
  gap: 12px;
  margin-bottom: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.month-label {
  width: 70px;
  text-align: left;
  flex-shrink: 0;
}

.mood-grid-body {
  display: flex;
}

.mood-weekdays {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-right: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.weekday-label {
  height: 14px;
  line-height: 14px;
}

.mood-weeks {
  display: flex;
  min-width: max-content;
}

.mood-week {
  display: flex;
  flex-direction: column;
}

/* ── 格子操作小菜单 ── */
.mood-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-dropdown);
}

.mood-menu {
  position: fixed;
  min-width: 140px;
  padding: var(--space-1);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.mood-menu-item {
  display: block;
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  text-align: left;
  color: var(--text-primary);
  transition: background var(--duration-fast) var(--ease-out);
}

.mood-menu-item:hover {
  background: var(--bg-muted);
}

.mood-menu-item.danger {
  color: var(--danger);
}

.mood-menu-item.danger:hover {
  background: var(--danger-bg);
}
</style>
