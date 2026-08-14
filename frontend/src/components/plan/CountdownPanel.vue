<script setup>
/* ═══════════════════════════════════════
   CountdownPanel.vue — 倒数日便利贴墙
   计划页右侧栏；与长期目标共用 biggoals 存储
   （kind === 'countdown'），目标功能暂时下线。
   ═══════════════════════════════════════ */
import { ref, computed, onMounted } from 'vue'
import { useGoalStore } from '@/stores/goals'
import { useToastStore } from '@/stores/toast'
import { daysUntil } from '@/utils/format'

const goalStore = useGoalStore()
const toastStore = useToastStore()

const showAdd = ref(false)
const form = ref({ title: '', date: '' })

const countdowns = computed(() => goalStore.countdowns)

/* ── 便利贴配色（纸张色 + 墨色），按 id 哈希确定，同一张贴永远同色 ── */
const PAPERS = [
  { bg: 'linear-gradient(160deg, #fff3b0, #ffe066)', ink: '#5c4a1f' },
  { bg: 'linear-gradient(160deg, #ffd6e0, #ffafcc)', ink: '#6b2737' },
  { bg: 'linear-gradient(160deg, #cde7ff, #a9d6ff)', ink: '#1f3f5c' },
  { bg: 'linear-gradient(160deg, #d8f3dc, #b7e4c7)', ink: '#274e2f' },
  { bg: 'linear-gradient(160deg, #e9d8fd, #d0bfff)', ink: '#432c6b' }
]

function hashOf(id) {
  let h = 0
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) >>> 0
  return h
}

function paperOf(cd) {
  return PAPERS[hashOf(cd.id) % PAPERS.length]
}

function tiltOf(cd) {
  return ((hashOf(cd.id) % 5) - 2) * 1.2 // -2.4° ~ 2.4°
}

function cdText(date) {
  const d = daysUntil(date)
  if (d === null) return { num: '—', unit: '', cls: '' }
  if (d > 0) return { num: d, unit: '天后', cls: '' }
  if (d === 0) return { num: '今天', unit: '', cls: 'today' }
  return { num: Math.abs(d), unit: '天前', cls: 'past' }
}

async function handleAdd() {
  if (!form.value.title.trim()) {
    toastStore.warn('请输入倒数日名称')
    return
  }
  if (!form.value.date) {
    toastStore.warn('请选择日期')
    return
  }
  await goalStore.saveGoal({
    id: 'cd_' + Date.now(),
    kind: 'countdown',
    title: form.value.title.trim(),
    date: form.value.date,
    createdAt: new Date().toISOString()
  })
  form.value = { title: '', date: '' }
  showAdd.value = false
  toastStore.ok('倒数日已贴上')
}

async function handleDelete(id) {
  await goalStore.deleteGoal(id)
  toastStore.warn('倒数日已移除')
}

onMounted(() => goalStore.fetchGoals())
</script>

<template>
  <aside class="cd-panel">
    <div class="cd-head">
      <h3 class="cd-title">
        ⏳ 倒数日
        <span v-if="countdowns.length" class="cd-count">{{ countdowns.length }}</span>
      </h3>
      <button class="cd-add-btn" @click="showAdd = !showAdd">
        {{ showAdd ? '✕' : '＋' }}
      </button>
    </div>

    <!-- 添加表单 -->
    <transition name="slide">
      <div v-if="showAdd" class="cd-form">
        <input v-model="form.title" class="cd-input" maxlength="30" placeholder="倒数什么？（考试、旅行、纪念日…）" />
        <input v-model="form.date" type="date" class="cd-input" />
        <button class="cd-submit" @click="handleAdd">贴上便利贴</button>
      </div>
    </transition>

    <!-- 便利贴墙 -->
    <div v-if="countdowns.length" class="cd-wall">
      <div
        v-for="cd in countdowns"
        :key="cd.id"
        class="cd-note"
        :class="cdText(cd.date).cls"
        :style="{ background: paperOf(cd).bg, color: paperOf(cd).ink, '--tilt': tiltOf(cd) + 'deg' }"
      >
        <span class="cd-tape"></span>
        <button class="cd-del" title="移除" @click="handleDelete(cd.id)">✕</button>
        <span class="cd-name" :title="cd.title">{{ cd.title }}</span>
        <div class="cd-days">
          <span class="cd-num">{{ cdText(cd.date).num }}</span>
          <span v-if="cdText(cd.date).unit" class="cd-unit">{{ cdText(cd.date).unit }}</span>
        </div>
        <span class="cd-date">{{ cd.date }}</span>
      </div>
    </div>

    <div v-else-if="!showAdd" class="cd-empty">
      <span class="cd-empty-icon">🗓</span>
      <p>还没有倒数日</p>
      <p class="cd-empty-hint">点右上角「＋」贴上第一张便利贴</p>
    </div>
  </aside>
</template>

<style scoped>
.cd-panel {
  padding: var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

/* ── 头部 ── */
.cd-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.cd-title {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.cd-count {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  background: var(--accent-muted);
  color: var(--accent);
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
}

.cd-add-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--accent);
  font-size: var(--text-base);
  font-weight: 600;
  transition: background var(--duration-fast) var(--ease-out);
}

.cd-add-btn:hover { background: var(--accent-muted); }

/* ── 添加表单 ── */
.cd-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
  padding: var(--space-3);
  border: 1px dashed var(--accent);
  border-radius: var(--radius-md);
}

.cd-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.cd-input:focus { border-color: var(--accent); outline: none; }

.cd-submit {
  padding: var(--space-2);
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
}

.slide-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-leave-active { transition: all 0.2s cubic-bezier(0.4, 0, 1, 1); }
.slide-enter-from { opacity: 0; transform: translateY(-8px); }
.slide-leave-to { opacity: 0; transform: translateY(-8px); }

/* ── 便利贴墙 ── */
.cd-wall {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4) var(--space-3);
  padding-top: var(--space-2);
}

.cd-note {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-4) var(--space-2) var(--space-3);
  border-radius: 3px 3px 12px 3px;
  text-align: center;
  transform: rotate(var(--tilt, 0deg));
  box-shadow: 2px 3px 8px rgba(0, 0, 0, 0.28);
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
  cursor: default;
}

.cd-note:hover {
  transform: rotate(0deg) translateY(-3px) scale(1.04);
  box-shadow: 4px 8px 16px rgba(0, 0, 0, 0.32);
  z-index: 2;
}

/* 顶部胶带 */
.cd-tape {
  position: absolute;
  top: -9px;
  left: 50%;
  width: 64px;
  height: 18px;
  transform: translateX(-50%) rotate(-3deg);
  background: rgba(255, 255, 255, 0.45);
  border-left: 1px dashed rgba(0, 0, 0, 0.08);
  border-right: 1px dashed rgba(0, 0, 0, 0.08);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.cd-del {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 10px;
  color: inherit;
  opacity: 0;
  transition: opacity var(--duration-fast);
}

.cd-note:hover .cd-del { opacity: 0.55; }
.cd-del:hover { opacity: 1 !important; }

.cd-name {
  max-width: 100%;
  font-size: var(--text-xs);
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cd-days {
  display: flex;
  align-items: baseline;
  gap: 2px;
}

.cd-num {
  font-family: var(--font-data);
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.2;
}

.cd-unit { font-size: 10px; opacity: 0.75; }

.cd-date {
  font-family: var(--font-data);
  font-size: 9px;
  opacity: 0.6;
}

.cd-note.past { filter: saturate(0.35); }

.cd-note.today {
  outline: 2px dashed currentColor;
  outline-offset: -5px;
}

/* ── 空状态 ── */
.cd-empty {
  text-align: center;
  padding: var(--space-5) var(--space-3);
  color: var(--text-secondary);
}

.cd-empty-icon { font-size: 1.8rem; display: block; margin-bottom: var(--space-2); }
.cd-empty p { font-size: var(--text-sm); }
.cd-empty-hint { font-size: var(--text-xs); color: var(--text-muted); }

/* 触屏没有 hover，删除按钮常显 */
@media (max-width: 768px) {
  .cd-del { opacity: 0.55; }
  .cd-wall { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
}
</style>
