<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { useMoodStore } from '@/stores/mood'
import { useAnime } from '@/composables/useAnime'
import MoodCell from './MoodCell.vue'
import MoodPicker from './MoodPicker.vue'

const props = defineProps({
  year: { type: Number, default: () => new Date().getFullYear() },
  cellSize: { type: Number, default: 14 },
  gap: { type: Number, default: 3 }
})

const moodStore = useMoodStore()
const { staggerEnter, burst } = useAnime()

const gridRef = ref(null)
const pickerOpen = ref(false)
const pickerDate = ref('')

const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const weekDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

const yearDates = computed(() => {
  const dates = []
  const start = new Date(props.year, 0, 1)
  const end = new Date(props.year, 11, 31)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(new Date(d).toISOString().split('T')[0])
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

function onCellClick(date, event) {
  if (!date) return
  pickerDate.value = date
  pickerOpen.value = true

  const rect = event.target.getBoundingClientRect()
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, {
    count: 10,
    colors: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6']
  })
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
</style>
