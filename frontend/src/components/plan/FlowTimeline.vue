<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import anime from 'animejs'
import { useScheduleStore } from '@/stores/schedule'
import { useRoutineStore } from '@/stores/routines'
import { useCurrencyStore } from '@/stores/currency'
import { useCollectionStore } from '@/stores/collection'
import { useToastStore } from '@/stores/toast'
import { toLocalDate, calcTaskReward } from '@/utils/format'
import { useAnime } from '@/composables/useAnime'
import { useDragSort } from '@/composables/useDragSort'
import { CAT_EMOJI } from '@/utils/constants'
import TaskCard from '@/components/timeline/TaskCard.vue'
import RoutineItem from '@/components/timeline/RoutineItem.vue'
import CardCelebration from '@/components/plan/CardCelebration.vue'

/* v13 纵向时间轴：从上到下排列一天的任务块与日课，
   页面滚动时背景色随视口中部的"当前主任务"平滑过渡。 */

const emit = defineEmits(['add', 'rules', 'import'])

const scheduleStore = useScheduleStore()
const routineStore = useRoutineStore()
const currencyStore = useCurrencyStore()
const collectionStore = useCollectionStore()
const toastStore = useToastStore()
const { burst } = useAnime()

const dateState = computed(() => scheduleStore.dateState)

/* ═══ 数据合并：任务块 + 固定事务 → 统一时间轴 ═══ */
function parseHM(time) {
  if (!time || typeof time !== 'string') return null
  const m = time.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

const timedRows = computed(() => {
  const date = scheduleStore.currentDate
  const rows = []
  scheduleStore.getComputedTimeline(date).forEach(b => {
    rows.push({ kind: 'block', key: 'b_' + b.id, minutes: b._startMin, payload: b })
  })
  routineStore.routinesForCurrentDate.forEach(r => {
    const minutes = parseHM(r.time)
    if (minutes === null) return // 无时间 → 归入"任意时间"组
    rows.push({ kind: 'routine', key: 'r_' + r.id, minutes, payload: r })
  })
  rows.sort((a, b) => a.minutes - b.minutes)
  return rows
})

/* 当日钉时块区间（星图拖杆磁吸避让用）：memoized 时间轴算一次，prop 下发各 TaskCard，
   避免每张卡各自全量重算时间轴（N 卡 = N 次计算）。
   指纹复用：钉时区间未变时保持数组引用不变——否则每次时间轴重算（如勾选任务）
   都生成新数组，所有 TaskCard 的 pinned prop 身份变化 → 整列重渲染，
   抵销 getComputedTimeline 行复用的收益 */
let _pinnedCache = { key: '', list: [] }
const pinnedBlocks = computed(() => {
  const pinned = scheduleStore.getComputedTimeline(scheduleStore.currentDate)
    .filter(b => b.time)
  const key = pinned.map(b => b.id + ':' + b._startMin + ':' + b._endMin).join('|')
  if (key === _pinnedCache.key) return _pinnedCache.list
  _pinnedCache = {
    key,
    list: pinned.map(b => ({ id: b.id, start: b._startMin, end: b._endMin }))
  }
  return _pinnedCache.list
})

const anytimeRoutines = computed(() =>
  routineStore.routinesForCurrentDate.filter(r => parseHM(r.time) === null)
)

/* ═══ 现在时刻线（仅今天，每分钟刷新）═══ */
const nowMin = ref(0)
const nowStr = ref('')
let nowTimer = null

function updateNow() {
  const d = new Date()
  nowMin.value = d.getHours() * 60 + d.getMinutes()
  nowStr.value = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

/* 把"现在"作为哨兵行插入排序位置 */
const rows = computed(() => {
  const list = [...timedRows.value]
  if (scheduleStore.isToday) {
    const nowRow = { kind: 'now', key: '__now__', minutes: nowMin.value }
    let idx = list.findIndex(r => r.minutes > nowMin.value)
    if (idx === -1) idx = list.length
    list.splice(idx, 0, nowRow)
  }
  return list
})

const isEmpty = computed(() =>
  !scheduleStore.todayBlocks.length && !routineStore.routinesForCurrentDate.length
)

/* ═══ 头部紧凑进度（吸收原 DayHero 职责）═══ */
const routineDoneMap = computed(() => scheduleStore.routineProgress[scheduleStore.currentDate] || {})

const stats = computed(() => {
  const date = scheduleStore.currentDate
  const blocks = scheduleStore.todayBlocks
  const routines = routineStore.routinesForCurrentDate
  const rp = routineDoneMap.value
  const done = blocks.filter(b => b.completed).length + routines.filter(r => rp[r.id]).length
  const total = blocks.length + routines.length
  return { done, total, pct: total ? Math.round(done / total * 100) : 0 }
})

const xpToday = computed(() => {
  const todayStr = toLocalDate(new Date())
  return (currencyStore.transactions || [])
    .filter(t => t.type === 'earn' && t.timestamp && toLocalDate(new Date(t.timestamp)) === todayStr)
    .reduce((s, t) => s + (t.amount || 0), 0)
})

/* ═══ 滚动变色：视口中部的当前主任务决定背景色 ═══ */
/* category → 色调（UI 元数据，非用户内容；与既有分类体系一致） */
const CATEGORY_HUES = {
  study: '74, 125, 215',
  work: '212, 136, 58',
  life: '74, 169, 108',
  health: '212, 95, 95',
  review: '138, 123, 184',
  other: '138, 143, 152'
}

const rootRef = ref(null)
const ambientColor = ref('') // rgba() 字符串；空 = 主题默认底色
const currentBlockId = ref(null)
let observer = null
const visibleRatios = new Map() // blockId → { ratio, category }

const ambientBg = computed(() => {
  if (!ambientColor.value) return 'transparent'
  return `radial-gradient(ellipse 90% 60% at 50% 30%, rgba(${ambientColor.value}, 0.14), rgba(${ambientColor.value}, 0.05) 60%, transparent)`
})

function pickCurrentBlock() {
  let best = null
  let bestRatio = 0
  for (const [id, info] of visibleRatios) {
    if (info.ratio > bestRatio) {
      bestRatio = info.ratio
      best = { id, category: info.category }
    }
  }
  currentBlockId.value = best ? best.id : null
  ambientColor.value = best ? (CATEGORY_HUES[best.category] || CATEGORY_HUES.other) : ''
}

function setupObserver() {
  if (observer) observer.disconnect()
  visibleRatios.clear()
  if (!rootRef.value || !('IntersectionObserver' in window)) {
    pickCurrentBlock()
    return
  }
  // 视口中部 10% 横带：块穿过该带时视为"当前阅读位置"
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const id = entry.target.dataset.bid
      if (!id) continue
      if (entry.isIntersecting) {
        visibleRatios.set(id, { ratio: entry.intersectionRatio, category: entry.target.dataset.cat || 'other' })
      } else {
        visibleRatios.delete(id)
      }
    }
    pickCurrentBlock()
  }, { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.5, 1] })
  rootRef.value.querySelectorAll('.flow-block-shell').forEach(el => observer.observe(el))
}

watch(rows, () => nextTick(setupObserver), { flush: 'post' })

/* ═══ 完成统计 / 全部完成庆祝 ═══ */
const allDone = computed(() => {
  const blocks = scheduleStore.todayBlocks
  const routines = routineStore.routinesForCurrentDate
  const total = blocks.length + routines.length
  if (!total) return false
  const rp = routineDoneMap.value
  return blocks.every(b => b.completed) && routines.every(r => rp[r.id])
})

const celebratedDates = new Set()
const showSeal = ref(false)
const sealRef = ref(null)

const CHEERS = [
  '今日毕，功不唐捐 🎉',
  '全部完成！给自己倒杯茶吧 🍵',
  '今日事今日毕，漂亮！',
  '完美的一天，明天见 ✨',
  '知行合一，今日圆满 🏅'
]

function celebrate() {
  const date = scheduleStore.currentDate
  celebratedDates.add(date)

  const w = window.innerWidth
  const h = window.innerHeight
  burst(w * 0.3, h * 0.35, { count: 16 })
  setTimeout(() => burst(w * 0.7, h * 0.4, { count: 16, colors: ['#4a9', '#d4a76a', '#8a7bb8'] }), 220)
  setTimeout(() => burst(w * 0.5, h * 0.28, { count: 20 }), 420)

  showSeal.value = true
  nextTick(() => {
    if (!sealRef.value) return
    anime({
      targets: sealRef.value,
      scale: [1.9, 1],
      rotate: [-16, -8],
      opacity: [0, 0.92],
      easing: 'easeOutElastic(1, .5)',
      duration: 900
    })
    setTimeout(() => {
      if (!sealRef.value) return
      anime({
        targets: sealRef.value,
        opacity: [0.92, 0],
        translateY: [0, -12],
        easing: 'easeInQuad',
        duration: 600,
        complete: () => { showSeal.value = false }
      })
    }, 2200)
  })

  toastStore.ok(CHEERS[Math.floor(Math.random() * CHEERS.length)])
}

function maybeCelebrate() {
  if (allDone.value && !celebratedDates.has(scheduleStore.currentDate)) {
    celebrate()
  }
}

/* ═══ 勾选完成（XP 防刷分 + 卡牌庆祝 + 掉卡）═══ */
const celebrationRef = ref(null)

function playCelebration(block, reward, event) {
  /* CardCelebration.play 返回完成 Promise（动画播完 resolve） */
  return celebrationRef.value?.play({
    x: event?.clientX,
    y: event?.clientY,
    subject: block?.subject || '',
    emoji: CAT_EMOJI[block?.category] || '📌',
    reward
  })
}

/* 掉卡链路（v16）：与 XP award/revoke 完全独立——取消完成不回收卡、
   重复完成不重复掉（服务端按 `{date}:{blockId}` 幂等）。
   揭示动效排在完成庆祝之后，避免两个全屏 overlay 叠播。 */
function drawCardForBlock(date, blockId, celebrationDone) {
  const drawP = collectionStore.drawFromTask(date, blockId)
  Promise.all([drawP, celebrationDone]).then(([res]) => {
    if (!res) return
    if (!res.duplicate && res.card) {
      collectionStore.enqueueReveal({ card: res.card, achievements: res.newAchievements })
    } else if ((res.newAchievements || []).length) {
      collectionStore.enqueueReveal({ achievements: res.newAchievements })
    }
  })
}

function handleToggleTask(blockId, event) {
  const date = scheduleStore.currentDate
  const completed = scheduleStore.toggleBlockDone(date, blockId)
  if (completed === undefined) return
  const block = scheduleStore.todayBlocks.find(b => b.id === blockId)
  if (completed) {
    let reward = 0
    const r = block ? calcTaskReward(block) * 5 : 0
    if (r && scheduleStore.awardOnce(date, 'block_' + blockId, r)) {
      reward = r
      currencyStore.addXP(r, '完成任务: ' + (block ? block.subject : blockId))
    }
    const celebrationDone = playCelebration(block, reward, event)
    drawCardForBlock(date, blockId, celebrationDone)
    maybeCelebrate()
  } else {
    // 取消完成：按存证金额退还 XP（无存证时回退重算，兼容旧发放）。
    // 不掉卡链路：已掉出的卡不回收（v16 设计口径，避免收集反复横跳）
    const fallback = block ? calcTaskReward(block) * 5 : 0
    const refunded = scheduleStore.revokeAward(date, 'block_' + blockId, fallback)
    if (refunded) {
      currencyStore.subtractXP(refunded, '取消完成: ' + (block ? block.subject : blockId))
    }
  }
}

function handleToggleSubtask(blockId, si, event) {
  const date = scheduleStore.currentDate
  const block = scheduleStore.todayBlocks.find(b => b.id === blockId)
  const result = scheduleStore.toggleSubtask(date, blockId, si)
  if (!result) return
  if (result.allDone) {
    let reward = 0
    const r = block ? calcTaskReward(block) * 5 : 0
    if (r && scheduleStore.awardOnce(date, 'block_' + blockId, r)) {
      reward = r
      currencyStore.addXP(r, '完成所有子任务: ' + (block ? block.subject : blockId))
    }
    const celebrationDone = playCelebration(block, reward, event)
    drawCardForBlock(date, blockId, celebrationDone)
    maybeCelebrate()
  } else {
    // 子任务从全勾变为未全勾：整体奖励已发的要退还
    const fallback = block ? calcTaskReward(block) * 5 : 0
    const refunded = scheduleStore.revokeAward(date, 'block_' + blockId, fallback)
    if (refunded) {
      currencyStore.subtractXP(refunded, '取消完成: ' + (block ? block.subject : blockId))
    }
  }
}

function onRoutineToggle() {
  maybeCelebrate()
}

/* ═══ 拖拽排序（Pointer Events，鼠标 + 触屏；见 useDragSort）═══ */
/* cloneEl/indicatorEl：副本与指示线位置由 useDragSort 直写 DOM style，
   拖拽期间 FlowTimeline 不参与每帧 patch */
const cloneEl = ref(null)
const indicatorEl = ref(null)
const { dragging, dragId } = useDragSort({
  containerRef: rootRef,
  cloneRef: cloneEl,
  indicatorRef: indicatorEl,
  onDrop: (id, target) => scheduleStore.resolveDrop(scheduleStore.currentDate, id, target)
})

/* 悬浮副本展示的块信息 */
const dragBlock = computed(() => {
  if (!dragId.value) return null
  return scheduleStore.getComputedTimeline(scheduleStore.currentDate).find(b => b.id === dragId.value) || null
})

/* ═══ 固定事务模板管理（折叠面板）═══ */
const showRoutineMgr = ref(false)
const newRoutine = ref({ icon: '', name: '', time: '' })

function syncTodayCopy() {
  const date = scheduleStore.currentDate
  if (routineStore.dailyCopies[date]) {
    routineStore.saveForDate(date, routineStore.routines)
  }
}

function addRoutineItem() {
  const name = newRoutine.value.name.trim()
  if (!name) {
    toastStore.warn('请填写名称')
    return
  }
  routineStore.addRoutine({
    id: 'rt_' + Date.now(),
    icon: newRoutine.value.icon.trim() || '🔁',
    name,
    time: newRoutine.value.time || ''
  })
  newRoutine.value = { icon: '', name: '', time: '' }
  syncTodayCopy()
  toastStore.ok('已添加固定事务')
}

function removeRoutineItem(id) {
  routineStore.removeRoutine(id)
  syncTodayCopy()
  toastStore.ok('已删除')
}

onMounted(() => {
  updateNow()
  nowTimer = setInterval(updateNow, 60000)
  nextTick(setupObserver)
})

onUnmounted(() => {
  if (nowTimer) clearInterval(nowTimer)
  if (observer) observer.disconnect()
})
</script>

<template>
  <div class="flow-timeline" :class="'state-' + dateState" ref="rootRef">
    <!-- 滚动变色背景层（固定在视口底层，随当前主任务过渡） -->
    <div class="flow-ambient" :style="{ background: ambientBg }"></div>

    <!-- 紧凑进度头 -->
    <div v-if="!isEmpty" class="flow-header">
      <div class="flow-progress">
        <span class="flow-pct">{{ stats.pct }}%</span>
        <div class="flow-track">
          <div class="flow-bar" :style="{ width: stats.pct + '%' }"></div>
        </div>
        <span class="flow-count">{{ stats.done }}/{{ stats.total }} 已完成</span>
      </div>
      <span class="flow-xp">✦ 今日 +{{ xpToday }} XP</span>
    </div>

    <!-- 空状态 -->
    <div v-if="isEmpty" class="flow-empty">
      <span class="flow-empty-icon">🍃</span>
      <p>今日本无事，庸人自扰之</p>
      <div class="flow-empty-actions">
        <button class="btn btn-secondary btn-sm" @click="emit('import')">
          ⏮ 导入前一天计划
        </button>
        <button class="btn btn-secondary btn-sm" @click="emit('rules')">🗓 固定日程</button>
        <button class="btn btn-primary btn-sm" @click="emit('add')">＋ 新任务</button>
      </div>
    </div>

    <!-- 纵向时间轴 -->
    <template v-else>
      <div
        v-for="row in rows"
        :key="row.key"
        class="flow-row"
        :class="{ 'flow-now-row': row.kind === 'now' }"
        :data-bid="row.kind === 'block' ? row.payload.id : undefined"
        :data-pinned="row.kind === 'block' && row.payload.time ? '1' : undefined"
      >
        <!-- 现在时刻线 -->
        <div v-if="row.kind === 'now'" class="flow-now">
          <span class="flow-now-time">{{ nowStr }}</span>
          <span class="flow-now-dot"></span>
          <span class="flow-now-line"></span>
        </div>

        <!-- 任务块（外壳供滚动变色观察；TaskCard 自带时间轨）-->
        <div
          v-else-if="row.kind === 'block'"
          class="flow-block-shell"
          :class="{ 'is-current': currentBlockId === row.payload.id }"
          :data-bid="row.payload.id"
          :data-cat="row.payload.category || 'other'"
        >
          <TaskCard
            :block="row.payload"
            :index="0"
            :date-state="dateState"
            :pinned="pinnedBlocks"
            @toggle="handleToggleTask"
            @toggle-subtask="(si, ev) => handleToggleSubtask(row.payload.id, si, ev)"
          />
        </div>

        <!-- 固定事务（时间轨外壳）-->
        <div v-else class="flow-routine">
          <div class="flow-rail">
            <span class="flow-rail-time">{{ row.payload.time }}</span>
            <div class="flow-rail-line"></div>
            <div class="flow-rail-dot" :class="{ done: !!routineDoneMap[row.payload.id] }"></div>
          </div>
          <div class="flow-routine-body">
            <RoutineItem
              :routine="row.payload"
              :date="scheduleStore.currentDate"
              :done="!!routineDoneMap[row.payload.id]"
              @toggle="onRoutineToggle"
            />
          </div>
        </div>
      </div>

      <!-- 任意时间组 -->
      <div v-if="anytimeRoutines.length || showRoutineMgr" class="flow-anytime">
        <div class="flow-anytime-head">
          <span class="flow-anytime-title">⏳ 任意时间</span>
          <button class="btn btn-ghost btn-sm" @click="showRoutineMgr = !showRoutineMgr">
            {{ showRoutineMgr ? '收起' : '管理' }}
          </button>
        </div>

        <div v-for="r in anytimeRoutines" :key="'ar_' + r.id" class="flow-routine anytime">
          <div class="flow-rail">
            <span class="flow-rail-time">--:--</span>
            <div class="flow-rail-line"></div>
            <div class="flow-rail-dot" :class="{ done: !!routineDoneMap[r.id] }"></div>
          </div>
          <div class="flow-routine-body">
            <RoutineItem
              :routine="r"
              :date="scheduleStore.currentDate"
              :done="!!routineDoneMap[r.id]"
              @toggle="onRoutineToggle"
            />
          </div>
        </div>
      </div>

      <!-- 固定事务模板管理面板 -->
      <div v-if="showRoutineMgr" class="flow-mgr">
        <div v-for="r in routineStore.routines" :key="'tpl_' + r.id" class="mgr-row">
          <span class="mgr-icon">{{ r.icon || '🔁' }}</span>
          <span class="mgr-name">{{ r.name }}</span>
          <span class="mgr-time">{{ r.time || '' }}</span>
          <button class="btn btn-danger btn-sm" @click="removeRoutineItem(r.id)">删除</button>
        </div>
        <p v-if="!routineStore.routines.length" class="mgr-empty">暂无预设，添加后会出现在每天的时间轴里</p>
        <div class="mgr-add">
          <input v-model="newRoutine.icon" class="mgr-input mgr-icon-input" maxlength="4" placeholder="图标" />
          <input v-model="newRoutine.name" class="mgr-input mgr-name-input" maxlength="30" placeholder="名称，如：背单词" />
          <input v-model="newRoutine.time" class="mgr-input mgr-time-input" type="time" />
          <button class="btn btn-primary btn-sm" @click="addRoutineItem">添加</button>
        </div>
      </div>

      <!-- 固定事务管理入口（无任意时间组时也要可达）-->
      <div v-if="!anytimeRoutines.length && !showRoutineMgr" class="flow-mgr-entry">
        <button class="btn btn-ghost btn-sm" @click="showRoutineMgr = true">🔁 管理固定事务</button>
      </div>
    </template>

    <!-- 全部完成：朱砂印章浮印 -->
    <Teleport to="body">
      <div v-if="showSeal" class="seal-mask">
        <div ref="sealRef" class="day-seal">今日毕</div>
      </div>
    </Teleport>

    <!-- 单任务完成：卡牌翻转庆祝 -->
    <CardCelebration ref="celebrationRef" />

    <!-- 拖拽悬浮副本 + 插入指示线（fixed 元素，Teleport body；位置由 useDragSort 直写 DOM） -->
    <Teleport to="body">
      <div
        v-if="dragging && dragBlock"
        ref="cloneEl"
        class="drag-clone"
      >
        <span class="dc-time">{{ dragBlock._startStr }}–{{ dragBlock._endStr }}</span>
        <span class="dc-subject">{{ dragBlock.subject || '(未命名)' }}</span>
      </div>
      <div
        v-if="dragging"
        ref="indicatorEl"
        class="drop-indicator di-gap"
        data-mode="gap"
        style="display: none"
      >
        <span class="di-icon">↕</span>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.flow-timeline {
  position: relative;
  max-width: 680px;
  margin: 0 auto;
  padding-bottom: var(--space-12);
}

/* ── 滚动变色背景层 ── */
.flow-ambient {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  transition: background 1.2s var(--ease-out);
}

/* ── 紧凑进度头 ── */
.flow-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
  padding: var(--space-3) var(--space-4);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.flow-progress {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}

.flow-pct {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--accent);
  flex-shrink: 0;
}

.flow-track {
  flex: 1;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--bg-muted);
  overflow: hidden;
}

.flow-bar {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent);
  transition: width var(--duration-normal) var(--ease-out);
}

.flow-count {
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.flow-xp {
  font-size: var(--text-xs);
  color: var(--accent);
  flex-shrink: 0;
}

/* ── Rows ── */
.flow-row {
  position: relative;
}

/* 任务块行：触屏允许纵向滚动，拖起后由 useDragSort 接管手势 */
.flow-row[data-bid] {
  touch-action: pan-y;
}

/* 拖拽源行：半透明占位（不移出 DOM，避免布局跳动；class 由 useDragSort 添加） */
.flow-row.drag-src {
  opacity: 0.4;
}

/* ── 拖拽悬浮副本 / 插入指示线（Teleport 到 body 的 fixed 元素） ── */
.drag-clone {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--accent);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  opacity: 0.94;
  transform: rotate(1.2deg);
}

.dc-time {
  font-family: var(--font-data);
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--accent);
  flex-shrink: 0;
}

.dc-subject {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drop-indicator {
  position: fixed;
  z-index: 999;
  pointer-events: none;
}

/* 间隙重排：发光线 + ↕ */
.drop-indicator.di-gap {
  border-top: 2px solid var(--accent);
  box-shadow: 0 -1px 8px var(--accent);
}

/* 落在钉时块上：金色描边 + 📌 */
.drop-indicator.di-pin {
  border: 2px solid #e8c874;
  border-radius: var(--radius-lg);
  box-shadow: 0 0 12px rgba(232, 200, 116, 0.55);
  transform: translateY(-2px);
}

.di-icon {
  position: absolute;
  right: var(--space-3);
  top: -12px;
  font-size: 12px;
  background: var(--bg-elevated);
  border: 1px solid var(--accent);
  border-radius: var(--radius-full);
  padding: 1px var(--space-2);
  line-height: 1.4;
}

/* ── 任务块外壳：当前主任务高亮 ── */
.flow-block-shell {
  position: relative;
  border-radius: var(--radius-lg);
  transition: transform var(--duration-normal) var(--ease-out);
}

.flow-block-shell :deep(.task-card) {
  transition: border-color var(--duration-normal) var(--ease-out),
              box-shadow var(--duration-normal) var(--ease-out),
              transform var(--duration-normal) var(--ease-out);
}

.flow-block-shell.is-current :deep(.task-card) {
  border-color: var(--accent);
  box-shadow: var(--shadow-md);
  transform: scale(1.01);
}

/* ── 现在时刻线 ── */
.flow-now {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) 0;
}

.flow-now-time {
  width: 52px;
  flex-shrink: 0;
  text-align: center;
  font-family: var(--font-data);
  font-size: 10px;
  font-weight: 700;
  color: var(--accent);
}

.flow-now-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-muted);
}

.flow-now-line {
  flex: 1;
  height: 2px;
  background: var(--accent);
  border-radius: var(--radius-full);
  opacity: 0.7;
}

/* ── 固定事务时间轨 ── */
.flow-routine {
  display: flex;
  gap: var(--space-3);
}

.flow-rail {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 2px;
}

.flow-rail-time {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  margin-bottom: var(--space-1);
}

.flow-rail-line {
  width: 2px;
  flex: 1;
  background: var(--border);
  min-height: 100%;
}

.flow-rail-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--radius-full);
  background: var(--accent);
  border: 2px solid var(--bg-elevated);
  margin-top: -5px;
}

.state-past .flow-rail-dot { background: var(--state-past); }
.state-future .flow-rail-dot { background: var(--state-future); }
.flow-rail-dot.done { background: var(--success); }

.flow-routine-body {
  flex: 1;
  min-width: 0;
}

/* RoutineItem 自带 margin-top，外壳内去掉避免双间距 */
.flow-routine-body :deep(.routine-item) {
  margin-top: 0;
}

/* ── 任意时间组 ── */
.flow-anytime {
  margin-top: var(--space-4);
}

.flow-anytime-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) 0;
}

.flow-anytime-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
}

/* ── 模板管理面板 ── */
.flow-mgr {
  margin-top: var(--space-3);
  padding: var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.mgr-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}

.mgr-row:last-of-type {
  border-bottom: none;
}

.mgr-icon { font-size: var(--text-lg); }

.mgr-name {
  flex: 1;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.mgr-time {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.mgr-empty {
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: var(--space-2) 0;
}

.mgr-add {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-3);
  align-items: center;
}

.mgr-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg);
  color: var(--text-primary);
}

.mgr-input:focus {
  border-color: var(--accent);
  outline: none;
}

.mgr-icon-input { width: 56px; text-align: center; }
.mgr-name-input { flex: 1; min-width: 0; }
.mgr-time-input { width: 100px; font-family: var(--font-data); }

.flow-mgr-entry {
  margin-top: var(--space-4);
  text-align: center;
}

/* ── 空状态 ── */
.flow-empty {
  text-align: center;
  padding: var(--space-12) var(--space-4);
  color: var(--text-secondary);
}

.flow-empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: var(--space-4);
  animation: float 3s ease-in-out infinite;
}

.flow-empty-actions {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

/* ── 朱砂印章 ── */
.seal-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.day-seal {
  padding: var(--space-4) var(--space-5);
  border: 3px solid var(--danger);
  border-radius: var(--radius-sm);
  font-family: var(--font-heading);
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: 0.15em;
  color: var(--danger);
  background: var(--danger-bg);
  box-shadow: 0 8px 32px var(--danger-bg);
  writing-mode: vertical-rl;
  opacity: 0;
}

/* ── 移动端 ── */
@media (max-width: 768px) {
  .flow-timeline {
    padding-bottom: var(--space-8);
  }

  /* 去 blur：实色底保持观感，避免滚动时滤镜重绘 */
  .flow-header {
    background: var(--glass-bg-solid);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  /* 滚动变色保留，但缩短全屏背景过渡（降低移动端大面积重绘时长） */
  .flow-ambient {
    transition-duration: 0.3s;
  }

  .flow-header {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
  }

  .flow-xp {
    text-align: right;
  }

  /* 模板管理添加行：名称独占一行，其余换行排列 */
  .mgr-add {
    flex-wrap: wrap;
  }

  .mgr-name-input {
    flex: 1 1 100%;
    order: -1;
  }

  .mgr-icon-input {
    flex: 1;
    width: auto;
  }

  .mgr-time-input {
    flex: 2;
    width: auto;
  }
}
</style>
