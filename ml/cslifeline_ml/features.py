"""Risk features — exact Python twin of public/js/engine/risk.js computeFeatures (FEATURE_VERSION fv-1.1).

Parity is enforced by ml/tests/test_features.py against a fixture whose expected values were
computed by the JavaScript implementation (tests/fixtures/feature_parity.json, produced by
scripts/make-feature-fixture.mjs). If you change a feature here, change it there too.

Only responses recorded strictly before `as_of` are used, which is what prevents temporal leakage.
Page interruptions (tab switches) are deliberately not features.
"""
from __future__ import annotations

import math
from collections import defaultdict
from datetime import datetime, timezone
from typing import Iterable

FEATURE_VERSION = "fv-1.1"
FEATURE_NAMES = [
    "acc_all", "acc_recent", "acc_trend", "acc_assessment", "chapter_min_acc", "chapters_below_50",
    "diag_error_rate", "repeat_error_rate", "completion_rate", "active_days_28", "days_since_active",
    "rel_time_median", "hint_rate", "n_responses",
]
# Feature groups used in ablation experiments
BEHAVIOUR_FEATURES = ["rel_time_median", "hint_rate"]
ENGAGEMENT_FEATURES = ["completion_rate", "active_days_28", "days_since_active"]
DAY = 86_400_000


def to_ms(t) -> float | None:
    """ISO string / epoch ms / datetime -> epoch ms (same rules as util.js toMs)."""
    if t is None or t == "" or (isinstance(t, float) and math.isnan(t)):
        return None
    if isinstance(t, (int, float)):
        return float(t)
    if isinstance(t, datetime):
        return t.timestamp() * 1000
    try:
        s = str(t).replace("Z", "+00:00")
        return datetime.fromisoformat(s).timestamp() * 1000
    except ValueError:
        return None


def as_bool(v):
    if isinstance(v, bool):
        return v
    if v is None:
        return None
    s = str(v).strip().lower()
    return True if s == "true" else False if s == "false" else None


def as_list(v) -> list:
    if isinstance(v, list):
        return v
    if v is None or (isinstance(v, float) and math.isnan(v)) or v == "":
        return []
    return [x for x in str(v).split(";") if x]


def week_key(ms: float) -> str:
    d = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    monday = d.toordinal() - d.weekday()
    return datetime.fromordinal(monday).strftime("%Y-%m-%d")


def _mean(xs):
    return sum(xs) / len(xs) if xs else None


def _slope(xs, ys):
    n = len(xs)
    if n < 3:
        return None
    mx, my = _mean(xs), _mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = sum((x - mx) ** 2 for x in xs)
    return 0.0 if den == 0 else num / den


def _median(xs):
    v = sorted(x for x in xs if x is not None and math.isfinite(x))
    if not v:
        return None
    m = len(v) // 2
    return v[m] if len(v) % 2 else (v[m - 1] + v[m]) / 2


def median_times(responses: Iterable[dict]) -> dict:
    """Same as misconception.js medianTimes: upper-middle element per question."""
    by = defaultdict(list)
    for r in responses:
        t = r.get("time_ms")
        if t is not None and not (isinstance(t, float) and math.isnan(t)) and float(t) > 0:
            by[r["question_id"]].append(float(t))
    return {k: sorted(v)[len(v) // 2] for k, v in by.items()}


def compute_features(responses: list[dict], sessions: list[dict], as_of: float, median_time_by_question: dict | None = None) -> dict:
    rs = []
    for r in responses:
        t = to_ms(r.get("recorded_at"))
        c = as_bool(r.get("correct"))
        if t is not None and t < as_of and c is not None:
            rs.append({**r, "_t": t, "_c": c})
    rs.sort(key=lambda r: r["_t"])  # stable, like Array.prototype.sort
    n = len(rs)

    def acc(xs):
        return sum(1 for r in xs if r["_c"]) / len(xs) if xs else None

    acc_all = acc(rs)
    acc_recent = acc(rs[-20:])
    weeks = defaultdict(list)
    for r in rs:
        weeks[week_key(r["_t"])].append(r)
    wk = sorted(weeks)[-6:]
    trend = _slope(list(range(len(wk))), [acc(weeks[k]) for k in wk]) if len(wk) >= 3 else 0.0
    assess = [r for r in rs if r.get("mode") == "assessment"]
    acc_assess = acc(assess) if assess else acc_all
    chap = defaultdict(list)
    for r in rs:
        if r.get("chapter_id"):
            chap[r["chapter_id"]].append(r)
    chap_acc = [acc(v) for v in chap.values() if len(v) >= 3]
    wrong = [r for r in rs if not r["_c"]]
    diag = (sum(1 for r in wrong if as_list(r.get("misconception_hits"))) / len(wrong)) if wrong else 0.0
    wrong_by_q = defaultdict(int)
    for r in wrong:
        wrong_by_q[r["question_id"]] += 1
    distinct_q = len({r["question_id"] for r in rs})
    repeat = (sum(1 for c in wrong_by_q.values() if c >= 2) / distinct_q) if distinct_q else 0.0
    ss = [s for s in sessions if (to_ms(s.get("started_at")) is not None and to_ms(s.get("started_at")) < as_of)]

    def completed(s):
        e = to_ms(s.get("ended_at"))
        return (e < as_of) if e is not None else s.get("status") == "completed"

    completion = (sum(1 for s in ss if completed(s)) / len(ss)) if ss else None
    days = len({datetime.fromtimestamp(r["_t"] / 1000, tz=timezone.utc).strftime("%Y-%m-%d") for r in rs if r["_t"] >= as_of - 28 * DAY})
    last = rs[-1]["_t"] if n else None
    since = 60.0 if last is None else min(60.0, (as_of - last) / DAY)
    med = median_time_by_question
    rel = None
    if med is not None:
        vals = []
        for r in rs:
            t = r.get("time_ms")
            m = med.get(r["question_id"])
            if t is not None and not (isinstance(t, float) and math.isnan(t)) and float(t) > 0 and m:
                vals.append(float(t) / m)
        rel = _median(vals)
    practice = [r for r in rs if r.get("mode") in ("practice", None, "")]
    hint = (sum(1 for r in practice if as_bool(r.get("hint_used"))) / len(practice)) if practice else 0.0
    return {
        "acc_all": acc_all, "acc_recent": acc_recent, "acc_trend": trend if trend is not None else 0.0, "acc_assessment": acc_assess,
        "chapter_min_acc": min(chap_acc) if chap_acc else acc_all,
        "chapters_below_50": (sum(1 for a in chap_acc if a < 0.5) / len(chap_acc)) if chap_acc else 0.0,
        "diag_error_rate": diag, "repeat_error_rate": repeat, "completion_rate": completion,
        "active_days_28": days, "days_since_active": since, "rel_time_median": rel, "hint_rate": hint, "n_responses": n,
    }


def platform_features(events: list[dict], as_of: float, platform: str) -> dict:
    """Features from another platform's linked events (exact-time or session-time events only before as_of).

    DBWOW events are progress snapshots without per-answer times ('snapshot' precision): they are used
    only when the snapshot itself was taken before the cut-off.
    """
    p = platform.lower()
    ev = [e for e in events if e.get("source_platform") == platform and e.get("event_type") == "question_answered"
          and to_ms(e.get("occurred_at")) is not None and to_ms(e.get("occurred_at")) < as_of and as_bool(e.get("correct")) is not None]
    nn = len(ev)
    return {f"{p}_n": nn, f"{p}_acc": (sum(1 for e in ev if as_bool(e["correct"])) / nn) if nn else None, f"{p}_linked": 1 if nn else 0}
