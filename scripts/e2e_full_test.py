"""DailyPlan 端到端验证（v12.2 合并版）

覆盖：邮箱验证码注册、白名单邀请码、管理员用户管理、游客模式、
昵称头像、限流、审计日志。
运行前提：后端在 :5099，DP_ENV=development，未配置 SMTP（dev_code 回传），
数据库为全新空库。
"""
import sys
import sqlite3
import httpx

B = "http://localhost:5099/api"
ROOT = "http://localhost:5099"
fails = []


def check(name, cond, extra=""):
    print(("PASS" if cond else "FAIL"), "-", name, ("| " + str(extra)[:120]) if extra and not cond else "")
    if not cond:
        fails.append(name)


c = httpx.Client(base_url=B, timeout=10)
ADMIN_EMAIL = "admin@example.com"
USER_EMAIL = "user2@example.com"


def dev_code(email):
    r = c.post("/auth/send-email-code", json={"email": email})
    d = r.json()
    assert r.status_code == 200 and d.get("dev_code"), f"send code failed: {r.status_code} {d}"
    return d["dev_code"]


def register(email, password="password123", invite="", nickname=""):
    return c.post("/auth/register", json={
        "email": email, "emailCode": dev_code(email), "password": password,
        "nickname": nickname, "inviteCode": invite})


# ── 邮箱验证码（用独立邮箱测错误路径，避免占用 admin 邮箱的冷却） ──
PROBE_EMAIL = "probe@example.com"
code = dev_code(PROBE_EMAIL)
r = c.post("/auth/send-email-code", json={"email": PROBE_EMAIL})
check("resend cooldown 429", r.status_code == 429, (r.status_code, r.json()))
r = c.post("/auth/register", json={"email": PROBE_EMAIL, "emailCode": "000000",
                                   "password": "password123", "nickname": "", "inviteCode": ""})
check("wrong code rejected", r.status_code == 400, (r.status_code, r.json()))
r = c.post("/auth/register", json={"email": PROBE_EMAIL, "emailCode": code,
                                   "password": "short", "nickname": "", "inviteCode": ""})
check("short password rejected", r.status_code == 422, r.status_code)

# ── 首个用户 = admin ──
r = register(ADMIN_EMAIL, nickname="管理员")
d = r.json()
check("register first user", r.status_code == 200 and d.get("ok"), (r.status_code, d))
admin = d["user"]
check("first user is admin", admin["role"] == "admin", admin)
check("nickname saved", admin["nickname"] == "管理员", admin)
ah = {"Authorization": f"Bearer {d['token']}"}
artok = d["refresh_token"]

r = c.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "password123"})
check("email login", r.status_code == 200 and r.json().get("ok"), (r.status_code, r.json()))
r = c.post("/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
check("wrong password 401", r.status_code == 401, r.status_code)

# refresh 角色不丢
r = c.post("/auth/refresh", json={"refresh_token": artok})
newtok = r.json().get("token", "")
r2 = c.get("/auth/me", headers={"Authorization": f"Bearer {newtok}"})
check("refresh preserves admin role", r2.json().get("user", {}).get("role") == "admin", r2.json())

# 重复邮箱 409
r = c.post("/auth/send-email-code", json={"email": ADMIN_EMAIL})
check("duplicate email 409", r.status_code == 409, (r.status_code, r.json()))

# ── 邀请码白名单 ──
r = register("noinvite@example.com")
check("register without invite rejected", r.status_code == 400, (r.status_code, r.json()))
r = c.post("/admin/invite-codes", headers=ah)
invite = r.json().get("code")
check("create invite code", r.status_code == 200 and bool(invite), (r.status_code, r.json()))
r = register(USER_EMAIL, invite=invite)
d = r.json()
check("register with invite", r.status_code == 200 and d.get("ok"), (r.status_code, d))
u2id = d["user"]["id"]
u2h = {"Authorization": f"Bearer {d['token']}"}
check("user2 role is user", d["user"]["role"] == "user")
r = register("user3a@example.com", invite=invite)
check("used invite rejected", r.status_code == 400, (r.status_code, r.json()))

# 作废邀请码
r = c.post("/admin/invite-codes", headers=ah)
code2 = r.json()["code"]
r = c.delete(f"/admin/invite-codes/{code2}", headers=ah)
check("revoke invite", r.status_code == 200, (r.status_code, r.json()))
r = register("user3b@example.com", invite=code2)
check("revoked invite rejected", r.status_code == 400, (r.status_code, r.json()))

# ── 权限 ──
r = c.get("/admin/users", headers=u2h)
check("non-admin forbidden", r.status_code == 403, r.status_code)
r = c.get("/admin/users", headers=ah)
users = r.json().get("data", [])
check("admin lists 2 users", len(users) == 2, users)

# ── 禁用 / 恢复 / 重置密码 / 删除 ──
r = c.post(f"/admin/users/{u2id}/disable", headers=ah)
check("disable user2", r.status_code == 200, (r.status_code, r.json()))
r = c.get("/prefs", headers=u2h)
check("disabled token rejected", r.status_code in (401, 403), (r.status_code, r.json()))
r = c.post("/auth/login", json={"email": USER_EMAIL, "password": "password123"})
check("disabled login blocked", r.status_code == 403, (r.status_code, r.json()))
r = c.post(f"/admin/users/{u2id}/enable", headers=ah)
r = c.post("/auth/login", json={"email": USER_EMAIL, "password": "password123"})
check("re-enabled login", r.status_code == 200, (r.status_code, r.json()))
r = c.post(f"/admin/users/{u2id}/reset-password", headers=ah, json={"new_password": "newpassword456"})
check("reset password", r.status_code == 200, (r.status_code, r.json()))
r = c.post("/auth/login", json={"email": USER_EMAIL, "password": "newpassword456"})
check("login with new password", r.status_code == 200, (r.status_code, r.json()))
r = c.post(f"/admin/users/{admin['id']}/disable", headers=ah)
check("cannot disable self", r.status_code == 400, (r.status_code, r.json()))
r = c.delete(f"/admin/users/{admin['id']}", headers=ah)
check("cannot delete self", r.status_code == 400, (r.status_code, r.json()))

# ── 审计日志（前面的操作应已留下记录） ──
r = c.get("/admin/audit-log", headers=ah)
actions = [a["action"] for a in r.json().get("data", [])]
check("audit log records admin ops",
      r.status_code == 200 and "disable_user" in actions and "reset_password" in actions
      and "create_invite" in actions, actions)

# ── 游客 ──
r = c.post("/auth/guest")
d = r.json()
check("guest login", r.status_code == 200 and d.get("ok") and d["user"].get("is_guest") == 1, (r.status_code, d))
gh = {"Authorization": f"Bearer {d['token']}"}
r = c.put("/prefs", headers=gh, json={"theme": "dark"})
check("guest can write prefs", r.status_code == 200, (r.status_code, r.json()))
r = c.get("/plans", headers=gh)
check("guest data isolated", r.status_code == 200 and r.json().get("data") == [], (r.status_code, r.json()))
r = c.get("/admin/users", headers=gh)
check("guest not admin", r.status_code == 403, r.status_code)

# ── 昵称 / 头像 ──
r = c.put("/user/profile", headers=ah, json={"nickname": "新昵称"})
check("update nickname", r.status_code == 200, (r.status_code, r.json()))
r = c.get("/auth/me", headers=ah)
check("me reflects nickname", r.json()["user"]["nickname"] == "新昵称", r.json())
png = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c626001000000ffff03000006000557bfabd40000000049454e44ae426082")
r = c.post("/user/avatar", headers=ah, files={"file": ("a.png", png, "image/png")})
d = r.json()
check("avatar upload", r.status_code == 200 and d.get("avatar", "").startswith("/avatars/"), (r.status_code, d))
r = httpx.get(ROOT + d.get("avatar", ""))
check("avatar served", r.status_code == 200 and len(r.content) > 0, r.status_code)
r = c.post("/user/avatar", headers=ah, files={"file": ("a.txt", b"x", "text/plain")})
check("bad avatar type rejected", r.status_code == 400, (r.status_code, r.json()))

# ── aiApiKey 加密 ──
r = c.put("/prefs", headers=ah, json={"aiApiKey": "sk-test-1234567890"})
r = c.get("/prefs", headers=ah)
check("prefs returns decrypted key", r.json()["data"]["aiApiKey"] == "sk-test-1234567890", r.json())
db = sqlite3.connect("server/dailyplan.db")
row = db.execute("SELECT value FROM state WHERE `key`='aiApiKey'").fetchone()
check("db stores encrypted (Fernet)", bool(row) and row[0].startswith("gAAA"), row[0][:24] if row else "no row")

# ── newsSources 偏好白名单 ──
r = c.put("/prefs", headers=ah, json={"newsSources": ["hn", "36kr"]})
r = c.get("/prefs", headers=ah)
check("newsSources persisted", r.json()["data"].get("newsSources") == ["hn", "36kr"], r.json())

# ── 删除 user2 ──
r = c.delete(f"/admin/users/{u2id}", headers=ah)
check("delete user2", r.status_code == 200, (r.status_code, r.json()))
r = c.post("/auth/login", json={"email": USER_EMAIL, "password": "newpassword456"})
check("deleted user cannot login", r.status_code == 401, (r.status_code, r.json()))

# ── 基础防护与 SPA ──
r = c.get("/plan/2026-08-13")
check("no token 401", r.status_code == 401, r.status_code)
r = httpx.get(ROOT + "/admin")
check("deep link /admin 200", r.status_code == 200 and "no-cache" in r.headers.get("cache-control", ""), r.status_code)

# ── 限流（放最后：与前面用例共享 IP 配额） ──
for i in range(10):
    c.post("/auth/login", json={"email": "brute@example.com", "password": "wrongpass1"})
r = c.post("/auth/login", json={"email": "brute@example.com", "password": "wrongpass1"})
check("login rate limited 429", r.status_code == 429, (r.status_code, r.json()))

db.close()
print()
if fails:
    print("FAILED:", fails)
    sys.exit(1)
print("ALL TESTS PASSED")
