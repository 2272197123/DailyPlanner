<script>
/* 模块级自增序号：同页多瓶实例（MoodWeek 7 个 mini + 大瓶）的
   clipPath / 渐变 id 唯一性靠它保证（script setup 顶层变量是实例级的） */
let wbUidSeq = 0
</script>

<script setup>
/* ═══════════════════════════════════════
   WishingBottle.vue — 许愿瓶（当日心情核心视觉）
   圆柱形玻璃罐：直壁瓶身 + 微圆底角 + 短颈 + 锥形软木塞 +
   颈部麻绳结；玻璃为径向渐变淡填充 + 双弧高光 + 瓶身塔罗 ✦ 刻印。
   全部吐槽汇成「一团」液体：颜色沿用月历的多色渐变合成（vents
   本色沿瓶身平滑渐变，最新一条在液面顶端），液面波浪只在最顶部；
   液位随吐槽数上升（首条 15%，此后每条 +12%，上限 88%）；新增吐槽
   播放倒入动画（色滴落到当前液面 → 瓶身弹簧晃动 → 星尘），删除
   播放消散星尘。mini 模式：近 7 天视图的小瓶，只画液体、无动画。
   ═══════════════════════════════════════ */
import { ref, computed, watch, onUnmounted } from 'vue'
import { useAnime, prefersReducedMotion } from '@/composables/useAnime'

const props = defineProps({
  vents: { type: Array, default: () => [] },
  mini: { type: Boolean, default: false }
})

const { starDust, animate } = useAnime()

/* 每个实例独立的 clipPath / 渐变 id，避免多瓶同页冲突 */
const clipId = `wb-clip-${++wbUidSeq}`
const glassGradId = `${clipId}-glass`
const liquidGradId = `${clipId}-liquid`

const wrapRef = ref(null)

/* 移动端判定一次即可：气泡精简用 */
const isMobile = window.matchMedia('(max-width: 768px)').matches

/* ── 瓶体几何（viewBox 200×280）：短颈 + 直壁圆柱瓶身 + 微圆底角 ── */
const OUTER_D = 'M84 30 H116 V56 H152 V232 Q152 248 136 248 H64 Q48 248 48 232 V56 H84 Z'
const INNER_D = 'M89 35 H111 V61 H147 V231 Q147 243 135 243 H65 Q53 243 53 231 V61 H89 Z'
const LIQUID = { x0: 53, x1: 147, bottom: 241, top: 70 } // 液体可用区域
const CAPACITY = LIQUID.bottom - LIQUID.top

/* 液位比例：首条 15%，此后每条 +12%，上限 88%（不没过瓶肩） */
const fillPct = computed(() => {
  const n = props.vents.length
  if (!n) return 0
  return Math.min(0.88, 0.15 + (n - 1) * 0.12)
})

/* 当前液面（瓶内相对 viewBox 的 y），倒入动画落点用 */
const surfaceY = computed(() =>
  fillPct.value ? LIQUID.bottom - fillPct.value * CAPACITY : LIQUID.bottom
)

/* 正弦波浪液面 path（跨出瓶身宽度，平移做流动；只有顶部一道波） */
const liquidD = computed(() => {
  const topY = surfaceY.value
  let d = `M 18 ${topY.toFixed(1)}`
  for (let x = 18; x <= 182; x += 4) {
    d += ` L ${x} ${(topY + Math.sin(x / 6) * 2.4).toFixed(1)}`
  }
  d += ` L 182 ${LIQUID.bottom + 8} L 18 ${LIQUID.bottom + 8} Z`
  return d
})

/* 十六进制色向白色提亮（液面渐变浅色端用；非 hex 原样返回） */
function lighten(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.round((n >> 16) + (255 - (n >> 16)) * amt)
  const g = Math.round(((n >> 8) & 255) + (255 - ((n >> 8) & 255)) * amt)
  const b = Math.round((n & 255) + (255 - (n & 255)) * amt)
  return `rgb(${r}, ${g}, ${b})`
}

/* 液体渐变 stops：沿用月历多 vent 的颜色合成——vents 本色平滑渐变
   （是渐变不是分层：stop 间平滑过渡，无硬边界）；最新一条在液面顶端，
   顶缘稍提亮模拟液面受光；单条 = 纯色（两端同色） */
const liquidStops = computed(() => {
  const colors = props.vents.map(v => v.color).reverse() // 新→旧：顶→底
  if (!colors.length) return []
  if (colors.length === 1) {
    return [
      { offset: '0%', color: colors[0] },
      { offset: '100%', color: colors[0] }
    ]
  }
  const stops = [{ offset: '0%', color: lighten(colors[0], 0.28) }]
  colors.forEach((c, i) => {
    stops.push({ offset: `${(8 + (i * 92) / (colors.length - 1)).toFixed(1)}%`, color: c })
  })
  return stops
})

/* 气泡：单液体内上升；上浮距离随液深缩放，避免浅液时冲出水面 */
const bubbles = computed(() => {
  if (!props.vents.length) return []
  const depth = LIQUID.bottom - surfaceY.value
  const rise = Math.max(10, Math.min(30, depth * 0.5))
  const all = [
    { cx: 76, cy: LIQUID.bottom - 6, dur: 2.6, delay: 0.3, rise },
    { cx: 124, cy: LIQUID.bottom - 10, dur: 3.2, delay: 1.2, rise }
  ]
  return isMobile ? all.slice(0, 1) : all // 移动端 1 个气泡
})

const reduced = prefersReducedMotion()
let pourTimer = null

/* 倒入动画：色滴从瓶口落到当前液面 → 瓶身弹簧晃动 → 星尘 */
function playPour(color) {
  if (reduced || props.mini) return
  const wrap = wrapRef.value
  if (!wrap) return
  const rect = wrap.getBoundingClientRect()
  const mouthX = rect.left + rect.width / 2
  const mouthY = rect.top + rect.height * (36 / 280) // 瓶口（软木塞下沿）
  const surfY = rect.top + rect.height * (surfaceY.value / 280)

  const drop = document.createElement('span')
  drop.style.cssText = `
    position: fixed; left: ${mouthX - 5}px; top: ${mouthY}px;
    width: 10px; height: 14px; border-radius: 50% 50% 60% 60%;
    background: ${color}; box-shadow: 0 0 10px ${color};
    pointer-events: none; z-index: 10001; will-change: transform;
  `
  document.body.appendChild(drop)
  animate(drop, {
    translateY: [0, Math.max(10, surfY - mouthY)],
    scaleY: [1, 1.35],
    opacity: [1, 0.9],
    duration: 380,
    easing: 'easeInQuad',
    complete: () => drop.remove()
  })
  animate(wrap, {
    rotate: [0, 3, -2.4, 1.4, 0],
    duration: 900,
    easing: 'easeOutElastic(1, .5)'
  })
  pourTimer = setTimeout(() => {
    starDust(mouthX, surfY, { count: 12, colors: [color, '#e8c874', '#f5e3b3', '#ffffff'] })
  }, 380)
}

/* 消散动画：液体减少时在瓶口散一小簇星尘 */
function playDissipate() {
  if (reduced || props.mini) return
  const wrap = wrapRef.value
  if (!wrap) return
  const rect = wrap.getBoundingClientRect()
  starDust(rect.left + rect.width / 2, rect.top + rect.height * 0.5, { count: 8, spread: 90, fall: 80 })
}

watch(() => props.vents.length, (n, o) => {
  if (n > o) playPour(props.vents[n - 1]?.color || '#e8c874')
  else if (n < o) playDissipate()
})

onUnmounted(() => {
  if (pourTimer) clearTimeout(pourTimer)
})
</script>

<template>
  <div class="wishing-bottle" :class="{ mini }" ref="wrapRef">
    <svg viewBox="0 0 200 280" class="wb-svg" aria-hidden="true">
      <defs>
        <clipPath :id="clipId">
          <path :d="INNER_D" />
        </clipPath>
        <!-- 玻璃淡色径向渐变（左上受光） -->
        <radialGradient :id="glassGradId" cx="38%" cy="28%" r="85%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.22" />
          <stop offset="55%" stop-color="#ffffff" stop-opacity="0.07" />
          <stop offset="100%" stop-color="#9fb8d8" stop-opacity="0.12" />
        </radialGradient>
        <!-- 单团液体垂直渐变：vents 本色平滑拼接（沿用月历合成），
             stop 内联样式驱动，换色平滑过渡 -->
        <linearGradient :id="liquidGradId" x1="0" y1="0" x2="0" y2="1">
          <stop
            v-for="(s, si) in liquidStops"
            :key="si"
            :offset="s.offset"
            class="wb-stop"
            :style="{ stopColor: s.color }"
          />
        </linearGradient>
      </defs>

      <!-- 瓶内液体（裁剪到瓶身内）：单团混合色，波浪只在顶部液面 -->
      <g :clip-path="`url(#${clipId})`">
        <g v-if="props.vents.length" class="wb-liquid">
          <path class="wb-fill" :d="liquidD" :fill="`url(#${liquidGradId})`" />
        </g>
        <template v-if="props.vents.length && !mini && !reduced">
          <circle
            v-for="(b, bi) in bubbles"
            :key="bi"
            class="wb-bubble"
            :cx="b.cx" :cy="b.cy" r="2.4"
            :style="{
              animationDuration: `${b.dur}s`,
              animationDelay: `${b.delay}s`,
              '--wb-rise': `${-b.rise}px`
            }"
          />
        </template>
        <!-- 空瓶时的几点星尘 -->
        <text v-if="!props.vents.length" x="100" y="170" text-anchor="middle" class="wb-empty">✧ ✦ ✧</text>
      </g>

      <!-- 玻璃瓶身（渐变淡填充 + 细描边 + 内壁细线显玻璃厚度） -->
      <path class="wb-glass" :d="OUTER_D" :fill="`url(#${glassGradId})`" />
      <path class="wb-rim" :d="INNER_D" />
      <!-- 瓶身塔罗 ✦ 刻印（低透明） -->
      <path class="wb-etch" d="M100 92 C101.8 100.5 104.5 103.2 113 105 C104.5 106.8 101.8 109.5 100 118 C98.2 109.5 95.5 106.8 87 105 C95.5 103.2 98.2 100.5 100 92 Z" />
      <!-- 玻璃高光：左主弧 + 右细弧（沿直壁的竖向高光带） -->
      <path class="wb-shine" d="M58 76 C53 118 53 190 60 226 C55 190 55 120 63 80 Z" />
      <path class="wb-shine-sm" d="M139 82 C144 120 144 190 139 222 C142 190 142 122 136 86 Z" />

      <!-- 颈部麻绳：两圈缠绕 + 右侧蝴蝶结 -->
      <g class="wb-twine">
        <path class="wb-twine-wrap" d="M82 42 C92 44 108 44 118 42" />
        <path class="wb-twine-wrap" d="M82 47 C92 49 108 49 118 47" />
        <path class="wb-twine-loop" d="M116 43 C123 34 133 34 132 40.5 C131 46.5 122 46.5 116 43 Z" />
        <path class="wb-twine-loop" d="M116 44.5 C123 53.5 133 53.5 132 47.5 C131 41.5 122 41 116 44.5 Z" />
        <circle class="wb-twine-knot" cx="116.5" cy="44" r="2.1" />
        <path class="wb-twine-tail" d="M116 46 C119 54 117 60 113 65" />
        <path class="wb-twine-tail" d="M117 46 C122 52 124 58 123 64" />
      </g>

      <!-- 软木塞（锥形 + 纹理线） -->
      <path class="wb-cork" d="M80 8 L120 8 L115 34 L85 34 Z" />
      <path class="wb-cork-line" d="M86 14.5 L114 13.5" />
      <path class="wb-cork-line" d="M85.5 20.5 L114.5 19.5" />
      <path class="wb-cork-line" d="M85 27 L115 26" />
    </svg>
  </div>
</template>

<style scoped>
.wishing-bottle {
  width: 180px;
  max-width: 46vw;
  margin: 0 auto;
  transform-origin: 50% 8%;
}

.wishing-bottle.mini {
  width: 64px;
}

.wb-svg {
  display: block;
  width: 100%;
  height: auto;
}

.wb-glass {
  stroke: var(--accent, #b9a7e8);
  stroke-width: 2.5;
  stroke-linejoin: round;
}

.wb-rim {
  fill: none;
  stroke: rgba(255, 255, 255, 0.16);
  stroke-width: 1.2;
  stroke-linejoin: round;
}

.wb-etch {
  fill: rgba(255, 255, 255, 0.13);
  stroke: rgba(255, 255, 255, 0.26);
  stroke-width: 1;
  stroke-linejoin: round;
}

.wb-shine {
  fill: rgba(255, 255, 255, 0.2);
}

.wb-shine-sm {
  fill: rgba(255, 255, 255, 0.13);
}

.wb-cork {
  fill: #c19256;
  stroke: #8a6132;
  stroke-width: 1.5;
  stroke-linejoin: round;
}

.wb-cork-line {
  fill: none;
  stroke: #8a6132;
  stroke-width: 1.2;
  stroke-linecap: round;
  opacity: 0.55;
}

.wb-twine-wrap,
.wb-twine-tail {
  fill: none;
  stroke: #a0714f;
  stroke-width: 1.8;
  stroke-linecap: round;
}

.wb-twine-tail {
  stroke-width: 1.4;
}

.wb-twine-loop {
  fill: rgba(176, 141, 95, 0.3);
  stroke: #a0714f;
  stroke-width: 1.4;
  stroke-linejoin: round;
}

.wb-twine-knot {
  fill: #8f6b43;
}

.wb-liquid {
  animation: wb-wave 3.2s ease-in-out infinite alternate;
  opacity: 0.92;
}

.wishing-bottle.mini .wb-liquid {
  animation: none;
}

/* 移动端停用波浪（照搬 mini 先例）：SVG 渐变 path 在老移动 GPU 上逐帧重绘太贵，
   液体保留静态渐变色，气泡已按移动端减量（保持） */
@media (max-width: 768px) {
  .wb-liquid {
    animation: none;
  }
}

/* 混合色变化时 stop-color 平滑过渡（chrome80 支持 stop-color 过渡） */
.wb-stop {
  transition: stop-color 0.6s ease;
}

@keyframes wb-wave {
  from { transform: translateX(-7px); }
  to { transform: translateX(7px); }
}

.wb-bubble {
  fill: rgba(255, 255, 255, 0.55);
  animation: wb-rise 3s ease-in infinite;
}

@keyframes wb-rise {
  0% { transform: translateY(0); opacity: 0; }
  25% { opacity: 0.65; }
  100% { transform: translateY(var(--wb-rise, -30px)); opacity: 0; }
}

.wb-empty {
  fill: var(--text-muted, #8b8b9e);
  font-size: 15px;
  opacity: 0.6;
  animation: wb-twinkle 2.2s ease-in-out infinite alternate;
}

@keyframes wb-twinkle {
  from { opacity: 0.25; }
  to { opacity: 0.7; }
}

/* 减弱动效：关掉液面流动 / 气泡 / 空瓶闪烁 / 换色过渡 */
@media (prefers-reduced-motion: reduce) {
  .wb-liquid,
  .wb-bubble,
  .wb-empty {
    animation: none;
  }

  .wb-stop {
    transition: none;
  }
}
</style>
