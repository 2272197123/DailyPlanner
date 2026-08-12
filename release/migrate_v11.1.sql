-- ══════════════════════════════════════════════════
-- DailyPlan v11.1 数据库迁移（CloudBase TDSQL 兼容版）
-- ══════════════════════════════════════════════════
-- 使用方法：逐条单独执行，不要一次粘贴全部
-- 报 "Duplicate column" = 列已存在，跳过执行下一条
-- 报其他错误 = 截图发我
-- ══════════════════════════════════════════════════


-- === 第1步：诊断，看看现有表结构 ===
DESCRIBE users;
DESCRIBE state;
SHOW TABLES LIKE 'invite%';


-- === 第2步：users 加 role（报 Duplicate column 就跳过）===
ALTER TABLE users ADD COLUMN role VARCHAR(10) DEFAULT 'user';


-- === 第3步：建邀请码表（不存在就建）===
CREATE TABLE IF NOT EXISTS invite_codes (
    id          INT PRIMARY KEY AUTO_INCREMENT,
    code        VARCHAR(20) NOT NULL UNIQUE,
    created_by  INT,
    used_by     INT,
    used_at     DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- === 第4步：已有用户的 role 升级 ===
UPDATE users SET role = 'admin' WHERE id = 1;


-- === 第5步：确认最终结果 ===
DESCRIBE users;
SHOW TABLES LIKE 'invite%';
SELECT id, username, role FROM users;
