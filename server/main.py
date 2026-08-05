"""DailyPlan FastAPI 后端

启动: uvicorn server.main:app --reload --port 5000
"""

import json, os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from server.models import (
    DailyPlan, ProgressUpdate, RoutineProgressUpdate,
    BalanceUpdate, PrefsUpdate, APIResponse,
    UserCreate, UserLogin, AuthResponse, TokenRefresh,
    GeneratePlanRequest, GeneratePlanResponse,
)
from server.db import (
    init_db, get_plan, save_plan, delete_plan, list_plans,
    get_progress, save_progress,
    get_routine_done, set_routine_done,
    get_balance, set_balance,
    is_earned, mark_earned, get_all_earned,
    get_state, set_state,
    save_archive, get_archive, list_archives,
    save_day_data, get_day_data,
    save_chat_history, get_chat_history,
)
from server.ai_proxy import generate_daily_plan
from server.auth import (
    init_users_table, create_user, authenticate_user,
    create_access_token, create_refresh_token, decode_token,
    get_current_user, require_user,
)

app = FastAPI(title="DailyPlan API", version="4.2")

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
    # 确保 users 表 + day_data 表在启动时创建
    from server.db import get_db
    db = get_db()
    try:
        init_users_table(db)
    except Exception:
        pass


# ═══════════════════════════════════════
# 前端静态文件
# ═══════════════════════════════════════

@app.get("/")
async def root():
    return FileResponse(str(STATIC_DIR / "index_modular.html"))


@app.get("/index.html")
@app.get("/index_modular.html")
async def index_page():
    return FileResponse(str(STATIC_DIR / "index_modular.html"))


# 开发模式：静态资源禁用缓存，保证每次刷新拿到最新 JS/CSS
@app.middleware("http")
async def no_cache_static(request, call_next):
    resp = await call_next(request)
    p = request.url.path
    if p.startswith(("/js", "/css")) or p in ("/", "/index.html", "/index_modular.html"):
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        resp.headers["Pragma"] = "no-cache"
    return resp


# ═══════════════════════════════════════
# 用户认证 API（v8.0）
# ═══════════════════════════════════════

@app.post("/api/auth/register", response_model=AuthResponse)
async def api_register(body: UserCreate):
    """注册新用户。"""
    from server.db import get_db
    db = get_db()
    user = create_user(db, body.username, body.password, body.email)
    token = create_access_token(user["id"], user["username"])
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

    token = create_access_token(user["id"], user["username"])
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
        new_token = create_access_token(user_id, username)
        return {"ok": True, "token": new_token}
    except Exception:
        raise HTTPException(401, "refresh token 无效或已过期")


@app.get("/api/auth/me")
async def api_me(current_user: dict = Depends(get_current_user)):
    """获取当前登录用户信息（无 token 返回 null）"""
    if current_user is None:
        return {"ok": True, "user": None}
    return {"ok": True, "user": current_user}


# ═══════════════════════════════════════
# 每日计划 API
# ═══════════════════════════════════════

@app.get("/api/plan/{date}")
async def api_get_plan(date: str):
    """获取某天的计划。没有计划时返回 data: null，前端据此展示"今日无事"或自动生成。"""
    plan = get_plan(date)
    if not plan:
        return {"ok": True, "data": None, "message": f"{date} 无计划，请导入或生成"}
    return {"ok": True, "data": plan}


@app.put("/api/plan/{date}")
async def api_save_plan(date: str, body: dict):
    """保存（创建或更新）某天的计划"""
    body["date"] = date
    save_plan(body)
    return {"ok": True, "message": "已保存"}


@app.delete("/api/plan/{date}")
async def api_delete_plan(date: str):
    deleted = delete_plan(date)
    if not deleted:
        raise HTTPException(404, "无此计划")
    return {"ok": True, "message": "已删除"}


@app.get("/api/plans")
async def api_list_plans(limit: int = 60):
    plans = list_plans(limit)
    return {"ok": True, "data": plans}


# ═══════════════════════════════════════
# 进度 API
# ═══════════════════════════════════════

@app.get("/api/progress/{date}")
async def api_get_progress(date: str):
    p = get_progress(date)
    return {"ok": True, "data": p}


@app.put("/api/progress/{date}")
async def api_save_progress(date: str, body: dict):
    body["date"] = date
    save_progress(body)
    return {"ok": True, "message": "已保存"}


# ═══════════════════════════════════════
# 日常项完成状态 API
# ═══════════════════════════════════════

@app.get("/api/routine-done/{date}")
async def api_get_routine_done(date: str):
    rd = get_routine_done(date)
    return {"ok": True, "data": rd}


@app.put("/api/routine-done/{date}/{routine_id}")
async def api_set_routine_done(date: str, routine_id: str, body: dict):
    done = body.get("done", False)
    set_routine_done(date, routine_id, done)
    return {"ok": True}


# ═══════════════════════════════════════
# 晶圆 API
# ═══════════════════════════════════════

@app.get("/api/balance")
async def api_get_balance():
    return {"ok": True, "balance": get_balance()}


@app.put("/api/balance")
async def api_set_balance(body: dict):
    set_balance(int(body.get("balance", 0)))
    return {"ok": True}


@app.get("/api/earned/{date}")
async def api_get_earned(date: str):
    return {"ok": True, "earned": get_all_earned(date)}


@app.post("/api/earned/{date}/{item_id}")
async def api_mark_earned(date: str, item_id: str):
    mark_earned(date, item_id)
    return {"ok": True}


# ═══════════════════════════════════════
# 偏好 API
# ═══════════════════════════════════════

@app.get("/api/prefs")
async def api_get_prefs():
    mode_cfg = get_state("modeCfg")
    try:
        mode_cfg = json.loads(mode_cfg) if mode_cfg else None
    except Exception:
        mode_cfg = None
    return {
        "ok": True,
        "data": {
            "theme":       get_state("theme") or "system",
            "activeGoal":  get_state("activeGoal") or "",
            "waferSkin":   get_state("waferSkin") or "wafer",
            "ownedSkins":  json.loads(get_state("ownedSkins") or '["wafer"]'),
            "activeTheme": get_state("activeTheme") or None,
            "modeCfg":     mode_cfg,
        },
    }


@app.put("/api/prefs")
async def api_save_prefs(body: dict):
    for k in ("theme", "activeGoal", "waferSkin", "activeTheme"):
        if k in body and body[k] is not None:
            set_state(k, str(body[k]))
    if "ownedSkins" in body:
        set_state("ownedSkins", json.dumps(body["ownedSkins"], ensure_ascii=False))
    if "modeCfg" in body:
        set_state("modeCfg", json.dumps(body["modeCfg"], ensure_ascii=False))
    return {"ok": True}


# ═══════════════════════════════════════
# 存档 API（每日完成情况快照）
# ═══════════════════════════════════════

@app.get("/api/archives")
async def api_list_archives(limit: int = 365):
    return {"ok": True, "data": list_archives(limit)}


@app.get("/api/archive/{date}")
async def api_get_archive(date: str):
    a = get_archive(date)
    return {"ok": True, "data": a}


@app.put("/api/archive/{date}")
async def api_save_archive(date: str, body: dict):
    save_archive(date, body)
    return {"ok": True, "message": "已存档"}


# ═══════════════════════════════════════
# 时间轴顺序 API（拖拽排序 + 起点持久化）
# ═══════════════════════════════════════

@app.get("/api/order/{date}")
async def api_get_order(date: str):
    v = get_state("order_" + date)
    try:
        return {"ok": True, "data": json.loads(v) if v else None}
    except Exception:
        return {"ok": True, "data": None}


@app.put("/api/order/{date}")
async def api_save_order(date: str, body: dict):
    set_state("order_" + date, json.dumps(body, ensure_ascii=False))
    return {"ok": True}


# ═══════════════════════════════════════
# 长期目标 API（v9.0：过滤旧硬编码数据）
# ═══════════════════════════════════════

@app.get("/api/goals")
async def api_get_goals():
    v = get_state("biggoals")
    try:
        data = json.loads(v) if v else []
    except Exception:
        data = []
    # v9.0 安全过滤器：移除已知的旧硬编码 ID
    _STALE_IDS = {'g_toefl', 'g_n2', 'g_comm-exam', 'comm-exam'}
    filtered = [g for g in data if g.get('id', '') not in _STALE_IDS]
    if len(filtered) != len(data):
        set_state("biggoals", json.dumps(filtered, ensure_ascii=False))
    return {"ok": True, "data": filtered}


@app.put("/api/goals")
async def api_save_goals(body: dict):
    goals = body.get("goals", [])
    set_state("biggoals", json.dumps(goals, ensure_ascii=False))
    return {"ok": True, "message": f"已保存 {len(goals)} 个目标"}


# ═══════════════════════════════════════
# 每日固定任务预设 API（v7.1）
# ═══════════════════════════════════════

@app.get("/api/routines")
async def api_get_routines():
    v = get_state("routines")
    try:
        data = json.loads(v) if v else []
    except Exception:
        data = []
    return {"ok": True, "data": data}


@app.put("/api/routines")
async def api_save_routines(body: dict):
    routines = body.get("routines", [])
    set_state("routines", json.dumps(routines, ensure_ascii=False))
    return {"ok": True, "message": f"已保存 {len(routines)} 项日课"}


# ── 静态文件挂载（必须在 API 路由之后，不启用 html=True 避免冲突） ──


# ═══════════════════════════════════════
# AI 每日计划生成 API（v8.0）
# ═══════════════════════════════════════

@app.post("/api/generate-plan", response_model=GeneratePlanResponse)
async def api_generate_plan(body: GeneratePlanRequest):
    """调用 AI（DeepSeek）生成每日计划 JSON。

    请求体：{ date, dayMode, feedback, goalId? }
    返回：{ ok, plan: {...}, usage: {prompt_tokens, ...}, elapsed, message }
    """
    result = generate_daily_plan(
        for_date=body.date,
        day_mode=body.dayMode,
        feedback=body.feedback,
        goal_id=body.goalId,
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
async def api_ai_usage(limit: int = 30):
    """查看最近的 AI 请求记录（token 消耗、成功率等）"""
    from server.db import get_db
    db = get_db()
    try:
        rows = db.fetchall(
            "SELECT target_date, success, total_tokens, elapsed_sec, error_msg, created_at "
            "FROM ai_requests ORDER BY id DESC LIMIT %s",
            (limit,),
        )
        return {"ok": True, "data": rows}
    except Exception:
        return {"ok": True, "data": [], "message": "ai_requests 表尚未创建"}


# ═══════════════════════════════════════
# 每日独立数据 API（v9.0）
# ═══════════════════════════════════════

@app.get("/api/day-data/{date}")
async def api_get_day_data(date: str):
    """拉取某天的完整独立数据（blocks + routines + progress + timelineCfg + archiveData）"""
    data = get_day_data(date)
    return {"ok": True, "data": data}


@app.put("/api/day-data/{date}")
async def api_save_day_data(date: str, body: dict):
    """上传某天的完整独立数据（前端 LS 缓存 + 服务器双重持久化）"""
    save_day_data(date, body)
    return {"ok": True, "message": "已保存"}


# ═══════════════════════════════════════
# AI 对话历史 API（v9.0）
# ═══════════════════════════════════════

@app.get("/api/chat-history/{date}")
async def api_get_chat_history(date: str):
    """拉取某天的 AI 对话历史"""
    data = get_chat_history(date)
    if not data:
        return {"ok": True, "data": {"chatDate": date, "messages": [], "summary": ""}}
    return {"ok": True, "data": data}


@app.put("/api/chat-history/{date}")
async def api_save_chat_history(date: str, body: dict):
    """保存某天的 AI 对话历史"""
    messages = body.get("messages", [])
    summary = body.get("summary", "")
    save_chat_history(date, messages, summary)
    return {"ok": True, "message": "已保存"}


# ── 静态文件挂载 ──
app.mount("/js",  StaticFiles(directory=str(STATIC_DIR / "js")),  name="js")
app.mount("/css", StaticFiles(directory=str(STATIC_DIR / "css")), name="css")
