<script setup>
/* ═══════════════════════════════════════
   StarPendant.vue — 星星吊坠（钟摆物理）
   页面顶部悬挂星形吊坠：角弹簧 + 阻尼 + 微风扰动；
   可拖拽甩动，松手后摆动衰减。rAF 循环卸载即停；
   prefers-reduced-motion 下静止。
   ═══════════════════════════════════════ */
import { ref, onMounted, onUnmounted } from 'vue'
import { prefersReducedMotion } from '@/composables/useAnime'

const pendantRef = ref(null)
const reduced = prefersReducedMotion()

let raf = null
let theta = 0.22   // 摆角（弧度）
let omega = 0      // 角速度
let lastT = 0
let dragging = false

const K = 5.2  // 弹簧刚度
const C = 0.5  // 阻尼

function tick(t) {
  if (!lastT) lastT = t
  const dt = Math.min(0.05, (t - lastT) / 1000)
  lastT = t
  if (!dragging) {
    // 微风：两个慢周期叠加的轻扰
    const wind = Math.sin(t / 1800) * 0.06 + Math.sin(t / 733) * 0.03
    const acc = -K * Math.sin(theta) - C * omega + wind
    omega += acc * dt
    theta += omega * dt
  }
  if (pendantRef.value) {
    pendantRef.value.style.transform = `rotate(${theta}rad)`
  }
  raf = requestAnimationFrame(tick)
}

function angleFromPointer(e) {
  const el = pendantRef.value
  if (!el) return theta
  const rect = el.getBoundingClientRect()
  const ax = rect.left + rect.width / 2
  const ay = rect.top
  return Math.max(-1.2, Math.min(1.2, Math.atan2(e.clientX - ax, e.clientY - ay)))
}

function onPointerDown(e) {
  if (reduced) return
  dragging = true
  e.currentTarget.setPointerCapture?.(e.pointerId)
  theta = angleFromPointer(e)
  omega = 0
}

function onPointerMove(e) {
  if (!dragging) return
  const prev = theta
  theta = angleFromPointer(e)
  omega = (theta - prev) * 26  // 甩动手感：松手带初速度
}

function onPointerUp() {
  dragging = false
}

onMounted(() => {
  if (!reduced) raf = requestAnimationFrame(tick)
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  document.removeEventListener('visibilitychange', onVisibility)
})

/* 页面隐藏时停 rAF（省电/省 GPU），回到前台重置 lastT 避免 dt 跳变 */
function onVisibility() {
  if (reduced) return
  if (document.hidden) {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = null
    }
  } else if (!raf) {
    lastT = 0
    raf = requestAnimationFrame(tick)
  }
}
</script>

<template>
  <div class="star-pendant" :class="{ static: reduced }">
    <div
      ref="pendantRef"
      class="sp-swing"
      :class="{ draggable: !reduced }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <span class="sp-chain"></span>
      <svg class="sp-star" viewBox="0 0 60 60" aria-hidden="true">
        <defs>
          <radialGradient id="sp-glow" cx="50%" cy="42%" r="65%">
            <stop offset="0%" stop-color="#f5e3b3" />
            <stop offset="55%" stop-color="#e8c874" />
            <stop offset="100%" stop-color="#b98f3e" />
          </radialGradient>
        </defs>
        <!-- 四芒星（塔罗风） -->
        <path
          d="M30 4 C33.5 21 39 26.5 56 30 C39 33.5 33.5 39 30 56 C26.5 39 21 33.5 4 30 C21 26.5 26.5 21 30 4 Z"
          fill="url(#sp-glow)"
          stroke="#8a6a24"
          stroke-width="1.4"
        />
        <circle cx="30" cy="30" r="4.5" fill="#fff6dd" opacity="0.9" />
      </svg>
    </div>
  </div>
</template>

<style scoped>
.star-pendant {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  pointer-events: none;
}

/* 静态光晕：radial-gradient 伪元素（绘制型背景，不是滤镜），
   挂在 .sp-swing 上随摆动一起 transform —— 滤镜若挂在 rAF 旋转
   元素上会每帧重渲染；背景渐变只随 transform 合成，零重绘。
   若挂在外层则拖拽甩动（最大 1.2rad）时光晕会与星星脱节 */
.sp-swing::before {
  content: '';
  position: absolute;
  top: 21px; /* 链条 46px + 星星 44px → 星心约 66px，光晕半径 45px */
  left: 50%;
  z-index: -1;
  width: 90px;
  height: 90px;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(232, 200, 116, 0.5) 0%, rgba(232, 200, 116, 0.16) 45%, transparent 70%);
  pointer-events: none; /* 不扩大拖拽命中区 */
}

.sp-swing {
  position: relative; /* ::before 定位锚点（transform 本身也是包含块，显式更稳） */
  display: flex;
  flex-direction: column;
  align-items: center;
  transform-origin: 50% 0;
  will-change: transform;
}

.sp-swing.draggable {
  pointer-events: auto;
  cursor: grab;
  touch-action: none;
}

.sp-swing.draggable:active {
  cursor: grabbing;
}

.sp-chain {
  width: 2px;
  height: 46px;
  background: linear-gradient(180deg, var(--text-muted), #b98f3e);
  border-radius: 1px;
}

.sp-star {
  width: 44px;
  height: 44px;
  margin-top: -2px;
}

/* 减弱动效：静止，也不可拖 */
.star-pendant.static .sp-swing {
  transform: rotate(0.12rad);
}
</style>
