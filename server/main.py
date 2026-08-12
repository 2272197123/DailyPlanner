"""DailyPlan FastAPI 后端

启动: uvicorn server.main:app --reload --port 5000
v11.0: 多用户数据隔离 + 白名单注册
"""

import json, os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from server.models import (
    DailyPlan, ProgressUpdate, RoutineProgressUpdate, MoodEntry, LedgerEntry,
    BalanceUpdate, PrefsUpdate, APIResponse,
    UserCreate, UserLogin, AuthResponse, TokenRefresh,
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
    create_invite_code, list_invite_codes,
)
from server.ai_proxy import generate_daily_plan
from server.auth import (
    create_user, authenticate_user,
    create_access_token, create_refresh_token, decode_token,
    get_current_user, require_user, require_admin,
)

app = FastAPI(title="DailyPlan API", version="11.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件目录 — 前端入口
BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "study_planner"


@app.on_event("startup")
def startup():
    init_db()
    # v11.1: 启动时自动运行增量迁移，补齐缺失的列
    from server.db import get_db
    db = get_db()
    _run_auto_migration(db)


def _run_auto_migration(db):
    """幂等自动迁移：补齐旧数据库缺失的 role / user_id 列"""
    migrations = [
        ("users+role", "ALTER TABLE users ADD COLUMN role VARCHAR(10) DEFAULT 'user'"),
        ("invite_codes", """CREATE TABLE IF NOT EXISTS invite_codes (
            id INT PRIMARY KEY AUTO_INCREMENT, code VARCHAR(20) NOT NULL UNIQUE,
            created_by INT, used_by INT, used_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"""),
    ]
    for tbl in ["plans","progress","routine_done","earned","state",
                "archives","day_data","ai_chat_history","ai_requests"]:
        migrations.append((f"{tbl}+user_id",
            f"ALTER TABLE {tbl} ADD COLUMN user_id INT NOT NULL DEFAULT 1"))

    for label, sql in migrations:
        try:
            db.execute(sql)
            db.commit()
            print(f"[migrate] OK {label}")
        except Exception as e:
            msg = str(e).split("\n")[0][:100]
            print(f"[migrate] SKIP {label} ({msg})")

    # 确保第一个用户是 admin
    try:
        db.execute("UPDATE users SET role='admin' WHERE id=1 AND role!='admin'")
        db.commit()
    except Exception:
        pass


# ═══════════════════════════════════════
# 前端静态文件（本地开发模式：Vue 3 SPA → 回退旧版）
# ═══════════════════════════════════════

@app.get("/")
async def root():
    spa_index = STATIC_DIR.parent / "server" / "static" / "index.html"
    if spa_index.exists():
        return FileResponse(str(spa_index))
    return FileResponse(str(STATIC_DIR / "index_modular.html"))


@app.get("/index.html")
async def spa_fallback():
    spa_index = STATIC_DIR.parent / "server" / "static" / "index.html"
    if spa_index.exists():
        return FileResponse(str(spa_index))
    return FileResponse(str(STATIC_DIR / "index_modular.html"))


@app.get("/index_modular.html")
async def index_page():
    return FileResponse(str(STATIC_DIR / "index_modular.html"))


@app.get("/config.js")
async def config_js():
    config_path = STATIC_DIR / "config.js"
    if config_path.exists():
        return FileResponse(str(config_path))
    return JSONResponse({"ok": False}, status_code=404)


# 开发模式：静态资源禁用缓存
@app.middleware("http")
async def no_cache_static(request, call_next):
    resp = await call_next(request)
    p = request.url.path
    if p.startswith(("/js", "/css", "/assets")) or p in ("/", "/index.html", "/index_modular.html", "/config.js"):
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
    return resp


# ═══════════════════════════════════════
# 用户认证 API（v11.0）
# ═══════════════════════════════════════

@app.post("/api/auth/register", response_model=AuthResponse)
async def api_register(body: UserCreate):
    """注册新用户。第一个用户自动成为管理员，后续用户需要邀请码（invite_only 模式）或自由注册（open 模式）。"""
    from server.db import get_db
    db = get_db()
    invite_code = body.inviteCode if body.inviteCode else None
    try:
        user = create_user(db, body.username, body.password, body.email, invite_code)
    except HTTPException:
        raise
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
async def api_login(body: UserLogin):
    """用户登录。"""
    from server.db import get_db
    db = get_db()
    user = authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(401, "用户名或密码错误")

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
    """刷新 token。"""
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(401, "无效的 refresh token")
        user_id = int(payload.get("sub", "0"))
        username = payload.get("username", "")
        role = payload.get("role", "user")
        new_token = create_access_token(user_id, username, role)
        return {"ok": True, "token": new_token}
    except Exception:
        raise HTTPException(401, "refresh token 无效或已过期")


@app.get("/api/auth/me")
async def api_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息（无 token 返回 null）"""
    if current_user is None:
        return {"ok": True, "user": None}
    return {"ok": True, "user": current_user}


@app.post("/api/auth/logout")
async def api_logout():
    """登出（前端清除 token，后端无需操作）"""
    return {"ok": True, "message": "已登出"}


# ═══════════════════════════════════════
# 管理员 API（v11.0）
# ═══════════════════════════════════════

@app.post("/api/admin/invite-codes")
async def api_create_invite_code(user: dict = Depends(require_admin)):
    """生成一个邀请码（仅管理员）"""
    code = create_invite_code(user["user_id"])
    return {"ok": True, "code": code, "message": "邀请码已生成"}


@app.get("/api/admin/invite-codes")
async def api_list_invite_codes(user: dict = Depends(require_admin)):
    """查看自己生成的邀请码列表（仅管理员）"""
    codes = list_invite_codes(user["user_id"])
    return {"ok": True, "data": codes}


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
            "aiApiKey":    get_state(uid, "aiApiKey") or "",
            "aiBaseUrl":   get_state(uid, "aiBaseUrl") or "",
            "aiModel":     get_state(uid, "aiModel") or "",
        },
    }


@app.put("/api/prefs")
async def api_save_prefs(body: dict, user: dict = Depends(require_user)):
    uid = user["user_id"]
    for k in ("theme", "activeGoal", "waferSkin", "activeTheme", "aiApiKey", "aiBaseUrl", "aiModel"):
        if k in body and body[k] is not None:
            set_state(uid, k, str(body[k]))
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
# 静态文件挂载（本地开发 + 生产兼容）
# ═══════════════════════════════════════
_vue_assets = STATIC_DIR.parent / "server" / "static" / "assets"
if _vue_assets.exists():
    app.mount("/assets", StaticFiles(directory=str(_vue_assets)), name="assets")
_study_js = STATIC_DIR / "js"
if _study_js.exists():
    app.mount("/js", StaticFiles(directory=str(_study_js)), name="js")
_study_css = STATIC_DIR / "css"
if _study_css.exists():
    app.mount("/css", StaticFiles(directory=str(_study_css)), name="css")
