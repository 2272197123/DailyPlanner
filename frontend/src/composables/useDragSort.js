/* ═══════════════════════════════════════
   useDragSort.js — Pointer Events 拖拽排序
   鼠标 + 触屏统一：按下移动超过 6px 进入拖拽，
   否则放行点击（保持整卡点击切换完成）。
   悬浮副本与插入指示线由父组件用 Teleport 渲染，
   本 composable 只暴露位置状态。
   ═══════════════════════════════════════ */
import { ref, onMounted, onUnmounted } from 'vue'

/**
 * @param {Object} options
 * @param {Ref} options.containerRef 行容器（行需带 data-bid，钉时块行带 data-pinned="1"）
 * @param {Function} options.onDrop  (dragId, target) => void；target = { beforeId } | { onId }
 */
export function useDragSort({ containerRef, onDrop }) {
  const THRESHOLD = 6      // 拖拽激活阈值（px），阈值内抬起视为点击
  const HOLD_MS = 280      // 触屏长按就位时长（ms）：先移动 = 让位原生滚动，先长按 = 拖拽
  const EDGE = 64          // 视口边缘自动滚动触发带（px）
  const SCROLL_STEP = 14   // 自动滚动步长（px/帧）

  const dragging = ref(false)
  const dragId = ref(null)
  const clonePos = ref({ left: 0, top: 0, width: 0 })
  const indicator = ref({ show: false, mode: 'gap', top: 0, left: 0, width: 0, height: 0 })

  let pendingId = null
  let startX = 0
  let startY = 0
  let grabOffsetY = 0
  let lastY = 0
  let target = null
  let scrollTimer = null
  let touchMoveHandler = null
  let isTouch = false   // 本次手势为触屏
  let armed = false     // 触屏长按已就位（就位后移动才进入拖拽）
  let holdTimer = null

  /* 所有可拖拽块行的视口矩形（每次移动重取：块数 <50 开销可忽略，自动滚动后仍准确） */
  function rowRects() {
    const root = containerRef.value
    if (!root) return []
    return [...root.querySelectorAll('.flow-row[data-bid]')]
      .filter(el => el.dataset.bid !== dragId.value)
      .map(el => {
        const r = el.getBoundingClientRect()
        return {
          id: el.dataset.bid,
          pinned: el.dataset.pinned === '1',
          top: r.top,
          bottom: r.bottom,
          mid: (r.top + r.bottom) / 2,
          left: r.left,
          width: r.width
        }
      })
  }

  /* 指针位置 → 落点：落在钉时块身上 = 钉住；其余（含 routine/now 行附近）映射到最近块间隙 */
  function computeTarget(y) {
    const rects = rowRects()
    if (!rects.length) return null
    for (const r of rects) {
      if (r.pinned && y > r.top + 6 && y < r.bottom - 6) {
        return { onId: r.id, top: r.top, left: r.left, width: r.width, height: r.bottom - r.top }
      }
    }
    for (const r of rects) {
      if (y < r.mid) return { beforeId: r.id, top: r.top, left: r.left, width: r.width, height: 0 }
    }
    const last = rects[rects.length - 1]
    return { beforeId: null, top: last.bottom, left: last.left, width: last.width, height: 0 }
  }

  function updateDrag(y) {
    clonePos.value = { ...clonePos.value, top: y - grabOffsetY }
    const t = computeTarget(y)
    target = t
    if (t) {
      indicator.value = {
        show: true,
        mode: t.onId ? 'pin' : 'gap',
        top: t.top,
        left: t.left,
        width: t.width,
        height: t.height
      }
    } else {
      indicator.value = { ...indicator.value, show: false }
    }
  }

  function stopAutoScroll() {
    if (scrollTimer) {
      clearInterval(scrollTimer)
      scrollTimer = null
    }
  }

  /* 距视口上下边缘 <64px 时自动滚动页面，滚动后重算落点 */
  function autoScroll(y) {
    if (y < EDGE || y > window.innerHeight - EDGE) {
      if (scrollTimer) return
      const dir = y < EDGE ? -1 : 1
      scrollTimer = setInterval(() => {
        window.scrollBy(0, dir * SCROLL_STEP)
        updateDrag(lastY)
      }, 32)
    } else {
      stopAutoScroll()
    }
  }

  function activate(e) {
    dragging.value = true
    dragId.value = pendingId
    const root = containerRef.value
    const row = root && root.querySelector(`.flow-row[data-bid="${pendingId}"]`)
    if (row) {
      const r = row.getBoundingClientRect()
      grabOffsetY = startY - r.top
      clonePos.value = { left: r.left, top: e.clientY - grabOffsetY, width: r.width }
      row.classList.add('drag-src')
    }
    /* 拖拽中禁止文本选中 */
    document.body.style.userSelect = 'none'
  }

  function onPointerDown(e) {
    if (e.button !== undefined && e.button > 0) return
    const row = e.target.closest && e.target.closest('.flow-row[data-bid]')
    if (!row) return
    /* 交互控件与翻面背面/编辑浮层上不启动拖拽 */
    if (e.target.closest('button, input, select, textarea, a, .tc-back, .card-edit-overlay')) return
    pendingId = row.dataset.bid
    startX = e.clientX
    startY = e.clientY
    lastY = e.clientY
    /* 触屏：长按就位才允许拖拽，先移动则让位原生滚动（pan-y 下整块卡片仍需可滚动页面） */
    isTouch = e.pointerType === 'touch'
    armed = !isTouch
    if (isTouch) {
      holdTimer = setTimeout(() => { holdTimer = null; armed = true }, HOLD_MS)
    }
    window.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    /* 触屏兜底：进入拖拽态后 preventDefault，阻止浏览器滚动接管手势 */
    touchMoveHandler = (ev) => { if (dragging.value && ev.cancelable) ev.preventDefault() }
    window.addEventListener('touchmove', touchMoveHandler, { passive: false })
  }

  /* 触屏手势在长按就位前先移动 → 放弃本次拖拽，交还浏览器原生滚动 */
  function abortPending() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    if (touchMoveHandler) {
      window.removeEventListener('touchmove', touchMoveHandler)
      touchMoveHandler = null
    }
    pendingId = null
    isTouch = false
    armed = false
  }

  function onPointerMove(e) {
    if (pendingId === null && !dragging.value) return
    lastY = e.clientY
    if (!dragging.value) {
      if (isTouch && !armed) {
        /* 长按计时未到就移动：判定为滚动意图 */
        if (Math.abs(e.clientX - startX) >= THRESHOLD || Math.abs(e.clientY - startY) >= THRESHOLD) abortPending()
        return
      }
      if (Math.abs(e.clientX - startX) < THRESHOLD && Math.abs(e.clientY - startY) < THRESHOLD) return
      activate(e)
    }
    if (e.cancelable) e.preventDefault()
    updateDrag(e.clientY)
    autoScroll(e.clientY)
  }

  /* 吞掉拖拽结束后的那次 click，避免触发整卡切换完成 */
  function swallowNextClick() {
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault() }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 350)
  }

  function onPointerUp() {
    const wasDragging = dragging.value
    const dropId = dragId.value
    const dropTarget = target
    const wasArmedTouch = isTouch && armed && !wasDragging // 长按就位但未移动：吞 click 防误切换完成
    cleanup()
    if (wasDragging && dropId && dropTarget) {
      onDrop(dropId, dropTarget)
      swallowNextClick()
    } else if (wasArmedTouch) {
      swallowNextClick()
    }
  }

  function onPointerCancel() {
    cleanup()
  }

  function cleanup() {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null }
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    if (touchMoveHandler) {
      window.removeEventListener('touchmove', touchMoveHandler)
      touchMoveHandler = null
    }
    stopAutoScroll()
    const root = containerRef.value
    if (root) root.querySelectorAll('.drag-src').forEach(el => el.classList.remove('drag-src'))
    document.body.style.userSelect = ''
    pendingId = null
    isTouch = false
    armed = false
    dragging.value = false
    dragId.value = null
    target = null
    indicator.value = { ...indicator.value, show: false }
  }

  onMounted(() => {
    if (containerRef.value) {
      containerRef.value.addEventListener('pointerdown', onPointerDown)
    }
  })

  onUnmounted(() => {
    if (containerRef.value) {
      containerRef.value.removeEventListener('pointerdown', onPointerDown)
    }
    cleanup()
  })

  return { dragging, dragId, clonePos, indicator }
}

export default useDragSort
