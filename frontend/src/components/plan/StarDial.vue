<script setup>
/* ═══════════════════════════════════════
   StarDial.vue — 星轨轮盘时间选择器
   深靛星盘 + 描金双环（沿用 CardCelebration 卡背配色）。
   先拖选小时（上午/下午切换），自动切到分钟圈，
   分钟 5 分钟吸附；确认时星尘粒子反馈。
   ═══════════════════════════════════════ */
import { ref, computed } from 'vue'
import anime from 'animejs'
import { useAnime } from '@/composables/useAnime'

const props = defineProps({
  modelValue: { type: String, default: '' },   // 'HH:MM'；空 = 未钉时（展示 09:00，拖动后才 emit）
  showActions: { type: Boolean, default: true } // 卡片背面显示动作按钮；新建 modal 内嵌时关闭
})

const emit = defineEmits(['update:modelValue', 'pin', 'unpin', 'confirm'])
const { burst } = useAnime()

const svgRef = ref(null)
const centerTimeRef = ref(null)
const mode = ref('hour') // hour → 选中后自动切 minute

/* 内部时间：modelValue 为空时以 09:00 展示 */
const inner = computed(() => {
  const m = (props.modelValue || '').match(/^(\d{1,2}):(\d{2})/)
  return m
    ? { h: Math.min(23, Number(m[1])), m: Math.min(59, Number(m[2])) }
    : { h: 9, m: 0 }
})

const pm = computed(() => inner.value.h >= 12)

const display = computed(() =>
  String(inner.value.h).padStart(2, '0') + ':' + String(inner.value.m).padStart(2, '0')
)

/* ── 刻度几何（viewBox 240，圆心 120）── */
const C = 120

function polar(r, deg) {
  const rad = (deg * Math.PI) / 180
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) }
}

/* 外圈 60 分钟刻度，5 分位加长 */
const minuteTicks = computed(() => {
  const out = []
  for (let i = 0; i < 60; i++) {
    const deg = i * 6
    const major = i % 5 === 0
    const p1 = polar(major ? 100 : 105, deg)
    const p2 = polar(111, deg)
    out.push({ key: i, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, major })
  }
  return out
})

/* 内圈 12 小时标记：偶数位数字、奇数位星符 */
const hourMarks = computed(() => {
  const out = []
  for (let i = 0; i < 12; i++) {
    const p = polar(80, i * 30)
    out.push({ key: i, x: p.x, y: p.y, label: i % 2 === 0 ? String(i === 0 ? 12 : i) : '✦' })
  }
  return out
})

const hourAngle = computed(() => (inner.value.h % 12) * 30 + inner.value.m * 0.5)
const minuteAngle = computed(() => inner.value.m * 6)

function emitTime(h, m) {
  emit('update:modelValue', String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0'))
}

function setAmPm(toPm) {
  if (toPm === pm.value) return
  emitTime((inner.value.h + 12) % 24, inner.value.m)
}

/* ── 指针拖动（Pointer Events，触屏可用）── */
let dragging = false

function angleFromEvent(e) {
  const rect = svgRef.value.getBoundingClientRect()
  const scale = 240 / rect.width
  const dx = (e.clientX - rect.left) * scale - C
  const dy = (e.clientY - rect.top) * scale - C
  return (Math.atan2(dx, -dy) * 180) / Math.PI
}

function applyAngle(deg) {
  const d = ((deg % 360) + 360) % 360
  if (mode.value === 'hour') {
    const h12 = Math.round(d / 30) % 12
    emitTime((pm.value ? 12 : 0) + h12, inner.value.m)
  } else {
    /* 5 分钟吸附 */
    const m = (Math.round(d / 30) * 5) % 60
    if (m !== inner.value.m) {
      emitTime(inner.value.h, m)
      snapPulse()
    }
  }
}

/* 吸附瞬间中心读数微小脉冲（不能动脉 SVG <g> 的 scale：inline style 会覆盖 rotate 属性变换） */
function snapPulse() {
  if (!centerTimeRef.value) return
  anime({ targets: centerTimeRef.value, scale: [1.15, 1], duration: 220, easing: 'easeOutQuad' })
}

function onDown(e) {
  if (!svgRef.value) return
  dragging = true
  svgRef.value.setPointerCapture && svgRef.value.setPointerCapture(e.pointerId)
  applyAngle(angleFromEvent(e))
  e.preventDefault()
}

function onMove(e) {
  if (!dragging) return
  applyAngle(angleFromEvent(e))
}

function onUp() {
  if (!dragging) return
  dragging = false
  /* 小时选完自动切到分钟圈 */
  if (mode.value === 'hour') mode.value = 'minute'
}

/* 确认：星尘粒子 + emit */
function onConfirm() {
  if (svgRef.value) {
    const r = svgRef.value.getBoundingClientRect()
    burst(r.left + r.width / 2, r.top + r.height / 2, {
      count: 14,
      colors: ['#e8c874', '#f5e3b3', '#b9a7e8', '#ffffff']
    })
  }
  emit('confirm')
}
</script>

<template>
  <div class="star-dial">
    <div class="sd-stage">
      <svg
        ref="svgRef"
        viewBox="0 0 240 240"
        class="sd-svg"
        @pointerdown="onDown"
        @pointermove="onMove"
        @pointerup="onUp"
        @pointercancel="onUp"
      >
        <defs>
          <radialGradient id="sd-bg" cx="50%" cy="42%" r="72%">
            <stop offset="0%" stop-color="#2b1b5e" />
            <stop offset="55%" stop-color="#1a1440" />
            <stop offset="100%" stop-color="#0d0a24" />
          </radialGradient>
        </defs>
        <circle cx="120" cy="120" r="116" fill="url(#sd-bg)" stroke="#e8c874" stroke-width="1.5" />
        <circle cx="120" cy="120" r="94" fill="none" stroke="#e8c874" stroke-width="0.7" opacity="0.5" stroke-dasharray="2 4" />

        <!-- 外圈分钟刻度 -->
        <line
          v-for="t in minuteTicks"
          :key="'mt' + t.key"
          :x1="t.x1" :y1="t.y1" :x2="t.x2" :y2="t.y2"
          :stroke="t.major ? '#e8c874' : '#8a7bb8'"
          :stroke-width="t.major ? 1.6 : 0.8"
          :opacity="t.major ? 0.9 : 0.45"
        />

        <!-- 内圈小时标记 -->
        <text
          v-for="hm in hourMarks"
          :key="'hm' + hm.key"
          :x="hm.x" :y="hm.y"
          text-anchor="middle"
          dominant-baseline="central"
          class="sd-hour-mark"
          :class="{ star: hm.label === '✦' }"
        >{{ hm.label }}</text>

        <!-- 时针（短粗） -->
        <g :transform="`rotate(${hourAngle} 120 120)`" class="sd-hand" :class="{ active: mode === 'hour' }">
          <line x1="120" y1="120" x2="120" y2="68" stroke="#e8c874" stroke-width="5" stroke-linecap="round" />
          <circle cx="120" cy="66" r="5" fill="#e8c874" />
        </g>

        <!-- 分针（细长，端点星符） -->
        <g :transform="`rotate(${minuteAngle} 120 120)`" class="sd-hand sd-min-hand" :class="{ active: mode === 'minute' }">
          <line x1="120" y1="120" x2="120" y2="36" stroke="#f5e3b3" stroke-width="2.5" stroke-linecap="round" />
          <text x="120" y="30" text-anchor="middle" class="sd-hand-star">✦</text>
        </g>

        <circle cx="120" cy="120" r="7" fill="#16103a" stroke="#e8c874" stroke-width="1.5" />
      </svg>

      <!-- 中心读数（不拦截指针事件） -->
      <div class="sd-center">
        <span class="sd-time" ref="centerTimeRef">{{ display }}</span>
        <span class="sd-hint">{{ mode === 'hour' ? '拖动选小时' : '拖动选分钟' }}</span>
      </div>
    </div>

    <!-- 上午 / 下午 -->
    <div class="sd-ampm">
      <button type="button" class="sd-ampm-btn" :class="{ on: !pm }" @click="setAmPm(false)">上午</button>
      <button type="button" class="sd-ampm-btn" :class="{ on: pm }" @click="setAmPm(true)">下午</button>
    </div>

    <!-- 动作按钮（卡片背面用；modal 内嵌时由父级提供按钮） -->
    <div v-if="showActions" class="sd-actions">
      <button type="button" class="btn btn-primary btn-sm" @click="emit('pin')">📌 钉住时间</button>
      <button type="button" class="btn btn-ghost btn-sm" @click="emit('unpin')">🌊 转为流动</button>
      <button type="button" class="btn btn-secondary btn-sm" @click="onConfirm">✓ 完成</button>
    </div>
  </div>
</template>

<style scoped>
.star-dial {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.sd-stage {
  position: relative;
  width: 240px;
  max-width: 100%;
}

.sd-svg {
  display: block;
  width: 240px;
  max-width: 100%;
  height: auto;
  border-radius: 50%;
  box-shadow: 0 0 24px rgba(232, 200, 116, 0.25);
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.sd-svg:active { cursor: grabbing; }

.sd-hour-mark {
  fill: #f5e3b3;
  font-size: 12px;
  font-weight: 600;
}

.sd-hour-mark.star {
  fill: #b9a7e8;
  font-size: 10px;
}

.sd-hand { opacity: 0.55; transition: opacity var(--duration-fast) var(--ease-out); }
.sd-hand.active { opacity: 1; }

.sd-min-hand {
  transform-origin: 120px 120px;
}

.sd-hand-star {
  fill: #f5e3b3;
  font-size: 10px;
}

/* 中心读数 */
.sd-center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, 18px);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
}

.sd-time {
  font-family: var(--font-data);
  font-size: var(--text-lg);
  font-weight: 700;
  color: #f5e3b3;
  text-shadow: 0 0 10px rgba(232, 200, 116, 0.7);
}

.sd-hint {
  font-size: 10px;
  color: #b9a7e8;
  margin-top: 2px;
}

/* 上午 / 下午 */
.sd-ampm {
  display: flex;
  gap: var(--space-2);
}

.sd-ampm-btn {
  padding: var(--space-1) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  background: var(--bg-muted);
  transition: all var(--duration-fast) var(--ease-out);
}

.sd-ampm-btn.on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-muted);
  font-weight: 600;
}

.sd-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
  justify-content: center;
}
</style>
