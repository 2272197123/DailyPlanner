<script setup>
import { useToastStore } from '@/stores/toast'

const toastStore = useToastStore()
</script>

<template>
  <div class="toast-container" v-if="toastStore.toasts.length">
    <transition-group name="toast">
      <div
        v-for="t in toastStore.toasts"
        :key="t.id"
        class="toast-item"
        :class="'toast-' + (t.type || '')"
        @click="toastStore.dismiss(t.id)"
      >
        {{ t.message }}
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-container {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  max-width: 360px;
}

.toast-item {
  padding: var(--space-3) var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: opacity var(--duration-fast) var(--ease-out);
  animation: toast-in var(--duration-normal) var(--ease-out);
}

.toast-item.toast-ok {
  border-left: 3px solid var(--success);
}

.toast-item.toast-err {
  border-left: 3px solid var(--danger);
}

.toast-item.toast-warn {
  border-left: 3px solid var(--warning);
}

@keyframes toast-in {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

.toast-leave-active {
  transition: opacity var(--duration-fast) var(--ease-out);
}

.toast-leave-to {
  opacity: 0;
}
</style>
