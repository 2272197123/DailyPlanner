<script setup>
import { computed } from 'vue'
import { useMoodStore } from '@/stores/mood'

const props = defineProps({
  date: { type: String, required: true },
  plan: { type: Object, default: null }
})

const emit = defineEmits(['click'])

const moodStore = useMoodStore()

const dateObj = computed(() => new Date(props.date + 'T00:00:00'))
const isToday = computed(() => props.date === new Date().toISOString().split('T')[0])

const dayLabel = computed(() => {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[dateObj.value.getDay()]
})

const monthDay = computed(() => {
  return `${dateObj.value.getMonth() + 1}/${dateObj.value.getDate()}`
})

const blocks = computed(() => props.plan?.blocks || [])
const doneCount = computed(() => blocks.value.filter(b => b.completed || b.done).length)
const totalCount = computed(() => blocks.value.length)
const progress = computed(() => totalCount.value ? (doneCount.value / totalCount.value) * 100 : 0)

const mood = computed(() => moodStore.getEntry(props.date))

const modeText = computed(() => {
  const mode = props.plan?.dayMode || 'full'
  const map = { full: '完整', minimum: '最低', recovery: '恢复' }
  return map[mode] || mode
})

function onClick() {
  emit('click', props.date)
}
</script>

<template>
  <div
    class="plan-card"
    :class="{ today: isToday, empty: !plan }"
    @click="onClick"
  >
    <div class="plan-card-header">
      <div class="plan-date">
        <span class="day-label">{{ dayLabel }}</span>
        <span class="month-day">{{ monthDay }}</span>
      </div>
      <div class="plan-badges">
        <span v-if="isToday" class="badge badge-info">今天</span>
        <span v-if="plan" class="badge badge-default">{{ modeText }}</span>
        <span v-if="mood" class="mood-dot" :style="{ backgroundColor: mood.color }"></span>
      </div>
    </div>

    <div v-if="plan" class="plan-card-body">
      <ul v-if="blocks.length" class="task-list">
        <li
          v-for="block in blocks.slice(0, 5)"
          :key="block.id || block.subject"
          class="task-item"
          :class="{ done: block.completed || block.done }"
        >
          <span class="task-check">{{ (block.completed || block.done) ? '✓' : '○' }}</span>
          <span class="task-subject">{{ block.subject }}</span>
        </li>
        <li v-if="blocks.length > 5" class="task-more">+{{ blocks.length - 5 }} 项</li>
      </ul>
      <div v-else class="empty-tasks">暂无任务</div>
    </div>

    <div v-else class="plan-card-body">
      <div class="empty-plan">点击制定计划</div>
    </div>

    <div v-if="plan" class="plan-card-footer">
      <div class="progress-track">
        <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
      </div>
      <span class="progress-text">{{ doneCount }}/{{ totalCount }}</span>
    </div>
  </div>
</template>

<style scoped>
.plan-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  padding: var(--space-4);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
  display: flex;
  flex-direction: column;
  min-height: 180px;
}

.plan-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
  border-color: var(--accent-muted);
}

.plan-card.today {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.plan-card.empty {
  background: var(--bg-muted);
  border-style: dashed;
}

.plan-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.plan-date {
  display: flex;
  flex-direction: column;
}

.day-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
}

.month-day {
  font-family: var(--font-data);
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--text-primary);
}

.plan-badges {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.mood-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
}

.plan-card-body {
  flex: 1;
  margin-bottom: var(--space-3);
}

.task-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.task-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.task-item.done {
  color: var(--text-muted);
  text-decoration: line-through;
}

.task-check {
  font-size: var(--text-xs);
  color: var(--accent);
}

.task-more {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-1);
}

.empty-tasks,
.empty-plan {
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--space-4) 0;
}

.plan-card-footer {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.progress-track {
  flex: 1;
  height: 5px;
  background: var(--bg-muted);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent), var(--accent-lighter));
  border-radius: var(--radius-full);
  transition: width 0.8s var(--ease-out);
}

.progress-text {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
}
</style>
