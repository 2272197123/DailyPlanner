"""DailyPlan 集中配置（v12.0）

所有环境变量在此统一读取与校验：
- 导入时自动加载项目根目录的 .env（python-dotenv）
- DP_ENV=production 时 validate() 做严格校验，配置不合格直接拒绝启动
- 其他模块应从这里读取配置，不要各自 os.environ.get
"""

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# ── 运行环境 ──
ENV = os.environ.get("DP_ENV", "development").lower()
IS_PROD = ENV == "production"

# ── 安全 ──
_SECRET_DEFAULTS = {"", "change-me-in-production", "dailyplan-dev-secret-change-in-production"}
SECRET_KEY = os.environ.get("DP_SECRET_KEY", "change-me-in-production")

# ── 注册模式（白名单） ──
REGISTRATION_MODE = os.environ.get("DP_REGISTRATION_MODE", "invite_only").lower()

# ── CORS ──
CORS_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "DP_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if o.strip()
]

# ── AI 服务 ──
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
AI_MODEL = os.environ.get("DP_AI_MODEL", "deepseek-chat")

# ── 日志 ──
LOG_LEVEL = os.environ.get("DP_LOG_LEVEL", "INFO").upper()

# ── SMTP 邮件（注册验证码） ──
SMTP_HOST = os.environ.get("DP_SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("DP_SMTP_PORT", "465"))
SMTP_USERNAME = os.environ.get("DP_SMTP_USERNAME", "")
SMTP_PASSWORD = os.environ.get("DP_SMTP_PASSWORD", "")
SMTP_FROM = os.environ.get("DP_SMTP_FROM", "")  # 发件人显示地址，默认同 SMTP_USERNAME

# ── 游客模式 ──
GUEST_ENABLED = os.environ.get("DP_GUEST_ENABLED", "true").lower() in ("1", "true", "yes", "on")
GUEST_TTL_DAYS = int(os.environ.get("DP_GUEST_TTL_DAYS", "7"))

# ── 部署 ──
PORT = int(os.environ.get("PORT", "5000"))


def validate() -> list[str]:
    """校验配置，返回问题列表。production 模式下有问题则直接退出。"""
    problems: list[str] = []

    if SECRET_KEY in _SECRET_DEFAULTS:
        problems.append("DP_SECRET_KEY 未设置或仍为默认值（生产环境必须改为 ≥32 位随机串）")
    elif len(SECRET_KEY) < 32:
        problems.append("DP_SECRET_KEY 长度不足 32 字符")

    if REGISTRATION_MODE not in ("invite_only", "open"):
        problems.append(f"DP_REGISTRATION_MODE 非法：{REGISTRATION_MODE}（应为 invite_only | open）")

    db_type = os.environ.get("DP_DB_TYPE", "sqlite").lower()
    if db_type == "mysql" and not os.environ.get("DP_MYSQL_URL"):
        if not os.environ.get("DP_MYSQL_PASSWORD"):
            problems.append("MySQL 模式需要 DP_MYSQL_URL 或完整的 DP_MYSQL_* 连接参数（含密码）")

    if problems:
        msg = "配置校验失败：\n" + "\n".join(f"  - {p}" for p in problems)
        if IS_PROD:
            print(f"[config] {msg}", file=sys.stderr)
            sys.exit(1)
        print(f"[config] 警告（development 模式不强制）：\n" + "\n".join(f"  - {p}" for p in problems), file=sys.stderr)
    return problems


def setup_logging():
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def summary() -> str:
    """启动配置摘要（脱敏），用于日志与调试"""
    db_type = os.environ.get("DP_DB_TYPE", "sqlite").lower()
    masked = (SECRET_KEY[:4] + "****") if SECRET_KEY not in _SECRET_DEFAULTS else "默认（不安全）"
    return (
        f"env={ENV} db={db_type} registration={REGISTRATION_MODE} "
        f"secret={masked} cors={CORS_ORIGINS} log={LOG_LEVEL} "
        f"ai={'已配置' if DEEPSEEK_API_KEY else '未配置'}"
    )
