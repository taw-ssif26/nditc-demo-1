import os, sys, json, pathlib, datetime as dt
from sqlalchemy import select
from .models import Base, engine, SessionLocal, User, Entry
from .security import ph


def run():
    if os.environ.get("AUTO_CREATE") == "1":  # tests/dev only; production schema comes from `alembic upgrade head`
        Base.metadata.create_all(engine)
    with SessionLocal() as s:
        if not s.scalar(select(User).where(User.role == "super")):
            pw = os.environ["SUPERADMIN_PASSWORD"]
            assert len(pw) >= 12, "SUPERADMIN_PASSWORD must be at least 12 characters"
            s.add(User(email=os.environ["SUPERADMIN_EMAIL"].lower(), name="Super Admin", role="super", pw=ph.hash(pw)))
        if not s.scalar(select(Entry.id).limit(1)):
            c = json.loads((pathlib.Path(__file__).parent / "seed_content.json").read_text())
            pos = {}
            def add(k, t, b="", d=None):
                pos[k] = pos.get(k, 0) + 1
                s.add(Entry(kind=k, title=t, body=b, date=d, position=pos[k]))
            for d in c["departments"]: add("department", d)
            for a in c["activities"]: add("activity", a["t"], a["d"])
            for a in c["why"]: add("why", a["t"], a["d"])
            add("project", c["project"]["name"], c["project"]["desc"])
            for n in ("HashTech", "Evya AI"): add("project", n, "Cloud-based research and development project.")
            for x in c["stats"]: add("stat", x[0], f"{x[1]}{x[2]}")
            for date, txt in c["timeline"]:
                add("timeline", txt or "(entry pending)", "", dt.datetime.strptime(date, "%d %b %Y").replace(tzinfo=dt.timezone.utc))
            for k in ("motto", "history", "objectives", "lead", "app", "email", "address", "copy"): add("page", k, c[k])
            add("page", "newsletter", c["news"]["d"])
        s.commit()


def reset2fa(email):  # lost authenticator: docker compose exec api python -m app.seed reset2fa you@example.com
    with SessionLocal() as s:
        u = s.scalar(select(User).where(User.email == email.lower()))
        if not u: sys.exit("no such user")
        u.totp, u.totp_on = None, False; s.commit(); print("2FA reset for", u.email)


if __name__ == "__main__":
    reset2fa(sys.argv[2]) if sys.argv[1:2] == ["reset2fa"] else run()
