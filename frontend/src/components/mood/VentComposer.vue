<script setup>
/* ═══════════════════════════════════════
   VentComposer.vue — 吐槽录入（光谱取色 + 倒入许愿瓶）
   textarea（Ctrl+Enter 发送）+ SpectrumPicker + 发送按钮。
   成功 emit('added', vent)，由父级触发许愿瓶倒入反馈。
   ═══════════════════════════════════════ */
import { ref } from 'vue'
import { useMoodStore } from '@/stores/mood'
import { useToastStore } from '@/stores/toast'
import { errMsg } from '@/api/client'
import SpectrumPicker from './SpectrumPicker.vue'

const props = defineProps({
  date: { type: String, required: true }
})
const emit = defineEmits(['added'])

const moodStore = useMoodStore()
const toastStore = useToastStore()

const text = ref('')
const color = ref('#f59e0b')
const submitting = ref(false)

async function submit() {
  const t = text.value.trim()
  if (!t || submitting.value) return
  submitting.value = true
  try {
    const vent = await moodStore.addVent(props.date, { text: t, color: color.value })
    text.value = ''
    toastStore.ok('已倒入许愿瓶 ✦')
    emit('added', vent)
  } catch (err) {
    toastStore.err(errMsg(err, '倒入失败，请稍后重试'))
  } finally {
    submitting.value = false
  }
}

function handleKeydown(event) {
  if (event.ctrlKey && event.key === 'Enter') {
    submit()
  }
}
</script>

<template>
  <div class="vent-composer">
    <textarea
      v-model="text"
      class="vc-input"
      maxlength="500"
      rows="2"
      placeholder="吐槽一句今天…（Ctrl+Enter 倒入瓶中）"
      :disabled="submitting"
      @keydown="handleKeydown"
    ></textarea>
    <SpectrumPicker v-model="color" />
    <button
      class="btn btn-primary vc-submit"
      :disabled="!text.trim() || submitting"
      @click="submit"
    >
      {{ submitting ? '倒入中…' : '倒入许愿瓶' }}
    </button>
  </div>
</template>

<style scoped>
.vent-composer {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.vc-input {
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

.vc-input:focus {
  outline: none;
  border-color: var(--accent);
}

.vc-submit {
  width: 100%;
}

.vc-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
