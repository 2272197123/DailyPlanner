<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import anime from 'animejs'
import { useCurrencyStore } from '@/stores/currency'
import { useThemeStore } from '@/stores/theme'
import { useArchiveStore } from '@/stores/archive'
import { useAiStore } from '@/stores/ai'
import { useMoodStore } from '@/stores/mood'
import { useScheduleStore } from '@/stores/schedule'
import { useGoalStore } from '@/stores/goals'
import { useAccountingStore } from '@/stores/accounting'
import { useRoutineStore } from '@/stores/routines'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AiDrawer from '@/components/ai/AiDrawer.vue'
import ToastContainer from '@/components/shared/ToastContainer.vue'

const currencyStore = useCurrencyStore()
const themeStore = useThemeStore()
const archiveStore = useArchiveStore()
const aiStore = useAiStore()
const moodStore = useMoodStore()
const scheduleStore = useScheduleStore()
const goalStore = useGoalStore()
const accountingStore = useAccountingStore()
const routineStore = useRoutineStore()

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
  accountingStore.initFromCache()
  routineStore.initFromCache()
  if (!isPublicPage.value) {
    moodStore.fetchMoods()
  }

  // Ambient orbs slow float + scale animation
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
