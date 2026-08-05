# v10.0 架构设计 — Vue 3 + FastAPI + SQL

## 1. 项目结构

```
DailyPlan/                        # 仓库根（monorepo）
├── frontend/                     # Vue 3 SPA（新建）
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── src/
│   │   ├── main.js               # Vue 入口
│   │   ├── App.vue               # 根组件
│   │   ├── router/               # Vue Router
│   │   │   └── index.js
│   │   ├── stores/               # Pinia stores
│   │   │   ├── schedule.js       # 日程数据
│   │   │   ├── routines.js       # 日课数据
│   │   │   ├── goals.js          # 长期目标
│   │   │   ├── archive.js        # 存档数据
│   │   │   ├── ai.js             # AI 对话
│   │   │   ├── currency.js       # XP 系统
│   │   │   ├── accounting.js     # 记账
│   │   │   ├── timers.js         # 计时器
│   │   │   ├── theme.js          # 主题/皮肤
│   │   │   └── auth.js           # 用户认证
│   │   ├── api/                  # API 调用层（替换旧 api.js）
│   │   │   ├── client.js         # axios/fetch 封装
│   │   │   ├── schedule.js
│   │   │   ├── archive.js
│   │   │   ├── goals.js
│   │   │   ├── auth.js
│   │   │   └── ai.js
│   │   ├── components/           # Vue 组件
│   │   │   ├── layout/
│   │   │   │   ├── AppHeader.vue      # 顶栏（日期、模式、XP、登录）
│   │   │   │   ├── AppSidebar.vue     # 侧栏（目标面板）
│   │   │   │   └── AppFeedback.vue    # 底部反馈区
│   │   │   ├── timeline/
│   │   │   │   ├── TimelineView.vue   # 时间轴主视图
│   │   │   │   ├── TaskCard.vue       # 任务卡片（统一渲染）
│   │   │   │   ├── RoutineItem.vue    # 日课条目
│   │   │   │   └── TimelineNav.vue    # 日期导航条
│   │   │   ├── goals/
│   │   │   │   ├── GoalBoard.vue      # 目标看板
│   │   │   │   ├── GoalDetail.vue     # 目标详情
│   │   │   │   └── GoalCreate.vue     # 创建/编辑目标
│   │   │   ├── archive/
│   │   │   │   ├── ArchivePanel.vue   # 存档面板
│   │   │   │   ├── ArchiveReview.vue  # 自评 + AI 评价
│   │   │   │   └── ArchiveExport.vue  # MD/PDF 导出
│   │   │   ├── ai/
│   │   │   │   ├── AiDrawer.vue       # AI 抽屉面板
│   │   │   │   ├── AiChat.vue         # 对话消息列表
│   │   │   │   └── AiTaskPreview.vue  # 任务预览编辑
│   │   │   ├── accounting/
│   │   │   │   ├── LedgerPanel.vue    # 记账面板
│   │   │   │   ├── AccChart.vue       # 图表（饼图/柱状图）
│   │   │   │   └── AccEntry.vue       # 记账条目
│   │   │   ├── timer/
│   │   │   │   └── TaskTimer.vue      # 任务计时器
│   │   │   ├── modals/
│   │   │   │   ├── TaskModal.vue      # 任务编辑弹窗
│   │   │   │   ├── RoutineModal.vue   # 日课编辑弹窗
│   │   │   │   ├── ImportModal.vue    # JSON 导入弹窗
│   │   │   │   └── SettingModal.vue   # 设置面板
│   │   │   └── shared/
│   │   │       ├── ProgressBar.vue
│   │   │       ├── ConfirmDialog.vue
│   │   │       ├── ToastContainer.vue
│   │   │       └── DatePicker.vue
│   │   ├── composables/           # Vue 组合式函数
│   │   │   ├── useDate.js         # 日期导航逻辑
│   │   │   ├── useTimer.js        # 计时器逻辑
│   │   │   ├── useTheme.js        # 主题切换
│   │   │   └── useKeyboard.js     # 快捷键绑定
│   │   ├── utils/
│   │   │   ├── escapeHtml.js      # XSS 防护
│   │   │   ├── format.js          # 时间/数字格式化
│   │   │   └── constants.js       # 常量（XP_LVL_BASE 等）
│   │   └── assets/
│   │       ├── styles/
│   │       │   ├── variables.css   # CSS 变量（--accent 等）
│   │       │   ├── base.css        # 全局基础样式
│   │       │   ├── atmosphere.css  # 氛围元素（光晕/纹理/虚光/印章）
│   │       │   └── themes/         # 主题 CSS
│   │       │       ├── sakura.css
│   │       │       ├── forest.css
│   │       │       ├── ocean.css
│   │       │       ├── sunset.css
│   │       │       ├── noir.css
│   │       │       ├── vapor.css
│   │       │       ├── aurora.css
│   │       │       └── ember.css
│   │       └── fonts/
│   └── public/
├── server/                        # FastAPI 后端（保留并优化）
│   ├── main.py                    # 32 个 REST 端点
│   ├── db.py                      # DB 抽象层（SQLite/MySQL/PG）
│   ├── models.py                  # Pydantic 模型
│   ├── auth.py                    # JWT 认证
│   ├── ai_proxy.py                # DeepSeek AI 代理
│   └── static/                    # vite build 产物输出目录
├── study_planner/                 # 旧前端（逐步废弃）
│   ├── js/                        # 旧 27 个 JS 模块
│   ├── css/                       # 旧 CSS
│   └── index_modular.html         # 旧入口
├── docker-compose.yml
├── Dockerfile
├── CLAUDE.md
└── .trellis/
```

## 2. 组件树

```
App.vue
├── AppHeader.vue
│   ├── Logo + 日期导航条（← 今天 →）
│   ├── ModeSwitch（完整/最低/恢复）
│   ├── BalanceDisplay（Lv.N · X XP）
│   ├── GoalIndicator（活跃目标下拉）
│   ├── AuthButton（登录/用户菜单）
│   └── ToolMenu（AI 配置、记账、存档、设置）
├── AppSidebar.vue（目标看板）
│   ├── GoalBoard.vue
│   │   └── GoalCard.vue × N
│   └── GoalDetail.vue（展开时）
│       ├── 阶段进度
│       ├── 里程碑列表
│       └── AI 讨论区
├── TimelineView.vue（主视图）
│   ├── TimelineNav.vue
│   ├── TaskCard.vue × N
│   │   ├── TaskTimer.vue（内嵌）
│   │   ├── 子任务列表（可划掉）
│   │   └── 编辑/删除按钮
│   ├── RoutineItem.vue × N
│   │   └── 勾选 + XP 标记
│   └── EmptyState.vue（无计划时）
├── AppFeedback.vue（底部）
│   ├── 文字反馈输入
│   ├── 星级评分
│   └── 保存按钮
├── AiDrawer.vue（右侧抽屉，条件渲染）
│   ├── AiChat.vue（消息列表）
│   ├── AiTaskPreview.vue（任务预览编辑）
│   └── 输入框（多行可拖拽）
├── ToastContainer.vue（全局 toast）
├── TaskModal.vue（条件渲染）
├── ImportModal.vue（条件渲染）
├── LedgerPanel.vue（条件渲染）
├── ArchivePanel.vue（条件渲染）
└── SettingModal.vue（条件渲染）
```

## 3. 数据流

### Pinia Store 架构

```
scheduleStore ─── 日程数据（当前日期 blocks + 所有日期 schedules）
                 ├── fetchDay(date)     → GET /api/plan/{date}
                 ├── saveDay(date)      → PUT /api/plan/{date}
                 ├── importPlan(blocks) → 写入 store + API + LS
                 └── currentDate 响应式

routineStore ─── 日课模板 + 每日副本
                ├── fetchRoutines()       → GET /api/routines
                ├── saveRoutine(routine)  → PUT /api/routines/{id}
                ├── pushToTemplate(date)  → 当天改动同步到模板
                └── dailyCopies: { [date]: Routine[] }

goalStore ─── 长期目标
             ├── fetchGoals()           → GET /api/goals
             ├── saveGoal(goal)         → PUT /api/goals/{id}
             ├── toggleMilestone(id, msId)
             └── activeGoalId

archiveStore ─── 存档数据
                ├── fetchArchive(date)   → GET /api/day-data/{date}
                ├── archiveDay(date, review) → PUT /api/day-data/{date}
                ├── exportMarkdown(date)
                ├── exportPDF(date)
                └── aiPersonaPrompt

aiStore ─── AI 对话
           ├── messages[]
           ├── sendMessage(text)        → POST /api/chat (or direct)
           ├── previewBlocks[]          → AI 生成待确认任务
           ├── carryOverUnfinished()    → 检测未完成任务
           └── redistribute()           → 重分配工作量

currencyStore ─── XP 系统
                ├── balance: number
                ├── level: computed
                ├── addXP(amount, reason)
                ├── transactions[]
                └── fetchLedger()       → GET /api/ledger

accountingStore ─── 记账
                  ├── entries[]
                  ├── fetchEntries(from, to) → GET /api/accounting
                  ├── addEntry(entry)       → POST /api/accounting
                  └── period: 'week'|'month'|'quarter'|'year'|'custom'

timerStore ─── 计时器
             ├── timers: { [taskId]: TimerState }
             ├── startTimer(taskId)
             ├── pauseTimer(taskId)
             ├── resetTimer(taskId)
             └── elapsed: computed per task

themeStore ─── 主题
             ├── activeTheme: string
             ├── customVars: { [key]: string }
             ├── applyTheme(name)
             └── themes: ThemePreset[]
```

### 数据读写模式（统一）

```
用户操作 → store.action() → 三步写：
  1. Pinia state 即时更新（响应式 UI）
  2. LS.set() 本地缓存（离线兜底）
  3. API.fetch() 异步写通服务器（失败静默降级 + toast 提示）

页面加载 → store.init() → 三步读：
  1. API.fetch() 服务器优先
  2. 失败 → LS.get() 本地兜底
  3. 都没有 → 空状态 / 模板默认值
```

## 4. API 层设计

### 现有端点（保留不变）

32 个 REST 端点路径和响应格式完全保留：
- `GET/PUT /api/plan/{date}` — 日程计划
- `GET/PUT /api/routines` — 日课模板
- `GET/POST/PUT/DELETE /api/goals` — 长期目标
- `POST /api/generate-plan` — AI 计划生成
- `GET/PUT /api/day-data/{date}` — 每日数据
- `GET/PUT /api/chat-history/{date}` — AI 对话历史
- `GET/POST/PUT/DELETE /api/accounting` — 记账
- `POST /api/auth/register|login|refresh` — 认证
- `GET/PUT /api/balance` — XP 余额
- `GET/POST /api/ledger` — 交易流水
- `GET/PUT /api/progress/{date}` — 进度反馈
- `GET/PUT /api/mode-config` — 档位配置

### 新增端点（v10.0）

| 方法 | 路径 | 用途 |
|------|------|------|
| `POST` | `/api/archive/{date}/review` | 触发 AI 存档评价 |
| `GET` | `/api/export/{date}/pdf` | 服务端生成真 PDF |
| `PUT` | `/api/preferences` | 用户偏好（AI 人设 prompt 等） |
| `POST` | `/api/ai/carry-over` | 未完成任务顺延/重分配 |

### 前端 API 调用层

```javascript
// frontend/src/api/client.js
// 统一封装：base URL、JWT 注入、错误处理、超时
import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

api.interceptors.request.use(config => {
  const token = localStorage.getItem('dp_authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  res => res,
  err => {
    // 静默降级：API 不可用时 toast 提示，不影响 UI 操作
    if (!err.response) console.warn('[API] Server unreachable, using local cache');
    return Promise.reject(err);
  }
);
```

## 5. 迁移策略：绞杀者模式

### 阶段 0：脚手架搭建
1. `npm create vite@latest frontend -- --template vue`
2. 安装 Pinia、Vue Router、axios
3. 配置 Vite proxy → FastAPI :8000
4. 迁移 CSS 变量 + 氛围元素 → `frontend/src/assets/styles/`
5. 搭建空 App shell（Header + 日期导航占位）

### 阶段 1：核心数据层（日课 + XP）
1. 迁移 `routineStore` → Pinia
2. 迁移 `currencyStore` → Pinia
3. 实现 `RoutineItem.vue`、`BalanceDisplay`
4. 验证：旧后端 + 新前端 = 日课 CRUD 正常

### 阶段 2：时间轴 + 任务卡片
1. 迁移 `scheduleStore` → Pinia
2. 实现 `TimelineView.vue`、`TaskCard.vue`、`TaskModal.vue`
3. 实现日期导航 + 三态色彩
4. 验证：导入 JSON → 时间轴渲染 → 编辑 → 勾选完成

### 阶段 3：存档系统
1. 迁移 `archiveStore` → Pinia
2. 实现 `ArchivePanel.vue`、`ArchiveReview.vue`、`ArchiveExport.vue`
3. 实现真 PDF 导出 + AI 人设 UI
4. 验证：存档 → 锁定 → 历史查看 → 导出

### 阶段 4：AI 交互
1. 迁移 `aiStore` → Pinia
2. 实现 `AiDrawer.vue`、`AiChat.vue`、`AiTaskPreview.vue`
3. 实现动态顺延 + 服务端回退
4. 验证：多轮对话 → 任务预览编辑 → 导入 → 顺延未完成任务

### 阶段 5：目标 + 记账 + 计时器
1. 迁移 `goalStore` → `GoalBoard.vue`、`GoalDetail.vue`
2. 迁移 `accountingStore` → `LedgerPanel.vue`、图表 Canvas/Vue
3. 迁移 `timerStore` → `TaskTimer.vue`
4. 验证：各模块独立功能正常

### 阶段 6：UI 收束 + 部署
1. 响应式适配 + 动画打磨
2. 移除旧 `study_planner/js/`
3. Docker Compose 生产配置
4. 部署文档

### 每个迁移单元的标准流程

```
1. 读旧 JS 模块 → 理解逻辑
2. 写 Pinia store（保持 API 接口兼容）
3. 写 Vue 组件
4. 本地验证（Vite dev + FastAPI :8000）
5. 删除旧 JS 文件
6. 提交
```

## 6. 跨切面的设计决策

### CSS 变量体系

```css
:root {
  /* 主色（设计系统基线，不可变） */
  --accent: #1e2030;
  --accent-light: #2a2d42;

  /* 时间三态 */
  --state-past: #d4a76a;      /* 琥珀 · 已存档 */
  --state-present: #1e2030;   /* 靛蓝 · 今天 */
  --state-future: #8a7bb8;    /* 淡紫 · 未来 */

  /* 功能色 */
  --success: #4a9;
  --warning: #ea0;
  --danger: #e55;
  --info: #68e;

  /* 表面色 */
  --bg: #faf8f5;
  --bg-card: #fffd;
  --bg-elevated: #ffff;

  /* 文字 */
  --text-primary: #1a1a1a;
  --text-secondary: #666;
  --text-muted: #999;

  /* 字体 */
  --font-heading: 'Noto Serif SC', serif;
  --font-data: 'JetBrains Mono', monospace;
  --font-body: system-ui, -apple-system, sans-serif;

  /* 氛围 */
  --ambient-opacity: 0.6;
  --paper-texture-opacity: 0.4;
}
```

### 响应式断点

| 断点 | 宽度 | 布局变化 |
|------|------|---------|
| Desktop | ≥ 1024px | 侧栏可见 + AI 抽屉（380px）+ 时间轴居中 |
| Tablet | 768-1023px | 侧栏折叠为汉堡菜单，AI 抽屉全屏 overlay |
| Mobile | < 768px | 单列布局，卡片全宽，底部 Tab 导航 |

### 氛围元素渲染

```vue
<!-- App.vue -->
<template>
  <div class="app-shell">
    <div class="ambient-orb orb-left"></div>
    <div class="ambient-orb orb-right"></div>
    <div class="paper-texture"></div>
    <div class="hanko-seal"></div>
    <!-- 页面内容 -->
  </div>
</template>
```

氛围元素始终纯 CSS 渲染，Vue 组件不做任何感知。

## 7. 设计系统约束重申

1. **主色**：`--accent: #1e2030`（靛蓝墨），不用旧版 `#2b3a5c` / `#4F46E5`
2. **字体**：Noto Serif SC（标题）+ JetBrains Mono（数据）+ 系统无衬线（正文）
3. **氛围元素不可移除**：光晕球体、宣纸纹理、墨色虚光、朱砂印章
4. **CSS 变量是唯一颜色入口** — 绝不在组件中硬编码颜色
5. **不用 `transition: all`** — 明确指定属性
6. **主色变量不可被主题覆盖** — 主题仅覆盖 `--surface-*` 和 `--accent-*` 子变量

## 8. 兼容性 & 回滚

- **API 向后兼容**：路径/格式不变，旧前端（`study_planner/`）在迁移期间仍可通过 `index_modular.html` 访问
- **数据迁移**：LS → 服务器数据库通过首次登录时的 `POST /api/migrate` 一次性完成
- **回滚**：Vue 3 前端从不同端口/路径服务，迁移期间旧前端保持可访问，出问题可立即回退
