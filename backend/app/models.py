import os, datetime as dt
from sqlalchemy import create_engine, String, Text, DateTime, ForeignKey, Table, Column, Index, MetaData, JSON, Float, UniqueConstraint, false, true
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

URL = os.environ.get("DATABASE_URL", "sqlite:///./dev.db")
for _p in ("postgres://", "postgresql://"):  # accept the string exactly as Neon/Supabase show it
    if URL.startswith(_p): URL = "postgresql+psycopg://" + URL[len(_p):]
POOL = int(os.environ.get("DB_POOL", "10"))  # keep small on free hosts: their databases allow few connections
# pool_recycle: drop connections before a serverless database suspends them; prepare_threshold=None: safe behind pgbouncer-style poolers (Neon, Supabase)
kw = {} if URL.startswith("sqlite") else dict(pool_size=POOL, max_overflow=POOL, pool_pre_ping=True, pool_recycle=240, connect_args={"prepare_threshold": None})
engine = create_engine(URL, **kw)
SessionLocal = sessionmaker(engine, expire_on_commit=False)
now = lambda: dt.datetime.now(dt.timezone.utc)


NAMING = {"ix": "ix_%(column_0_label)s", "uq": "uq_%(table_name)s_%(column_0_name)s", "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s", "pk": "pk_%(table_name)s"}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)  # named constraints keep future migrations clean on SQLite and Postgres


assign = Table("assign", Base.metadata,
    Column("entry_id", ForeignKey("entries.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True))


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(10))  # student | admin | super
    pw: Mapped[str] = mapped_column(String(255))
    pv: Mapped[int] = mapped_column(default=0)  # bumped on password change: invalidates every older session cookie
    must_change: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(10), default="approved", server_default="approved")  # pending | approved | rejected
    info: Mapped[str] = mapped_column(String(200), default="", server_default="")  # class/roll the student gives so admins can verify them
    totp: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_on: Mapped[bool] = mapped_column(default=False)
    fails: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    active: Mapped[bool] = mapped_column(default=True)
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
    regs = relationship("Registration", cascade="all, delete-orphan", foreign_keys="Registration.user_id")
    subs = relationship("Submission", cascade="all, delete-orphan", foreign_keys="Submission.user_id")


class Entry(Base):
    """One table for every kind of content: departments, events, sessions, notices, resources..."""
    __tablename__ = "entries"
    __table_args__ = (Index("ix_entries_list", "kind", "audience", "published"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(300))
    body: Mapped[str] = mapped_column(Text, default="")
    image: Mapped[str] = mapped_column(String(300), default="")
    link: Mapped[str] = mapped_column(String(500), default="")
    date: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    audience: Mapped[str] = mapped_column(String(10), default="public")  # public | students | assigned
    published: Mapped[bool] = mapped_column(default=True)
    position: Mapped[int] = mapped_column(default=0)
    # event-only fields
    location: Mapped[str] = mapped_column(String(200), default="", server_default="")
    end_date: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    capacity: Mapped[int | None] = mapped_column(nullable=True)
    reg_open: Mapped[bool] = mapped_column(default=False, server_default=false())
    reg_deadline: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    form_id: Mapped[int | None] = mapped_column(ForeignKey("forms.id", ondelete="SET NULL"), nullable=True)
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
    regs = relationship("Registration", cascade="all, delete-orphan", foreign_keys="Registration.event_id")
    event_subs = relationship("Submission", cascade="all, delete-orphan", foreign_keys="Submission.event_id")
    users = relationship("User", secondary=assign)
    files = relationship("FileRec", cascade="all, delete-orphan")


class FileRec(Base):
    __tablename__ = "files"
    id: Mapped[int] = mapped_column(primary_key=True)
    entry_id: Mapped[int | None] = mapped_column(ForeignKey("entries.id", ondelete="CASCADE"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(150))
    stored: Mapped[str] = mapped_column(String(80))
    mime: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(default=0)
    public: Mapped[bool] = mapped_column(default=False)


class Audit(Base):
    __tablename__ = "audit"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(index=True)
    action: Mapped[str] = mapped_column(String(300))
    at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)


form_users = Table("form_users", Base.metadata,
    Column("form_id", ForeignKey("forms.id", ondelete="CASCADE"), primary_key=True),
    Column("user_id", ForeignKey("users.id", ondelete="CASCADE"), primary_key=True))


class Form(Base):
    """A survey/registration form (kind=form) or a graded quiz (kind=quiz), built by admins in the dashboard."""
    __tablename__ = "forms"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(8), default="form")  # form | quiz
    audience: Mapped[str] = mapped_column(String(10), default="students")  # students | assigned
    published: Mapped[bool] = mapped_column(default=False, server_default=false())
    opens_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closes_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_limit: Mapped[int | None] = mapped_column(nullable=True)  # minutes, quizzes only
    show_results: Mapped[str] = mapped_column(String(8), default="score")  # none | score | answers
    one_response: Mapped[bool] = mapped_column(default=True, server_default=true())
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
    questions = relationship("Question", cascade="all, delete-orphan", order_by="Question.position")
    subs = relationship("Submission", cascade="all, delete-orphan", foreign_keys="Submission.form_id")
    users = relationship("User", secondary=form_users)


class Question(Base):
    __tablename__ = "questions"
    id: Mapped[int] = mapped_column(primary_key=True)
    form_id: Mapped[int] = mapped_column(ForeignKey("forms.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(default=0)
    type: Mapped[str] = mapped_column(String(10))  # short | long | single | multi | rating | number
    text: Mapped[str] = mapped_column(String(500))
    required: Mapped[bool] = mapped_column(default=False, server_default=false())
    options: Mapped[list] = mapped_column(JSON, default=list)
    correct: Mapped[list] = mapped_column(JSON, default=list)  # option indexes (choice) or accepted answers (short/number)
    points: Mapped[int] = mapped_column(default=0, server_default="0")
    explanation: Mapped[str] = mapped_column(String(500), default="", server_default="")


class Submission(Base):
    __tablename__ = "submissions"
    id: Mapped[int] = mapped_column(primary_key=True)
    form_id: Mapped[int] = mapped_column(ForeignKey("forms.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("entries.id", ondelete="CASCADE"), nullable=True, index=True)
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
    submitted_at: Mapped[dt.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    late: Mapped[bool] = mapped_column(default=False, server_default=false())


class Registration(Base):
    __tablename__ = "registrations"
    __table_args__ = (UniqueConstraint("event_id", "user_id"), UniqueConstraint("event_id", "guest_email", name="uq_registrations_event_guest"))
    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("entries.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)  # empty for guests on public events
    guest_name: Mapped[str] = mapped_column(String(120), default="", server_default="")
    guest_email: Mapped[str | None] = mapped_column(String(254), nullable=True)
    guest_phone: Mapped[str] = mapped_column(String(40), default="", server_default="")
    guest_org: Mapped[str] = mapped_column(String(160), default="", server_default="")
    answers: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # a guest's answers to the event's form (students use Submission)
    status: Mapped[str] = mapped_column(String(10), default="registered")  # registered | waitlist | cancelled
    attended: Mapped[bool] = mapped_column(default=False, server_default=false())
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
    submission_id: Mapped[int | None] = mapped_column(ForeignKey("submissions.id", ondelete="SET NULL"), nullable=True)
