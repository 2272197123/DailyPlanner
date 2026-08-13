"""DailyPlan FastAPI 后端

启动: uvicorn server.main:app --reload --port 5000
v12.0: 集中配置 + 认证加固 + 管理员用户管理
"""

import json, logging, re, time
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends, UploadFile, File, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from server import config, mailer
from server.crypto import encrypt_secret, decrypt_secret
from server.models import (
    MoodEntry, LedgerEntry,
    UserCreate, UserLogin, AuthResponse, TokenRefresh, AdminResetPassword,
    SendEmailCode, ProfileUpdate,
    GeneratePlanRequest, GeneratePlanResponse,
)
from server.db import (
    init_db, get_plan, save_plan, delete_plan, list_plans,
    get_progress, save_progress,
    get_mood, save_mood, delete_mood, list_moods,
    get_ledger, list_ledger, create_ledger, update_ledger, delete_ledger,
    get_routine_done, set_routine_done,
    get_balance, set_balance,
    is_earned, mark_earned, get_all_earned,
    get_state, set_state,
    save_archive, get_archive, list_archives,
    save_day_data, get_day_data,
    save_chat_history, get_chat_history,
    create_invite_code, list_invite_codes, revoke_invite_code,
    get_user_by_id, get_user_by_email, list_users, set_user_disabled, delete_user,
    admin_reset_password, count_active_admins, update_user_profile,
    create_email_code, verify_email_code, cleanup_expired_guests,
    log_admin_action, list_admin_actions,
)
from server.ratelimit import is_rate_limited, client_ip
from server.ai_proxy import generate_daily_plan
from server.auth import (
    create_user, create_guest, authenticate_user, hash_password,
    create_access_token, create_refresh_token, decode_token,
    get_current_user, require_user, require_admin,
)

log = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@asynccontextmanager
async def lifespan(app: FastAPI):
    config.setup_logging()
    config.validate()  # production 下配置不合格直接退出
    init_db()          # 建表 + 幂等增量迁移
    cleaned = cleanup_expired_guests()
    if cleaned:
        log.info("已清理过期游客账号 %d 个", cleaned)
    log.info("DailyPlan 启动: %s", config.summary())
    yield


app = FastAPI(title="DailyPlan API", version="12.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request, exc):
    """未捕获异常统一返回结构化错误，并记录完整堆栈便于调试"""
    log.exception("未处理异常: %s %s", request.method, request.url.path)
    return JSONResponse({"ok": False, "message": "服务器内部错误"}, status_code=500)


# 前端构建产物目录（vite build 输出到 server/static/）
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "server" / "static"
# 用户上传文件目录（头像等；docker compose 挂载 appdata volume 持久化）
AVATAR_DIR = BASE_DIR / "data" / "avatars"


# ═══════════════════════════════════════
# 前端静态文件（Vue 3 SPA）
# ═══════════════════════════════════════

@app.get("/")
async def root():
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    return JSONResponse(
        {"ok": False, "message": "前端尚未构建，请先运行 cd frontend && npm run build"},
        status_code=503,
    )


# 缓存策略：Vite 产物（/assets/，文件名带 hash）长缓存，其余非 API 响应不缓存
@app.middleware("http")
async def static_cache_headers(request, call_next):
    resp = await call_next(request)
    p = request.url.path
    if p.startswith("/assets/"):
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    elif not p.startswith("/api"):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


# ═══════════════════════════════════════
# 用户认证 API（v11.0）
# ═══════════════════════════════════════

@app.post("/api/auth/send-email-code")
async def api_send_email_code(body: SendEmailCode, request: Request):
    """发送注册验证码。SMTP 为阻塞调用，放到线程池执行避免卡住事件循环。

    生产环境必须配置 SMTP；开发环境未配置时回传 dev_code 便于本地测试。
    限流：每 IP 每小时最多 10 次 + 每邮箱 60 秒冷却。
    """
    import asyncio
    if is_rate_limited(f"send-code:{client_ip(request)}", 10, 3600):
        raise HTTPException(429, "请求过于频繁，请稍后再试")
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "邮箱格式不正确")
    if get_user_by_email(email):
        raise HTTPException(409, "该邮箱已注册")

    code, err = create_email_code(email)
    if err:
        raise HTTPException(429, err)

    if mailer.is_configured():
        try:
            await asyncio.to_thread(mailer.send_register_code, email, code)
        except Exception as e:
            log.exception("邮件发送失败")
            raise HTTPException(502, f"邮件发送失败：{e}")
        return {"ok": True, "message": "验证码已发送，请查收邮件（10 分钟内有效）"}

    if config.IS_PROD:
        raise HTTPException(503, "邮件服务未配置（DP_SMTP_*），请联系管理员")
    log.info("[dev] %s 的验证码: %s", email, code)
    return {"ok": True, "message": "开发模式：未配置 SMTP，验证码见 dev_code", "dev_code": code}


@app.post("/api/auth/register", response_model=AuthResponse)
async def api_register(body: UserCreate, request: Request):
    """邮箱验证码注册。第一个用户自动成为管理员，后续用户需要邀请码（invite_only 模式）。
    限流：每 IP 每小时最多 20 次。"""
    if is_rate_limited(f"register:{client_ip(request)}", 20, 3600):
        raise HTTPException(429, "请求过于频繁，请稍后再试")
    from server.db import get_db
    db = get_db()
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(400, "邮箱格式不正确")
    if not verify_email_code(email, body.emailCode.strip()):
        raise HTTPException(400, "验证码错误或已过期，请重新获取")

    user = create_user(db, email, body.password, body.nickname.strip(), body.inviteCode or None)
    token = create_access_token(user["id"], user["username"], user.get("role", "user"))
    refresh = create_refresh_token(user["id"])
    return AuthResponse(
        ok=True,
        user=user,
        token=token,
        refresh_token=refresh,
        message="注册成功",
    )


@app.post("/api/auth/login", response_model=AuthResponse)
async def api_login(body: UserLogin, request: Request):
    """邮箱 + 密码登录。限流：每 IP 5 分钟最多 10 次（防暴力破解）。"""
    if is_rate_limited(f"login:{client_ip(request)}", 10, 300):
        raise HTTPException(429, "尝试次数过多，请 5 分钟后再试")
    from server.db import get_db
    db = get_db()
    user = authenticate_user(db, body.email.strip().lower(), body.password)
    if not user:
        raise HTTPException(401, "邮箱或密码错误")
    if user.get("disabled"):
        raise HTTPException(403, "账号已被禁用，请联系管理员")

    token = create_access_token(user["id"], user["username"], user.get("role", "user"))
    refresh = create_refresh_token(user["id"])
    return AuthResponse(
        ok=True,
        user=user,
        token=token,
        refresh_token=refresh,
        message="登录成功",
    )


@app.post("/api/auth/refresh")
async def api_refresh_token(body: TokenRefresh):
    """刷新 access token。用户状态/角色以数据库实时为准。"""
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(401, "无效的 refresh token")
        user_id = int(payload.get("sub", "0"))
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(401, "refresh token 无效或已过期")

    user = get_user_by_id(user_id)
    if not user:
        raise HTTPException(401, "账号不存在或已被删除")
    if user.get("disabled"):
        raise HTTPException(403, "账号已被禁用，请联系管理员")
    new_token = create_access_token(user["id"], user["username"], user.get("role", "user"))
    return {"ok": True, "token": new_token}


@app.get("/api/auth/me")
async def api_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息（DB 实时数据，含昵称/头像/游客标识；无 token 返回 null）"""
    if current_user is None:
        return {"ok": True, "user": None}
    user = get_user_by_id(current_user["user_id"])
    if not user:
        return {"ok": True, "user": None}
    return {"ok": True, "user": user}


@app.post("/api/auth/guest", response_model=AuthResponse)
async def api_guest_login(request: Request):
    """一键游客登录：创建 7 天有效的临时账号，数据隔离，到期自动清理。
    限流：每 IP 每小时最多 10 次（防滥用批量创建）。"""
    if not config.GUEST_ENABLED:
        raise HTTPException(403, "游客模式未开启")
    if is_rate_limited(f"guest:{client_ip(request)}", 10, 3600):
        raise HTTPException(429, "请求过于频繁，请稍后再试")
    from server.db import get_db
    db = get_db()
    user = create_guest(db)
    token = create_access_token(user["id"], user["username"], user.get("role", "user"))
    refresh = create_refresh_token(user["id"])
    log.info("游客账号已创建: %s(%s)", user["username"], user["id"])
    return AuthResponse(
        ok=True,
        user=user,
        token=token,
        refresh_token=refresh,
        message=f"已进入游客模式，数据将在 {config.GUEST_TTL_DAYS} 天后自动清除",
    )


@app.post("/api/auth/logout")
async def api_logout():
    """登出（前端清除 token，后端无需操作）"""
    return {"ok": True, "message": "已登出"}


# ═══════════════════════════════════════
# 个人资料 API（昵称 / 头像）
# ═══════════════════════════════════════

@app.put("/api/user/profile")
async def api_update_profile(body: ProfileUpdate, user: dict = Depends(require_user)):
    """修改昵称"""
    update_user_profile(user["user_id"], nickname=body.nickname.strip())
    return {"ok": True, "message": "昵称已更新"}


@app.post("/api/user/avatar")
async def api_upload_avatar(file: UploadFile = File(...), user: dict = Depends(require_user)):
    """上传头像（jpg/png/webp，≤2MB）"""
    ext = file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    if ext not in ("jpg", "jpeg", "png", "webp"):
        raise HTTPException(400, "仅支持 jpg / png / webp 格式")
    content = await file.read()
    if len(content) > 2 * 1024 * 1024:
        raise HTTPException(400, "头像文件不能超过 2MB")

    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    fname = f"{user['user_id']}_{int(time.time())}.{ext}"
    (AVATAR_DIR / fname).write_bytes(content)

    # 尽力删除旧头像文件
    old = (get_user_by_id(user["user_id"]) or {}).get("avatar") or ""
    if old.startswith("/avatars/"):
        try:
            (AVATAR_DIR / old.rsplit("/", 1)[-1]).unlink()
        except OSError:
            pass

    url = f"/avatars/{fname}"
    update_user_profile(user["user_id"], avatar=url)
    return {"ok": True, "avatar": url, "message": "头像已更新"}


# ═══════════════════════════════════════
# 管理员 API（邀请码白名单 + 用户管理）
# ═══════════════════════════════════════

@app.post("/api/admin/invite-codes")
async def api_create_invite_code(user: dict = Depends(require_admin)):
    """生成一个邀请码（仅管理员）"""
    code = create_invite_code(user["user_id"])
    log_admin_action(user["user_id"], "create_invite", detail=f"生成邀请码 {code}")
    return {"ok": True, "code": code, "message": "邀请码已生成"}


@app.get("/api/admin/invite-codes")
async def api_list_invite_codes(user: dict = Depends(require_admin)):
    """查看自己生成的邀请码列表（仅管理员）"""
    codes = list_invite_codes(user["user_id"])
    return {"ok": True, "data": codes}


@app.delete("/api/admin/invite-codes/{code}")
async def api_revoke_invite_code(code: str, user: dict = Depends(require_admin)):
    """作废一个未使用的邀请码（仅限本人创建的）"""
    if not revoke_invite_code(code, user["user_id"]):
        raise HTTPException(404, "邀请码不存在、已被使用或不属于你")
    log_admin_action(user["user_id"], "revoke_invite", detail=f"作废邀请码 {code}")
    return {"ok": True, "message": "邀请码已作废"}


@app.get("/api/admin/users")
async def api_list_users(user: dict = Depends(require_admin)):
    """列出全部用户（仅管理员）"""
    return {"ok": True, "data": list_users()}


@app.post("/api/admin/users/{uid}/disable")
async def api_disable_user(uid: int, user: dict = Depends(require_admin)):
    """禁用用户：立即无法登录，已有 token 也会在下一次请求失效"""
    if uid == user["user_id"]:
        raise HTTPException(400, "不能禁用自己的账号")
    target = get_user_by_id(uid)
    if not target:
        raise HTTPException(404, "用户不存在")
    if target.get("role") == "admin" and count_active_admins(exclude_user_id=uid) == 0:
        raise HTTPException(400, "系统至少需要保留一个可用的管理员")
    set_user_disabled(uid, True)
    log_admin_action(user["user_id"], "disable_user", target=f"{target['username']}({uid})")
    log.info("管理员 %s 禁用了用户 %s(%s)", user["username"], target["username"], uid)
    return {"ok": True, "message": f"已禁用 {target['username']}"}


@app.post("/api/admin/users/{uid}/enable")
async def api_enable_user(uid: int, user: dict = Depends(require_admin)):
    """恢复被禁用的用户"""
    target = get_user_by_id(uid)
    if not target:
        raise HTTPException(404, "用户不存在")
    set_user_disabled(uid, False)
    log_admin_action(user["user_id"], "enable_user", target=f"{target['username']}({uid})")
    log.info("管理员 %s 恢复了用户 %s(%s)", user["username"], target["username"], uid)
    return {"ok": True, "message": f"已恢复 {target['username']}"}


@app.delete("/api/admin/users/{uid}")
async def api_delete_user(uid: int, user: dict = Depends(require_admin)):
    """删除用户并级联清理其全部业务数据（不可恢复）"""
    if uid == user["user_id"]:
        raise HTTPException(400, "不能删除自己的账号")
    target = get_user_by_id(uid)
    if not target:
        raise HTTPException(404, "用户不存在")
    if target.get("role") == "admin" and count_active_admins(exclude_user_id=uid) == 0:
        raise HTTPException(400, "系统至少需要保留一个可用的管理员")
    delete_user(uid)
    log_admin_action(user["user_id"], "delete_user", target=f"{target['username']}({uid})",
                     detail=f"email={target.get('email', '')}")
    log.info("管理员 %s 删除了用户 %s(%s)", user["username"], target["username"], uid)
    return {"ok": True, "message": f"已删除 {target['username']} 及其全部数据"}


@app.post("/api/admin/users/{uid}/reset-password")
async def api_admin_reset_password(uid: int, body: AdminResetPassword, user: dict = Depends(require_admin)):
    """管理员重置用户密码"""
    target = get_user_by_id(uid)
    if not target:
        raise HTTPException(404, "用户不存在")
    admin_reset_password(uid, hash_password(body.new_password))
    log_admin_action(user["user_id"], "reset_password", target=f"{target['username']}({uid})")
    log.info("管理员 %s 重置了用户 %s(%s) 的密码", user["username"], target["username"], uid)
    return {"ok": True, "message": f"已重置 {target['username']} 的密码"}


@app.get("/api/admin/audit-log")
async def api_audit_log(limit: int = 100, user: dict = Depends(require_admin)):
    """查看管理操作审计日志（仅管理员）"""
    return {"ok": True, "data": list_admin_actions(min(limit, 500))}


# ═══════════════════════════════════════
# 每日计划 API
# ═══════════════════════════════════════

@app.get("/api/plan/{date}")
async def api_get_plan(date: str, user: dict = Depends(require_user)):
    """获取某天的计划。没有计划时返回 data: null，前端据此展示"今日无事"或自动生成。"""
    plan = get_plan(user["user_id"], date)
    if not plan:
        return {"ok": True, "data": None, "message": f"{date} 无计划，请导入或生成"}
    return {"ok": True, "data": plan}


@app.put("/api/plan/{date}")
async def api_save_plan(date: str, body: dict, user: dict = Depends(require_user)):
    """保存（创建或更新）某天的计划"""
    body["date"] = date
    save_plan(user["user_id"], body)
    return {"ok": True, "message": "已保存"}


@app.delete("/api/plan/{date}")
async def api_delete_plan(date: str, user: dict = Depends(require_user)):
    deleted = delete_plan(user["user_id"], date)
    if not deleted:
        raise HTTPException(404, "无此计划")
    return {"ok": True, "message": "已删除"}


@app.get("/api/plans")
async def api_list_plans(limit: int = 60, user: dict = Depends(require_user)):
    plans = list_plans(user["user_id"], limit)
    return {"ok": True, "data": plans}


# ═══════════════════════════════════════
# 进度 API
# ═══════════════════════════════════════

@app.get("/api/progress/{date}")
async def api_get_progress(date: str, user: dict = Depends(require_user)):
    p = get_progress(user["user_id"], date)
    return {"ok": True, "data": p}


@app.put("/api/progress/{date}")
async def api_save_progress(date: str, body: dict, user: dict = Depends(require_user)):
    body["date"] = date
    save_progress(user["user_id"], body)
    return {"ok": True, "message": "已保存"}


# ═══════════════════════════════════════
# 心情 API
# ═══════════════════════════════════════

@app.get("/api/moods")
async def api_list_moods(year: int | None = None, user: dict = Depends(require_user)):
    moods = list_moods(user["user_id"], year)
    return {"ok": True, "data": moods}


@app.get("/api/mood/{date}")
async def api_get_mood(date: str, user: dict = Depends(require_user)):
    mood = get_mood(user["user_id"], date)
    if not mood:
        raise HTTPException(404, "无此心情记录")
    return {"ok": True, "data": mood}


@app.put("/api/mood/{date}")
async def api_save_mood(date: str, body: MoodEntry, user: dict = Depends(require_user)):
    data = body.model_dump()
    data["date"] = date
    save_mood(user["user_id"], data)
    return {"ok": True, "message": "已保存"}


@app.delete("/api/mood/{date}")
async def api_delete_mood(date: str, user: dict = Depends(require_user)):
    deleted = delete_mood(user["user_id"], date)
    if not deleted:
        raise HTTPException(404, "无此心情记录")
    return {"ok": True, "message": "已删除"}


# ═══════════════════════════════════════
# 记账 API
# ═══════════════════════════════════════

@app.get("/api/ledger")
async def api_list_ledger(start: str | None = None, end: str | None = None, user: dict = Depends(require_user)):
    entries = list_ledger(user["user_id"], start, end)
    return {"ok": True, "data": entries}


@app.post("/api/ledger")
async def api_create_ledger(body: LedgerEntry, user: dict = Depends(require_user)):
    data = body.model_dump()
    entry_id = create_ledger(user["user_id"], data)
    return {"ok": True, "id": entry_id, "message": "已添加"}


@app.get("/api/ledger/{entry_id}")
async def api_get_ledger(entry_id: int, user: dict = Depends(require_user)):
    entry = get_ledger(user["user_id"], entry_id)
    if not entry:
        raise HTTPException(404, "无此记录")
    return {"ok": True, "data": entry}


@app.put("/api/ledger/{entry_id}")
async def api_update_ledger(entry_id: int, body: LedgerEntry, user: dict = Depends(require_user)):
    data = body.model_dump()
    updated = update_ledger(user["user_id"], entry_id, data)
    if not updated:
        raise HTTPException(404, "无此记录")
    return {"ok": True, "message": "已更新"}


@app.delete("/api/ledger/{entry_id}")
async def api_delete_ledger(entry_id: int, user: dict = Depends(require_user)):
    deleted = delete_ledger(user["user_id"], entry_id)
    if not deleted:
        raise HTTPException(404, "无此记录")
    return {"ok": True, "message": "已删除"}


# ═══════════════════════════════════════
# 日常项完成状态 API
# ═══════════════════════════════════════

@app.get("/api/routine-done/{date}")
async def api_get_routine_done(date: str, user: dict = Depends(require_user)):
    rd = get_routine_done(user["user_id"], date)
    return {"ok": True, "data": rd}


@app.put("/api/routine-done/{date}/{routine_id}")
async def api_set_routine_done(date: str, routine_id: str, body: dict, user: dict = Depends(require_user)):
    done = body.get("done", False)
    set_routine_done(user["user_id"], date, routine_id, done)
    return {"ok": True}


# ═══════════════════════════════════════
# 晶圆 API
# ═══════════════════════════════════════

@app.get("/api/balance")
async def api_get_balance(user: dict = Depends(require_user)):
    return {"ok": True, "balance": get_balance(user["user_id"])}


@app.put("/api/balance")
async def api_set_balance(body: dict, user: dict = Depends(require_user)):
    set_balance(user["user_id"], int(body.get("balance", 0)))
    return {"ok": True}


@app.get("/api/earned/{date}")
async def api_get_earned(date: str, user: dict = Depends(require_user)):
    return {"ok": True, "earned": get_all_earned(user["user_id"], date)}


@app.post("/api/earned/{date}/{item_id}")
async def api_mark_earned(date: str, item_id: str, user: dict = Depends(require_user)):
    mark_earned(user["user_id"], date, item_id)
    return {"ok": True}


# ═══════════════════════════════════════
# 偏好 API
# ═══════════════════════════════════════

@app.get("/api/prefs")
async def api_get_prefs(user: dict = Depends(require_user)):
    uid = user["user_id"]
    mode_cfg = get_state(uid, "modeCfg")
    try:
        mode_cfg = json.loads(mode_cfg) if mode_cfg else None
    except Exception:
        mode_cfg = None
    return {
        "ok": True,
        "data": {
            "theme":       get_state(uid, "theme") or "system",
            "activeGoal":  get_state(uid, "activeGoal") or "",
            "waferSkin":   get_state(uid, "waferSkin") or "wafer",
            "ownedSkins":  json.loads(get_state(uid, "ownedSkins") or '["wafer"]'),
            "activeTheme": get_state(uid, "activeTheme") or None,
            "modeCfg":     mode_cfg,
            "aiApiKey":    decrypt_secret(get_state(uid, "aiApiKey")),
            "aiBaseUrl":   get_state(uid, "aiBaseUrl") or "",
            "aiModel":     get_state(uid, "aiModel") or "",
            "newsSources": json.loads(get_state(uid, "newsSources") or '[]'),
        },
    }


@app.put("/api/prefs")
async def api_save_prefs(body: dict, user: dict = Depends(require_user)):
    uid = user["user_id"]
    for k in ("theme", "activeGoal", "waferSkin", "activeTheme", "aiApiKey", "aiBaseUrl", "aiModel", "newsSources"):
        if k in body and body[k] is not None:
            if k == "aiApiKey":
                # 敏感配置加密存储（Fernet，密钥由 DP_SECRET_KEY 派生）
                set_state(uid, k, encrypt_secret(str(body[k])))
            else:
                v = body[k]
                set_state(uid, k, v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
    if "ownedSkins" in body:
        set_state(uid, "ownedSkins", json.dumps(body["ownedSkins"], ensure_ascii=False))
    if "modeCfg" in body:
        set_state(uid, "modeCfg", json.dumps(body["modeCfg"], ensure_ascii=False))
    return {"ok": True}


# ═══════════════════════════════════════
# 存档 API（每日完成情况快照）
# ═══════════════════════════════════════

@app.get("/api/archives")
async def api_list_archives(limit: int = 365, user: dict = Depends(require_user)):
    return {"ok": True, "data": list_archives(user["user_id"], limit)}


@app.get("/api/archive/{date}")
async def api_get_archive(date: str, user: dict = Depends(require_user)):
    a = get_archive(user["user_id"], date)
    return {"ok": True, "data": a}


@app.put("/api/archive/{date}")
async def api_save_archive(date: str, body: dict, user: dict = Depends(require_user)):
    save_archive(user["user_id"], date, body)
    return {"ok": True, "message": "已存档"}


# ═══════════════════════════════════════
# 时间轴顺序 API（拖拽排序 + 起点持久化）
# ═══════════════════════════════════════

@app.get("/api/order/{date}")
async def api_get_order(date: str, user: dict = Depends(require_user)):
    v = get_state(user["user_id"], "order_" + date)
    try:
        return {"ok": True, "data": json.loads(v) if v else None}
    except Exception:
        return {"ok": True, "data": None}


@app.put("/api/order/{date}")
async def api_save_order(date: str, body: dict, user: dict = Depends(require_user)):
    set_state(user["user_id"], "order_" + date, json.dumps(body, ensure_ascii=False))
    return {"ok": True}


# ═══════════════════════════════════════
# 长期目标 API（v9.0：过滤旧硬编码数据）
# ═══════════════════════════════════════

@app.get("/api/goals")
async def api_get_goals(user: dict = Depends(require_user)):
    v = get_state(user["user_id"], "biggoals")
    try:
        data = json.loads(v) if v else []
    except Exception:
        data = []
    # v9.0 安全过滤器：移除已知的旧硬编码 ID
    _STALE_IDS = {'g_toefl', 'g_n2', 'g_comm-exam', 'comm-exam'}
    filtered = [g for g in data if g.get('id', '') not in _STALE_IDS]
    if len(filtered) != len(data):
        set_state(user["user_id"], "biggoals", json.dumps(filtered, ensure_ascii=False))
    return {"ok": True, "data": filtered}


@app.put("/api/goals")
async def api_save_goals(body: dict, user: dict = Depends(require_user)):
    goals = body.get("goals", [])
    set_state(user["user_id"], "biggoals", json.dumps(goals, ensure_ascii=False))
    return {"ok": True, "message": f"已保存 {len(goals)} 个目标"}


# ═══════════════════════════════════════
# 每日固定任务预设 API（v7.1）
# ═══════════════════════════════════════

@app.get("/api/routines")
async def api_get_routines(user: dict = Depends(require_user)):
    v = get_state(user["user_id"], "routines")
    try:
        data = json.loads(v) if v else []
    except Exception:
        data = []
    return {"ok": True, "data": data}


@app.put("/api/routines")
async def api_save_routines(body: dict, user: dict = Depends(require_user)):
    routines = body.get("routines", [])
    set_state(user["user_id"], "routines", json.dumps(routines, ensure_ascii=False))
    return {"ok": True, "message": f"已保存 {len(routines)} 项日课"}


# ═══════════════════════════════════════
# AI 每日计划生成 API（v8.0）
# ═══════════════════════════════════════

@app.post("/api/generate-plan", response_model=GeneratePlanResponse)
async def api_generate_plan(body: GeneratePlanRequest, user: dict = Depends(require_user)):
    """调用 AI（DeepSeek）生成每日计划 JSON。

    请求体：{ date, dayMode, feedback, goalId? }
    返回：{ ok, plan: {...}, usage: {prompt_tokens, ...}, elapsed, message }
    """
    result = generate_daily_plan(
        for_date=body.date,
        day_mode=body.dayMode,
        feedback=body.feedback,
        goal_id=body.goalId,
        user_id=user["user_id"],
    )

    if not result["ok"]:
        return GeneratePlanResponse(
            ok=False,
            message=result["message"],
            usage=result.get("usage"),
            elapsed=result.get("elapsed", 0),
        )

    return GeneratePlanResponse(
        ok=True,
        plan=result["plan"],
        usage=result["usage"],
        elapsed=result.get("elapsed", 0),
        message=result["message"],
    )


@app.get("/api/ai-usage")
async def api_ai_usage(limit: int = 30, user: dict = Depends(require_user)):
    """查看最近的 AI 请求记录（token 消耗、成功率等）"""
    from server.db import get_db
    db = get_db()
    try:
        rows = db.fetchall(
            "SELECT target_date, success, total_tokens, elapsed_sec, error_msg, created_at "
            "FROM ai_requests WHERE user_id = %s ORDER BY id DESC LIMIT %s",
            (user["user_id"], limit),
        )
        return {"ok": True, "data": rows}
    except Exception:
        return {"ok": True, "data": [], "message": "ai_requests 表尚未创建"}


# ═══════════════════════════════════════
# 每日独立数据 API（v9.0）
# ═══════════════════════════════════════

@app.get("/api/day-data/{date}")
async def api_get_day_data(date: str, user: dict = Depends(require_user)):
    """拉取某天的完整独立数据（blocks + routines + progress + timelineCfg + archiveData）"""
    data = get_day_data(user["user_id"], date)
    return {"ok": True, "data": data}


@app.put("/api/day-data/{date}")
async def api_save_day_data(date: str, body: dict, user: dict = Depends(require_user)):
    """上传某天的完整独立数据（前端 LS 缓存 + 服务器双重持久化）"""
    save_day_data(user["user_id"], date, body)
    return {"ok": True, "message": "已保存"}


# ═══════════════════════════════════════
# AI 对话历史 API（v9.0）
# ═══════════════════════════════════════

@app.get("/api/chat-history/{date}")
async def api_get_chat_history(date: str, user: dict = Depends(require_user)):
    """拉取某天的 AI 对话历史"""
    data = get_chat_history(user["user_id"], date)
    if not data:
        return {"ok": True, "data": {"chatDate": date, "messages": [], "summary": ""}}
    return {"ok": True, "data": data}


@app.put("/api/chat-history/{date}")
async def api_save_chat_history(date: str, body: dict, user: dict = Depends(require_user)):
    """保存某天的 AI 对话历史"""
    messages = body.get("messages", [])
    summary = body.get("summary", "")
    save_chat_history(user["user_id"], date, messages, summary)
    return {"ok": True, "message": "已保存"}


# ═══════════════════════════════════════
# 静态资源挂载 + SPA 深链回退
# ═══════════════════════════════════════
_assets = STATIC_DIR / "assets"
if _assets.exists():
    app.mount("/assets", StaticFiles(directory=str(_assets)), name="assets")
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/avatars", StaticFiles(directory=str(AVATAR_DIR)), name="avatars")


@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    """非 API 的 GET 深链一律回退到 SPA 入口（vue-router history 模式）"""
    if full_path.startswith("api/"):
        raise HTTPException(404, "接口不存在")
    index = STATIC_DIR / "index.html"
    if index.exists():
        return FileResponse(str(index))
    raise HTTPException(503, "前端尚未构建，请先运行 cd frontend && npm run build")
