<script setup>
import { onMounted } from 'vue'
import { useCurrencyStore } from '@/stores/currency'
import { useThemeStore } from '@/stores/theme'
import { useArchiveStore } from '@/stores/archive'
import AppHeader from '@/components/layout/AppHeader.vue'
import DailyReview from '@/components/layout/DailyReview.vue'
import AiDrawer from '@/components/ai/AiDrawer.vue'
import ToastContainer from '@/components/shared/ToastContainer.vue'

const currencyStore = useCurrencyStore()
const themeStore = useThemeStore()
const archiveStore = useArchiveStore()

onMounted(() => {
  currencyStore.initFromCache()
  themeStore.initFromCache()
  archiveStore.initFromCache()
})
</script>

<template>
  <div class="app-shell">
    <!-- Ambient atmosphere (pure CSS, never remove) -->
    <div class="ambient-orb orb-1"></div>
    <div class="ambient-orb orb-2"></div>
    <div class="ambient-orb orb-3"></div>
    <div class="paper-texture"></div>
    <div class="hanko-seal"></div>

    <AppHeader />

    <main class="app-main" :class="{ 'ai-shifted': false }">
      <router-view />
    </main>

    <DailyReview />
    <AiDrawer />
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
}
</style>
