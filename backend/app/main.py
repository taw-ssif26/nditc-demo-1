import os, io, re, csv, pathlib, secrets, tempfile, datetime as dt
import jwt, pyotp
from fastapi import FastAPI, Depends, HTTPException, Request, Response, UploadFile, Query
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from starlette.exceptions import HTTPException as SHTTP
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr, Field, field_validator
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import Session
from .models import SessionLocal, User, Entry, FileRec, Audit
from .security import ph, verify, DUMMY
from . import site
from .storage import store

PROD = os.environ.get("ENV") == "prod"
SECRET = os.environ["SECRET_KEY"]
assert len(SECRET) >= 32 and " " not in SECRET, "SECRET_KEY must be 32+ random characters (run scripts/make-env.sh)"
REQUIRE_2FA = os.environ.get("REQUIRE_2FA", "1" if PROD else "0") == "1"
UTC = dt.timezone.utc
MAX_PENDING = int(os.environ.get("MAX_PENDING", "500"))  # cap on unreviewed sign-ups, so bots cannot flood the database
PUBLIC_KINDS = {"department", "activity", "why", "project", "executive", "event", "blog", "publication", "timeline", "stat", "page"}
STUDENT_KINDS = {"session", "event", "notice", "resource"}
ALL_KINDS = PUBLIC_KINDS | STUDENT_KINDS
ALLOWED = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
           ".doc": "application/msword", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
           ".ppt": "application/vnd.ms-powerpoint", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
           ".xls": "application/vnd.ms-excel", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".txt": "text/plain"}
MAGIC = {".pdf": b"%PDF", ".png": b"\x89PNG", ".jpg": b"\xff\xd8", ".jpeg": b"\xff\xd8", ".webp": b"RIFF"}
IMG = {".jpg", ".jpeg", ".png", ".webp"}
MAX = 20 * 1024 * 1024
STATIC = pathlib.Path(__file__).parent / "static"
# Public pages load Google Fonts; swap for self-hosted fonts to drop these two hosts.
CSP = "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"

TRUST_CF = os.environ.get("TRUST_CF", "1") == "1"  # set 0 when NOT behind Cloudflare, so clients can't fake their IP


def ip(request: Request):
    return (TRUST_CF and request.headers.get("cf-connecting-ip")) or (request.client.host if request.client else "x")

limiter = Limiter(ip, default_limits=["300/minute"], storage_uri=os.environ.get("REDIS_URL") or "memory://", in_memory_fallback_enabled=True)
app = FastAPI(docs_url=None if PROD else "/docs", redoc_url=None, openapi_url=None if PROD else "/openapi.json")
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)


@app.exception_handler(RateLimitExceeded)
async def _rl(r, e):
    return JSONResponse({"detail": "Too many requests. Please slow down."}, 429)


@app.middleware("http")
async def guard(req: Request, nxt):
    # CSRF: cookies are SameSite=Strict AND every write must carry a header cross-site forms/scripts cannot add.
    if req.url.path.startswith("/api/") and req.method not in ("GET", "HEAD", "OPTIONS") and req.headers.get("x-requested-with") != "nditc":
        return JSONResponse({"detail": "Bad request"}, 403)
    r = await nxt(req)
    r.headers.update({"X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "same-origin",
                      "Content-Security-Policy": CSP, "Permissions-Policy": "camera=(), microphone=(), geolocation=()"})
    if req.url.path.startswith("/static/"): r.headers["Cache-Control"] = "public, max-age=3600"
    if PROD:
        r.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return r


def db():
    with SessionLocal() as s:
        yield s


def aware(d):
    return d.replace(tzinfo=UTC) if d and d.tzinfo is None else d


def user_of(req: Request, s: Session) -> User:
    try:
        p = jwt.decode(req.cookies.get("t", ""), SECRET, algorithms=["HS256"])
        uid, pv = int(p["sub"]), int(p["pv"])
    except Exception:
        raise HTTPException(401, "Not signed in")
    u = s.get(User, uid)  # re-checked in the DB every request: disabling a user or changing a password takes effect immediately
    if not u or not u.active or u.pv != pv or u.status != "approved":
        raise HTTPException(401, "Not signed in")
    return u


def need(*roles, loose=False):
    def dep(req: Request, s: Session = Depends(db)):
        u = user_of(req, s)
        if u.role not in roles: raise HTTPException(403, "Not allowed")
        if not loose:
            if u.must_change: raise HTTPException(403, "Change your password first")
            if REQUIRE_2FA and u.role != "student" and not u.totp_on: raise HTTPException(403, "Set up two-factor authentication first")
        return u
    return dep


ADMIN = need("admin", "super")
ANY = need("student", "admin", "super")
LOOSE = need("student", "admin", "super", loose=True)  # only for the screens that fix those very problems


def log(s, u, action):
    s.add(Audit(user_id=u.id, action=action[:300]))
    site.CACHE.clear()  # every logged change may alter public pages


def issue(resp: Response, u: User):
    tok = jwt.encode({"sub": str(u.id), "pv": u.pv, "exp": dt.datetime.now(UTC) + dt.timedelta(hours=8)}, SECRET, "HS256")
    resp.set_cookie("t", tok, httponly=True, secure=PROD, samesite="strict", max_age=8 * 3600, path="/")


# ---------- auth ----------
class Login(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    code: str | None = Field(None, max_length=10)


def bad_login(s, u, msg):
    if u:
        u.fails += 1
        if u.fails >= 8: u.locked_until, u.fails = dt.datetime.now(UTC) + dt.timedelta(minutes=15), 0
        s.commit()
    raise HTTPException(401, msg)


@app.post("/api/auth/login")
@limiter.limit(os.environ.get("LOGIN_LIMIT", "5/minute"))
def login(request: Request, body: Login, resp: Response, s: Session = Depends(db)):
    u = s.scalar(select(User).where(User.email == body.email.lower()))
    if u and aware(u.locked_until) and aware(u.locked_until) > dt.datetime.now(UTC):
        raise HTTPException(429, "Too many wrong attempts. Try again in 15 minutes.")
    ok = verify(u.pw if u else DUMMY, body.password)
    if not (u and ok and u.active): bad_login(s, u, "Wrong email or password")
    if u.status != "approved":  # only said after the password is right, so this can't be used to discover who registered
        raise HTTPException(403, "Your registration is waiting for admin approval. You can sign in once it is approved." if u.status == "pending"
                            else "Your registration was not approved. Please contact the club.")
    if u.totp_on:
        if not body.code: raise HTTPException(401, "2FA code required")
        if not pyotp.TOTP(u.totp).verify(body.code.strip(), valid_window=1): bad_login(s, u, "Wrong 2FA code")
    u.fails, u.locked_until = 0, None; s.commit()
    issue(resp, u)
    return {"ok": True}


class Register(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    info: str = Field(min_length=2, max_length=200)  # class / roll / section
    password: str = Field(min_length=10, max_length=128)
    website: str = Field("", max_length=200)  # honeypot: invisible to people, bots fill it in


@app.post("/api/auth/register")
@limiter.limit(os.environ.get("REGISTER_LIMIT", "5/hour"))
def register(request: Request, b: Register, s: Session = Depends(db)):
    msg = {"ok": True, "message": "Request received. An admin will review it, and you can sign in once you are approved."}
    email = b.email.lower()
    if b.website or s.scalar(select(User.id).where(User.email == email)): return msg  # same answer either way: no account enumeration
    if s.scalar(select(func.count()).select_from(User).where(User.status == "pending")) >= MAX_PENDING:
        raise HTTPException(503, "Registration is temporarily closed. Please contact the club.")
    s.add(User(email=email, name=b.name.strip(), role="student", status="pending", info=b.info.strip(), pw=ph.hash(b.password))); s.commit()
    return msg


@app.post("/api/auth/logout")
def logout(resp: Response):
    resp.delete_cookie("t", path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def me(u: User = Depends(LOOSE)):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "must_change": u.must_change,
            "totp_on": u.totp_on, "need_2fa": REQUIRE_2FA and u.role != "student" and not u.totp_on}


class PwChange(BaseModel):
    current: str = Field(max_length=128)
    new: str = Field(min_length=10, max_length=128)


@app.post("/api/auth/password")
def change_pw(b: PwChange, resp: Response, u: User = Depends(LOOSE), s: Session = Depends(db)):
    if not verify(u.pw, b.current): raise HTTPException(400, "Current password is wrong")
    if b.new == b.current or b.new.lower() == u.email: raise HTTPException(400, "Choose a different password")
    u.pw, u.pv, u.must_change = ph.hash(b.new), u.pv + 1, False
    log(s, u, "changed own password"); s.commit(); issue(resp, u)  # old cookies on other devices stop working
    return {"ok": True}


@app.post("/api/auth/2fa/setup")
def tfa_setup(u: User = Depends(LOOSE), s: Session = Depends(db)):
    if u.totp_on: raise HTTPException(400, "Two-factor authentication is already on")
    u.totp = pyotp.random_base32(); s.commit()
    return {"secret": u.totp, "uri": pyotp.TOTP(u.totp).provisioning_uri(u.email, issuer_name="NDITC")}


class Code(BaseModel):
    code: str = Field(max_length=10)


@app.post("/api/auth/2fa/enable")
def tfa_enable(b: Code, u: User = Depends(LOOSE), s: Session = Depends(db)):
    if not u.totp or not pyotp.TOTP(u.totp).verify(b.code.strip(), valid_window=1): raise HTTPException(400, "That code is wrong. Check the time on your phone.")
    u.totp_on = True; log(s, u, "enabled 2FA"); s.commit()
    return {"ok": True}


# ---------- entries ----------
class EntryIn(BaseModel):
    kind: str
    title: str = Field(min_length=1, max_length=300)
    body: str = Field("", max_length=20000)
    image: str = Field("", max_length=300)
    link: str = Field("", max_length=500)
    date: dt.datetime | None = None
    audience: str = Field("public", pattern="^(public|students|assigned)$")
    published: bool = True
    position: int = Field(0, ge=-9999, le=9999)

    @field_validator("kind")
    def _k(cls, v):
        if v not in ALL_KINDS: raise ValueError("Unknown content type")
        return v

    @field_validator("link")
    def _l(cls, v):
        if v and not v.startswith(("http://", "https://")): raise ValueError("Link must start with http:// or https://")
        return v

    @field_validator("image")
    def _i(cls, v):
        if v and not v.startswith("/media/"): raise ValueError("Upload the image instead of pasting a link")
        return v


def ser(e: Entry, admin=False):
    d = dict(id=e.id, kind=e.kind, title=e.title, body=e.body, image=e.image, link=e.link, audience=e.audience,
             date=e.date.isoformat() if e.date else None, published=e.published, position=e.position,
             files=[dict(id=f.id, name=f.name, mime=f.mime, size=f.size) for f in e.files])
    if admin: d["user_ids"] = [x.id for x in e.users]
    return d


@app.get("/api/public/{kind}")
def public(kind: str, resp: Response, s: Session = Depends(db)):
    if kind not in PUBLIC_KINDS: raise HTTPException(404, "Not found")
    rows = s.scalars(select(Entry).where(Entry.kind == kind, Entry.audience == "public", Entry.published.is_(True))
                     .order_by(Entry.position, Entry.id).limit(500)).all()
    resp.headers["Cache-Control"] = "public, max-age=60"
    return [ser(e) for e in rows]


@app.get("/api/student/feed")
def feed(u: User = Depends(ANY), s: Session = Depends(db)):
    q = select(Entry).where(Entry.kind.in_(STUDENT_KINDS), Entry.published.is_(True),
        or_(Entry.audience.in_(("public", "students")), and_(Entry.audience == "assigned", Entry.users.any(User.id == u.id))))
    return [ser(e) for e in s.scalars(q.order_by(Entry.date.desc().nullslast(), Entry.id.desc()).limit(500))]


@app.get("/api/admin/entries")
def a_list(kind: str, q: str = "", limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), u=Depends(ADMIN), s: Session = Depends(db)):
    if kind not in ALL_KINDS: raise HTTPException(404, "Not found")
    w = [Entry.kind == kind] + ([func.lower(Entry.title).contains(q.lower(), autoescape=True)] if q else [])
    total = s.scalar(select(func.count()).select_from(Entry).where(*w))
    rows = s.scalars(select(Entry).where(*w).order_by(Entry.position, Entry.id).limit(limit).offset(offset))
    return {"items": [ser(e, True) for e in rows], "total": total}


@app.post("/api/admin/entries")
def a_new(b: EntryIn, u=Depends(ADMIN), s: Session = Depends(db)):
    e = Entry(**b.model_dump()); s.add(e); s.flush(); log(s, u, f"created {e.kind}: {e.title}"); s.commit()
    return ser(e, True)


@app.put("/api/admin/entries/{eid}")
def a_edit(eid: int, b: EntryIn, u=Depends(ADMIN), s: Session = Depends(db)):
    e = s.get(Entry, eid)
    if not e: raise HTTPException(404, "Not found")
    if e.image and e.image != b.image:  # replaced image: delete the old file instead of leaving it orphaned
        old = s.scalar(select(FileRec).where(FileRec.stored == e.image.removeprefix("/media/"), FileRec.public.is_(True)))
        if old: store.delete(True, old.stored); s.delete(old)
    for k, v in b.model_dump().items(): setattr(e, k, v)
    log(s, u, f"edited {e.kind}: {e.title}"); s.commit()
    return ser(e, True)


@app.delete("/api/admin/entries/{eid}")
def a_del(eid: int, u=Depends(ADMIN), s: Session = Depends(db)):
    e = s.get(Entry, eid)
    if not e: raise HTTPException(404, "Not found")
    for f in e.files: store.delete(f.public, f.stored)
    log(s, u, f"deleted {e.kind}: {e.title}"); s.delete(e); s.commit()
    return {"ok": True}


class Assign(BaseModel):
    user_ids: list[int] = Field(max_length=2000)


@app.put("/api/admin/entries/{eid}/assign")
def a_assign(eid: int, b: Assign, u=Depends(ADMIN), s: Session = Depends(db)):
    e = s.get(Entry, eid)
    if not e: raise HTTPException(404, "Not found")
    e.users = list(s.scalars(select(User).where(User.id.in_(b.user_ids), User.role == "student")))
    log(s, u, f"assigned {len(e.users)} students to {e.title}"); s.commit()
    return {"ok": True}


# ---------- files ----------
@app.post("/api/admin/upload")
async def upload(file: UploadFile, entry_id: int | None = None, public: bool = False, u=Depends(ADMIN), s: Session = Depends(db)):
    name = pathlib.Path(file.filename or "file").name[:150]
    ext = pathlib.Path(name).suffix.lower()
    if ext not in ALLOWED: raise HTTPException(400, "File type not allowed (PDF, Word, Excel, PowerPoint, text, JPG, PNG, WebP)")
    if public and ext not in IMG: raise HTTPException(400, "Only images can be public")
    if entry_id and not s.get(Entry, entry_id): raise HTTPException(404, "Not found")
    head = await file.read(8)
    if ext in MAGIC and not head.startswith(MAGIC[ext]): raise HTTPException(400, "File content does not match its type")
    stored = secrets.token_hex(16) + ext
    buf = tempfile.SpooledTemporaryFile(max_size=4 << 20); buf.write(head); size = len(head)
    while chunk := await file.read(1 << 20):
        size += len(chunk)
        if size > MAX: buf.close(); raise HTTPException(413, "File too large (max 20 MB)")
        buf.write(chunk)
    buf.seek(0)
    try: await run_in_threadpool(store.put, public, stored, buf, ALLOWED[ext])
    except HTTPException: raise
    except Exception: raise HTTPException(502, "File storage is unavailable right now. Try again in a minute.")
    finally: buf.close()
    f = FileRec(entry_id=entry_id, name=name, stored=stored, mime=ALLOWED[ext], size=size, public=public)
    s.add(f); s.flush(); log(s, u, f"uploaded {name}"); s.commit()
    return {"id": f.id, "name": name, "url": f"/media/{stored}" if public else f"/api/files/{f.id}"}


@app.delete("/api/admin/files/{fid}")
def del_file(fid: int, u=Depends(ADMIN), s: Session = Depends(db)):
    f = s.get(FileRec, fid)
    if not f: raise HTTPException(404, "Not found")
    store.delete(f.public, f.stored)
    log(s, u, f"removed file {f.name}"); s.delete(f); s.commit()
    return {"ok": True}


@app.get("/api/files/{fid}")
def download(fid: int, req: Request, s: Session = Depends(db)):
    f = s.get(FileRec, fid)
    if not f: raise HTTPException(404, "Not found")
    if not f.public:
        u = user_of(req, s)
        if u.role == "student":
            e = s.get(Entry, f.entry_id) if f.entry_id else None
            if not (e and e.published and e.kind in STUDENT_KINDS and (e.audience in ("public", "students") or u in e.users)):
                raise HTTPException(404, "Not found")  # 404, not 403: don't confirm the file exists
    img = f.mime.startswith("image/")
    return store.send(f.public, f.stored, f.name, f.mime, img, "public, max-age=86400" if f.public else "private, no-store")


# ---------- users ----------
class UserIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    role: str = Field("student", pattern="^(student|admin)$")
    password: str | None = Field(None, min_length=10, max_length=128)


class UserUp(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    active: bool | None = None
    reset: bool = False
    reset2fa: bool = False


def manageable(u: User, t: User):
    if t.role == "super" or (u.role == "admin" and t.role != "student"): raise HTTPException(403, "Not allowed")


def u_out(x): return {"id": x.id, "name": x.name, "email": x.email, "role": x.role, "active": x.active, "status": x.status, "info": x.info, "created": x.created.isoformat() if x.created else None}


@app.get("/api/admin/users")
def users(role: str = "student", status: str = Query("approved", pattern="^(pending|approved|rejected)$"), q: str = "", limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0), u=Depends(ADMIN), s: Session = Depends(db)):
    if role == "admin" and u.role != "super": raise HTTPException(403, "Not allowed")
    if role not in ("student", "admin"): raise HTTPException(400, "Bad role")
    w = [User.role == role, User.status == status] + ([or_(func.lower(User.name).contains(q.lower(), autoescape=True), User.email.contains(q.lower(), autoescape=True))] if q else [])
    total = s.scalar(select(func.count()).select_from(User).where(*w))
    return {"items": [u_out(x) for x in s.scalars(select(User).where(*w).order_by(User.name).limit(limit).offset(offset))], "total": total}


@app.post("/api/admin/users")
def user_new(b: UserIn, u=Depends(ADMIN), s: Session = Depends(db)):
    if b.role == "admin" and u.role != "super": raise HTTPException(403, "Only the super admin can add admins")
    if s.scalar(select(User.id).where(User.email == b.email.lower())): raise HTTPException(409, "That email already exists")
    pw = b.password or secrets.token_urlsafe(9)
    x = User(email=b.email.lower(), name=b.name, role=b.role, pw=ph.hash(pw), must_change=True); s.add(x); s.flush()
    log(s, u, f"created {b.role}: {x.email}"); s.commit()
    return {**u_out(x), "password": pw}


@app.put("/api/admin/users/{uid}")
def user_edit(uid: int, b: UserUp, u=Depends(ADMIN), s: Session = Depends(db)):
    x = s.get(User, uid)
    if not x: raise HTTPException(404, "Not found")
    manageable(u, x)
    if b.name: x.name = b.name
    if b.active is not None:
        if x.id == u.id: raise HTTPException(400, "You can't disable yourself")
        x.active = b.active
    out = u_out(x)
    if b.reset:
        out["password"] = secrets.token_urlsafe(9); x.pw, x.must_change, x.pv = ph.hash(out["password"]), True, x.pv + 1
    if b.reset2fa:
        if u.role != "super": raise HTTPException(403, "Only the super admin can reset 2FA")
        x.totp, x.totp_on = None, False
    log(s, u, f"updated user {x.email}"); s.commit()
    return out


@app.delete("/api/admin/users/{uid}")
def user_del(uid: int, u=Depends(ADMIN), s: Session = Depends(db)):
    x = s.get(User, uid)
    if not x or x.id == u.id: raise HTTPException(404, "Not found")
    manageable(u, x); log(s, u, f"deleted user {x.email}"); s.delete(x); s.commit()
    return {"ok": True}


class Review(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=500)
    action: str = Field(pattern="^(approve|reject)$")


@app.post("/api/admin/users/review")
def review(b: Review, u=Depends(ADMIN), s: Session = Depends(db)):
    rows = s.scalars(select(User).where(User.id.in_(b.ids), User.role == "student")).all()  # students only: admins can never be changed here
    for x in rows: x.status = "approved" if b.action == "approve" else "rejected"
    log(s, u, f"{b.action}d {len(rows)} student registrations"); s.commit()
    return {"changed": len(rows)}


@app.get("/api/admin/pending")
def pending(u=Depends(ADMIN), s: Session = Depends(db)):
    return {"count": s.scalar(select(func.count()).select_from(User).where(User.role == "student", User.status == "pending"))}


@app.post("/api/admin/users/import")
async def user_import(file: UploadFile, u=Depends(ADMIN), s: Session = Depends(db)):
    raw = (await file.read(1_000_000)).decode("utf-8-sig", "ignore")
    out = []
    for row in list(csv.DictReader(io.StringIO(raw)))[:500]:
        name, email = (row.get("name") or "").strip()[:120], (row.get("email") or "").strip().lower()
        if not name or "@" not in email or s.scalar(select(User.id).where(User.email == email)): continue
        pw = secrets.token_urlsafe(9)
        s.add(User(email=email, name=name, role="student", pw=ph.hash(pw), must_change=True)); out.append({"name": name, "email": email, "password": pw})
    log(s, u, f"imported {len(out)} students"); s.commit()
    return out


@app.get("/api/admin/audit")
def audit(u=Depends(need("super")), s: Session = Depends(db)):
    names = {x.id: x.name for x in s.scalars(select(User))}
    return [{"who": names.get(a.user_id, "?"), "action": a.action, "at": a.at.isoformat()}
            for a in s.scalars(select(Audit).order_by(Audit.id.desc()).limit(300))]


@app.get("/ping")
def ping(): return Response("ok", media_type="text/plain")  # no database touch: for uptime monitors that keep a free host awake


@app.get("/media/{name}", include_in_schema=False)
def media(name: str):
    if not re.fullmatch(r"[0-9a-f]{32}\.(jpg|jpeg|png|webp)", name): raise HTTPException(404, "Not found")
    return store.send(True, name, name, ALLOWED["." + name.rsplit(".", 1)[1]], True, "public, max-age=86400")


@app.get("/healthz")
def health(s: Session = Depends(db)):
    s.execute(select(1))  # fails (500) if the database is down, so monitors notice
    return {"ok": True}


def site_page(request: Request, s: Session = Depends(db)):
    return HTMLResponse(site.page(request.url.path.rstrip("/") or "/", s), headers={"Cache-Control": "public, max-age=60, s-maxage=120"})


for _p in site.SEO:
    app.add_api_route(_p, site_page, methods=["GET", "HEAD"], include_in_schema=False)


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap(): return Response(site.sitemap(), media_type="application/xml")


@app.get("/robots.txt", include_in_schema=False)
def robots(): return Response(f"User-agent: *\nDisallow: /api/\nDisallow: /admin\nDisallow: /portal\nDisallow: /app\nSitemap: {site.BASE}/sitemap.xml\n", media_type="text/plain")


@app.get("/app", include_in_schema=False)
@app.get("/admin", include_in_schema=False)
@app.get("/portal", include_in_schema=False)
def shell(): return FileResponse(STATIC / "app.html", headers={"X-Robots-Tag": "noindex"})


@app.exception_handler(SHTTP)
async def http_exc(request, exc):
    if exc.status_code == 404 and not request.url.path.startswith(("/api/", "/static/", "/media/")):
        return HTMLResponse('<!doctype html><meta charset=utf-8><meta name=robots content=noindex><title>Not found</title><body style="background:#0b0c0a;color:#e9e5da;font:18px system-ui;padding:12vh 8vw"><h1>404</h1><p>Nothing at this address. <a style=color:#d4ff3a href=/>Back to NDITC</a></p>', 404)
    return JSONResponse({"detail": exc.detail}, exc.status_code, headers=getattr(exc, "headers", None))


app.mount("/static", StaticFiles(directory=STATIC), name="static")
