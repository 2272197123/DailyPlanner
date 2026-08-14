# DailyPlan

> 当前版本：**v0**

个人日程管理与学习规划助手。把每天的任务、固定日课、心情、账目和目标收进一条清晰的时间轴，用 XP 与等级记录每一点进步。

---

## 功能一览

- **每日计划**：统一时间轴（任务与固定日课按时间穿插）、拖拽排序、当前时刻线、子任务、任务计时
- **完成仪式感**：完成粒子动效、全部完成时「今日毕」印章庆祝、XP 奖励（当日幂等防刷）
- **日课打卡**：固定事务模板管理，每日自动带入，任意时间分组
- **每日复盘**：自评 + 评分 + AI 评价 + 完成统计，支持导出 Markdown / 删除重记
- **心情记录**：颜色格子标记每一天，支持补记与撤销
- **记账**：支出/收入流水、分类统计、图表
- **长期目标**：目标 → 阶段 → 里程碑拆解，与每日任务联动
- **AI 助手**：生成每日计划、任务顺延、对话式调整（DeepSeek 或任意 OpenAI 兼容 API）
- **个性化**：白天/夜间模式（跟随系统，可手动切换）、8 套整体换肤主题（底色/光晕/accent 阶梯，均含暗色变体）、昵称与头像、XP 等级体系
- **用户系统**：邮箱验证码注册、邀请码白名单、游客一键体验（7 天自动清理）
- **管理后台**（`/admin`）：用户列表、禁用/启用、删除、重置密码、邀请码管理、操作审计日志
- **响应式**：移动端抽屉导航 + 小屏降列布局，桌面端宽屏居中，全站阴影分层

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
