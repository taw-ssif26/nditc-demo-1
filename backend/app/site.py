"""Server-rendered public pages: real URLs, crawlable HTML, per-page meta. The client script then takes over."""
import re, os, json, html, time, pathlib, datetime as dt
from sqlalchemy import select
from .models import Entry

BASE = os.environ.get("BASE_URL", "http://localhost:8000").rstrip("/")
TPL = (pathlib.Path(__file__).parent / "static" / "site.html").read_text()
CACHE: dict = {}
esc = lambda x: html.escape(str(x))
SEO = {
    "/": ("NDITC — Notre Dame Information Technology Club", "Notre Dame Information Technology Club (NDITC), est. 2018: AI, robotics, web and app development, competitive programming and design."),
    "/about": ("About NDITC — Innovate and Encode Your Ideas", "History, objectives, milestones and numbers of the Notre Dame Information Technology Club."),
    "/activities": ("Activities & Events — NDITC", "National events, workshops, research projects and the annual publication of NDITC."),
    "/projects": ("Projects — NDITC", "Quantum Computer, HashTech, Evya AI and other NDITC research and development projects."),
    "/executives": ("Executives — NDITC", "The executive team of the Notre Dame Information Technology Club."),
    "/publication": ("Publication — RECURSION | NDITC", "RECURSION, the yearly publication of NDITC."),
    "/blog": ("Blog — NDITC", "News and articles from the Notre Dame Information Technology Club."),
    "/contact": ("Contact NDITC", "Email and address of the Notre Dame Information Technology Club, Dhaka."),
    "/developers": ("Developers — NDITC", "The developers behind NDITC projects."),
    "/policy": ("Policy — NDITC", "NDITC policies."),
    "/mobile-app": ("NDITC Mobile App", "The official NDITC mobile application for club members and tech enthusiasts."),
}


def content(s):
    rows = s.scalars(select(Entry).where(Entry.audience == "public", Entry.published.is_(True)).order_by(Entry.position, Entry.id)).all()
    by = {}
    for e in rows: by.setdefault(e.kind, []).append(e)
    g = lambda k: by.get(k, [])
    pg = {e.title: e.body for e in g("page")}
    fd = lambda e: e.date.strftime("%d %b %Y") if e.date else ""
    item = lambda e: {"t": e.title, "d": e.body, "img": e.image, "link": e.link, "date": fd(e)}
    def stat(e):
        m = re.match(r"\s*(\d+)(.*)", e.body)
        return [e.title, int(m[1]), m[2].strip()] if m else [e.title, 0, e.body]
    pj = [item(e) for e in g("project")]
    return {"badge": "APP | JOIN THE COMMUNITY OF TECH ENTHUSIASTS", "cta": "LEARN MORE", "lead": pg.get("lead", ""),
            "departments": [e.title for e in g("department")],
            "project": {"name": pj[0]["t"], "desc": pj[0]["d"], "img": pj[0]["img"]} if pj else {"name": "", "desc": "", "img": ""},
            "projects": pj, "activities": [item(e) for e in g("activity")], "why": [item(e) for e in g("why")],
            "news": {"t": "Code Compass (Official Newsletter)", "d": pg.get("newsletter", "")},
            "app": pg.get("app", ""), "email": pg.get("email", ""), "address": pg.get("address", ""), "copy": pg.get("copy", ""),
            "motto": pg.get("motto", ""), "history": pg.get("history", ""), "objectives": pg.get("objectives", ""),
            "stats": [stat(e) for e in g("stat")],
            "timeline": [[fd(e), "" if e.title == "(entry pending)" else e.title] for e in g("timeline")],
            "events": [item(e) for e in g("event")], "executives": [item(e) for e in g("executive")],
            "blog": [item(e) for e in g("blog")], "publications": [item(e) for e in g("publication")], "pg": pg}


def ul(rows): return "<ul>" + "".join(f"<li><h3>{esc(a)}</h3>" + (f"<p>{esc(b)}</p>" if b else "") + "</li>" for a, b in rows) + "</ul>" if rows else ""
def sec(t, b): return f"<section><h2>{esc(t)}</h2>{b}</section>" if b else ""
def pr(*t): return "".join(f"<p>{esc(x)}</p>" for x in t if x)


def body(path, C):
    A = lambda k: ul([(a["t"], a["d"]) for a in C[k]])
    T = {"/": lambda: f"<h1>NDITC — Notre Dame Information Technology Club</h1>{pr(C['lead'])}" + sec("Departments", ul([(d, "") for d in C["departments"]]))
         + sec("Featured project", pr(C["project"]["name"], C["project"]["desc"])) + sec("Our activities include", A("activities")) + sec("Why you should join NDITC?", A("why"))
         + sec(C["news"]["t"], pr(C["news"]["d"])) + sec("Official NDITC Mobile Application", pr(C["app"])),
         "/about": lambda: f"<h1>About NDITC</h1>{pr(C['motto'], C['history'], C['objectives'])}" + sec("In numbers", ul([(f"{a[1]}{a[2]}", a[0]) for a in C["stats"]]))
         + sec("Timeline of achievements", ul([(a[0], a[1]) for a in C["timeline"]])),
         "/activities": lambda: "<h1>Activities</h1>" + sec("Our activities include", A("activities")) + sec("Events", A("events")),
         "/projects": lambda: "<h1>Projects</h1>" + sec("Featured", A("projects")),
         "/executives": lambda: "<h1>Executives</h1>" + sec("The team", A("executives")),
         "/publication": lambda: "<h1>Publication</h1>" + sec("RECURSION", pr(C["activities"][3]["d"] if len(C["activities"]) > 3 else "") + A("publications")),
         "/blog": lambda: "<h1>Blog</h1>" + sec("Posts", A("blog")),
         "/contact": lambda: "<h1>Contact</h1>" + pr(C["email"], C["address"]),
         "/developers": lambda: "<h1>Developers</h1>" + pr(C["pg"].get("developers", "")),
         "/policy": lambda: "<h1>Policy</h1>" + pr(C["pg"].get("policy", "")),
         "/mobile-app": lambda: "<h1>Mobile App</h1>" + pr(C["app"])}[path]()
    nav = "".join(f'<li><a href="{p}">{esc(SEO[p][0].split(" — ")[0])}</a></li>' for p in SEO)
    return f"{T}<nav aria-label=\"Main\"><ul>{nav}</ul></nav>"


def page(path, s):
    hit = CACHE.get(path)
    if hit and time.time() - hit[0] < 30: return hit[1]
    C = content(s); title, desc = SEO[path]
    v = {"TITLE": esc(title), "DESC": esc(desc), "CANON": esc(BASE + path), "SSR": body(path, C), "CONTENT": json.dumps(C, ensure_ascii=False).replace("<", "\\u003c")}
    out = re.sub(r"\{\{(\w+)\}\}", lambda m: v.get(m[1], ""), TPL)  # one pass: admin text can never inject a placeholder
    CACHE[path] = (time.time(), out)
    return out


def sitemap():
    d = dt.date.today().isoformat()
    return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + "".join(
        f"<url><loc>{esc(BASE + p)}</loc><lastmod>{d}</lastmod></url>" for p in SEO) + "</urlset>"
