<script setup>
import { computed } from 'vue'

const props = defineProps({
  date: { type: String, required: true },
  mood: { type: Object, default: null },
  size: { type: Number, default: 14 },
  gap: { type: Number, default: 3 },
  isToday: { type: Boolean, default: false }
})

const emit = defineEmits(['click'])

const bgStyle = computed(() => {
  if (!props.mood) return { backgroundColor: 'var(--bg-muted)' }
  const alpha = 0.35 + (props.mood.intensity || 2) * 0.16
  const hexAlpha = Math.round(alpha * 255).toString(16).padStart(2, '0')
  return { backgroundColor: props.mood.color + hexAlpha }
})

const tooltip = computed(() => {
  if (!props.mood) return props.date
  return `${props.date} · ${props.mood.label}${props.mood.note ? ' · ' + props.mood.note : ''}`
})

function onClick(event) {
  emit('click', props.date, event)
}
</script>

<template>
  <div
    class="mood-cell"
    :class="{ 'is-today': isToday }"
    :style="{ width: `${size}px`, height: `${size}px`, borderRadius: `${size / 4}px`, ...bgStyle }"
    :title="isToday ? '今天 · ' + tooltip : tooltip"
    @click="onClick"
  ></div>
</template>

<style scoped>
.mood-cell {
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
  will-change: transform;
}

.mood-cell:hover {
  transform: scale(1.5);
  box-shadow: 0 0 0 2px var(--accent-muted);
  z-index: 1;
}

/* 今天：呼吸光环，一眼定位 */
.mood-cell.is-today {
  box-shadow: 0 0 0 2px var(--accent);
  animation: today-halo 2s ease-in-out infinite;
}

@keyframes today-halo {
  0%, 100% { box-shadow: 0 0 0 2px var(--accent); }
  50% { box-shadow: 0 0 0 4px var(--accent-muted); }
}
</style>
