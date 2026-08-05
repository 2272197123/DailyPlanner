# DailyPlan v10.0 — Vue 3 + FastAPI + SQL 架构升级与功能补全

## Goal

将 DailyPlan 从 vanilla JS + SQLite 单机 Demo 升级为 Vue 3 SPA + FastAPI + SQL 数据库的现代化 Web 应用，补全 v9.0 遗留的功能缺口。未来可通过同一套 REST API 扩展至小程序/移动端。

## 架构决策

### 技术栈

| 层级 | v9.0（当前） | v10.0（目标） |
|------|-------------|--------------|
| 前端框架 | vanilla JS (27 个全局模块) | Vue 3 + Vite + Pinia |
| UI 组件 | 手写 innerHTML | 手写组件（保持设计系统），未来可迁移 UI 库 |
| CSS | 单文件 style.css + 散落内联 | CSS 变量体系 + scoped styles |
| 后端框架 | FastAPI（保留） | FastAPI（保留，优化） |
| 数据库 | SQLite（默认） | SQLite（开发）/ MySQL（生产）/ PostgreSQL（生产） |
| 构建工具 | 无 | Vite |
| JS 规范 | 仅 var + function | 现代 ES6+ |

### 部署形态

```
用户浏览器 ──→ Nginx（可选） ──→ FastAPI :8000
                                      │
                         ┌────────────┼────────────┐
                         │            │            │
                   GET /api/*    GET /static/*   WebSocket
                   (REST API)    (Vue SPA 产物)   (未来实时)
                                      │
                                 MySQL/PostgreSQL
```

- 开发：`vite dev` (前端 HMR :5173) + `uvicorn` (后端 :8000)，Vite proxy 转发 `/api/*`
- 生产：`vite build` → FastAPI 静态托管，Nginx 反代可选
- 未来小程序/App：复用同一套 REST API，前端用 uni-app/Taro 重写

### 开发策略：增量迁移，逐子系统替换

不放卫星、不全量重写。采用**绞杀者模式**（Strangler Fig）：

1. Vite + Vue 3 脚手架搭好
2. 逐个子系统从 vanilla JS 迁移为 Vue 组件
3. 每个子系统迁移完即可独立验证
4. 全部迁移完后删除旧 `study_planner/js/` 和 `index_modular.html`

## Requirements

### R1：Vue 3 前端重写（`v10-vue3-frontend`）
- R1.1：Vite + Vue 3 + Pinia 项目骨架
- R1.2：核心子系统逐模块迁移（时间轴、任务卡片、日课、目标、存档、AI、记账、计时器、主题）
- R1.3：保留设计系统基线（靛蓝墨 `#1e2030`、Noto Serif SC + JetBrains Mono、氛围元素）
- R1.4：CSS 变量统一管理，响应式适配移动端
- R1.5：移除所有旧版 JS 全局变量和 `var`/`function` 限制

### R2：存档系统补全（`v10-archive-complete`）
- R2.1：PDF 导出改为真正 PDF 生成（非 HTML 伪装）
- R2.2：AI 人设 prompt 提供 UI 配置入口（设置面板）
- R2.3：存档评价在主时间轴视图可见（导航到历史日期时展示 AI 评价）
- R2.4：`saveDailyHistory()` 从每日数据键读取，非全局键

### R3：AI 交互补全（`v10-ai-complete`）
- R3.1：动态顺延/重分配 — 未完成任务检测 + 顺延/增加工作量/放弃三种处理
- R3.2：三套 AI 聊天系统统一为单一 AI 服务
- R3.3：抽屉 AI 服务端回退（无 API Key 时走 `/api/generate-plan`）
- R3.4：对话自动摘要（超过 20 条消息时真正调用 AI 生成摘要）

### R4：日课数据隔离修复（`v10-routines-fix`）
- R4.1："推送到模板"功能完整实现
- R4.2：已初始化日期的日课支持独立编辑
- R4.3：`tlDeleteTask()` 删除日课仅影响每日副本，不污染全局模板

### R5：XP/主题系统统一（`v10-xp-theme`）
- R5.1：前端术语 円/晶圆 → XP 全量迁移
- R5.2：`wafers` 字段统一重命名为 `xpReward`
- R5.3：`WAFER_SKINS` 残留引用清理
- R5.4：新增至少 2 套主题（达到 10 套）

### R6：UI 现代化补全（`v10-ui-polish`）
- R6.1：时间三态色彩完整实现（past 琥珀 / present 靛蓝 / future 淡紫）
- R6.2：日期切换翻页动画
- R6.3：弹窗系统规范化（尺寸统一、位置一致、关闭行为一致）
- R6.4：AI 输入框多行可拖拽

### R7：部署与数据库（`v10-deploy`）
- R7.1：MySQL/PostgreSQL 数据库配置与迁移脚本
- R7.2：域名 + HTTPS 部署文档
- R7.3：环境变量整理（`DP_DB_TYPE`、`DP_SECRET_KEY`、`DEEPSEEK_API_KEY` 等）
- R7.4：Docker Compose 生产配置

## 跨模块约束

1. **设计系统不可变**：`--accent: #1e2030`、Noto Serif SC + JetBrains Mono、光晕球体、宣纸纹理、墨色虚光、朱砂印章
2. **API 向后兼容**：现有 32 个端点路径和响应格式保持不变，存量数据零丢失
3. **数据流**：前端 store → API → DB，LS 兜底。写操作 API 优先 + LS 即时缓存，读操作 API 优先 + LS 兜底
4. **余额唯一写入点**：`addXP()` / `setXP()` 是唯二修改 XP 的路径
5. **无硬编码**：所有 prompt 模板使用参数化描述，不出现具体用户数据作为默认值
6. **DB 抽象层保留**：`server/db.py` 的方言转换机制保留，新增表统一写 MySQL 方言

## Dependencies

```
v10-vue3-frontend  ←── 所有其他子任务的前端部分依赖此脚手架
v10-archive-complete   ←── 依赖 v10-vue3-frontend（前端重写）
v10-ai-complete        ←── 依赖 v10-vue3-frontend
v10-routines-fix       ←── 依赖 v10-vue3-frontend + v10-archive-complete（共享数据模型）
v10-xp-theme           ←── 依赖 v10-vue3-frontend
v10-ui-polish          ←── 在其他子任务完成后统一收束
v10-deploy             ←── 相对独立，可并行
```

建议执行顺序：Vue 3 脚手架 → 日课隔离/XP 系统（数据层基础）→ 存档/任务卡片 → AI 交互 → UI 收束 → 部署

## Acceptance Criteria

- [ ] AC-P1：`npm run dev` 启动 Vite 开发服务器，浏览器打开可见 Vue 3 应用
- [ ] AC-P2：`npm run build` 构建产物放入 FastAPI `static/`，`python launcher.py` 启动后浏览器可访问完整应用
- [ ] AC-P3：现有 32 个 API 端点全部正常工作
- [ ] AC-P4：MySQL 模式下所有 CRUD 操作正常（`DP_DB_TYPE=mysql`）
- [ ] AC-P5：存量数据从 LS 迁移到服务器数据库后无丢失
- [ ] AC-P6：设计系统氛围元素（光晕、纹理、虚光、印章）完整渲染
- [ ] AC-P7：所有 7 个子任务 AC 通过

## Out of Scope

- uni-app 小程序/App 前端（v11.0）
- WebSocket 实时同步（v11.0）
- 多用户协作
- OAuth 第三方登录
