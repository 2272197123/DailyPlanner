<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMoodStore, MOOD_PRESETS } from '@/stores/mood'
import { useAuthStore } from '@/stores/auth'
import { useCurrencyStore } from '@/stores/currency'
import { useThemeStore } from '@/stores/theme'
import { useAnime } from '@/composables/useAnime'
import { toLocalDate } from '@/utils/format'
import api from '@/api/client'
import MoodPicker from '@/components/mood/MoodPicker.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const moodStore = useMoodStore()
const auth = useAuthStore()
const currencyStore = useCurrencyStore()
const themeStore = useThemeStore()
const { burst, runPreset } = useAnime()

const collapsed = ref(false)
const mobileOpen = ref(false)
const ventText = ref('')

/* 移动端视口一次性判定（同 App.vue orbsDisabled 模式）：抽屉未打开时不渲染
   84 格心情图——隐藏但仍挂载时，任何 vent 增删都会全量重算 84 格颜色 */
const isMobile = window.matchMedia('(max-width: 768px)').matches

const navItems = computed(() => {
  const items = [
    { name: 'dashboard', title: '总览', icon: '□' },
    { name: 'plan', title: '计划', icon: '☑' },
    { name: 'chifan', title: '恰饭', icon: '🍜' },
    { name: 'collection', title: '收集', icon: '🎴' },
    { name: 'mood', title: '心情', icon: '◉' },
    { name: 'news', title: '热点', icon: '✦' },
    { name: 'settings', title: '设置', icon: '⚙' }
  ]
  if (auth.isAdmin) {
    items.push({ name: 'admin', title: '后台管理', icon: '⚑' })
  }
  return items
})

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}

/* 白天/夜间切换：即时生效并同步到账号偏好（跨设备） */
function toggleThemeMode() {
  themeStore.toggleMode()
  api.put('/prefs', { mode: themeStore.mode }).catch(() => {})
}

/* 昵称优先，回退邮箱/用户名 */
const displayName = computed(() =>
  auth.user?.nickname || auth.user?.email || auth.user?.username || '未登录'
)

const footerInitial = computed(() => {
  const name = displayName.value
  return name === '未登录' ? '?' : (name.trim().charAt(0).toUpperCase() || '?')
})

const isActive = (name) => route.name === name

const recentDates = computed(() => {
  const dates = []
  const today = new Date()
  for (let i = 83; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    dates.push(toLocalDate(d))
  }
  return dates
})

const recentWeeks = computed(() => {
  const weeks = []
  for (let i = 0; i < 12; i++) {
    weeks.push(recentDates.value.slice(i * 7, (i + 1) * 7))
  }
  return weeks.reverse()
})

function getMood(date) {
  return moodStore.getEntry(date)
}

function getCellColor(date) {
  // 混合色：有吐槽的天显示 vents 线性混合色（store dayColor 统一口径）
  const color = moodStore.dayColor(date)
  if (!color) return 'var(--bg-muted)'
  const mood = getMood(date)
  const alpha = 0.35 + (mood?.intensity || 2) * 0.18
  return color + Math.round(alpha * 255).toString(16).padStart(2, '0')
}

/* 心情格子：点击弹出正规选择器（不再随机指派心情） */
const moodPickerOpen = ref(false)
const moodPickerDate = ref('')

function handleCellClick(date, event) {
  moodPickerDate.value = date
  moodPickerOpen.value = true

  const rect = event.target.getBoundingClientRect()
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, {
    count: 10,
    colors: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444']
  })
}

async function onMoodSave(payload) {
  await moodStore.saveMood(moodPickerDate.value, payload)
  moodPickerOpen.value = false
}

function onMoodDelete() {
  moodStore.deleteMood(moodPickerDate.value)
  moodPickerOpen.value = false
}

async function submitVent(event) {
  if (!ventText.value.trim()) return
  const today = moodStore.today
  const existing = getMood(today)
  const payload = existing
    ? { ...existing, note: ventText.value }
    : {
        color: MOOD_PRESETS[0].color,
        label: MOOD_PRESETS[0].label,
        note: ventText.value,
        intensity: 2
      }
  await moodStore.saveMood(today, payload)
  ventText.value = ''

  if (event && event.target) {
    const rect = event.target.getBoundingClientRect()
    burst(rect.left + rect.width / 2, rect.top, { count: 8 })
  }
}

onMounted(() => {
  moodStore.fetchMoods()
})

watch(() => route.name, () => {
  mobileOpen.value = false
  runPreset('.sidebar-nav-item', 'staggerFadeUp')
})
</script>

<template>
  <!-- 移动端：汉堡按钮 + 遮罩（仅 ≤768px 显示） -->
  <button
    class="mobile-menu-btn"
    :class="{ hidden: mobileOpen }"
    aria-label="打开菜单"
    @click="mobileOpen = true"
  >☰</button>
  <!-- 移动端：快捷白天/夜间切换（右上角，无需打开抽屉） -->
  <ThemeToggle class="mobile-theme-btn" @toggle="toggleThemeMode" />
  <div v-if="mobileOpen" class="sidebar-backdrop" @click="mobileOpen = false"></div>

  <aside class="app-sidebar" :class="{ collapsed, open: mobileOpen }">
    <div class="sidebar-header">
      <div class="brand">
        <span class="brand-mark">∿</span>
        <span v-if="!collapsed" class="brand-name">DailyPlan</span>
      </div>
      <div class="header-actions">
        <ThemeToggle @toggle="toggleThemeMode" />
        <button class="collapse-btn" @click="collapsed = !collapsed" title="折叠/展开">
          {{ collapsed ? '»' : '«' }}
        </button>
      </div>
    </div>

    <nav class="sidebar-nav">
      <router-link
        v-for="item in navItems"
        :key="item.name"
        :to="{ name: item.name }"
        class="sidebar-nav-item"
        :class="{ active: isActive(item.name) }"
      >
        <span class="nav-icon">{{ item.icon }}</span>
        <span v-if="!collapsed" class="nav-title">{{ item.title }}</span>
      </router-link>
    </nav>

    <div v-if="!collapsed && (!isMobile || mobileOpen)" class="sidebar-mood">
      <div class="mood-header">
        <span class="mood-title">近 12 周心情</span>
        <router-link :to="{ name: 'mood' }" class="mood-link">查看全部</router-link>
      </div>
      <div class="mood-mini-grid">
        <div v-for="(week, wIndex) in recentWeeks" :key="wIndex" class="mood-week">
          <div
            v-for="date in week"
            :key="date"
            class="mood-cell"
            :style="{ backgroundColor: getCellColor(date) }"
            :title="date + (getMood(date) ? ` · ${getMood(date).label}` : '')"
            @click="handleCellClick(date, $event)"
          ></div>
        </div>
      </div>
    </div>

    <div v-if="!collapsed" class="sidebar-vent">
      <div class="vent-label">每日吐槽</div>
      <textarea
        v-model="ventText"
        class="vent-input"
        placeholder="今天发生了什么？吐槽一下…"
        rows="3"
        @keydown.enter.prevent="submitVent"
      ></textarea>
      <button class="btn btn-primary btn-sm vent-submit" @click="submitVent">
        发送
      </button>
    </div>

    <div v-if="!collapsed" class="sidebar-footer">
      <div class="footer-level" title="等级随累计 XP 提升">
        <span class="level-badge">Lv.{{ currencyStore.level }}</span>
        <div class="level-track">
          <div class="level-bar" :style="{ width: currencyStore.levelProgress + '%' }"></div>
        </div>
        <span class="level-xp">{{ currencyStore.balance }} XP</span>
      </div>
      <div class="footer-user">
        <router-link :to="{ name: 'settings' }" class="footer-avatar" title="打开设置">
          <img v-if="auth.user?.avatar" :src="auth.user.avatar" class="footer-avatar-img" alt="" />
          <span v-else class="footer-avatar-initial">{{ footerInitial }}</span>
        </router-link>
        <span class="footer-username" :title="auth.user?.email || ''">
          {{ displayName }}
          <em v-if="auth.isGuest" class="guest-tag">游客</em>
        </span>
        <button class="btn btn-ghost btn-sm" @click="handleLogout">退出登录</button>
      </div>
      <span class="footer-hint">Ctrl+Enter 快捷发送</span>
    </div>

    <!-- 心情选择器（点击心情格子弹出；必须 Teleport，aside 的 backdrop-filter 会截断 fixed 定位） -->
    <Teleport to="body">
      <MoodPicker
        v-if="moodPickerOpen"
        :date="moodPickerDate"
        :mood="getMood(moodPickerDate)"
        @close="moodPickerOpen = false"
        @save="onMoodSave"
        @delete="onMoodDelete"
      />
    </Teleport>
  </aside>
</template>

<style scoped>
.app-sidebar {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: 260px;
  z-index: var(--z-sticky);
  display: flex;
  flex-direction: column;
  padding: var(--space-5);
  background: var(--glass-bg);
  border-right: 1px solid var(--glass-border);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: var(--glass-shadow);
  transition: width var(--duration-normal) var(--ease-out);
}

.app-sidebar.collapsed {
  /* 横向 6px 内边距：内容宽 60px，恰好容纳主题开关 */
  width: 72px;
  padding: var(--space-4) 6px;
}

/* 折叠态头部纵向堆叠，容纳 60px 宽的主题开关 */
.app-sidebar.collapsed .sidebar-header {
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.app-sidebar.collapsed .header-actions {
  flex-direction: column;
  align-items: center;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-6);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.brand-mark {
  font-family: var(--font-heading);
  font-size: 1.75rem;
  color: var(--accent);
  line-height: 1;
}

.brand-name {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.collapse-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: var(--text-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.collapse-btn:hover {
  background: var(--bg-muted);
  color: var(--text-primary);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin-bottom: var(--space-6);
}

.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  font-weight: 500;
  transition: background var(--duration-fast) var(--ease-out),
              color var(--duration-fast) var(--ease-out),
              transform var(--duration-fast) var(--ease-out);
}

.sidebar-nav-item:hover {
  background: var(--bg-muted);
  color: var(--text-primary);
  transform: translateX(3px);
}

.sidebar-nav-item.active {
  background: var(--accent);
  color: var(--on-accent, #fff);
  box-shadow: var(--shadow-sm);
}

.nav-icon {
  font-size: 1rem;
  width: 20px;
  text-align: center;
}

.sidebar-mood {
  margin-bottom: var(--space-5);
  padding: var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
}

.mood-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}

.mood-title {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
}

.mood-link {
  font-size: var(--text-xs);
  color: var(--accent);
  transition: opacity var(--duration-fast) var(--ease-out);
}

.mood-link:hover {
  opacity: 0.7;
}

.mood-mini-grid {
  display: flex;
  flex-direction: row-reverse;
  gap: 3px;
  overflow-x: auto;
  padding-bottom: var(--space-1);
}

.mood-week {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.mood-cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--bg-muted);
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out),
              box-shadow var(--duration-fast) var(--ease-out);
}

.mood-cell:hover {
  transform: scale(1.6);
  box-shadow: 0 0 0 2px var(--accent-muted);
  z-index: 1;
}

.sidebar-vent {
  margin-top: auto;
  margin-bottom: var(--space-4);
}

.vent-label {
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
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

.sidebar-footer {
  text-align: center;
}

.footer-level {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding: var(--space-1) var(--space-2);
}

.level-badge {
  font-family: var(--font-data);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--accent);
  background: var(--accent-muted);
  padding: 1px var(--space-2);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.level-track {
  flex: 1;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--bg-muted);
  overflow: hidden;
}

.level-bar {
  height: 100%;
  border-radius: var(--radius-full);
  background: var(--accent);
  transition: width var(--duration-normal) var(--ease-out);
}

.level-xp {
  font-family: var(--font-data);
  font-size: 10px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.footer-user {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
  padding: var(--space-1) var(--space-2);
}

.footer-avatar {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  border-radius: var(--radius-full);
  overflow: hidden;
  background: var(--accent-muted);
  border: 1px solid var(--border);
  display: block;
  cursor: pointer;
  transition: transform var(--duration-fast) var(--ease-out),
              border-color var(--duration-fast) var(--ease-out);
}

.footer-avatar:hover {
  transform: scale(1.12);
  border-color: var(--accent);
}

.footer-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.footer-avatar-initial {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--accent);
}

.footer-username {
  flex: 1;
  min-width: 0;
  text-align: left;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.guest-tag {
  font-style: normal;
  margin-left: var(--space-1);
  padding: 0 var(--space-1);
  border-radius: var(--radius-sm);
  font-size: 10px;
  background: var(--warning-bg);
  color: var(--warning);
}

.footer-hint {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ── 移动端抽屉导航 ── */
.mobile-menu-btn {
  display: none;
}

.mobile-theme-btn {
  display: none;
}

.sidebar-backdrop {
  display: none;
}

@media (max-width: 768px) {
  .app-sidebar {
    transform: translateX(-100%);
    transition: transform var(--duration-normal) var(--ease-out);
    width: 280px;
    box-shadow: var(--shadow-lg);
    /* 移动端去 blur：实色底保持观感，避免抽屉滑动/滚动时全屏滤镜重绘 */
    background: var(--glass-bg-solid);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .app-sidebar.open {
    transform: translateX(0);
  }
  /* 移动端忽略折叠态，始终完整宽度 */
  .app-sidebar.collapsed {
    width: 280px;
    padding: var(--space-5);
  }

  .mobile-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    top: var(--space-3);
    left: var(--space-3);
    z-index: var(--z-sticky);
    width: 40px;
    height: 40px;
    border-radius: var(--radius-md);
    background: var(--glass-bg-solid);
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow-md);
    color: var(--text-primary);
    font-size: 1.1rem;
  }
  .mobile-menu-btn.hidden {
    display: none;
  }

  .mobile-theme-btn {
    /* ThemeToggle 组件根元素：固定定位即可，开关自身有完整滑轨底色，无需玻璃底盒 */
    display: block;
    position: fixed;
    /* 与 40px 高的汉堡按钮视觉垂直居中（开关高 34px，下移 3px） */
    top: calc(var(--space-3) + 3px);
    right: var(--space-3);
    z-index: var(--z-sticky);
  }

  .sidebar-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-sticky) - 1);
    /* 移动端不留 backdrop-filter（全屏滤镜重绘）；提高不透明度补偿去 blur 后的遮挡感 */
    background: rgba(0, 0, 0, 0.45);
  }
}
</style>
