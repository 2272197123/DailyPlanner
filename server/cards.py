"""DailyPlan 卡牌收集系统（v16）

卡牌定义库（静态常量）+ 抽卡 / 签到 / 成就业务逻辑。

- 稀有度权重：N 55 / R 27 / SR 13 / SSR 5；连签 7 天里程碑保底 SR+
- 隐藏面值（服务端随机，前端只读）：N 1-10 / R 5-20 / SR 15-40 / SSR 30-100
- 幂等：draw 以 (user_id, source, source_id) 唯一约束防重；
  checkin 以 (user_id, check_date) 主键防重
- 成就惰性评估：掉卡 / 签到后检查条件，新达成随响应返回

写路径均为「预查 + 普通 INSERT + IntegrityError 回退」，
不使用 ON DUPLICATE KEY UPDATE / INSERT IGNORE，
因此无需在 PostgreSQLDB._pg_sql 注册冲突键。
"""

import json
import secrets
from datetime import datetime, timedelta

from server.db import get_db

# ═══════════════════════════════════════
# 卡牌定义（4 系列 × 8 张：2N + 3R + 2SR + 1SSR，共 32 张）
# ═══════════════════════════════════════

RARITIES = ("N", "R", "SR", "SSR")
RARITY_WEIGHTS = {"N": 55, "R": 27, "SR": 13, "SSR": 5}
FACE_VALUE_RANGES = {"N": (1, 10), "R": (5, 20), "SR": (15, 40), "SSR": (30, 100)}
# 连签里程碑：每满 7 天保底 SR+（SR 80% / SSR 20%）
MILESTONE_STREAK = 7
MILESTONE_WEIGHTS = {"SR": 80, "SSR": 20}

SERIES = ("tarot", "food", "sprite", "solar")
SERIES_NAMES = {
    "tarot": "塔罗星象",
    "food": "美食图鉴",
    "sprite": "精灵宠物",
    "solar": "四季节气",
}

# (id, series, name, rarity, glyph, flavor)
CARD_DEFS = [
    # ── 塔罗星象 ──
    ("tarot_n1", "tarot", "小阿卡那·权杖", "N", "🜂", "行动的火苗，从此刻点燃"),
    ("tarot_n2", "tarot", "小阿卡那·圣杯", "N", "🜄", "盛满今日的心情"),
    ("tarot_r1", "tarot", "隐士", "R", "🏮", "提灯独行，照见内心"),
    ("tarot_r2", "tarot", "力量", "R", "🦁", "温柔亦可驯服猛兽"),
    ("tarot_r3", "tarot", "节制", "R", "⚖", "张弛有度，细水长流"),
    ("tarot_sr1", "tarot", "女祭司", "SR", "🌙", "帘后之书，静待启封"),
    ("tarot_sr2", "tarot", "命运之轮", "SR", "☸", "轮转不息，机遇自来"),
    ("tarot_ssr1", "tarot", "星辰", "SSR", "✦", "夜空中为你留的一盏灯"),
    # ── 美食图鉴 ──
    ("food_n1", "food", "小笼包", "N", "🥟", "先开窗，后喝汤"),
    ("food_n2", "food", "煎饼果子", "N", "🌯", "薄脆咔嚓，酱香蛋香"),
    ("food_r1", "food", "麻婆豆腐", "R", "🌶", "麻辣鲜香烫嫩酥"),
    ("food_r2", "food", "豚骨拉面", "R", "🍜", "浓白汤底，叉烧溏心蛋"),
    ("food_r3", "food", "红烧肉", "R", "🍖", "肥而不腻，入口即化"),
    ("food_sr1", "food", "北京烤鸭", "SR", "🦆", "枣木挂炉，皮酥肉嫩"),
    ("food_sr2", "food", "重庆火锅", "SR", "🍲", "牛油红汤九宫格"),
    ("food_ssr1", "food", "佛跳墙", "SSR", "🫕", "坛启荤香飘四邻"),
    # ── 精灵宠物 ──
    ("sprite_n1", "sprite", "团子精", "N", "🍡", "软乎乎，糯叽叽"),
    ("sprite_n2", "sprite", "豆豆兽", "N", "🫘", "滚来滚去的小不点"),
    ("sprite_r1", "sprite", "闪电狐", "R", "🦊", "尾巴尖有静电噼啪"),
    ("sprite_r2", "sprite", "泡泡龙", "R", "🐉", "吹出的泡泡会发光"),
    ("sprite_r3", "sprite", "叶语鹿", "R", "🦌", "踏过落叶没有声音"),
    ("sprite_sr1", "sprite", "月光喵", "SR", "🐱", "只在月圆夜现身"),
    ("sprite_sr2", "sprite", "星屑小龙", "SR", "🐲", "鳞片是坠落的星屑"),
    ("sprite_ssr1", "sprite", "虹彩凤凰", "SSR", "🦚", "一羽一虹光"),
    # ── 四季节气 ──
    ("solar_n1", "solar", "惊蛰", "N", "⚡", "春雷乍动，万物苏醒"),
    ("solar_n2", "solar", "白露", "N", "💧", "草叶凝珠，秋意初凉"),
    ("solar_r1", "solar", "立春", "R", "🌱", "东风解冻，蛰虫始振"),
    ("solar_r2", "solar", "夏至", "R", "☀", "日长之至，蝉鸣正浓"),
    ("solar_r3", "solar", "霜降", "R", "🍂", "豺乃祭兽，草木黄落"),
    ("solar_sr1", "solar", "春分", "SR", "🌗", "昼夜均分，玄鸟至"),
    ("solar_sr2", "solar", "冬至", "SR", "❄", "一阳初生，饺子暖心"),
    ("solar_ssr1", "solar", "四时之轮", "SSR", "🎡", "春秋代序，周而复始"),
]

CARD_BY_ID = {c[0]: c for c in CARD_DEFS}
CARDS_BY_RARITY = {r: [c for c in CARD_DEFS if c[3] == r] for r in RARITIES}
SERIES_TOTAL = {s: sum(1 for c in CARD_DEFS if c[1] == s) for s in SERIES}

# ═══════════════════════════════════════
# 成就定义（10 个）
# kind: cards_total / cards_task / rarity / series / streak
# ═══════════════════════════════════════

ACHIEVEMENT_DEFS = [
    {"id": "first_card", "name": "初获卡牌", "desc": "获得第 1 张卡",
     "kind": "cards_total", "target": 1},
    {"id": "cards_10", "name": "小有收藏", "desc": "累计获得 10 张卡",
     "kind": "cards_total", "target": 10},
    {"id": "tasks_10", "name": "勤勉不辍", "desc": "完成任务累计掉卡 10 张",
     "kind": "cards_task", "target": 10},
    {"id": "first_sr", "name": "紫气东来", "desc": "获得首张 SR 卡",
     "kind": "rarity", "rarity": "SR", "target": 1},
    {"id": "first_ssr", "name": "金色传说", "desc": "获得首张 SSR 卡",
     "kind": "rarity", "rarity": "SSR", "target": 1},
    {"id": "series_tarot", "name": "星象全览", "desc": "集齐塔罗星象系列",
     "kind": "series", "series": "tarot", "target": SERIES_TOTAL["tarot"]},
    {"id": "series_food", "name": "美食全鉴", "desc": "集齐美食图鉴系列",
     "kind": "series", "series": "food", "target": SERIES_TOTAL["food"]},
    {"id": "series_sprite", "name": "精灵全收", "desc": "集齐精灵宠物系列",
     "kind": "series", "series": "sprite", "target": SERIES_TOTAL["sprite"]},
    {"id": "series_solar", "name": "节气全录", "desc": "集齐四季节气系列",
     "kind": "series", "series": "solar", "target": SERIES_TOTAL["solar"]},
    {"id": "streak_7", "name": "七日之约", "desc": "连续签到 7 天",
     "kind": "streak", "target": 7},
]


# ═══════════════════════════════════════
# 序列化
# ═══════════════════════════════════════

def _card_def_dict(c) -> dict:
    return {
        "id": c[0], "series": c[1], "seriesName": SERIES_NAMES[c[1]],
        "name": c[2], "rarity": c[3], "glyph": c[4], "flavor": c[5],
    }


def card_defs_payload() -> list[dict]:
    return [_card_def_dict(c) for c in CARD_DEFS]


def _owned_card_dict(r: dict) -> dict:
    c = CARD_BY_ID.get(r["card_id"])
    d = _card_def_dict(c) if c else {
        "id": r["card_id"], "series": "", "seriesName": "",
        "name": r["card_id"], "rarity": "N", "glyph": "?", "flavor": "",
    }
    d.update({
        "faceValue": int(r["face_value"]),
        "source": r["source"],
        "obtainedAt": str(r.get("obtained_at") or ""),
    })
    return d


# ═══════════════════════════════════════
# 抽卡
# ═══════════════════════════════════════

def _roll_rarity(weights: dict) -> str:
    total = sum(weights.values())
    roll = secrets.randbelow(total)
    acc = 0
    for rarity, w in weights.items():
        acc += w
        if roll < acc:
            return rarity
    return "N"


def _pick_card(rarity: str):
    pool = CARDS_BY_RARITY[rarity]
    return pool[secrets.randbelow(len(pool))]


def _roll_face_value(rarity: str) -> int:
    lo, hi = FACE_VALUE_RANGES[rarity]
    return lo + secrets.randbelow(hi - lo + 1)


def draw_card(user_id: int, source: str, source_id: str,
              guaranteed_sr: bool = False) -> tuple[dict, bool]:
    """抽一张卡并入库。返回 (card_dict, duplicate)。

    幂等：(user_id, source, source_id) 唯一约束；重复提交返回首次抽到的卡，
    duplicate=True，不重复发卡。
    """
    db = get_db()
    row = db.fetchone(
        "SELECT * FROM user_cards WHERE user_id = %s AND source = %s AND source_id = %s",
        (user_id, source, source_id),
    )
    if row:
        return _owned_card_dict(row), True

    rarity = _roll_rarity(MILESTONE_WEIGHTS if guaranteed_sr else RARITY_WEIGHTS)
    c = _pick_card(rarity)
    face_value = _roll_face_value(rarity)
    try:
        db.execute(
            "INSERT INTO user_cards (user_id, card_id, face_value, source, source_id, obtained_at) "
            "VALUES (%s, %s, %s, %s, %s, NOW())",
            (user_id, c[0], face_value, source, source_id),
        )
        db.commit()
    except Exception:
        # 并发双发命中唯一约束：回滚后取已存在的那张（PG/MySQL 失败事务须先回滚）
        conn = getattr(db, "conn", None)
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        row = db.fetchone(
            "SELECT * FROM user_cards WHERE user_id = %s AND source = %s AND source_id = %s",
            (user_id, source, source_id),
        )
        if row:
            return _owned_card_dict(row), True
        raise
    row = db.fetchone(
        "SELECT * FROM user_cards WHERE user_id = %s AND source = %s AND source_id = %s",
        (user_id, source, source_id),
    )
    return _owned_card_dict(row), False


def list_user_cards(user_id: int) -> list[dict]:
    db = get_db()
    rows = db.fetchall(
        "SELECT * FROM user_cards WHERE user_id = %s ORDER BY obtained_at ASC, id ASC",
        (user_id,),
    )
    return [_owned_card_dict(r) for r in rows]


# ═══════════════════════════════════════
# 签到
# ═══════════════════════════════════════

def _today_str() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def checkin_status(user_id: int) -> dict:
    db = get_db()
    today = _today_str()
    row = db.fetchone(
        "SELECT streak FROM checkins WHERE user_id = %s AND check_date = %s",
        (user_id, today),
    )
    last = db.fetchone(
        "SELECT check_date, streak FROM checkins WHERE user_id = %s "
        "ORDER BY check_date DESC LIMIT 1",
        (user_id,),
    )
    total = db.fetchone(
        "SELECT COUNT(*) AS cnt FROM checkins WHERE user_id = %s",
        (user_id,),
    )
    recent_rows = db.fetchall(
        "SELECT check_date FROM checkins WHERE user_id = %s "
        "ORDER BY check_date DESC LIMIT 7",
        (user_id,),
    )
    streak = 0
    if last:
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        if last["check_date"] in (today, yesterday):
            streak = int(last["streak"])
    return {
        "todayChecked": row is not None,
        "streak": streak,
        "totalDays": int(total["cnt"]) if total else 0,
        "recentDates": [r["check_date"] for r in recent_rows],
    }


def do_checkin(user_id: int) -> tuple[dict, bool]:
    """签到。返回 (status_with_card, already_checked)。

    幂等：(user_id, check_date) 主键；当天重复签到不发奖。
    奖励卡 source='checkin', source_id=日期 —— 与签到行天然同键幂等。
    """
    db = get_db()
    today = _today_str()
    existing = db.fetchone(
        "SELECT streak FROM checkins WHERE user_id = %s AND check_date = %s",
        (user_id, today),
    )
    if existing:
        return {**checkin_status(user_id), "card": None}, True

    last = db.fetchone(
        "SELECT check_date, streak FROM checkins WHERE user_id = %s "
        "ORDER BY check_date DESC LIMIT 1",
        (user_id,),
    )
    yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
    streak = int(last["streak"]) + 1 if last and last["check_date"] == yesterday else 1
    try:
        db.execute(
            "INSERT INTO checkins (user_id, check_date, streak, created_at) "
            "VALUES (%s, %s, %s, NOW())",
            (user_id, today, streak),
        )
        db.commit()
    except Exception:
        conn = getattr(db, "conn", None)
        if conn is not None:
            try:
                conn.rollback()
            except Exception:
                pass
        return {**checkin_status(user_id), "card": None}, True

    # 奖励卡：连签满 7 的倍数天保底 SR+
    card, _ = draw_card(user_id, "checkin", today, guaranteed_sr=(streak % MILESTONE_STREAK == 0))
    return {**checkin_status(user_id), "card": card, "milestone": streak % MILESTONE_STREAK == 0}, False


# ═══════════════════════════════════════
# 成就（惰性评估）
# ═══════════════════════════════════════

def _collect_stats(user_id: int) -> dict:
    db = get_db()
    total = db.fetchone(
        "SELECT COUNT(*) AS cnt FROM user_cards WHERE user_id = %s",
        (user_id,),
    )
    task_total = db.fetchone(
        "SELECT COUNT(*) AS cnt FROM user_cards WHERE user_id = %s AND source = 'task'",
        (user_id,),
    )
    rarity_rows = db.fetchall(
        "SELECT card_id, COUNT(*) AS cnt FROM user_cards WHERE user_id = %s GROUP BY card_id",
        (user_id,),
    )
    max_streak = db.fetchone(
        "SELECT MAX(streak) AS ms FROM checkins WHERE user_id = %s",
        (user_id,),
    )
    rarity_counts = {r: 0 for r in RARITIES}
    series_owned = {s: set() for s in SERIES}
    for row in rarity_rows:
        c = CARD_BY_ID.get(row["card_id"])
        if not c:
            continue
        rarity_counts[c[3]] += int(row["cnt"])
        series_owned[c[1]].add(row["card_id"])
    return {
        "cards_total": int(total["cnt"]) if total else 0,
        "cards_task": int(task_total["cnt"]) if task_total else 0,
        "rarity_counts": rarity_counts,
        "series_owned": series_owned,
        "max_streak": int(max_streak["ms"] or 0) if max_streak else 0,
    }


def _achievement_progress(d: dict, stats: dict) -> int:
    kind = d["kind"]
    if kind == "cards_total":
        return stats["cards_total"]
    if kind == "cards_task":
        return stats["cards_task"]
    if kind == "rarity":
        return stats["rarity_counts"].get(d["rarity"], 0)
    if kind == "series":
        return len(stats["series_owned"].get(d["series"], ()))
    if kind == "streak":
        return stats["max_streak"]
    return 0


def evaluate_achievements(user_id: int) -> tuple[list[dict], list[dict]]:
    """惰性评估全部成就。返回 (all_with_progress, newly_achieved)。

    新达成的插入 user_achievements 并附带完整定义返回给前端弹祝贺。
    """
    db = get_db()
    achieved_rows = db.fetchall(
        "SELECT achievement_id, achieved_at FROM user_achievements WHERE user_id = %s",
        (user_id,),
    )
    achieved_at = {r["achievement_id"]: str(r.get("achieved_at") or "") for r in achieved_rows}
    stats = _collect_stats(user_id)

    out, newly = [], []
    for d in ACHIEVEMENT_DEFS:
        progress = _achievement_progress(d, stats)
        done = d["id"] in achieved_at
        if not done and progress >= d["target"]:
            try:
                db.execute(
                    "INSERT INTO user_achievements (user_id, achievement_id, achieved_at) "
                    "VALUES (%s, %s, NOW())",
                    (user_id, d["id"]),
                )
                db.commit()
            except Exception:
                conn = getattr(db, "conn", None)
                if conn is not None:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                # 并发下可能已被另一请求插入：回查确认状态（不重复计入 newly）
                row = db.fetchone(
                    "SELECT achieved_at FROM user_achievements "
                    "WHERE user_id = %s AND achievement_id = %s",
                    (user_id, d["id"]),
                )
                if row:
                    done = True
                    achieved_at[d["id"]] = str(row.get("achieved_at") or "")
            else:
                done = True
                achieved_at[d["id"]] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                newly.append({**d, "achievedAt": achieved_at[d["id"]]})
        out.append({
            "id": d["id"], "name": d["name"], "desc": d["desc"],
            "target": d["target"], "progress": min(progress, d["target"]),
            "achieved": done, "achievedAt": achieved_at.get(d["id"], ""),
        })
    return out, newly
