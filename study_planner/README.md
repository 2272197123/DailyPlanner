# DailyPlan — ADHD 友好学习计划助手

> **版本**: v8.2 | **入口**: `study_planner/index_modular.html`
> **启动**: `cd study_planner && python launcher.py` → `http://localhost:5000`
> **数据**: FastAPI + SQLite（`server/dailyplan.db`）为主，localStorage 为离线缓存；未安装 fastapi/uvicorn 时自动回退纯前端模式
> **AI 交接文档**: 见项目根目录 [CLAUDE.md](../CLAUDE.md)

---

## 版本历史

| 日期 | 版本 | 改动人 | 摘要 |
|------|------|--------|------|
| 2026-07-29 | v1.0 | 用户 | 初版单文件 HTML |
| 2026-07-29 | v2.0 | 用户 | 晶圆货币系统、皮肤商城、倒计时菜单、23:30 存档、JSON 导入 |
| 2026-07-29 | v3.0 | 用户 | "今日无事"空态、环形进度环、实时时钟、encouragement、Python launcher |
| 2026-07-30 | v4.0 | Claude | 33 天通信原理备考体系、心流启动提示、子任务计时器、拖拽排序、浏览器通知 |
| 2026-07-30 | v4.1 | Claude | 模块化重构：17 JS 模块 + 独立 CSS，修复 7 个架构级 bug |
| 2026-07-30 | v4.2 | Claude | FastAPI 后端 + SQLite（已废弃，见 v5.0） |
| 2026-07-30 | v4.3 | Claude | 修复翻页"今日无事"bug，MySQL 支持 |
| 2026-07-30 | v5.0 | Claude | 移除后端回归纯前端 localStorage。6 款皮肤 + 5 套主题。模式锁定防刷。70 条鼓励语。晶圆账本。记账系统。stableKey 进度保留。SKILL.md 重写 |
| 2026-07-30 | v5.1 | Claude | 修复余额 UI 与 LS 脱节。日常项撤销退款。23:30-04:00 禁止完成但允许导入。归档逻辑重构。`const` 静默失败教训 |
| 2026-07-31 | v5.3 | Claude | Code Review + 安全加固（XSS 全量修复）+ 弹窗闪烁根治 |
| 2026-07-31 | v5.5 | Claude | 架构修正 + 功能重构：弹窗先渲染后展示、主题二态切换、一键重置当日、拖拽排序重构 |
| 2026-07-31 | v5.6 | Claude | 弹窗动画系统重构（overlay-anim.js/css）+ JSON Skill 完善 |
| 2026-08-03 | v6.0 | WorkBuddy | 统一时间轴 + 存档系统修复 + FastAPI 后端回归 + FLIP 动画 |
| 2026-08-03 | v6.1 | WorkBuddy | 拖拽修复 + 卡片重构 + JSON 格式适配（duration 主字段）+ 记账模块重构 |
| 2026-08-03 | v7.0 | Claude | 通用长期目标系统：用户自定义大目标 + AI 阶段拆解 + 目标可视化 + 每日任务关联目标 + 分类通用化 |
| 2026-08-03 | v7.1 | Claude | 软编码彻底化：删除硬编码目标/阶段/日课；日课管理器；三档位个性化与动态缩放 |
| 2026-08-03 | v8.0 | Claude | AI 代理 + 用户认证 + 生产部署：DeepSeek 一键生成、JWT + bcrypt 多用户、PostgreSQL、Docker + Nginx |
| 2026-08-03 | v8.1 | WorkBuddy | 固定/目标任务分离：每日 JSON 不再携带 routines，固定任务由「🔁 日课」全局维护 |
| 2026-08-03 | v8.2 | Claude | AI 全链路升级：导入弹窗化 + AI 聊天确认 + 固定事务面板重建 + 目标详情 AI 拆解 + 9 个 bug 修复 + 顶栏整合 |

---

## 项目结构

```
DailyPlan/
├── .claude/                  # Claude Code 配置
├── .trellis/                 # Trellis 工作流系统
├── server/                   # FastAPI 后端
│   ├── main.py               # 32 个 REST 端点 + 静态服务
│   ├── db.py                 # 数据库抽象层（SQLite / MySQL / PostgreSQL）
│   ├── models.py             # Pydantic 模型
│   ├── auth.py               # JWT + bcrypt 认证
│   └── ai_proxy.py           # DeepSeek AI 代理
├── study_planner/            # 前端应用
│   ├── index_modular.html    # 唯一入口
│   ├── launcher.py           # 启动器（FastAPI 优先，静态回退）
│   ├── css/
│   │   ├── style.css         # 设计系统 + 组件样式
│   │   ├── timeline.css      # 时间轴专用
│   │   └── overlay-anim.css  # 弹窗动画
│   └── js/                   # 26 个模块（见 CLAUDE.md 加载顺序）
├── Dockerfile                # 容器镜像
├── docker-compose.yml        # 三服务编排（app + PostgreSQL + Nginx）
├── nginx.conf                # 反向代理配置
├── requirements.txt          # Python 依赖
├── AGENTS.md                 # Trellis 入口指令
└── CLAUDE.md                 # AI 交接文档
```

---

## 启动方式

```bash
# 推荐：FastAPI 模式
cd study_planner && python launcher.py

# 或手动启动后端
uvicorn server.main:app --port 5000

# Docker 生产部署
docker compose --profile production up -d
```

---

## core 系统

### 三种学习模式（档位）

| 模式 | 标签 | 学习量 | 说明 |
|------|------|--------|------|
| `full` | 🔋 完整 | 6-8h | 状态好时的全力模式 |
| `minimum` | ⚡ 最低 | 3-4h | 能量不足时的保底 |
| `recovery` | 🌱 恢复 | 1-2h | 需要休息的恢复日 |

- 档位可通过「⚙」按钮自定义名称、系数、建议时长
- 完成任意任务后当日模式锁定，防刷
- 切换档位按系数比例缩放 duration，不删计划

### 统一时间轴

- 日常项（routines）+ 目标任务（blocks）合并为单时间轴
- 每项只显示 duration（用时）；开始/结束时间由起点 + 前序累加动态计算
- 拖拽排序持久化到 `dp_timelineCfg` + `/api/order/{date}`
- 跨天项（如睡觉）不占时长，显示"跨天"

### 晶圆货币

- 任务奖励：`min(round(duration/5), 20) × 5` XP
- 日常项奖励：50 XP
- 防刷：每日每项仅一次（`dp_earned_<date>` 跟踪）
- 明细：点击顶栏余额打开账本

### 存档系统

- 23:30 后自动存档真实今天；凌晨自动补存昨天
- 双写：localStorage + SQLite archives 表
- 顶栏「📦 存档」查看历史（列表 + 逐项详情）

### 长期目标系统（v7.0）

- 用户自定义大目标（标题/图标/截止日期/阶段/里程碑）
- 目标面板：进度条、阶段 stepper、里程碑勾选（+100 XP奖励）
- AI 内置聊天拆解阶段 + 生成每日任务（按档位/每日上限裁剪）
- 每日任务卡片关联目标徽章

### 后端 API（FastAPI 模式）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/PUT/DELETE | `/api/plan/{date}` | 每日计划 |
| GET/PUT | `/api/progress/{date}` | 反馈与评分 |
| GET/PUT | `/api/routine-done/{date}[/{rid}]` | 日常项完成状态 |
| GET/PUT | `/api/balance` | 晶圆余额 |
| GET/POST | `/api/earned/{date}[/{id}]` | 防刷记录 |
| GET/PUT | `/api/prefs` | 主题/皮肤偏好 |
| GET/PUT | `/api/archive/{date}` | 单日存档 |
| GET | `/api/archives` | 存档列表 |
| GET/PUT | `/api/order/{date}` | 时间轴顺序与起点 |
| GET/PUT | `/api/goals` | 长期目标 |
| GET/PUT | `/api/routines` | 日课预设 |
| POST | `/api/generate-plan` | AI 每日计划生成 |
| POST | `/api/auth/register` | 用户注册 |
| POST | `/api/auth/login` | 用户登录 |

---

## JSON 导入格式（v8.1+）

每日计划只需 `date`、`dayMode`、`blocks`；routines 由网页「🔁 日课」面板维护。

```json
{
  "date": "2026-08-05",
  "dayMode": "full",
  "startTime": "09:00",
  "blocks": [
    {
      "subject": "通信原理 CH3",
      "duration": 90,
      "category": "study",
      "goalId": "g_xxx",
      "priority": "high",
      "flowHint": "打开课件第一页即可开始",
      "subtasks": [
        {"text": "阅读 CH3-1 课件", "estMin": 30},
        {"text": "做课后习题 3 道", "estMin": 30},
        {"text": "整理错题笔记", "estMin": 30}
      ]
    }
  ]
}
```

目标拆解 JSON（含 `title` + `phases`，无 `blocks`）会被自动识别为目标导入。

---

## localStorage 键名规范

所有键以 `dp_` 为前缀：

| 键 | 类型 | 内容 |
|----|------|------|
| `dp_schedules` | object | `{"YYYY-MM-DD": {...}}` 所有日期计划 |
| `dp_balance` | number | 晶圆余额 |
| `dp_mode` | string | 当前档位 |
| `dp_bigGoals` | array | 长期目标列表 |
| `dp_routines` | array | 日课预设 |
| `dp_progress` | object | 反馈与评分 |
| `dp_earned_<date>` | array | 某日已领取奖励 ID |
| `dp_mode_lock_<date>` | object | 模式锁 |
| `dp_timelineCfg` | object | 时间轴起点与拖拽顺序 |
| `dp_prefs` | object | 皮肤/主题偏好 |
| `dp_ledger` | array | 晶圆交易明细 |
| `dp_archive_<date>` | object | 存档数据（本地缓存） |

---

## 设计系统 — 墨穹 Ink Void

**东方水墨 × 暗黑科技** — 学者书斋的沉静 + 现代工具的精准。

### 字体

| 用途 | 字体 | 来源 |
|------|------|------|
| 标题/品牌 | Noto Serif SC | Google Fonts CDN |
| 数据/计时 | JetBrains Mono | Google Fonts CDN |
| 正文 | PingFang SC / Microsoft YaHei | 系统默认 |

### 调色板 — 靛蓝墨

| 语义 | Light | Dark |
|------|-------|------|
| 根背景 | `#faf8f3`（暖白宣纸） | `#0c0c14`（深墨色） |
| 表面 | `#ffffff` | `#161622` |
| 主文字 | `#1a1a1c` | `#e4e2ec` |
| 主色 | `#1e2030`（靛蓝墨） | `#c8c4e0` |
| 完成/翡翠 | `#2d7a52` | `#40b878` |
| 警示/朱砂 | `#c23b2a` | `#e05848` |

### 氛围系统

- 3 个光晕球体（靛蓝/翡翠/朱砂 `radial-gradient` + `blur(120px)`）
- 宣纸纹理（SVG 噪点 Data URL 平铺，opacity 0.018 / 0.012）
- 墨色虚光（`body::after` 双层 `radial-gradient`）
- 朱砂印章（100% 完成时 SVG 弹性动画）

### 购买主题（6 套）

sakura / forest / ocean / sunset / noir / vapor — 通过 CSS 类覆盖变量实现。

### 禁忌清单

1. **不用** Inter / Roboto / Arial — 已有 Noto Serif SC + JetBrains Mono
2. **不用** #4F46E5 蓝紫色 — 主色是 `#1e2030` 靛蓝墨
3. **不移除** 氛围元素（光晕球体、纹理、虚光）
4. **不用** `transition: all` — 明确指定属性
5. **CSS 变量是唯一颜色入口** — 不在组件中硬编码颜色值

---

## 关键 bug 修复记录

| Bug | 根因 | 修复 |
|-----|------|------|
| 余额 UI 与 LS 脱节 | 多处直接写 LS 绕过 `setBalance()` | `setBalance()` 作为唯一写入点 |
| `const` 导致函数静默丢失 | `const` 在特定浏览器跳过函数体且不报错 | 全量 `var` + `function` |
| 弹窗闪烁 | innerHTML 重写触发 CSS animation 重播 | JS 驱动动画生命周期 |
| 弹窗入 2 次 | launcher 302 重定向 + 预览工具双重加载 | FileResponse 直接返回 + `_initStarted` 守卫 |
| 档位切换清空计划 | `setMode` 调 `generateSchedule` Route B 删计划 | 按系数比例缩放 duration |
| 切换主题无反应 | 三态循环中 system→dark 看起来没变 | 二态直接翻转 dark↔light |
