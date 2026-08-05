# v10.0 执行计划

## 执行顺序

```
阶段 0 → 脚手架搭建（本任务首要）
  │
  ├── 阶段 1 → v10-routines-fix + v10-xp-theme（数据层基础）
  ├── 阶段 2 → v10-vue3-frontend（时间轴 + 任务卡片）
  ├── 阶段 3 → v10-archive-complete（存档系统）
  ├── 阶段 4 → v10-ai-complete（AI 交互）
  ├── 阶段 5 → v10-vue3-frontend（目标 + 记账 + 计时器）
  ├── 阶段 6 → v10-ui-polish（UI 收束）
  └── 阶段 7 → v10-deploy（部署）
```

## 阶段 0：脚手架搭建 ✅ 当前

### 0.1 项目初始化
```bash
npm create vite@latest frontend -- --template vue
cd frontend && npm install
npm install pinia vue-router axios
```

### 0.2 Vite 配置
- `vite.config.js`：proxy `/api` → `http://localhost:8000`
- `resolve.alias`：`@` → `src/`

### 0.3 CSS 体系迁移
- [ ] 从旧 `style.css` 提取 CSS 变量 → `assets/styles/variables.css`
- [ ] 氛围元素（光晕/纹理/虚光/印章）→ `assets/styles/atmosphere.css`
- [ ] 全局基础样式 → `assets/styles/base.css`
- [ ] 8 套主题 CSS → `assets/styles/themes/`

### 0.4 App Shell 搭建
- [ ] `App.vue`：layout 骨架（header + main + AI drawer 占位）
- [ ] `AppHeader.vue`：Logo + 日期导航占位 + XP 显示 + 模式切换
- [ ] `TimelineView.vue`：空状态占位
- [ ] `AppFeedback.vue`：反馈区占位
- [ ] `ToastContainer.vue`：全局 toast

### 0.5 基础设施
- [ ] `api/client.js`：axios 封装 + JWT 注入 + 错误静默降级
- [ ] `router/index.js`：路由（主页 + 设置页）
- [ ] `stores/`：空 Pinia store 骨架（schedule/routines/goals/archive/ai/currency/accounting/timer/theme/auth）
- [ ] `utils/constants.js`：常量迁移
- [ ] `utils/escapeHtml.js`：XSS 防护
- [ ] `utils/format.js`：时间/数字格式化

### 0.6 验证
- [ ] `npm run dev` → Vite HMR 正常
- [ ] 浏览器打开 → App Shell 可见
- [ ] `npm run build` → 产物 < 500KB（gzip 前）

## 阶段 1：数据层基础

### v10-routines-fix
- [ ] 1.1 `routineStore` 完整实现（模板 CRUD + 每日副本 + 推送）
- [ ] 1.2 `RoutineItem.vue` + `RoutineModal.vue`
- [ ] 1.3 `saveDailyHistory()` 改为读每日数据键
- [ ] 1.4 `tlDeleteTask()` 只影响每日副本

### v10-xp-theme
- [ ] 1.5 `currencyStore` 完整实现（addXP/setXP/transactions）
- [ ] 1.6 `themeStore` 完整实现（8 套主题切换 + 自定义 CSS 变量）
- [ ] 1.7 旧 円/晶圆 术语全量清理
- [ ] 1.8 新增 2 套主题（aurora、ember 已存在，确认可用）

## 阶段 2：主视图

- [ ] 2.1 `scheduleStore` 完整实现
- [ ] 2.2 `TimelineView.vue`（三态色彩 + 翻页动画）
- [ ] 2.3 `TaskCard.vue`（统一渲染 + 编辑入口 + 子任务划掉）
- [ ] 2.4 `TaskModal.vue`（双路径查找 + 保存回写）
- [ ] 2.5 `ImportModal.vue`（JSON 导入）
- [ ] 2.6 `TimelineNav.vue`（日期导航 + 三态指示）
- [ ] 2.7 `timerStore` + `TaskTimer.vue`

## 阶段 3：存档系统

- [ ] 3.1 `archiveStore` 完整实现
- [ ] 3.2 `ArchivePanel.vue` + `ArchiveReview.vue`
- [ ] 3.3 真 PDF 生成（服务端 `/api/export/{date}/pdf`）
- [ ] 3.4 AI 人设 prompt UI 入口（设置面板）
- [ ] 3.5 存档评价在主视图可见

## 阶段 4：AI 交互

- [ ] 4.1 `aiStore` 完整实现
- [ ] 4.2 `AiDrawer.vue` + `AiChat.vue` + `AiTaskPreview.vue`
- [ ] 4.3 动态顺延/重分配（`POST /api/ai/carry-over`）
- [ ] 4.4 抽屉服务端回退
- [ ] 4.5 对话自动摘要

## 阶段 5：其余子系统

- [ ] 5.1 `goalStore` + `GoalBoard.vue` + `GoalDetail.vue` + `GoalCreate.vue`
- [ ] 5.2 `accountingStore` + `LedgerPanel.vue` + Canvas 图表
- [ ] 5.3 `authStore` + 登录/注册

## 阶段 6：UI 收束

- [ ] 6.1 响应式适配（mobile/tablet/desktop）
- [ ] 6.2 日期切换翻页动画
- [ ] 6.3 弹窗系统规范化
- [ ] 6.4 快捷键绑定（Shift+Space、Esc、Ctrl+N、etc）

## 阶段 7：部署

- [ ] 7.1 MySQL 建表脚本
- [ ] 7.2 Docker Compose 生产配置（App + MySQL + Nginx）
- [ ] 7.3 环境变量文档
- [ ] 7.4 域名 + HTTPS 部署指南

## 回滚点

每个阶段提交一次。出问题回退到上一阶段 commit。旧前端在 `study_planner/` 全程保留，随时可切回。
