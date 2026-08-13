"""DailyPlan 认证模块（v12.0）

JWT + bcrypt 用户认证：
- 用户注册 / 登录
- JWT 签发与验证
- 鉴权依赖注入（FastAPI Depends）
- 邀请码白名单机制

v12.0：密钥与注册模式从 server.config 读取；require_user 每次请求
回查数据库（账号禁用/角色调整立即生效）；移除 query param 鉴权。
"""

from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from server.config import SECRET_KEY, REGISTRATION_MODE

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 天
REFRESH_TOKEN_EXPIRE_DAYS = 30
BCRYPT_MAX_PASSWORD_BYTES = 72  # bcrypt 算法本身的输入上限

security = HTTPBearer(auto_error=False)  # auto_error=False 允许匿名访问


# ═══════════════════════════════════════
# 密码工具
# ═══════════════════════════════════════

def check_password_length(password: str):
    """bcrypt 只取前 72 字节，超长密码会造成静默截断，直接拒绝"""
    if len(password.encode("utf-8")) > BCRYPT_MAX_PASSWORD_BYTES:
        raise HTTPException(400, "密码过长（utf-8 编码后不能超过 72 字节）")


def hash_password(password: str) -> str:
    check_password_length(password)
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


# ═══════════════════════════════════════
# Token 工具
# ═══════════════════════════════════════

def create_access_token(user_id: int, username: str, role: str = "user") -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "type": "refresh",
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """解码 JWT，过期/无效时 raise JWTError"""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])


# ═══════════════════════════════════════
# 鉴权依赖
# ═══════════════════════════════════════

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    """
    解析请求中的 Bearer Token，返回用户信息。
    无 token 或 token 无效时返回 None（由 require_user 决定是否阻断）。
    """
    if credentials is None:
        return None
    try:
        payload = decode_token(credentials.credentials)
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return {
            "user_id": int(user_id),
            "username": payload.get("username", ""),
            "role": payload.get("role", "user"),
        }
    except JWTError:
        return None


async def require_user(current_user: dict | None = Depends(get_current_user)) -> dict:
    """必须登录才能访问的端点使用此依赖。

    每次请求回查数据库：账号被禁用/删除立即失效，
    角色以数据库为准（管理员调整角色无需等 token 过期）。
    """
    if current_user is None:
        raise HTTPException(401, "请先登录")
    from server.db import get_user_by_id
    db_user = get_user_by_id(current_user["user_id"])
    if db_user is None:
        raise HTTPException(401, "账号不存在或已被删除")
    if db_user.get("disabled"):
        raise HTTPException(403, "账号已被禁用，请联系管理员")
    if db_user.get("is_guest") and db_user.get("expires_at"):
        exp = db_user["expires_at"]
        exp_str = exp.strftime("%Y-%m-%d %H:%M:%S") if hasattr(exp, "strftime") else str(exp)
        if exp_str < datetime.now().strftime("%Y-%m-%d %H:%M:%S"):
            raise HTTPException(403, "游客账号已过期，请注册正式账号")
    return {
        "user_id": db_user["id"],
        "username": db_user["username"],
        "role": db_user.get("role", "user"),
    }


async def require_admin(current_user: dict = Depends(require_user)) -> dict:
    """必须管理员才能访问的端点使用此依赖"""
    if current_user.get("role") != "admin":
        raise HTTPException(403, "需要管理员权限")
    return current_user


# ═══════════════════════════════════════
# 用户 CRUD
# ═══════════════════════════════════════

def create_user(db, email: str, password: str, nickname: str = "",
                invite_code: str | None = None) -> dict:
    """
    创建用户并返回 {id, username, email, nickname, role, disabled, ...}。

    白名单逻辑：
    - 如果没有任何用户存在 → 自动成为 admin，无需邀请码
    - 如果已有用户且 REGISTRATION_MODE=invite_only → 必须提供有效邀请码
    - 如果 REGISTRATION_MODE=open → 无需邀请码
    """
    import secrets as _secrets
    from server.db import count_users, validate_invite_code, use_invite_code, init_user_defaults

    # 检查邮箱重复（空邮箱不参与——游客无邮箱）
    existing = db.fetchone(
        "SELECT id FROM users WHERE email = %s AND email != ''",
        (email,),
    )
    if existing:
        raise HTTPException(409, "该邮箱已注册")

    total_users = count_users()
    is_first_user = (total_users == 0)

    # 邀请码校验
    if is_first_user:
        role = "admin"
    elif REGISTRATION_MODE == "invite_only":
        if not invite_code:
            raise HTTPException(400, "需要邀请码才能注册")
        if not validate_invite_code(invite_code):
            raise HTTPException(400, "邀请码无效或已被使用")
        role = "user"
    else:
        # open 模式
        role = "user"

    # username 为内部唯一标识（不再用于登录）；nickname 默认取邮箱前缀
    username = "u_" + _secrets.token_hex(4)
    if not nickname:
        nickname = email.split("@")[0][:30]

    # 创建用户
    hashed = hash_password(password)
    db.execute(
        "INSERT INTO users (username, password_hash, email, nickname, role) VALUES (%s, %s, %s, %s, %s)",
        (username, hashed, email, nickname, role),
    )
    db.commit()

    # 获取新用户
    user = db.fetchone(
        "SELECT id, username, email, nickname, avatar, role, disabled, is_guest, expires_at, created_at "
        "FROM users WHERE username = %s",
        (username,),
    )
    if not user:
        raise HTTPException(500, "用户创建失败")
    user_dict = dict(user)

    # 使用邀请码（非首个用户的情况）
    if not is_first_user and invite_code:
        use_invite_code(invite_code, user_dict["id"])

    # 初始化新用户的 state 默认值
    init_user_defaults(user_dict["id"])

    return user_dict


def create_guest(db) -> dict:
    """创建一键游客账号（7 天有效，数据隔离，到期自动清理）"""
    import secrets as _secrets
    from server.config import GUEST_TTL_DAYS
    from server.db import init_user_defaults

    username = "guest_" + _secrets.token_hex(4)
    hashed = hash_password(_secrets.token_urlsafe(16))  # 随机密码，不暴露
    nickname = "游客" + _secrets.token_hex(2)
    expires = (datetime.now() + timedelta(days=GUEST_TTL_DAYS)).strftime("%Y-%m-%d %H:%M:%S")
    db.execute(
        "INSERT INTO users (username, password_hash, email, nickname, role, is_guest, expires_at) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s)",
        (username, hashed, "", nickname, "user", 1, expires),
    )
    db.commit()
    user = db.fetchone(
        "SELECT id, username, email, nickname, avatar, role, disabled, is_guest, expires_at, created_at "
        "FROM users WHERE username = %s",
        (username,),
    )
    if not user:
        raise HTTPException(500, "游客账号创建失败")
    init_user_defaults(user["id"])
    return dict(user)


def authenticate_user(db, email: str, password: str) -> dict | None:
    """验证邮箱密码，成功返回用户信息（含 disabled 标志），失败返回 None"""
    user = db.fetchone(
        "SELECT id, username, email, nickname, avatar, role, disabled, is_guest, expires_at, created_at "
        "FROM users WHERE email = %s AND email != ''",
        (email,),
    )
    if not user:
        return None
    pw_hash = db.fetchone(
        "SELECT password_hash FROM users WHERE id = %s",
        (user["id"],),
    )
    if not pw_hash or not verify_password(password, pw_hash["password_hash"]):
        return None
    return dict(user)
