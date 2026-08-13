<script setup>
import { onMounted } from 'vue'
import { useNewsStore } from '@/stores/news'

const newsStore = useNewsStore()

onMounted(() => {
  newsStore.loadSources()
})
</script>

<template>
  <div class="news-view">
    <header class="page-header">
      <div>
        <h1 class="page-title">科技热点</h1>
        <p class="page-subtitle">每日技术资讯，支持自定义新闻源</p>
      </div>
      <button
        class="btn btn-secondary btn-sm refresh-btn"
        :disabled="newsStore.loading"
        @click="newsStore.refresh"
      >
        <span :class="{ 'anim-spin': newsStore.loading }">↻</span>
        {{ newsStore.loading ? '刷新中…' : '刷新' }}
      </button>
    </header>

    <div class="source-config card">
      <div class="source-title">新闻源</div>
      <div class="source-chips">
        <span
          v-for="source in newsStore.sources"
          :key="source.id"
          class="source-chip"
          :class="{ active: source.active }"
          @click="newsStore.toggleSource(source.id)"
        >
          {{ source.name }}
        </span>
      </div>
    </div>

    <div class="news-grid">
      <article
        v-for="(news, index) in newsStore.filteredItems"
        :key="news.id"
        class="news-card card hover-lift"
        :style="{ animationDelay: `${index * 60}ms` }"
      >
        <div class="news-tag">{{ news.tag }}</div>
        <h3 class="news-title">{{ news.title }}</h3>
        <p class="news-summary">{{ news.summary }}</p>
        <div class="news-meta">
          <span class="news-source">{{ news.source }}</span>
          <span class="news-time">{{ news.time }}</span>
        </div>
      </article>
    </div>

    <div v-if="!newsStore.filteredItems.length" class="empty-state card">
      <div class="empty-state-icon">✦</div>
      <div class="empty-state-title">暂无新闻</div>
      <div class="empty-state-desc">请至少启用一个新闻源，或点击刷新获取最新内容。</div>
    </div>

    <div class="news-hint card">
      <span class="hint-icon">✦</span>
      <span>当前为 mock 数据。后续可接入 Hacker News API、RSS 源或自建后端代理。</span>
    </div>
  </div>
</template>

<style scoped>
.news-view {
  max-width: 960px;
  margin: 0 auto;
}

@media (min-width: 1440px) {
  .news-view {
    max-width: 1100px;
  }
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
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

.refresh-btn {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.anim-spin {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.source-config {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-6);
  flex-wrap: wrap;
}

.source-title {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
}

.source-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

.source-chip {
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  background: var(--bg-muted);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  border: 1px solid transparent;
}

.source-chip:hover {
  background: var(--bg-elevated);
  border-color: var(--border);
}

.source-chip.active {
  background: var(--accent);
  color: var(--text-inverse);
}

.news-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-4);
  margin-bottom: var(--space-6);
}

.news-card {
  padding: var(--space-5);
  position: relative;
  overflow: hidden;
  opacity: 0;
  animation: fade-up 0.5s var(--ease-out) forwards;
}

.news-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  font-weight: 500;
  background: var(--info-bg);
  color: var(--info);
  margin-bottom: var(--space-3);
}

.news-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-2);
  line-height: 1.4;
}

.news-summary {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: var(--space-4);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.news-hint {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  background: var(--warning-bg);
}

.hint-icon {
  font-size: 1.25rem;
}

.empty-state {
  padding: var(--space-10) var(--space-6);
  margin-bottom: var(--space-6);
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }
  .news-grid {
    grid-template-columns: 1fr;
  }
}
</style>
