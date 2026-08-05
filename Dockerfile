# ═══════════════════════════════════════
# DailyPlan Docker 部署（v8.0）
# ═══════════════════════════════════════

FROM python:3.10-slim

WORKDIR /app

# 系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 应用代码
COPY . .

# 前端入口 — study_planner 子目录
# server/ 为后端包根
ENV PYTHONPATH=/app

EXPOSE 5000

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "5000"]
