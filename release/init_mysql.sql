-- DailyPlan v11.0 — MySQL 初始化脚本
-- 云开发 MySQL 8.0 使用此脚本初始化数据库和表结构。
-- 执行方式：在 CloudBase MySQL 控制台 → 数据库管理 → 导入 SQL 文件

CREATE DATABASE IF NOT EXISTS dailyplan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE dailyplan;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    username        VARCHAR(30) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    email           VARCHAR(200) DEFAULT '',
    role            VARCHAR(10) DEFAULT 'user',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
    id          INT PRIMARY KEY AUTO_INCREMENT,
    code        VARCHAR(20) NOT NULL UNIQUE,
    created_by  INT,
    used_by     INT,
    used_at     DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每日计划
CREATE TABLE IF NOT EXISTS plans (
    user_id     INT NOT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 进度
CREATE TABLE IF NOT EXISTS progress (
    user_id     INT NOT NULL,
    date        VARCHAR(10) NOT NULL,
    note        TEXT,
    rating      INT DEFAULT 0,
    mode        VARCHAR(20) DEFAULT 'full',
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 日课完成状态
CREATE TABLE IF NOT EXISTS routine_done (
    user_id     INT NOT NULL,
    date        VARCHAR(10) NOT NULL,
    routine_id  VARCHAR(50) NOT NULL,
    done        TINYINT DEFAULT 0,
    PRIMARY KEY (user_id, date, routine_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- XP 奖励记录
CREATE TABLE IF NOT EXISTS earned (
    user_id     INT NOT NULL,
    date        VARCHAR(10) NOT NULL,
    item_id     VARCHAR(100) NOT NULL,
    earned_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, date, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 全局状态（键值对）
CREATE TABLE IF NOT EXISTS state (
    user_id INT NOT NULL,
    `key`   VARCHAR(50) NOT NULL,
    `value` TEXT,
    PRIMARY KEY (user_id, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每日存档
CREATE TABLE IF NOT EXISTS archives (
    user_id     INT NOT NULL,
    date        VARCHAR(10) NOT NULL,
    data_json   MEDIUMTEXT,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每日独立数据（完整副本持久化）
CREATE TABLE IF NOT EXISTS day_data (
    user_id               INT NOT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AI 对话历史
CREATE TABLE IF NOT EXISTS ai_chat_history (
    id              INT PRIMARY KEY AUTO_INCREMENT,
    user_id         INT NOT NULL,
    chat_date       VARCHAR(10) NOT NULL,
    messages_json   MEDIUMTEXT,
    summary         TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ai_chat_user_date (user_id, chat_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- AI 请求日志
CREATE TABLE IF NOT EXISTS ai_requests (
    id                  INT PRIMARY KEY AUTO_INCREMENT,
    user_id             INT NOT NULL DEFAULT 0,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
