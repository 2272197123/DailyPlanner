<script setup>
/* ═══════════════════════════════════════
   StarStrip.vue — 星图拖杆（迷你 24h 横轴）
   已有钉时块显示为星座色块；拖动星柄设定开始时间，
   5 分钟吸附，拖入钉时区间时磁吸避让；松手星尘反馈。
   与星轨轮盘绑同一 time 值，天然同步。
   ═══════════════════════════════════════ */
import { ref, computed } from 'vue'
import { useAnime } from '@/composables/useAnime'

const props = defineProps({
  modelValue: { type: String, default: '' },      // 'HH:MM'；空时展示 09:00，拖动后才 emit
  pinned: { type: Array, default: () => [] }       // 当日其他钉时区间 [{ start, end }]（分钟）
})

const emit = defineEmits(['update:modelValue', 'change'])
const { burst } = useAnime()

const trackRef = ref(null)

/* 当前分钟数（0–1435） */
const minutes = computed(() => {
  const m = (props.modelValue || '').match(/^(\d{1,2}):(\d{2})/)
  return m ? Math.min(1435, Number(m[1]) * 60 + Number(m[2])) : 9 * 60
})

const display = computed(() =>
  String(Math.floor(minutes.value / 60)).padStart(2, '0') + ':' + String(minutes.value % 60).padStart(2, '0')
)

const handleLeft = computed(() => (minutes.value / 1440) * 100 + '%')

/* 每 3 小时一个刻度，整点数字 + 星符 */
const hourTicks = [0, 3, 6, 9, 12, 15, 18, 21]

/* 钉时区间 → 百分比定位 */
const pinBlocks = computed(() =>
  props.pinned.map(p => ({
    left: (p.start / 1440) * 100 + '%',
    width: (Math.max(0, p.end - p.start) / 1440) * 100 + '%'
  }))
)

/* ── 指针拖动 ── */
let dragging = false

function applyX(clientX) {
  const track = trackRef.value
  if (!track) return
  const rect = track.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  /* 5 分钟吸附 */
  let min = Math.round((ratio * 1440) / 5) * 5
  min = Math.max(0, Math.min(1435, min))
  /* 磁吸避让：落入钉时区间 → 吸到最近边界 */
  for (const p of props.pinned) {
    if (min > p.start && min < p.end) {
      min = min - p.start < p.end - min ? p.start : p.end
    }
  }
  /* 吸到区间末端可能越界（如钉时块结束于 24:00）→ 收回当天范围 */
  min = Math.max(0, Math.min(1435, min))
  if (min !== minutes.value) {
    emit('update:modelValue', String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'))
  }
}

function onDown(e) {
  dragging = true
  trackRef.value && trackRef.value.setPointerCapture && trackRef.value.setPointerCapture(e.pointerId)
  applyX(e.clientX)
  e.preventDefault()
}

function onMove(e) {
  if (!dragging) return
  applyX(e.clientX)
}

/* 松手：星尘粒子反馈 */
function onUp(e) {
  if (!dragging) return
  dragging = false
  burst(e.clientX, e.clientY, {
    count: 8,
    distance: 42,
    size: 4,
    colors: ['#e8c874', '#f5e3b3', '#b9a7e8']
  })
  emit('change')
}
</script>

<template>
  <div class="star-strip">
    <div class="ss-head">
      <span class="ss-label">✦ 星图拖杆</span>
      <span class="ss-value">{{ display }}</span>
    </div>
    <div
      ref="trackRef"
      class="ss-track"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <!-- 小时刻度 -->
      <span
        v-for="h in hourTicks"
        :key="'h' + h"
        class="ss-tick"
        :style="{ left: (h / 24) * 100 + '%' }"
      >{{ String(h).padStart(2, '0') }}</span>

      <!-- 钉时区间（星座色块） -->
      <span
        v-for="(p, i) in pinBlocks"
        :key="'p' + i"
        class="ss-pin"
        :style="{ left: p.left, width: p.width }"
      >✦</span>

      <!-- 拖动星柄 -->
      <span class="ss-handle" :style="{ left: handleLeft }">✦</span>
    </div>
  </div>
</template>

<style scoped>
.star-strip {
  width: 100%;
}

.ss-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-1);
}

.ss-label {
  font-size: 10px;
  color: var(--text-muted);
}

.ss-value {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--accent);
}

.ss-track {
  position: relative;
  height: 34px;
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  background: var(--bg-muted);
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.ss-tick {
  position: absolute;
  bottom: 2px;
  transform: translateX(-50%);
  font-family: var(--font-data);
  font-size: 8px;
  color: var(--text-muted);
  pointer-events: none;
}

/* 钉时区间：星座色块 */
.ss-pin {
  position: absolute;
  top: 4px;
  height: 14px;
  border-radius: var(--radius-full);
  background: var(--accent-muted);
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 8px;
  line-height: 12px;
  text-align: center;
  overflow: hidden;
  pointer-events: none;
}

/* 星柄 */
.ss-handle {
  position: absolute;
  top: 2px;
  transform: translateX(-50%);
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--accent);
  color: var(--text-inverse, #fff);
  font-size: 9px;
  box-shadow: 0 0 8px var(--accent);
  pointer-events: none;
}
</style>
