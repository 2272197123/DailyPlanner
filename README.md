# DailyPlan

> 当前版本：**v0**

个人日程管理与学习规划助手。把每天的任务、固定日课、心情、账目和目标收进一条清晰的时间轴，用 XP 与等级记录每一点进步。

---

## 功能一览

- **每日计划**：从上到下的纵向时间轴（滚动时背景随当前任务分类变色）、钉时任务 + 流动任务混排、拖拽排序、当前时刻线、子任务、任务计时
- **计划导入**：「导入前一天」弹窗列出昨日任务，勾选取舍后导入（完成状态清零）；固定日程规则仍自动物化
- **固定日程**：学期课表/班表等周期规则（星期几 + 时间段 + 生效日期范围），自动物化为对应日期的钉时任务
- **完成仪式感**：卡牌翻转庆祝（卡片飞入屏幕中央 → 塔罗星轨卡背 → 描金「完成」印章 + 星星粒子雨 + XP 飘字）、全部完成时「今日毕」印章、XP 奖励（当日幂等防刷）
- **卡牌动效**：新建任务 / 导入计划时，任务卡缩放飞出、旋转一圈金光高亮，然后缩小「贴上」时间轴对应位置（目标卡片金色脉冲）
- **日课打卡**：固定事务模板管理，每日自动带入，任意时间分组
- **每日复盘**：位于计划页左侧栏（宽屏三栏：复盘 / 时间轴 / 倒数日），自评 + 评分 + AI 评价 + 完成统计，支持导出 Markdown / 删除重记
- **心情记录**：今日心情塔罗卡速记（8 张预设卡 + 备注一键记录）+ 颜色年历（月份标签按真实周列对齐、今天呼吸光环定位），支持补记与撤销
- **记账**：支出/收入流水、分类统计、图表
- **新闻热点**：11 个免费新闻源（热榜/科技/开发者/国际）按领域自由选择，服务端聚合抓取 + 10 分钟缓存
- **倒数日便利贴**：计划页右侧栏（移动端在时间轴下方），便利贴样式（纸张配色 + 胶带 + 微倾斜），总览页自动展示最近一个倒数日横幅
- **AI 助手**：对话式计划调整（DeepSeek 或任意 OpenAI 兼容 API；服务端计划生成已下线，接口注释保留）
- **个性化**：白天/夜间模式（跟随系统；切换按钮在侧边栏顶部，移动端为屏幕右上角浮动按钮，跨设备同步）、9 套整体换肤主题（底色/光晕/accent 阶梯，均含暗色变体）、昵称与头像、XP 等级体系
- **用户系统**：邮箱验证码注册、邀请码白名单、游客一键体验（7 天自动清理）
- **管理后台**（`/admin`）：用户列表、禁用/启用、删除、重置密码、邀请码管理、操作审计日志
- **响应式**：移动端抽屉导航 + 小屏降列布局，计划页按宽度三档分栏（≥1280px 三栏 / ≥1024px 双栏 / 小屏单列），全站阴影分层
- **浏览器兼容**：构建目标锁定 `es2020` + `chrome80`，兼容夸克/UC 等老内核 WebView

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Pinia + Vue Router + Axios + anime.js |
| 后端 | FastAPI + Uvicorn |
| 数据库 | SQLite（开发默认）/ MySQL（生产推荐）/ PostgreSQL |
| 认证 | JWT + bcrypt，邮箱验证码（SMTP），邀请码白名单 |
| 部署 | Docker + Docker Compose（可选 Nginx，含 2C2G 轻量服务器调优） |

---

## 快速开始

环境：Python 3.10+、Node.js 20+

```bash
pip install -r requirements.txt
cd frontend && npm install && npm run build
cd .. && uvicorn server.main:app --reload --port 5000
```

访问 http://localhost:5000 。第一个通过邮箱验证码注册的用户自动成为管理员；本地未配置 SMTP 时验证码会直接显示在注册页（开发模式）。也可以点「游客体验」免注册进入。

开发模式（前后端分离热更新）：

```bash
uvicorn server.main:app --reload --port 5000   # 终端 1
cd frontend && npm run dev                     # 终端 2 → http://localhost:5173
```

---

## 部署（Docker）

```bash
cp .env.example .env   # 必填：DP_SECRET_KEY、DP_MYSQL_PASSWORD、DP_MYSQL_ROOT_PASSWORD；可选：SMTP、DEEPSEEK_API_KEY
docker compose --profile production up -d --build
```

架构：`app`（FastAPI + 前端产物）+ `db`（MySQL 8，小内存调优）+ `nginx`（production profile）。详细步骤与服务器配置建议见 `.env.example` 注释与 `docker-compose.yml`。

### 生产运维笔记

- **更新部署**：把改动后的源码同步到服务器 `~/dailyplan`，执行 `sudo docker compose up -d --build app` 即可。前端在镜像内多阶段构建，无需上传 `server/static` 产物。
- **浏览器兼容（勿改）**：`frontend/vite.config.js` 固定了 `target: 'es2020'` + `cssTarget: 'chrome80'`。Vite 6+ 默认目标（baseline-widely-available）会让 CSS 压缩器把 `@media (max-width:768px)` 改写成 range 语法 `@media (width<=768px)`——Chromium <104（夸克/UC 等老内核 WebView）不支持，会**静默丢弃全部移动端样式**。升级 Vite 或调整构建配置时不要移除这两项。
- **MySQL 长连接**：`MySQLDB` 是进程级单例连接，已内置 `ping(reconnect=True)` 探活 + `OperationalError` 断连重试（MySQL `wait_timeout` 默认 8h 会回收空闲连接，无重连时表现为全站接口 500）。`PostgreSQLDB` 目前**没有**同样的重连机制，启用前需补上。

---

## 环境变量（节选）

| 变量 | 默认 | 说明 |
|------|------|------|
| `DP_ENV` | `development` | `production` 时启动严格校验配置 |
| `DP_DB_TYPE` | `sqlite` | `sqlite` / `mysql` / `postgres` |
| `DP_SECRET_KEY` | — | JWT 签名 + 敏感配置加密密钥，生产必填（≥32 字符） |
| `DP_REGISTRATION_MODE` | `invite_only` | 邀请码白名单 / `open` |
| `DP_GUEST_ENABLED` | `true` | 游客模式开关 |
| `DP_SMTP_*` | — | 注册验证码发信（QQ/163/企业邮均可） |
| `DEEPSEEK_API_KEY` | — | 服务端 AI 计划生成 |

完整列表见 `.env.example`。

---

## 项目结构

```
├── frontend/        # Vue 3 SPA（页面 / 组件 / Pinia stores / 设计系统）
├── server/          # FastAPI 后端（main 路由、db 抽象层、auth、config、mailer、crypto、ai_proxy）
├── scripts/         # 运维参考（init_mysql.sql）与 e2e 验证脚本
├── Dockerfile       # 多阶段构建
├── docker-compose.yml
└── nginx.conf
```

---

## 安全设计

- 密码 bcrypt 加盐哈希；用户 API Key 以 Fernet 加密存储
- 每次请求回查数据库：账号禁用/删除立即生效
- 登录、注册、发码、游客创建均有限流；管理操作全量审计
- `.env`、数据库文件、构建产物、用户上传文件均不入库（git）

## 许可证

MIT
