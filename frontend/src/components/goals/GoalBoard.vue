<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGoalStore } from '@/stores/goals'
import { useToastStore } from '@/stores/toast'

const goalStore = useGoalStore()
const toastStore = useToastStore()

const showCreate = ref(false)
const expandedGoal = ref(null)
const newGoal = ref({ title: '', deadline: '', description: '' })

/* ── Computed ── */
const activeGoals = computed(() => goalStore.activeGoals)
const completedGoals = computed(() => goalStore.completedGoals)
const overallProgress = computed(() => goalStore.totalProgress)

function goalProgress(g) {
  const phases = g.phases || []
  if (!phases.length) return g.completed ? 100 : 0
  const done = phases.filter(p => p.done).length
  return Math.round(done / phases.length * 100)
}

function daysLeft(g) {
  if (!g.deadline) return null
  const d = Math.ceil((new Date(g.deadline) - new Date()) / 86400000)
  return d
}

function daysLabel(d) {
  if (d === null) return '无截止日期'
  if (d < 0) return '已超期 ' + Math.abs(d) + ' 天'
  if (d === 0) return '今天截止'
  if (d <= 3) return '剩余 ' + d + ' 天'
  return '剩余 ' + d + ' 天'
}

/* ── Actions ── */
async function handleCreate() {
  if (!newGoal.value.title.trim()) {
    toastStore.warn('请输入目标名称')
    return
  }
  const goal = {
    id: 'g_' + Date.now(),
    title: newGoal.value.title.trim(),
    deadline: newGoal.value.deadline || null,
    description: newGoal.value.description || '',
    phases: [],
    milestones: [],
    completed: false,
    createdAt: new Date().toISOString()
  }
  await goalStore.saveGoal(goal)
  newGoal.value = { title: '', deadline: '', description: '' }
  showCreate.value = false
  toastStore.ok('目标已创建')
}

async function handleTogglePhase(goalId, pi) {
  const phase = await goalStore.togglePhase(goalId, pi)
  if (phase && phase.done) toastStore.ok('阶段完成！🎉')
}

async function handleDeleteGoal(id) {
  await goalStore.deleteGoal(id)
  expandedGoal.value = null
  toastStore.warn('目标已删除')
}

onMounted(() => goalStore.fetchGoals())
</script>

<template>
  <section class="goal-section">
    <!-- Header -->
    <div class="goal-header">
      <h3>
        🎯 长期目标
        <span class="goal-count-badge">{{ activeGoals.length }}</span>
      </h3>
      <button class="btn-add-goal" @click="showCreate = !showCreate">
        {{ showCreate ? '✕ 取消' : '＋ 新建目标' }}
      </button>
    </div>

    <!-- Overall ring -->
    <div class="goal-overall" v-if="activeGoals.length > 0">
      <div class="go-ring">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" class="go-ring-bg" />
          <circle cx="50" cy="50" r="40" class="go-ring-fill"
            :style="{ strokeDashoffset: 251.3 - (251.3 * overallProgress / 100) }" />
        </svg>
        <span class="go-ring-text">{{ overallProgress }}%</span>
      </div>
      <div class="go-summary">
        <span>{{ activeGoals.length }} 个活跃目标</span>
        <span>{{ completedGoals.length }} 个已完成</span>
      </div>
    </div>

    <!-- Create form -->
    <transition name="slide">
      <div v-if="showCreate" class="goal-create-card">
        <input v-model="newGoal.title" class="gc-input" placeholder="目标名称（如：托福110+）" />
        <div class="gc-row">
          <input v-model="newGoal.deadline" type="date" class="gc-input sm" />
          <input v-model="newGoal.description" class="gc-input" placeholder="简要描述（可选）" />
        </div>
        <button class="btn-primary" @click="handleCreate">创建目标</button>
      </div>
    </transition>

    <!-- Goal cards -->
    <div class="goal-cards" v-if="activeGoals.length > 0">
      <div
        v-for="g in activeGoals"
        :key="g.id"
        class="goal-card"
        :class="{ expanded: expandedGoal === g.id }"
        @click="expandedGoal = expandedGoal === g.id ? null : g.id"
      >
        <!-- Card header -->
        <div class="gc-top">
          <div class="gc-info">
            <span class="gc-title">{{ g.title }}</span>
            <span class="gc-deadline" :class="{ urgent: daysLeft(g) !== null && daysLeft(g) <= 3 }">
              {{ daysLabel(daysLeft(g)) }}
            </span>
          </div>
          <div class="gc-pct">{{ goalProgress(g) }}%</div>
        </div>

        <!-- Progress bar -->
        <div class="gc-bar">
          <div class="gc-bar-fill" :style="{ width: goalProgress(g) + '%' }"></div>
        </div>

        <!-- Expanded: phases + milestones -->
        <div v-if="expandedGoal === g.id" class="gc-detail" @click.stop>
          <!-- Phases -->
          <div class="gc-phases" v-if="(g.phases || []).length > 0">
            <h4>📊 阶段</h4>
            <div
              v-for="(p, pi) in g.phases"
              :key="'p-' + pi"
              class="gc-phase"
              :class="{ done: p.done }"
              @click="handleTogglePhase(g.id, pi)"
            >
              <span class="gcp-check" :class="{ checked: p.done }">
                <span v-if="p.done">✓</span>
              </span>
              <div class="gcp-info">
                <span class="gcp-name">{{ p.name || '阶段 ' + (pi + 1) }}</span>
                <span class="gcp-est" v-if="p.estDays">预计 {{ p.estDays }} 天</span>
              </div>
              <span class="gcp-arrow">▸</span>
            </div>
          </div>

          <!-- Milestones -->
          <div class="gc-milestones" v-if="(g.milestones || []).length > 0">
            <h4>🏁 里程碑</h4>
            <div
              v-for="ms in g.milestones"
              :key="ms.id"
              class="gc-ms"
              :class="{ done: ms.done }"
              @click="goalStore.toggleMilestone(g.id, ms.id)"
            >
              <span class="gc-ms-check" :class="{ checked: ms.done }">
                <span v-if="ms.done">✓</span>
              </span>
              <span class="gc-ms-text">{{ ms.text }}</span>
            </div>
          </div>

          <!-- Actions -->
          <div class="gc-actions">
            <button class="btn-sm danger" @click="handleDeleteGoal(g.id)">🗑 删除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Completed -->
    <div v-if="completedGoals.length > 0" class="goal-completed">
      <h4>✅ 已完成 ({{ completedGoals.length }})</h4>
      <div v-for="g in completedGoals" :key="g.id" class="gc-done-item">
        <span>{{ g.title }}</span>
        <span class="gc-done-date">{{ (g.completedAt || '').slice(0, 10) }}</span>
      </div>
    </div>

    <!-- Empty -->
    <div v-if="activeGoals.length === 0 && completedGoals.length === 0 && !showCreate" class="goal-empty">
      <span class="goal-empty-icon">🎯</span>
      <p>还没有长期目标</p>
      <p class="goal-empty-hint">点击创建你的第一个目标，让 AI 帮你拆解成可执行的阶段计划</p>
    </div>
  </section>
</template>

<style scoped>
.goal-section {
  max-width: 680px;
  margin: 0 auto;
  padding: var(--space-4) 0;
}

/* ── Header ── */
.goal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.goal-header h3 {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.goal-count-badge {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  background: var(--accent-muted);
  color: var(--accent);
  padding: 1px var(--space-2);
  border-radius: var(--radius-full);
}

.btn-add-goal {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--accent);
  border: 1.5px solid var(--accent);
  border-radius: var(--radius-full);
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-add-goal:hover { background: var(--accent); color: var(--text-inverse); }

/* ── Overall ring ── */
.goal-overall {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) 0;
  margin-bottom: var(--space-3);
}

.go-ring {
  width: 56px; height: 56px; position: relative; flex-shrink: 0;
}

.go-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }

.go-ring-bg { fill: none; stroke: var(--border); stroke-width: 6; }
.go-ring-fill {
  fill: none; stroke: var(--accent); stroke-width: 6; stroke-linecap: round;
  stroke-dasharray: 251.3; transition: stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.go-ring-text {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-family: var(--font-data); font-size: var(--text-xs); font-weight: 700; color: var(--accent);
}

.go-summary { display: flex; flex-direction: column; gap: 2px; font-size: var(--text-xs); color: var(--text-secondary); }

/* ── Create card ── */
.goal-create-card {
  padding: var(--space-4);
  background: var(--bg);
  border: 1px solid var(--accent);
  border-radius: var(--radius-lg);
  margin-bottom: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.gc-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.gc-input:focus { border-color: var(--accent); outline: none; }
.gc-input.sm { width: 160px; flex-shrink: 0; }

.gc-row { display: flex; gap: var(--space-3); }

.btn-primary {
  padding: var(--space-2) var(--space-4);
  background: var(--accent); color: var(--text-inverse);
  border-radius: var(--radius-md); font-size: var(--text-sm); font-weight: 600;
  align-self: flex-start;
}

.slide-enter-active { transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.slide-leave-active { transition: all 0.2s cubic-bezier(0.4, 0, 1, 1); }
.slide-enter-from { opacity: 0; transform: translateY(-8px); }
.slide-leave-to { opacity: 0; transform: translateY(-8px); }

/* ── Goal cards ── */
.goal-cards {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.goal-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.goal-card:hover { border-color: var(--accent); box-shadow: var(--shadow-md); }

.goal-card.expanded { border-color: var(--accent); }

.gc-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.gc-info { display: flex; flex-direction: column; gap: 2px; }

.gc-title { font-size: var(--text-sm); font-weight: 600; color: var(--text-primary); }

.gc-deadline {
  font-size: var(--text-xs); color: var(--text-muted);
  font-family: var(--font-data);
}

.gc-deadline.urgent { color: var(--danger); font-weight: 600; }

.gc-pct {
  font-family: var(--font-data); font-size: var(--text-lg); font-weight: 700;
  color: var(--accent);
}

.gc-bar {
  height: 4px; background: var(--bg-muted); border-radius: var(--radius-full);
  margin-top: var(--space-3); overflow: hidden;
}

.gc-bar-fill {
  height: 100%; background: var(--accent); border-radius: var(--radius-full);
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

/* ── Expanded detail ── */
.gc-detail {
  margin-top: var(--space-4);
  padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.gc-phases h4, .gc-milestones h4 {
  font-family: var(--font-heading);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}

.gc-phase {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.gc-phase:hover { background: var(--bg-muted); }

.gcp-check {
  width: 22px; height: 22px;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--border); border-radius: 50%;
  font-size: 10px; flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}

.gcp-check.checked { background: var(--success); border-color: var(--success); color: white; }

.gcp-info { flex: 1; display: flex; flex-direction: column; }
.gcp-name { font-size: var(--text-sm); color: var(--text-primary); }
.gcp-est { font-size: var(--text-xs); color: var(--text-muted); }
.gcp-arrow { color: var(--text-muted); font-size: var(--text-xs); }

.gc-phase.done .gcp-name { text-decoration: line-through; color: var(--text-muted); }

.gc-ms {
  display: flex; align-items: center; gap: var(--space-2);
  padding: var(--space-2) var(--space-3); border-radius: var(--radius-md);
  cursor: pointer; transition: background var(--duration-fast);
}

.gc-ms:hover { background: var(--bg-muted); }

.gc-ms-check {
  width: 18px; height: 18px;
  display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--border); border-radius: var(--radius-sm);
  font-size: 9px; flex-shrink: 0;
  transition: all var(--duration-fast);
}

.gc-ms-check.checked { background: var(--success); border-color: var(--success); color: white; }
.gc-ms-text { font-size: var(--text-xs); color: var(--text-primary); }
.gc-ms.done .gc-ms-text { text-decoration: line-through; color: var(--text-muted); }

.gc-milestones { margin-top: var(--space-3); }

.gc-actions { margin-top: var(--space-3); display: flex; justify-content: flex-end; }

.btn-sm {
  padding: var(--space-1) var(--space-3); font-size: var(--text-xs);
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  transition: all var(--duration-fast);
}

.btn-sm.danger { color: var(--danger); border-color: transparent; }
.btn-sm.danger:hover { background: var(--danger-bg); }

/* ── Completed ── */
.goal-completed {
  margin-top: var(--space-6); padding-top: var(--space-4);
  border-top: 1px solid var(--border);
}

.goal-completed h4 {
  font-family: var(--font-heading);
  font-size: var(--text-xs); color: var(--text-muted);
  margin-bottom: var(--space-3);
}

.gc-done-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: var(--space-2) 0;
  font-size: var(--text-sm); color: var(--text-muted);
  text-decoration: line-through;
}

.gc-done-date { font-family: var(--font-data); font-size: var(--text-xs); }

/* ── Empty ── */
.goal-empty {
  text-align: center; padding: var(--space-8) var(--space-4); color: var(--text-secondary);
}

.goal-empty-icon { font-size: 2.5rem; display: block; margin-bottom: var(--space-3); }
.goal-empty p { margin-bottom: var(--space-2); }
.goal-empty-hint { font-size: var(--text-sm); color: var(--text-muted); }
</style>
