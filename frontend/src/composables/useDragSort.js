/* ═══════════════════════════════════════
   useDragSort.js — Pointer Events 拖拽排序
   鼠标 + 触屏统一：按下移动超过 6px 进入拖拽，
   否则放行点击（保持整卡点击切换完成）。
   悬浮副本与插入指示线由父组件用 Teleport 渲染，
   位置更新走 DOM style 直写（cloneRef/indicatorRef），
   不再经响应式 ref —— 拖拽期间父组件零重渲染。
   ═══════════════════════════════════════ */
import { ref, nextTick, onMounted, onUnmounted } from 'vue'

/**
 * @param {Object} options
 * @param {Ref} options.containerRef 行容器（行需带 data-bid，钉时块行带 data-pinned="1"）
 * @param {Ref} options.cloneRef    悬浮副本元素（fixed，Teleport 到 body）
 * @param {Ref} options.indicatorRef 插入指示线元素（fixed，Teleport 到 body）
 * @param {Function} options.onDrop  (dragId, target) => void；target = { beforeId } | { onId }
 */
export function useDragSort({ containerRef, cloneRef, indicatorRef, onDrop }) {
  const THRESHOLD = 6      // 拖拽激活阈值（px），阈值内抬起视为点击
  const HOLD_MS = 280      // 触屏长按就位时长（ms）：先移动 = 让位原生滚动，先长按 = 拖拽
  const EDGE = 64          // 视口边缘自动滚动触发带（px）
  const SCROLL_STEP = 14   // 自动滚动步长（px/帧）

  const dragging = ref(false)
  const dragId = ref(null)

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

  /* 拖拽帧状态（非响应式，直写 DOM）：副本位置 + 行矩形缓存 */
  const cloneState = { left: 0, top: 0, width: 0 }
  let rectsCache = null
  let rectsDirty = true

  /* 所有可拖拽块行的视口矩形。
     拖拽期间布局不变 → 缓存复用，避免每次 pointermove 强制 layout；
     仅拖拽开始与自动滚动后（dirty）重取 */
  function rowRects() {
    if (rectsCache && !rectsDirty) return rectsCache
    const root = containerRef.value
    if (!root) return []
    rectsCache = [...root.querySelectorAll('.flow-row[data-bid]')]
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
    rectsDirty = false
    return rectsCache
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

  function renderClone() {
    const el = cloneRef && cloneRef.value
    if (!el) return
    el.style.left = cloneState.left + 'px'
    el.style.top = cloneState.top + 'px'
    el.style.width = cloneState.width + 'px'
  }

  function renderIndicator(t) {
    const el = indicatorRef && indicatorRef.value
    if (!el) return
    if (!t) {
      el.style.display = 'none'
      return
    }
    const mode = t.onId ? 'pin' : 'gap'
    if (el.dataset.mode !== mode) {
      /* 模式切换（间隙 ↔ 钉住）才改 class/图标，避免每帧 DOM 写 */
      el.dataset.mode = mode
      el.className = 'drop-indicator di-' + mode
      const icon = el.firstElementChild
      if (icon) icon.textContent = mode === 'pin' ? '📌' : '↕'
    }
    el.style.display = ''
    el.style.left = t.left + 'px'
    el.style.top = t.top + 'px'
    el.style.width = t.width + 'px'
    el.style.height = t.onId ? t.height + 'px' : '0px'
  }

  function updateDrag(y) {
    cloneState.top = y - grabOffsetY
    renderClone()
    const t = computeTarget(y)
    target = t
    renderIndicator(t)
  }

  function stopAutoScroll() {
    if (scrollTimer) {
      clearInterval(scrollTimer)
      scrollTimer = null
    }
  }

  /* 距视口上下边缘 <64px 时自动滚动页面，滚动后标记矩形缓存失效再重算落点
     （滚动写与布局读不在同一帧交替，避免 layout thrashing） */
  function autoScroll(y) {
    if (y < EDGE || y > window.innerHeight - EDGE) {
      if (scrollTimer) return
      const dir = y < EDGE ? -1 : 1
      scrollTimer = setInterval(() => {
        window.scrollBy(0, dir * SCROLL_STEP)
        rectsDirty = true
        updateDrag(lastY)
      }, 32)
    } else {
      stopAutoScroll()
    }
  }

  function activate(e) {
    dragging.value = true
    dragId.value = pendingId
    rectsDirty = true
    const root = containerRef.value
    const row = root && root.querySelector(`.flow-row[data-bid="${pendingId}"]`)
    if (row) {
      const r = row.getBoundingClientRect()
      grabOffsetY = startY - r.top
      cloneState.left = r.left
      cloneState.top = e.clientY - grabOffsetY
      cloneState.width = r.width
      row.classList.add('drag-src')
    }
    /* 副本/指示线元素由 v-if="dragging" 挂载，待 DOM 就绪后直写定位 */
    nextTick(renderClone)
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
    rectsCache = null
    rectsDirty = true
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

  return { dragging, dragId }
}

export default useDragSort
