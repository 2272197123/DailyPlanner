# ═══════════════════════════════════════
# DailyPlan Docker 部署（v12.0，多阶段构建）
# 阶段 1：构建 Vue 3 前端产物
# 阶段 2：Python 运行时 + 后端代码 + 前端产物
# ═══════════════════════════════════════

# ── 阶段 1：前端构建 ──
FROM node:20-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# vite.config.js: outDir = '../server/static' → 输出到 /server/static
RUN npm run build

# ── 阶段 2：运行时 ──
FROM python:3.10-slim

WORKDIR /app

# Python 依赖（全部有预编译 wheel，无需 gcc）
COPY requirements.txt .
# 默认走腾讯云 PyPI 镜像（国内服务器拉取 pypi.org 易超时），可用 --build-arg PIP_INDEX_URL 覆盖
ARG PIP_INDEX_URL=https://mirrors.tencentyun.com/pypi/simple
RUN pip install --no-cache-dir -r requirements.txt -i ${PIP_INDEX_URL} --timeout 120

# 后端代码 + 前端构建产物
COPY server/ ./server/
COPY --from=frontend /server/static ./server/static

ENV PYTHONPATH=/app \
    DP_ENV=production \
    PYTHONUNBUFFERED=1

EXPOSE 5000

# 2C2G 轻量服务器：单 worker 即可（SQLite/MySQL 连接为单例）
CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "5000"]
