<script setup>
import { ref } from 'vue'
import { useScheduleStore } from '@/stores/schedule'
import { useToastStore } from '@/stores/toast'
import { CAT_EMOJI } from '@/utils/constants'

/* v13 周期固定日程：学期课表 / 固定班表 / 兼职时间表等
   按"星期几 + 时间段 + 生效日期范围"重复的长效日程。
   规则本身不落进某天的计划，加载空白日期时才物化为当天任务块。 */

const emit = defineEmits(['close'])

const scheduleStore = useScheduleStore()
const toastStore = useToastStore()

const WEEKDAYS = [
  { v: 1, label: '一' },
  { v: 2, label: '二' },
  { v: 3, label: '三' },
  { v: 4, label: '四' },
  { v: 5, label: '五' },
  { v: 6, label: '六' },
  { v: 7, label: '日' }
]

const CATEGORIES = Object.keys(CAT_EMOJI) // study/work/life/health/review/other

/* 本地草稿：保存前可连续增删，点"保存"才落库 */
const draft = ref(JSON.parse(JSON.stringify(scheduleStore.recurringRules || [])))

const form = ref({
  name: '',
  weekdays: [],
  startTime: '',
  endTime: '',
  category: 'study',
  dateStart: '',
  dateEnd: ''
})

function toggleWeekday(v) {
  const i = form.value.weekdays.indexOf(v)
  if (i === -1) form.value.weekdays.push(v)
  else form.value.weekdays.splice(i, 1)
}

function weekdayText(rule) {
  return (rule.weekdays || [])
    .slice()
    .sort((a, b) => a - b)
    .map(v => WEEKDAYS.find(w => w.v === v)?.label || v)
    .join('·')
}

function rangeText(rule) {
  if (!rule.dateStart && !rule.dateEnd) return '长期'
  return `${rule.dateStart || '…'} ~ ${rule.dateEnd || '…'}`
}

function addRule() {
  const f = form.value
  const name = f.name.trim()
  if (!name) {
    toastStore.warn('请填写名称')
    return
  }
  if (!f.weekdays.length) {
    toastStore.warn('请选择重复的星期')
    return
  }
  if (!f.startTime || !f.endTime) {
    toastStore.warn('请填写开始和结束时间')
    return
  }
  if (f.endTime <= f.startTime) {
    toastStore.warn('结束时间需晚于开始时间')
    return
  }
  if (f.dateStart && f.dateEnd && f.dateEnd < f.dateStart) {
    toastStore.warn('生效结束日期不能早于开始日期')
    return
  }
  draft.value.push({
    id: 'rr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name,
    weekdays: [...f.weekdays].sort((a, b) => a - b),
    startTime: f.startTime,
    endTime: f.endTime,
    category: f.category,
    dateStart: f.dateStart || '',
    dateEnd: f.dateEnd || ''
  })
  form.value = { name: '', weekdays: [], startTime: '', endTime: '', category: f.category, dateStart: '', dateEnd: '' }
}

function removeRule(id) {
  draft.value = draft.value.filter(r => r.id !== id)
}

function save() {
  scheduleStore.saveRecurringRules(draft.value)
  const n = scheduleStore.syncRulesToDate(scheduleStore.currentDate)
  toastStore.ok(
    `已保存 ${draft.value.length} 条固定日程` + (n ? `，${n} 条已并入当天计划` : '，将自动出现在未来匹配的日期')
  )
  emit('close')
}
</script>

<template>
  <div class="rules-mask" @click.self="emit('close')">
    <div class="rules-card">
      <h3 class="rules-title">🗓 固定日程</h3>
      <p class="rules-desc">
        按星期重复的长期日程（课程表、固定班表等）。规则会在对应日期的空白计划里自动出现，已有计划不受影响。
      </p>

      <!-- 规则列表 -->
      <div class="rules-list">
        <div v-for="r in draft" :key="r.id" class="rule-row">
          <span class="rule-cat">{{ CAT_EMOJI[r.category] || CAT_EMOJI.other }}</span>
          <div class="rule-main">
            <span class="rule-name">{{ r.name }}</span>
            <span class="rule-meta">
              周{{ weekdayText(r) }} · {{ r.startTime }}-{{ r.endTime }} · {{ rangeText(r) }}
            </span>
          </div>
          <button class="btn btn-danger btn-sm" @click="removeRule(r.id)">删除</button>
        </div>
        <p v-if="!draft.length" class="rules-empty">暂无固定日程，在下方添加</p>
      </div>

      <!-- 添加表单 -->
      <div class="rule-form">
        <input v-model="form.name" class="rf-input rf-name" maxlength="30" placeholder="名称，如：高等数学 / 晚班" />
        <div class="rf-weekdays">
          <button
            v-for="w in WEEKDAYS"
            :key="w.v"
            type="button"
            class="rf-day"
            :class="{ active: form.weekdays.includes(w.v) }"
            @click="toggleWeekday(w.v)"
          >{{ w.label }}</button>
        </div>
        <div class="rf-row">
          <input v-model="form.startTime" class="rf-input rf-time" type="time" title="开始时间" />
          <span class="rf-sep">至</span>
          <input v-model="form.endTime" class="rf-input rf-time" type="time" title="结束时间" />
          <select v-model="form.category" class="rf-input rf-cat" title="分类">
            <option v-for="c in CATEGORIES" :key="c" :value="c">{{ CAT_EMOJI[c] }} {{ c }}</option>
          </select>
        </div>
        <div class="rf-row">
          <input v-model="form.dateStart" class="rf-input rf-date" type="date" title="生效开始（留空为长期）" />
          <span class="rf-sep">到</span>
          <input v-model="form.dateEnd" class="rf-input rf-date" type="date" title="生效结束（留空为长期）" />
          <button class="btn btn-secondary btn-sm rf-add" @click="addRule">＋ 添加</button>
        </div>
        <p class="rf-hint">生效日期留空表示长期有效；例如一学期课表可填开学与放假日期。</p>
      </div>

      <div class="rules-actions">
        <button class="btn btn-ghost" @click="emit('close')">取消</button>
        <button class="btn btn-primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rules-mask {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.rules-card {
  width: 100%;
  max-width: 520px;
  max-height: 86vh;
  overflow-y: auto;
  padding: var(--space-6);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-lg);
}

.rules-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.rules-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.6;
  margin-bottom: var(--space-4);
}

.rules-list {
  margin-bottom: var(--space-4);
}

.rule-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--border);
}

.rule-row:last-of-type {
  border-bottom: none;
}

.rule-cat {
  font-size: var(--text-lg);
  flex-shrink: 0;
}

.rule-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rule-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rule-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.rules-empty {
  font-size: var(--text-xs);
  color: var(--text-muted);
  padding: var(--space-2) 0;
}

.rule-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--bg-muted);
  border-radius: var(--radius-lg);
}

.rf-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg);
  color: var(--text-primary);
}

.rf-input:focus {
  border-color: var(--accent);
  outline: none;
}

.rf-name {
  width: 100%;
}

.rf-weekdays {
  display: flex;
  gap: var(--space-2);
}

.rf-day {
  flex: 1;
  padding: var(--space-2) 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  background: var(--bg);
  transition: all var(--duration-fast) var(--ease-out);
}

.rf-day.active {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--text-inverse);
}

.rf-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.rf-time {
  flex: 1;
  min-width: 0;
  font-family: var(--font-data);
}

.rf-cat {
  flex: 1;
  min-width: 0;
}

.rf-date {
  flex: 1;
  min-width: 0;
  font-family: var(--font-data);
  font-size: var(--text-xs);
}

.rf-sep {
  font-size: var(--text-xs);
  color: var(--text-muted);
  flex-shrink: 0;
}

.rf-add {
  flex-shrink: 0;
  white-space: nowrap;
}

.rf-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.5;
}

.rules-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

@media (max-width: 768px) {
  .rules-card {
    padding: var(--space-4);
  }

  .rf-row {
    flex-wrap: wrap;
  }

  .rf-time,
  .rf-cat,
  .rf-date {
    flex: 1 1 40%;
  }
}
</style>
