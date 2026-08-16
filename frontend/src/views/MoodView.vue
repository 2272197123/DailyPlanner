<script>
/* 模块级会话标志：MoodView 非 keep-alive，路由往返重挂载时不再重播帘幕 */
let curtainPlayedThisSession = false
</script>

<script setup>
/* ═══════════════════════════════════════
   MoodView.vue — 心情页（塔罗药剂主题）
   四个视图：当日（许愿瓶+吐槽录入）/ 近7天 / 近一月 / 年历。
   selectedDate 贯通：当日/录入/删除都作用于选中日期。
   首次进页播放丝绒帘开幕（每会话一次），顶部星星吊坠钟摆，背景环境星尘。
   ═══════════════════════════════════════ */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MoodGrid from '@/components/mood/MoodGrid.vue'
import WishingBottle from '@/components/mood/WishingBottle.vue'
import VentComposer from '@/components/mood/VentComposer.vue'
import MoodWeek from '@/components/mood/MoodWeek.vue'
import MoodMonth from '@/components/mood/MoodMonth.vue'
import StarPendant from '@/components/mood/StarPendant.vue'
import CurtainReveal from '@/components/mood/CurtainReveal.vue'
import { useMoodStore, MOOD_PRESETS } from '@/stores/mood'
import { useToastStore } from '@/stores/toast'
import { toLocalDate } from '@/utils/format'
import { prefersReducedMotion } from '@/composables/useAnime'

const moodStore = useMoodStore()
const toastStore = useToastStore()

/* ── 视图切换 ── */
const TABS = [
  { id: 'day', label: '当日' },
  { id: 'week', label: '近 7 天' },
  { id: 'month', label: '近一月' },
  { id: 'year', label: '年历' }
]
const tab = ref('day')

const currentYear = ref(new Date().getFullYear())
const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i)

/* ── 选中日期（当日视图 & 录入作用对象）── */
const selectedDate = ref(toLocalDate(new Date()))

const isToday = computed(() => selectedDate.value === moodStore.today)

const selectedLabel = computed(() => {
  const d = new Date(selectedDate.value + 'T00:00:00')
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`
})

const selectedVents = computed(() => moodStore.getVents(selectedDate.value))
const selectedColor = computed(() => moodStore.dayColor(selectedDate.value))

function shiftDay(delta) {
  const d = new Date(selectedDate.value + 'T00:00:00')
  d.setDate(d.getDate() + delta)
  const next = toLocalDate(d)
  if (next > moodStore.today) return  // 不穿越到未来
  selectedDate.value = next
}

function selectDate(date) {
  selectedDate.value = date
  tab.value = 'day'
}

async function onRemoveVent(vent) {
  try {
    await moodStore.removeVent(selectedDate.value, vent.id)
    toastStore.ok('已倒掉这层药剂')
  } catch {
    toastStore.err('删除失败，请稍后重试')
  }
}

function fmtVentTime(vent) {
  const ts = String(vent.created_at || '')
  return ts.length >= 16 ? ts.slice(11, 16) : ''
}

/* ── 动效降级判定（setup 时一次即可）：星尘粒子数 / 帘幕跳过共用 ── */
const reduced = prefersReducedMotion()
const isMobile = window.matchMedia('(max-width: 768px)').matches

/* ── 帘子开幕：每会话只播一次；移动端 / reduced-motion 直接跳过
     （CurtainReveal 内还有 CSS display:none 兜底，照 App.vue orb 模式）── */
const curtainOn = ref(false)
onMounted(() => {
  if (curtainPlayedThisSession || reduced || isMobile) return
  curtainPlayedThisSession = true
  curtainOn.value = true
})

/* ── 环境星尘（少量慢速漂浮；reduced-motion 不渲染）── */
/* 移动端粒子数降到 8（fixed 无限动画 span 在老 GPU 上很贵） */
const dust = Array.from({ length: isMobile ? 8 : 24 }, (_, i) => ({
  left: (i * 41 + 13) % 100,
  top: (i * 29 + 7) % 100,
  size: 8 + ((i * 7) % 10),
  dur: 7 + (i % 5) * 2.2,
  delay: (i * 0.7) % 6,
  char: i % 3 === 2 ? '·' : (i % 2 ? '✦' : '✧')
}))

/* 页面隐藏时暂停星尘动画（animation-play-state），回前台恢复 */
const pageHidden = ref(document.hidden)
function onVisibility() {
  pageHidden.value = document.hidden
}
onMounted(() => document.addEventListener('visibilitychange', onVisibility))
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibility))
</script>

<template>
  <div class="mood-view">
    <CurtainReveal v-if="curtainOn" @done="curtainOn = false" />

    <!-- 环境星尘：fixed + Teleport，不挡交互；仅当日 tab 挂载，切走即销毁 -->
    <Teleport to="body">
      <div v-if="!reduced && tab === 'day'" class="mood-stardust" :class="{ 'dust-paused': pageHidden }" aria-hidden="true">
        <span
          v-for="(s, i) in dust"
          :key="i"
          class="ms-particle"
          :style="{
            left: s.left + 'vw',
            top: s.top + 'vh',
            fontSize: s.size + 'px',
            animationDuration: s.dur + 's',
            animationDelay: s.delay + 's'
          }"
        >{{ s.char }}</span>
      </div>
    </Teleport>

    <header class="page-header">
      <div>
        <h1 class="page-title">心情许愿瓶</h1>
        <p class="page-subtitle">把每天的情绪倒进瓶中，颜色会替你记住</p>
      </div>
      <div class="tab-select">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="year-btn"
          :class="{ active: tab === t.id }"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>
    </header>

    <!-- ══ 当日 ══ -->
    <template v-if="tab === 'day'">
      <section class="mood-section card day-stage">
        <StarPendant />

        <div class="day-nav">
          <button class="day-nav-btn" @click="shiftDay(-1)">‹ 前一天</button>
          <div class="day-nav-title">
            <span class="day-nav-date">{{ selectedLabel }}</span>
            <span v-if="isToday" class="day-today-badge">今天</span>
            <button v-else class="day-back" @click="selectedDate = moodStore.today">回到今天</button>
          </div>
          <button class="day-nav-btn" :disabled="isToday" @click="shiftDay(1)">后一天 ›</button>
        </div>

        <div class="day-body">
          <div class="day-bottle">
            <WishingBottle :vents="selectedVents" />
            <div v-if="selectedColor" class="day-color">
              <span class="day-color-dot" :style="{ backgroundColor: selectedColor }"></span>
              <span class="day-color-hex">{{ selectedColor }}</span>
              <span class="day-color-hint">{{ selectedVents.length ? `${selectedVents.length} 条吐槽混合` : '预设心情色' }}</span>
            </div>
            <div v-else class="day-color">
              <span class="day-color-hint">今天还是空瓶，倒第一条药剂吧</span>
            </div>
          </div>

          <div class="day-side">
            <VentComposer :date="selectedDate" />

            <div v-if="selectedVents.length" class="vent-list">
              <div
                v-for="v in selectedVents"
                :key="v.id"
                class="vent-item"
              >
                <span class="vent-dot" :style="{ backgroundColor: v.color }"></span>
                <span class="vent-text">{{ v.text }}</span>
                <span class="vent-time">{{ fmtVentTime(v) }}</span>
                <button class="vent-del" title="删除这条吐槽" @click="onRemoveVent(v)">×</button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>

    <!-- ══ 近 7 天 ══ -->
    <section v-else-if="tab === 'week'" class="mood-section card">
      <MoodWeek @select="selectDate" />
    </section>

    <!-- ══ 近一月 ══ -->
    <section v-else-if="tab === 'month'" class="mood-section card">
      <MoodMonth @select="selectDate" />
    </section>

    <!-- ══ 年历 ══ -->
    <template v-else>
      <div class="year-row">
        <div class="year-select">
          <button
            v-for="year in years"
            :key="year"
            class="year-btn"
            :class="{ active: year === currentYear }"
            @click="currentYear = year"
          >
            {{ year }}
          </button>
        </div>
      </div>

      <section class="mood-section card">
        <MoodGrid :year="currentYear" />
      </section>

      <section class="mood-legend card">
        <h3 class="legend-title">图例</h3>
        <div class="legend-items">
          <div class="legend-item">
            <span class="legend-dot" style="background-color: var(--bg-muted)"></span>
            <span class="legend-label">无记录</span>
          </div>
          <div v-for="p in MOOD_PRESETS" :key="p.id" class="legend-item">
            <span class="legend-dot" :style="{ backgroundColor: p.color }"></span>
            <span class="legend-label">{{ p.label }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.mood-view {
  position: relative;
  max-width: 1100px;
  margin: 0 auto;
}

@media (min-width: 1440px) {
  .mood-view {
    max-width: 1240px;
  }
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.page-title {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.page-subtitle {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.tab-select,
.year-select {
  display: flex;
  gap: var(--space-1);
  background: var(--bg-muted);
  padding: 4px;
  border-radius: var(--radius-md);
}

.year-row {
  display: flex;
  justify-content: flex-end;
  margin-bottom: var(--space-4);
}

.year-btn {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  transition: all var(--duration-fast) var(--ease-out);
}

.year-btn:hover {
  color: var(--text-primary);
}

.year-btn.active {
  background: var(--bg-elevated);
  color: var(--accent);
  box-shadow: var(--shadow-sm);
}

.mood-section {
  padding: var(--space-6);
  margin-bottom: var(--space-6);
  overflow-x: auto;
}

/* ── 当日视图 ── */
.day-stage {
  position: relative;
  padding-top: calc(var(--space-6) + 96px); /* 给吊坠留摆动的空间 */
  overflow-x: visible;
}

.day-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-5);
}

.day-nav-btn {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  background: var(--bg-muted);
  transition: color var(--duration-fast) var(--ease-out);
}

.day-nav-btn:hover:not(:disabled) {
  color: var(--text-primary);
}

.day-nav-btn:disabled {
  opacity: 0.4;
}

.day-nav-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.day-nav-date {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  color: var(--text-primary);
}

.day-today-badge {
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--accent-muted);
  color: var(--accent);
  font-size: var(--text-xs);
  font-weight: 600;
}

.day-back {
  font-size: var(--text-xs);
  color: var(--accent);
  text-decoration: underline;
}

.day-body {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: var(--space-6);
  align-items: start;
}

.day-bottle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.day-color {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.day-color-dot {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-full);
  box-shadow: 0 0 10px currentColor;
}

.day-color-hex {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.day-color-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.day-side {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

/* ── 吐槽列表 ── */
.vent-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.vent-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  background: var(--bg-muted);
}

.vent-dot {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full);
}

.vent-text {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
  word-break: break-all;
}

.vent-time {
  flex-shrink: 0;
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.vent-del {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  border-radius: var(--radius-full);
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  transition: all var(--duration-fast) var(--ease-out);
}

.vent-del:hover {
  background: var(--danger-bg);
  color: var(--danger);
}

/* ── 年历图例 ── */
.mood-legend {
  padding: var(--space-5);
}

.legend-title {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  margin-bottom: var(--space-4);
  color: var(--text-primary);
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-4);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.legend-dot {
  width: 14px;
  height: 14px;
  border-radius: 4px;
}

/* ── 环境星尘 ── */
.mood-stardust {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.ms-particle {
  position: absolute;
  color: var(--accent);
  opacity: 0.14;
  will-change: transform;
  animation: ms-float 9s ease-in-out infinite alternate;
}

/* 页面隐藏时暂停全部粒子动画 */
.mood-stardust.dust-paused .ms-particle {
  animation-play-state: paused;
}

@keyframes ms-float {
  from { transform: translate(0, 0) scale(0.9); }
  to { transform: translate(14px, -26px) scale(1.15); }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }

  .day-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .day-stage {
    padding-top: calc(var(--space-6) + 80px);
  }
}
</style>
