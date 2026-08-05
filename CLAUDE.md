# DailyPlan — AI Agent 交接文档

> 本文档供 AI Agent（Claude Code / Trellis / 其他）阅读。
> 用户文档见 [study_planner/README.md](study_planner/README.md)。
> Trellis 工作流见 `.trellis/workflow.md`。

---

## 一、启动

```bash
# 生产模式（FastAPI 后端 + Vue 3 SPA）
cd study_planner && python launcher.py    # :5000，自动打开浏览器

# 纯静态回退（无 fastapi/uvicorn 时）
# launcher.py 自动检测并退化为静态模式

# Vue 3 开发模式（HMR 热更新）
cd frontend && npm run dev                 # :5173，proxy /api → :8000
```

**入口**：
- FastAPI 模式：`http://localhost:5000/` → Vue 3 SPA（`server/static/index.html`）
- 无 Vue 3 构建产物时自动回退到 `study_planner/index_modular.html`（旧前端）
- Vue 3 构建：`cd frontend && npm run build` → 产物输出到 `server/static/`

---

## 二、项目结构（v10.0）

```
DailyPlan/
├── frontend/                 ← Vue 3 SPA（新前端，主力）
│   ├── src/
│   │   ├── stores/           ← 10 个 Pinia store（schedule/routines/goals/archive/ai/currency/accounting/timer/theme/toast）
│   │   ├── components/       ← Vue 组件（timeline/goals/archive/ai/accounting/layout/shared）
│   │   ├── api/client.js     ← axios 封装（JWT 注入 + 错误静默降级）
│   │   ├── utils/            ← constants.js + format.js
│   │   └── assets/styles/    ← CSS 变量 + 基础样式 + 氛围元素
│   └── vite.config.js        ← proxy /api → :8000，build → server/static/
├── server/                   ← FastAPI 后端（32 个 REST 端点）
│   ├── main.py               ← 应用入口 + 端点 + 静态文件挂载
│   ├── db.py                 ← DB 抽象层（SQLite/MySQL/PostgreSQL）
│   ├── models.py             ← Pydantic 模型
│   ├── auth.py               ← JWT 认证
│   ├── ai_proxy.py           ← DeepSeek AI 代理
│   └── static/               ← vite build 产物（index.html + assets/）
├── study_planner/            ← 旧前端（保留兼容，逐步废弃）
│   ├── js/                   ← 旧 27 个 vanilla JS 模块
│   ├── css/                  ← 旧 CSS
│   └── index_modular.html    ← 旧入口
└── .trellis/                 ← Trellis 工作流系统
```

---

## 三、Pinia Store 索引（Vue 3）

| Store | 文件 | 核心职责 |
|-------|------|---------|
| `useScheduleStore` | `stores/schedule.js` | 日程数据、日期导航、模式切换、导入、时间轴计算 |
| `useRoutineStore` | `stores/routines.js` | 日课模板 + 每日副本 + pushToTemplate |
| `useGoalStore` | `stores/goals.js` | 长期目标 CRUD、阶段/里程碑勾选 |
| `useArchiveStore` | `stores/archive.js` | 每日复盘、存档快照、AI 评价、MD/PDF 导出 |
| `useAiStore` | `stores/ai.js` | AI 抽屉、智能问候、上下文注入、任务顺延、对话压缩 |
| `useCurrencyStore` | `stores/currency.js` | XP 余额（唯一写入点）、等级计算、交易流水 |
| `useAccountingStore` | `stores/accounting.js` | 记账条目、分类管理、时间筛选、Canvas 图表 |
| `useThemeStore` | `stores/theme.js` | 8 套主题切换、自定义 CSS 变量 |
| `useToastStore` | `stores/toast.js` | 全局 toast 通知 |

---

## 四、数据流原则

### 写操作（三步）
1. Pinia state 即时更新（响应式 UI）
2. `localStorage.setItem()` 本地缓存
3. `api.put/post()` 异步写服务器（失败静默降级）

### 读操作（两步）
1. `api.get()` 服务器优先
2. 失败 → `localStorage.getItem()` 兜底

### XP 余额唯一写入点

`useCurrencyStore.addXP()` / `setBalance()` 是唯二修改 XP 的路径。

---

## 五、关键架构约束

### Vue 3 规范
- Composition API + `<script setup>` 语法
- CSS 变量是唯一颜色入口，组件中不硬编码颜色
- 氛围元素（光晕球体、宣纸纹理、墨色虚光、朱砂印章）在 `App.vue` 纯 CSS 渲染，组件不感知

### 设计系统
- 主色：`--accent: #1e2030`（靛蓝墨）
- 字体：Noto Serif SC（标题）+ JetBrains Mono（数据）+ 系统无衬线
- 时间三态：`--state-past`（琥珀） / `--accent`（默认） / `--state-future`（淡紫）
- 过渡：必须指定属性，不用 `transition: all`

### API 向后兼容
- 现有 32 个 FastAPI 端点路径和响应格式保持不变
- 存量数据从 LS 迁移到服务器数据库通过 API 调用完成

### 禁止事项
- 不引入 `const` / `let` / 箭头函数 / 模板字符串到旧 JS 模块
- 不在组件中硬编码颜色（只用 CSS 变量）
- 用户数据插入 DOM 前必须 `escapeHtml()`
- 不创建 `index.html` 覆盖旧入口（旧前端入口是 `index_modular.html`）
- 不触碰氛围元素

---

## 六、localStorage 键空间（dp_*）

| 键 | 类型 | 内容 |
|----|------|------|
| `dp_schedules` | object | 所有日期计划缓存 |
| `dp_balance` | number | XP 余额 |
| `dp_mode` | string | 当前档位 |
| `dp_bigGoals` | array | 长期目标 |
| `dp_routines` | array | 日课预设模板 |
| `dp_modeCfg` | object | 档位自定义配置 |
| `dp_progress` | object | 反馈与评分 |
| `dp_prefs` | object | 主题偏好 + AI 人设 + 存档时间 |
| `dp_settings` | object | 当前主题/激活目标 |
| `dp_earned_{date}` | array | 某日已领取 XP 项 |
| `dp_timelineCfg` | object | `{date: {start, order}}` 时间轴配置 |
| `dp_timers` / `dp_stTimers` | object | 计时器状态 |
| `dp_dayHistory_{date}` | object | 每日完成统计快照 |
| `dp_ledger` | array | XP 交易明细 |
| `dp_acc_{date}` | array | 每日记账条目 |
| `dp_day_data_{date}` | object | 每日独立数据（blocks+routines+progress+archiveData） |
| `dp_aiChat_{date}` | array | AI 对话历史本地缓存 |
| `dp_apiConfig` | object | AI API 配置（key/url/model） |
| `dp_authToken` / `dp_authRefreshToken` | string | JWT token |
| `dp_user` | object | 用户信息缓存 |

---

## 七、后端模块

| 文件 | 职责 |
|------|------|
| `server/main.py` | FastAPI 应用，32 个 REST 端点 + CORS + 静态文件 + 无缓存中间件 |
| `server/db.py` | DB 抽象层（SQLiteDB / MySQLDB / PostgreSQLDB），20+ 业务函数 |
| `server/models.py` | Pydantic 模型（Block / DailyPlan / UserCreate / AuthResponse 等 9 组） |
| `server/auth.py` | JWT + bcrypt 认证（注册/登录/刷新/鉴权依赖） |
| `server/ai_proxy.py` | DeepSeek AI 代理（prompt 构建、API 调用、JSON 校验） |

DB 抽象层：业务代码统一写 MySQL 方言 → SQLiteDB/PostgreSQLDB 各自运行时转换。

---

## 八、Docker 部署

```bash
# 开发模式（App + PostgreSQL）
docker compose up -d app

# 生产模式（App + PostgreSQL + Nginx）
docker compose --profile production up -d
```

环境变量：`DEEPSEEK_API_KEY`（AI 代理）、`DP_SECRET_KEY`（JWT 签名）、`DP_DB_TYPE`（sqlite/mysql/postgres）。

---

## 九、已知陷阱

### Vue 3 热更新 + FastAPI
- `npm run dev` 时 Vite proxy 转发 `/api/*` 到 `localhost:8000`
- 确保 FastAPI 在 8000 端口运行（非 5000），避免端口冲突

### 旧前端 overlay-anim.js 覆写
- `overlay-anim.js` 中有 `openTaskModal` 等 open 函数的独立覆写副本，修改时必须两处同步

### 弹窗渲染
- CSS animation 绑定在元素级别，`innerHTML` 赋值 = 新 DOM → 动画重播
- 所有 `open*()` 必须先写入 innerHTML 再移除 hidden 类

### SQLite 方言转换（db.py）
- `INSERT` 的 `VALUES (` 必须带空格
- `INSERT IGNORE` → 自动转 `INSERT OR IGNORE`

### 构建注意
- `vite build` 产物输出到 `server/static/`，覆盖旧构建文件
- 修改 `frontend/index.html`（源文件）后需重新构建，修改 `server/static/index.html`（产物）会被覆盖
