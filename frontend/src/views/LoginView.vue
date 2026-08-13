<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import anime from 'animejs'
import { useAuthStore } from '@/stores/auth'
import { errMsg } from '@/api/client'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const mode = ref('login') // 'login' | 'register'
const loading = ref(false)
const errorMsg = ref('')

const loginForm = ref({ email: '', password: '' })
const registerForm = ref({ email: '', emailCode: '', nickname: '', password: '', inviteCode: '' })

/* ── 邮箱验证码 ── */
const sending = ref(false)
const countdown = ref(0)
const devCode = ref('')
let countdownTimer = null

/* ── 游客登录 ── */
const guestLoading = ref(false)

function switchMode(next) {
  mode.value = next
  errorMsg.value = ''
}

function startCountdown() {
  countdown.value = 60
  countdownTimer = setInterval(() => {
    countdown.value--
    if (countdown.value <= 0) {
      clearInterval(countdownTimer)
      countdownTimer = null
    }
  }, 1000)
}

async function sendCode() {
  if (sending.value || countdown.value > 0) return
  errorMsg.value = ''
  const email = registerForm.value.email.trim()
  if (!email) {
    errorMsg.value = '请先输入邮箱'
    return
  }
  sending.value = true
  try {
    const data = await auth.sendEmailCode(email)
    devCode.value = data.dev_code || ''
    startCountdown()
  } catch (err) {
    errorMsg.value = errMsg(err, '验证码发送失败，请稍后重试')
  } finally {
    sending.value = false
  }
}

function goAfterAuth() {
  const target = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard'
  router.push(target)
}

async function submit() {
  if (loading.value) return
  errorMsg.value = ''
  loading.value = true
  try {
    if (mode.value === 'login') {
      await auth.login(loginForm.value.email.trim(), loginForm.value.password)
    } else {
      await auth.register({
        email: registerForm.value.email.trim(),
        emailCode: registerForm.value.emailCode.trim(),
        nickname: registerForm.value.nickname.trim(),
        password: registerForm.value.password,
        inviteCode: registerForm.value.inviteCode.trim()
      })
    }
    goAfterAuth()
  } catch (err) {
    errorMsg.value = errMsg(err, mode.value === 'login' ? '登录失败，请稍后重试' : '注册失败，请稍后重试')
  } finally {
    loading.value = false
  }
}

async function guestLogin() {
  if (guestLoading.value) return
  errorMsg.value = ''
  guestLoading.value = true
  try {
    await auth.guest()
    goAfterAuth()
  } catch (err) {
    errorMsg.value = errMsg(err, '游客登录失败，请稍后重试')
  } finally {
    guestLoading.value = false
  }
}

onMounted(() => {
  anime({
    targets: '.login-card',
    translateY: [24, 0],
    opacity: [0, 1],
    easing: 'easeOutExpo',
    duration: 700
  })
})

onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
})
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-brand">
        <span class="login-brand-mark">∿</span>
        <h1 class="login-brand-name">DailyPlan</h1>
        <p class="login-brand-sub">每日计划 · 记录生活的秩序</p>
      </div>

      <div class="login-tabs">
        <button
          class="login-tab"
          :class="{ active: mode === 'login' }"
          @click="switchMode('login')"
        >登录</button>
        <button
          class="login-tab"
          :class="{ active: mode === 'register' }"
          @click="switchMode('register')"
        >注册</button>
      </div>

      <form v-if="mode === 'login'" class="login-form" @submit.prevent="submit">
        <label class="login-field">
          <span class="login-label">邮箱</span>
          <input
            v-model="loginForm.email"
            class="login-input"
            type="email"
            autocomplete="email"
            required
            placeholder="请输入邮箱"
          />
        </label>
        <label class="login-field">
          <span class="login-label">密码</span>
          <input
            v-model="loginForm.password"
            class="login-input"
            type="password"
            autocomplete="current-password"
            required
            placeholder="请输入密码"
          />
        </label>

        <p v-if="errorMsg" class="login-error">{{ errorMsg }}</p>

        <button class="btn btn-primary btn-lg login-submit" type="submit" :disabled="loading">
          {{ loading ? '登录中…' : '登 录' }}
        </button>
      </form>

      <form v-else class="login-form" @submit.prevent="submit">
        <label class="login-field">
          <span class="login-label">邮箱</span>
          <div class="login-email-row">
            <input
              v-model="registerForm.email"
              class="login-input"
              type="email"
              autocomplete="email"
              required
              placeholder="请输入邮箱"
            />
            <button
              type="button"
              class="btn btn-secondary send-code-btn"
              :disabled="sending || countdown > 0"
              @click="sendCode"
            >
              {{ countdown > 0 ? `重新发送(${countdown}s)` : (sending ? '发送中…' : '发送验证码') }}
            </button>
          </div>
        </label>
        <p v-if="devCode" class="login-dev-code">开发模式验证码：{{ devCode }}</p>
        <label class="login-field">
          <span class="login-label">验证码</span>
          <input
            v-model="registerForm.emailCode"
            class="login-input"
            type="text"
            inputmode="numeric"
            required
            placeholder="邮箱收到的 6 位验证码"
          />
        </label>
        <label class="login-field">
          <span class="login-label">昵称 <em class="login-optional">（可选）</em></span>
          <input
            v-model="registerForm.nickname"
            class="login-input"
            type="text"
            maxlength="30"
            placeholder="留空则默认取邮箱前缀"
          />
        </label>
        <label class="login-field">
          <span class="login-label">密码</span>
          <input
            v-model="registerForm.password"
            class="login-input"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            placeholder="至少 8 个字符"
          />
        </label>
        <label class="login-field">
          <span class="login-label">邀请码</span>
          <input
            v-model="registerForm.inviteCode"
            class="login-input"
            type="text"
            placeholder="向管理员索取邀请码"
          />
        </label>
        <p class="login-hint">首个注册的用户无需邀请码，并自动成为管理员；后续注册需要有效邀请码。</p>

        <p v-if="errorMsg" class="login-error">{{ errorMsg }}</p>

        <button class="btn btn-primary btn-lg login-submit" type="submit" :disabled="loading">
          {{ loading ? '注册中…' : '注 册' }}
        </button>
      </form>

      <div class="login-guest">
        <div class="login-divider"><span>或</span></div>
        <button class="btn btn-ghost guest-btn" :disabled="guestLoading" @click="guestLogin">
          {{ guestLoading ? '进入中…' : '游客体验' }}
        </button>
        <p class="login-hint guest-hint">无需注册，数据保留 7 天</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: var(--space-8);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-2xl);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: var(--glass-shadow);
}

.login-brand {
  text-align: center;
  margin-bottom: var(--space-6);
}

.login-brand-mark {
  font-family: var(--font-heading);
  font-size: 2.25rem;
  color: var(--accent);
  line-height: 1;
  display: block;
  margin-bottom: var(--space-2);
}

.login-brand-name {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
}

.login-brand-sub {
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-top: var(--space-2);
  letter-spacing: 0.1em;
}

.login-tabs {
  display: flex;
  gap: var(--space-1);
  padding: var(--space-1);
  margin-bottom: var(--space-6);
  background: var(--bg-muted);
  border-radius: var(--radius-md);
}

.login-tab {
  flex: 1;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out);
}

.login-tab.active {
  background: var(--bg-elevated);
  color: var(--text-primary);
  box-shadow: var(--shadow-sm);
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.login-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.login-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
}

.login-optional {
  font-style: normal;
  color: var(--text-muted);
  font-weight: 400;
}

.login-input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  background: var(--bg-elevated);
  color: var(--text-primary);
  transition: border-color var(--duration-fast) var(--ease-out);
}

.login-input:focus {
  outline: none;
  border-color: var(--accent);
}

.login-email-row {
  display: flex;
  gap: var(--space-2);
}

.login-email-row .login-input {
  flex: 1;
  min-width: 0;
}

.send-code-btn {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: var(--text-xs);
}

.send-code-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-dev-code {
  padding: var(--space-2) var(--space-3);
  background: var(--info-bg);
  border-radius: var(--radius-md);
  font-family: var(--font-data);
  font-size: var(--text-xs);
  color: var(--info);
  letter-spacing: 0.05em;
}

.login-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
  line-height: 1.6;
}

.login-error {
  padding: var(--space-2) var(--space-3);
  background: var(--danger-bg);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  color: var(--danger);
  line-height: 1.5;
}

.login-submit {
  width: 100%;
  margin-top: var(--space-2);
}

.login-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-guest {
  margin-top: var(--space-6);
}

.login-divider {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  margin-bottom: var(--space-4);
  color: var(--text-muted);
  font-size: var(--text-xs);
}

.login-divider::before,
.login-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.guest-btn {
  width: 100%;
}

.guest-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.guest-hint {
  text-align: center;
  margin-top: var(--space-2);
}
</style>
