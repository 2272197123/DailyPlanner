<script setup>
/* ═══════════════════════════════════════
   StarDateBar.vue — 星历横条日期选择器
   横向惯性滚动日条：每格星期字符 + 日期数字 + 星座符号，
   今天发光、选中描金；头部显示月份与月相装饰。
   范围：选中月 ±1 月。
   ═══════════════════════════════════════ */
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { toLocalDate } from '@/utils/format'

const props = defineProps({
  modelValue: { type: String, default: '' } // 'YYYY-MM-DD'
})

const emit = defineEmits(['update:modelValue'])

const stripRef = ref(null)

const todayStr = toLocalDate(new Date())

const WEEK_CHARS = ['日', '一', '二', '三', '四', '五', '六']
const ZODIAC = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓']

/* 近似月相（8 态，纯装饰） */
function moonPhase(dateStr) {
  const base = Date.UTC(2000, 0, 6, 18, 14) // 已知朔时刻
  const days = (new Date(dateStr + 'T00:00:00').getTime() - base) / 86400000
  const phase = ((days % 29.530588) + 29.530588) % 29.530588
  const idx = Math.round((phase / 29.530588) * 8) % 8
  return ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'][idx]
}

const selected = computed(() => props.modelValue || todayStr)

const headLabel = computed(() => {
  const d = new Date(selected.value + 'T00:00:00')
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月'
})

const moon = computed(() => moonPhase(selected.value))

/* 生成选中月 ±1 月的日期格 */
const days = computed(() => {
  const d = new Date(selected.value + 'T00:00:00')
  const first = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  const last = new Date(d.getFullYear(), d.getMonth() + 2, 0)
  const out = []
  for (let cur = new Date(first); cur <= last; cur.setDate(cur.getDate() + 1)) {
    const dateStr = toLocalDate(cur)
    const dayOfYear = Math.floor((cur - new Date(cur.getFullYear(), 0, 0)) / 86400000)
    out.push({
      dateStr,
      day: cur.getDate(),
      monthLabel: cur.getDate() === 1 ? (cur.getMonth() + 1) + '月' : '',
      week: WEEK_CHARS[cur.getDay()],
      zodiac: ZODIAC[dayOfYear % 12],
      isToday: dateStr === todayStr
    })
  }
  return out
})

function pick(d) {
  emit('update:modelValue', d.dateStr)
}

/* 挂载后把选中格滚到视口中部 */
onMounted(() => {
  nextTick(() => {
    const strip = stripRef.value
    if (!strip) return
    const cell = strip.querySelector('.sdb-cell.selected')
    if (cell) {
      strip.scrollLeft = cell.offsetLeft - strip.clientWidth / 2 + cell.clientWidth / 2
    }
  })
})

/* ── 桌面拖拽滚动 + 惯性；移动 <6px 视为点击 ── */
let downX = 0
let scrollStart = 0
let lastX = 0
let lastT = 0
let velo = 0
let moved = false
let inertiaRaf = null

function stopInertia() {
  if (inertiaRaf) {
    cancelAnimationFrame(inertiaRaf)
    inertiaRaf = null
  }
}

function onDown(e) {
  const strip = stripRef.value
  if (!strip) return
  stopInertia()
  downX = e.clientX
  lastX = e.clientX
  lastT = performance.now()
  scrollStart = strip.scrollLeft
  moved = false
  /* 不在 down 时 capture：否则 pointerup 被重定向到 strip，日期格 click 永不触发 */
}

function onMove(e) {
  if (!downX && !moved) return
  const strip = stripRef.value
  if (!strip) return
  const dx = e.clientX - downX
  if (!moved && Math.abs(dx) < 6) return
  if (!moved) {
    /* 确认拖拽后才 capture，保留未拖动时的 click 选日期 */
    strip.setPointerCapture && strip.setPointerCapture(e.pointerId)
  }
  moved = true
  strip.scrollLeft = scrollStart - dx
  const now = performance.now()
  const dt = now - lastT
  if (dt > 0) {
    velo = ((lastX - e.clientX) / dt) * 16
    lastX = e.clientX
    lastT = now
  }
}

function onUp() {
  if (!moved) {
    downX = 0
    return
  }
  downX = 0
  /* 吞掉拖拽后的 click，避免误选日期 */
  const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault() }
  window.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 350)
  /* 惯性衰减 */
  const strip = stripRef.value
  if (!strip) return
  const step = () => {
    if (Math.abs(velo) < 0.5) { inertiaRaf = null; return }
    strip.scrollLeft += velo
    velo *= 0.94
    inertiaRaf = requestAnimationFrame(step)
  }
  inertiaRaf = requestAnimationFrame(step)
}

onUnmounted(stopInertia)
</script>

<template>
  <div class="star-date-bar">
    <div class="sdb-head">
      <span class="sdb-month">{{ headLabel }}</span>
      <span class="sdb-moon">{{ moon }} 月相</span>
    </div>
    <div
      ref="stripRef"
      class="sdb-strip"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
    >
      <button
        v-for="d in days"
        :key="d.dateStr"
        type="button"
        class="sdb-cell"
        :class="{ today: d.isToday, selected: d.dateStr === selected }"
        :data-date="d.dateStr"
        @click="pick(d)"
      >
        <span class="sdb-week">{{ d.monthLabel || d.week }}</span>
        <span class="sdb-day">{{ d.day }}</span>
        <span class="sdb-zodiac">{{ d.zodiac }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.star-date-bar {
  width: 100%;
}

.sdb-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-1);
}

.sdb-month {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-secondary);
}

.sdb-moon {
  font-size: 10px;
  color: var(--text-muted);
}

.sdb-strip {
  display: flex;
  gap: var(--space-1);
  overflow-x: auto;
  padding: var(--space-1);
  scrollbar-width: thin;
  user-select: none;
  -webkit-user-select: none;
  /* 两侧渐隐 */
  -webkit-mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);
  mask-image: linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent);
}

.sdb-cell {
  flex-shrink: 0;
  width: 46px;
  padding: var(--space-1) 0 var(--space-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  transition: border-color var(--duration-fast) var(--ease-out),
              background var(--duration-fast) var(--ease-out);
}

.sdb-cell:hover { background: var(--bg-muted); }

.sdb-week {
  font-size: 9px;
  color: var(--text-muted);
}

.sdb-day {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--text-primary);
}

.sdb-zodiac {
  font-size: 10px;
  color: var(--accent);
  opacity: 0.75;
}

/* 今天发光 */
.sdb-cell.today {
  border-color: var(--accent);
  box-shadow: 0 0 8px var(--accent-muted), 0 0 3px var(--accent);
  animation: sdb-today-glow 2.4s ease-in-out infinite;
}

@keyframes sdb-today-glow {
  0%, 100% { box-shadow: 0 0 4px var(--accent-muted); }
  50% { box-shadow: 0 0 12px var(--accent-muted), 0 0 4px var(--accent); }
}

/* 选中描金 */
.sdb-cell.selected {
  border-color: var(--accent);
  background: var(--accent-muted);
}
</style>
