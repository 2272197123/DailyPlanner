"""简易内存限流（v12.2）

单 worker 部署下的滑动窗口限流器。进程重启后计数清零——
对本项目（单 uvicorn worker）足够；多 worker 部署需换 Redis。
"""

import threading
import time
from collections import defaultdict, deque

_lock = threading.Lock()
_hits: dict[str, deque] = defaultdict(deque)


def is_rate_limited(key: str, max_calls: int, window_sec: int) -> bool:
    """记录一次调用；窗口内超过 max_calls 返回 True（应拒绝）。"""
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and q[0] < now - window_sec:
            q.popleft()
        if len(q) >= max_calls:
            return True
        q.append(now)
        # 防止 key 无限增长：队列空时顺手清理
        if not q:
            _hits.pop(key, None)
        return False


def client_ip(request) -> str:
    """取客户端 IP：优先 nginx 反代写入的 X-Real-IP"""
    return request.headers.get("x-real-ip") or (request.client.host if request.client else "unknown")
