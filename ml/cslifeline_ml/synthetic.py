"""Synthetic learning data for CS Lifeline.

Every record produced here is synthetic and carries is_synthetic = True. The data
exists to test the software end to end and to exercise the machine-learning
pipeline. Model results obtained on it say nothing about real learners and must
not be reported as evidence of predictive accuracy.

Generative model (per learner)
  ability        theta ~ N(0, 1)
  engagement     e ~ Beta(2.2, 1.6); drives practice frequency and assessment completion
  misconceptions k ~ Poisson(1.2 + 0.8 * max(0, -theta)) taxonomy entries are "held";
                 a held misconception makes the linked distractor likely (p = 0.6)
                 on any question that probes it, and fades with practice
  learning       effective ability grows with practice volume and engagement
  behaviour      response time, hints, revisions; page interruptions are generated
                 independently of correctness (they are context, not evidence)
  interventions  teachers target a demonstrated misconception; with probability 0.6
                 it is resolved and ability rises slightly

Cohorts
  H1  Sep-Dec 2025 (4 schools)  historical: training
  H2  Jan-Apr 2026 (4 schools)  historical: temporal validation
  C   Sep 2026 -> 5 Nov 2026 (2 schools)  current term, partly observed: demo + prediction
"""
from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / "ml" / "data" / "reference"
UTC = timezone.utc

FIRST = ["Ama", "Kofi", "Esi", "Kwame", "Akosua", "Yaw", "Efua", "Kojo", "Abena", "Kwabena", "Adwoa", "Fiifi", "Naa", "Nii", "Dede", "Selorm",
         "Elikem", "Mawuli", "Afia", "Kwesi", "Maya", "Daniel", "Grace", "Samuel", "Ruth", "David", "Sarah", "Joel", "Leah", "Isaac", "Zara", "Tunde",
         "Chidi", "Amara", "Musa", "Fatima", "Ibrahim", "Aisha", "Omar", "Lina", "Noah", "Ella", "Liam", "Ava", "Ethan", "Mia", "Lucas", "Nora"]
LAST_INITIAL = "ABCDEFGHJKLMNOPQRSTUVWY"

SCHOOLS = {
    "SCH-NB": "Northbridge Academy (synthetic)",
    "SCH-RV": "Riverside College (synthetic)",
    "SCH-HL": "Hillcrest School (synthetic)",
    "SCH-LK": "Lakeview International (synthetic)",
}

CHAPTER_ORDER = ["T01", "T08", "T07", "T02", "T09", "T03", "T13", "T04", "T10", "T05", "T12", "T06", "T11", "T14"]
CHAPTER_DIFF = {"T01": 0.0, "T02": -0.1, "T03": -0.2, "T04": -0.1, "T05": -0.3, "T06": -0.3, "T07": 0.2, "T08": 0.3, "T09": 0.4,
                "T10": 0.5, "T11": 0.4, "T12": 0.3, "T13": 0.1, "T14": 0.0}


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


@dataclass
class Learner:
    uid: str
    pseudo_id: str
    name: str
    school_id: str
    class_code: str
    grade: int
    cohort: str
    theta: float
    engagement: float
    held: dict = field(default_factory=dict)   # misconception id -> active flag
    practice_count: int = 0
    uses_wowsir: bool = False
    uses_dbwow: bool = False
    wowsir_verified: bool = False
    dbwow_verified: bool = False


class World:
    def __init__(self, seed: int = 2026):
        self.rng = random.Random(seed)
        self.np = np.random.default_rng(seed)
        self.questions = json.loads((REF / "question_bank.json").read_text())
        self.taxonomy = json.loads((REF / "taxonomy.json").read_text())["entries"]
        self.tax_ids = [m["id"] for m in self.taxonomy]
        self.q_by_chapter: dict[str, list] = {}
        for q in self.questions:
            self.q_by_chapter.setdefault(q["chapter_id"], []).append(q)
        self.uid_counter = 0

    # ── helpers ────────────────────────────────────────────────────────────
    def new_id(self, prefix: str, n: int = 10) -> str:
        abc = "abcdefghijkmnpqrstuvwxyz23456789"
        return prefix + "".join(self.rng.choice(abc) for _ in range(n))

    def probes(self, q) -> set:
        s = set(q.get("misconception_tags") or [])
        s |= set((q.get("distractor_tags") or {}).values())
        s |= {w["tag"] for w in q.get("wrong_answer_tags") or []}
        return s

    def make_learner(self, school, class_code, grade, cohort) -> Learner:
        self.uid_counter += 1
        theta = float(self.np.normal(0, 1))
        eng = float(self.np.beta(2.2, 1.6))
        name = f"{self.rng.choice(FIRST)} {self.rng.choice(LAST_INITIAL)}."
        L = Learner(uid=f"syn_{cohort.lower()}_{self.uid_counter:04d}", pseudo_id="L-" + self.new_id("", 10).upper(), name=name,
                    school_id=school, class_code=class_code, grade=grade, cohort=cohort, theta=theta, engagement=eng)
        k = int(self.np.poisson(1.2 + 0.8 * max(0.0, -theta)))
        for m in self.rng.sample(self.tax_ids, min(k, len(self.tax_ids))):
            L.held[m] = True
        L.uses_wowsir = self.rng.random() < 0.6
        L.uses_dbwow = grade >= 10 and self.rng.random() < 0.45
        L.wowsir_verified = L.uses_wowsir and self.rng.random() < 0.7
        L.dbwow_verified = L.uses_dbwow and self.rng.random() < 0.8
        return L

    # ── response model ─────────────────────────────────────────────────────
    def answer(self, L: Learner, q, week: int, mode: str):
        """Return dict(answer, correct, score, max_score, distractor_tag, behaviour)."""
        marks = int(q.get("marks") or 1)
        diff = {1: -0.8, 2: 0.0, 3: 0.8}.get(int(q.get("difficulty") or 2), 0.0)
        eff = L.theta + 0.03 * L.practice_count * (0.5 + L.engagement) + 0.04 * week
        p_correct = sigmoid(1.3 * (eff - diff - CHAPTER_DIFF.get(q["chapter_id"], 0)) + 0.6)
        active = [m for m in self.probes(q) if L.held.get(m)]
        dtags = q.get("distractor_tags") or {}
        wtags = q.get("wrong_answer_tags") or []
        chosen_tag = None
        if active and self.rng.random() < 0.6:
            correct = False
            chosen_tag = active[0]
        else:
            correct = self.rng.random() < p_correct
            if correct and int(q.get("difficulty") or 2) == 1 and self.rng.random() < 0.04:
                correct = False  # slip
        t = q["type"]
        key = q.get("answer") or {}
        ans = None
        dist = None
        if t == "mcq":
            if correct:
                ans = key["correct"]
            else:
                opts = [i for i in range(len(q["options"])) if i != key["correct"]]
                if chosen_tag:
                    linked = [int(i) for i, tag in dtags.items() if tag == chosen_tag]
                    ans = self.rng.choice(linked) if linked else self.rng.choice(opts)
                else:
                    # an unlinked or random distractor
                    ans = self.rng.choice(opts)
                dist = dtags.get(str(ans))
        elif t == "true_false":
            ans = key["correct"] if correct else (not key["correct"])
            dist = None if correct else dtags.get(str(ans).lower())
        elif t == "multi_select":
            ans = list(key["correct"]) if correct else sorted(set(key["correct"][:1]) | {self.rng.choice([i for i in range(len(q["options"])) if i not in key["correct"]])})
            dist = None if correct else next((dtags.get(str(i)) for i in ans if str(i) in dtags), None)
        elif t in ("short_answer", "code_output", "pseudocode"):
            if correct:
                ans = key["accept"][0]
            else:
                tagged = [w for w in wtags if w["tag"] == chosen_tag] if chosen_tag else []
                if tagged:
                    ans, dist = tagged[0]["match"], chosen_tag
                elif wtags and self.rng.random() < 0.5:
                    w = self.rng.choice(wtags); ans, dist = w["match"], w["tag"]
                else:
                    ans = self.rng.choice(["0", "1", "?", "error", "12"])
        elif t == "fill_gap":
            gaps = key["gaps"]
            ans = [g[0] for g in gaps] if correct else [g[0] if self.rng.random() < 0.5 else "?" for g in gaps]
            if not correct and all(a == g[0] for a, g in zip(ans, gaps)):
                ans[0] = "?"
        elif t == "matching":
            pairs = key["pairs"]
            ans = list(pairs) if correct else [p if self.rng.random() < 0.4 else (p + 1) % len(q["right"]) for p in pairs]
            if not correct and ans == pairs:
                ans[0] = (ans[0] + 1) % len(q["right"])
        elif t == "ordering":
            order = key["order"]
            ans = list(order)
            if not correct:
                i = self.rng.randrange(len(ans) - 1); ans[i], ans[i + 1] = ans[i + 1], ans[i]
        elif t == "trace_table":
            cells = key["cells"]
            ans = [list(r) for r in cells]
            if not correct:
                ans = ans[:-2] + [ans[-1]] if len(ans) > 2 else [["?"] * len(cells[0])]
                dist = dtags.get("trace")
        elif t == "debugging":
            if correct:
                ans = {"line": key["line"], "fix": (key.get("accept_fix") or [""])[0]}
            else:
                lines = len(q["code"].split("\n"))
                wrong = [i for i in range(1, lines + 1) if i != key["line"]]
                ln = self.rng.choice(wrong)
                ans = {"line": ln, "fix": ""}
                dist = dtags.get(str(ln))
        elif t == "coding":
            ans = q.get("solution") if correct else (q.get("starter") or "") + "\n// incomplete"
        else:
            ans = "Synthetic structured answer"
        # partial credit for multi-part items
        if correct:
            score = marks
        elif t in ("fill_gap", "matching", "ordering", "trace_table", "debugging", "coding") and marks > 1:
            score = self.rng.randint(0, marks - 1)
        else:
            score = 0
        if t == "structured":
            correct, score = None, None
        base_ms = {1: 18000, 2: 32000, 3: 55000}.get(int(q.get("difficulty") or 2), 30000) * (1.6 if t in ("coding", "trace_table", "structured") else 1)
        time_ms = int(base_ms * math.exp(self.np.normal(0, 0.45)) * (1.15 if not correct else 1.0))
        behaviour = {
            "time_ms": time_ms,
            "time_to_first_ms": int(time_ms * self.rng.uniform(0.25, 0.8)),
            "revisions": int(self.np.poisson(0.25 + (0.4 if eff < 0 else 0))),
            "hint_used": mode == "practice" and self.rng.random() < (0.25 if eff < 0 else 0.1),
            "interruptions": int(self.rng.random() < 0.08),
            "offline": self.rng.random() < 0.01,
        }
        behaviour["away_ms"] = int(behaviour["interruptions"] * self.rng.uniform(2000, 40000))
        return {"answer": ans, "correct": correct, "score": score, "max_score": marks, "distractor_tag": dist, "behaviour": behaviour,
                "needs_marking": t == "structured"}


def run_cohort(world: World, cohort: str, start: datetime, weeks_observed: int, schools: list, classes_per_school: dict, students_per_class: tuple,
               now: datetime | None = None):
    """Simulate one term. Returns a dict of lists (Firestore-shaped records)."""
    rng = world.rng
    out = {k: [] for k in ["users", "classes", "sessions", "responses", "assessments", "submissions", "interventions", "events", "identity_map", "outcomes"]}
    learners: list[Learner] = []
    for sch in schools:
        for code, grade in classes_per_school[sch]:
            cc = f"{cohort}-{code}" if cohort != "C" else code
            out["classes"].append({"id": cc, "name": f"Grade {grade} Computer Science {code.split('-')[-1]}", "school_id": sch, "grade": grade, "subject": "CS-0478", "cohort": cohort})
            for _ in range(rng.randint(*students_per_class)):
                learners.append(world.make_learner(sch, cc, grade, cohort))
    # Assessments: week 4 quiz, week 8 test, week 12 end-of-term
    plan = [(4, "Unit quiz", 8, CHAPTER_ORDER[:4]), (8, "Mid-term test", 10, CHAPTER_ORDER[:8]), (12, "End-of-term examination", 14, CHAPTER_ORDER)]
    asm_for_class = {}
    for cl in out["classes"]:
        for wk, title, nq, chs in plan:
            pool = [q for c in chs for q in world.q_by_chapter.get(c, []) if q["type"] not in ("structured",)]
            qs = rng.sample(pool, min(nq, len(pool)))
            aid = f"asm_{cl['id']}_w{wk}".lower().replace("-", "_")
            opens = start + timedelta(weeks=wk - 1, days=2)
            asm_for_class.setdefault(cl["id"], []).append((wk, aid, qs, opens))
            out["assessments"].append({"id": aid, "title": f"{title}", "class_code": cl["id"], "week": wk, "opens_at": iso(opens),
                                       "deadline": iso(opens + timedelta(days=5)), "question_ids": [q["id"] for q in qs]})
    end_week = weeks_observed
    for L in learners:
        sess_n = 0
        for week in range(1, 13):
            if week > end_week:
                break
            # practice sessions
            n_sess = int(world.np.poisson(0.3 + 1.6 * L.engagement))
            covered = CHAPTER_ORDER[: min(len(CHAPTER_ORDER), 2 + week)]
            for s in range(n_sess):
                at = start + timedelta(weeks=week - 1, days=rng.randint(0, 6), hours=rng.randint(14, 20), minutes=rng.randint(0, 59))
                if now and at > now:
                    continue
                ch = rng.choice(covered[-4:]) if rng.random() < 0.7 else rng.choice(covered)
                pool = [q for q in world.q_by_chapter.get(ch, []) if q["type"] != "structured"]
                if not pool:
                    continue
                qs = rng.sample(pool, min(len(pool), rng.randint(4, 8)))
                sid = f"ses_{L.uid}_{sess_n}"; sess_n += 1
                t = at
                correct_n = 0
                for qi, q in enumerate(qs):
                    a = world.answer(L, q, week, "practice")
                    t = t + timedelta(milliseconds=a["behaviour"]["time_ms"] + 4000)
                    out["responses"].append(response_doc(L, q, a, sid, None, None, "practice", t))
                    correct_n += 1 if a["correct"] else 0
                    # practice gradually removes misconceptions
                    for m in world.probes(q):
                        if L.held.get(m) and rng.random() < 0.05 * (0.5 + L.engagement):
                            L.held[m] = False
                L.practice_count += 1
                out["sessions"].append({"id": sid, "student_uid": L.uid, "class_code": L.class_code, "pseudo_id": L.pseudo_id, "mode": "practice", "chapter_id": ch,
                                        "question_count": len(qs), "correct_count": correct_n, "status": "completed", "started_at": iso(at), "ended_at": iso(t), "is_synthetic": True})
            # WOW Sir live quiz (separate platform)
            if L.uses_wowsir and rng.random() < 0.55:
                at = start + timedelta(weeks=week - 1, days=rng.randint(0, 4), hours=10)
                if not (now and at > now):
                    sess = f"wow_{L.class_code}_{week}"
                    for qi in range(rng.randint(4, 8)):
                        ch = rng.choice(covered)
                        q = rng.choice(world.q_by_chapter[ch])
                        a = world.answer(L, q, week, "live")
                        out["events"].append({"source_platform": "WOW_SIR", "source_learner_id": f"{sess}:{L.uid[-6:]}", "uid": L.uid, "chapter_id": ch,
                                              "question_id": f"WOWSIR:{sess}:{qi}", "correct": bool(a["correct"]), "duration_ms": a["behaviour"]["time_ms"] // 2,
                                              "occurred_at": iso(at + timedelta(seconds=30 * qi)), "time_precision": "session", "event_type": "question_answered"})
            # assessments
            for wk, aid, qs, opens in asm_for_class.get(L.class_code, []):
                if wk != week:
                    continue
                sub_at = opens + timedelta(days=rng.randint(0, 4), hours=rng.randint(8, 20))
                if now and sub_at > now:
                    continue
                if rng.random() > 0.55 + 0.45 * L.engagement:
                    continue
                answers, results, beh = {}, {}, {}
                score = maxs = 0
                for q in qs:
                    a = world.answer(L, q, week, "assessment")
                    answers[q["id"]] = a["answer"]; beh[q["id"]] = a["behaviour"]
                    sc = a["score"] or 0
                    score += sc; maxs += a["max_score"]
                    results[q["id"]] = {"score": a["score"], "max": a["max_score"], "correct": a["correct"], "needs_marking": a["needs_marking"]}
                    out["responses"].append(response_doc(L, q, a, None, f"{aid}__{L.uid}", aid, "assessment", sub_at))
                out["submissions"].append({"id": f"{aid}__{L.uid}", "assessment_id": aid, "student_uid": L.uid, "pseudo_id": L.pseudo_id, "class_code": L.class_code,
                                           "school_id": L.school_id, "answers": answers, "behaviour": beh, "results": results, "score": score, "max_score": maxs,
                                           "status": "scored", "feedback_released": True, "submitted_at": iso(sub_at), "scored_at": iso(sub_at + timedelta(minutes=5)),
                                           "scored_by": "synthetic", "question_ids": [q["id"] for q in qs], "is_synthetic": True, "week": wk})
            # interventions by the teacher between weeks 5 and 7
            if week in (5, 6, 7) and rng.random() < 0.18:
                held = [m for m, v in L.held.items() if v]
                if held:
                    m = rng.choice(held)
                    chapter = next((x["chapter_id"] for x in world.taxonomy if x["id"] == m), None)
                    at = start + timedelta(weeks=week - 1, days=rng.randint(0, 4))
                    if not (now and at > now):
                        resolved = rng.random() < 0.6
                        if resolved:
                            L.held[m] = False
                            L.theta += 0.1
                        out["interventions"].append({"student_uid": L.uid, "class_code": L.class_code, "misconception_ids": [m], "chapter_ids": [chapter] if chapter else [],
                                                     "created_at": iso(at), "started_at": iso(at), "review_date": iso(at + timedelta(days=14)), "resolved_in_simulation": resolved})
        # DBWOW progress snapshot (Databases topic)
        if L.uses_dbwow:
            out["events"].append({"source_platform": "DBWOW", "uid": L.uid, "dbwow_correct_rate": sigmoid(1.2 * L.theta + 0.5), "n": rng.randint(6, 25)})
    out["learners"] = learners
    return out


def response_doc(L: Learner, q, a, session_id, submission_id, assessment_id, mode, at: datetime):
    rid = f"{session_id or submission_id}__{q['id']}__1"
    d = {"id": rid, "schema_version": "2.0", "source_platform": "CS_LIFELINE", "student_uid": L.uid, "pseudo_id": L.pseudo_id, "class_code": L.class_code,
         "school_id": L.school_id, "session_id": session_id, "submission_id": submission_id, "assessment_id": assessment_id, "mode": mode, "attempt": 1,
         "question_id": q["id"], "question_type": q["type"], "chapter_id": q["chapter_id"], "subchapter_id": q.get("subchapter_id"), "topic": q.get("topic"),
         "paper": q.get("paper"), "difficulty": q.get("difficulty"), "misconception_tags": q.get("misconception_tags") or [], "answer": a["answer"],
         "correct": a["correct"], "score": a["score"], "max_score": a["max_score"], "needs_marking": a["needs_marking"], "distractor_tag": a["distractor_tag"],
         "behaviour": a["behaviour"], "recorded_at": iso(at), "is_synthetic": True}
    return {k: v for k, v in d.items() if v is not None or k in ("correct",)}


CURRENT_START = datetime(2026, 9, 7, tzinfo=UTC)
CURRENT_NOW = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


def generate(seed: int = 2026):
    w = World(seed)
    hist_classes = {
        "SCH-NB": [("NB-9A", 9), ("NB-10A", 10), ("NB-10B", 10), ("NB-11A", 11)],
        "SCH-RV": [("RV-9B", 9), ("RV-10C", 10), ("RV-11A", 11)],
        "SCH-HL": [("HL-9A", 9), ("HL-10A", 10), ("HL-11B", 11)],
        "SCH-LK": [("LK-10A", 10), ("LK-10B", 10), ("LK-11A", 11)],
    }
    h1 = run_cohort(w, "H1", datetime(2025, 9, 8, tzinfo=UTC), 12, list(hist_classes), hist_classes, (18, 26))
    h2 = run_cohort(w, "H2", datetime(2026, 1, 12, tzinfo=UTC), 12, list(hist_classes), hist_classes, (18, 26))
    cur_classes = {"SCH-NB": [("NB-9A", 9), ("NB-10A", 10), ("NB-10B", 10)], "SCH-RV": [("RV-9B", 9), ("RV-11A", 11)]}
    weeks_now = (CURRENT_NOW - CURRENT_START).days // 7 + 1
    cur = run_cohort(w, "C", CURRENT_START, weeks_now, list(cur_classes), cur_classes, (17, 21), now=CURRENT_NOW)
    return w, {"H1": h1, "H2": h2, "C": cur}
