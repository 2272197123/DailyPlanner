#!/usr/bin/env python3
"""DailyPlan 云函数迁移脚本

通过 CloudBase HTTP API 直接执行 SQL，不需要外网连接。
部署为云函数后，通过 HTTP 触发。

用法（云函数部署后）:
  curl https://你的环境ID.service.tcloudbase.com/migrate/migrate
"""

import json
import os


def main(event, context):
    """云函数入口"""
    results = []

    # TDSQL 数据库连接（云函数内网直连）
    import pymysql
    conn = pymysql.connect(
        host=os.environ.get("DP_MYSQL_HOST", "localhost"),
        port=int(os.environ.get("DP_MYSQL_PORT", "3306")),
        user=os.environ.get("DP_MYSQL_USER", "root"),
        password=os.environ.get("DP_MYSQL_PASSWORD", ""),
        database=os.environ.get("DP_MYSQL_DB", "dailyplan"),
        charset="utf8mb4",
        autocommit=True,
    )

    def safe(sql, label):
        try:
            with conn.cursor() as cur:
                cur.execute(sql)
            results.append(f"✅ {label}")
        except Exception as e:
            msg = str(e).split("\n")[0][:120]
            results.append(f"⏭ {label} — {msg}")

    # 1. 诊断
    with conn.cursor() as cur:
        cur.execute("DESCRIBE users")
        results.append("users: " + ", ".join(r[0] for r in cur.fetchall()))

    # 2. users 加 role
    safe("ALTER TABLE users ADD COLUMN role VARCHAR(10) DEFAULT 'user'", "users+role")

    # 3. invite_codes 表
    safe("""CREATE TABLE IF NOT EXISTS invite_codes (
        id INT PRIMARY KEY AUTO_INCREMENT,
        code VARCHAR(20) NOT NULL UNIQUE,
        created_by INT, used_by INT, used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""", "invite_codes表")

    # 4. 业务表加 user_id
    for tbl in ["plans","progress","routine_done","earned","state",
                "archives","day_data","ai_chat_history","ai_requests"]:
        safe(f"ALTER TABLE {tbl} ADD COLUMN user_id INT NOT NULL DEFAULT 1", f"{tbl}+user_id")

    # 5. 管理员
    try:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET role='admin' WHERE id=1")
            cur.execute("SELECT id,username,role FROM users")
            for r in cur.fetchall():
                results.append(f"#{r[0]} {r[1]} = {r[2]}")
    except Exception as e:
        results.append(f"admin: {e}")

    conn.close()
    return {"ok": True, "results": results}
