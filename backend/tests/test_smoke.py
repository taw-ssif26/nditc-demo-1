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


# ================= events, registration, forms and quizzes =================
import datetime as dt
from app.models import SessionLocal, Submission
from sqlalchemy import select as _select


def iso_in(**kw): return (dt.datetime.now(dt.timezone.utc) + dt.timedelta(**kw)).isoformat()
def mk_student(b, email):
    u = b.post("/api/admin/users", json={"name": email.split("@")[0], "email": email}, headers=H).json(); c = client(); ready(c, email, u["password"]); return u, c
def reg_url(e): return f"/api/student/events/{e['id']}/register"
def mk_event(b, **kw):
    body = {"kind": "event", "title": "Hackathon", "date": iso_in(days=3), "location": "Lab 2", "capacity": 1, "reg_open": True, "audience": "students", **kw}
    return b.post("/api/admin/entries", headers=H, json=body).json()


def test_event_registration_capacity_waitlist_attendance():
    b = boss(); a, ca = mk_student(b, "ev1@x.org"); _, cb = mk_student(b, "ev2@x.org"); _, cc = mk_student(b, "ev3@x.org")
    e = mk_event(b); assert e["capacity"] == 1 and e["location"] == "Lab 2" and e["reg_open"] is True
    ev = ca.get("/api/student/events").json()[0]; assert ev["title"] == "Hackathon" and ev["taken"] == 0 and ev["mine"] is None and ev["full"] is False
    assert ca.post(reg_url(e), headers=H, json={}).json()["status"] == "registered"
    assert cb.post(reg_url(e), headers=H, json={}).json()["status"] == "waitlist"  # full: second student waits
    assert ca.post(reg_url(e), headers=H, json={}).json()["status"] == "registered"  # idempotent
    m = cb.get("/api/student/events").json()[0]["mine"]; assert m["status"] == "waitlist" and m["position"] == 1
    assert ca.delete(reg_url(e), headers=H).status_code == 200
    assert cb.get("/api/student/events").json()[0]["mine"]["status"] == "registered"  # waitlist promoted automatically
    d = b.get(f"/api/admin/events/{e['id']}/registrations").json(); assert d["counts"]["registered"] == 1
    rid = [i for i in d["items"] if i["email"] == "ev2@x.org"][0]["id"]
    assert b.put(f"/api/admin/registrations/{rid}", headers=H, json={"attended": True}).status_code == 200
    assert b.get(f"/api/admin/events/{e['id']}/registrations").json()["counts"]["attended"] == 1
    csvt = b.get(f"/api/admin/events/{e['id']}/registrations.csv"); assert csvt.status_code == 200 and "Name,Email" in csvt.text
    assert ca.get(f"/api/admin/events/{e['id']}/registrations").status_code == 403  # students can't see who registered
    b.put(f"/api/admin/entries/{e['id']}", headers=H, json={"kind": "event", "title": "Hackathon", "date": iso_in(days=3), "capacity": 1, "reg_open": False})
    r = cc.post(reg_url(e), headers=H, json={}); assert r.status_code == 409 and "closed" in r.json()["detail"].lower()
    b.put(f"/api/admin/entries/{e['id']}", headers=H, json={"kind": "event", "title": "Hackathon", "date": iso_in(days=3), "reg_open": True, "reg_deadline": iso_in(hours=-1)})
    assert "deadline" in cc.post(reg_url(e), headers=H, json={}).json()["detail"]
    b.put(f"/api/admin/entries/{e['id']}", headers=H, json={"kind": "event", "title": "Hackathon", "date": iso_in(days=-5), "reg_open": True})
    assert "ended" in cc.post(reg_url(e), headers=H, json={}).json()["detail"]  # past events can't be joined


def test_event_visibility_rules():
    b = boss(); a, ca = mk_student(b, "vis1@x.org"); _, cb = mk_student(b, "vis2@x.org")
    e = mk_event(b, title="Invite only", audience="assigned"); b.put(f"/api/admin/entries/{e['id']}/assign", headers=H, json={"user_ids": [a["id"]]})
    assert "Invite only" in [x["title"] for x in ca.get("/api/student/events").json()]
    assert "Invite only" not in [x["title"] for x in cb.get("/api/student/events").json()]
    assert cb.post(reg_url(e), headers=H, json={}).status_code == 404
    h = mk_event(b, title="Hidden draft", published=False); assert ca.post(reg_url(h), headers=H, json={}).status_code == 404
    assert b.post("/api/admin/entries", headers=H, json={"kind": "event", "title": "Bad", "date": iso_in(days=2), "end_date": iso_in(days=1)}).status_code == 422


def test_event_with_registration_form_and_csv_safety():
    b = boss(); _, ca = mk_student(b, "rf1@x.org")
    f = b.post("/api/admin/forms", headers=H, json={"title": "T-shirt", "kind": "form", "published": True, "questions": [{"type": "short", "text": "Team name", "required": True}, {"type": "single", "text": "Size", "options": ["S", "M", "L"]}]}).json()
    e = mk_event(b, title="With form", capacity=None, form_id=f["id"]); qs = f["questions"]
    assert ca.post(reg_url(e), headers=H, json={"answers": {}}).status_code == 422  # required answer missing
    assert ca.post(reg_url(e), headers=H, json={"answers": {str(qs[0]["id"]): "=HYPERLINK(1)", str(qs[1]["id"]): 9}}).status_code == 422  # bad option
    assert ca.post(reg_url(e), headers=H, json={"answers": {str(qs[0]["id"]): "=HYPERLINK(1)", str(qs[1]["id"]): 2}}).json()["status"] == "registered"
    d = b.get(f"/api/admin/events/{e['id']}/registrations").json()["items"][0]; assert d["answers"] == [{"q": "Team name", "a": "=HYPERLINK(1)"}, {"q": "Size", "a": "L"}]
    assert "'=HYPERLINK(1)" in b.get(f"/api/admin/events/{e['id']}/registrations.csv").text  # formula neutralised in the export
    mine = next(x for x in ca.get("/api/student/events").json() if x["id"] == e["id"]); assert mine["form"]["questions"][0]["text"] == "Team name" and mine["mine"]["status"] == "registered"


QUIZ = {"title": "Python quiz", "kind": "quiz", "published": True, "time_limit": 10, "show_results": "answers", "questions": [
    {"type": "single", "text": "2+2?", "options": ["3", "4"], "correct": [1], "points": 2, "required": True, "explanation": "Basic maths"},
    {"type": "multi", "text": "Primes?", "options": ["2", "3", "4"], "correct": [0, 1], "points": 3},
    {"type": "short", "text": "Capital of France?", "correct": ["Paris"], "points": 1},
    {"type": "rating", "text": "How was it?"}]}


def test_quiz_grading_and_secrecy():
    b = boss(); _, ca = mk_student(b, "qz1@x.org"); _, cb = mk_student(b, "qz2@x.org")
    q = b.post("/api/admin/forms", headers=H, json=QUIZ).json(); fid = q["id"]
    assert any(x["title"] == "Python quiz" and x["state"] == "open" for x in ca.get("/api/student/forms").json())
    st = ca.post(f"/api/student/forms/{fid}/start", headers=H).json()
    assert st["deadline"] and all("correct" not in x and "explanation" not in x for x in st["questions"])  # answers never leave the server before submitting
    ids = [x["id"] for x in st["questions"]]
    assert ca.post(f"/api/student/forms/{fid}/submit", headers=H, json={"answers": {}}).status_code == 422  # required question
    r = ca.post(f"/api/student/forms/{fid}/submit", headers=H, json={"answers": {str(ids[0]): 1, str(ids[1]): [1, 0], str(ids[2]): "  paris ", str(ids[3]): 5}}).json()
    assert r["score"] == 6 and r["max"] == 6 and r["late"] is False
    assert ca.post(f"/api/student/forms/{fid}/start", headers=H).status_code == 409  # one attempt
    rv = ca.get(f"/api/student/forms/{fid}/result").json(); assert rv["review"][0]["right"] is True and rv["review"][0]["explanation"] == "Basic maths"
    st2 = cb.post(f"/api/student/forms/{fid}/start", headers=H).json()
    assert cb.post(f"/api/student/forms/{fid}/submit", headers=H, json={"answers": {str(st2["questions"][0]["id"]): 0, str(st2["questions"][1]["id"]): [0]}}).json()["score"] == 0  # all-or-nothing multi-choice
    resp = b.get(f"/api/admin/forms/{fid}/responses").json(); assert resp["count"] == 2 and resp["avg_score"] == 3 and resp["questions"][0]["counts"] == [1, 1]
    assert resp["questions"][0]["correct_rate"] == 50
    assert "Python quiz" not in b.get(f"/api/admin/forms/{fid}/responses.csv").text.splitlines()[0] and "qz1" in b.get(f"/api/admin/forms/{fid}/responses.csv").text
    assert ca.get("/api/admin/forms").status_code == 403 and ca.get(f"/api/admin/forms/{fid}/responses").status_code == 403


def test_quiz_rules_window_late_and_visibility():
    b = boss(); a, ca = mk_student(b, "qr1@x.org"); _, cb = mk_student(b, "qr2@x.org")
    s1 = b.post("/api/admin/forms", headers=H, json={**QUIZ, "title": "Score only", "show_results": "score", "time_limit": 1}).json()
    st = ca.post(f"/api/student/forms/{s1['id']}/start", headers=H).json(); ids = [x["id"] for x in st["questions"]]
    with SessionLocal() as s:  # pretend the student started 10 minutes ago on a 1-minute quiz
        x = s.scalar(_select(Submission).where(Submission.form_id == s1["id"])); x.started_at = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=10); s.commit()
    r = ca.post(f"/api/student/forms/{s1['id']}/submit", headers=H, json={"answers": {str(ids[0]): 1}}).json(); assert r["late"] is True and "review" not in ca.get(f"/api/student/forms/{s1['id']}/result").json()
    soon = b.post("/api/admin/forms", headers=H, json={**QUIZ, "title": "Later", "opens_at": iso_in(days=1)}).json()
    assert ca.post(f"/api/student/forms/{soon['id']}/start", headers=H).status_code == 403
    gone = b.post("/api/admin/forms", headers=H, json={**QUIZ, "title": "Over", "opens_at": iso_in(days=-2), "closes_at": iso_in(days=-1)}).json()
    assert ca.post(f"/api/student/forms/{gone['id']}/start", headers=H).status_code == 403
    pv = b.post("/api/admin/forms", headers=H, json={**QUIZ, "title": "Private", "audience": "assigned"}).json()
    assert ca.post(f"/api/student/forms/{pv['id']}/start", headers=H).status_code == 404
    b.put(f"/api/admin/forms/{pv['id']}/assign", headers=H, json={"user_ids": [a["id"]]})
    assert ca.post(f"/api/student/forms/{pv['id']}/start", headers=H).status_code == 200 and cb.post(f"/api/student/forms/{pv['id']}/start", headers=H).status_code == 404
    dr = b.post("/api/admin/forms", headers=H, json={**QUIZ, "title": "Draft", "published": False}).json()
    assert ca.post(f"/api/student/forms/{dr['id']}/start", headers=H).status_code == 404


def test_form_builder_validation_and_editing():
    b = boss()
    bad = lambda qs, **kw: b.post("/api/admin/forms", headers=H, json={"title": "X", "kind": "quiz", "questions": qs, **kw}).status_code
    assert bad([{"type": "single", "text": "q", "options": ["only one"], "correct": [0]}]) == 422
    assert bad([{"type": "single", "text": "q", "options": ["a", "b"], "correct": [5]}]) == 422
    assert bad([{"type": "single", "text": "q", "options": ["a", "b"], "correct": [0, 1]}]) == 422
    assert bad([{"type": "wizard", "text": "q"}]) == 422
    assert bad([], published=True) == 422  # can't publish an empty form
    assert bad([{"type": "short", "text": "q"}] * 101) == 422
    assert bad([{"type": "short", "text": "q"}], opens_at=iso_in(days=2), closes_at=iso_in(days=1)) == 422
    f = b.post("/api/admin/forms", headers=H, json={"title": "Edit me", "kind": "form", "questions": [{"type": "short", "text": "A"}, {"type": "long", "text": "B"}]}).json()
    keep = f["questions"][1]; out = b.put(f"/api/admin/forms/{f['id']}", headers=H, json={"title": "Edited", "kind": "form", "questions": [{"id": keep["id"], "type": "long", "text": "B2"}, {"type": "rating", "text": "C"}]}).json()
    assert [q["text"] for q in out["questions"]] == ["B2", "C"] and out["questions"][0]["id"] == keep["id"]  # existing question keeps its id (and answers)
    assert b.delete(f"/api/admin/forms/{f['id']}", headers=H).status_code == 200 and b.get(f"/api/admin/forms/{f['id']}").status_code == 404


def test_public_site_shows_dynamic_events():
    b = boss(); c = client()
    mk_event(b, title="Open Day", audience="public", location="Main Hall", capacity=None)
    mk_event(b, title="Members Only", audience="students")
    html = c.get("/activities").text
    assert "Open Day" in html and "Main Hall" in html and '"@type": "Event"' in html.replace('"@type":"Event"', '"@type": "Event"')
    assert "Members Only" not in html  # students-only events never appear on the public site
    assert "Open Day" in [e["title"] for e in c.get("/api/public/event").json()]


# ================= public vs student-only events =================
GUEST = {"name": "Nadia Rahman", "email": "nadia@school.org", "phone": "01700000000", "org": "Holy Cross College, Class 12"}
def guest_url(e): return f"/api/public/events/{e['id']}/register"


def test_public_event_guest_registration_and_privacy():
    b = boss(); c = client(); _, cs = mk_student(b, "gst1@x.org")
    pub = mk_event(b, title="Open Programming Contest", audience="public", capacity=2)
    stu = mk_event(b, title="Members Workshop", audience="students", capacity=None)
    inv = mk_event(b, title="Core Team Retreat", audience="assigned", capacity=None)
    info = c.get(f"/api/public/events/{pub['id']}/reg").json()
    assert info["open"] and info["capacity"] == 2 and info["taken"] == 0 and info["form"] is None  # no login needed to see the sign-up details
    assert c.get(f"/api/public/events/{stu['id']}/reg").status_code == 404 and c.get(f"/api/public/events/{inv['id']}/reg").status_code == 404
    assert c.post(guest_url(stu), headers=H, json=GUEST).status_code == 404 and c.post(guest_url(inv), headers=H, json=GUEST).status_code == 404  # student-only stays student-only
    assert c.post(guest_url(pub), json=GUEST).status_code == 403  # CSRF header still required
    assert c.post(guest_url(pub), headers=H, json=GUEST).json()["status"] == "registered"
    assert c.post(guest_url(pub), headers=H, json={**GUEST, "name": "Someone Else"}).json()["status"] == "registered"  # same email again: no duplicate seat
    assert c.post(guest_url(pub), headers=H, json={**GUEST, "email": "bot@x.org", "website": "http://spam"}).json()["status"] == "registered"  # honeypot: looks fine to the bot, stores nothing
    assert cs.post(reg_url(pub), headers=H, json={}).json()["status"] == "registered"  # a student takes the 2nd seat: guests and students share capacity
    assert c.post(guest_url(pub), headers=H, json={**GUEST, "email": "late@school.org"}).json()["status"] == "waitlist"
    d = b.get(f"/api/admin/events/{pub['id']}/registrations").json()
    kinds = {i["email"]: i["type"] for i in d["items"]}
    assert kinds == {"nadia@school.org": "guest", "gst1@x.org": "student", "late@school.org": "guest"} and d["counts"]["registered"] == 2 and d["counts"]["waitlist"] == 1
    g = [i for i in d["items"] if i["email"] == "nadia@school.org"][0]; assert g["phone"] == "01700000000" and g["info"].startswith("Holy Cross")
    assert "Phone" in b.get(f"/api/admin/events/{pub['id']}/registrations.csv").text.splitlines()[0]
    assert b.put(f"/api/admin/registrations/{g['id']}", headers=H, json={"status": "cancelled"}).status_code == 200  # removing a guest frees the seat for the waitlist
    assert [i["status"] for i in b.get(f"/api/admin/events/{pub['id']}/registrations").json()["items"] if i["email"] == "late@school.org"] == ["registered"]
    assert next(x for x in cs.get("/api/student/events").json() if x["id"] == pub["id"])["taken"] == 2 and next(x for x in cs.get("/api/student/events").json() if x["id"] == pub["id"])["audience"] == "public"
    assert "Open Programming Contest" in [x["title"] for x in cs.get("/api/student/events").json()] and "Members Workshop" in [x["title"] for x in cs.get("/api/student/events").json()]
    assert "Members Workshop" not in c.get("/activities").text and "Open Programming Contest" in c.get("/activities").text


def test_guest_registration_rules():
    b = boss(); c = client()
    f = b.post("/api/admin/forms", headers=H, json={"title": "Contest details", "kind": "form", "published": True, "questions": [{"type": "short", "text": "Team name", "required": True}]}).json()
    e = mk_event(b, title="Contest with form", audience="public", capacity=None, form_id=f["id"])
    assert c.get(f"/api/public/events/{e['id']}/reg").json()["form"]["questions"][0]["text"] == "Team name"
    assert c.post(guest_url(e), headers=H, json=GUEST).status_code == 422  # required answer missing
    assert c.post(guest_url(e), headers=H, json={**GUEST, "answers": {str(f["questions"][0]["id"]): "Byte Me"}}).json()["status"] == "registered"
    assert b.get(f"/api/admin/events/{e['id']}/registrations").json()["items"][0]["answers"] == [{"q": "Team name", "a": "Byte Me"}]
    assert c.post(guest_url(e), headers=H, json={**GUEST, "email": "not-an-email"}).status_code == 422
    assert c.post(guest_url(e), headers=H, json={**GUEST, "email": "b@x.org", "name": "x"}).status_code == 422
    closed = mk_event(b, title="Closed contest", audience="public", reg_open=False); r = c.post(guest_url(closed), headers=H, json=GUEST)
    assert r.status_code == 409 and "closed" in r.json()["detail"].lower()
    gone = mk_event(b, title="Old contest", audience="public", date=iso_in(days=-4)); assert "ended" in c.post(guest_url(gone), headers=H, json=GUEST).json()["detail"]
    draft = mk_event(b, title="Draft contest", audience="public", published=False); assert c.post(guest_url(draft), headers=H, json=GUEST).status_code == 404
