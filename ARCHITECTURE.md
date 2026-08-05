# DailyPlan 技术架构文档 v8.0

> **最后更新**：2026-08-03 | **维护者**：Claude (via Claude Code)
> 
> 本文档是项目的权威架构参考。README.md 侧重版本历史和业务功能，本文档侧重工程结构和设计决策。

---

## 一、顶层架构

```
┌─────────────────────────────────────────────────────┐
│                    客户端 (Browser)                   │
│                                                     │
│  index_modular.html                                 │
│       │                                             │
│       ├── js/  (26 modules, 5600+ LOC)              │
│       │    Layer 0: constants.js                    │
│       │    Layer 1: utils.js                        │
│       │    Layer 2: api.js                          │
│       │    Layer 3: storage.js                      │
│       │    Layer 4: store.js                        │
│       │    Layer 5: schedule / currency / archive   │
│       │             goals / routines / modes         │
│       │             auth / toast / timers / toggles │
│       │             effects / theme / reminders      │
│       │    Layer 6: render / timeline / events       │
│       │             modal / overlay-anim             │
│       │             import / ledger                  │
│       │    Layer 7: app.js (entry)                   │
│       │                                             │
│       └── css/  (3 stylesheets, 1950+ LOC)          │
│                                                     │
│  localStorage (dp_* keys) ←→ Server cache layer      │
└──────────────────┬──────────────────────────────────┘
                   │  HTTP REST (JSON)
                   │  Authorization: Bearer <JWT>
                   ▼
┌─────────────────────────────────────────────────────┐
│                  Nginx (生产可选)                     │
│  - 反向代理 :5000 → :80/:443                         │
│  - TLS 终止（挂载证书后）                             │
│  - /js/ /css/ 强缓存 7d                              │
│  - API proxy_read_timeout 120s（AI 调用用）           │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│              FastAPI (uvicorn :5000)                 │
│                                                     │
│  server/main.py          — 32 个 REST 端点           │
│  server/models.py        — Pydantic 模型（9 组）      │
│  server/auth.py          — JWT + bcrypt 认证         │
│  server/ai_proxy.py      — DeepSeek AI 代理          │
│  server/db.py            — 数据库抽象层              │
│                                                     │
│  端点分类：                                           │
│  /api/plan/{date}        — 每日计划 CRUD             │
│  /api/progress/{date}    — 进度反馈                  │
│  /api/routine-done/...   — 日课完成标记               │
│  /api/balance            — 虚拟货币                  │
│  /api/earned/{date}      — 任务收益标记               │
│  /api/prefs              — 用户偏好                  │
│  /api/archives           — 每日存档                  │
│  /api/order/{date}       — 时间轴拖拽顺序             │
│  /api/goals              — 长期目标 CRUD             │
│  /api/routines           — 日课预设 CRUD             │
│  /api/generate-plan      — AI 每日计划生成（v8.0）     │
│  /api/ai-usage           — AI 请求日志查询（v8.0）    │
│  /api/auth/register      — 用户注册（v8.0）          │
│  /api/auth/login         — 用户登录（v8.0）          │
│  /api/auth/refresh       — Token 刷新（v8.0）         │
│  /api/auth/me            — 当前用户（v8.0）           │
└──────────────────┬──────────────────────────────────┘
                   │  DBInterface (抽象)
                   ▼
┌─────────────────────────────────────────────────────┐
│                   数据库层                            │
│                                                     │
│  DP_DB_TYPE=sqlite    → SQLiteDB  (开发 / 单机)     │
│  DP_DB_TYPE=mysql     → MySQLDB   (自建 MySQL)       │
│  DP_DB_TYPE=postgres  → PostgreSQLDB (生产推荐)      │
│                                                     │
│  表（8 张）：                                        │
│  plans, progress, routine_done, earned, state,       │
│  archives, users, ai_requests                       │
└─────────────────────────────────────────────────────┘
```

---

## 二、前端模块分层（26 个 JS 文件，按加载顺序）

| 层 | 文件 | 职责 |
|----|------|------|
| **L0** | `constants.js` | 全局常量：奖励值、分类标签/图标、档位默认配置、鼓励语文案、商城商品、默认模板 |
| **L1** | `utils.js` | 纯函数：日期格式化、稳定哈希、随机鼓励语、时间解析 |
| **L2** | `api.js` | HTTP 客户端：封装所有 fetch 调用，自动附带 JWT token，token 管理函数 |
| **L3** | `storage.js` | localStorage 包装：`LS.get/set/remove(dp_*)`，档位配置读写 |
| **L4** | `store.js` | 中央状态：`store.currentDate/mode/schedules/progress/tasks/routines/bigGoals/prefs/user`，启动时从 LS + 服务器拉取数据 |
| **L5** | `schedule.js` | 计划生成：`buildScheduleObject()` 标准化、`generateSchedule()`、block id 补全、`syncPlanToServer()` |
| | `currency.js` | 虚拟货币逻辑：`addBalance/setBalance/refundBalance/recordTransaction` |
| | `archive.js` | 存档系统：每日自动/手动/补档 + 存档查看面板 |
| | `goals.js` | 长期目标系统：CRUD、阶段/里程碑、进度计算、目标面板、AI 拆解提示词 |
| | `routines.js` | 日课管理器：用户自管理预设（增删改）+ 服务器同步 |
| | `modes.js` | 三档位设置面板：自定义名称/系数/时长/说明 |
| | `auth.js` | 登录/注册 UI：overlay 面板、表单提交、登出、header badge 渲染 |
| | `toast.js` | Toast 通知系统 |
| | `timers.js` | 番茄钟与子任务计时器 |
| | `toggles.js` | 完成任务/日课的勾选逻辑 + 模式锁定 + 重置今日 |
| | `effects.js` | 完成特效：hanko 印章 + 粒子 + 音效 |
| | `theme.js` | 亮/暗/自定义主题切换 |
| | `reminders.js` | 任务截止提醒 |
| **L6** | `render.js` | DOM 渲染：header、日期标题、模式按钮、鼓励语、进度条、目标面板、时间轴容器，`renderAll()` 调度中心 |
| | `timeline.js` | 时间轴可视化：FLIP 动画排序、拖拽、起点调整、进度计算 |
| | `events.js` | 事件处理：导航、模式切换、键盘快捷键、所有 overlay 关闭 |
| | `modal.js` | 任务创建/编辑弹窗 |
| | `overlay-anim.js` | 弹窗动画系统 + openTaskModal 覆写 |
| | `import.js` | JSON 导入、AI 生成按钮、模板填充、文件拖拽、提示词生成 |
| | `ledger.js` | 晶圆交易流水账本 |
| **L7** | `app.js` | 入口：`async function init()` 依次拉取服务器数据、初始化渲染、启动时钟 |

**数据流原则**：
- **写**：`store` → `LS.set()`（即时缓存）+ `API.saveXxx()`（异步写通）
- **读**：服务器优先 → 本地 LS 兜底
- **余额唯一写入点**：`addBalance()` / `setBalance()`，必须走 `recordTransaction()` 记流水

---

## 三、后端模块（5 个 Python 文件）

| 文件 | 行数 | 职责 |
|------|------|------|
| `server/main.py` | ~360 | FastAPI 应用：32 个 REST 端点 + CORS + 静态文件挂载 + 启动初始化 |
| `server/models.py` | ~120 | Pydantic 模型：`Block/Subtask/RoutineItem/DailyPlan` + `UserCreate/Login/AuthResponse` + `GeneratePlanRequest/Response` + `APIResponse` |
| `server/db.py` | ~500 | 数据库抽象层：`DBInterface` + `SQLiteDB/MySQLDB/PostgreSQLDB` 三种实现 + 业务函数（`get_plan/save_plan/get_state/set_state` 等 20+ 个） |
| `server/auth.py` | ~140 | JWT + bcrypt 认证：`hash_password/verify_password/create_access_token/create_refresh_token/decode_token/get_current_user/require_user` + `create_user/authenticate_user` |
| `server/ai_proxy.py` | ~230 | AI 代理：prompt 构建（从 DB 读目标/日课/档位/反馈）、DeepSeek API 调用（OpenAI 协议）、JSON 提取与校验、`ai_requests` 表日志 |

---

## 四、数据库设计

### 4.1 表结构

| 表名 | 主键 | 用途 |
|------|------|------|
| `plans` | `date` (TEXT) | 每日计划（blocks + routines JSON） |
| `progress` | `date` (TEXT) | 每日反馈（note + rating） |
| `routine_done` | `(date, routine_id)` | 日课完成标记 |
| `earned` | `(date, item_id)` | 晶圆收益标记（防重复领取） |
| `state` | `key` (TEXT) | 全局键值存储（balance、theme、prefs、order_*、biggoals、routines、modeCfg） |
| `archives` | `date` (TEXT) | 每日存档快照（全量 JSON） |
| `users` | `id` (SERIAL/INTEGER) | 用户账号（username UNIQUE + password_hash） |
| `ai_requests` | `id` (SERIAL/INTEGER) | AI 请求日志（token 消耗、耗时、成功/失败） |

### 4.2 DB 抽象层设计

```
DBInterface (抽象)
├── SQLiteDB      — 开发 / 单机，零配置
├── MySQLDB       — 传统自建，pymysql
└── PostgreSQLDB  — 生产推荐，psycopg2

SQL 兼容策略：
- 业务代码统一用 MySQL 方言（%s 占位符、ON DUPLICATE KEY、反引号）
- SQLiteDB.execute() 在运行时转换（%s→?、ON DUPLICATE→ON CONFLICT、反引号移除等）
- PostgreSQLDB.execute() 在运行时转换（反引号→双引号、ON DUPLICATE→ON CONFLICT、MEDIUMTEXT→TEXT 等）
```

### 4.3 localStorage 键空间（`dp_*` 前缀）

| 键 | 类型 | 用途 |
|----|------|------|
| `dp_mode` | string | 当前档位 |
| `dp_schedules` | object | 所有日期的计划缓存 |
| `dp_progress` | object | 所有日期的反馈缓存 |
| `dp_tasks` | array | 用户自建任务 |
| `dp_routines` | array | 日课预设 |
| `dp_bigGoals` | array | 长期目标 |
| `dp_prefs` | object | 偏好（皮肤/主题） |
| `dp_settings` | object | 设置（当前主题/激活目标） |
| `dp_modeCfg` | object | 档位自定义配置 |
| `dp_authToken` | string | JWT access token |
| `dp_authRefreshToken` | string | JWT refresh token |
| `dp_user` | object | 当前用户信息缓存 |
| `dp_timers` / `dp_stTimers` | object | 计时器状态 |
| `dp_earned_{date}` | array | 某日已领取收益项（Set 序列化） |
| `dp_order_{date}` | object | 某日时间轴拖拽顺序 |

---

## 五、部署架构

### 5.1 Docker Compose（推荐）

```
docker compose up -d app                    # 开发模式（App + PostgreSQL）

docker compose --profile production up -d   # 生产模式（App + PostgreSQL + Nginx）
```

```
┌──────────┐    ┌──────────────┐    ┌──────────────────┐
│  Nginx   │───→│  FastAPI App │───→│  PostgreSQL 16   │
│  :80/443 │    │  :5000       │    │  :5432           │
│ (生产可选) │    │  container   │    │  container       │
└──────────┘    └──────────────┘    └──────────────────┘
                      │
                      ├── study_planner/  静态文件
                      ├── server/         Python 包
                      └── /app/DailyPlan  WORKDIR
```

### 5.2 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DP_DB_TYPE` | `sqlite` | 数据库类型：sqlite / mysql / postgres |
| `DP_POSTGRES_URL` | — | PostgreSQL 连接串（优先于逐字段设置） |
| `DP_POSTGRES_HOST/PORT/USER/PASSWORD/DB` | localhost/5432/dailyplan/dailyplan/dailyplan | PG 逐字段设置 |
| `DP_MYSQL_URL` | — | MySQL 连接串 |
| `DEEPSEEK_API_KEY` | — | **必填**：DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API 地址 |
| `DP_AI_MODEL` | `deepseek-chat` | 模型名 |
| `DP_SECRET_KEY` | `dailyplan-dev-secret...` | JWT 签名密钥（生产必改） |
| `PORT` | `5000` | 服务端口 |

### 5.3 非 Docker 运行

```bash
# 安装依赖
pip install -r requirements.txt

# 启动（自动检测 fastapi/uvicorn，否则回退静态模式）
cd study_planner && python launcher.py

# 或直接
uvicorn server.main:app --host 0.0.0.0 --port 5000
```

---

## 六、关键设计决策

| 决策 | 说明 |
|------|------|
| **MySQL 方言作为 SQL 中间表示** | 业务代码统一写 MySQL 风格 SQL，适配器各自转换。避免三套 SQL 维护。 |
| **前端 LS-first + Server write-through** | 所有写操作 LS 先落盘（即时响应），API 异步同步。读操作服务端优先。 |
| **状态集中管理** | `store` 对象是唯一 state source。`STORE_KEYS` 数组显式声明所有字段。 |
| **26 个 JS 文件严格分层** | L0→L7 加载顺序不可颠倒。Layer 5 模块可以互相引用，Layer 6 只读 store 写 DOM。 |
| **余额唯一写入点** | `addBalance()` / `setBalance()` 是唯二修改余额的路径，必须同时 `recordTransaction()`。 |
| **Block ID 稳定性** | `buildScheduleObject()` 给所有缺失 id 的 block 分配 `block_{idx}_{hash}`，保障时间轴拖拽的 key 唯一。 |
| **三档位动态缩放** | `setMode()` 切换时按新旧系数比例缩放 duration 和 estMin，不删计划。 |
| **bcrypt 直接调用** | 避免 passlib 与 bcrypt 5.x 的 `__about__` 兼容性问题。 |
| **AI JSON 容错** | 自动去掉 markdown 代码块包裹 → 宽松解析 → 字段校验补全 → 至少 1 个 block 兜底。 |
| **Docker 开发/生产双 profile** | 开发模式不启 Nginx（直连 :5000），生产模式 `--profile production` 启用 Nginx。 |

---

## 七、当前限制与后续方向

| 限制 | 优先级 | 方向 |
|------|--------|------|
| 用户数据未按 `user_id` 隔离 | **P0** | `state/plans/progress` 等表加 `user_id` 外键，所有 API 端点按当前用户过滤 |
| AI 端点无速率限制 | P1 | 加 Redis 或内存限流（如 slowapi） |
| 无 WebSocket 实时同步 | P2 | 多端同时编辑时可以推送更新 |
| 前端无构建工具 | P2 | 当前 26 个 script 标签无 tree-shaking/bundling；可迁移到 Vite |
| 无自动化测试 | P2 | pytest + Playwright |
| 无 CI/CD | P3 | GitHub Actions → 自动测试 → Docker 构建 → 部署 |

---

## 八、文件清单（47 个源文件）

```
DailyPlan/
├── .env.example                    # 环境变量模板
├── .dockerignore                   # Docker 构建排除
├── Dockerfile                      # 容器镜像定义
├── docker-compose.yml              # 三服务编排
├── nginx.conf                      # 反向代理配置
├── requirements.txt                # Python 生产依赖
├── server/                         # Python 后端包
│   ├── __init__.py
│   ├── main.py                     # FastAPI 应用 + 32 个端点
│   ├── models.py                   # Pydantic 模型（9 组）
│   ├── db.py                       # DB 抽象层（SQLite/MySQL/PostgreSQL）
│   ├── auth.py                     # JWT + bcrypt 认证
│   └── ai_proxy.py                 # DeepSeek AI 代理
├── study_planner/                  # 前端项目根
│   ├── index_modular.html          # 单页入口
│   ├── launcher.py                 # 本地一键启动器
│   ├── README.md                   # 版本历史与业务文档
│   ├── css/
│   │   ├── style.css               # 设计系统（布局/组件/主题/日课/档位/AI/认证）
│   │   ├── timeline.css            # 时间轴专用
│   │   └── overlay-anim.css        # 弹窗动画
│   └── js/
│       ├── constants.js            # L0：全局常量
│       ├── utils.js                # L1：纯工具函数
│       ├── api.js                  # L2：HTTP 客户端 + Token 管理
│       ├── storage.js              # L3：localStorage 包装
│       ├── store.js                # L4：中央状态管理
│       ├── schedule.js             # L5：计划生成
│       ├── currency.js             # L5：虚拟货币
│       ├── archive.js              # L5：存档系统
│       ├── goals.js                # L5：长期目标
│       ├── routines.js             # L5：日课管理
│       ├── modes.js                # L5：档位设置
│       ├── auth.js                 # L5：登录/注册 UI
│       ├── toast.js                # L5：通知
│       ├── timers.js               # L5：计时器
│       ├── toggles.js              # L5：勾选/锁定/重置
│       ├── effects.js              # L5：完成特效
│       ├── theme.js                # L5：主题切换
│       ├── reminders.js            # L5：截止提醒
│       ├── render.js               # L6：DOM 渲染调度
│       ├── timeline.js             # L6：时间轴可视化
│       ├── events.js               # L6：事件处理
│       ├── modal.js                # L6：任务弹窗
│       ├── overlay-anim.js         # L6：弹窗动画
│       ├── import.js               # L6：导入与 AI 生成
│       ├── ledger.js               # L6：晶圆流水
│       └── app.js                  # L7：入口初始化
```

**规模统计**：Python ~1870 行，JS ~5620 行，CSS ~1950 行，HTML ~240 行，合计 ~9700 行源文件。
