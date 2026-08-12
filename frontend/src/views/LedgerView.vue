<script setup>
import { onMounted } from 'vue'
import LedgerPanel from '@/components/accounting/LedgerPanel.vue'
import { useAccountingStore } from '@/stores/accounting'

const accountingStore = useAccountingStore()

onMounted(() => {
  accountingStore.fetchEntries()
})
</script>

<template>
  <div class="ledger-view">
    <header class="page-header">
      <h1 class="page-title">记账本</h1>
      <p class="page-subtitle">记录每一笔收入与支出，掌握财务流向</p>
    </header>

    <section class="ledger-section card">
      <LedgerPanel />
    </section>
  </div>
</template>

<style scoped>
.ledger-view {
  max-width: 860px;
}

.page-header {
  margin-bottom: var(--space-6);
}

.page-title {
  font-family: var(--font-heading);
  font-size: var(--text-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-1);
}

.page-subtitle {
  color: var(--text-muted);
  font-size: var(--text-sm);
}

.ledger-section {
  padding: var(--space-5);
}
</style>
