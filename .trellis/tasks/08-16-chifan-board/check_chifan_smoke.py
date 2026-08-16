# 恰饭板块后端冒烟：临时 SQLite 库 + TestClient，不触碰 server/dailyplan.db
import os, sys, tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

TMP_DB = os.path.join(tempfile.gettempdir(), "dp_chifan_test.db")
if os.path.exists(TMP_DB):
    os.remove(TMP_DB)
for ext in ("-wal", "-shm"):
    if os.path.exists(TMP_DB + ext):
        os.remove(TMP_DB + ext)

import server.db as db

_orig_init = db.SQLiteDB.__init__
def _patched(self):
    _orig_init(self)
    self.db_path = TMP_DB
db.SQLiteDB.__init__ = _patched

from fastapi.testclient import TestClient
from server.main import app

c = TestClient(app)
fails = []

def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (" | " + str(extra) if extra else ""))
    if not cond:
        fails.append(name)

# 1. 未登录 401
r = c.get("/api/dishes")
check("GET /api/dishes 未登录 401", r.status_code == 401, r.status_code)

# 2. 游客登录拿 token
r = c.post("/api/auth/guest")
check("guest 登录", r.status_code == 200 and r.json().get("token"), r.status_code)
H = {"Authorization": "Bearer " + r.json()["token"]}

# 3. seed 幂等 + 数量
r = c.get("/api/dishes", headers=H)
dishes = r.json()["data"]
check("seed 76 道", len(dishes) == 76, len(dishes))
check("seed 幂等（重复 init 不翻倍）", db.get_db().fetchone("SELECT COUNT(*) AS cnt FROM dishes")["cnt"] == 76)

# 4. 餐次 + 预算过滤
r = c.get("/api/dishes?meal=lunch&maxPrice=20", headers=H)
data = r.json()["data"]
check("meal=lunch 过滤", all(d["meal"] in ("lunch", "both") for d in data))
check("maxPrice 过滤", all(d["price"] <= 20 for d in data), [d["price"] for d in data][:5])
check("过滤后非空", len(data) > 0, len(data))

# 5. meal 参数非法 → 422
r = c.get("/api/dishes?meal=breakfast", headers=H)
check("meal 非法 422", r.status_code == 422, r.status_code)

# 6. 增
r = c.post("/api/dishes", headers=H, json={
    "name": "测试菜", "description": "desc", "price": 15.5,
    "meal": "lunch", "category": "测试", "image": "../evil.png"})
check("POST 创建", r.status_code == 200, r.status_code)
created = r.json()["data"]
check("image 白名单清洗（路径穿越被清空）", created["image"] == "", repr(created["image"]))

# 7. 改（含清洗回传：meal 非法归一 both，image 含斜杠被清空）
r = c.put(f"/api/dishes/{created['id']}", headers=H, json={
    "name": "测试菜改", "description": "d2", "price": 88.8,
    "meal": "invalid", "category": "测试", "image": "bad/evil.png"})
check("PUT 更新", r.status_code == 200, r.status_code)
upd = r.json()["data"]
check("PUT 回传清洗后行", upd["price"] == 88.8 and upd["meal"] == "both" and upd["image"] == "",
      (upd["price"], upd["meal"], repr(upd["image"])))

# 7b. price 超上限 → 422（pydantic le=99999）
r = c.put(f"/api/dishes/{created['id']}", headers=H, json={"name": "x", "price": 100000})
check("price 超限 422", r.status_code == 422, r.status_code)

# 8. 改/删不存在 → 404
r = c.put("/api/dishes/dish_ffffff", headers=H, json={"name": "x"})
check("PUT 不存在 404", r.status_code == 404, r.status_code)
r = c.delete("/api/dishes/dish_ffffff", headers=H)
check("DELETE 不存在 404", r.status_code == 404, r.status_code)

# 9. 删
r = c.delete(f"/api/dishes/{created['id']}", headers=H)
check("DELETE 删除", r.status_code == 200, r.status_code)
r = c.delete(f"/api/dishes/{created['id']}", headers=H)
check("重复删除 404", r.status_code == 404, r.status_code)

# 10. name 为空 → 422（pydantic min_length）
r = c.post("/api/dishes", headers=H, json={"name": ""})
check("空菜名 422", r.status_code == 422, r.status_code)

# 11. /food/ 静态挂载（server/static/food 存在时应返回 png 而非 index.html）
r = c.get("/food/mapo-tofu.png")
check("/food/*.png 200 且为图片", r.status_code == 200 and r.headers.get("content-type", "").startswith("image"),
      (r.status_code, r.headers.get("content-type")))

# 12. 种子数据无 user_id 列
cols = [r2["name"] for r2 in db.get_db().fetchall(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='dishes'")]  # sanity
info = db.get_db().fetchall("PRAGMA table_info(dishes)")
check("dishes 无 user_id 列（全站共享）", all(c["name"] != "user_id" for c in info), [c["name"] for c in info])

db.get_db().close()
os.remove(TMP_DB)
for ext in ("-wal", "-shm"):
    if os.path.exists(TMP_DB + ext):
        os.remove(TMP_DB + ext)

print("─" * 40)
print("RESULT:", "ALL PASS" if not fails else f"{len(fails)} FAIL: {fails}")
sys.exit(1 if fails else 0)
