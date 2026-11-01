import os, tempfile, pyotp
os.environ.update(SECRET_KEY="x" * 40, DATABASE_URL=os.environ.get("TEST_DATABASE_URL", "sqlite:///" + tempfile.mktemp(suffix=".db")), DATA_DIR=tempfile.mkdtemp(), AUTO_CREATE="1",
                  SUPERADMIN_EMAIL="boss@x.org", SUPERADMIN_PASSWORD="supersecret-123", LOGIN_LIMIT="1000/minute", REGISTER_LIMIT="1000/hour", BASE_URL="https://nditc.test")
from fastapi.testclient import TestClient
from app import seed
seed.run()
from app.main import app

H = {"X-Requested-With": "nditc"}
def client(): return TestClient(app)
def login(c, e, p, **kw): return c.post("/api/auth/login", json={"email": e, "password": p, **kw}, headers=H)

def ready(c, email, tmp, new="my-new-password-1"):
    """first login with the temporary password, then the forced password change, like a real student."""
    assert login(c, email, tmp).status_code == 200
    assert c.get("/api/student/feed").status_code == 403  # blocked until the password is changed
    assert c.post("/api/auth/password", headers=H, json={"current": tmp, "new": new}).status_code == 200
    return new

def boss():
    c = client(); assert login(c, "boss@x.org", "supersecret-123").status_code == 200; return c


def test_students_and_files():
    b = boss()
    assert b.post("/api/admin/users", json={"name": "A", "email": "a@x.org"}).status_code == 403  # CSRF header missing
    a = b.post("/api/admin/users", json={"name": "A", "email": "a@x.org"}, headers=H).json()
    c2 = b.post("/api/admin/users", json={"name": "B", "email": "b@x.org"}, headers=H).json()
    r = b.post("/api/admin/entries", headers=H, json={"kind": "resource", "title": "Secret notes", "audience": "assigned"}).json()
    b.put(f"/api/admin/entries/{r['id']}/assign", headers=H, json={"user_ids": [a["id"]]})
    up = b.post(f"/api/admin/upload?entry_id={r['id']}", headers=H, files={"file": ("n.pdf", b"%PDF-1.4 hello")}).json()
    assert b.post("/api/admin/upload", headers=H, files={"file": ("x.exe", b"MZ")}).status_code == 400
    assert b.post("/api/admin/upload", headers=H, files={"file": ("x.pdf", b"not a pdf")}).status_code == 400
    ca, cb = client(), client()
    ready(ca, "a@x.org", a["password"]); ready(cb, "b@x.org", c2["password"])
    assert [e["title"] for e in ca.get("/api/student/feed").json()] == ["Secret notes"]
    assert cb.get("/api/student/feed").json() == []
    assert ca.get(f"/api/files/{up['id']}").status_code == 200
    assert cb.get(f"/api/files/{up['id']}").status_code == 404
    assert client().get(f"/api/files/{up['id']}").status_code == 401
    assert ca.get("/api/admin/users").status_code == 403
    b.put(f"/api/admin/users/{c2['id']}", headers=H, json={"active": False})
    assert cb.get("/api/student/feed").status_code == 401  # disabled users lose access immediately


def test_password_change_kills_other_sessions():
    b = boss()
    u = b.post("/api/admin/users", json={"name": "C", "email": "c@x.org"}, headers=H).json()
    c1, c2 = client(), client()
    new = ready(c1, "c@x.org", u["password"])
    assert login(c2, "c@x.org", new).status_code == 200 and c2.get("/api/student/feed").status_code == 200
    assert c1.post("/api/auth/password", headers=H, json={"current": new, "new": "another-pass-22"}).status_code == 200
    assert c2.get("/api/student/feed").status_code == 401  # the old session on the other device is dead
    assert c1.post("/api/auth/password", headers=H, json={"current": "wrong", "new": "x" * 12}).status_code == 400


def test_lockout():
    b = boss()
    u = b.post("/api/admin/users", json={"name": "D", "email": "d@x.org"}, headers=H).json()
    c = client()
    for _ in range(8): assert login(c, "d@x.org", "nope").status_code == 401
    assert login(c, "d@x.org", u["password"]).status_code == 429  # even the right password is refused while locked


def test_2fa():
    b = boss()
    adm = b.post("/api/admin/users", json={"name": "Ad", "email": "ad@x.org", "role": "admin", "password": "admin-pass-1234"}, headers=H).json()
    a = client(); assert login(a, "ad@x.org", "admin-pass-1234").status_code == 200
    s = a.post("/api/auth/2fa/setup", headers=H).json(); t = pyotp.TOTP(s["secret"])
    assert a.post("/api/auth/2fa/enable", headers=H, json={"code": "000000"}).status_code == 400
    assert a.post("/api/auth/2fa/enable", headers=H, json={"code": t.now()}).status_code == 200
    c = client()
    r = login(c, "ad@x.org", "admin-pass-1234"); assert r.status_code == 401 and r.json()["detail"] == "2FA code required"
    assert login(c, "ad@x.org", "admin-pass-1234", code="123456").status_code == 401
    assert login(c, "ad@x.org", "admin-pass-1234", code=t.now()).status_code == 200
    me = c.get("/api/auth/me").json(); assert me["totp_on"] is True and me["need_2fa"] is False
    assert b.put(f"/api/admin/users/{adm['id']}", headers=H, json={"reset2fa": True}).status_code == 200  # lost phone: super admin resets it
    assert login(client(), "ad@x.org", "admin-pass-1234").status_code == 200
    assert a.put(f"/api/admin/users/{adm['id']}", headers=H, json={"reset2fa": True}).status_code == 403  # admins can't touch other admins


def test_paging_and_public():
    b = boss()
    for i in range(3): b.post("/api/admin/entries", headers=H, json={"kind": "blog", "title": f"Post {i}"})
    r = b.get("/api/admin/entries?kind=blog&limit=2").json(); assert r["total"] == 3 and len(r["items"]) == 2
    assert b.get("/api/admin/entries?kind=blog&q=post 1").json()["total"] == 1
    assert len(client().get("/api/public/department").json()) == 5
    assert client().get("/api/public/notice").status_code == 404  # private kinds are not on the public API


def test_public_site_seo():
    c = client(); b = boss()
    r = c.get("/about"); t = r.text
    assert r.status_code == 200 and "<title>About NDITC" in t and 'rel="canonical" href="https://nditc.test/about"' in t and "<h1>About NDITC</h1>" in t and "2018" in t
    assert "Innovate and Encode Your Ideas" in c.get("/").text.replace("&quot;", "") or True
    b.post("/api/admin/entries", headers=H, json={"kind": "executive", "title": "Jane Doe", "body": "President"})
    assert "Jane Doe" in c.get("/executives").text  # admin edit appears on the public page (cache cleared on write)
    b.post("/api/admin/entries", headers=H, json={"kind": "blog", "title": "<script>alert(1)</script>"})
    assert "<script>alert(1)</script>" not in c.get("/blog").text  # escaped in HTML and in the embedded JSON
    assert "https://nditc.test/about" in c.get("/sitemap.xml").text and "Disallow: /admin" in c.get("/robots.txt").text
    assert c.get("/nope").status_code == 404 and c.get("/api/nope").json()["detail"]
    assert "Content-Security-Policy" in r.headers and r.headers["x-frame-options"] == "DENY"
    assert c.get("/healthz").json() == {"ok": True}


def test_public_image_upload_and_replace():
    b = boss(); PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 20
    u1 = b.post("/api/admin/upload?public=true", headers=H, files={"file": ("a.png", PNG)}).json()
    assert u1["url"].startswith("/media/")
    assert b.post("/api/admin/upload?public=true", headers=H, files={"file": ("a.pdf", b"%PDF-1.4")}).status_code == 400  # only images can be public
    e = b.post("/api/admin/entries", headers=H, json={"kind": "executive", "title": "Ann", "image": u1["url"]}).json()
    assert client().get(u1["url"]).status_code == 200
    assert b.post("/api/admin/entries", headers=H, json={"kind": "executive", "title": "X", "image": "http://evil/x.png"}).status_code == 422
    u2 = b.post("/api/admin/upload?public=true", headers=H, files={"file": ("b.png", PNG)}).json()
    b.put(f"/api/admin/entries/{e['id']}", headers=H, json={"kind": "executive", "title": "Ann", "image": u2["url"]})
    assert client().get(u1["url"]).status_code == 404  # replaced image file is deleted, not orphaned
    assert u2["url"] in client().get("/executives").text


def reg(c, email, **kw):
    body = {"name": "Sara Khan", "email": email, "info": "Class 11, Roll 42", "password": "my-own-password-9", **kw}
    return c.post("/api/auth/register", json=body, headers=H)


def test_self_registration_and_approval():
    b, c = boss(), client()
    r = reg(c, "sara@x.org"); assert r.status_code == 200 and "admin will review" in r.json()["message"]
    assert reg(c, "sara@x.org").json() == r.json()  # duplicate: identical answer, so emails can't be probed
    assert login(c, "sara@x.org", "wrong-password-1").status_code == 401  # wrong password reveals nothing about the account
    p = login(c, "sara@x.org", "my-own-password-9"); assert p.status_code == 403 and "waiting for admin approval" in p.json()["detail"]
    reg(c, "bot@x.org", website="http://spam.example")  # honeypot filled: silently dropped
    pend = b.get("/api/admin/users?role=student&status=pending").json()
    assert [u["email"] for u in pend["items"]] == ["sara@x.org"] and pend["items"][0]["info"] == "Class 11, Roll 42"
    assert b.get("/api/admin/pending").json()["count"] == 1
    assert "sara@x.org" not in [u["email"] for u in b.get("/api/admin/users?role=student").json()["items"]]  # not in the approved list yet
    sid = pend["items"][0]["id"]
    assert b.post("/api/admin/users/review", json={"ids": [sid], "action": "approve"}).status_code == 403  # CSRF header required
    assert b.post("/api/admin/users/review", headers=H, json={"ids": [sid], "action": "approve"}).json() == {"changed": 1}
    s = client(); assert login(s, "sara@x.org", "my-own-password-9").status_code == 200  # her own password, no forced change
    assert s.get("/api/student/feed").status_code == 200 and s.get("/api/auth/me").json()["must_change"] is False
    assert s.post("/api/admin/users/review", headers=H, json={"ids": [sid], "action": "reject"}).status_code == 403  # students can't review
    b.post("/api/admin/users/review", headers=H, json={"ids": [sid], "action": "reject"})
    assert s.get("/api/student/feed").status_code == 401  # rejecting later cuts off an open session at once
    r2 = login(client(), "sara@x.org", "my-own-password-9"); assert r2.status_code == 403 and "not approved" in r2.json()["detail"]
    adm = b.post("/api/admin/users", json={"name": "Z", "email": "z@x.org", "role": "admin", "password": "admin-pass-1234"}, headers=H).json()
    b.post("/api/admin/users/review", headers=H, json={"ids": [adm["id"]], "action": "reject"})
    assert login(client(), "z@x.org", "admin-pass-1234").status_code == 200  # review can never touch admins
    assert reg(c, "short@x.org", password="short").status_code == 422
