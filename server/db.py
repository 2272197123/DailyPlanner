"""DailyPlan 数据库抽象层

支持 SQLite / MySQL / PostgreSQL。通过环境变量 DP_DB_TYPE 切换。

SQLite      — 默认，零配置，适合单机 / 开发
MySQL       — DP_DB_TYPE=mysql
PostgreSQL  — DP_DB_TYPE=postgres（v8.0 生产推荐）

连接 URL 格式（推荐）：
  DP_MYSQL_URL=mysql://user:pass@localhost:3306/dailyplan
  DP_POSTGRES_URL=postgresql://user:pass@localhost:5432/dailyplan

也可以分别设置 HOST / PORT / USER / PASSWORD / DB。

v11.0: 多用户数据隔离 — 所有表加入 user_id 列，所有业务函数需要 user_id 参数。
"""

import os, json, sys, re, secrets, string
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

# 独立使用 db.py 时也能读到项目根目录的 .env
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

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
# 邀请码工具
# ═══════════════════════════════════════

def generate_invite_code(length: int = 8) -> str:
    """生成随机邀请码（字母 + 数字，易读不过滤容易混淆字符）"""
    alphabet = string.ascii_uppercase + string.digits
    # 去掉容易混淆的字符
    alphabet = alphabet.translate(str.maketrans('', '', '0O1IL'))
    return ''.join(secrets.choice(alphabet) for _ in range(length))


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
        import threading
        db_dir = Path(__file__).resolve().parent
        db_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = str(db_dir / "dailyplan.db")
        self.conn = None
        self._lock = threading.RLock()  # 单连接跨线程共享，RLock 保证 execute/fetch/commit 原子性

    def connect(self):
        import sqlite3
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        return self

    def close(self):
        with self._lock:
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
        with self._lock:
            return self.conn.execute(sql, params)

    def fetchone(self, sql, params=()):
        with self._lock:
            row = self.execute(sql, params).fetchone()
            return dict(row) if row else None

    def fetchall(self, sql, params=()):
        with self._lock:
            rows = self.execute(sql, params).fetchall()
            return [dict(r) for r in rows]

    def commit(self):
        with self._lock:
            self.conn.commit()

    def init_tables(self):
        # v11.0: 所有业务表加入 user_id 列实现多用户数据隔离
        self.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                username        TEXT NOT NULL UNIQUE,
                password_hash   TEXT NOT NULL,
                email           TEXT DEFAULT '',
                nickname        TEXT DEFAULT '',
                avatar          TEXT DEFAULT '',
                role            TEXT DEFAULT 'user',
                disabled        INTEGER NOT NULL DEFAULT 0,
                is_guest        INTEGER NOT NULL DEFAULT 0,
                expires_at      TEXT,
                created_at      TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS email_codes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                email       TEXT NOT NULL,
                code        TEXT NOT NULL,
                purpose     TEXT DEFAULT 'register',
                expires_at  TEXT NOT NULL,
                used        INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS admin_actions (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id    INTEGER NOT NULL,
                action      TEXT NOT NULL,
                target      TEXT DEFAULT '',
                detail      TEXT DEFAULT '',
                created_at  TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS invite_codes (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                code        TEXT NOT NULL UNIQUE,
                created_by  INTEGER,
                used_by     INTEGER,
                used_at     TEXT,
                created_at  TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                user_id     INTEGER NOT NULL,
                date        TEXT NOT NULL,
                day_mode    TEXT DEFAULT 'full',
                energy      TEXT DEFAULT 'normal',
                notes       TEXT DEFAULT '',
                blocks_json TEXT DEFAULT '[]',
                routines_json TEXT DEFAULT '[]',
                custom_blocks_json TEXT DEFAULT '[]',
                priority_shift TEXT,
                encouragement TEXT DEFAULT '',
                created_at  TEXT DEFAULT (datetime('now','localtime')),
                updated_at  TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                user_id     INTEGER NOT NULL,
                date        TEXT NOT NULL,
                note        TEXT DEFAULT '',
                rating      INTEGER DEFAULT 0,
                mode        TEXT DEFAULT 'full',
                updated_at  TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS routine_done (
                user_id     INTEGER NOT NULL,
                date        TEXT NOT NULL,
                routine_id  TEXT NOT NULL,
                done        INTEGER DEFAULT 0,
                PRIMARY KEY (user_id, date, routine_id)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS earned (
                user_id     INTEGER NOT NULL,
                date        TEXT NOT NULL,
                item_id     TEXT NOT NULL,
                earned_at   TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (user_id, date, item_id)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS state (
                user_id INTEGER NOT NULL,
                key     TEXT NOT NULL,
                value   TEXT,
                PRIMARY KEY (user_id, key)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS archives (
                user_id     INTEGER NOT NULL,
                date        TEXT NOT NULL,
                data_json   TEXT DEFAULT '{}',
                archived_at TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS day_data (
                user_id               INTEGER NOT NULL,
                date                  TEXT NOT NULL,
                blocks_json           TEXT DEFAULT '[]',
                routines_json         TEXT DEFAULT '[]',
                routine_progress_json TEXT DEFAULT '{}',
                goals_snapshot_json   TEXT DEFAULT '{}',
                timeline_cfg_json     TEXT DEFAULT '{}',
                progress_json         TEXT DEFAULT '{}',
                archive_data_json     TEXT,
                created_at            TEXT DEFAULT (datetime('now','localtime')),
                updated_at            TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS moods (
                user_id     INTEGER NOT NULL,
                date        TEXT NOT NULL,
                color       TEXT NOT NULL DEFAULT '#9ca3af',
                label       TEXT NOT NULL DEFAULT '一般',
                note        TEXT DEFAULT '',
                intensity   INTEGER DEFAULT 2,
                created_at  TEXT DEFAULT (datetime('now','localtime')),
                updated_at  TEXT DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_moods_user_date
            ON moods (user_id, date)
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS mood_vents (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                date        TEXT NOT NULL,
                text        TEXT NOT NULL DEFAULT '',
                color       TEXT NOT NULL DEFAULT '#9ca3af',
                created_at  TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_mood_vents_user_date
            ON mood_vents (user_id, date)
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ledger (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                date        TEXT NOT NULL,
                amount      REAL NOT NULL,
                type        TEXT NOT NULL DEFAULT 'expense',
                category    TEXT NOT NULL DEFAULT '其他',
                description TEXT DEFAULT '',
                created_at  TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_ledger_user_date
            ON ledger (user_id, date)
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_chat_history (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                chat_date       TEXT NOT NULL,
                messages_json   TEXT DEFAULT '[]',
                summary         TEXT DEFAULT '',
                created_at      TEXT DEFAULT (datetime('now','localtime')),
                updated_at      TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_ai_chat_user_date
            ON ai_chat_history (user_id, chat_date)
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_requests (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL DEFAULT 0,
                target_date     TEXT NOT NULL,
                success         INTEGER DEFAULT 0,
                prompt_tokens   INTEGER DEFAULT 0,
                completion_tokens INTEGER DEFAULT 0,
                total_tokens    INTEGER DEFAULT 0,
                elapsed_sec     REAL DEFAULT 0,
                error_msg       TEXT DEFAULT '',
                prompt_snippet  TEXT DEFAULT '',
                response_snippet TEXT DEFAULT '',
                created_at      TEXT DEFAULT (datetime('now','localtime'))
            )
        """)
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
            raise RuntimeError(
                "[DB] DP_DB_TYPE=mysql 但 pymysql 未安装，请执行: pip install pymysql"
            ) from None

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
            try:
                self.conn.close()
            except Exception:
                pass
            self.conn = None

    def _ensure_conn(self):
        """探活并自动重连。MySQL wait_timeout 默认 8h，长驻进程隔夜后
        连接会被服务端悄悄关闭（2006 MySQL server has gone away），
        没有重连机制时之后所有请求都会 500。"""
        if self.conn is None:
            self.connect()
            return
        try:
            self.conn.ping(reconnect=True)
        except Exception:
            self.close()
            self.connect()

    def execute(self, sql, params=()):
        import pymysql
        self._ensure_conn()
        try:
            cur = self.conn.cursor()
            cur.execute(sql, params)
            return cur
        except pymysql.OperationalError:
            # 连接在两次查询间隔被断开 → 重连后重试一次（仅重试当前语句，
            # 死连接上未提交的事务已随连接丢弃，由调用方重新发起）。
            # 注意：唯一键冲突等 IntegrityError 不在此列，直接向上抛。
            self.close()
            self.connect()
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
        # v11.0: 所有业务表加入 user_id 列实现多用户数据隔离
        self.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              INTEGER PRIMARY KEY AUTO_INCREMENT,
                username        VARCHAR(30) NOT NULL UNIQUE,
                password_hash   TEXT NOT NULL,
                email           VARCHAR(200) DEFAULT '',
                nickname        VARCHAR(60) DEFAULT '',
                avatar          VARCHAR(300) DEFAULT '',
                role            VARCHAR(10) DEFAULT 'user',
                disabled        TINYINT NOT NULL DEFAULT 0,
                is_guest        TINYINT NOT NULL DEFAULT 0,
                expires_at      DATETIME NULL,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS email_codes (
                id          INTEGER PRIMARY KEY AUTO_INCREMENT,
                email       VARCHAR(200) NOT NULL,
                code        VARCHAR(10) NOT NULL,
                purpose     VARCHAR(20) DEFAULT 'register',
                expires_at  DATETIME NOT NULL,
                used        TINYINT NOT NULL DEFAULT 0,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_email_codes_email (email)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS admin_actions (
                id          INTEGER PRIMARY KEY AUTO_INCREMENT,
                admin_id    INTEGER NOT NULL,
                action      VARCHAR(30) NOT NULL,
                target      VARCHAR(200) DEFAULT '',
                detail      VARCHAR(500) DEFAULT '',
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_admin_actions_time (id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS invite_codes (
                id          INTEGER PRIMARY KEY AUTO_INCREMENT,
                code        VARCHAR(20) NOT NULL UNIQUE,
                created_by  INTEGER,
                used_by     INTEGER,
                used_at     DATETIME,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                day_mode    VARCHAR(20) DEFAULT 'full',
                energy      VARCHAR(20) DEFAULT 'normal',
                notes       TEXT,
                blocks_json MEDIUMTEXT,
                routines_json MEDIUMTEXT,
                custom_blocks_json MEDIUMTEXT,
                priority_shift VARCHAR(20),
                encouragement TEXT,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                note        TEXT,
                rating      INT DEFAULT 0,
                mode        VARCHAR(20) DEFAULT 'full',
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS routine_done (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                routine_id  VARCHAR(50) NOT NULL,
                done        TINYINT DEFAULT 0,
                PRIMARY KEY (user_id, date, routine_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS earned (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                item_id     VARCHAR(100) NOT NULL,
                earned_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date, item_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS state (
                user_id INTEGER NOT NULL,
                `key`   VARCHAR(50) NOT NULL,
                `value` TEXT,
                PRIMARY KEY (user_id, `key`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS archives (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                data_json   MEDIUMTEXT,
                archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS day_data (
                user_id               INTEGER NOT NULL,
                date                  VARCHAR(10) NOT NULL,
                blocks_json           MEDIUMTEXT,
                routines_json         MEDIUMTEXT,
                routine_progress_json MEDIUMTEXT,
                goals_snapshot_json   MEDIUMTEXT,
                timeline_cfg_json     MEDIUMTEXT,
                progress_json         MEDIUMTEXT,
                archive_data_json     MEDIUMTEXT,
                created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS moods (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                color       VARCHAR(7) NOT NULL DEFAULT '#9ca3af',
                label       VARCHAR(20) NOT NULL DEFAULT '一般',
                note        TEXT,
                intensity   INT DEFAULT 2,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date),
                INDEX idx_moods_user_date (user_id, date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS mood_vents (
                id          INT PRIMARY KEY AUTO_INCREMENT,
                user_id     INT NOT NULL,
                date        VARCHAR(10) NOT NULL,
                text        TEXT,
                color       VARCHAR(7) NOT NULL DEFAULT '#9ca3af',
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_mood_vents_user_date (user_id, date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ledger (
                id          INTEGER PRIMARY KEY AUTO_INCREMENT,
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                amount      DECIMAL(12,2) NOT NULL,
                type        VARCHAR(10) NOT NULL DEFAULT 'expense',
                category    VARCHAR(50) NOT NULL DEFAULT '其他',
                description TEXT,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_ledger_user_date (user_id, date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_chat_history (
                id              INTEGER PRIMARY KEY AUTO_INCREMENT,
                user_id         INTEGER NOT NULL,
                chat_date       VARCHAR(10) NOT NULL,
                messages_json   MEDIUMTEXT,
                summary         TEXT,
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_ai_chat_user_date (user_id, chat_date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_requests (
                id                  INTEGER PRIMARY KEY AUTO_INCREMENT,
                user_id             INTEGER NOT NULL DEFAULT 0,
                target_date         VARCHAR(10) NOT NULL,
                success             SMALLINT DEFAULT 0,
                prompt_tokens       INT DEFAULT 0,
                completion_tokens   INT DEFAULT 0,
                total_tokens        INT DEFAULT 0,
                elapsed_sec         REAL DEFAULT 0,
                error_msg           TEXT,
                prompt_snippet      TEXT,
                response_snippet    TEXT,
                created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)
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
            raise RuntimeError(
                "[DB] DP_DB_TYPE=postgres 但 psycopg2 未安装，请执行: pip install psycopg2-binary"
            ) from None

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
                    sql = sql.rstrip(";") + " ON CONFLICT (user_id, date, item_id) DO NOTHING"
                elif "state" in sql.lower():
                    sql = sql.rstrip(";") + ' ON CONFLICT (user_id, "key") DO NOTHING'
                elif "routine_done" in sql.lower():
                    sql = sql.rstrip(";") + " ON CONFLICT (user_id, date, routine_id) DO NOTHING"
                elif "invite_codes" in sql.lower() and "code" in sql.lower():
                    sql = sql.rstrip(";") + " ON CONFLICT (code) DO NOTHING"
        # ON DUPLICATE KEY UPDATE → ON CONFLICT ... DO UPDATE
        if "ON DUPLICATE KEY UPDATE" in sql:
            parts = sql.split("ON DUPLICATE KEY UPDATE")
            insert_part = parts[0].strip()
            update_part = parts[1].strip()
            # 简单聚合：用一个通用的冲突解析
            conflict_col = ""
            if "plans" in sql.lower():
                conflict_col = "user_id, date"
            elif "moods" in sql.lower():
                conflict_col = "user_id, date"
            elif "progress" in sql.lower():
                conflict_col = "user_id, date"
            elif "archives" in sql.lower():
                conflict_col = "user_id, date"
            elif "day_data" in sql.lower():
                conflict_col = "user_id, date"
            elif "state" in sql.lower():
                conflict_col = 'user_id, "key"'
            elif "routine_done" in sql.lower():
                conflict_col = "user_id, date, routine_id"
            elif "ai_chat_history" in sql.lower():
                conflict_col = "id"

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
        # v11.0: 所有业务表加入 user_id 列实现多用户数据隔离
        self.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id              SERIAL PRIMARY KEY,
                username        VARCHAR(30) NOT NULL UNIQUE,
                password_hash   TEXT NOT NULL,
                email           VARCHAR(200) DEFAULT '',
                nickname        VARCHAR(60) DEFAULT '',
                avatar          VARCHAR(300) DEFAULT '',
                role            VARCHAR(10) DEFAULT 'user',
                disabled        SMALLINT NOT NULL DEFAULT 0,
                is_guest        SMALLINT NOT NULL DEFAULT 0,
                expires_at      TIMESTAMP NULL,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS email_codes (
                id          SERIAL PRIMARY KEY,
                email       VARCHAR(200) NOT NULL,
                code        VARCHAR(10) NOT NULL,
                purpose     VARCHAR(20) DEFAULT 'register',
                expires_at  TIMESTAMP NOT NULL,
                used        SMALLINT NOT NULL DEFAULT 0,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS admin_actions (
                id          SERIAL PRIMARY KEY,
                admin_id    INTEGER NOT NULL,
                action      VARCHAR(30) NOT NULL,
                target      VARCHAR(200) DEFAULT '',
                detail      VARCHAR(500) DEFAULT '',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS invite_codes (
                id          SERIAL PRIMARY KEY,
                code        VARCHAR(20) NOT NULL UNIQUE,
                created_by  INTEGER,
                used_by     INTEGER,
                used_at     TIMESTAMP,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS plans (
                user_id         INTEGER NOT NULL,
                date            VARCHAR(10) NOT NULL,
                day_mode        VARCHAR(20) DEFAULT 'full',
                energy          VARCHAR(20) DEFAULT 'normal',
                notes           TEXT DEFAULT '',
                blocks_json     TEXT DEFAULT '[]',
                routines_json   TEXT DEFAULT '[]',
                custom_blocks_json TEXT DEFAULT '[]',
                priority_shift  VARCHAR(20),
                encouragement   TEXT DEFAULT '',
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS progress (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                note        TEXT DEFAULT '',
                rating      INT DEFAULT 0,
                mode        VARCHAR(20) DEFAULT 'full',
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS routine_done (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                routine_id  VARCHAR(50) NOT NULL,
                done        SMALLINT DEFAULT 0,
                PRIMARY KEY (user_id, date, routine_id)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS earned (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                item_id     VARCHAR(100) NOT NULL,
                earned_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date, item_id)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS state (
                user_id INTEGER NOT NULL,
                key     VARCHAR(50) NOT NULL,
                value   TEXT,
                PRIMARY KEY (user_id, key)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS archives (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                data_json   TEXT DEFAULT '{}',
                archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS day_data (
                user_id               INTEGER NOT NULL,
                date                  VARCHAR(10) NOT NULL,
                blocks_json           TEXT DEFAULT '[]',
                routines_json         TEXT DEFAULT '[]',
                routine_progress_json TEXT DEFAULT '{}',
                goals_snapshot_json   TEXT DEFAULT '{}',
                timeline_cfg_json     TEXT DEFAULT '{}',
                progress_json         TEXT DEFAULT '{}',
                archive_data_json     TEXT,
                created_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at            TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS moods (
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                color       VARCHAR(7) NOT NULL DEFAULT '#9ca3af',
                label       VARCHAR(20) NOT NULL DEFAULT '一般',
                note        TEXT DEFAULT '',
                intensity   INT DEFAULT 2,
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, date)
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_moods_user_date
            ON moods (user_id, date)
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS mood_vents (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                text        TEXT DEFAULT '',
                color       VARCHAR(7) NOT NULL DEFAULT '#9ca3af',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_mood_vents_user_date
            ON mood_vents (user_id, date)
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ledger (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL,
                date        VARCHAR(10) NOT NULL,
                amount      NUMERIC(12,2) NOT NULL,
                type        VARCHAR(10) NOT NULL DEFAULT 'expense',
                category    VARCHAR(50) NOT NULL DEFAULT '其他',
                description TEXT DEFAULT '',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_ledger_user_date
            ON ledger (user_id, date)
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_chat_history (
                id              SERIAL PRIMARY KEY,
                user_id         INTEGER NOT NULL,
                chat_date       VARCHAR(10) NOT NULL,
                messages_json   TEXT DEFAULT '[]',
                summary         TEXT DEFAULT '',
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        self.execute("""
            CREATE INDEX IF NOT EXISTS idx_ai_chat_user_date
            ON ai_chat_history (user_id, chat_date)
        """)
        self.execute("""
            CREATE TABLE IF NOT EXISTS ai_requests (
                id                  SERIAL PRIMARY KEY,
                user_id             INTEGER NOT NULL DEFAULT 0,
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
    _run_migrations(_db)
    return _db


def _run_migrations(db: DBInterface):
    """幂等增量迁移：为旧库补齐 v11/v12 新增的列。列已存在时静默跳过。"""
    import logging
    log = logging.getLogger(__name__)
    alters = [
        "ALTER TABLE users ADD COLUMN role VARCHAR(10) DEFAULT 'user'",
        "ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN nickname VARCHAR(60) DEFAULT ''",
        "ALTER TABLE users ADD COLUMN avatar VARCHAR(300) DEFAULT ''",
        "ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE users ADD COLUMN expires_at VARCHAR(30)",
    ]
    for tbl in ["plans", "progress", "routine_done", "earned", "state",
                "archives", "day_data", "moods", "ledger",
                "ai_chat_history", "ai_requests"]:
        alters.append(f"ALTER TABLE {tbl} ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")

    for sql in alters:
        try:
            db.execute(sql)
            db.commit()
            log.info("[migrate] OK %s", sql)
        except Exception as e:
            # 列/表已存在 → 跳过；PG/MySQL 失败事务需回滚后才能继续
            conn = getattr(db, "conn", None)
            if conn is not None:
                try:
                    conn.rollback()
                except Exception:
                    pass
            log.debug("[migrate] skip %s (%s)", sql, str(e).split("\n")[0][:80])


def reset_db():
    """关闭当前连接，下次 get_db() 重新创建（用于切换数据库类型）"""
    global _db
    if _db:
        _db.close()
    _db = None


# ═══════════════════════════════════════
# 用户初始化（v11.0）
# ═══════════════════════════════════════

def init_user_defaults(user_id: int):
    """为新用户初始化 state 表中的默认值"""
    db = get_db()
    defaults = {
        "balance": "0", "theme": "system", "activeGoal": "",
        "waferSkin": "wafer", "ownedSkins": '["wafer"]', "activeTheme": "",
    }
    for k, v in defaults.items():
        db.execute(
            "INSERT IGNORE INTO state (user_id, `key`, `value`) VALUES (%s, %s, %s)",
            (user_id, k, v),
        )
    db.commit()


# ═══════════════════════════════════════
# 业务层函数（v11.0: 全部加入 user_id 参数）
# ═══════════════════════════════════════

def init_db():
    get_db()


# ── 邀请码管理 ──

def create_invite_code(created_by: int) -> str:
    """生成并存储一个邀请码，返回码字符串"""
    db = get_db()
    code = generate_invite_code()
    db.execute(
        "INSERT INTO invite_codes (code, created_by) VALUES (%s, %s)",
        (code, created_by),
    )
    db.commit()
    return code


def use_invite_code(code: str, used_by: int) -> bool:
    """使用邀请码（标记为已用），返回是否成功"""
    db = get_db()
    row = db.fetchone(
        "SELECT id, used_by FROM invite_codes WHERE code = %s",
        (code,),
    )
    if not row or row["used_by"] is not None:
        return False
    db.execute(
        "UPDATE invite_codes SET used_by = %s, used_at = NOW() WHERE code = %s",
        (used_by, code),
    )
    db.commit()
    return True


def validate_invite_code(code: str) -> bool:
    """检查邀请码是否存在且未使用"""
    db = get_db()
    row = db.fetchone(
        "SELECT id FROM invite_codes WHERE code = %s AND used_by IS NULL",
        (code,),
    )
    return row is not None


def list_invite_codes(user_id: int) -> list[dict]:
    """列出管理员创建的所有邀请码"""
    db = get_db()
    rows = db.fetchall(
        "SELECT id, code, created_by, used_by, used_at, created_at "
        "FROM invite_codes WHERE created_by = %s ORDER BY id DESC",
        (user_id,),
    )
    return [dict(r) for r in rows]


def count_users() -> int:
    """返回正式用户数（不含游客，游客不应影响首个注册用户成为管理员）"""
    db = get_db()
    row = db.fetchone("SELECT COUNT(*) as cnt FROM users WHERE is_guest = 0")
    return row["cnt"] if row else 0


# ── 计划 CRUD ──

def get_plan(user_id: int, date: str) -> dict | None:
    db = get_db()
    row = db.fetchone(
        "SELECT * FROM plans WHERE user_id = %s AND date = %s",
        (user_id, date),
    )
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


def save_plan(user_id: int, plan: dict):
    db = get_db()
    db.execute("""
        INSERT INTO plans (user_id, date, day_mode, energy, notes, blocks_json, routines_json,
                           custom_blocks_json, priority_shift, encouragement, updated_at)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW())
        ON DUPLICATE KEY UPDATE
            day_mode=VALUES(day_mode), energy=VALUES(energy), notes=VALUES(notes),
            blocks_json=VALUES(blocks_json), routines_json=VALUES(routines_json),
            custom_blocks_json=VALUES(custom_blocks_json),
            priority_shift=VALUES(priority_shift), encouragement=VALUES(encouragement),
            updated_at=NOW()
    """, (
        user_id,
        plan["date"], plan.get("dayMode", "full"), plan.get("energyLevel", "normal"),
        plan.get("specialNotes", ""),
        json.dumps(plan.get("blocks", []), ensure_ascii=False),
        json.dumps(plan.get("routines", []), ensure_ascii=False),
        json.dumps(plan.get("customBlocks", []), ensure_ascii=False),
        plan.get("priorityShift"), plan.get("encouragement", ""),
    ))
    db.commit()


def delete_plan(user_id: int, date: str) -> bool:
    db = get_db()
    cur = db.execute(
        "DELETE FROM plans WHERE user_id = %s AND date = %s",
        (user_id, date),
    )
    db.commit()
    return cur.rowcount > 0


def list_plans(user_id: int, limit: int = 60) -> list[dict]:
    db = get_db()
    rows = db.fetchall(
        "SELECT * FROM plans WHERE user_id = %s ORDER BY date DESC LIMIT %s",
        (user_id, limit),
    )
    return [{
        "date": r["date"], "dayMode": r["day_mode"], "energyLevel": r["energy"],
        "specialNotes": r["notes"], "blocks": json.loads(r["blocks_json"]),
        "routines": json.loads(r["routines_json"]),
        "customBlocks": json.loads(r["custom_blocks_json"]),
        "priorityShift": r["priority_shift"], "encouragement": r["encouragement"],
    } for r in rows]


# ── 进度 ──

def get_progress(user_id: int, date: str) -> dict:
    db = get_db()
    row = db.fetchone(
        "SELECT * FROM progress WHERE user_id = %s AND date = %s",
        (user_id, date),
    )
    if not row:
        return {"date": date, "note": "", "rating": 0, "mode": "full"}
    return {"date": row["date"], "note": row["note"], "rating": row["rating"], "mode": row["mode"]}


def save_progress(user_id: int, p: dict):
    db = get_db()
    db.execute(
        "INSERT INTO progress (user_id, date, note, rating, mode, updated_at) "
        "VALUES (%s,%s,%s,%s,%s, NOW()) "
        "ON DUPLICATE KEY UPDATE note=VALUES(note), rating=VALUES(rating), mode=VALUES(mode), updated_at=NOW()",
        (user_id, p["date"], p.get("note", ""), p.get("rating", 0), p.get("mode", "full")),
    )
    db.commit()


# ── 心情 ──

def _vent_dict(r: dict) -> dict:
    return {
        "id": r["id"],
        "text": r["text"] or "",
        "color": r["color"],
        "created_at": r.get("created_at") or "",
    }


def list_vents(user_id: int, date: str) -> list[dict]:
    db = get_db()
    rows = db.fetchall(
        "SELECT * FROM mood_vents WHERE user_id = %s AND date = %s "
        "ORDER BY created_at ASC, id ASC",
        (user_id, date),
    )
    return [_vent_dict(r) for r in rows]


def list_vents_by_year(user_id: int, year: int) -> dict:
    """返回 {date: [vent, ...]}，供年视图一次取齐。"""
    db = get_db()
    rows = db.fetchall(
        "SELECT * FROM mood_vents WHERE user_id = %s AND date LIKE %s "
        "ORDER BY created_at ASC, id ASC",
        (user_id, f"{year}%"),
    )
    grouped = {}
    for r in rows:
        grouped.setdefault(r["date"], []).append(_vent_dict(r))
    return grouped


def _srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(c: float) -> float:
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def _blend_colors(hexes: list[str]) -> str:
    """多条吐槽颜色混合：sRGB → 线性光空间算术平均 → 回 sRGB。
    前端 utils/color.js 的 mixColors 与本函数算法保持一致。"""
    if not hexes:
        return "#9ca3af"
    acc = [0.0, 0.0, 0.0]
    for h in hexes:
        h = h.lstrip("#")
        for i in range(3):
            acc[i] += _srgb_to_linear(int(h[i * 2:i * 2 + 2], 16) / 255.0)
    n = len(hexes)
    out = []
    for i in range(3):
        v = max(0, min(255, round(_linear_to_srgb(acc[i] / n) * 255)))
        out.append(f"{v:02x}")
    return "#" + "".join(out)


def _refresh_day_color(user_id: int, date: str):
    """有 vents → 混合色写回 moods.color（无行则补建行）；无 vents → 不动。"""
    db = get_db()
    vents = list_vents(user_id, date)
    if not vents:
        return
    color = _blend_colors([v["color"] for v in vents])
    db.execute(
        "INSERT INTO moods (user_id, date, color, label, note, intensity, updated_at) "
        "VALUES (%s,%s,%s,'一般','',2, NOW()) "
        "ON DUPLICATE KEY UPDATE color=VALUES(color), updated_at=NOW()",
        (user_id, date, color),
    )


def add_vent(user_id: int, date: str, text: str, color: str) -> int:
    db = get_db()
    cur = db.execute(
        "INSERT INTO mood_vents (user_id, date, text, color, created_at) "
        "VALUES (%s,%s,%s,%s, NOW())",
        (user_id, date, text, color),
    )
    _refresh_day_color(user_id, date)
    db.commit()
    return cur.lastrowid


def delete_vent(user_id: int, vent_id: int) -> bool:
    db = get_db()
    row = db.fetchone(
        "SELECT date FROM mood_vents WHERE id = %s AND user_id = %s",
        (vent_id, user_id),
    )
    if not row:
        return False
    db.execute(
        "DELETE FROM mood_vents WHERE id = %s AND user_id = %s",
        (vent_id, user_id),
    )
    _refresh_day_color(user_id, row["date"])
    db.commit()
    return True


def get_mood(user_id: int, date: str) -> dict | None:
    db = get_db()
    row = db.fetchone(
        "SELECT * FROM moods WHERE user_id = %s AND date = %s",
        (user_id, date),
    )
    if not row:
        return None
    return {
        "date": row["date"],
        "color": row["color"],
        "label": row["label"],
        "note": row["note"] or "",
        "intensity": row["intensity"] or 2,
        "vents": list_vents(user_id, date),
    }


def save_mood(user_id: int, m: dict):
    db = get_db()
    # 该日已有吐槽时忽略传入 color，保留混合色（预设卡只改基调/备注）
    vents = list_vents(user_id, m["date"])
    color = _blend_colors([v["color"] for v in vents]) if vents else m.get("color", "#9ca3af")
    db.execute(
        "INSERT INTO moods (user_id, date, color, label, note, intensity, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,%s, NOW()) "
        "ON DUPLICATE KEY UPDATE color=VALUES(color), label=VALUES(label), note=VALUES(note), "
        "intensity=VALUES(intensity), updated_at=NOW()",
        (user_id, m["date"], color, m.get("label", "一般"),
         m.get("note", ""), m.get("intensity", 2)),
    )
    db.commit()


def delete_mood(user_id: int, date: str) -> bool:
    db = get_db()
    cur = db.execute(
        "DELETE FROM moods WHERE user_id = %s AND date = %s",
        (user_id, date),
    )
    db.commit()
    return cur.rowcount > 0


def list_moods(user_id: int, year: int | None = None) -> list[dict]:
    db = get_db()
    if year:
        rows = db.fetchall(
            "SELECT * FROM moods WHERE user_id = %s AND date LIKE %s ORDER BY date ASC",
            (user_id, f"{year}%"),
        )
        vents_by_date = list_vents_by_year(user_id, year)
    else:
        rows = db.fetchall(
            "SELECT * FROM moods WHERE user_id = %s ORDER BY date ASC",
            (user_id,),
        )
        vents_by_date = {}
        for v in db.fetchall(
            "SELECT * FROM mood_vents WHERE user_id = %s ORDER BY created_at ASC, id ASC",
            (user_id,),
        ):
            vents_by_date.setdefault(v["date"], []).append(_vent_dict(v))
    return [{
        "date": r["date"],
        "color": r["color"],
        "label": r["label"],
        "note": r["note"] or "",
        "intensity": r["intensity"] or 2,
        "vents": vents_by_date.get(r["date"], []),
    } for r in rows]


# ── 记账 ──

def get_ledger(user_id: int, entry_id: int) -> dict | None:
    db = get_db()
    row = db.fetchone(
        "SELECT * FROM ledger WHERE id = %s AND user_id = %s",
        (entry_id, user_id),
    )
    if not row:
        return None
    return {
        "id": row["id"],
        "date": row["date"],
        "amount": float(row["amount"]),
        "type": row["type"],
        "category": row["category"],
        "description": row["description"] or "",
        "created_at": row["created_at"],
    }


def list_ledger(user_id: int, start: str | None = None, end: str | None = None) -> list[dict]:
    db = get_db()
    sql = "SELECT * FROM ledger WHERE user_id = %s"
    params = [user_id]
    if start:
        sql += " AND date >= %s"
        params.append(start)
    if end:
        sql += " AND date <= %s"
        params.append(end)
    sql += " ORDER BY date DESC, id DESC"
    rows = db.fetchall(sql, tuple(params))
    return [{
        "id": r["id"],
        "date": r["date"],
        "amount": float(r["amount"]),
        "type": r["type"],
        "category": r["category"],
        "description": r["description"] or "",
        "created_at": r["created_at"],
    } for r in rows]


def create_ledger(user_id: int, entry: dict) -> int:
    db = get_db()
    cur = db.execute(
        "INSERT INTO ledger (user_id, date, amount, type, category, description) "
        "VALUES (%s,%s,%s,%s,%s,%s)",
        (user_id, entry["date"], float(entry["amount"]), entry.get("type", "expense"),
         entry.get("category", "其他"), entry.get("description", "")),
    )
    db.commit()
    return cur.lastrowid


def update_ledger(user_id: int, entry_id: int, entry: dict) -> bool:
    db = get_db()
    cur = db.execute(
        "UPDATE ledger SET date = %s, amount = %s, type = %s, category = %s, description = %s "
        "WHERE id = %s AND user_id = %s",
        (entry["date"], float(entry["amount"]), entry.get("type", "expense"),
         entry.get("category", "其他"), entry.get("description", ""), entry_id, user_id),
    )
    db.commit()
    return cur.rowcount > 0


def delete_ledger(user_id: int, entry_id: int) -> bool:
    db = get_db()
    cur = db.execute(
        "DELETE FROM ledger WHERE id = %s AND user_id = %s",
        (entry_id, user_id),
    )
    db.commit()
    return cur.rowcount > 0


# ── 日常项 ──

def get_routine_done(user_id: int, date: str) -> dict[str, bool]:
    db = get_db()
    rows = db.fetchall(
        "SELECT routine_id, done FROM routine_done WHERE user_id = %s AND date = %s",
        (user_id, date),
    )
    return {r["routine_id"]: bool(r["done"]) for r in rows}


def set_routine_done(user_id: int, date: str, rid: str, done: bool):
    db = get_db()
    db.execute(
        "INSERT INTO routine_done (user_id, date, routine_id, done) VALUES (%s,%s,%s,%s) "
        "ON DUPLICATE KEY UPDATE done = VALUES(done)",
        (user_id, date, rid, 1 if done else 0),
    )
    db.commit()


# ── 晶圆 ──

def get_state(user_id: int, key: str) -> str:
    db = get_db()
    row = db.fetchone(
        "SELECT value FROM state WHERE user_id = %s AND `key` = %s",
        (user_id, key),
    )
    return row["value"] if row else ""


def set_state(user_id: int, key: str, value: str):
    db = get_db()
    db.execute(
        "INSERT INTO state (user_id, `key`, `value`) VALUES (%s,%s,%s) "
        "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
        (user_id, key, value),
    )
    db.commit()


def get_balance(user_id: int) -> int:
    return int(get_state(user_id, "balance") or 0)


def set_balance(user_id: int, v: int):
    set_state(user_id, "balance", str(v))


def is_earned(user_id: int, date: str, item_id: str) -> bool:
    db = get_db()
    row = db.fetchone(
        "SELECT 1 FROM earned WHERE user_id = %s AND date = %s AND item_id = %s",
        (user_id, date, item_id),
    )
    return row is not None


def mark_earned(user_id: int, date: str, item_id: str):
    db = get_db()
    db.execute(
        "INSERT IGNORE INTO earned (user_id, date, item_id) VALUES (%s, %s, %s)",
        (user_id, date, item_id),
    )
    db.commit()


def unmark_earned(user_id: int, date: str, item_id: str):
    """撤销已发放登记（取消完成退 XP 用）；DELETE 本身幂等，重复删除不报错"""
    db = get_db()
    db.execute(
        "DELETE FROM earned WHERE user_id = %s AND date = %s AND item_id = %s",
        (user_id, date, item_id),
    )
    db.commit()


def get_all_earned(user_id: int, date: str) -> list[str]:
    db = get_db()
    rows = db.fetchall(
        "SELECT item_id FROM earned WHERE user_id = %s AND date = %s",
        (user_id, date),
    )
    return [r["item_id"] for r in rows]


# ── 存档（每日完成情况快照） ──

def save_archive(user_id: int, date: str, data: dict):
    """保存某天的存档快照（全量 JSON，覆盖式）"""
    db = get_db()
    db.execute(
        "INSERT INTO archives (user_id, date, data_json, archived_at) "
        "VALUES (%s,%s,%s, NOW()) "
        "ON DUPLICATE KEY UPDATE data_json=VALUES(data_json), archived_at=NOW()",
        (user_id, date, json.dumps(data, ensure_ascii=False)),
    )
    db.commit()


def get_archive(user_id: int, date: str) -> dict | None:
    db = get_db()
    row = db.fetchone(
        "SELECT * FROM archives WHERE user_id = %s AND date = %s",
        (user_id, date),
    )
    if not row:
        return None
    try:
        data = json.loads(row["data_json"])
    except Exception:
        data = {}
    data["_archivedAt"] = row["archived_at"]
    return data


def list_archives(user_id: int, limit: int = 365) -> list[dict]:
    """返回所有存档的摘要列表（日期 + 存档时间 + 完成统计）"""
    db = get_db()
    rows = db.fetchall(
        "SELECT date, data_json, archived_at FROM archives "
        "WHERE user_id = %s ORDER BY date DESC LIMIT %s",
        (user_id, limit),
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

def save_day_data(user_id: int, date: str, data: dict):
    """保存某天的完整独立数据（blocks + routines + progress + timelineCfg + archiveData）"""
    db = get_db()
    db.execute(
        "INSERT INTO day_data (user_id, date, blocks_json, routines_json, routine_progress_json, "
        "goals_snapshot_json, timeline_cfg_json, progress_json, archive_data_json, updated_at) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s, NOW()) "
        "ON DUPLICATE KEY UPDATE "
        "blocks_json=VALUES(blocks_json), routines_json=VALUES(routines_json), "
        "routine_progress_json=VALUES(routine_progress_json), "
        "goals_snapshot_json=VALUES(goals_snapshot_json), "
        "timeline_cfg_json=VALUES(timeline_cfg_json), "
        "progress_json=VALUES(progress_json), "
        "archive_data_json=VALUES(archive_data_json), "
        "updated_at=NOW()",
        (
            user_id,
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


def get_day_data(user_id: int, date: str) -> dict | None:
    """读取某天的完整独立数据"""
    db = get_db()
    row = db.fetchone(
        "SELECT * FROM day_data WHERE user_id = %s AND date = %s",
        (user_id, date),
    )
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

def save_chat_history(user_id: int, date: str, messages: list, summary: str = ""):
    """保存某天的 AI 对话历史（覆盖式）"""
    db = get_db()
    # 先检查是否存在
    existing = db.fetchone(
        "SELECT id FROM ai_chat_history WHERE user_id = %s AND chat_date = %s",
        (user_id, date),
    )
    if existing:
        db.execute(
            "UPDATE ai_chat_history SET messages_json = %s, summary = %s, updated_at = NOW() "
            "WHERE user_id = %s AND chat_date = %s",
            (json.dumps(messages, ensure_ascii=False), summary, user_id, date),
        )
    else:
        db.execute(
            "INSERT INTO ai_chat_history (user_id, chat_date, messages_json, summary) "
            "VALUES (%s, %s, %s, %s)",
            (user_id, date, json.dumps(messages, ensure_ascii=False), summary),
        )
    db.commit()


def get_chat_history(user_id: int, date: str) -> dict | None:
    """读取某天的 AI 对话历史"""
    db = get_db()
    row = db.fetchone(
        "SELECT * FROM ai_chat_history WHERE user_id = %s AND chat_date = %s",
        (user_id, date),
    )
    if not row:
        return None
    return {
        "chatDate": row["chat_date"],
        "messages": _safe_json(row.get("messages_json", "[]"), []),
        "summary": row.get("summary", ""),
    }


# ── 用户信息 ──

_USER_COLS = "id, username, email, nickname, avatar, role, disabled, is_guest, expires_at, created_at"


def get_user_by_id(user_id: int) -> dict | None:
    """根据 ID 获取用户信息"""
    db = get_db()
    row = db.fetchone(
        f"SELECT {_USER_COLS} FROM users WHERE id = %s",
        (user_id,),
    )
    return dict(row) if row else None


def get_user_by_email(email: str) -> dict | None:
    """根据邮箱获取用户（空邮箱不参与匹配——游客无邮箱）"""
    if not email:
        return None
    db = get_db()
    row = db.fetchone(
        f"SELECT {_USER_COLS} FROM users WHERE email = %s AND email != ''",
        (email,),
    )
    return dict(row) if row else None


def update_user_profile(user_id: int, nickname: str | None = None, avatar: str | None = None):
    """更新昵称/头像（None 的字段不动）"""
    db = get_db()
    if nickname is not None:
        db.execute("UPDATE users SET nickname = %s WHERE id = %s", (nickname, user_id))
    if avatar is not None:
        db.execute("UPDATE users SET avatar = %s WHERE id = %s", (avatar, user_id))
    db.commit()


def cleanup_expired_guests() -> int:
    """删除已过期的游客账号及其全部数据，返回清理数量"""
    db = get_db()
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    rows = db.fetchall(
        "SELECT id FROM users WHERE is_guest = 1 AND expires_at IS NOT NULL AND expires_at < %s",
        (now,),
    )
    for r in rows:
        delete_user(r["id"])
    return len(rows)


# ── 邮箱验证码（v12.1） ──

def _parse_dt(v) -> datetime | None:
    """兼容 sqlite 字符串与 mysql/pg datetime 对象"""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(str(v)[:19], fmt)
        except ValueError:
            continue
    return None


def create_email_code(email: str, ttl_minutes: int = 10, cooldown_sec: int = 60) -> tuple[str | None, str | None]:
    """为邮箱生成 6 位验证码。成功返回 (code, None)；冷却期内返回 (None, 错误消息)。"""
    db = get_db()
    row = db.fetchone(
        "SELECT created_at FROM email_codes WHERE email = %s ORDER BY id DESC LIMIT 1",
        (email,),
    )
    last = _parse_dt(row["created_at"]) if row else None
    if last and (datetime.now() - last).total_seconds() < cooldown_sec:
        return None, "发送太频繁，请 60 秒后再试"
    # 作废旧码
    db.execute("UPDATE email_codes SET used = 1 WHERE email = %s", (email,))
    code = "".join(secrets.choice(string.digits) for _ in range(6))
    expires = (datetime.now() + timedelta(minutes=ttl_minutes)).strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        "INSERT INTO email_codes (email, code, expires_at) VALUES (%s, %s, %s)",
        (email, code, expires),
    )
    db.commit()
    return code, None


def verify_email_code(email: str, code: str) -> bool:
    """校验并消费验证码（未使用、未过期、最新一条）"""
    db = get_db()
    row = db.fetchone(
        "SELECT id, expires_at FROM email_codes "
        "WHERE email = %s AND code = %s AND used = 0 ORDER BY id DESC LIMIT 1",
        (email, code),
    )
    if not row:
        return False
    exp = _parse_dt(row["expires_at"])
    if exp and datetime.now() > exp:
        return False
    db.execute("UPDATE email_codes SET used = 1 WHERE id = %s", (row["id"],))
    db.commit()
    return True


# ── 管理员：用户管理（v12.0） ──

def list_users() -> list[dict]:
    """列出全部用户（管理员后台用）"""
    db = get_db()
    rows = db.fetchall(
        "SELECT id, username, email, nickname, avatar, role, disabled, is_guest, expires_at, created_at "
        "FROM users ORDER BY id ASC"
    )
    return [dict(r) for r in rows]


def set_user_disabled(user_id: int, disabled: bool) -> bool:
    db = get_db()
    cur = db.execute(
        "UPDATE users SET disabled = %s WHERE id = %s",
        (1 if disabled else 0, user_id),
    )
    db.commit()
    return cur.rowcount > 0


def admin_reset_password(user_id: int, password_hash: str) -> bool:
    db = get_db()
    cur = db.execute(
        "UPDATE users SET password_hash = %s WHERE id = %s",
        (password_hash, user_id),
    )
    db.commit()
    return cur.rowcount > 0


def count_active_admins(exclude_user_id: int | None = None) -> int:
    """统计启用状态的管理员数量（用于防止最后一个 admin 被禁用/删除）"""
    db = get_db()
    if exclude_user_id is None:
        row = db.fetchone(
            "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND disabled = 0"
        )
    else:
        row = db.fetchone(
            "SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND disabled = 0 AND id != %s",
            (exclude_user_id,),
        )
    return row["cnt"] if row else 0


def delete_user(user_id: int):
    """删除用户并级联清理其全部业务数据"""
    db = get_db()
    for tbl in ["plans", "progress", "routine_done", "earned", "state",
                "archives", "day_data", "moods", "ledger",
                "ai_chat_history", "ai_requests"]:
        db.execute(f"DELETE FROM {tbl} WHERE user_id = %s", (user_id,))
    db.execute(
        "DELETE FROM invite_codes WHERE created_by = %s OR used_by = %s",
        (user_id, user_id),
    )
    db.execute("DELETE FROM users WHERE id = %s", (user_id,))
    db.commit()


def revoke_invite_code(code: str, admin_id: int) -> bool:
    """作废未使用的邀请码（仅限本人创建的）"""
    db = get_db()
    cur = db.execute(
        "DELETE FROM invite_codes WHERE code = %s AND created_by = %s AND used_by IS NULL",
        (code, admin_id),
    )
    db.commit()
    return cur.rowcount > 0


# ── 管理操作审计（v12.2） ──

def log_admin_action(admin_id: int, action: str, target: str = "", detail: str = ""):
    """记录一条管理操作审计日志"""
    db = get_db()
    db.execute(
        "INSERT INTO admin_actions (admin_id, action, target, detail) VALUES (%s, %s, %s, %s)",
        (admin_id, action, target[:200], detail[:500]),
    )
    db.commit()


def list_admin_actions(limit: int = 100) -> list[dict]:
    """最近的审计日志（含操作者用户名）"""
    db = get_db()
    rows = db.fetchall(
        "SELECT a.id, a.admin_id, u.username AS admin_name, u.nickname AS admin_nickname, "
        "a.action, a.target, a.detail, a.created_at "
        "FROM admin_actions a LEFT JOIN users u ON u.id = a.admin_id "
        "ORDER BY a.id DESC LIMIT %s",
        (limit,),
    )
    return [dict(r) for r in rows]
