# 部署文件清单

## 📁 release/static/ — 上传到 CloudBase「静态网站托管」

### ⚠️ 重要：上传的是已构建好的文件，不要开"自动构建"

CloudBase 自动检测到 Vue 框架后，会跑 `npm install` → `npm run build` → `tcb hosting deploy ./dist`。
目录中已放置占位 `package.json`，`build` 脚本会自动把文件复制到 `dist/` 目录以满足部署流程。
如果仍然失败，请在 CloudBase 控制台关掉「自动构建」或选择「纯静态托管」模式。

### 上传注意事项

1. 上传前打开 `config.js`，将 `apiBaseUrl` 改为云托管服务的外网地址
2. 保留目录中的 `package.json`（占位文件，让流水线正常完成）
3. 上传后，在静态网站托管设置中开启「404 回退到 index.html」（SPA 路由需要）

   上传后根目录结构：
   ├── index.html
   ├── package.json       ← 占位文件
   ├── config.js          ← ⚠️ 提前改 apiBaseUrl
   ├── favicon.svg
   ├── icons.svg
   └── assets/            ← JS/CSS 文件


## 📁 release/cloudrun/ — 构建 Docker 镜像

在 **release/cloudrun/ 目录下** 执行：

```bash
docker build -t dailyplan:latest .
```

然后推送到 CloudBase 云托管（参考 OPERATIONS.md）。

   目录内容：
   ├── Dockerfile           ← 镜像构建文件
   ├── requirements.txt     ← Python 依赖
   ├── main.py              ← FastAPI 应用入口
   ├── db.py                ← 数据库层
   ├── auth.py              ← 认证模块
   ├── ai_proxy.py          ← AI 代理
   ├── models.py            ← Pydantic 模型
   └── __init__.py


## 📄 release/init_mysql.sql — 导入 CloudBase MySQL

在 CloudBase 控制台 → MySQL 数据库 → 导入此文件，创建所有表。


## 📄 release/generate_codes.py — 邀请码生成工具

部署完成后，在服务器上运行（需安装 Python 依赖）：
```bash
python generate_codes.py --count 10
```


## 📄 release/OPERATIONS.md — 完整操作步骤

详细的逐步骤说明。
