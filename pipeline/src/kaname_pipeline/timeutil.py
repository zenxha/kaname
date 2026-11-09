"""Clock-time helpers. Times are minutes after 00:00 of the service day and may exceed 1440."""

from __future__ import annotations

import re

_HHMM = re.compile(r"^(\d{1,2}):(\d{2})$")

# A trip whose first stop is before this time belongs to the previous service day.
SERVICE_DAY_START = 180
DAY = 1440


def parse_hhmm(text: str) -> int:
    """'18:30' -> 1110. Raises ValueError on anything else."""
    if not isinstance(text, str):
        raise ValueError(f"time must be a string, got {text!r}")
    m = _HHMM.match(text)
    if not m:
        raise ValueError(f"bad time {text!r}, expected HH:MM")
    hours, minutes = int(m.group(1)), int(m.group(2))
    if hours > 47 or minutes > 59:
        raise ValueError(f"bad time {text!r}")
    return hours * 60 + minutes


def fmt_hhmm(minutes: int) -> str:
    """1470 -> '24:30'. Keeps hours past midnight so service-day times stay readable."""
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def unwrap_trip_times(raw: list[tuple[str | None, str | None]]) -> list[tuple[int, int]]:
    """Turn a trip's (arrival, departure) strings into monotonic service-day minutes.

    A missing arrival or departure takes the other value. A trip that starts before
    03:00 belongs to the previous service day, so it moves 24 hours later. Later stops
    move forward by whole days until the times never go backwards.
    """
    out: list[tuple[int, int]] = []
    prev: int | None = None
    for arr_s, dep_s in raw:
        if arr_s is None and dep_s is None:
            raise ValueError("stop has neither arrival nor departure time")
        arr = parse_hhmm(arr_s if arr_s is not None else dep_s)
        dep = parse_hhmm(dep_s if dep_s is not None else arr_s)
        if prev is None and arr < SERVICE_DAY_START:
            arr, dep = arr + DAY, dep + DAY
        while prev is not None and arr < prev:
            arr += DAY
        while dep < arr:
            dep += DAY
        out.append((arr, dep))
        prev = dep
    return out
