<template>
  <div class="settings-view">
    <div class="settings-card">
      <h2>⚙️ 设置</h2>

      <!-- Profile -->
      <section class="set-section">
        <h3>👤 个人资料</h3>
        <div class="profile-row">
          <div class="avatar-wrap" title="点击更换头像" @click="avatarInput?.click()">
            <img v-if="auth.user?.avatar" :src="auth.user.avatar" class="avatar-img" alt="头像" />
            <span v-else class="avatar-placeholder">{{ avatarInitial }}</span>
            <span class="avatar-mask">更换</span>
          </div>
          <input
            ref="avatarInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            @change="onAvatarChange"
          />
          <div class="profile-info">
            <div class="profile-email">{{ auth.user?.email || '—' }}</div>
            <p v-if="auth.isGuest" class="guest-tip">
              游客账号（数据将于 7 天后清除），建议注册正式账号以长期保存数据。
            </p>
          </div>
        </div>
        <div class="set-row profile-nickname-row">
          <input
            v-model="nickname"
            class="set-input nickname-input"
            type="text"
            maxlength="30"
            placeholder="请输入昵称"
          />
          <button class="btn btn-primary btn-sm" :disabled="savingProfile" @click="saveProfile">
            {{ savingProfile ? '保存中…' : '保存昵称' }}
          </button>
        </div>
      </section>

      <!-- Theme picker -->
      <section class="set-section">
        <h3>🎨 主题</h3>
        <p class="set-desc">选择界面的主色调，即时生效并同步到账号。白天/夜间切换在侧边栏顶部（移动端在屏幕右上角）。</p>
        <div class="theme-grid">
          <button
            class="theme-swatch"
            :class="{ active: !themeStore.activeTheme }"
            @click="selectTheme(null)"
          >
            <span class="theme-dot" style="background: #1e2030"></span>
            <span class="theme-name">🖋 默认</span>
          </button>
          <button
            v-for="t in themeStore.allThemes"
            :key="t.key"
            class="theme-swatch"
            :class="{ active: themeStore.activeTheme === t.key }"
            @click="selectTheme(t.key)"
          >
            <span class="theme-dot" :style="{ background: t.accent }"></span>
            <span class="theme-name">{{ t.label }}</span>
          </button>
        </div>
      </section>

      <!-- Archive time -->
      <section class="set-section">
        <h3>📦 存档时间</h3>
        <p class="set-desc">每天到达此时间后，系统会提醒你完成每日复盘并存档。</p>
        <div class="set-row">
          <input
            type="number"
            class="set-input sm"
            :value="archiveStore.archiveHour"
            @change="archiveStore.setArchiveTime(Number(($event.target).value), archiveStore.archiveMinute)"
            min="0" max="23"
          />
          <span>:</span>
          <input
            type="number"
            class="set-input sm"
            :value="archiveStore.archiveMinute"
            @change="archiveStore.setArchiveTime(archiveStore.archiveHour, Number(($event.target).value))"
            min="0" max="59" step="5"
          />
          <span class="set-suffix">（当前：{{ paddedHour }}:{{ paddedMin }}）</span>
        </div>
      </section>

      <!-- AI Persona -->
      <section class="set-section">
        <h3>🤖 AI 评价人设</h3>
        <p class="set-desc">存档时 AI 扮演的角色。可自由定义，例如"你是一只猫娘"、"一位严格但温暖的老师"。</p>
        <textarea
          class="set-textarea"
          :value="archiveStore.aiPersonaPrompt"
          @change="archiveStore.setAiPersona(($event.target).value)"
          :placeholder="archiveStore.defaultAiPersona"
          rows="4"
        ></textarea>
        <p class="set-hint">留空则使用默认人设（温和严格的导师）。</p>
      </section>

      <!-- API config -->
      <section class="set-section">
        <h3>🔑 AI API 配置</h3>
        <p class="set-desc">配置 DeepSeek / OpenAI / 自定义 API，用于 AI 评价和 AI 助手。</p>
        <div class="api-form">
          <label class="api-field">
            <span class="api-label">API Key</span>
            <input
              v-model="aiApiKey"
              class="set-input api-input"
              type="password"
              placeholder="sk-..."
              autocomplete="off"
            />
          </label>
          <label class="api-field">
            <span class="api-label">Base URL</span>
            <input
              v-model="aiBaseUrl"
              class="set-input api-input"
              type="text"
              placeholder="https://api.deepseek.com"
            />
          </label>
          <label class="api-field">
            <span class="api-label">模型</span>
            <input
              v-model="aiModel"
              class="set-input api-input"
              type="text"
              placeholder="deepseek-chat"
            />
          </label>
          <div class="api-actions">
            <button class="btn btn-primary btn-sm" :disabled="savingApi" @click="saveApiConfig">
              {{ savingApi ? '保存中…' : '保存配置' }}
            </button>
          </div>
        </div>
        <p class="set-hint">API Key 加密存储在服务端；保存后 AI 助手与存档 AI 评价立即可用。</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { useArchiveStore } from '@/stores/archive'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { useToastStore } from '@/stores/toast'
import api, { errMsg, unwrap } from '@/api/client'

const archiveStore = useArchiveStore()
const auth = useAuthStore()
const themeStore = useThemeStore()
const toast = useToastStore()

const paddedHour = computed(() => String(archiveStore.archiveHour).padStart(2, '0'))
const paddedMin = computed(() => String(archiveStore.archiveMinute).padStart(2, '0'))

/* ── 主题 ── */
function selectTheme(key) {
  themeStore.applyTheme(key)
  // 同步到账号偏好（失败静默，本地已生效）
  api.put('/prefs', { activeTheme: key || '' }).catch(() => {})
}

async function syncThemeFromServer() {
  // 跨设备同步：以服务端保存的主题为准
  try {
    const { data } = await api.get('/prefs')
    const prefs = unwrap(data) || {}
    const serverTheme = prefs.activeTheme || null
    if (serverTheme !== themeStore.activeTheme) {
      themeStore.applyTheme(serverTheme || null)
    }
    if (prefs.mode && prefs.mode !== themeStore.mode) {
      themeStore.setMode(prefs.mode)
    }
  } catch { /* 离线时保持本地 */ }
}

/* ── 个人资料 ── */
const nickname = ref(auth.user?.nickname || '')
const savingProfile = ref(false)
const avatarInput = ref(null)

const avatarInitial = computed(() => {
  const name = auth.user?.nickname || auth.user?.email || auth.user?.username || '?'
  return name.trim().charAt(0).toUpperCase() || '?'
})

async function saveProfile() {
  if (savingProfile.value) return
  const value = nickname.value.trim()
  if (!value) {
    toast.warn('昵称不能为空')
    return
  }
  savingProfile.value = true
  try {
    const data = await auth.updateProfile(value)
    toast.ok(data.message || '昵称已保存')
  } catch (err) {
    toast.err(errMsg(err, '保存昵称失败'))
  } finally {
    savingProfile.value = false
  }
}

async function onAvatarChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    toast.warn('头像文件不能超过 2MB')
    return
  }
  try {
    const data = await auth.uploadAvatar(file)
    toast.ok(data.message || '头像已更新')
  } catch (err) {
    toast.err(errMsg(err, '头像上传失败'))
  }
}

/* ── AI API 配置 ── */
const aiApiKey = ref('')
const aiBaseUrl = ref('https://api.deepseek.com')
const aiModel = ref('deepseek-chat')
const savingApi = ref(false)

/** 镜像写入 localStorage dp_apiConfig（stores/ai.js 与 stores/archive.js 读取 {apiKey, baseUrl, model}） */
function mirrorApiConfig() {
  try {
    localStorage.setItem('dp_apiConfig', JSON.stringify({
      apiKey: aiApiKey.value.trim(),
      baseUrl: aiBaseUrl.value.trim() || 'https://api.deepseek.com',
      model: aiModel.value.trim() || 'deepseek-chat'
    }))
  } catch { /* ignore */ }
}

async function loadApiConfig() {
  // 优先读本地镜像，再以后端 /prefs 为准（aiApiKey 后端解密返回）
  try {
    const local = JSON.parse(localStorage.getItem('dp_apiConfig') || '{}')
    if (local.apiKey) aiApiKey.value = local.apiKey
    if (local.baseUrl) aiBaseUrl.value = local.baseUrl
    if (local.model) aiModel.value = local.model
  } catch { /* ignore */ }
  try {
    const { data } = await api.get('/prefs')
    const prefs = unwrap(data) || {}
    if (prefs.aiApiKey) aiApiKey.value = prefs.aiApiKey
    if (prefs.aiBaseUrl) aiBaseUrl.value = prefs.aiBaseUrl
    if (prefs.aiModel) aiModel.value = prefs.aiModel
    mirrorApiConfig()
  } catch { /* offline: keep local */ }
}

async function saveApiConfig() {
  if (savingApi.value) return
  savingApi.value = true
  try {
    await api.put('/prefs', {
      aiApiKey: aiApiKey.value.trim(),
      aiBaseUrl: aiBaseUrl.value.trim() || 'https://api.deepseek.com',
      aiModel: aiModel.value.trim() || 'deepseek-chat'
    })
    mirrorApiConfig()
    toast.ok('AI 配置已保存')
  } catch (err) {
    toast.err(errMsg(err, '保存失败，请稍后重试'))
  } finally {
    savingApi.value = false
  }
}

onMounted(() => {
  loadApiConfig()
  syncThemeFromServer()
})
</script>

<style scoped>
.settings-view {
  max-width: 560px;
  margin: 0 auto;
  padding: var(--space-6) 0;
}

.settings-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
}

.settings-card h2 {
  font-family: var(--font-heading);
  font-size: var(--text-xl);
  margin-bottom: var(--space-6);
}

.set-section {
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--border);
}

.set-section:last-child { border-bottom: none; margin-bottom: 0; }

.set-section h3 {
  font-family: var(--font-heading);
  font-size: var(--text-sm);
  color: var(--text-primary);
  margin-bottom: var(--space-2);
}

.set-desc {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-3);
}

.set-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-2);
}

.set-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.set-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-family: var(--font-data);
  font-size: var(--text-sm);
  background: var(--bg);
  color: var(--text-primary);
}

.set-input:focus { border-color: var(--accent); outline: none; }

.set-input.sm { width: 60px; text-align: center; }

.set-suffix {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.set-textarea {
  width: 100%;
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  resize: vertical;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  background: var(--bg);
  color: var(--text-primary);
  line-height: 1.6;
}

.set-textarea:focus { border-color: var(--accent); outline: none; }

/* ── 个人资料 ── */
.profile-row {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-4);
}

.avatar-wrap {
  position: relative;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  overflow: hidden;
  cursor: pointer;
  background: var(--accent-muted);
  border: 1px solid var(--border);
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  color: var(--accent);
}

.avatar-mask {
  position: absolute;
  inset: auto 0 0 0;
  padding: 2px 0;
  text-align: center;
  font-size: 10px;
  color: var(--text-inverse);
  background: rgba(0, 0, 0, 0.45);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.avatar-wrap:hover .avatar-mask {
  opacity: 1;
}

.profile-info {
  min-width: 0;
}

.profile-email {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guest-tip {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--warning);
  line-height: 1.6;
}

.profile-nickname-row {
  align-items: center;
}

.nickname-input {
  flex: 1;
  min-width: 0;
}

/* ── AI API 配置 ── */
.api-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.api-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.api-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
}

.api-input {
  width: 100%;
}

.api-actions {
  display: flex;
  justify-content: flex-end;
}

/* ── 主题选择 ── */
.theme-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.theme-swatch {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg);
  transition: border-color var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out);
}

.theme-swatch:hover {
  transform: translateY(-1px);
  border-color: var(--accent);
}

.theme-swatch.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-muted);
}

.theme-dot {
  width: 16px;
  height: 16px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.theme-name {
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.theme-swatch.active .theme-name {
  color: var(--text-primary);
  font-weight: 600;
}
</style>
