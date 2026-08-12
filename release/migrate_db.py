#!/usr/bin/env python3
"""DailyPlan 数据库增量迁移工具（v11.1）

用法：
  python migrate_db.py <host> <user> <password> [database]

示例：
  python migrate_db.py gz-cdb-xxxx.sql.tencentcdb.com root mypass dailyplan
"""

import sys

if len(sys.argv) < 4:
    print("用法: python migrate_db.py <host> <user> <password> [database]")
    sys.exit(1)

MYSQL_HOST = sys.argv[1]
MYSQL_USER = sys.argv[2]
MYSQL_PASSWORD = sys.argv[3]
MYSQL_DB = sys.argv[4] if len(sys.argv) > 4 else "dailyplan"
MYSQL_PORT = 3306


def connect():
    import pymysql
    conn = pymysql.connect(
        host=MYSQL_HOST, port=MYSQL_PORT, user=MYSQL_USER,
        password=MYSQL_PASSWORD, database=MYSQL_DB,
        charset="utf8mb4", autocommit=True,
    )
    return conn


def safe_execute(cursor, label, sql):
    try:
        cursor.execute(sql)
        print(f"  ✅ {label}")
    except Exception as e:
        msg = str(e).split("\n")[0][:120]
        print(f"  ⏭  {label} — SKIP ({msg})")


def migrate():
    print(f"连接 {MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB} ...")
    conn = connect()
    cur = conn.cursor()

    # 第 1 步：诊断
    print("\n📋 第 1 步：当前状态")
    cur.execute("DESCRIBE users")
    cols = [r[0] for r in cur.fetchall()]
    print("  users 列:", ", ".join(cols))

    cur.execute("SHOW TABLES LIKE 'invite%'")
    has_invite = bool(cur.fetchall())
    print(f"  invite_codes: {'✅' if has_invite else '❌'}")

    for tbl in ["plans","progress","routine_done","earned","state",
                "archives","day_data","ai_chat_history","ai_requests"]:
        try:
            cur.execute(f"SELECT user_id FROM {tbl} LIMIT 1")
            print(f"  {tbl}.user_id: ✅")
        except:
            print(f"  {tbl}.user_id: ❌")

    # 第 2 步：users 加 role（末尾加，不用 AFTER/FIRST）
    print("\n🔧 第 2 步：users 加 role")
    safe_execute(cur, "users 加 role",
        "ALTER TABLE users ADD COLUMN role VARCHAR(10) DEFAULT 'user'")

    # 第 3 步：建 invite_codes
    print("\n🔧 第 3 步：invite_codes 表")
    safe_execute(cur, "建表", """
        CREATE TABLE IF NOT EXISTS invite_codes (
            id          INT PRIMARY KEY AUTO_INCREMENT,
            code        VARCHAR(20) NOT NULL UNIQUE,
            created_by  INT,
            used_by     INT,
            used_at     DATETIME,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)

    # 第 4 步：业务表加 user_id（末尾加，不用 FIRST）
    print("\n🔧 第 4 步：业务表加 user_id")
    for tbl in ["plans","progress","routine_done","earned","state",
                "archives","day_data","ai_chat_history","ai_requests"]:
        safe_execute(cur, f"{tbl} 加 user_id",
            f"ALTER TABLE {tbl} ADD COLUMN user_id INT NOT NULL DEFAULT 1")

    # 第 5 步：管理员升级
    print("\n🔧 第 5 步：管理员升级")
    try:
        cur.execute("UPDATE users SET role = 'admin' WHERE id = 1")
        cur.execute("SELECT id, username, role FROM users WHERE id = 1")
        row = cur.fetchone()
        if row: print(f"  ✅ #{row[0]} {row[1]} → {row[2]}")
    except Exception as e:
        print(f"  ⏭  SKIP ({e})")

    # 第 6 步：确认
    print("\n📋 完成确认")
    cur.execute("DESCRIBE users")
    print("  users:", ", ".join(r[0] for r in cur.fetchall()))
    cur.execute("SELECT id, username, role FROM users")
    for r in cur.fetchall():
        print(f"  #{r[0]} {r[1]} role={r[2]}")
    cur.execute("SELECT code, used_by FROM invite_codes LIMIT 5")
    codes = cur.fetchall()
    print(f"  邀请码: {len(codes)} 个")
    print("\n🎉 迁移完成！")
    cur.close(); conn.close()


if __name__ == "__main__":
    migrate()
