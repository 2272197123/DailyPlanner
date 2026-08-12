"""DailyPlan 认证模块（v11.0）

JWT + bcrypt 用户认证：
- 用户注册 / 登录
- JWT 签发与验证
- 鉴权依赖注入（FastAPI Depends）
- 邀请码白名单机制

v11.0：白名单注册、用户角色、数据隔离支持
"""

import os, json
from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt
from fastapi import HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# ═══════════════════════════════════════
# 配置
# ═══════════════════════════════════════

SECRET_KEY = os.environ.get("DP_SECRET_KEY", "dailyplan-dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 天
REFRESH_TOKEN_EXPIRE_DAYS = 30
REGISTRATION_MODE = os.environ.get("DP_REGISTRATION_MODE", "invite_only")  # invite_only | open

security = HTTPBearer(auto_error=False)  # auto_error=False 允许匿名访问


# ═══════════════════════════════════════
# 密码工具
# ═══════════════════════════════════════

def hash_password(password: str) -> str:
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
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict | None:
    """
    解析请求中的 Bearer Token，返回用户信息。
    无 token 时返回 None（允许匿名访问）。
    token 无效时返回 None（不阻断，由业务端点自行判断是否需要登录）。
    """
    if credentials is None:
        # 也尝试从 cookie 或 query param 读取（兼容前端简易模式）
        token = request.cookies.get("dp_token") or request.query_params.get("token")
        if not token:
            return None
    else:
        token = credentials.credentials

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        username = payload.get("username", "")
        role = payload.get("role", "user")
        if user_id is None:
            return None
        return {"user_id": int(user_id), "username": username, "role": role}
    except JWTError:
        return None


async def require_user(current_user: dict | None = Depends(get_current_user)) -> dict:
    """必须登录才能访问的端点使用此依赖"""
    if current_user is None:
        raise HTTPException(401, "请先登录")
    return current_user


async def require_admin(current_user: dict | None = Depends(require_user)) -> dict:
    """必须管理员才能访问的端点使用此依赖"""
    if current_user.get("role") != "admin":
        raise HTTPException(403, "需要管理员权限")
    return current_user


# ═══════════════════════════════════════
# 用户 CRUD
# ═══════════════════════════════════════

def create_user(db, username: str, password: str, email: str = "",
                invite_code: str | None = None) -> dict:
    """
    创建用户并返回 {id, username, email, role, created_at}。

    白名单逻辑：
    - 如果没有任何用户存在 → 自动成为 admin，无需邀请码
    - 如果已有用户且 REGISTRATION_MODE=invite_only → 必须提供有效邀请码
    - 如果 REGISTRATION_MODE=open → 无需邀请码
    """
    from server.db import count_users, validate_invite_code, use_invite_code, init_user_defaults

    # 检查用户名重复
    existing = db.fetchone("SELECT id FROM users WHERE username = %s", (username,))
    if existing:
        raise HTTPException(409, "用户名已存在")

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

    # 创建用户
    hashed = hash_password(password)
    db.execute(
        "INSERT INTO users (username, password_hash, email, role) VALUES (%s, %s, %s, %s)",
        (username, hashed, email, role),
    )
    db.commit()

    # 获取新用户
    user = db.fetchone(
        "SELECT id, username, email, role, created_at FROM users WHERE username = %s",
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


def authenticate_user(db, username: str, password: str) -> dict | None:
    """验证用户名密码，成功返回用户信息，失败返回 None"""
    user = db.fetchone(
        "SELECT id, username, email, role, created_at FROM users WHERE username = %s",
        (username,),
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
