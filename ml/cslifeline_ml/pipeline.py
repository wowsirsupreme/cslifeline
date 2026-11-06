"""Training, evaluation, model registry and prediction for the CS Lifeline early-warning model.

Validation design (prevents the leakage found in the v3 notebooks):
  1. Features only from records before each cut-off; label from the 28 days after it.
  2. Model selection and threshold choice: 5-fold GroupKFold on the TRAINING cohort, grouped by
     learner (a learner's two cut-off rows never sit on both sides of a split). All preprocessing
     (imputation, scaling) is inside the sklearn Pipeline, so it is fitted on training folds only.
  3. Final test: model refitted on the whole training cohort and evaluated ONCE on a LATER cohort
     of DIFFERENT learners (temporal hold-out).
Selection rule: the most interpretable model whose cross-validated PR-AUC is within 0.02 of the
best (order: logistic regression, decision tree, random forest, gradient boosting, XGBoost, SVM).
Complex models must earn their place.
"""
from __future__ import annotations

import hashlib
import json
import math
import platform
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
import sklearn
from sklearn.base import clone
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, average_precision_score, brier_score_loss, confusion_matrix, f1_score,
                             precision_recall_curve, precision_score, recall_score, roc_auc_score)
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier

from .dataset import FEATURE_SETS, LABEL_THRESHOLD, LABEL_WINDOW_DAYS, MIN_FEATURE_RESPONSES, ROOT
from .features import FEATURE_VERSION

try:
    from xgboost import XGBClassifier
except Exception:  # pragma: no cover - optional dependency
    XGBClassifier = None

SEED = 2026
MODELS_DIR = ROOT / "ml" / "models"
REPORTS_DIR = ROOT / "ml" / "reports"
INTERPRETABILITY_ORDER = ["logistic_regression", "decision_tree", "random_forest", "gradient_boosting", "xgboost", "svm"]
MODEL_LABELS = {"logistic_regression": "Logistic regression", "decision_tree": "Decision tree", "random_forest": "Random forest",
                "gradient_boosting": "Gradient boosting", "xgboost": "XGBoost", "svm": "Support vector machine (RBF)"}
RECALL_TARGET = 0.80     # moderate threshold: catch at least 80 % of at-risk learners (early warning favours recall)
PRECISION_TARGET = 0.70  # high threshold: at least 70 % of "high" flags should be true positives


def make_models() -> dict:
    imp = ("impute", SimpleImputer(strategy="mean", keep_empty_features=True))
    m = {
        "logistic_regression": Pipeline([imp, ("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=5000, C=1.0))]),
        "decision_tree": Pipeline([imp, ("clf", DecisionTreeClassifier(max_depth=4, min_samples_leaf=20, random_state=SEED))]),
        "random_forest": Pipeline([imp, ("clf", RandomForestClassifier(n_estimators=300, min_samples_leaf=5, random_state=SEED, n_jobs=-1))]),
        "gradient_boosting": Pipeline([imp, ("clf", GradientBoostingClassifier(n_estimators=200, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=SEED))]),
        "svm": Pipeline([imp, ("scale", StandardScaler()), ("clf", CalibratedClassifierCV(SVC(C=1.0, kernel="rbf", random_state=SEED), method="sigmoid", cv=5, ensemble=False))]),
    }
    if XGBClassifier is not None:
        m["xgboost"] = Pipeline([imp, ("clf", XGBClassifier(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8,
                                                              eval_metric="logloss", random_state=SEED, n_jobs=2))])
    return m


# ── Metrics ──────────────────────────────────────────────────────────────────
def ece(y, p, bins=10) -> float:
    y, p = np.asarray(y), np.asarray(p)
    edges = np.linspace(0, 1, bins + 1)
    tot = 0.0
    for i in range(bins):
        m = (p >= edges[i]) & (p < edges[i + 1] if i < bins - 1 else p <= edges[i + 1])
        if m.any():
            tot += m.mean() * abs(p[m].mean() - y[m].mean())
    return float(tot)


def reliability(y, p, bins=10) -> list[dict]:
    y, p = np.asarray(y), np.asarray(p)
    out = []
    edges = np.linspace(0, 1, bins + 1)
    for i in range(bins):
        m = (p >= edges[i]) & (p < edges[i + 1] if i < bins - 1 else p <= edges[i + 1])
        if m.any():
            out.append({"bin": f"{edges[i]:.1f}-{edges[i + 1]:.1f}", "n": int(m.sum()), "mean_predicted": float(p[m].mean()), "observed_rate": float(y[m].mean())})
    return out


def metrics(y, p, thresholds: dict | None = None) -> dict:
    y, p = np.asarray(y).astype(int), np.asarray(p, dtype=float)
    out = {"n": int(len(y)), "positives": int(y.sum()), "prevalence": float(y.mean()) if len(y) else None,
           "roc_auc": float(roc_auc_score(y, p)) if len(set(y)) > 1 else None,
           "pr_auc": float(average_precision_score(y, p)) if len(set(y)) > 1 else None,
           "brier": float(brier_score_loss(y, p)), "ece": ece(y, p)}
    if thresholds:
        for name, t in (("flag", thresholds["moderate"]), ("high", thresholds["high"])):
            pred = (p >= t).astype(int)
            tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
            out[name] = {"threshold": float(t), "accuracy": float(accuracy_score(y, pred)), "precision": float(precision_score(y, pred, zero_division=0)),
                         "recall": float(recall_score(y, pred, zero_division=0)), "f1": float(f1_score(y, pred, zero_division=0)),
                         "confusion": {"tn": int(tn), "fp": int(fp), "fn": int(fn), "tp": int(tp)}}
        # convenience top-level values used by the app (Early warning page)
        out.update({k: out["flag"][k] for k in ("precision", "recall", "f1", "accuracy")})
    return out


def choose_thresholds(y, p) -> dict:
    """moderate = highest threshold keeping recall >= RECALL_TARGET; high = lowest threshold reaching PRECISION_TARGET."""
    prec, rec, thr = precision_recall_curve(y, p)
    prec, rec = prec[:-1], rec[:-1]
    ok = np.where(rec >= RECALL_TARGET)[0]
    moderate = float(thr[ok[-1]]) if len(ok) else float(np.quantile(p, 0.5))
    okp = np.where((prec >= PRECISION_TARGET) & (thr >= moderate))[0]
    if len(okp):
        high = float(thr[okp[0]])
        rule = f"high = lowest threshold with precision >= {PRECISION_TARGET:.0%}"
    else:
        f1 = 2 * prec * rec / np.maximum(prec + rec, 1e-9)
        f1[thr < moderate] = -1
        high = float(thr[int(np.argmax(f1))])
        rule = f"precision {PRECISION_TARGET:.0%} not reachable; high = F1-maximising threshold above moderate"
    high = max(high, moderate)
    return {"moderate": round(moderate, 4), "high": round(high, 4),
            "rule": f"moderate = highest threshold with recall >= {RECALL_TARGET:.0%} (out-of-fold, training cohort); {rule}"}


def bootstrap_diff(y, p_a, p_b, groups, reps=1000, seed=SEED) -> dict:
    """Paired learner-level bootstrap of PR-AUC(b) - PR-AUC(a)."""
    rng = np.random.default_rng(seed)
    y, p_a, p_b, groups = map(np.asarray, (y, p_a, p_b, groups))
    ug = np.unique(groups)
    idx_by = {g: np.where(groups == g)[0] for g in ug}
    diffs = []
    for _ in range(reps):
        idx = np.concatenate([idx_by[g] for g in rng.choice(ug, len(ug), replace=True)])
        if len(set(y[idx])) < 2:
            continue
        diffs.append(average_precision_score(y[idx], p_b[idx]) - average_precision_score(y[idx], p_a[idx]))
    d = np.array(diffs)
    return {"diff": float(average_precision_score(y, p_b) - average_precision_score(y, p_a)), "ci_low": float(np.quantile(d, 0.025)), "ci_high": float(np.quantile(d, 0.975)), "reps": len(d)}


# ── Core routines ────────────────────────────────────────────────────────────
def labelled(df: pd.DataFrame) -> pd.DataFrame:
    return df[df["label"].notna() & (df["n_responses"] >= MIN_FEATURE_RESPONSES)].reset_index(drop=True)


def oof_predictions(model, X: pd.DataFrame, y: np.ndarray, groups: np.ndarray, k: int = 5) -> np.ndarray:
    p = np.zeros(len(y))
    for tr, te in GroupKFold(n_splits=k).split(X, y, groups):
        m = clone(model).fit(X.iloc[tr], y[tr])
        p[te] = m.predict_proba(X.iloc[te])[:, 1]
    return p


def occlusion_contributions(model, X: pd.DataFrame, means: pd.Series) -> list[list[dict]]:
    """Model-agnostic local explanation: change in predicted risk when one feature is set to the
    training mean (positive = this learner's value raises risk). Exact log-odds terms are used for LR."""
    base = model.predict_proba(X)[:, 1]
    cols = list(X.columns)
    deltas = np.zeros((len(X), len(cols)))
    for j, c in enumerate(cols):
        Xm = X.copy()
        Xm[c] = means[c]
        deltas[:, j] = base - model.predict_proba(Xm)[:, 1]
    out = []
    for i in range(len(X)):
        rows = [{"feature": c, "value": None if pd.isna(X.iloc[i][c]) else float(X.iloc[i][c]), "contribution": float(deltas[i, j])} for j, c in enumerate(cols)]
        rows.sort(key=lambda r: abs(r["contribution"]), reverse=True)
        out.append(rows[:8])
    return out


def logistic_artefact(model: Pipeline, features: list[str], thresholds: dict) -> dict:
    """Parameters the browser (risk.js predictLogistic) needs to reproduce this model exactly."""
    imp, sc, clf = model.named_steps["impute"], model.named_steps["scale"], model.named_steps["clf"]
    return {"model_type": "logistic", "features": features, "means": [float(x) for x in imp.statistics_],
            "scales": [float(x) if x > 0 else 1.0 for x in sc.scale_], "centres": [float(x) for x in sc.mean_],
            "coef": [float(x) for x in clf.coef_[0]], "intercept": float(clf.intercept_[0]), "thresholds": {k: thresholds[k] for k in ("moderate", "high")},
            "feature_version": FEATURE_VERSION, "min_responses": MIN_FEATURE_RESPONSES}


def data_hash(paths: list[Path]) -> str:
    h = hashlib.sha256()
    for p in sorted(paths):
        h.update(Path(p).read_bytes())
    return h.hexdigest()[:16]


def train_and_evaluate(train_df: pd.DataFrame, test_df: pd.DataFrame, *, source: str, data_files: list[Path], train_label: str, test_label: str) -> dict:
    feats = FEATURE_SETS["cslifeline"]
    tr, te = labelled(train_df), labelled(test_df)
    Xtr, ytr, gtr = tr[feats], tr["label"].astype(int).values, tr["uid"].values
    Xte, yte = te[feats], te["label"].astype(int).values
    models = make_models()

    # 1) cross-validated comparison on the training cohort
    cv = {}
    oof = {}
    for name, m in models.items():
        oof[name] = oof_predictions(m, Xtr, ytr, gtr)
        cv[name] = metrics(ytr, oof[name])
    best = max(v["pr_auc"] for v in cv.values())
    chosen = next(n for n in INTERPRETABILITY_ORDER if n in cv and cv[n]["pr_auc"] >= best - 0.02)
    thresholds = choose_thresholds(ytr, oof[chosen])

    # 2) refit on all training rows; evaluate once on the later cohort
    test = {}
    fitted = {}
    for name, m in models.items():
        fitted[name] = clone(m).fit(Xtr, ytr)
        test[name] = metrics(yte, fitted[name].predict_proba(Xte)[:, 1], thresholds if name == chosen else choose_thresholds(ytr, oof[name]))
    final = fitted[chosen]
    p_te = final.predict_proba(Xte)[:, 1]

    # 3) subgroup performance (school, grade) on the test cohort
    sub = []
    for col in ("school_id", "grade"):
        for g, idx in te.groupby(col).groups.items():
            yy, pp = yte[te.index.get_indexer(idx)], p_te[te.index.get_indexer(idx)]
            mm = metrics(yy, pp, thresholds)
            sub.append({"group": f"{col}={g}", "n": mm["n"], "prevalence": mm["prevalence"], "pr_auc": mm["pr_auc"], "recall": mm["recall"], "precision": mm["precision"]})

    # 4) false negatives vs true positives: what the model misses
    flag = p_te >= thresholds["moderate"]
    fn, tp = te[(yte == 1) & ~flag], te[(yte == 1) & flag]
    errors = {"false_negatives": int(len(fn)), "true_positives": int(len(tp)), "false_positives": int(((yte == 0) & flag).sum()),
              "fn_vs_tp_mean_features": {f: {"fn": _f(fn[f].mean()), "tp": _f(tp[f].mean())} for f in ["acc_all", "acc_assessment", "n_responses", "active_days_28", "diag_error_rate"]}}

    # 5) ablation: outcome-only features vs full CS Lifeline set (same model family)
    abl_feats = FEATURE_SETS["outcomes_only"]
    m_abl = clone(models[chosen]).fit(tr[abl_feats], ytr)
    p_abl = m_abl.predict_proba(te[abl_feats])[:, 1]
    ablation = {"outcomes_only": metrics(yte, p_abl), "cslifeline_full": metrics(yte, p_te),
                "pr_auc_gain_of_behaviour_and_engagement": bootstrap_diff(yte, p_abl, p_te, te["uid"].values)}

    # 6) cross-platform comparison
    xp = cross_platform(tr, te, models[chosen])

    # 7) global importance (permutation-free: standardised coefficients or impurity importance)
    clf = final.named_steps["clf"]
    if hasattr(clf, "coef_"):
        importance = sorted(({"feature": f, "weight": float(w)} for f, w in zip(feats, clf.coef_[0])), key=lambda r: -abs(r["weight"]))
    elif hasattr(clf, "feature_importances_"):
        importance = sorted(({"feature": f, "weight": float(w)} for f, w in zip(feats, clf.feature_importances_)), key=lambda r: -r["weight"])
    else:
        importance = []

    stamp = datetime.now(timezone.utc)
    dh = data_hash(data_files)
    version = f"{chosen.replace('_', '-')}-{stamp:%Y%m%d}-{dh[:6]}"
    entry = {
        "model_version": version, "model_name": MODEL_LABELS[chosen], "model_type": chosen, "status": "candidate",
        "validated_on_real_data": source == "real", "trained_on": source, "feature_version": FEATURE_VERSION, "features": feats,
        "label_definition": f"Assessment accuracy in the {LABEL_WINDOW_DAYS} days after the cut-off is below {LABEL_THRESHOLD:.0%} (rows with fewer than 3 marked assessment answers are unlabelled and excluded).",
        "thresholds": thresholds, "training": {"train_cohort": train_label, "test_cohort": test_label, "train_rows": int(len(tr)), "train_learners": int(tr["uid"].nunique()),
                                                "test_rows": int(len(te)), "test_learners": int(te["uid"].nunique()), "train_prevalence": float(ytr.mean()), "test_prevalence": float(yte.mean()),
                                                "selection_rule": "most interpretable model within 0.02 PR-AUC of the best (grouped 5-fold CV on the training cohort)",
                                                "data_hash": dh, "seed": SEED, "sklearn": sklearn.__version__, "python": platform.python_version(), "trained_at": stamp.isoformat()},
        "metrics": {"cv": cv, "test": test[chosen], "test_all_models": test, "subgroups": sub, "errors": errors, "ablation": ablation, "cross_platform": xp},
        "importance": importance,
        "warning": None if source == "real" else "Trained and evaluated on SYNTHETIC data. These metrics test the pipeline only and are not evidence about real learners.",
    }
    if chosen == "logistic_regression":
        entry["artefact"] = logistic_artefact(final, feats, thresholds)
    return {"entry": entry, "model": final, "oof": oof[chosen], "test_probs": p_te, "test_y": yte, "train_y": ytr, "chosen": chosen}


def _f(x):
    return None if x is None or (isinstance(x, float) and math.isnan(x)) else float(x)


def cross_platform(tr: pd.DataFrame, te: pd.DataFrame, base_model) -> dict:
    """Does adding WOW Sir / DBWOW evidence improve prediction? Compared on the same test rows."""
    out = {}
    ytr, yte = tr["label"].astype(int).values, te["label"].astype(int).values
    preds = {}
    for name in ("cslifeline", "combined"):
        f = FEATURE_SETS[name]
        preds[name] = clone(base_model).fit(tr[f], ytr).predict_proba(te[f])[:, 1]
        out[name] = metrics(yte, preds[name])
    out["combined_minus_cslifeline"] = bootstrap_diff(yte, preds["cslifeline"], preds["combined"], te["uid"].values)
    for name, flag in (("wowsir_only", "wow_sir_linked"), ("dbwow_only", "dbwow_linked")):
        trs, tes = tr[tr[flag] == 1], te[te[flag] == 1]
        if len(trs) < 50 or len(tes) < 30 or len(set(trs["label"])) < 2 or len(set(tes["label"])) < 2:
            out[name] = {"skipped": f"too few learners with verified {flag.split('_linked')[0]} links (train {len(trs)}, test {len(tes)})"}
            continue
        f = FEATURE_SETS[name]
        y1, y2 = trs["label"].astype(int).values, tes["label"].astype(int).values
        p_only = clone(base_model).fit(trs[f], y1).predict_proba(tes[f])[:, 1]
        p_csl = clone(base_model).fit(trs[FEATURE_SETS["cslifeline"]], y1).predict_proba(tes[FEATURE_SETS["cslifeline"]])[:, 1]
        p_comb = clone(base_model).fit(trs[FEATURE_SETS["combined"]], y1).predict_proba(tes[FEATURE_SETS["combined"]])[:, 1]
        out[name] = {"rows_test": int(len(tes)), "platform_only": metrics(y2, p_only), "cslifeline_same_rows": metrics(y2, p_csl), "combined_same_rows": metrics(y2, p_comb),
                     "combined_minus_cslifeline": bootstrap_diff(y2, p_csl, p_comb, tes["uid"].values)}
    return out


# ── Registry ─────────────────────────────────────────────────────────────────
def save_to_registry(result: dict) -> Path:
    import joblib
    entry = result["entry"]
    d = MODELS_DIR / entry["model_version"]
    d.mkdir(parents=True, exist_ok=True)
    prev = d / "registry_entry.json"
    if prev.exists():  # same data + same day → same version: keep any promotion decision already made
        old = json.loads(prev.read_text())
        for k in ("status", "promoted_at", "promotion_reason"):
            if k in old:
                entry[k] = old[k]
    joblib.dump(result["model"], d / "model.joblib")
    (d / "registry_entry.json").write_text(json.dumps(entry, indent=2, default=_json))
    reg_path = MODELS_DIR / "registry.json"
    reg = json.loads(reg_path.read_text()) if reg_path.exists() else {"models": []}
    kept = {m["model_version"]: m for m in reg["models"]}.get(entry["model_version"], {})
    reg["models"] = [m for m in reg["models"] if m["model_version"] != entry["model_version"]] + [
        {k: entry[k] for k in ("model_version", "model_name", "model_type", "status", "validated_on_real_data", "trained_on", "feature_version")}
        | {k: kept[k] for k in ("promoted_at", "promotion_reason") if k in kept} | {"path": str(d.relative_to(ROOT))}]
    reg_path.write_text(json.dumps(reg, indent=2))
    return d


def promote(version: str, reason: str) -> dict:
    """Mark a registered model as production. Synthetic-trained models can be promoted only as DEMONSTRATION models."""
    reg_path = MODELS_DIR / "registry.json"
    reg = json.loads(reg_path.read_text())
    if not any(m["model_version"] == version for m in reg["models"]):
        raise SystemExit(f"Unknown model {version}")
    if not reason or len(reason) < 10:
        raise SystemExit("A reason of at least 10 characters is required for promotion (it is recorded).")
    for m in reg["models"]:
        if m["status"] == "production" and m["model_version"] != version:
            m["status"] = "archived"
        if m["model_version"] == version:
            m["status"] = "production"
            m["promoted_at"] = datetime.now(timezone.utc).isoformat()
            m["promotion_reason"] = reason
    reg_path.write_text(json.dumps(reg, indent=2))
    e = json.loads((MODELS_DIR / version / "registry_entry.json").read_text())
    e.update({"status": "production", "promoted_at": datetime.now(timezone.utc).isoformat(), "promotion_reason": reason})
    (MODELS_DIR / version / "registry_entry.json").write_text(json.dumps(e, indent=2, default=_json))
    return e


def _json(o):
    if isinstance(o, (np.integer,)):
        return int(o)
    if isinstance(o, (np.floating,)):
        return float(o)
    return str(o)


def predict_table(model, entry: dict, table: pd.DataFrame, train_means: pd.Series, as_of_iso: str) -> list[dict]:
    """Predictions in the format accepted by Administration → Models → Import predictions (store.importPredictions)."""
    feats = entry["features"]
    th = entry["thresholds"]
    ok = table[table["n_responses"] >= MIN_FEATURE_RESPONSES]
    probs = model.predict_proba(ok[feats])[:, 1] if len(ok) else []
    contribs = occlusion_contributions(model, ok[feats], train_means) if len(ok) else []
    status = "validated" if entry.get("validated_on_real_data") and entry.get("status") == "production" else "demonstration"
    out = []
    for (_, r), p, c in zip(ok.iterrows(), probs, contribs):
        cat = "high" if p >= th["high"] else "moderate" if p >= th["moderate"] else "low"
        out.append({"student_uid": r["uid"], "pseudo_id": r["pseudo_id"], "class_code": r["class_code"], "risk_probability": round(float(p), 4), "risk_category": cat,
                    "features": {f: _f(r[f]) for f in feats}, "feature_version": entry["feature_version"], "contributions": c, "explanation_method": "occlusion (set feature to training mean)",
                    "model_version": entry["model_version"], "prediction_status": status, "is_synthetic_model": not entry.get("validated_on_real_data"),
                    "predicted_at": as_of_iso, "thresholds": {k: th[k] for k in ("moderate", "high")}, "source": "python_pipeline"})
    for _, r in table[table["n_responses"] < MIN_FEATURE_RESPONSES].iterrows():
        out.append({"student_uid": r["uid"], "pseudo_id": r["pseudo_id"], "class_code": r["class_code"], "risk_probability": None, "risk_category": "unknown",
                    "reason": f"Fewer than {MIN_FEATURE_RESPONSES} marked responses", "model_version": entry["model_version"], "prediction_status": status,
                    "is_synthetic_model": not entry.get("validated_on_real_data"), "predicted_at": as_of_iso, "feature_version": entry["feature_version"], "source": "python_pipeline"})
    return out
