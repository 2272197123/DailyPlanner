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
  const vents = props.mood.vents || []
  // 多条吐槽 → 多色渐变（线性拼接 vents 颜色），单日丰富多彩
  if (vents.length > 1) {
    const stops = vents.map(v => v.color + hexAlpha).join(', ')
    return { background: `linear-gradient(135deg, ${stops})` }
  }
  return { backgroundColor: props.mood.color + hexAlpha }
})

const tooltip = computed(() => {
  if (!props.mood) return props.date
  const vents = props.mood.vents || []
  const ventPart = vents.length ? ` · ${vents.length} 条吐槽` : ''
  return `${props.date} · ${props.mood.label}${props.mood.note ? ' · ' + props.mood.note : ''}${ventPart}`
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
  position: relative;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}

.mood-cell:hover {
  transform: scale(1.5);
  box-shadow: 0 0 0 2px var(--accent-muted);
  z-index: 1;
  /* 常驻 will-change 会给 365 格各建合成层，只在 hover 动画期间提升 */
  will-change: transform;
}

/* 今天：静态描边 + ::after 扩散环定位（transform/opacity 可合成；
   原 box-shadow 无限动画每帧 repaint，改法同 TaskCard ctp-dot.pulsing） */
.mood-cell.is-today {
  box-shadow: 0 0 0 2px var(--accent);
  /* 建合成上下文（同 ctp-dot 的 z-index:0）：否则 ::after 的 z-index:-1 会
     逃逸到祖先层叠上下文，被 .card 背景盖住，光环不可见 */
  z-index: 0;
}

.mood-cell.is-today::after {
  content: '';
  position: absolute;
  inset: -2px; /* 对齐静态描边外缘 */
  border: 2px solid var(--accent);
  border-radius: inherit;
  z-index: -1; /* 压在格子本体下，只露出扩散出边界的部分 */
  opacity: 0;
  animation: today-halo 2s ease-out infinite;
}

@keyframes today-halo {
  0% { transform: scale(1); opacity: 0.55; }
  100% { transform: scale(1.45); opacity: 0; }
}
</style>
