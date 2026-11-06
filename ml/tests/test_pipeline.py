"""Leakage and labelling guarantees of the training tables."""
import math

import pandas as pd

from cslifeline_ml.dataset import DAY, build_table
from cslifeline_ml.features import compute_features, to_ms
from cslifeline_ml.pipeline import choose_thresholds, metrics


def _r(uid, t, correct, mode="practice", q="Q1"):
    return {"student_uid": uid, "question_id": q, "recorded_at": t, "correct": correct, "mode": mode, "chapter_id": "T01", "time_ms": 1000}


def test_features_ignore_records_after_cutoff():
    cut = to_ms("2026-01-10T00:00:00Z")
    rs = [_r("a", "2026-01-09T10:00:00Z", True), _r("a", "2026-01-11T10:00:00Z", False)]
    f = compute_features(rs, [], cut)
    assert f["n_responses"] == 1 and f["acc_all"] == 1.0


def test_session_completion_uses_end_time_not_final_status():
    cut = to_ms("2026-01-10T00:00:00Z")
    s = [{"started_at": "2026-01-09T23:50:00Z", "ended_at": "2026-01-10T00:10:00Z", "status": "completed"}]
    assert compute_features([_r("a", "2026-01-09T23:55:00Z", True)], s, cut)["completion_rate"] == 0.0


def test_label_comes_only_from_the_window_after_the_cutoff():
    start = "2026-01-12T00:00:00Z"
    cut = to_ms(start) + 8 * 7 * DAY
    rows = [_r("u1", pd.Timestamp(cut - DAY, unit="ms", tz="UTC").isoformat(), True, "assessment", f"B{i}") for i in range(5)]
    rows += [_r("u1", pd.Timestamp(cut + 2 * DAY, unit="ms", tz="UTC").isoformat(), False, "assessment", f"A{i}") for i in range(3)]
    data = {"learners": pd.DataFrame([{"uid": "u1", "pseudo_id": "L-1", "cohort": "H2", "school_id": "S", "class_code": "C", "grade": 10}]),
            "responses": pd.DataFrame([{**r, "cohort": "H2"} for r in rows]), "sessions": pd.DataFrame(columns=["student_uid", "cohort"]),
            "events": pd.DataFrame(columns=["cohort", "learner_id", "linkage"])}
    t = build_table(data, ["H2"], cutoffs_ms={"H2": [cut]})
    assert t.loc[0, "label"] == 1          # after-window accuracy 0 %
    assert t.loc[0, "acc_all"] == 1.0      # features saw only the earlier correct answers


def test_unlabelled_when_too_few_followup_answers():
    cut = to_ms("2026-03-01T00:00:00Z")
    data = {"learners": pd.DataFrame([{"uid": "u", "pseudo_id": "L", "cohort": "H2", "school_id": "S", "class_code": "C", "grade": 9}]),
            "responses": pd.DataFrame([{**_r("u", "2026-03-02T00:00:00Z", False, "assessment"), "cohort": "H2"}]),
            "sessions": pd.DataFrame(columns=["student_uid", "cohort"]), "events": pd.DataFrame(columns=["cohort", "learner_id", "linkage"])}
    t = build_table(data, ["H2"], cutoffs_ms={"H2": [cut]})
    assert math.isnan(t.loc[0, "label"])


def test_thresholds_meet_recall_target():
    y = [0] * 80 + [1] * 20
    p = [i / 100 for i in range(80)] + [0.5 + i / 50 for i in range(20)]
    th = choose_thresholds(y, p)
    m = metrics(y, p, th)
    assert m["flag"]["recall"] >= 0.8 and th["high"] >= th["moderate"]
