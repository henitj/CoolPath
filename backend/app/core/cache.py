"""Small TTL cache with optional Redis backend.

Used for shadow-unions (per minute), active-hazard snapshots and satellite
status payloads.  Falls back to a plain in-process dict when no Redis URL is
configured so the app stays a single-container deployment.
"""
from __future__ import annotations

import json
import logging
import threading
import time
from typing import Any, Callable

logger = logging.getLogger(__name__)


class MemoryCache:
    def __init__(self) -> None:
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            item = self._store.get(key)
            if item is None:
                return None
            expires, value = item
            if expires < time.monotonic():
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any, ttl_s: float) -> None:
        with self._lock:
            self._store[key] = (time.monotonic() + ttl_s, value)

    def invalidate_prefix(self, prefix: str) -> None:
        with self._lock:
            for k in [k for k in self._store if k.startswith(prefix)]:
                self._store.pop(k, None)


class Cache:
    """JSON-serialisable cache facade (memory by default, Redis if configured)."""

    def __init__(self, redis_url: str | None = None) -> None:
        self._memory = MemoryCache()
        self._redis = None
        if redis_url:
            try:
                import redis  # type: ignore

                self._redis = redis.Redis.from_url(redis_url, decode_responses=True)
                self._redis.ping()
                logger.info("Redis cache enabled at %s", redis_url)
            except Exception as exc:  # pragma: no cover - depends on env
                logger.warning("Redis unavailable (%s) - using in-process cache", exc)
                self._redis = None

    # -- object cache (memory only: geometry objects are not JSON friendly)
    def get_object(self, key: str) -> Any | None:
        return self._memory.get(key)

    def set_object(self, key: str, value: Any, ttl_s: float = 300.0) -> None:
        self._memory.set(key, value, ttl_s)

    def get_or_set(self, key: str, ttl_s: float, factory: Callable[[], Any]) -> Any:
        value = self.get_object(key)
        if value is None:
            value = factory()
            self.set_object(key, value, ttl_s)
        return value

    # -- json cache (memory or redis)
    def get_json(self, key: str) -> Any | None:
        if self._redis is not None:
            try:
                raw = self._redis.get(key)
                return json.loads(raw) if raw else None
            except Exception:  # pragma: no cover
                pass
        raw = self._memory.get(f"json:{key}")
        return raw

    def set_json(self, key: str, value: Any, ttl_s: float = 60.0) -> None:
        if self._redis is not None:
            try:
                self._redis.setex(key, int(ttl_s), json.dumps(value))
                return
            except Exception:  # pragma: no cover
                pass
        self._memory.set(f"json:{key}", value, ttl_s)

    def invalidate_prefix(self, prefix: str) -> None:
        self._memory.invalidate_prefix(prefix)
        if self._redis is not None:  # pragma: no cover - redis specific
            try:
                for key in self._redis.scan_iter(f"{prefix}*"):
                    self._redis.delete(key)
            except Exception:
                pass
