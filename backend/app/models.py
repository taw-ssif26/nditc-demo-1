import os, datetime as dt
from sqlalchemy import create_engine, String, Text, DateTime, ForeignKey, Table, Column, Index
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


class Base(DeclarativeBase):
    pass


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
    created: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=now)
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
