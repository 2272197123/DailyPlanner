"""DailyPlan AI 代理模块（v8.0）

负责：
- 构建每日计划 prompt（从数据库读取目标/日课/档位/反馈）
- 调用 DeepSeek API（OpenAI 兼容协议）
- 解析、校验并返回生成的 JSON 计划
- 记录每次 AI 请求的 token 消耗
"""

import json, time, re
from openai import OpenAI

from server.config import DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL, AI_MODEL

# ═══════════════════════════════════════
# 配置（来自 server.config，启动时已加载 .env）
# ═══════════════════════════════════════

MODEL = AI_MODEL  # deepseek-chat / deepseek-reasoner

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    return _client


# ═══════════════════════════════════════
# Prompt 构建
# ═══════════════════════════════════════

def _build_prompt(for_date: str, day_mode: str, feedback: str, goal_id: str | None, user_id: int) -> str:
    """构建发送给 AI 的提示词（中文大白话 + 完整示例），数据按 user_id 隔离"""
    from server.db import get_state

    # ── 档位配置 ──
    mode_cfg_raw = get_state(user_id, "modeCfg")
    try:
        mode_cfg = json.loads(mode_cfg_raw) if mode_cfg_raw else {
            "full":     {"label": "🔋 完整", "factor": 1.0,  "hours": "6-8h", "desc": "状态好，全力以赴。"},
            "minimum":  {"label": "⚡ 最低", "factor": 0.55, "hours": "3-4h", "desc": "先保底。"},
        }
    except Exception:
        mode_cfg = {"full": {"label": "🔋 完整", "factor": 1.0}, "minimum": {"label": "⚡ 最低", "factor": 0.55}}

    current_mode = mode_cfg.get(day_mode, mode_cfg.get("full", {}))
    mode_lines = []
    for k in ("full", "minimum"):
        mc = mode_cfg.get(k, {})
        mode_lines.append(f"- {mc.get('label', k)}：系数 {mc.get('factor', 1)}（约 {mc.get('hours', '?')}）")

    # ── 长期目标 ──
    goals_raw = get_state(user_id, "biggoals")
    try:
        goals = json.loads(goals_raw) if goals_raw else []
    except Exception:
        goals = []

    goals_section = ""
    if goals:
        goals_section = "=== 长期目标 ===\n"
        for g in goals:
            if goal_id and g.get("id") != goal_id:
                continue
            goals_section += f"\n🎯 {g.get('title', '目标')}"
            if g.get("deadline"):
                goals_section += f"（截止：{g['deadline']}）"
            goals_section += f"\n   说明：{g.get('desc', '')}\n"
            phases = g.get("phases", [])
            for p in phases:
                done_ms = sum(1 for m in (p.get("milestones", [])) if m.get("done"))
                total_ms = len(p.get("milestones", [])) or 1
                status = "进行中" if p.get("start") and not p.get("end") else ("已完成" if p.get("end") else "未开始")
                goals_section += f"   🔹 {p.get('name', '阶段')}（{status}，里程碑 {done_ms}/{total_ms}）\n"
                ms = p.get("milestones", [])
                for m in ms:
                    if not m.get("done"):
                        goals_section += f"      ⬜ {m.get('text', '')}\n"

    if not goals_section:
        goals_section = "=== 长期目标 ===\n（无）\n"

    # ── 拼装完整 prompt ──
    prompt = f"""请根据以下信息，生成 {for_date} 的每日计划。输出格式必须是 JSON，我可以直接粘贴进网页。

=== 当前档位 ===
明天默认档位：{current_mode.get('label', day_mode)}（系数 {current_mode.get('factor', 1)}，约 {current_mode.get('hours', '?')}）
三档位说明（系数越大，任务量越多）：
{chr(10).join(mode_lines)}

{goals_section}
=== 今日反馈 ===
{feedback or '（无）'}

=== 输出要求 ===
1. 只输出一个 JSON 对象，不要写解释、不要写 markdown 代码块标记。
2. 字段说明（按这个格式填）：
   - date: "{for_date}"
   - dayMode: "{day_mode}"
   - startTime: "09:00"（时间轴从几点开始）
   - energyLevel: "normal" / "low" / "bad"
   - blocks: 目标任务数组。格式：[{{"subject":"任务名","duration":60,"category":"study","priority":"high/medium/low","goalId":"关联目标id（可选）","phase":"阶段名（可选）","flowHint":"具体第一步动作（ADHD友好，越具体越好）","subtasks":[{{"text":"子任务","estMin":20}}]}}]
3. 不要输出 routines（固定任务由用户在网页「🔁 日课」面板维护，会自动合并到时间轴）。
4. duration 是预计用时（分钟），必填；time 字段可选，只用来默认排序。
5. 明天的任务量请匹配当前档位的系数（{current_mode.get('label', day_mode)} 系数 {current_mode.get('factor', 1)}）。
6. 如果某个任务在推进目标，请带上 goalId 和 phase（phase 写阶段名）。
7. 子任务建议 2-4 个，符合「启动→主任务→验证」三段式，越具体越好，ADHD 用户需要明确的第一步指令。
8. 任务名不要用"示例"这种词，要真实可执行的内容。

=== 完整示例 ===
{{
  "date": "{for_date}",
  "dayMode": "{day_mode}",
  "startTime": "09:00",
  "energyLevel": "normal",
  "blocks": [
    {{
      "subject": "阅读训练 — 第3章",
      "duration": 60,
      "category": "study",
      "priority": "high",
      "goalId": "",
      "phase": "",
      "flowHint": "打开书翻到第3章→只看第一段→用荧光笔划出关键词",
      "subtasks": [
        {{"text": "快速浏览目录和第3章标题", "estMin": 5}},
        {{"text": "读第一小节并划出关键词", "estMin": 20}},
        {{"text": "做3道课后题并批改", "estMin": 25}}
      ]
    }},
    {{
      "subject": "晚间复盘",
      "duration": 20,
      "category": "review",
      "priority": "medium",
      "flowHint": "只写三行：今天做了什么、卡在哪里、明天第一件事",
      "subtasks": [{{"text": "写今日复盘", "estMin": 15}}]
    }}
  ]
}}
"""
    return prompt


# ═══════════════════════════════════════
# JSON 校验与修复
# ═══════════════════════════════════════

def _extract_json(text: str) -> str:
    """从 AI 回复中提取 JSON 对象（处理可能的 markdown 代码块包裹）"""
    text = text.strip()
    # 去掉 ```json ... ``` 包裹
    m = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if m:
        text = m.group(1).strip()
    # 找到第一个 { 和最后一个 }
    start = text.find('{')
    end = text.rfind('}')
    if start == -1 or end == -1:
        raise ValueError("AI 回复中未找到 JSON 对象")
    return text[start:end + 1]


def _validate_plan(data: dict, for_date: str) -> dict:
    """校验并补全 AI 生成的计划 JSON"""
    plan = {
        "date": data.get("date", for_date),
        "dayMode": data.get("dayMode", "full"),
        "startTime": data.get("startTime", "09:00"),
        "energyLevel": data.get("energyLevel", "normal"),
        "specialNotes": data.get("specialNotes", ""),
        "routines": [],
        "blocks": [],
        "customBlocks": [],
        "priorityShift": data.get("priorityShift"),
    }

    # v8.1：每日计划不再携带 routines（固定任务已独立为全局预设），
    # 即使 AI 仍输出 routines，也直接忽略，避免覆盖用户日课。
    plan["routines"] = []

    # 校验 blocks
    for b in data.get("blocks", []):
        if not isinstance(b, dict):
            continue
        subject = b.get("subject") or b.get("title") or "任务"
        duration = b.get("duration", 60)
        if isinstance(duration, str):
            try:
                duration = int(duration)
            except Exception:
                duration = 60
        duration = max(10, min(480, duration))  # 10min ~ 8h

        subtasks = []
        for s in b.get("subtasks", []):
            if isinstance(s, str):
                subtasks.append({"text": s, "done": False, "estMin": 25})
            elif isinstance(s, dict):
                subtasks.append({
                    "text": s.get("text", ""),
                    "done": False,
                    "estMin": max(5, s.get("estMin", 25)),
                })

        plan["blocks"].append({
            "subject": subject,
            "duration": duration,
            "time": b.get("time", ""),
            "icon": b.get("icon", "📌"),
            "category": b.get("category", "study"),
            "priority": b.get("priority", "medium"),
            "goalId": b.get("goalId", ""),
            "phase": b.get("phase", ""),
            "flowHint": b.get("flowHint", ""),
            "subtasks": subtasks,
        })

    # 至少保证有一个 block
    if not plan["blocks"]:
        plan["blocks"].append({
            "subject": "打开资料看一眼",
            "duration": 25,
            "category": "study",
            "priority": "medium",
            "flowHint": "打开课件第一页→看一行",
            "subtasks": [{"text": "打开资料", "estMin": 5}, {"text": "读一页", "estMin": 15}],
        })

    return plan


# ═══════════════════════════════════════
# 核心生成函数
# ═══════════════════════════════════════

def generate_daily_plan(for_date: str, day_mode: str = "full", feedback: str = "", goal_id: str | None = None, user_id: int = 0, db=None) -> dict:
    """
    调用 AI 生成每日计划。

    返回:
      {
        "ok": True/False,
        "plan": {...},       # 校验后的计划对象
        "usage": {           # token 用量
          "prompt_tokens": 0,
          "completion_tokens": 0,
          "total_tokens": 0,
        },
        "message": "...",
      }
    """
    if db is None:
        from server.db import get_db
        db = get_db()

    if not DEEPSEEK_API_KEY:
        return {"ok": False, "message": "未设置 DEEPSEEK_API_KEY 环境变量", "plan": None, "usage": None}

    prompt = _build_prompt(for_date, day_mode, feedback, goal_id, user_id)

    client = _get_client()
    start = time.time()

    try:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=4096,
        )
        elapsed = time.time() - start
    except Exception as e:
        return {"ok": False, "message": f"AI 请求失败：{str(e)}", "plan": None, "usage": None, "elapsed": 0}

    usage = {
        "prompt_tokens": resp.usage.prompt_tokens if resp.usage else 0,
        "completion_tokens": resp.usage.completion_tokens if resp.usage else 0,
        "total_tokens": resp.usage.total_tokens if resp.usage else 0,
    }

    content = resp.choices[0].message.content if resp.choices else ""

    # 解析 JSON
    try:
        json_text = _extract_json(content)
        raw_data = json.loads(json_text)
    except Exception as e:
        # 记录失败回复（截断）
        _log_ai_request(for_date, prompt, content[:500], usage, elapsed, success=False, error=str(e), user_id=user_id, db=db)
        return {"ok": False, "message": f"AI 回复格式异常，请重试。原始回复片段：{content[:200]}", "plan": None, "usage": usage, "elapsed": elapsed}

    # 校验并补全
    try:
        plan = _validate_plan(raw_data, for_date)
    except Exception as e:
        _log_ai_request(for_date, prompt, content[:500], usage, elapsed, success=False, error=str(e), user_id=user_id, db=db)
        return {"ok": False, "message": f"计划校验失败：{str(e)}", "plan": None, "usage": usage, "elapsed": elapsed}

    # 记录成功请求
    _log_ai_request(for_date, prompt, content[:500], usage, elapsed, success=True, user_id=user_id, db=db)

    return {
        "ok": True,
        "plan": plan,
        "usage": usage,
        "elapsed": round(elapsed, 1),
        "message": f"生成成功（{usage['total_tokens']} tokens，{elapsed:.1f}s）",
    }


# ═══════════════════════════════════════
# AI 请求日志
# ═══════════════════════════════════════

def _log_ai_request(for_date: str, prompt: str, response_snippet: str, usage: dict, elapsed: float, success: bool, error: str = "", user_id: int = 0, db=None):
    """将 AI 请求记录到 ai_requests 表（不回滚业务，异常静默吃掉）"""
    if db is None:
        try:
            from server.db import get_db
            db = get_db()
        except Exception:
            return
    try:
        # ai_requests 表由 db.init_tables() 统一创建（含 user_id 列）
        db.execute(
            "INSERT INTO ai_requests (user_id, target_date, success, prompt_tokens, completion_tokens, total_tokens, elapsed_sec, error_msg, prompt_snippet, response_snippet) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (user_id, for_date, 1 if success else 0,
             usage.get("prompt_tokens", 0) if usage else 0,
             usage.get("completion_tokens", 0) if usage else 0,
             usage.get("total_tokens", 0) if usage else 0,
             elapsed, error, prompt[:300], response_snippet[:300]),
        )
        db.commit()
    except Exception:
        pass  # 日志失败不影响业务
