<script setup>
import { ref } from 'vue'
import { useMoodStore, MOOD_PRESETS } from '@/stores/mood'
import { useAnime } from '@/composables/useAnime'

const emit = defineEmits(['submitted'])

const moodStore = useMoodStore()
const { burst } = useAnime()

const text = ref('')
const submitting = ref(false)

async function submit(event) {
  if (!text.value.trim()) return

  submitting.value = true
  const today = moodStore.today
  const existing = moodStore.getEntry(today)

  const payload = existing
    ? { ...existing, note: text.value }
    : {
        color: MOOD_PRESETS[0].color,
        label: MOOD_PRESETS[0].label,
        note: text.value,
        intensity: 2
      }

  await moodStore.saveMood(today, payload)
  text.value = ''
  submitting.value = false
  emit('submitted')

  if (event && event.target) {
    const rect = event.target.getBoundingClientRect()
    burst(rect.left + rect.width / 2, rect.top, { count: 8 })
  }
}

function handleKeydown(event) {
  if (event.ctrlKey && event.key === 'Enter') {
    submit(event)
  }
}
</script>

<template>
  <div class="mood-vent">
    <div class="vent-label">每日吐槽</div>
    <textarea
      v-model="text"
      class="vent-input"
      placeholder="今天发生了什么？吐槽一下…（Ctrl+Enter 发送）"
      rows="3"
      :disabled="submitting"
      @keydown="handleKeydown"
    ></textarea>
    <button
      class="btn btn-primary btn-sm vent-submit"
      :disabled="!text.trim() || submitting"
      @click="submit"
    >
      {{ submitting ? '发送中…' : '发送' }}
    </button>
  </div>
</template>

<style scoped>
.mood-vent {
  margin-top: auto;
}

.vent-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.vent-input {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elevated);
  color: var(--text-primary);
  font-size: var(--text-sm);
  resize: none;
  line-height: 1.5;
  transition: border-color var(--duration-fast) var(--ease-out);
}

.vent-input:focus {
  outline: none;
  border-color: var(--accent);
}

.vent-submit {
  width: 100%;
  margin-top: var(--space-2);
}

.vent-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
