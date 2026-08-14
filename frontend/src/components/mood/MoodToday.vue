<script setup>
/* ═══════════════════════════════════════
   MoodToday.vue — 今日心情速记（塔罗卡风）
   点选一张心情卡 + 可选备注 → 一键记录/更新。
   ═══════════════════════════════════════ */
import { ref, computed } from 'vue'
import { useMoodStore, MOOD_PRESETS } from '@/stores/mood'
import { useToastStore } from '@/stores/toast'
import { useAnime } from '@/composables/useAnime'

const moodStore = useMoodStore()
const toastStore = useToastStore()
const { burst } = useAnime()

const selected = ref(null)   // preset id
const note = ref('')
const saving = ref(false)

const todayMood = computed(() => moodStore.todayMood)

const todayLabel = computed(() => {
  const d = new Date()
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}`
})

function pick(preset, event) {
  selected.value = preset.id
  if (event?.currentTarget) {
    const r = event.currentTarget.getBoundingClientRect()
    burst(r.left + r.width / 2, r.top + r.height / 2, {
      count: 8,
      colors: [preset.color, '#e8c874'],
      distance: 56,
      size: 5
    })
  }
}

async function save() {
  const preset = MOOD_PRESETS.find(p => p.id === selected.value)
  if (!preset) {
    toastStore.warn('先选一张心情卡')
    return
  }
  saving.value = true
  await moodStore.saveMood(moodStore.today, {
    color: preset.color,
    label: preset.label,
    note: note.value,
    intensity: todayMood.value?.intensity || 2
  })
  saving.value = false
  toastStore.ok(todayMood.value ? '今日心情已记录 ✓' : '已记录')
}

/* 已记录时把当前心情映射回卡片选中态 */
const activeId = computed(() => {
  if (selected.value) return selected.value
  const cur = todayMood.value
  if (!cur) return null
  const hit = MOOD_PRESETS.find(p => p.color === cur.color && p.label === cur.label)
  return hit ? hit.id : null
})
</script>

<template>
  <section class="mood-today card">
    <div class="mt-head">
      <h3 class="mt-title">✦ 今日心情</h3>
      <span class="mt-date">{{ todayLabel }}</span>
      <span v-if="todayMood" class="mt-current" :style="{ color: todayMood.color }">
        已记录：{{ todayMood.label }}
      </span>
    </div>

    <div class="mt-cards">
      <button
        v-for="p in MOOD_PRESETS"
        :key="p.id"
        class="mt-card"
        :class="{ active: activeId === p.id }"
        :style="{
          '--mc': p.color,
          '--mc-bg': p.color + '1F',
          '--mc-border': p.color + '8C',
          '--mc-ring': p.color + '40'
        }"
        @click="pick(p, $event)"
      >
        <span class="mt-star">✦</span>
        <span class="mt-label">{{ p.label }}</span>
      </button>
    </div>

    <div class="mt-row">
      <input
        v-model="note"
        class="mt-note"
        maxlength="60"
        :placeholder="todayMood && todayMood.note ? todayMood.note : '补一句备注（可选）…'"
      />
      <button class="mt-save" :disabled="saving" @click="save">
        {{ saving ? '记录中…' : (todayMood ? '更新心情' : '记录') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.mood-today {
  padding: var(--space-5);
  margin-bottom: var(--space-6);
}

.mt-head {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-bottom: var(--space-4);
}

.mt-title {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  color: var(--text-primary);
}

.mt-date {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.mt-current {
  margin-left: auto;
  font-size: var(--text-xs);
  font-weight: 600;
}

/* ── 心情卡 ── */
.mt-cards {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.mt-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-1);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  background: var(--mc-bg);
  transition: transform var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}

.mt-card:hover {
  transform: translateY(-3px);
  border-color: var(--mc-border);
}

.mt-card.active {
  border-color: var(--mc);
  transform: translateY(-3px);
  box-shadow: 0 0 0 3px var(--mc-ring),
              0 6px 16px var(--mc-ring);
}

.mt-star {
  font-size: 1.1rem;
  color: var(--mc);
}

.mt-label {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.mt-card.active .mt-label {
  color: var(--text-primary);
  font-weight: 600;
}

/* ── 备注 + 保存 ── */
.mt-row {
  display: flex;
  gap: var(--space-2);
}

.mt-note {
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.mt-note:focus {
  border-color: var(--accent);
  outline: none;
}

.mt-save {
  flex-shrink: 0;
  padding: var(--space-2) var(--space-4);
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: 600;
  transition: background var(--duration-fast) var(--ease-out);
}

.mt-save:hover:not(:disabled) { background: var(--accent-light); }
.mt-save:disabled { opacity: 0.5; }

@media (max-width: 768px) {
  .mt-cards {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
