"""Command line for the CS Lifeline research pipeline.

  python -m cslifeline_ml train   [--data synthetic | --data PATH --train-cohort H1 --test-cohort H2] [--real]
  python -m cslifeline_ml predict --model VERSION [--data synthetic --cohort C --as-of 2026-11-05T12:00:00Z] [--out FILE]
  python -m cslifeline_ml promote VERSION --reason "..."

Run from the ml/ folder (or set PYTHONPATH=ml). Google Colab: see ml/notebooks/CSLifeline_Research_Pipeline.ipynb.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import joblib
import pandas as pd

from .dataset import SYN, build_table, load_export, load_synthetic
from .pipeline import MODELS_DIR, REPORTS_DIR, labelled, predict_table, promote, save_to_registry, train_and_evaluate
from .report import write_report


def cmd_train(a):
    if a.data == "synthetic":
        data, files, source = load_synthetic(), sorted(SYN.glob("*.csv*")), "synthetic"
    else:
        data, files, source = load_export(Path(a.data)), sorted(Path(a.data).glob("*.csv")), ("real" if a.real else "export-unverified")
    print("Building feature tables (features before each cut-off, labels after)…")
    tr = build_table(data, [a.train_cohort])
    te = build_table(data, [a.test_cohort])
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    tr.to_csv(REPORTS_DIR / "features_train.csv", index=False)
    te.to_csv(REPORTS_DIR / "features_test.csv", index=False)
    res = train_and_evaluate(tr, te, source=source, data_files=files, train_label=a.train_cohort, test_label=a.test_cohort)
    d = save_to_registry(res)
    means = labelled(tr)[res["entry"]["features"]].mean()
    means.to_json(d / "train_means.json")
    rep = write_report(res, REPORTS_DIR)
    e = res["entry"]
    print(f"\nRegistered {e['model_version']} ({e['model_name']}) as CANDIDATE in {d.relative_to(MODELS_DIR.parent.parent)}")
    t = e["metrics"]["test"]
    print(f"Temporal hold-out ({a.test_cohort}): PR-AUC {t['pr_auc']:.3f} · ROC-AUC {t['roc_auc']:.3f} · recall {t['recall']:.2f} · precision {t['precision']:.2f} · Brier {t['brier']:.3f}")
    if e.get("warning"):
        print("WARNING:", e["warning"])
    print("Report:", rep)


def cmd_predict(a):
    d = MODELS_DIR / a.model
    entry = json.loads((d / "registry_entry.json").read_text())
    model = joblib.load(d / "model.joblib")
    means = pd.read_json(d / "train_means.json", typ="series")
    data = load_synthetic() if a.data == "synthetic" else load_export(Path(a.data))
    from .features import to_ms
    table = build_table(data, [a.cohort], cutoffs_ms={a.cohort: [to_ms(a.as_of)]}, with_label=False)
    preds = predict_table(model, entry, table, means, a.as_of)
    out = Path(a.out or (REPORTS_DIR / f"predictions_{a.cohort}_{entry['model_version']}.json"))
    out.write_text(json.dumps({"model_version": entry["model_version"], "prediction_status": preds[0]["prediction_status"] if preds else None,
                               "as_of": a.as_of, "count": len(preds), "predictions": preds}, indent=1))
    cats = pd.Series([p["risk_category"] for p in preds]).value_counts().to_dict()
    print(f"{len(preds)} predictions → {out}  {cats}")


def cmd_promote(a):
    e = promote(a.version, a.reason)
    print(f"{e['model_version']} is now PRODUCTION ({'validated' if e.get('validated_on_real_data') else 'DEMONSTRATION — synthetic training data'}).")


def main(argv=None):
    p = argparse.ArgumentParser(prog="cslifeline_ml")
    s = p.add_subparsers(dest="cmd", required=True)
    t = s.add_parser("train")
    t.add_argument("--data", default="synthetic")
    t.add_argument("--train-cohort", default="H1")
    t.add_argument("--test-cohort", default="H2")
    t.add_argument("--real", action="store_true", help="declare that the export is real, consented data (recorded in the registry)")
    t.set_defaults(fn=cmd_train)
    pr = s.add_parser("predict")
    pr.add_argument("--model", required=True)
    pr.add_argument("--data", default="synthetic")
    pr.add_argument("--cohort", default="C")
    pr.add_argument("--as-of", default="2026-11-05T12:00:00Z")
    pr.add_argument("--out")
    pr.set_defaults(fn=cmd_predict)
    pm = s.add_parser("promote")
    pm.add_argument("version")
    pm.add_argument("--reason", required=True)
    pm.set_defaults(fn=cmd_promote)
    a = p.parse_args(argv)
    a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
