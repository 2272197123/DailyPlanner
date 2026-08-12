"""DailyPlan 数据库模型

模块化 Pydantic 模型 — 覆盖计划、用户、AI 代理（v8.0）。
所有入参/出参模型集中于此，FastAPI 自动生成 Swagger /api/docs。
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ═══════════════════════════════════════
# 子任务 / 任务块 / 日课项
# ═══════════════════════════════════════

class Subtask(BaseModel):
    text: str
    done: bool = False
    estMin: int = 25


class Block(BaseModel):
    id: str = ""
    subject: str
    time: str = ""
    icon: str = "📌"
    category: str = "other"
    priority: str = "medium"
    duration: Optional[int] = None
    goalId: str = ""
    phase: str = ""
    flowHint: str = ""
    subtasks: list[Subtask] = []
    completed: bool = False
    generated: bool = True
    note: str = ""


class RoutineItem(BaseModel):
    id: str
    label: str
    time: str
    icon: str
    type: str = "life"
    note: str = ""


# ═══════════════════════════════════════
# 每日计划
# ═══════════════════════════════════════

class DailyPlan(BaseModel):
    date: str
    dayMode: str = "full"
    energyLevel: str = "normal"
    specialNotes: str = ""
    blocks: list[Block] = []
    routines: list[RoutineItem] = []
    customBlocks: list[dict] = []
    priorityShift: Optional[str] = None
    encouragement: str = ""


class RoutineProgressUpdate(BaseModel):
    date: str
    routineId: str
    done: bool


class ProgressUpdate(BaseModel):
    date: str
    note: str = ""
    rating: int = 0
    mode: str = "full"


class MoodEntry(BaseModel):
    date: str
    color: str = "#9ca3af"
    label: str = "一般"
    note: str = ""
    intensity: int = 2


class BalanceUpdate(BaseModel):
    balance: int


class LedgerEntry(BaseModel):
    id: Optional[str] = None
    date: str
    amount: float
    type: str = "expense"  # income / expense
    category: str = "其他"
    description: str = ""
    created_at: Optional[str] = None


class PrefsUpdate(BaseModel):
    waferSkin: str = "wafer"
    ownedSkins: list[str] = ["wafer"]
    activeTheme: Optional[str] = None
    theme: str = "system"
    activeGoal: str = ""
    modeCfg: Optional[dict] = None


# ═══════════════════════════════════════
# 用户认证（v8.0）
# ═══════════════════════════════════════

class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=30)
    password: str = Field(..., min_length=4)
    email: str = ""
    inviteCode: str = ""


class UserLogin(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    ok: bool = True
    user: Optional[dict] = None
    token: Optional[str] = None
    refresh_token: Optional[str] = None
    message: str = ""


class TokenRefresh(BaseModel):
    refresh_token: str


# ═══════════════════════════════════════
# AI 代理（v8.0）
# ═══════════════════════════════════════

class GeneratePlanRequest(BaseModel):
    date: str
    dayMode: str = "full"
    feedback: str = ""
    goalId: Optional[str] = None


# ═══════════════════════════════════════
# 每日独立数据（v9.0）
# ═══════════════════════════════════════

class DayDataRequest(BaseModel):
    blocks: Optional[list] = None
    routines: Optional[list] = None
    routineProgress: Optional[dict] = None
    goalsSnapshot: Optional[dict] = None
    timelineCfg: Optional[dict] = None
    progress: Optional[dict] = None
    archiveData: Optional[dict] = None


class AIUsage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class GeneratePlanResponse(BaseModel):
    ok: bool = True
    plan: Optional[dict] = None
    usage: Optional[dict] = None
    elapsed: float = 0
    message: str = ""


# ═══════════════════════════════════════
# 通用响应
# ═══════════════════════════════════════

class APIResponse(BaseModel):
    ok: bool = True
    message: str = ""
    data: Optional[dict] = None
