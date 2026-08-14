<script setup>
import { onMounted } from 'vue'
import { useNewsStore } from '@/stores/news'

const newsStore = useNewsStore()

onMounted(() => {
  newsStore.init()
})
</script>

<template>
  <div class="news-view">
    <header class="page-header">
      <div>
        <h1 class="page-title">新闻热点</h1>
        <p class="page-subtitle">选择感兴趣的领域与来源，定制你的信息流</p>
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

    <!-- 新闻源选择（按领域分组） -->
    <div class="source-config card">
      <div
        v-for="group in newsStore.domains"
        :key="group.domain"
        class="source-group"
      >
        <span class="source-domain">{{ group.domain }}</span>
        <div class="source-chips">
          <span
            v-for="source in group.sources"
            :key="source.id"
            class="source-chip"
            :class="{ active: newsStore.isActive(source.id) }"
            :title="source.desc"
            @click="newsStore.toggleSource(source.id)"
          >
            {{ source.name }}
          </span>
        </div>
      </div>
    </div>

    <p v-if="newsStore.errors._all" class="feed-error card">{{ newsStore.errors._all }}</p>

    <!-- 分源新闻流 -->
    <template v-for="section in newsStore.sections" :key="section.source">
      <section v-if="section.items.length || newsStore.errors[section.source]" class="news-section">
        <h2 class="section-title">
          {{ section.name }}
          <span class="section-domain">{{ section.domain }}</span>
        </h2>
        <p v-if="newsStore.errors[section.source]" class="section-error">
          该源暂时无法加载，稍后再试
        </p>
        <div v-else class="news-grid">
          <a
            v-for="(news, index) in section.items"
            :key="section.source + index"
            class="news-card card hover-lift"
            :href="news.url"
            target="_blank"
            rel="noopener noreferrer"
            :style="{ animationDelay: `${index * 40}ms` }"
          >
            <span v-if="news.hot" class="news-rank">#{{ news.hot }}</span>
            <h3 class="news-title">{{ news.title }}</h3>
            <p v-if="news.summary" class="news-summary">{{ news.summary }}</p>
          </a>
        </div>
      </section>
    </template>

    <div v-if="!newsStore.loading && !newsStore.sections.length" class="empty-state card">
      <div class="empty-state-icon">✦</div>
      <div class="empty-state-title">暂无新闻</div>
      <div class="empty-state-desc">在上方至少启用一个新闻源，即可获取最新内容。</div>
    </div>

    <p v-if="newsStore.fetchedAt" class="fetched-at">更新于 {{ newsStore.fetchedAt }}（服务端缓存 10 分钟）</p>
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
  flex-shrink: 0;
}

.anim-spin {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── 新闻源选择 ── */
.source-config {
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.source-group {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.source-domain {
  flex-shrink: 0;
  width: 44px;
  padding-top: var(--space-1);
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--text-muted);
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

/* ── 分源新闻流 ── */
.news-section {
  margin-bottom: var(--space-6);
}

.section-title {
  font-family: var(--font-heading);
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.section-domain {
  padding: 1px var(--space-2);
  border-radius: var(--radius-sm);
  font-size: var(--text-xs);
  font-weight: 400;
  background: var(--bg-muted);
  color: var(--text-muted);
}

.section-error {
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-xs);
  background: var(--warning-bg);
  color: var(--warning);
}

.feed-error {
  padding: var(--space-3) var(--space-4);
  margin-bottom: var(--space-4);
  font-size: var(--text-sm);
  color: var(--danger);
  background: var(--danger-bg);
}

.news-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-3);
}

.news-card {
  display: block;
  padding: var(--space-4) var(--space-5);
  position: relative;
  overflow: hidden;
  opacity: 0;
  animation: fade-up 0.5s var(--ease-out) forwards;
  text-decoration: none;
  color: inherit;
}

.news-rank {
  position: absolute;
  top: var(--space-3);
  right: var(--space-4);
  font-family: var(--font-data);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--accent);
  opacity: 0.7;
}

.news-title {
  font-family: var(--font-heading);
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-summary {
  margin-top: var(--space-2);
  font-size: var(--text-xs);
  color: var(--text-secondary);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.empty-state {
  padding: var(--space-10) var(--space-6);
  margin-bottom: var(--space-6);
}

.fetched-at {
  text-align: center;
  font-size: var(--text-xs);
  color: var(--text-muted);
  margin-bottom: var(--space-6);
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
  }
  .news-grid {
    grid-template-columns: 1fr;
  }
  .source-domain {
    width: 36px;
  }
}
</style>
