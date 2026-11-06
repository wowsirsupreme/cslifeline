"""Load learning records and build leakage-safe training tables.

Design
  * One row = (learner, cut-off date). Features use ONLY records before the cut-off.
  * Label = "assessment accuracy in the 28 days AFTER the cut-off is below 50 %"
    (the definition shown to teachers on the Early-warning page). Rows whose follow-up
    window has fewer than MIN_LABEL_RESPONSES marked assessment answers get no label
    and are excluded from training and evaluation (never imputed).
  * Learners, not rows, are the unit of validation (grouped CV); cohorts are split in time
    (train on an earlier cohort, test on a later one).
"""
from __future__ import annotations

import math
from collections import defaultdict
from pathlib import Path

import pandas as pd

from .features import FEATURE_NAMES, compute_features, median_times, platform_features, to_ms

ROOT = Path(__file__).resolve().parents[2]
SYN = ROOT / "ml" / "data" / "synthetic"
DAY = 86_400_000
WEEK = 7 * DAY
LABEL_WINDOW_DAYS = 28
LABEL_THRESHOLD = 0.5
MIN_LABEL_RESPONSES = 3
MIN_FEATURE_RESPONSES = 10  # same gate as predictLogistic's min_responses

# Term start dates of the synthetic cohorts (scripts/synthetic/generate.mjs)
COHORT_START = {"H1": "2025-09-08T00:00:00Z", "H2": "2026-01-12T00:00:00Z", "C": "2026-09-07T00:00:00Z"}
CUTOFF_WEEKS = (5, 8)  # prediction points: after week 5 and after week 8 of term


def _records(df: pd.DataFrame) -> list[dict]:
    return df.astype(object).where(df.notna(), None).to_dict("records")


def load_synthetic(path: Path = SYN) -> dict[str, pd.DataFrame]:
    """Load the generated synthetic files. Every row is synthetic (checked)."""
    d = {
        "learners": pd.read_csv(path / "learners.csv"),
        "responses": pd.read_csv(path / "responses.csv.gz", low_memory=False),
        "sessions": pd.read_csv(path / "sessions.csv.gz", low_memory=False),
        "events": pd.read_csv(path / "learning_events.csv.gz", low_memory=False),
    }
    for k, v in d.items():
        if "is_synthetic" in v and not v["is_synthetic"].astype(str).str.lower().eq("true").all():
            raise ValueError(f"{k}: non-synthetic rows found in the synthetic folder — refusing to mix data")
    return d


def load_export(path: Path) -> dict[str, pd.DataFrame]:
    """Load a research export downloaded from the teacher portal (Research export page).

    Expected files: learners.csv, responses.csv, sessions.csv and optionally learning_events.csv.
    These contain pseudonymous IDs only. A 'cohort' column may be added by the researcher; if it is
    absent every learner is treated as one cohort named 'R'.
    """
    path = Path(path)
    d = {k: pd.read_csv(path / f"{k}.csv", low_memory=False) for k in ("learners", "responses", "sessions")}
    ev = path / "learning_events.csv"
    d["events"] = pd.read_csv(ev, low_memory=False) if ev.exists() else pd.DataFrame(columns=["learner_id"])
    for k in d:
        if "cohort" not in d[k]:
            d[k]["cohort"] = "R"
    return d


def build_table(data: dict[str, pd.DataFrame], cohorts: list[str], cutoffs_ms: dict[str, list[float]] | None = None,
                with_label: bool = True) -> pd.DataFrame:
    """Feature table for the given cohorts. cutoffs_ms: cohort -> list of cut-off times (default CUTOFF_WEEKS)."""
    rows = []
    learners = data["learners"]
    for cohort in cohorts:
        L = learners[learners["cohort"] == cohort]
        resp = data["responses"][data["responses"]["cohort"] == cohort]
        sess = data["sessions"][data["sessions"]["cohort"] == cohort]
        evs = data["events"]
        ev = evs[evs["cohort"] == cohort] if "cohort" in evs.columns else evs
        resp_recs = _records(resp)
        for r in resp_recs:
            r["_t"] = to_ms(r.get("recorded_at"))
        by_student = defaultdict(list)
        for r in resp_recs:
            by_student[r["student_uid"]].append(r)
        sess_by = defaultdict(list)
        for s in _records(sess):
            sess_by[s["student_uid"]].append(s)
        ev_by = defaultdict(list)
        for e in _records(ev):
            if e.get("linkage") == "linked" and e.get("learner_id"):
                ev_by[e["learner_id"]].append(e)
        cuts = (cutoffs_ms or {}).get(cohort) or [to_ms(COHORT_START[cohort]) + w * WEEK for w in CUTOFF_WEEKS]
        for cut in cuts:
            before = [r for r in resp_recs if r["_t"] is not None and r["_t"] < cut]
            med = median_times(before)
            for lr in _records(L):
                uid = lr["uid"]
                f = compute_features(by_student.get(uid, []), sess_by.get(uid, []), cut, med)
                for p in ("WOW_SIR", "DBWOW"):
                    f.update(platform_features(ev_by.get(lr["pseudo_id"], []), cut, p))
                row = {"uid": uid, "pseudo_id": lr["pseudo_id"], "cohort": cohort, "school_id": lr.get("school_id"), "class_code": lr.get("class_code"),
                       "grade": lr.get("grade"), "cutoff_ms": cut, **f}
                if with_label:
                    after = [r for r in by_student.get(uid, []) if r["_t"] is not None and cut <= r["_t"] < cut + LABEL_WINDOW_DAYS * DAY
                             and r.get("mode") == "assessment" and str(r.get("correct")).lower() in ("true", "false")]
                    if len(after) >= MIN_LABEL_RESPONSES:
                        a = sum(1 for r in after if str(r["correct"]).lower() == "true") / len(after)
                        row["label"] = int(a < LABEL_THRESHOLD)
                        row["label_accuracy"] = a
                        row["label_n"] = len(after)
                    else:
                        row["label"] = math.nan
                rows.append(row)
    return pd.DataFrame(rows)


FEATURE_SETS = {
    # Primary model: everything CS Lifeline records (no tab switches, no identity attributes)
    "cslifeline": FEATURE_NAMES,
    # Ablation for the behavioural-data research question: assessment/practice outcome features only
    "outcomes_only": [f for f in FEATURE_NAMES if f not in ("rel_time_median", "hint_rate", "completion_rate", "active_days_28", "days_since_active")],
    # Cross-platform experiments (rows restricted to learners with verified links where noted)
    "wowsir_only": ["wow_sir_acc", "wow_sir_n"],
    "dbwow_only": ["dbwow_acc", "dbwow_n"],
    "combined": FEATURE_NAMES + ["wow_sir_acc", "wow_sir_n", "wow_sir_linked", "dbwow_acc", "dbwow_n", "dbwow_linked"],
}
