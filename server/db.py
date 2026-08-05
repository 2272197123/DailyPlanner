"""DailyPlan 数据库抽象层

支持 SQLite / MySQL / PostgreSQL。通过环境变量 DP_DB_TYPE 切换。

SQLite      — 默认，零配置，适合单机 / 开发
MySQL       — DP_DB_TYPE=mysql
PostgreSQL  — DP_DB_TYPE=postgres（v8.0 生产推荐）

连接 URL 格式（推荐）：
  DP_MYSQL_URL=mysql://user:pass@localhost:3306/dailyplan
  DP_POSTGRES_URL=postgresql://user:pass@localhost:5432/dailyplan

也可以分别设置 HOST / PORT / USER / PASSWORD / DB。
"""

import os, json, sys, re
from pathlib import Path

# ═══════════════════════════════════════
# 环境检测
# ═══════════════════════════════════════

DB_TYPE = os.environ.get("DP_DB_TYPE", "sqlite").lower()
MYSQL_URL = os.environ.get("DP_MYSQL_URL", "")
POSTGRES_URL = os.environ.get("DP_POSTGRES_URL", "")

# 默认 MySQL 连接参数（当 DP_MYSQL_URL 未设置时使用）
MYSQL_DEFAULTS = {
    "host":     os.environ.get("DP_MYSQL_HOST", "localhost"),
    "port":     int(os.environ.get("DP_MYSQL_PORT", "3306")),
    "user":     os.environ.get("DP_MYSQL_USER", "root"),
    "password": os.environ.get("DP_MYSQL_PASSWORD", ""),
    "database": os.environ.get("DP_MYSQL_DB", "dailyplan"),
}

# 默认 PostgreSQL 连接参数（当 DP_POSTGRES_URL 未设置时使用）
POSTGRES_DEFAULTS = {
    "host":     os.environ.get("DP_POSTGRES_HOST", "localhost"),
    "port":     int(os.environ.get("DP_POSTGRES_PORT", "5432")),
    "user":     os.environ.get("DP_POSTGRES_USER", "dailyplan"),
    "password": os.environ.get("DP_POSTGRES_PASSWORD", "dailyplan"),
    "database": os.environ.get("DP_POSTGRES_DB", "dailyplan"),
}

# ═══════════════════════════════════════
# 抽象接口
# ═══════════════════════════════════════

class DBInterface:
    """所有数据库实现必须实现此接口的方法"""

    def connect(self): ...
    def close(self): ...
    def execute(self, sql: str, params: tuple = ()): ...
    def fetchone(self, sql: str, params: tuple = ()) -> dict | None: ...
    def fetchall(self, sql: str, params: tuple = ()) -> list[dict]: ...
    def commit(self): ...
    def init_tables(self): ...


# ═══════════════════════════════════════
# SQLite 实现（默认）
# ═══════════════════════════════════════

class SQLiteDB(DBInterface):
    def __init__(self):
        db_dir = Path(__file__).resolve().parent
        db_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = str(db_dir / "dailyplan.db")
        self.conn = None

    def connect(self):
        import sqlite3
        self.conn = sqlite3.connect(self.db_path)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        return self

    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None

    def execute(self, sql, params=()):
        # 将 MySQL 风格的 %s 转为 SQLite 的 ?
        sql = sql.replace("%s", "?")
        # 将 MySQL 的 ON DUPLICATE KEY UPDATE 转为 SQLite 的 ON CONFLICT ... DO UPDATE
        sql = sql.replace("ON DUPLICATE KEY UPDATE", "ON CONFLICT DO UPDATE SET")
        # INSERT IGNORE → SQLite 的 INSERT OR IGNORE
        sql = sql.replace("INSERT IGNORE", "INSERT OR IGNORE")
        # 去掉 NOW() → SQLite 用 datetime('now','localtime')
        sql = sql.replace("NOW()", "datetime('now','localtime')")
        sql = sql.replace("VALUES(", "excluded.")
        sql = sql.replace("excluded.)", "excluded.")  # fix: VALUES(foo) → excluded.foo
        # 修复 excluded. 后的右括号（兼容反引号/双引号标识符，如 `value`）
        import re
        sql = re.sub(r'excluded\.([`"\w]+)\)', r'excluded.\1', sql)
        return self.conn.execute(sql, params)

    def fetchone(self, sql, params=()):
        row = self.execute(sql, params).fetchone()
        return dict(row) if row else None

    def fetchall(self, sql, params=()):
        rows = self.execute(sql, params).fetchall()
        return [dict(r) for r in rows]

    def commit(self):
        self.conn.commit()

    def init_tables(self):
        self.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                date        TEXT PRIMARY KEY,
                day_mode    TEXT DEFAULT 'full',
                energy      TEXT DEFAULT 'normal',
                notes       TEXT DEFAULT '',
                blocks_json TEXT DEFAULT '[]',
                routines_json TEXT DEFAULT '[]',
                custom_blocks_json TEXT DEFAULT '[]',
                priority_shift TEXT,
                encouragement TEXT DEFAULT '',
                created_at  TEXT DEFAULT (datetime('now','localtime')),
                updated_at  TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                date    TEXT PRIMARY KEY,
                note    TEXT DEFAULT '',
                rating  INTEGER DEFAULT 0,
                mode    TEXT DEFAULT 'full',
                updated_at TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS routine_done (
                date       TEXT NOT NULL,
                routine_id TEXT NOT NULL,
                done       INTEGER DEFAULT 0,
                PRIMARY KEY (date, routine_id)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS earned (
                date      TEXT NOT NULL,
                item_id   TEXT NOT NULL,
                earned_at TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (date, item_id)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS state (
                key   TEXT PRIMARY KEY,
                value TEXT
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS archives (
                date        TEXT PRIMARY KEY,
                data_json   TEXT DEFAULT '{}',
                archived_at TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        # v9.0：每日独立数据表（完整副本持久化，支持 MySQL/PostgreSQL 迁移）
        self.execute("""
            CREATE TABLE IF NOT EXISTS day_data (
                date                  TEXT PRIMARY KEY,
                blocks_json           TEXT DEFAULT '[]',
                routines_json         TEXT DEFAULT '[]',
                routine_progress_json TEXT DEFAULT '{}',
                goals_snapshot_json   TEXT DEFAULT '{}',
                timeline_cfg_json     TEXT DEFAULT '{}',
                progress_json         TEXT DEFAULT '{}',
                archive_data_json     TEXT,
                created_at            TEXT DEFAULT (datetime('now','localtime')),
                updated_at            TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        # v9.0：AI 对话历史表（按日期分区，服务端持久化）
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_chat_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                chat_date   TEXT NOT NULL,
                messages_json TEXT DEFAULT '[]',
                summary     TEXT DEFAULT '',
                created_at  TEXT DEFAULT (datetime('now','localtime')),
                updated_at  TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.commit()

        # 默认值（幂等）
        defaults = {
            "balance": "0", "theme": "system", "activeGoal": "",
            "waferSkin": "wafer", "ownedSkins": '["wafer"]', "activeTheme": "",
        }
        for k, v in defaults.items():
            self.execute(
                "INSERT OR IGNORE INTO state (key, value) VALUES (%s, %s)", (k, v)
            )
        self.commit()


# ═══════════════════════════════════════
# MySQL 实现
# ═══════════════════════════════════════

class MySQLDB(DBInterface):
    def __init__(self):
        import urllib.parse
        if MYSQL_URL:
            parsed = urllib.parse.urlparse(MYSQL_URL)
            self.cfg = {
                "host":     parsed.hostname or "localhost",
                "port":     parsed.port or 3306,
                "user":     parsed.username or "root",
                "password": parsed.password or "",
                "database": parsed.path.lstrip("/") or "dailyplan",
            }
        else:
            self.cfg = dict(MYSQL_DEFAULTS)
        self.conn = None

    def connect(self):
        try:
            import pymysql
        except ImportError:
            print("[MySQL] pymysql 未安装，请执行: pip install pymysql")
            print("[MySQL] 回退到 SQLite 模式")
            db = SQLiteDB()
            db.connect()
            # 猴子补丁：把自身替换为 SQLite 实例
            self.__class__ = SQLiteDB
            self.__dict__ = db.__dict__
            return self

        self.conn = pymysql.connect(
            host=self.cfg["host"],
            port=self.cfg["port"],
            user=self.cfg["user"],
            password=self.cfg["password"],
            database=self.cfg["database"],
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=False,
        )
        return self

    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None

    def execute(self, sql, params=()):
        cur = self.conn.cursor()
        cur.execute(sql, params)
        return cur

    def fetchone(self, sql, params=()):
        cur = self.execute(sql, params)
        row = cur.fetchone()
        cur.close()
        return row

    def fetchall(self, sql, params=()):
        cur = self.execute(sql, params)
        rows = cur.fetchall()
        cur.close()
        return rows

    def commit(self):
        self.conn.commit()

    def init_tables(self):
        self.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                date        VARCHAR(10) PRIMARY KEY,
                day_mode    VARCHAR(20) DEFAULT 'full',
                energy      VARCHAR(20) DEFAULT 'normal',
                notes       TEXT,
                blocks_json MEDIUMTEXT,
                routines_json MEDIUMTEXT,
                custom_blocks_json MEDIUMTEXT,
                priority_shift VARCHAR(20),
                encouragement TEXT,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                date    VARCHAR(10) PRIMARY KEY,
                note    TEXT,
                rating  INT DEFAULT 0,
                mode    VARCHAR(20) DEFAULT 'full',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS routine_done (
                date       VARCHAR(10) NOT NULL,
                routine_id VARCHAR(50) NOT NULL,
                done       TINYINT DEFAULT 0,
                PRIMARY KEY (date, routine_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS earned (
                date      VARCHAR(10) NOT NULL,
                item_id   VARCHAR(100) NOT NULL,
                earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (date, item_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS state (
                `key`   VARCHAR(50) PRIMARY KEY,
                `value` TEXT
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS archives (
                date        VARCHAR(10) PRIMARY KEY,
                data_json   MEDIUMTEXT,
                archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        # v9.0：每日独立数据表（MySQL）
        self.execute("""
            CREATE TABLE IF NOT EXISTS day_data (
                date                  VARCHAR(10) PRIMARY KEY,
                blocks_json           MEDIUMTEXT,
                routines_json         MEDIUMTEXT,
                routine_progress_json MEDIUMTEXT,
                goals_snapshot_json   MEDIUMTEXT,
                timeline_cfg_json     MEDIUMTEXT,
                progress_json         MEDIUMTEXT,
                archive_data_json     MEDIUMTEXT,
                created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        # v9.0：AI 对话历史表（MySQL）
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_chat_history (
                id              INTEGER PRIMARY KEY AUTO_INCREMENT,
                chat_date       VARCHAR(10) NOT NULL,
                messages_json   MEDIUMTEXT,
                summary         TEXT DEFAULT '',
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.commit()

        defaults = {
            "balance": "0", "theme": "system", "activeGoal": "",
            "waferSkin": "wafer", "ownedSkins": '["wafer"]', "activeTheme": "",
        }
        for k, v in defaults.items():
            self.execute(
                "INSERT IGNORE INTO state (`key`, `value`) VALUES (%s, %s)", (k, v)
            )
        self.commit()


# ═══════════════════════════════════════
# PostgreSQL 实现
# ═══════════════════════════════════════

class PostgreSQLDB(DBInterface):
    """PostgreSQL 数据库适配器 — 生产环境推荐"""

    def __init__(self):
        import urllib.parse
        if POSTGRES_URL:
            parsed = urllib.parse.urlparse(POSTGRES_URL)
            self.cfg = {
                "host":     parsed.hostname or "localhost",
                "port":     parsed.port or 5432,
                "user":     parsed.username or "dailyplan",
                "password": parsed.password or "",
                "database": parsed.path.lstrip("/") or "dailyplan",
            }
        else:
            self.cfg = dict(POSTGRES_DEFAULTS)
        self.conn = None

    def connect(self):
        try:
            import psycopg2
            import psycopg2.extras
        except ImportError:
            print("[DB] psycopg2 未安装，请执行: pip install psycopg2-binary")
            print("[DB] 回退到 SQLite 模式")
            db = SQLiteDB()
            db.connect()
            self.__class__ = SQLiteDB
            self.__dict__ = db.__dict__
            return self

        self.conn = psycopg2.connect(
            host=self.cfg["host"],
            port=self.cfg["port"],
            user=self.cfg["user"],
            password=self.cfg["password"],
            dbname=self.cfg["database"],
        )
        self.conn.autocommit = False
        return self

    def close(self):
        if self.conn:
            self.conn.close()
            self.conn = None

    def execute(self, sql, params=()):
        cur = self.conn.cursor()
        # MySQL → PostgreSQL SQL 方言转换
        sql = self._pg_sql(sql)
        cur.execute(sql, params)
        return cur

    def fetchone(self, sql, params=()):
        cur = self.execute(sql, params)
        row = cur.fetchone()
        cur.close()
        if not row:
            return None
        cols = [desc[0] for desc in cur.description]
        return dict(zip(cols, row))

    def fetchall(self, sql, params=()):
        cur = self.execute(sql, params)
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]
        cur.close()
        return [dict(zip(cols, r)) for r in rows]

    def commit(self):
        self.conn.commit()

    @staticmethod
    def _pg_sql(sql: str) -> str:
        """将 MySQL 风格 SQL 转为 PostgreSQL 方言"""
        # 去掉反引号标识符
        sql = re.sub(r'`([^`]+)`', r'"\1"', sql)
        # NOW() 保留不变（PG 支持）
        # INSERT IGNORE → INSERT ... ON CONFLICT DO NOTHING
        if "INSERT IGNORE" in sql:
            sql = sql.replace("INSERT IGNORE", "INSERT")
            # 简单情况：补 ON CONFLICT DO NOTHING
            if "ON CONFLICT" not in sql:
                # 找到主键/唯一键 — 对于已知表，hardcode 冲突策略
                if "earned" in sql.lower():
                    sql = sql.rstrip(";") + " ON CONFLICT (date, item_id) DO NOTHING"
                elif "state" in sql.lower():
                    sql = sql.rstrip(";") + ' ON CONFLICT ("key") DO NOTHING'
                elif "routine_done" in sql.lower():
                    sql = sql.rstrip(";") + " ON CONFLICT (date, routine_id) DO NOTHING"
        # ON DUPLICATE KEY UPDATE → ON CONFLICT ... DO UPDATE
        if "ON DUPLICATE KEY UPDATE" in sql:
            parts = sql.split("ON DUPLICATE KEY UPDATE")
            insert_part = parts[0].strip()
            update_part = parts[1].strip()
            # 简单聚合：用一个通用的冲突解析
            conflict_col = ""
            if "plans" in sql.lower():
                conflict_col = "date"
            elif "progress" in sql.lower():
                conflict_col = "date"
            elif "archives" in sql.lower():
                conflict_col = "date"
            elif "state" in sql.lower():
                conflict_col = '"key"'
            elif "routine_done" in sql.lower():
                conflict_col = "date, routine_id"

            if conflict_col:
                set_clause = re.sub(
                    r'(\w+)\s*=\s*VALUES\s*\(\s*(\w+)\s*\)',
                    r'\1 = excluded.\2',
                    update_part, flags=re.IGNORECASE
                )
                sql = insert_part + f" ON CONFLICT ({conflict_col}) DO UPDATE SET " + set_clause
        # MEDIUMTEXT → TEXT / TINYINT → SMALLINT / DATETIME → TIMESTAMP
        sql = sql.replace("MEDIUMTEXT", "TEXT")
        sql = sql.replace("TINYINT", "SMALLINT")
        # CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP → PG 不支持，简化
        sql = re.sub(
            r'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
            'DEFAULT CURRENT_TIMESTAMP',
            sql
        )
        return sql

    def init_tables(self):
        self.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                date            VARCHAR(10) PRIMARY KEY,
                day_mode        VARCHAR(20) DEFAULT 'full',
                energy          VARCHAR(20) DEFAULT 'normal',
                notes           TEXT DEFAULT '',
                blocks_json     TEXT DEFAULT '[]',
                routines_json   TEXT DEFAULT '[]',
                custom_blocks_json TEXT DEFAULT '[]',
                priority_shift  VARCHAR(20),
                encouragement   TEXT DEFAULT '',
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                date        VARCHAR(10) PRIMARY KEY,
                note        TEXT DEFAULT '',
                rating      INT DEFAULT 0,
                mode        VARCHAR(20) DEFAULT 'full',
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS routine_done (
                date        VARCHAR(10) NOT NULL,
                routine_id  VARCHAR(50) NOT NULL,
                done        SMALLINT DEFAULT 0,
                PRIMARY KEY (date, routine_id)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS earned (
                date        VARCHAR(10) NOT NULL,
                item_id     VARCHAR(100) NOT NULL,
                earned_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (date, item_id)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS state (
                key     VARCHAR(50) PRIMARY KEY,
                value   TEXT
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS archives (
                date            VARCHAR(10) PRIMARY KEY,
                data_json       TEXT DEFAULT '{}',
                archived_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # v9.0：每日独立数据表（PostgreSQL）
        self.execute("""
            CREATE TABLE IF NOT EXISTS day_data (
                date                  VARCHAR(10) PRIMARY KEY,
                blocks_json           TEXT DEFAULT '[]',
                routines_json         TEXT DEFAULT '[]',
                routine_progress_json TEXT DEFAULT '{}',
                goals_snapshot_json   TEXT DEFAULT '{}',
                timeline_cfg_json     TEXT DEFAULT '{}',
                progress_json         TEXT DEFAULT '{}',
                archive_data_json     TEXT,
                created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # v9.0：AI 对话历史表（PostgreSQL）
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_chat_history (
                id              SERIAL PRIMARY KEY,
                chat_date       VARCHAR(10) NOT NULL,
                messages_json   TEXT DEFAULT '[]',
                summary         TEXT DEFAULT '',
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              SERIAL PRIMARY KEY,
                username        VARCHAR(30) NOT NULL UNIQUE,
                password_hash   TEXT NOT NULL,
                email           VARCHAR(200) DEFAULT '',
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_requests (
                id                  SERIAL PRIMARY KEY,
                target_date         VARCHAR(10) NOT NULL,
                success             SMALLINT DEFAULT 0,
                prompt_tokens       INT DEFAULT 0,
                completion_tokens   INT DEFAULT 0,
                total_tokens        INT DEFAULT 0,
                elapsed_sec         REAL DEFAULT 0,
                error_msg           TEXT DEFAULT '',
                prompt_snippet      TEXT DEFAULT '',
                response_snippet    TEXT DEFAULT '',
                created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.commit()

        defaults = {
            "balance": "0", "theme": "system", "activeGoal": "",
            "waferSkin": "wafer", "ownedSkins": '["wafer"]', "activeTheme": "",
        }
        for k, v in defaults.items():
            self.execute(
                "INSERT INTO state (key, value) VALUES (%s, %s) ON CONFLICT (key) DO NOTHING",
                (k, v),
            )
        self.commit()


# ═══════════════════════════════════════
# 工厂函数
# ═══════════════════════════════════════

_db: DBInterface | None = None


def get_db() -> DBInterface:
    """获取数据库实例（单例，懒加载）"""
    global _db
    if _db is not None:
        return _db

    if DB_TYPE == "mysql":
        print(f"[DB] 使用 MySQL: {MYSQL_DEFAULTS['host']}:{MYSQL_DEFAULTS['port']}/{MYSQL_DEFAULTS['database']}")
        _db = MySQLDB()
    elif DB_TYPE == "postgres":
        print(f"[DB] 使用 PostgreSQL: {POSTGRES_DEFAULTS['host']}:{POSTGRES_DEFAULTS['port']}/{POSTGRES_DEFAULTS['database']}")
        _db = PostgreSQLDB()
    else:
        print(f"[DB] 使用 SQLite: server/dailyplan.db")
        _db = SQLiteDB()

    _db.connect()
    _db.init_tables()
    return _db


def reset_db():
    """关闭当前连接，下次 get_db() 重新创建（用于切换数据库类型）"""
    global _db
    if _db:
        _db.close()
    _db = None


# ═══════════════════════════════════════
# 业务层函数（与 db.py 旧接口兼容）
# ═══════════════════════════════════════

def init_db():
    get_db()


# ── 计划 CRUD ──

def get_plan(date: str) -> dict | None:
    db = get_db()
    row = db.fetchone("SELECT * FROM plans WHERE date = %s", (date,))
    if not row:
        return None
    return {
        "date":         row["date"],
        "dayMode":      row["day_mode"],
        "energyLevel":  row["energy"],
        "specialNotes": row["notes"],
        "blocks":       json.loads(row["blocks_json"]),
        "routines":     json.loads(row["routines_json"]),
        "customBlocks": json.loads(row["custom_blocks_json"]),
        "priorityShift": row["priority_shift"],
        "encouragement": row["encouragement"],
    }


def save_plan(plan: dict):
    db = get_db()
    db.execute("""
        INSERT INTO plans (date, day_mode, energy, notes, blocks_json, routines_json,
                           custom_blocks_json, priority_shift, encouragement, updated_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
        ON DUPLICATE KEY UPDATE
            day_mode=VALUES(day_mode), energy=VALUES(energy), notes=VALUES(notes),
            blocks_json=VALUES(blocks_json), routines_json=VALUES(routines_json),
            custom_blocks_json=VALUES(custom_blocks_json),
            priority_shift=VALUES(priority_shift), encouragement=VALUES(encouragement),
            updated_at=NOW()
    """, (
        plan["date"], plan.get("dayMode", "full"), plan.get("energyLevel", "normal"),
        plan.get("specialNotes", ""),
        json.dumps(plan.get("blocks", []), ensure_ascii=False),
        json.dumps(plan.get("routines", []), ensure_ascii=False),
        json.dumps(plan.get("customBlocks", []), ensure_ascii=False),
        plan.get("priorityShift"), plan.get("encouragement", ""),
    ))
    db.commit()


def delete_plan(date: str) -> bool:
    db = get_db()
    cur = db.execute("DELETE FROM plans WHERE date = %s", (date,))
    db.commit()
    return cur.rowcount > 0


def list_plans(limit: int = 60) -> list[dict]:
    db = get_db()
    rows = db.fetchall("SELECT * FROM plans ORDER BY date DESC LIMIT %s", (limit,))
    return [{
        "date": r["date"], "dayMode": r["day_mode"], "energyLevel": r["energy"],
        "specialNotes": r["notes"], "blocks": json.loads(r["blocks_json"]),
        "routines": json.loads(r["routines_json"]),
        "customBlocks": json.loads(r["custom_blocks_json"]),
        "priorityShift": r["priority_shift"], "encouragement": r["encouragement"],
    } for r in rows]


# ── 进度 ──

def get_progress(date: str) -> dict:
    db = get_db()
    row = db.fetchone("SELECT * FROM progress WHERE date = %s", (date,))
    if not row:
        return {"date": date, "note": "", "rating": 0, "mode": "full"}
    return {"date": row["date"], "note": row["note"], "rating": row["rating"], "mode": row["mode"]}


def save_progress(p: dict):
    db = get_db()
    db.execute(
        "INSERT INTO progress (date, note, rating, mode, updated_at) "
        "VALUES (%s,%s,%s,%s, NOW()) "
        "ON DUPLICATE KEY UPDATE note=VALUES(note), rating=VALUES(rating), mode=VALUES(mode), updated_at=NOW()",
        (p["date"], p.get("note", ""), p.get("rating", 0), p.get("mode", "full")),
    )
    db.commit()


# ── 日常项 ──

def get_routine_done(date: str) -> dict[str, bool]:
    db = get_db()
    rows = db.fetchall("SELECT routine_id, done FROM routine_done WHERE date = %s", (date,))
    return {r["routine_id"]: bool(r["done"]) for r in rows}


def set_routine_done(date: str, rid: str, done: bool):
    db = get_db()
    db.execute(
        "INSERT INTO routine_done (date, routine_id, done) VALUES (%s,%s,%s) "
        "ON DUPLICATE KEY UPDATE done = VALUES(done)",
        (date, rid, 1 if done else 0),
    )
    db.commit()


# ── 晶圆 ──

def get_state(key: str) -> str:
    db = get_db()
    row = db.fetchone("SELECT value FROM state WHERE `key` = %s", (key,))
    return row["value"] if row else ""


def set_state(key: str, value: str):
    db = get_db()
    db.execute(
        "INSERT INTO state (`key`, `value`) VALUES (%s,%s) "
        "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
        (key, value),
    )
    db.commit()


def get_balance() -> int:
    return int(get_state("balance") or 0)


def set_balance(v: int):
    set_state("balance", str(v))


def is_earned(date: str, item_id: str) -> bool:
    db = get_db()
    row = db.fetchone("SELECT 1 FROM earned WHERE date = %s AND item_id = %s", (date, item_id))
    return row is not None


def mark_earned(date: str, item_id: str):
    db = get_db()
    db.execute("INSERT IGNORE INTO earned (date, item_id) VALUES (%s, %s)", (date, item_id))
    db.commit()


def get_all_earned(date: str) -> list[str]:
    db = get_db()
    rows = db.fetchall("SELECT item_id FROM earned WHERE date = %s", (date,))
    return [r["item_id"] for r in rows]


# ── 存档（每日完成情况快照） ──

def save_archive(date: str, data: dict):
    """保存某天的存档快照（全量 JSON，覆盖式）"""
    db = get_db()
    db.execute(
        "INSERT INTO archives (date, data_json, archived_at) "
        "VALUES (%s,%s, NOW()) "
        "ON DUPLICATE KEY UPDATE data_json=VALUES(data_json), archived_at=NOW()",
        (date, json.dumps(data, ensure_ascii=False)),
    )
    db.commit()


def get_archive(date: str) -> dict | None:
    db = get_db()
    row = db.fetchone("SELECT * FROM archives WHERE date = %s", (date,))
    if not row:
        return None
    try:
        data = json.loads(row["data_json"])
    except Exception:
        data = {}
    data["_archivedAt"] = row["archived_at"]
    return data


def list_archives(limit: int = 365) -> list[dict]:
    """返回所有存档的摘要列表（日期 + 存档时间 + 完成统计）"""
    db = get_db()
    rows = db.fetchall(
        "SELECT date, data_json, archived_at FROM archives ORDER BY date DESC LIMIT %s",
        (limit,),
    )
    out = []
    for r in rows:
        try:
            data = json.loads(r["data_json"])
        except Exception:
            data = {}
        summary = data.get("summary") or {}
        out.append({
            "date": r["date"],
            "archivedAt": r["archived_at"],
            "summary": summary,
        })
    return out


# ── 每日独立数据（v9.0：完整副本持久化） ──

def save_day_data(date: str, data: dict):
    """保存某天的完整独立数据（blocks + routines + progress + timelineCfg + archiveData）"""
    db = get_db()
    db.execute(
        "INSERT INTO day_data (date, blocks_json, routines_json, routine_progress_json, "
        "goals_snapshot_json, timeline_cfg_json, progress_json, archive_data_json, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s, NOW()) "
        "ON DUPLICATE KEY UPDATE "
        "blocks_json=VALUES(blocks_json), routines_json=VALUES(routines_json), "
        "routine_progress_json=VALUES(routine_progress_json), "
        "goals_snapshot_json=VALUES(goals_snapshot_json), "
        "timeline_cfg_json=VALUES(timeline_cfg_json), "
        "progress_json=VALUES(progress_json), "
        "archive_data_json=VALUES(archive_data_json), "
        "updated_at=NOW()",
        (
            date,
            json.dumps(data.get("blocks", []), ensure_ascii=False),
            json.dumps(data.get("routines", []), ensure_ascii=False),
            json.dumps(data.get("routineProgress", {}), ensure_ascii=False),
            json.dumps(data.get("goalsSnapshot", {}), ensure_ascii=False),
            json.dumps(data.get("timelineCfg", {}), ensure_ascii=False),
            json.dumps(data.get("progress", {}), ensure_ascii=False),
            json.dumps(data.get("archiveData"), ensure_ascii=False) if data.get("archiveData") else None,
        ),
    )
    db.commit()


def get_day_data(date: str) -> dict | None:
    """读取某天的完整独立数据"""
    db = get_db()
    row = db.fetchone("SELECT * FROM day_data WHERE date = %s", (date,))
    if not row:
        return None
    data = {
        "blocks": _safe_json(row.get("blocks_json", "[]"), []),
        "routines": _safe_json(row.get("routines_json", "[]"), []),
        "routineProgress": _safe_json(row.get("routine_progress_json", "{}"), {}),
        "goalsSnapshot": _safe_json(row.get("goals_snapshot_json", "{}"), {}),
        "timelineCfg": _safe_json(row.get("timeline_cfg_json", "{}"), {}),
        "progress": _safe_json(row.get("progress_json", "{}"), {}),
        "archiveData": _safe_json(row.get("archive_data_json"), None),
    }
    return data


def _safe_json(raw, default=None):
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


# ── AI 对话历史（v9.0） ──

def save_chat_history(date: str, messages: list, summary: str = ""):
    """保存某天的 AI 对话历史（覆盖式）"""
    db = get_db()
    db.execute(
        "INSERT INTO ai_chat_history (chat_date, messages_json, summary, updated_at) "
        "VALUES (%s, %s, %s, NOW()) "
        "ON DUPLICATE KEY UPDATE messages_json=VALUES(messages_json), summary=VALUES(summary), updated_at=NOW()",
        (date, json.dumps(messages, ensure_ascii=False), summary),
    )
    db.commit()


def get_chat_history(date: str) -> dict | None:
    """读取某天的 AI 对话历史"""
    db = get_db()
    row = db.fetchone("SELECT * FROM ai_chat_history WHERE chat_date = %s", (date,))
    if not row:
        return None
    return {
        "chatDate": row["chat_date"],
        "messages": _safe_json(row.get("messages_json", "[]"), []),
        "summary": row.get("summary", ""),
    }
