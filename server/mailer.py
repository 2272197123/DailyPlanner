"""邮件发送模块（v12.1）

SMTP_SSL 发信（QQ 邮箱 / 163 / 腾讯企业邮等均适用）。
配置项见 server/config.py 的 DP_SMTP_* 环境变量。
后续如需短信通道，在本层加同构模块即可。
"""

import logging
import smtplib
from email.header import Header
from email.mime.text import MIMEText

from server import config

log = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(config.SMTP_HOST and config.SMTP_USERNAME and config.SMTP_PASSWORD)


def send_email(to: str, subject: str, body: str):
    """发送纯文本邮件。失败抛异常，由调用方处理。"""
    from_addr = config.SMTP_FROM or config.SMTP_USERNAME
    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = from_addr
    msg["To"] = to
    with smtplib.SMTP_SSL(config.SMTP_HOST, config.SMTP_PORT, timeout=10) as s:
        s.login(config.SMTP_USERNAME, config.SMTP_PASSWORD)
        s.sendmail(from_addr, [to], msg.as_string())
    log.info("邮件已发送 -> %s（%s）", to, subject)


def send_register_code(to: str, code: str):
    send_email(
        to,
        "DailyPlan 注册验证码",
        f"你的 DailyPlan 注册验证码是：{code}\n\n10 分钟内有效，请勿泄露给他人。\n如果不是本人操作，请忽略本邮件。",
    )
