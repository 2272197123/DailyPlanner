<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import anime from 'animejs'
import { useCurrencyStore } from '@/stores/currency'
import { useThemeStore } from '@/stores/theme'
import { useArchiveStore } from '@/stores/archive'
import { useAiStore } from '@/stores/ai'
import { useMoodStore } from '@/stores/mood'
import { useScheduleStore } from '@/stores/schedule'
import { useGoalStore } from '@/stores/goals'
import { useRoutineStore } from '@/stores/routines'
import { useToastStore } from '@/stores/toast'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AiDrawer from '@/components/ai/AiDrawer.vue'
import ToastContainer from '@/components/shared/ToastContainer.vue'
import CardReveal from '@/components/collection/CardReveal.vue'

const currencyStore = useCurrencyStore()
const themeStore = useThemeStore()
const archiveStore = useArchiveStore()
const aiStore = useAiStore()
const moodStore = useMoodStore()
const scheduleStore = useScheduleStore()
const goalStore = useGoalStore()
const routineStore = useRoutineStore()
const toastStore = useToastStore()

const route = useRoute()

/* Public pages (e.g. /login) render outside the app shell */
const isPublicPage = computed(() => !!route.meta.public)

const orbsRef = ref([])

onMounted(() => {
  currencyStore.initFromCache()
  themeStore.initFromCache()
  archiveStore.initFromCache()
  scheduleStore.initFromCache()
  goalStore.initFromCache()
  routineStore.initFromCache()
  if (!isPublicPage.value) {
    moodStore.fetchMoods()
  }

  /* saveDay 网络层有 400ms 防抖：页面隐藏/关闭前 flush 待发保存，避免丢数据
     （localStorage 在 saveDay 时已即时写入，这里是服务端持久化兜底） */
  document.addEventListener('visibilitychange', flushPendingSaves)
  window.addEventListener('pagehide', flushPendingSaves)

  /* Ambient orbs slow float + scale animation
     移动端（≤768px）与 reduced-motion 下 CSS 已隐藏 orb，跳过 JS 动画避免空跑 */
  const orbsDisabled = window.matchMedia('(max-width: 768px)').matches ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!orbsDisabled) {
    anime({
      targets: '.ambient-orb',
      translateX: () => anime.random(-30, 30),
      translateY: () => anime.random(-20, 20),
      scale: [1, 1.08, 1],
      opacity: [0.18, 0.28, 0.18],
      easing: 'easeInOutSine',
      duration: () => anime.random(8000, 14000),
      delay: anime.stagger(2000),
      loop: true,
      direction: 'alternate'
    })
  }
})

function flushPendingSaves() {
  scheduleStore.flushAllSaves()
}

let autoArchiveTimer = null

async function checkAutoArchive() {
  const done = await archiveStore.checkAutoArchive()
  if (done) toastStore.ok('🌙 已到存档时间，已自动存档今日复盘')
}

function handleVisibleArchive() {
  if (!document.hidden) checkAutoArchive()
}

/* 到点自动存档检查器 + 近期未存档补档提示：会话内只初始化一次。
   App 是常驻根组件，登录走 router.push 不会重挂载——若挂载时在 /login
   （公开页），须等切到非公开页再启动，否则整个会话都不会自动存档 */
let archiveChecksInit = false
function initArchiveChecks() {
  if (archiveChecksInit || isPublicPage.value) return
  archiveChecksInit = true
  checkAutoArchive()
  autoArchiveTimer = setInterval(checkAutoArchive, 60000)
  document.addEventListener('visibilitychange', handleVisibleArchive)
  archiveStore.checkMissedArchives().then(missed => {
    if (missed && missed.length) {
      toastStore.warn(missed.join('、') + ' 未存档，可在计划页复盘面板补档')
    }
  })
}

onMounted(initArchiveChecks)
watch(isPublicPage, initArchiveChecks)

onBeforeUnmount(() => {
  if (autoArchiveTimer) clearInterval(autoArchiveTimer)
  document.removeEventListener('visibilitychange', handleVisibleArchive)
})
</script>

<template>
  <div class="app-shell" :class="{ 'no-sidebar': isPublicPage }">
    <!-- Ambient atmosphere (pure CSS, never remove) -->
    <div class="ambient-orb orb-1" ref="orbsRef"></div>
    <div class="ambient-orb orb-2" ref="orbsRef"></div>
    <div class="ambient-orb orb-3" ref="orbsRef"></div>
    <div class="paper-texture"></div>
    <div class="hanko-seal"></div>

    <AppSidebar v-if="!isPublicPage" />

    <main class="app-main" :class="{ 'ai-shifted': aiStore.drawerOpen && !isPublicPage }">
      <router-view v-slot="{ Component }">
        <transition name="page" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>

    <template v-if="!isPublicPage">
      <AiDrawer />
    </template>
    <!-- 掉卡/签到 新卡揭示 + 成就祝贺（全局单例，消费 collection.revealQueue） -->
    <CardReveal v-if="!isPublicPage" />
    <ToastContainer />
  </div>
</template>

<style scoped>
.app-shell {
  position: relative;
  z-index: 10;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding-left: 260px;
}

.app-shell.no-sidebar {
  padding-left: 0;
}

.app-main {
  flex: 1;
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-8) var(--space-12);
  width: 100%;
  transition: margin-right var(--duration-normal) var(--ease-out);
}

.app-main.ai-shifted {
  margin-right: 380px;
}

@media (min-width: 1600px) {
  .app-main {
    max-width: 1320px;
  }
}

@media (max-width: 768px) {
  .app-shell {
    padding-left: 0;
  }
  .app-main {
    /* 顶部留出汉堡按钮的空间 */
    padding: calc(var(--space-4) + 44px) var(--space-4) var(--space-8);
  }
  .app-main.ai-shifted {
    margin-right: 0;
  }
}
</style>
