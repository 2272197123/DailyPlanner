# DailyPlan — AI Agent 交接文档

> 本文档供 AI Agent（Claude Code / Trellis / 其他）阅读。
> 用户文档见 [study_planner/README.md](study_planner/README.md)。
> 技术架构详见 [ARCHITECTURE.md](ARCHITECTURE.md)。
> Trellis 工作流见 `.trellis/workflow.md`。

---

## 一、启动

```bash
cd study_planner && python launcher.py    # FastAPI :5000，自动回退静态模式
```

入口：`study_planner/index_modular.html`（唯一入口，不要创建 index.html）

---

## 二、JS 模块加载顺序（必须严格）

```
constants.js → utils.js → api.js → storage.js → store.js
  → schedule.js, currency.js, archive.js, goals.js, routines.js, modes.js,
    auth.js, toast.js, timers.js, toggles.js, effects.js, theme.js, reminders.js
  → render.js, timeline.js, events.js, modal.js, overlay-anim.js, import.js, ledger.js
  → app.js
```

全局变量：`store`, `LS`。所有函数挂 window。

---

## 三、localStorage 键空间（dp_*）

| 键 | 类型 | 内容 |
|----|------|------|
| `dp_schedules` | object | 所有日期计划缓存 |
| `dp_balance` | number | 晶圆余额 |
| `dp_mode` | string | 当前档位 |
| `dp_bigGoals` | array | 长期目标 |
| `dp_routines` | array | 日课预设 |
| `dp_modeCfg` | object | 档位自定义配置 |
| `dp_progress` | object | 反馈与评分 |
| `dp_prefs` | object | 皮肤/主题偏好 |
| `dp_settings` | object | 当前主题/激活目标 |
| `dp_earned_{date}` | array | 某日已领取收益项 |
| `dp_mode_lock_{date}` | object | 模式锁 |
| `dp_timelineCfg` | object | `{date: {start, order}}` 时间轴配置 |
| `dp_timers` / `dp_stTimers` | object | 计时器状态 |
| `dp_dayHistory_{date}` | object | 每日完成统计快照 |
| `dp_ledger` | array | 晶圆交易明细 |
| `dp_acc_{date}` | array | 每日记账条目 |
| `dp_archive_{date}` | object | 存档数据本地缓存 |
| `dp_authToken` / `dp_authRefreshToken` | string | JWT token |
| `dp_user` | object | 用户信息缓存 |

---

## 四、数据流原则

### 写
1. `store` 先更新
2. `LS.set()` 本地即时缓存
3. `API.saveXxx()` 异步写通服务器（失败静默降级）

### 读
1. 服务器优先
2. LS 兜底

### 余额唯一写入点

`addBalance()` / `setBalance()` 是唯二修改余额的路径。

```javascript
// 正确
addBalance(100, '完成任务奖励');
setBalance(newBalance);

// 错误 — 绝不绕过
LS.set('dp_balance', xxx);
document.getElementById('balanceText').textContent = xxx;
```

---

## 五、关键架构约束

### 禁止事项

- **禁止自动生成计划** — `generateSchedule()` 的 Route B（`buildSlots()` 自动生成）已完全移除。计划只能通过 JSON 导入创建。
- **禁止内置数据回落** — `DEFAULT_ROUTINES` / `DEFAULT_GOALS` 仅保留为参考模板，运行时代码不得将其作为回落值。
- **禁止 `const` / `let` / 箭头函数 / 模板字符串** — 只用 `var` 和 `function`。Python http.server 环境下 `const` 可能静默失败（整个函数体被跳过且不报错）。`async/await` 仅限 api.js/store.js 既有代码。
- **所有用户数据插入 innerHTML 前必须 `escapeHtml()`** — JSON 导入的数据也是用户数据。

### 时间轴渲染

- 渲染入口是 `renderTimeline()`，不是旧 `renderRoutines()`/`renderTasks()`
- 每项只有 `duration`；开始/结束时间由 `getTimelineStart()` + 前序累加
- `store._tlFresh` 是一次性标志，只在日期切换/导入/首屏设为 true
- 导入新计划必须 `clearTimelineCfg(date)`

### 模式切换

- `setMode(m)` 检查锁；锁定拒绝
- 切换时按 `newFactor/oldFactor` 比例缩放 duration 和 estMin，不删计划
- `resetToday()` 可重置当日所有完成状态并退款

### 存档

- `archiveDay(date)` 存档真实日期而非 `store.currentDate`
- 双写 LS + `PUT /api/archive/{date}`
- 23:30 自动存档今天；凌晨自动补存昨天

### 两个 Guard

- `guardEdit()` — 只检查历史日期（用于导入/创建）
- `guardToggle()` — 额外检查今日 23:30-04:00 禁止窗口（用于勾选完成）

---

## 六、已知陷阱

### overlay-anim.js 覆写

`overlay-anim.js` 中有 `openTaskModal` 等 open 函数的独立覆写副本。给任务弹窗加字段时必须**两处同步改**：
1. `js/modal.js` — 弹窗填充逻辑
2. `js/overlay-anim.js` — 覆写副本

### 弹窗渲染

CSS animation（`fadeIn`、`slideUp`）绑定在元素级别，`innerHTML` 赋值 = 新 DOM → 动画重播。所有 `open*()` 必须：
1. 先写入 innerHTML
2. 再移除 hidden 类

### SQLite 方言转换（db.py）

- `INSERT` 的 `VALUES (` 必须带空格（避免被正则误匹配）
- `ON DUPLICATE KEY UPDATE` 后的 `VALUES(col)` 不带空格
- `INSERT IGNORE` → 自动转 `INSERT OR IGNORE`

### 阻塞 id 稳定性

`buildScheduleObject()` 给缺失 id 的 block 分配 `block_{idx}_{hash(subject+time+date)}`。时间轴拖拽依赖唯一 key。

---

## 七、设计系统约束

1. **字体**: Noto Serif SC（标题）+ JetBrains Mono（数据）+ 系统无衬线（正文）。不用 Inter / Roboto / Arial
2. **主色**: `--accent: #1e2030`（靛蓝墨），不用旧版 `#2b3a5c` / `#4F46E5`
3. **CSS 变量是唯一颜色入口** — 不在组件中硬编码颜色
4. **氛围元素不可移除**: 光晕球体（`.ambient-orb`）、宣纸纹理（`.paper-texture`）、墨色虚光（`body::after`）、朱砂印章（`.hanko-seal`）
5. **不动 JS 来配合 UI** — UI 层纯 CSS，JS 不应感知
6. **不用 `transition: all`** — 明确指定属性
7. **购买主题保留全部 6 套**: sakura / forest / ocean / sunset / noir / vapor

---

## 八、后端模块

| 文件 | 职责 |
|------|------|
| `server/main.py` | FastAPI 应用，32 个 REST 端点 + CORS + 静态文件 + no-cache 中间件 |
| `server/db.py` | DB 抽象层（SQLiteDB / MySQLDB / PostgreSQLDB），20+ 业务函数 |
| `server/models.py` | Pydantic 模型（Block / DailyPlan / UserCreate / AuthResponse 等 9 组） |
| `server/auth.py` | JWT + bcrypt 认证（注册/登录/刷新/鉴权依赖） |
| `server/ai_proxy.py` | DeepSeek AI 代理（prompt 构建、API 调用、JSON 校验） |

DB 抽象层：业务代码统一写 MySQL 方言 → SQLiteDB/PostgreSQLDB 各自运行时转换。

---

## 九、Docker 部署

```bash
# 开发模式（App + PostgreSQL）
docker compose up -d app

# 生产模式（App + PostgreSQL + Nginx）
docker compose --profile production up -d
```

环境变量：`DEEPSEEK_API_KEY`（AI 代理）、`DP_SECRET_KEY`（JWT 签名）、`DP_DB_TYPE`（sqlite/mysql/postgres）。

---

## 十、Trellis 集成

本项目已接入 Trellis 工作流系统。Trellis 文件位于：

- `.trellis/workflow.md` — 开发阶段与任务流程
- `.trellis/spec/` — 分包分层的编码规范
- `.trellis/tasks/` — 任务目录（PRD、设计、研究）
- `.trellis/workspace/` — 开发者日志

使用 `trellis` CLI 管理任务生命周期。详情见 `.trellis/workflow.md`。
