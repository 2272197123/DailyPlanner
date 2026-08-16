/* ═══════════════════════════════════════
   useCardTilt.js — 任务卡 3D 倾斜 + 鼠标眩光
   参考 ref-cowardly-eagle（uiverse, MIT）的观感，用 JS pointermove
   替代 9 区 tracker DOM 方案（卡片内容可点击，tracker 会拦截事件）。

   启用条件（挂载时一次性判定，同 App.vue orbsDisabled 模式）：
   - matchMedia '(hover: hover)' —— 触屏/移动端完全不注册监听器
   - 非 prefers-reduced-motion
   不满足则零监听器、零开销，卡片视觉静态完整。

   性能：只写 transform/opacity（合成属性）；pointermove 经 rAF 合并
   （非常驻循环，仅在悬停移动期间逐帧）；元素矩形在悬停后首个
   pointermove 时缓存，scroll/resize 置脏，避免每帧 layout 读。
   ═══════════════════════════════════════ */
import { onMounted, onBeforeUnmount } from 'vue'

const MAX_TILT = 6       // 最大倾角（deg），小幅不晕眩
const GLARE_RANGE = 0.45 // 眩光最大位移 = 卡片宽/高 × 该值

/**
 * @param {Ref} tiltRef  倾斜外层容器（transform: perspective + rotateX/Y）
 * @param {Ref} glareRef 眩光层（transform 跟随鼠标，无 transition 即时跟随）
 * @param {Object} options
 * @param {Ref} options.paused 为 true 时忽略移动（翻面星轨轮盘期间）
 */
export function useCardTilt(tiltRef, glareRef, { paused } = {}) {
  let tiltEl = null
  let rect = null
  let rectDirty = true
  let raf = 0
  let px = 0.5
  let py = 0.5
  let hovering = false

  /* 眩光层在 v-if 的正面卡内，翻面换面会卸载重建 → 每次直读 ref，不缓存元素 */
  function apply() {
    raf = 0
    if (!tiltEl) return
    const rx = (0.5 - py) * 2 * MAX_TILT
    const ry = (px - 0.5) * 2 * MAX_TILT
    tiltEl.style.transform =
      'perspective(900px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg)'
    const glare = glareRef && glareRef.value
    if (glare && rect) {
      glare.style.transform =
        'translate(' + ((px - 0.5) * rect.width * GLARE_RANGE).toFixed(1) + 'px,' +
        ((py - 0.5) * rect.height * GLARE_RANGE).toFixed(1) + 'px)'
    }
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(apply)
  }

  function onPointerMove(e) {
    /* 可 hover 设备上仍可能有触屏（二合一）：触摸移动不倾斜，
       避免干扰触屏长按拖拽（useDragSort 280ms 长按） */
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return
    if (paused && paused.value) return
    /* 拖拽中源行半透明占位（.drag-src），幽灵卡不倾斜 */
    if (tiltEl.closest('.drag-src')) return
    if (rectDirty || !rect) {
      rect = tiltEl.getBoundingClientRect()
      rectDirty = false
    }
    if (!rect.width || !rect.height) return
    px = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1)
    py = Math.min(Math.max((e.clientY - rect.top) / rect.height, 0), 1)
    if (!hovering) {
      hovering = true
      tiltEl.classList.add('tilting') // CSS：缩短 transition 跟手 + 眩光淡入
    }
    schedule()
  }

  function resetTilt() {
    hovering = false
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    if (tiltEl) {
      tiltEl.classList.remove('tilting')
      tiltEl.style.transform = '' /* 清空内联 transform，避免成为 fixed 后代包含块 */
    }
    const glare = glareRef && glareRef.value
    if (glare) glare.style.transform = ''
  }

  function markDirty() {
    rectDirty = true
  }

  onMounted(() => {
    const noHover = !window.matchMedia('(hover: hover)').matches
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (noHover || reduced) return
    tiltEl = tiltRef.value
    if (!tiltEl) return
    tiltEl.addEventListener('pointermove', onPointerMove)
    tiltEl.addEventListener('pointerleave', resetTilt)
    window.addEventListener('scroll', markDirty, { passive: true })
    window.addEventListener('resize', markDirty)
  })

  onBeforeUnmount(() => {
    if (raf) cancelAnimationFrame(raf)
    if (tiltEl) {
      tiltEl.removeEventListener('pointermove', onPointerMove)
      tiltEl.removeEventListener('pointerleave', resetTilt)
    }
    window.removeEventListener('scroll', markDirty)
    window.removeEventListener('resize', markDirty)
  })

  return { resetTilt }
}

export default useCardTilt
