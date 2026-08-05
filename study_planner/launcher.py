#!/usr/bin/env python3
"""DailyPlan Launcher v8.0 — FastAPI 一体化启动器。

优先模式（专业）：uvicorn 启动 FastAPI 后端，静态文件 + API 同源（端口 5000），
数据持久化到 SQLite（server/dailyplan.db），支持存档/排序等完整 API。

回退模式（零依赖）：未安装 fastapi/uvicorn 时退化为纯静态服务器，
前端自动降级为 localStorage 单机模式（API 调用静默失败，不影响使用）。

用法：
  cd study_planner && python launcher.py
"""
import os, sys, webbrowser, threading, time
from pathlib import Path

PORT = int(os.environ.get('PORT', 5000))
BASE = Path(__file__).resolve().parent          # study_planner/
ROOT = BASE.parent                               # DailyPlan/（含 server 包）


def open_browser(url):
    time.sleep(0.8)
    webbrowser.open(url)


# ═══════════════════════════════════════
# 模式一：FastAPI + uvicorn（完整后端）
# ═══════════════════════════════════════

def run_fastapi():
    # server 包位于项目根目录，确保可导入
    if str(ROOT) not in sys.path:
        sys.path.insert(0, str(ROOT))
    os.chdir(str(ROOT))  # SQLite 等相对路径以项目根为基准

    import uvicorn
    from server.main import app

    url = f"http://localhost:{PORT}/"
    print(f"  DailyPlan v10.0 — FastAPI 模式 (Vue 3 SPA)")
    print(f"  {url}")
    print(f"  数据: {ROOT / 'server' / 'dailyplan.db'}")
    threading.Thread(target=open_browser, args=(url,), daemon=True).start()
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")


# ═══════════════════════════════════════
# 模式二：纯静态服务器（回退，零依赖）
# ═══════════════════════════════════════

def run_static():
    from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(BASE))

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            super().end_headers()

        def do_GET(self):
            if self.path in ('/', '/index.html'):
                spa_path = BASE.parent / 'server' / 'static' / 'index.html'
                if spa_path.exists():
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.end_headers()
                    with open(spa_path, 'rb') as f:
                        self.wfile.write(f.read())
                    return
                self.path = '/index_modular.html'
            elif self.path.startswith('/assets/'):
                spa_asset = BASE.parent / 'server' / 'static' / self.path.lstrip('/')
                if spa_asset.exists():
                    self.send_response(200)
                    ct = 'application/javascript'
                    if self.path.endswith('.css'): ct = 'text/css'
                    elif self.path.endswith('.svg'): ct = 'image/svg+xml'
                    self.send_header('Content-Type', ct + '; charset=utf-8')
                    self.end_headers()
                    with open(spa_asset, 'rb') as f:
                        self.wfile.write(f.read())
                    return
            return super().do_GET()

        def do_HEAD(self):
            if self.path in ('/', '/index.html'):
                spa_path = BASE.parent / 'server' / 'static' / 'index.html'
                if spa_path.exists():
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/html; charset=utf-8')
                    self.end_headers()
                    return
                self.path = '/index_modular.html'
            return super().do_HEAD()

    url = f"http://localhost:{PORT}/"
    print(f"  DailyPlan v10.0 — 静态回退模式（未安装 fastapi/uvicorn，数据仅存浏览器）")
    print(f"  {url}")
    threading.Thread(target=open_browser, args=(url,), daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()


def run():
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
    except ImportError:
        run_static()
        return
    try:
        run_fastapi()
    except ImportError:
        # fastapi 装了但 server 包导入失败等情况 → 回退
        run_static()


if __name__ == "__main__":
    run()
