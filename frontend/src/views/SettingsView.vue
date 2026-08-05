<template>
  <div class="settings-view">
    <div class="settings-card">
      <h2>⚙️ 设置</h2>

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
        <div id="apiConfigMount">
          <p class="set-hint">API 配置面板将在后续迁移中重新实现。</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useArchiveStore } from '@/stores/archive'

const archiveStore = useArchiveStore()

const paddedHour = computed(() => String(archiveStore.archiveHour).padStart(2, '0'))
const paddedMin = computed(() => String(archiveStore.archiveMinute).padStart(2, '0'))
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
</style>
