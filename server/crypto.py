"""敏感字段静态加密（v12.0）

用 DP_SECRET_KEY 派生 Fernet 密钥，对用户在偏好设置中保存的
第三方 API Key（aiApiKey 等）做加密存储，避免数据库明文泄漏。
"""

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from server.config import SECRET_KEY

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = base64.urlsafe_b64encode(hashlib.sha256(SECRET_KEY.encode()).digest())
        _fernet = Fernet(key)
    return _fernet


def encrypt_secret(plain: str) -> str:
    """加密敏感字符串；空串原样返回"""
    if not plain:
        return ""
    return _get_fernet().encrypt(plain.encode("utf-8")).decode("ascii")


def decrypt_secret(token: str) -> str:
    """解密敏感字符串；兼容历史明文数据（解密失败时原样返回）"""
    if not token:
        return ""
    try:
        return _get_fernet().decrypt(token.encode("ascii")).decode("utf-8")
    except (InvalidToken, ValueError):
        return token  # 历史明文，下次保存时会被重新加密
