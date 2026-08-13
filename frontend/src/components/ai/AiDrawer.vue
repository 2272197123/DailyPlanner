<script setup>
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useAiStore } from '@/stores/ai'
import { useScheduleStore } from '@/stores/schedule'
import { useToastStore } from '@/stores/toast'

const aiStore = useAiStore()
const scheduleStore = useScheduleStore()
const toastStore = useToastStore()

const inputText = ref('')
const messagesEl = ref(null)
const drawerWidth = ref(380)
const isResizing = ref(false)
const showCarryOver = ref(false)

/* ── Smart greeting ── */
const greeting = computed(() => aiStore.greeting)
const suggestions = computed(() => aiStore.suggestions)

/* ── Carry-over ── */
const carryOverTasks = ref([])

function checkCarryOver() {
  const tasks = aiStore.getCarryOverTasks()
  if (tasks.length > 0) {
    carryOverTasks.value = tasks
    showCarryOver.value = true
  }
}

/* ── Keyboard ── */
function handleKeydown(e) {
  if (e.key === 'Escape' && aiStore.drawerOpen) {
    aiStore.close()
  }
  if (e.key === ' ' && e.shiftKey) {
    e.preventDefault()
    aiStore.toggle()
    if (aiStore.drawerOpen) checkCarryOver()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  aiStore.initFromCache()
  if (aiStore.drawerOpen) checkCarryOver()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

/* ── Scroll to bottom on new message ── */
watch(() => aiStore.messages.length, async () => {
  await nextTick()
  if (messagesEl.value) {
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  }
})

/* ── Send ── */
async function handleSend() {
  const text = inputText.value.trim()
  if (!text || aiStore.loading) return
  inputText.value = ''
  await aiStore.sendMessage(text)
}

function handleKeyPress(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

/* ── Suggestion click ── */
function handleSuggestion(chip) {
  inputText.value = chip.text
}

/* ── Carry-over actions ── */
async function handleCarryOver(increaseFactor) {
  await aiStore.carryOver(carryOverTasks.value, increaseFactor)
  showCarryOver.value = false
  toastStore.ok('已顺延 ' + carryOverTasks.value.length + ' 个任务')
  carryOverTasks.value = []
}

function handleDiscardCarryOver() {
  showCarryOver.value = false
  carryOverTasks.value = []
}

/* ── Adopt preview ── */
function handleAdoptPreview() {
  const count = aiStore.adoptPreview()
  if (count > 0) {
    toastStore.ok('已导入 ' + count + ' 个任务')
    aiStore.clearPreviewBlocks()
  }
}

/* ── Resize ── */
function startResize(e) {
  isResizing.value = true
  const startX = e.clientX
  const startW = drawerWidth.value

  function onMove(ev) {
    const newW = startW - (ev.clientX - startX)
    drawerWidth.value = Math.max(280, Math.min(620, newW))
  }

  function onUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<template>
  <!-- Floating trigger button -->
  <button
    v-if="!aiStore.drawerOpen"
    class="ai-float-btn"
    :class="{ 'has-notification': aiStore.messages.length === 0 }"
    @click="aiStore.open(); checkCarryOver()"
    title="AI 助手 (Shift+Space)"
  >
    🤖
  </button>

  <!-- Drawer -->
  <Teleport to="body">
    <transition name="drawer">
      <aside
        v-if="aiStore.drawerOpen"
        class="ai-drawer"
        :style="{ width: drawerWidth + 'px' }"
      >
        <!-- Resize handle -->
        <div class="ai-resize-handle" @mousedown="startResize"></div>

        <!-- Header -->
        <div class="ai-header">
          <h3>🤖 AI 助手</h3>
          <div class="ai-header-actions">
            <button class="ai-hdr-btn" @click="aiStore.clearChat()" title="清空对话">🗑</button>
            <button class="ai-hdr-btn" @click="aiStore.close()" title="关闭">✕</button>
          </div>
        </div>

        <!-- Carry-over banner -->
        <div v-if="showCarryOver" class="ai-carry-banner">
          <p>⚠️ 昨天有 <strong>{{ carryOverTasks.length }}</strong> 个任务未完成：</p>
          <div class="ai-carry-list">
            <span v-for="t in carryOverTasks" :key="t.id" class="ai-carry-item">{{ t.subject }} ({{ t.duration }}min)</span>
          </div>
          <div class="ai-carry-actions">
            <button class="btn-co btn-co-normal" @click="handleCarryOver(1.0)">📥 顺延到今天</button>
            <button class="btn-co btn-co-hard" @click="handleCarryOver(1.3)">📈 顺延 + 增加工作量</button>
            <button class="btn-co btn-co-skip" @click="handleDiscardCarryOver">✕ 放弃</button>
          </div>
        </div>

        <!-- Messages area -->
        <div class="ai-messages" ref="messagesEl">
          <!-- Greeting (when no messages) -->
          <div v-if="aiStore.messages.length === 0" class="ai-greeting">
            <div class="ai-greet-emoji">
              {{ greeting.hour < 9 ? '🌅' : greeting.hour < 18 ? '☀️' : greeting.hour < 22 ? '🌙' : '🦉' }}
            </div>
            <p class="ai-greet-title">{{ greeting.timeGreeting }}</p>
            <p class="ai-greet-context">
              <span v-for="(part, i) in greeting.contextParts" :key="i">
                {{ part }}<br v-if="i < greeting.contextParts.length - 1" />
              </span>
            </p>

            <!-- Suggestion chips -->
            <div class="ai-chips">
              <button
                v-for="chip in suggestions"
                :key="chip.text"
                class="ai-chip"
                @click="handleSuggestion(chip)"
              >
                {{ chip.icon }} {{ chip.text }}
              </button>
            </div>

            <!-- No API key guide -->
            <div v-if="!aiStore.hasApiKey" class="ai-no-key">
              <p>⚠️ 未配置 AI API Key</p>
              <p class="ai-no-key-hint">前往 <router-link :to="{ name: 'settings' }" class="ai-no-key-link">设置 → AI API 配置</router-link></p>
            </div>
          </div>

          <!-- Messages -->
          <div
            v-for="(msg, i) in aiStore.messages"
            :key="'msg-' + i"
            class="ai-msg"
            :class="'ai-msg-' + msg.role"
          >
            <div class="ai-msg-content">{{ msg.content }}</div>
          </div>

          <!-- Loading indicator -->
          <div v-if="aiStore.loading" class="ai-msg ai-msg-assistant">
            <div class="ai-typing">
              <span></span><span></span><span></span>
            </div>
          </div>

          <!-- Preview blocks -->
          <div v-if="aiStore.previewBlocks.length > 0" class="ai-preview">
            <h4>📋 生成的任务预览</h4>
            <div
              v-for="(block, bi) in aiStore.previewBlocks"
              :key="'pb-' + bi"
              class="ai-pb-item"
            >
              <input
                class="ai-pb-subject"
                :value="block.subject"
                @input="block.subject = ($event.target).value"
              />
              <input
                type="number"
                class="ai-pb-duration"
                :value="block.duration"
                @input="block.duration = Number(($event.target).value)"
                title="分钟"
              />
              <div v-if="block.subtasks" class="ai-pb-subtasks">
                <input
                  v-for="(st, si) in block.subtasks"
                  :key="'pbst-' + si"
                  class="ai-pb-st"
                  :value="st.text"
                  @input="st.text = ($event.target).value"
                />
              </div>
            </div>
            <div class="ai-preview-actions">
              <button class="btn-primary" @click="handleAdoptPreview">📥 导入任务</button>
              <button class="btn-secondary" @click="aiStore.clearPreviewBlocks()">取消</button>
            </div>
          </div>
        </div>

        <!-- Input area -->
        <div class="ai-input-area">
          <textarea
            v-model="inputText"
            class="ai-input"
            :placeholder="aiStore.hasApiKey ? '输入消息... (Enter 发送)' : '请先配置 AI API Key...'"
            rows="2"
            @keydown="handleKeyPress"
            :disabled="!aiStore.hasApiKey || aiStore.loading"
          ></textarea>
          <button
            class="ai-send-btn"
            :disabled="aiStore.loading || !inputText.trim()"
            @click="handleSend"
            title="发送 (Enter)"
          >
            ▶
          </button>
        </div>
      </aside>
    </transition>
  </Teleport>
</template>

<style scoped>
/* ── Float button ── */
.ai-float-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  font-size: 1.5rem;
  box-shadow: var(--shadow-lg);
  z-index: var(--z-sticky);
  transition: all var(--duration-normal) var(--ease-out);
  cursor: pointer;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ai-float-btn:hover {
  transform: scale(1.08);
  box-shadow: 0 8px 28px rgba(30, 32, 48, 0.3);
}

.ai-float-btn.has-notification {
  animation: float-pulse 2s ease-in-out infinite;
}

@keyframes float-pulse {
  0%, 100% { box-shadow: 0 4px 16px rgba(30, 32, 48, 0.2); }
  50% { box-shadow: 0 4px 28px rgba(30, 32, 48, 0.4), 0 0 0 8px rgba(30, 32, 48, 0.1); }
}

/* ── Drawer ── */
.ai-drawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  background: var(--bg-elevated);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow-lg);
  z-index: var(--z-overlay);
  display: flex;
  flex-direction: column;
}

.drawer-enter-active { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
.drawer-leave-active { transition: transform 0.2s cubic-bezier(0.4, 0, 1, 1); }
.drawer-enter-from { transform: translateX(100%); }
.drawer-leave-to { transform: translateX(100%); }

/* ── Resize handle ── */
.ai-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 10;
  transition: background var(--duration-fast);
}

.ai-resize-handle:hover { background: var(--border); }

/* ── Header ── */
.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.ai-header h3 {
  font-family: var(--font-heading);
  font-size: var(--text-base);
}

.ai-header-actions {
  display: flex;
  gap: var(--space-2);
}

.ai-hdr-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background var(--duration-fast);
  color: var(--text-secondary);
}

.ai-hdr-btn:hover { background: var(--bg-muted); }

/* ── Carry-over banner ── */
.ai-carry-banner {
  padding: var(--space-3) var(--space-4);
  background: var(--warning-bg);
  border-bottom: 1px solid var(--warning);
}

.ai-carry-banner p {
  font-size: var(--text-xs);
  margin-bottom: var(--space-2);
}

.ai-carry-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
}

.ai-carry-item {
  font-size: 10px;
  padding: var(--space-1) var(--space-2);
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
}

.ai-carry-actions {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.btn-co {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  border-radius: var(--radius-sm);
  font-weight: 600;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-co-normal { background: var(--accent); color: var(--text-inverse); }
.btn-co-normal:hover { background: var(--accent-light); }
.btn-co-hard { background: var(--warning); color: white; }
.btn-co-hard:hover { filter: brightness(1.1); }
.btn-co-skip { background: var(--bg-muted); color: var(--text-muted); }
.btn-co-skip:hover { background: var(--danger-bg); color: var(--danger); }

/* ── Messages ── */
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ── Greeting ── */
.ai-greeting {
  text-align: center;
  padding: var(--space-6) var(--space-3);
}

.ai-greet-emoji {
  font-size: 3rem;
  margin-bottom: var(--space-3);
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.ai-greet-title {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.ai-greet-context {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin-bottom: var(--space-5);
  line-height: 1.7;
}

/* ── Suggestion chips ── */
.ai-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  justify-content: center;
  margin-bottom: var(--space-5);
}

.ai-chip {
  padding: var(--space-2) var(--space-3);
  font-size: var(--text-xs);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.ai-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-muted);
}

/* ── No API key guide ── */
.ai-no-key {
  padding: var(--space-3);
  background: var(--warning-bg);
  border-radius: var(--radius-md);
}

.ai-no-key p { font-size: var(--text-xs); color: var(--warning); }
.ai-no-key-hint { font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-1); }

.ai-no-key-link { color: var(--accent); text-decoration: underline; }

/* ── Message bubbles ── */
.ai-msg {
  max-width: 90%;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-msg-user {
  align-self: flex-end;
  background: var(--accent);
  color: var(--text-inverse);
  border-bottom-right-radius: var(--radius-sm);
}

.ai-msg-assistant {
  align-self: flex-start;
  background: var(--bg);
  border: 1px solid var(--border);
  border-bottom-left-radius: var(--radius-sm);
}

/* ── Typing indicator ── */
.ai-typing {
  display: flex;
  gap: 4px;
  padding: var(--space-2) 0;
}

.ai-typing span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  animation: typing 1.4s infinite both;
}

.ai-typing span:nth-child(2) { animation-delay: 0.2s; }
.ai-typing span:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
  30% { transform: translateY(-6px); opacity: 1; }
}

/* ── Preview blocks ── */
.ai-preview {
  padding: var(--space-3);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
}

.ai-preview h4 {
  font-family: var(--font-heading);
  font-size: var(--text-xs);
  margin-bottom: var(--space-3);
}

.ai-pb-item {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.ai-pb-subject {
  flex: 1;
  min-width: 140px;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.ai-pb-duration {
  width: 56px;
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  text-align: center;
}

.ai-pb-subtasks {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.ai-pb-st {
  padding: var(--space-1) var(--space-2);
  font-size: var(--text-xs);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.ai-preview-actions {
  display: flex;
  gap: var(--space-2);
  justify-content: flex-end;
  margin-top: var(--space-3);
}

.btn-primary {
  padding: var(--space-2) var(--space-3);
  background: var(--accent);
  color: var(--text-inverse);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  font-weight: 600;
}

.btn-secondary {
  padding: var(--space-2) var(--space-3);
  background: var(--bg-muted);
  color: var(--text-secondary);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
}

/* ── Input area ── */
.ai-input-area {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--border);
}

.ai-input {
  flex: 1;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  resize: vertical;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  background: var(--bg);
  color: var(--text-primary);
  min-height: 44px;
  max-height: 120px;
}

.ai-input:focus { border-color: var(--accent); outline: none; }

.ai-send-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--text-inverse);
  font-size: var(--text-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--duration-fast) var(--ease-out);
}

.ai-send-btn:hover:not(:disabled) { background: var(--accent-light); transform: scale(1.05); }
.ai-send-btn:disabled { opacity: 0.3; cursor: not-allowed; }
</style>
