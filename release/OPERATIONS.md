# DailyPlan — CloudBase 部署操作指南

> 本文档面向管理员，介绍如何将 DailyPlan 部署到腾讯云 CloudBase。

---

## 前提条件

1. 注册腾讯云账号并登陆 [CloudBase 控制台](https://console.cloud.tencent.com/tcb)
2. 安装 Docker（用于构建云托管镜像）
3. 已设置 DeepSeek API Key（[platform.deepseek.com](https://platform.deepseek.com) 获取）

---

## 第一步：创建 CloudBase 环境

1. 进入 CloudBase 控制台 → 新建环境
2. 环境名称：`dailyplan`（或自定义）
3. 付费方式：按量计费（有免费额度）
4. 开通以下服务：
   - **MySQL 数据库** — 选择 MySQL 8.0
   - **静态网站托管** — 创建静态托管
   - **云托管** — 开通云托管服务

---

## 第二步：配置 MySQL 数据库

1. 进入 环境 → MySQL 数据库 → 数据库管理
2. 点击「导入」→ 上传 `deploy/init_mysql.sql`
3. 或者在 SQL 查询界面手动执行该 SQL 文件内容

---

## 第三步：构建并上传前端

1. 确保已执行 `cd frontend && npm run build`
2. 构建产物在 `server/static/` 目录
3. 进入 环境 → 静态网站托管 → 上传文件
4. 上传 `server/static/` 目录下的**所有文件**，保持目录结构：

```
根目录 /
├── index.html
├── config.js          ← 修改下面的 API 地址
├── favicon.svg
├── icons.svg
└── assets/
    ├── index-*.js
    ├── index-*.css
    ├── HomeView-*.js
    ├── HomeView-*.css
    ├── LoginView-*.js
    ├── LoginView-*.css
    ├── RegisterView-*.js
    ├── RegisterView-*.css
    ├── SettingsView-*.js
    ├── SettingsView-*.css
    └── client-*.js
```

### ⚠️ 上传前修改 `config.js`

打开 `server/static/config.js`，将 `apiBaseUrl` 改为云托管服务的对外 URL：

```javascript
window.__APP_CONFIG__ = {
  // 云托管的外网访问地址 + /api
  // 格式：https://{服务名}-{环境ID}.ap-shanghai.run.tcloudbase.com/api
  apiBaseUrl: 'https://dailyplan-xxxxx.ap-shanghai.run.tcloudbase.com/api',
}
```

> 注意：这个 URL 需要在第四步云托管部署完成后才能确定。可以先上传，之后在线编辑 `config.js` 文件。

---

## 第四步：构建并推送 Docker 镜像

### 4.1 构建镜像

在项目根目录执行：

```bash
docker build -t dailyplan:latest .
```

### 4.2 推送到 CloudBase 云托管

两种方式：

**方式 A — 使用 CloudBase CLI**：
```bash
# 安装 CLI
npm i -g @cloudbase/cli

# 登录
cloudbase login

# 部署到云托管
cloudbase run deploy --envId <你的环境ID> --image dailyplan:latest
```

**方式 B — 通过控制台手动部署**：
1. 将镜像推送到腾讯云容器镜像服务（TCR）或其他镜像仓库
2. 进入 环境 → 云托管 → 新建服务
3. 服务名称：`dailyplan`
4. 选择镜像仓库和 tag
5. 端口：`5000`
6. 设置环境变量（见下方）

### 4.3 云托管环境变量

在云托管控制台 → 服务 → 环境变量中设置：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DP_DB_TYPE` | `mysql` | 使用 MySQL |
| `DP_MYSQL_HOST` | CloudBase MySQL 内网地址 | 在 MySQL 详情页复制 |
| `DP_MYSQL_PORT` | `3306` | MySQL 端口 |
| `DP_MYSQL_USER` | `root` | MySQL 用户名 |
| `DP_MYSQL_PASSWORD` | 你设置的密码 | MySQL 密码 |
| `DP_MYSQL_DB` | `dailyplan` | 数据库名 |
| `DP_SECRET_KEY` | 随机生成 64 位字符串 | JWT 签名密钥 |
| `DP_REGISTRATION_MODE` | `invite_only` | 注册模式 |
| `DEEPSEEK_API_KEY` | `sk-xxxx` | DeepSeek API Key |

### 4.4 CORS 配置（重要）

如果前端静态托管和云托管不在同一域名下，需要在 `server/main.py` 中限制 CORS 来源。将：

```python
allow_origins=["*"]
```

改为你的静态托管域名：

```python
allow_origins=["https://dailyplan-xxxxx.tcloudbaseapp.com"]
```

重新构建并部署镜像。

---

## 第五步：生成邀请码

### 5.1 注册管理员账号

1. 访问静态托管域名（例如 `https://dailyplan-xxxxx.tcloudbaseapp.com`）
2. 点击「注册」
3. **不填邀请码**（第一个注册的用户自动成为管理员）
4. 填写用户名和密码，完成注册

### 5.2 生成邀请码

**方式 A — 管理员前端 UI（推荐，v11.1+）**：

1. 管理员登录后，点击顶栏用户名旁的 👑 图标
2. 在邀请码管理面板中点击「生成新邀请码」
3. 邀请码列表显示每个码的状态（可用/已使用）

**方式 B — 使用脚本**：

在服务器上或本地执行：

```bash
# 本地 SQLite 模式（开发调试用）
python deploy/generate_codes.py --count 10

# 远程 MySQL 模式（生产用）
export DP_DB_TYPE=mysql
export DP_MYSQL_HOST=<CloudBase MySQL 公网地址>
export DP_MYSQL_USER=root
export DP_MYSQL_PASSWORD=<密码>
export DP_MYSQL_DB=dailyplan
python deploy/generate_codes.py --count 10
```

**方式 B — 使用脚本**：

在服务器上或本地执行：

```bash
# 本地 SQLite 模式（开发调试用）
python deploy/generate_codes.py --count 10

# 远程 MySQL 模式（生产用）
export DP_DB_TYPE=mysql
export DP_MYSQL_HOST=<CloudBase MySQL 公网地址>
export DP_MYSQL_USER=root
export DP_MYSQL_PASSWORD=<密码>
export DP_MYSQL_DB=dailyplan
python deploy/generate_codes.py --count 10
```

**方式 C — 通过管理员 API**（部署后）：

```bash
# 管理员登录获取 token
curl -X POST https://dailyplan-xxxxx.ap-shanghai.run.tcloudbase.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'

# 用返回的 token 生成邀请码
curl -X POST https://dailyplan-xxxxx.ap-shanghai.run.tcloudbase.com/api/admin/invite-codes \
  -H "Authorization: Bearer <token>"
```

**方式 C — 通过管理员 API**（部署后）：

```bash
# 管理员登录获取 token
curl -X POST https://dailyplan-xxxxx.ap-shanghai.run.tcloudbase.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"yourpassword"}'

# 用返回的 token 生成邀请码
curl -X POST https://dailyplan-xxxxx.ap-shanghai.run.tcloudbase.com/api/admin/invite-codes \
  -H "Authorization: Bearer <token>"
```

**方式 D — 直接操作 MySQL**：

```sql
INSERT INTO invite_codes (code, created_by) VALUES ('XXXXXXXX', 1);
```

### 5.3 分享邀请码

将生成的 8 位邀请码分享给需要注册的用户。每人使用一个码，使用后即作废。

---

## 第六步：验证

1. 打开另一个浏览器/隐私窗口
2. 访问静态托管域名
3. 注册测试账号，填入邀请码
4. 确认：
   - 每个账号看到的是自己的数据（互不影响）
   - 未登录时看不到计划页面
   - XP 余额、计划、存档各自独立

---

## 更新部署

后续更新代码的流程：

### 前端更新（两种方式）

**方式 A — 更新 Vue 3 前端**：
```bash
cd frontend && npm run build
# 将 server/static/ 目录下的文件重新上传到静态网站托管
```

**方式 B — 更新旧版前端（study_planner）**：
直接将 `study_planner/` 目录下的修改文件上传到静态网站托管：
```
study_planner/
├── index_modular.html     → 根目录
├── css/
│   ├── style.css
│   ├── timeline.css
│   └── overlay-anim.css
└── js/
    ├── constants.js
    ├── auth.js
    ├── ai.js
    ├── apiconfig.js
    ├── api.js
    ├── store.js
    ├── events.js
    ├── ledger.js
    ├── currency.js
    ├── import.js
    └── ... (其他 JS 模块)
```

### 后端更新

```bash
# 1. 将修改后的 Python 文件复制到 release/cloudrun/
#    (release/cloudrun/ 中的文件会被 Dockerfile COPY 到 ./server/)

# 2. 构建并推送镜像
cd release/cloudrun
docker build -t dailyplan:latest .
# 推送新镜像 → 云托管控制台 → 更新服务
```

### 数据库更新

如需修改数据库 schema，在 CloudBase 控制台 → MySQL → SQL 查询界面执行相应的 DDL 语句。
也可更新 `release/init_mysql.sql` 作为参考。

---

## 常见问题

**Q: 注册时提示「需要邀请码」？**
A: 这是正常行为。第一个注册的用户（管理员）不需要邀请码，后续用户都需要。管理员通过邀请码生成工具创建邀请码。

**Q: 忘记管理员密码？**
A: 通过 MySQL 查询 `SELECT * FROM users WHERE role='admin'` 找到管理员用户名，然后重置密码（需要 bcrypt 哈希）。

**Q: 数据库连接失败？**
A: 确认 MySQL 服务已开通，且云托管与 MySQL 在同一环境内（内网互通）。检查环境变量 `DP_MYSQL_HOST` 是否使用了内网地址。

**Q: 前端 API 请求 404？**
A: 检查 `config.js` 中的 `apiBaseUrl` 是否正确。检查云托管服务的外网 URL 是否与配置一致。
