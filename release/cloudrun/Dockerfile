# ═══════════════════════════════════════
# DailyPlan Docker 部署（v11.0）
# CloudBase 云托管 兼容
# ═══════════════════════════════════════

FROM python:3.10-slim

WORKDIR /app

# 系统依赖（仅 pymysql 需要 libssl，psycopg2 需要 libpq）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Python 依赖
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 应用代码（cloudrun/ 目录文件是平铺的，无 server/ 子目录）
COPY *.py ./server/
COPY requirements.txt ./

# server/ 为后端包根
ENV PYTHONPATH=/app

EXPOSE 80

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "80"]