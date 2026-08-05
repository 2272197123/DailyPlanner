<script setup>
import { computed } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { fmtDate } from '@/utils/format'
import { DEFAULT_MODE_CFG, MODE_ORDER } from '@/utils/constants'

const props = defineProps({
  date: String,
  dateState: String,
  modeLabel: String,
  mode: String
})

const emit = defineEmits(['prev', 'next', 'today', 'setMode', 'import'])

const displayDate = computed(() => fmtDate(props.date))

const modeOptions = MODE_ORDER.map(key => ({
  key,
  label: DEFAULT_MODE_CFG[key].label,
  active: props.mode === key
}))
</script>

<template>
  <nav class="timeline-nav" :class="'state-' + dateState">
    <div class="tn-top">
      <button class="tn-arrow" @click="emit('prev')" title="前一天">←</button>
      <h2 class="tn-date" @click="emit('today')">
        {{ displayDate }}
        <span class="tn-state-dot" :class="'dot-' + dateState"></span>
      </h2>
      <button class="tn-arrow" @click="emit('next')" title="后一天">→</button>
    </div>

    <div class="tn-bar">
      <button class="tn-today" @click="emit('today')">今天</button>

      <div class="tn-modes">
        <button
          v-for="opt in modeOptions"
          :key="opt.key"
          class="tn-mode"
          :class="{ active: opt.active }"
          @click="emit('setMode', opt.key)"
        >
          {{ opt.label }}
        </button>
      </div>

      <div class="tn-actions">
        <button class="tn-act" @click="emit('import')" title="导入计划">📥 导入</button>
        <button class="tn-act" title="新建任务">＋ 新任务</button>
        <button class="tn-act" title="固定事务">🔁</button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.timeline-nav {
  padding: var(--space-4) 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: var(--space-2);
  transition: border-color var(--duration-normal) var(--ease-out);
}

.state-past { border-color: var(--state-past); }
.state-future { border-color: var(--state-future); }

.tn-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}

.tn-arrow {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  font-size: var(--text-xl);
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
}

.tn-arrow:hover {
  background: var(--bg-muted);
  color: var(--accent);
  transform: scale(1.08);
}

.tn-date {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-md);
  transition: background var(--duration-fast) var(--ease-out);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.tn-date:hover { background: var(--bg-muted); }

.tn-state-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  transition: background var(--duration-normal) var(--ease-out);
}

.dot-past { background: var(--state-past); }
.dot-present { background: var(--accent); }
.dot-future { background: var(--state-future); }

.tn-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.tn-today {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--accent);
  border: 1.5px solid var(--accent);
  border-radius: var(--radius-full);
  transition: all var(--duration-fast) var(--ease-out);
}

.tn-today:hover {
  background: var(--accent);
  color: var(--text-inverse);
}

.tn-modes {
  display: flex;
  gap: 2px;
  background: var(--bg-muted);
  border-radius: var(--radius-full);
  padding: 2px;
}

.tn-mode {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
}

.tn-mode.active {
  background: var(--accent);
  color: var(--text-inverse);
  font-weight: 600;
}

.tn-actions {
  display: flex;
  gap: var(--space-1);
}

.tn-act {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  transition: all var(--duration-fast) var(--ease-out);
}

.tn-act:hover {
  background: var(--bg-muted);
  color: var(--accent);
}
</style>
