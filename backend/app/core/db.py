"""Database bootstrap (SQLAlchemy 2.x).

The default deployment uses SQLite for zero-config local runs; point
``COOLPATH_DATABASE_URL`` at PostgreSQL (e.g. the bundled PostGIS container)
for production-style deployments.  All spatial computation happens in
Python/Shapely so the data layer stays portable across both engines.
"""
from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import Settings


class Base(DeclarativeBase):
    pass


def make_engine(database_url: str):
    kwargs: dict = {"pool_pre_ping": True}
    if database_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
    return create_engine(database_url, **kwargs)


class Database:
    def __init__(self, settings: Settings) -> None:
        self.engine = make_engine(settings.database_url)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, expire_on_commit=False)
        if self.engine.url.get_backend_name() == "sqlite":
            url_path = self.engine.url.database or ""
            if url_path and url_path != ":memory:":
                from pathlib import Path

                Path(url_path).parent.mkdir(parents=True, exist_ok=True)

    def create_all(self) -> None:
        from app.models import hazard  # noqa: F401  (register mappers)

        Base.metadata.create_all(self.engine)

    def session(self) -> Session:
        return self.session_factory()


def get_db(db: Database) -> Iterator[Session]:
    session = db.session()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
