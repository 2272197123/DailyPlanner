"""DailyPlan 新闻聚合模块（v13.0）

多新闻源聚合：全部免费、无需鉴权、服务端直接抓取。
- 每个源独立抓取 + 10 分钟内存缓存（避免频繁回源）
- 单源失败不影响其他源（错误随响应返回，前端按源提示）
- RSS/Atom 用标准库解析，不引入新依赖

新增源：在 SOURCES 注册表里加一条，并实现对应 _fetch_xxx 即可。
"""

import asyncio
import logging
import re
import time
import xml.etree.ElementTree as ET
from html import unescape

import httpx

log = logging.getLogger(__name__)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

CACHE_TTL = 600          # 10 分钟缓存
FETCH_TIMEOUT = 8.0      # 单源超时
PER_SOURCE_LIMIT = 10    # 每个源返回条数

_cache: dict[str, tuple[float, list[dict]]] = {}

_client: httpx.AsyncClient | None = None


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            headers={"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"},
            timeout=FETCH_TIMEOUT,
            follow_redirects=True,
        )
    return _client


# ═══════════════════════════════════════
# 工具函数
# ═══════════════════════════════════════

_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _clean(text: str, limit: int = 120) -> str:
    """去 HTML 标签 + 压缩空白 + 截断"""
    if not text:
        return ""
    t = unescape(_TAG_RE.sub("", text))
    t = _WS_RE.sub(" ", t).strip()
    return t[:limit]


def _item(source_id: str, title: str, url: str, summary: str = "",
          published: str = "", hot: int | None = None) -> dict:
    return {
        "source": source_id,
        "title": (title or "").strip()[:200],
        "url": url or "",
        "summary": summary,
        "published": published or "",
        "hot": hot,
    }


# ═══════════════════════════════════════
# RSS / Atom 解析（标准库）
# ═══════════════════════════════════════

def _parse_feed(xml_text: str, source_id: str, limit: int) -> list[dict]:
    root = ET.fromstring(xml_text.encode("utf-8", errors="replace"))
    items = []

    # RSS 2.0: <channel><item>
    for it in root.iter("item"):
        title = it.findtext("title", "")
        link = it.findtext("link", "")
        desc = it.findtext("description", "")
        pub = it.findtext("pubDate", "") or it.findtext("date", "")
        items.append(_item(source_id, title, link.strip(), _clean(desc), pub.strip()))
        if len(items) >= limit:
            return items

    # Atom: <entry>（带命名空间）
    ns = ""
    if root.tag.startswith("{"):
        ns = root.tag.split("}")[0] + "}"
    for entry in root.iter(f"{ns}entry"):
        title = entry.findtext(f"{ns}title", "")
        link = ""
        for lnk in entry.findall(f"{ns}link"):
            if lnk.get("href") and lnk.get("rel", "alternate") in ("alternate", None):
                link = lnk.get("href")
                break
        summary = entry.findtext(f"{ns}summary", "") or entry.findtext(f"{ns}content", "")
        pub = entry.findtext(f"{ns}published", "") or entry.findtext(f"{ns}updated", "")
        items.append(_item(source_id, title, link, _clean(summary), pub.strip()))
        if len(items) >= limit:
            return items

    return items


async def _fetch_rss(source_id: str, url: str, limit: int) -> list[dict]:
    r = await _get_client().get(url)
    r.raise_for_status()
    return _parse_feed(r.text, source_id, limit)


# ═══════════════════════════════════════
# 各源抓取器
# ═══════════════════════════════════════

async def _fetch_toutiao(limit: int) -> list[dict]:
    r = await _get_client().get("https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc")
    r.raise_for_status()
    out = []
    for i, e in enumerate(r.json().get("data") or []):
        title = e.get("Title", "")
        if not title:
            continue
        out.append(_item("toutiao", title, e.get("Url", ""), hot=i + 1))
        if len(out) >= limit:
            break
    return out


async def _fetch_zhihu(limit: int) -> list[dict]:
    r = await _get_client().get("https://api.zhihu.com/topstory/hot-list", params={"limit": limit * 2})
    r.raise_for_status()
    out = []
    for i, e in enumerate(r.json().get("data") or []):
        target = e.get("target") or {}
        title = target.get("title", "")
        if not title:
            continue
        url = target.get("url", "")
        # 知乎 API 的 url 形如 https://api.zhihu.com/questions/xxx → 转为网页链接
        url = url.replace("api.zhihu.com/questions", "www.zhihu.com/question")
        out.append(_item("zhihu", title, url, _clean(target.get("excerpt", "")), hot=i + 1))
        if len(out) >= limit:
            break
    return out


async def _fetch_bilibili(limit: int) -> list[dict]:
    r = await _get_client().get("https://api.bilibili.com/x/web-interface/popular",
                                params={"ps": limit, "pn": 1})
    r.raise_for_status()
    out = []
    for i, e in enumerate((r.json().get("data") or {}).get("list") or []):
        bvid = e.get("bvid", "")
        url = f"https://www.bilibili.com/video/{bvid}" if bvid else e.get("short_link", "")
        owner = (e.get("owner") or {}).get("name", "")
        summary = f"UP主：{owner}" if owner else ""
        out.append(_item("bilibili", e.get("title", ""), url, summary, hot=i + 1))
    return out


async def _fetch_v2ex(limit: int) -> list[dict]:
    r = await _get_client().get("https://www.v2ex.com/api/topics/hot.json")
    r.raise_for_status()
    out = []
    for e in r.json()[:limit]:
        replies = e.get("replies", 0)
        out.append(_item("v2ex", e.get("title", ""), e.get("url", ""),
                         f"{replies} 条回复" if replies else ""))
    return out


async def _fetch_juejin(limit: int) -> list[dict]:
    r = await _get_client().post(
        "https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed",
        json={"id_type": 2, "client_type": 2608, "sort_type": 200, "cursor": "0", "limit": limit},
    )
    r.raise_for_status()
    out = []
    for e in r.json().get("data") or []:
        info = (e.get("item_info") or {}).get("article_info") or {}
        title = info.get("title", "")
        if not title:
            continue
        aid = info.get("article_id", "")
        out.append(_item("juejin", title, f"https://juejin.cn/post/{aid}" if aid else "",
                         _clean(info.get("brief_content", ""))))
    return out


async def _fetch_hackernews(limit: int) -> list[dict]:
    client = _get_client()
    r = await client.get("https://hacker-news.firebaseio.com/v0/topstories.json")
    r.raise_for_status()
    ids = r.json()[:limit]

    async def one(iid):
        resp = await client.get(f"https://hacker-news.firebaseio.com/v0/item/{iid}.json")
        return resp.json()

    details = await asyncio.gather(*[one(i) for i in ids], return_exceptions=True)
    out = []
    for i, d in enumerate(details):
        if isinstance(d, Exception) or not isinstance(d, dict):
            continue
        url = d.get("url") or f"https://news.ycombinator.com/item?id={d.get('id')}"
        score = d.get("score", 0)
        out.append(_item("hackernews", d.get("title", ""), url,
                         f"{score} points" if score else "", hot=i + 1))
    return out


# ═══════════════════════════════════════
# 源注册表
# ═══════════════════════════════════════

SOURCES = [
    {"id": "toutiao", "name": "今日头条", "domain": "热榜", "desc": "全网热点事件榜"},
    {"id": "zhihu", "name": "知乎热榜", "domain": "热榜", "desc": "知乎全站热议话题"},
    {"id": "bilibili", "name": "B站热门", "domain": "热榜", "desc": "哔哩哔哩全站热门视频"},
    {"id": "sspai", "name": "少数派", "domain": "科技", "desc": "数字生活与效率工具"},
    {"id": "ithome", "name": "IT之家", "domain": "科技", "desc": "科技新闻快讯"},
    {"id": "geekpark", "name": "极客公园", "domain": "科技", "desc": "创新与新锐科技观察"},
    {"id": "v2ex", "name": "V2EX", "domain": "开发者", "desc": "创意工作者社区热议"},
    {"id": "juejin", "name": "掘金", "domain": "开发者", "desc": "技术文章热门榜"},
    {"id": "ruanyifeng", "name": "阮一峰的网络日志", "domain": "开发者", "desc": "科技爱好者周刊等"},
    {"id": "ftchinese", "name": "FT中文网", "domain": "国际", "desc": "英国金融时报中文资讯"},
    {"id": "hackernews", "name": "Hacker News", "domain": "国际", "desc": "全球技术圈头条"},
]

_FETCHERS = {
    "toutiao": _fetch_toutiao,
    "zhihu": _fetch_zhihu,
    "bilibili": _fetch_bilibili,
    "sspai": lambda limit: _fetch_rss("sspai", "https://sspai.com/feed", limit),
    "ithome": lambda limit: _fetch_rss("ithome", "https://www.ithome.com/rss/", limit),
    "geekpark": lambda limit: _fetch_rss("geekpark", "https://www.geekpark.net/rss", limit),
    "v2ex": _fetch_v2ex,
    "juejin": _fetch_juejin,
    "ruanyifeng": lambda limit: _fetch_rss("ruanyifeng", "https://www.ruanyifeng.com/blog/atom.xml", limit),
    "ftchinese": lambda limit: _fetch_rss("ftchinese", "https://www.ftchinese.com/rss/news", limit),
    "hackernews": _fetch_hackernews,
}

_SOURCE_META = {s["id"]: s for s in SOURCES}


def catalog() -> list[dict]:
    """前端选择器用的源目录"""
    return SOURCES


async def fetch_source(source_id: str, limit: int = PER_SOURCE_LIMIT) -> list[dict]:
    """抓单个源（带缓存与错误透传）"""
    fetcher = _FETCHERS.get(source_id)
    if fetcher is None:
        raise ValueError(f"未知新闻源: {source_id}")

    cached = _cache.get(source_id)
    if cached and time.monotonic() - cached[0] < CACHE_TTL:
        return cached[1]

    items = await fetcher(limit)
    _cache[source_id] = (time.monotonic(), items)
    return items


async def fetch_feed(source_ids: list[str], limit: int = PER_SOURCE_LIMIT) -> dict:
    """并发抓多个源，返回 {sections: [...], errors: {...}, fetched_at}"""
    valid = [sid for sid in source_ids if sid in _FETCHERS]

    async def one(sid: str) -> tuple[str, list[dict] | Exception]:
        try:
            return sid, await fetch_source(sid, limit)
        except Exception as e:
            log.warning("新闻源 %s 抓取失败: %s", sid, e)
            return sid, e

    results = await asyncio.gather(*[one(sid) for sid in valid])

    sections = []
    errors = {}
    for sid, res in results:
        meta = _SOURCE_META[sid]
        if isinstance(res, Exception):
            errors[sid] = str(res)[:120]
            sections.append({"source": sid, "name": meta["name"], "domain": meta["domain"], "items": []})
        else:
            sections.append({"source": sid, "name": meta["name"], "domain": meta["domain"], "items": res})

    return {
        "sections": sections,
        "errors": errors,
        "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
