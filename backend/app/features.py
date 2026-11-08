"""Events with registration, plus a no-code form and quiz builder. Imported by main.py (never import this module directly)."""
import io, csv, re, datetime as dt
from typing import Any
import os
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, EmailStr, Field, model_validator
from sqlalchemy import select, func, or_, and_, update
from sqlalchemy.orm import Session, selectinload
from .models import User, Entry, Form, Question, Submission, Registration
from .main import db, ADMIN, ANY, log, aware, limiter

router = APIRouter()
UTC = dt.timezone.utc


def now(): return dt.datetime.now(UTC)
def iso(d): return aware(d).isoformat() if d else None
def norm(x): return " ".join(str(x).split()).casefold()


# ---------- schemas ----------
class QIn(BaseModel):
    id: int | None = None
    type: str = Field(pattern="^(short|long|single|multi|rating|number)$")
    text: str = Field(min_length=1, max_length=500)
    required: bool = False
    options: list[str] = Field(default_factory=list, max_length=20)
    correct: list[int | str] = Field(default_factory=list, max_length=20)
    points: int = Field(0, ge=0, le=100)
    explanation: str = Field("", max_length=500)

    @model_validator(mode="after")
    def _ok(self):
        self.options = [o.strip()[:200] for o in self.options if o and o.strip()]
        if self.type in ("single", "multi"):
            if len(self.options) < 2: raise ValueError("Choice questions need at least 2 options")
            if any(isinstance(c, bool) or not isinstance(c, int) or not 0 <= c < len(self.options) for c in self.correct):
                raise ValueError("The correct answer must be one of the options")
            self.correct = sorted(set(self.correct))
            if self.type == "single" and len(self.correct) > 1: raise ValueError("A single-choice question can have only one correct answer")
        elif self.type in ("short", "number"):
            self.options = []; self.correct = [str(c).strip()[:200] for c in self.correct if str(c).strip()]
        else:
            self.options, self.correct, self.points = [], [], 0
        return self


class FormIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=5000)
    kind: str = Field("form", pattern="^(form|quiz)$")
    audience: str = Field("students", pattern="^(students|assigned)$")
    published: bool = False
    opens_at: dt.datetime | None = None
    closes_at: dt.datetime | None = None
    time_limit: int | None = Field(None, ge=1, le=600)
    show_results: str = Field("score", pattern="^(none|score|answers)$")
    one_response: bool = True
    questions: list[QIn] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _ok(self):
        for k in ("opens_at", "closes_at"):
            v = getattr(self, k)
            if v is not None: setattr(self, k, v.astimezone(UTC) if v.tzinfo else v.replace(tzinfo=UTC))
        if self.opens_at and self.closes_at and self.closes_at <= self.opens_at: raise ValueError("Closing time must be after opening time")
        if self.kind == "form":
            self.time_limit = None; self.show_results = "none"
            for q in self.questions: q.points, q.correct, q.explanation = 0, [], ""
        if self.published and not self.questions: raise ValueError("Add at least one question before publishing")
        return self


# ---------- helpers ----------
def q_out(q, reveal=False):
    d = {"id": q.id, "type": q.type, "text": q.text, "required": q.required, "options": q.options or [], "points": q.points}
    if reveal: d.update(correct=q.correct or [], explanation=q.explanation)
    return d


def f_out(f, reveal=False, full=True):
    d = {"id": f.id, "title": f.title, "description": f.description, "kind": f.kind, "audience": f.audience, "published": f.published,
         "opens_at": iso(f.opens_at), "closes_at": iso(f.closes_at), "time_limit": f.time_limit, "show_results": f.show_results, "one_response": f.one_response}
    if full: d["questions"] = [q_out(q, reveal) for q in f.questions]
    return d


def fstate(f):
    n = now()
    if f.opens_at and aware(f.opens_at) > n: return "upcoming"
    if f.closes_at and aware(f.closes_at) < n: return "closed"
    return "open"


def form_for(s, u, fid):
    f = s.get(Form, fid)
    if not f or not f.published or not (f.audience == "students" or u in f.users): raise HTTPException(404, "Not found")
    return f


def clean(f, raw, partial=False):
    """Validate a student's answers against the form's questions. Raises 422 naming the question that is wrong."""
    out = {}
    for q in f.questions:
        v = raw.get(str(q.id))
        if isinstance(v, str): v = v.strip()
        if v is None or v == "" or v == []:
            if q.required and not partial: raise HTTPException(422, f'Please answer: "{q.text[:70]}"')
            continue
        bad = HTTPException(422, f'Invalid answer for: "{q.text[:70]}"')
        if q.type in ("short", "long"):
            if not isinstance(v, str) or len(v) > (5000 if q.type == "long" else 500): raise bad
        elif q.type == "number":
            try: v = float(v)
            except (TypeError, ValueError): raise bad
            if isinstance(raw.get(str(q.id)), bool) or v != v or v in (float("inf"), float("-inf")): raise bad
        elif q.type == "rating":
            if isinstance(v, bool) or not isinstance(v, int) or not 1 <= v <= 5: raise bad
        elif q.type == "single":
            if isinstance(v, bool) or not isinstance(v, int) or not 0 <= v < len(q.options): raise bad
        elif q.type == "multi":
            if not isinstance(v, list) or len(set(v)) != len(v) or any(isinstance(i, bool) or not isinstance(i, int) or not 0 <= i < len(q.options) for i in v): raise bad
        out[str(q.id)] = v
    return out


def right(q, v):
    if v is None: return False
    if q.type == "single": return [v] == list(q.correct or [])
    if q.type == "multi": return sorted(v) == sorted(q.correct or [])
    if q.type == "short": return norm(v) in {norm(c) for c in (q.correct or [])}
    if q.type == "number":
        try: return any(abs(float(v) - float(c)) < 1e-9 for c in (q.correct or []))
        except (TypeError, ValueError): return False
    return False


def grade(f, ans):
    got = mx = 0
    for q in f.questions:
        mx += q.points or 0
        if q.points and right(q, ans.get(str(q.id))): got += q.points
    return got, mx


def show(q, v):
    try:
        if v is None: return ""
        if q.type == "single": return q.options[v]
        if q.type == "multi": return ", ".join(q.options[i] for i in v)
    except (IndexError, TypeError): return ""
    return str(v)


def readable(f, ans): return [{"q": q.text, "a": show(q, (ans or {}).get(str(q.id)))} for q in f.questions]


def cell(v):  # stop spreadsheet formula injection in exports
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@", "\t", "\r") else v


def csv_response(rows, name):
    buf = io.StringIO(); w = csv.writer(buf)
    for r in rows: w.writerow([cell(x) for x in r])
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", name)[:60] or "export"
    return Response("\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{safe}.csv"'})


# ---------- student: forms & quizzes ----------
@router.get("/api/student/forms")
def my_forms(u=Depends(ANY), s: Session = Depends(db)):
    rows = s.scalars(select(Form).options(selectinload(Form.questions)).where(Form.published.is_(True), or_(Form.audience == "students", Form.users.any(User.id == u.id)))
                     .order_by(Form.id.desc()).limit(200)).all()
    done = {}
    for x in s.scalars(select(Submission).where(Submission.user_id == u.id, Submission.event_id.is_(None), Submission.submitted_at.isnot(None)).order_by(Submission.id)): done[x.form_id] = x
    out = []
    for f in rows:
        d = f_out(f, full=False); x = done.get(f.id)
        d.update(state=fstate(f), done=bool(x), questions=len(f.questions))
        if x and f.kind == "quiz" and f.show_results != "none" and x.max_score: d.update(score=x.score, max=x.max_score)
        out.append(d)
    return out


def open_sub(s, u, f):
    return s.scalar(select(Submission).where(Submission.form_id == f.id, Submission.user_id == u.id, Submission.event_id.is_(None), Submission.submitted_at.is_(None)).order_by(Submission.id.desc()))


@router.post("/api/student/forms/{fid}/start")
def start(fid: int, u=Depends(ANY), s: Session = Depends(db)):
    f = form_for(s, u, fid)
    if fstate(f) != "open": raise HTTPException(403, "This is not open right now")
    if f.one_response and s.scalar(select(Submission.id).where(Submission.form_id == f.id, Submission.user_id == u.id, Submission.event_id.is_(None), Submission.submitted_at.isnot(None)).limit(1)):
        raise HTTPException(409, "You have already submitted this")
    sub = open_sub(s, u, f)
    if not sub: sub = Submission(form_id=f.id, user_id=u.id, answers={}, started_at=now()); s.add(sub); s.commit()
    dl = aware(sub.started_at) + dt.timedelta(minutes=f.time_limit) if f.time_limit else None
    return {"form": f_out(f, full=False), "questions": [q_out(q) for q in f.questions], "deadline": iso(dl)}  # never includes correct answers


class SubmitIn(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict, max_length=200)
    partial: bool = False  # set by the browser when the timer runs out


@router.post("/api/student/forms/{fid}/submit")
def submit(fid: int, b: SubmitIn, u=Depends(ANY), s: Session = Depends(db)):
    f = form_for(s, u, fid)
    if f.closes_at and aware(f.closes_at) + dt.timedelta(minutes=10) < now(): raise HTTPException(403, "This has closed")
    sub = open_sub(s, u, f)
    if not sub: raise HTTPException(409, "Start it first (or you already submitted)")
    ans = clean(f, b.answers, partial=b.partial and bool(f.time_limit))
    sub.late = bool(f.time_limit and now() > aware(sub.started_at) + dt.timedelta(minutes=f.time_limit, seconds=30))
    sub.answers, sub.submitted_at = ans, now()
    if f.kind == "quiz": sub.score, sub.max_score = grade(f, ans)
    s.commit()
    d = {"ok": True, "late": sub.late}
    if f.kind == "quiz" and f.show_results != "none": d.update(score=sub.score, max=sub.max_score)
    return d


@router.get("/api/student/forms/{fid}/result")
def my_result(fid: int, u=Depends(ANY), s: Session = Depends(db)):
    f = form_for(s, u, fid)
    x = s.scalar(select(Submission).where(Submission.form_id == f.id, Submission.user_id == u.id, Submission.event_id.is_(None), Submission.submitted_at.isnot(None)).order_by(Submission.id.desc()))
    if not x: raise HTTPException(404, "Not found")
    d = {"kind": f.kind, "show": f.show_results, "late": x.late, "submitted_at": iso(x.submitted_at)}
    if f.kind == "quiz" and f.show_results != "none": d.update(score=x.score, max=x.max_score)
    if f.kind == "quiz" and f.show_results == "answers":
        d["review"] = [{"q": q.text, "yours": show(q, x.answers.get(str(q.id))), "right": right(q, x.answers.get(str(q.id))) if q.points else None, "points": q.points,
                        "correct": (", ".join(q.options[i] for i in q.correct) if q.type in ("single", "multi") else " / ".join(map(str, q.correct or []))), "explanation": q.explanation} for q in f.questions]
    return d


# ---------- student: events ----------
def event_q(u):
    return select(Entry).where(Entry.kind == "event", Entry.published.is_(True), or_(Entry.audience.in_(("public", "students")), and_(Entry.audience == "assigned", Entry.users.any(User.id == u.id))))


def event_or_404(s, u, eid, lock=False):
    q = event_q(u).where(Entry.id == eid)
    e = s.scalar(q.with_for_update() if lock else q)
    if not e: raise HTTPException(404, "Not found")
    return e


def ev_over(e):
    end = e.end_date or (aware(e.date) + dt.timedelta(hours=24) if e.date else None)
    return bool(end and aware(end) < now())


def why_not(e):
    if not e.reg_open: return "Registration is closed"
    if e.reg_deadline and aware(e.reg_deadline) < now(): return "The registration deadline has passed"
    if ev_over(e): return "This event has ended"
    return ""


def taken(s, eid): return s.scalar(select(func.count()).select_from(Registration).where(Registration.event_id == eid, Registration.status == "registered")) or 0


def promote(s, e):
    while e.capacity is None or taken(s, e.id) < e.capacity:
        nxt = s.scalar(select(Registration).where(Registration.event_id == e.id, Registration.status == "waitlist").order_by(Registration.created, Registration.id))
        if not nxt: break
        nxt.status = "registered"; s.flush()


@router.get("/api/student/events")
def my_events(u=Depends(ANY), s: Session = Depends(db)):
    rows = s.scalars(event_q(u).order_by(Entry.date.asc().nullslast(), Entry.id).limit(200)).all()
    ids = [e.id for e in rows]
    cnt = dict(s.execute(select(Registration.event_id, func.count()).where(Registration.event_id.in_(ids), Registration.status == "registered").group_by(Registration.event_id)).all()) if ids else {}
    mine = {r.event_id: r for r in s.scalars(select(Registration).where(Registration.user_id == u.id, Registration.event_id.in_(ids)))} if ids else {}
    forms = {f.id: f for f in s.scalars(select(Form).options(selectinload(Form.questions)).where(Form.id.in_([e.form_id for e in rows if e.form_id])))} if any(e.form_id for e in rows) else {}
    out = []
    for e in rows:
        r = mine.get(e.id); st = r.status if r else None
        d = {"id": e.id, "title": e.title, "body": e.body, "image": e.image, "link": e.link, "date": iso(e.date), "end_date": iso(e.end_date), "location": e.location,
             "capacity": e.capacity, "taken": cnt.get(e.id, 0), "reg_open": e.reg_open, "reg_deadline": iso(e.reg_deadline), "over": ev_over(e),
             "audience": e.audience, "mine": {"status": st, "attended": r.attended} if st in ("registered", "waitlist") else None, "closed_reason": why_not(e),
             "full": e.capacity is not None and cnt.get(e.id, 0) >= e.capacity}
        if st == "waitlist": d["mine"]["position"] = 1 + s.scalar(select(func.count()).select_from(Registration).where(Registration.event_id == e.id, Registration.status == "waitlist", Registration.created < r.created))
        f = forms.get(e.form_id)
        if f: d["form"] = f_out(f)
        out.append(d)
    return out


class RegIn(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict, max_length=200)


@router.post("/api/student/events/{eid}/register")
def register(eid: int, b: RegIn, u=Depends(ANY), s: Session = Depends(db)):
    e = event_or_404(s, u, eid, lock=True)  # row lock: two students can't take the last seat at once
    r = s.scalar(select(Registration).where(Registration.event_id == eid, Registration.user_id == u.id))
    if r and r.status in ("registered", "waitlist"): return {"status": r.status}
    if why_not(e): raise HTTPException(409, why_not(e))
    f = s.get(Form, e.form_id) if e.form_id else None
    ans = clean(f, b.answers) if f else None
    status = "registered" if e.capacity is None or taken(s, eid) < e.capacity else "waitlist"
    if not r: r = Registration(event_id=eid, user_id=u.id); s.add(r)
    r.status, r.created, r.attended = status, now(), False
    if f:
        sub = Submission(form_id=f.id, user_id=u.id, event_id=eid, answers=ans, started_at=now(), submitted_at=now()); s.add(sub); s.flush()
        old, r.submission_id = r.submission_id, sub.id
        if old: s.execute(update(Registration).where(Registration.submission_id == old).values(submission_id=sub.id)); s.delete(s.get(Submission, old))
    s.commit()
    return {"status": status}


@router.delete("/api/student/events/{eid}/register")
def unregister(eid: int, u=Depends(ANY), s: Session = Depends(db)):
    e = event_or_404(s, u, eid, lock=True)
    r = s.scalar(select(Registration).where(Registration.event_id == eid, Registration.user_id == u.id))
    if not r or r.status == "cancelled": return {"ok": True}
    if ev_over(e): raise HTTPException(409, "This event has ended")
    was, r.status = r.status, "cancelled"; s.flush()
    if was == "registered": promote(s, e)
    s.commit()
    return {"ok": True}


# ---------- admin: event registrations ----------
def event_admin(s, eid):
    e = s.get(Entry, eid)
    if not e or e.kind != "event": raise HTTPException(404, "Not found")
    return e, (s.scalar(select(Form).options(selectinload(Form.questions)).where(Form.id == e.form_id)) if e.form_id else None)


def reg_rows(s, e, f):
    rows = s.execute(select(Registration, User).outerjoin(User, User.id == Registration.user_id).where(Registration.event_id == e.id).order_by(Registration.created, Registration.id)).all()
    subs = {x.id: x for x in s.scalars(select(Submission).where(Submission.event_id == e.id))}
    out = []
    for r, usr in rows:
        ans = r.answers if usr is None else (subs[r.submission_id].answers if r.submission_id in subs else None)
        out.append({"id": r.id, "type": "student" if usr else "guest", "name": usr.name if usr else r.guest_name, "email": usr.email if usr else r.guest_email,
                    "info": usr.info if usr else r.guest_org, "phone": r.guest_phone if not usr else "", "status": r.status, "attended": r.attended, "created": iso(r.created),
                    "answers": readable(f, ans) if f and ans is not None else []})
    return out


@router.get("/api/admin/events/{eid}/registrations")
def a_regs(eid: int, u=Depends(ADMIN), s: Session = Depends(db)):
    e, f = event_admin(s, eid); items = reg_rows(s, e, f)
    return {"event": {"id": e.id, "title": e.title, "capacity": e.capacity, "date": iso(e.date), "location": e.location}, "items": items,
            "counts": {"registered": sum(i["status"] == "registered" for i in items), "waitlist": sum(i["status"] == "waitlist" for i in items), "attended": sum(i["attended"] for i in items)}}


@router.get("/api/admin/events/{eid}/registrations.csv")
def a_regs_csv(eid: int, u=Depends(ADMIN), s: Session = Depends(db)):
    e, f = event_admin(s, eid); items = reg_rows(s, e, f)
    head = ["Name", "Email", "Phone", "Class / roll / institution", "Type", "Status", "Attended", "Registered at"] + ([q.text for q in f.questions] if f else [])
    rows = [head] + [[i["name"], i["email"], i["phone"], i["info"], i["type"], i["status"], "yes" if i["attended"] else "", i["created"]] + ([a["a"] for a in i["answers"]] if f else []) for i in items]
    return csv_response(rows, "registrations-" + e.title)


class RegEdit(BaseModel):
    attended: bool | None = None
    status: str | None = Field(None, pattern="^(registered|cancelled)$")


@router.put("/api/admin/registrations/{rid}")
def a_reg_edit(rid: int, b: RegEdit, u=Depends(ADMIN), s: Session = Depends(db)):
    r = s.get(Registration, rid)
    if not r: raise HTTPException(404, "Not found")
    e = s.scalar(select(Entry).where(Entry.id == r.event_id).with_for_update())
    if b.attended is not None: r.attended = b.attended
    if b.status:
        was, r.status = r.status, b.status; s.flush()
        if b.status == "cancelled" and was == "registered": promote(s, e)
    log(s, u, f"updated a registration for {e.title}"); s.commit()
    return {"ok": True}


# ---------- admin: form & quiz builder ----------
def apply_form(f, b):
    for k in ("title", "description", "kind", "audience", "published", "opens_at", "closes_at", "time_limit", "show_results", "one_response"): setattr(f, k, getattr(b, k))
    have = {q.id: q for q in f.questions}; keep = set()
    for i, qi in enumerate(b.questions):
        q = have.get(qi.id) if qi.id else None
        if q is None: q = Question(); f.questions.append(q)
        else: keep.add(q.id)
        q.position, q.type, q.text, q.required, q.options, q.correct, q.points, q.explanation = i, qi.type, qi.text, qi.required, qi.options, qi.correct, qi.points, qi.explanation
    for qid, q in have.items():
        if qid not in keep: f.questions.remove(q)


def form_admin(s, fid):
    f = s.scalar(select(Form).options(selectinload(Form.questions), selectinload(Form.users)).where(Form.id == fid))
    if not f: raise HTTPException(404, "Not found")
    return f


@router.get("/api/admin/forms")
def a_forms(u=Depends(ADMIN), s: Session = Depends(db)):
    rows = s.scalars(select(Form).options(selectinload(Form.questions)).order_by(Form.id.desc()).limit(300)).all()
    cnt = dict(s.execute(select(Submission.form_id, func.count()).where(Submission.submitted_at.isnot(None)).group_by(Submission.form_id)).all())
    return [{**f_out(f, full=False), "questions": len(f.questions), "responses": cnt.get(f.id, 0), "state": fstate(f)} for f in rows]


@router.get("/api/admin/forms/{fid}")
def a_form(fid: int, u=Depends(ADMIN), s: Session = Depends(db)):
    f = form_admin(s, fid); return {**f_out(f, reveal=True), "user_ids": [x.id for x in f.users]}


@router.post("/api/admin/forms")
def a_form_new(b: FormIn, u=Depends(ADMIN), s: Session = Depends(db)):
    f = Form(); apply_form(f, b); s.add(f); s.flush(); log(s, u, f"created {f.kind}: {f.title}"); s.commit()
    return f_out(f, reveal=True)


@router.put("/api/admin/forms/{fid}")
def a_form_edit(fid: int, b: FormIn, u=Depends(ADMIN), s: Session = Depends(db)):
    f = form_admin(s, fid); apply_form(f, b); log(s, u, f"edited {f.kind}: {f.title}"); s.commit()
    return f_out(f, reveal=True)


@router.delete("/api/admin/forms/{fid}")
def a_form_del(fid: int, u=Depends(ADMIN), s: Session = Depends(db)):
    f = form_admin(s, fid)
    s.execute(update(Entry).where(Entry.form_id == fid).values(form_id=None))
    log(s, u, f"deleted {f.kind}: {f.title}"); s.delete(f); s.commit()
    return {"ok": True}


class Assign(BaseModel):
    user_ids: list[int] = Field(max_length=2000)


@router.put("/api/admin/forms/{fid}/assign")
def a_form_assign(fid: int, b: Assign, u=Depends(ADMIN), s: Session = Depends(db)):
    f = form_admin(s, fid); f.users = list(s.scalars(select(User).where(User.id.in_(b.user_ids), User.role == "student")))
    log(s, u, f"assigned {len(f.users)} students to {f.title}"); s.commit()
    return {"ok": True}


def resp_rows(s, f):
    rows = s.execute(select(Submission, User).join(User, User.id == Submission.user_id).where(Submission.form_id == f.id, Submission.submitted_at.isnot(None)).order_by(Submission.submitted_at.desc()).limit(3000)).all()
    return [{"id": x.id, "name": usr.name, "email": usr.email, "info": usr.info, "at": iso(x.submitted_at), "score": x.score, "max": x.max_score, "late": x.late,
             "event_id": x.event_id, "answers": readable(f, x.answers), "raw": x.answers or {}} for x, usr in rows]


@router.get("/api/admin/forms/{fid}/responses")
def a_resp(fid: int, u=Depends(ADMIN), s: Session = Depends(db)):
    f = form_admin(s, fid); items = resp_rows(s, f)
    qs = []
    for q in f.questions:
        vals = [i["raw"].get(str(q.id)) for i in items if i["raw"].get(str(q.id)) is not None]
        d = {"id": q.id, "text": q.text, "type": q.type, "answered": len(vals)}
        if q.type in ("single", "multi"):
            c = [0] * len(q.options)
            for v in vals:
                for k in (v if isinstance(v, list) else [v]):
                    if isinstance(k, int) and 0 <= k < len(c): c[k] += 1
            d["options"], d["counts"] = q.options, c
        elif q.type in ("rating", "number") and vals: d["avg"] = round(sum(float(v) for v in vals) / len(vals), 2)
        if f.kind == "quiz" and q.points and items: d["correct_rate"] = round(sum(right(q, i["raw"].get(str(q.id))) for i in items) / len(items) * 100)
        qs.append(d)
    scored = [i["score"] for i in items if i["score"] is not None]
    for i in items: i.pop("raw")
    return {"form": f_out(f, full=False), "count": len(items), "avg_score": round(sum(scored) / len(scored), 2) if scored else None, "questions": qs, "items": items}


@router.get("/api/admin/forms/{fid}/responses.csv")
def a_resp_csv(fid: int, u=Depends(ADMIN), s: Session = Depends(db)):
    f = form_admin(s, fid); items = resp_rows(s, f)
    rows = [["Name", "Email", "Class / roll", "Submitted", "Score", "Out of", "Late"] + [q.text for q in f.questions]]
    rows += [[i["name"], i["email"], i["info"], i["at"], i["score"], i["max"], "yes" if i["late"] else ""] + [a["a"] for a in i["answers"]] for i in items]
    return csv_response(rows, "responses-" + f.title)


# ---------- public events: anyone can register, no account needed ----------
def public_event(s, eid, lock=False):
    q = select(Entry).where(Entry.id == eid, Entry.kind == "event", Entry.published.is_(True), Entry.audience == "public")  # student-only and invite-only events are never exposed here
    e = s.scalar(q.with_for_update() if lock else q)
    if not e: raise HTTPException(404, "Not found")
    return e


@router.get("/api/public/events/{eid}/reg")
def public_reg_info(eid: int, resp: Response, s: Session = Depends(db)):
    e = public_event(s, eid); resp.headers["Cache-Control"] = "no-store"
    f = s.scalar(select(Form).options(selectinload(Form.questions)).where(Form.id == e.form_id)) if e.form_id else None
    t = taken(s, eid)
    return {"id": e.id, "title": e.title, "date": iso(e.date), "location": e.location, "capacity": e.capacity, "taken": t, "full": e.capacity is not None and t >= e.capacity,
            "open": not why_not(e), "reason": why_not(e), "form": f_out(f) if f else None}


class GuestIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field("", max_length=40)
    org: str = Field("", max_length=160)  # school / college / class
    answers: dict[str, Any] = Field(default_factory=dict, max_length=200)
    website: str = Field("", max_length=200)  # honeypot: people never see it, bots fill it in


@router.post("/api/public/events/{eid}/register")
@limiter.limit(os.environ.get("GUEST_REG_LIMIT", "10/hour"))
def guest_register(request: Request, eid: int, b: GuestIn, s: Session = Depends(db)):
    if b.website: return {"status": "registered"}  # bot: pretend it worked, store nothing
    e = public_event(s, eid, lock=True)
    email = b.email.lower()
    r = s.scalar(select(Registration).where(Registration.event_id == eid, Registration.guest_email == email))
    if r and r.status in ("registered", "waitlist"): return {"status": r.status}
    if why_not(e): raise HTTPException(409, why_not(e))
    if (s.scalar(select(func.count()).select_from(Registration).where(Registration.event_id == eid)) or 0) >= 5000: raise HTTPException(503, "Registration is full. Please contact the club.")
    f = s.scalar(select(Form).options(selectinload(Form.questions)).where(Form.id == e.form_id)) if e.form_id else None
    ans = clean(f, b.answers) if f else None
    status = "registered" if e.capacity is None or taken(s, eid) < e.capacity else "waitlist"
    if not r: r = Registration(event_id=eid, user_id=None, guest_email=email); s.add(r)
    r.guest_name, r.guest_phone, r.guest_org, r.answers = b.name.strip(), b.phone.strip(), b.org.strip(), ans
    r.status, r.created, r.attended = status, now(), False
    s.commit()
    return {"status": status}
