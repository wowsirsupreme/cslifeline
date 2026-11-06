"""Evaluation report (Markdown + figures) generated from measured results only."""
from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from sklearn.metrics import precision_recall_curve, roc_curve  # noqa: E402

from .pipeline import MODEL_LABELS, reliability  # noqa: E402

plt.rcParams.update({"font.family": "serif", "font.size": 10})


def _fmt(x, d=3):
    return "n/a" if x is None else f"{x:.{d}f}"


def write_report(res: dict, out: Path) -> Path:
    e, m = res["entry"], res["entry"]["metrics"]
    fig_dir = out / "figures"
    fig_dir.mkdir(parents=True, exist_ok=True)
    y, p = res["test_y"], res["test_probs"]

    fig, ax = plt.subplots(1, 3, figsize=(12, 3.6))
    pr, rc, _ = precision_recall_curve(y, p)
    ax[0].plot(rc, pr, color="black")
    ax[0].axhline(y.mean(), ls="--", color="grey", lw=0.8)
    ax[0].set(xlabel="Recall", ylabel="Precision", title="Precision–recall (hold-out)")
    fpr, tpr, _ = roc_curve(y, p)
    ax[1].plot(fpr, tpr, color="black")
    ax[1].plot([0, 1], [0, 1], ls="--", color="grey", lw=0.8)
    ax[1].set(xlabel="False positive rate", ylabel="True positive rate", title="ROC (hold-out)")
    rel = reliability(y, p)
    ax[2].plot([r["mean_predicted"] for r in rel], [r["observed_rate"] for r in rel], "o-", color="black")
    ax[2].plot([0, 1], [0, 1], ls="--", color="grey", lw=0.8)
    ax[2].set(xlabel="Mean predicted probability", ylabel="Observed at-risk rate", title="Calibration (hold-out)")
    fig.tight_layout()
    fig.savefig(fig_dir / f"{e['model_version']}_curves.png", dpi=150)
    plt.close(fig)

    t = m["test"]
    L = [f"# Model evaluation — {e['model_version']}", ""]
    if e.get("warning"):
        L += [f"> **{e['warning']}**", ""]
    tr = e["training"]
    L += ["## Set-up", "",
          f"* Label: {e['label_definition']}",
          f"* Training cohort {tr['train_cohort']}: {tr['train_rows']} rows from {tr['train_learners']} learners (prevalence {tr['train_prevalence']:.1%}).",
          f"* Temporal hold-out cohort {tr['test_cohort']}: {tr['test_rows']} rows from {tr['test_learners']} different learners (prevalence {tr['test_prevalence']:.1%}).",
          f"* Features ({e['feature_version']}): {', '.join(e['features'])}. Page interruptions are not used.",
          f"* Selection rule: {tr['selection_rule']}. Chosen: **{e['model_name']}**.",
          f"* Thresholds: moderate ≥ {e['thresholds']['moderate']}, high ≥ {e['thresholds']['high']} — {e['thresholds']['rule']}.",
          f"* Data hash {tr['data_hash']}, seed {tr['seed']}, scikit-learn {tr['sklearn']}, Python {tr['python']}, trained {tr['trained_at'][:19]}Z.", "",
          "## Model comparison", "", "| Model | CV PR-AUC | CV ROC-AUC | CV Brier | Hold-out PR-AUC | Hold-out ROC-AUC | Hold-out recall | Hold-out precision | Hold-out Brier | Hold-out ECE |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for k, cv in m["cv"].items():
        ho = m["test_all_models"][k]
        L.append(f"| {MODEL_LABELS[k]}{' (chosen)' if k == e['model_type'] else ''} | {_fmt(cv['pr_auc'])} | {_fmt(cv['roc_auc'])} | {_fmt(cv['brier'])} | {_fmt(ho['pr_auc'])} | {_fmt(ho['roc_auc'])} | {_fmt(ho.get('recall'), 2)} | {_fmt(ho.get('precision'), 2)} | {_fmt(ho['brier'])} | {_fmt(ho['ece'])} |")
    L += ["", "Recall and precision are at each model's own 'moderate' threshold chosen on its out-of-fold training predictions.", "",
          "## Chosen model on the hold-out cohort", "",
          f"PR-AUC {_fmt(t['pr_auc'])} (no-skill baseline = prevalence {t['prevalence']:.3f}), ROC-AUC {_fmt(t['roc_auc'])}, Brier {_fmt(t['brier'])}, ECE {_fmt(t['ece'])}.", "",
          "| Threshold | Value | Accuracy | Precision | Recall | F1 | TP | FP | FN | TN |", "|---|---|---|---|---|---|---|---|---|---|"]
    for name in ("flag", "high"):
        x = t[name]
        c = x["confusion"]
        L.append(f"| {'Moderate or high (flag)' if name == 'flag' else 'High only'} | {x['threshold']:.3f} | {x['accuracy']:.3f} | {x['precision']:.3f} | {x['recall']:.3f} | {x['f1']:.3f} | {c['tp']} | {c['fp']} | {c['fn']} | {c['tn']} |")
    er = m["errors"]
    L += ["", f"![curves](figures/{e['model_version']}_curves.png)", "", "## False positives and false negatives", "",
          f"At the flag threshold the model raised {er['false_positives']} false alarms (learners who went on to score at least 50 %) and missed {er['false_negatives']} learners who did fall below 50 % "
          f"({er['true_positives']} were caught). Missed learners compared with caught ones (mean feature values):", "",
          "| Feature | Missed (FN) | Caught (TP) |", "|---|---|---|"]
    for f, v in er["fn_vs_tp_mean_features"].items():
        L.append(f"| {f} | {_fmt(v['fn'])} | {_fmt(v['tp'])} |")
    L += ["", "A false positive costs a teacher conversation; a false negative means a learner who needed help was not flagged. For an early-warning tool the moderate threshold is set for recall, and teachers are told that flags are prompts, not judgements.", "",
          "## Calibration (hold-out)", "", "| Predicted bin | n | Mean predicted | Observed rate |", "|---|---|---|---|"]
    for r in reliability(y, p):
        L.append(f"| {r['bin']} | {r['n']} | {r['mean_predicted']:.3f} | {r['observed_rate']:.3f} |")
    L += ["", "## Subgroups (hold-out)", "", "| Group | n | Prevalence | PR-AUC | Recall | Precision |", "|---|---|---|---|---|---|"]
    for s in m["subgroups"]:
        L.append(f"| {s['group']} | {s['n']} | {_fmt(s['prevalence'])} | {_fmt(s['pr_auc'])} | {_fmt(s['recall'], 2)} | {_fmt(s['precision'], 2)} |")
    ab = m["ablation"]
    d = ab["pr_auc_gain_of_behaviour_and_engagement"]
    L += ["", "## Ablation: do behaviour and engagement features add anything?", "",
          f"Outcome features only: PR-AUC {_fmt(ab['outcomes_only']['pr_auc'])}. Full feature set: PR-AUC {_fmt(ab['cslifeline_full']['pr_auc'])}. "
          f"Difference {d['diff']:+.3f} (95 % learner-level bootstrap CI {d['ci_low']:+.3f} to {d['ci_high']:+.3f}, {d['reps']} resamples)."
          + (" The interval includes zero, so no improvement is demonstrated." if d['ci_low'] <= 0 <= d['ci_high'] else ""), "",
          "## Cross-platform comparison (WOW Sir, DBWOW)", ""]
    xp = m["cross_platform"]
    dd = xp["combined_minus_cslifeline"]
    L.append(f"All hold-out rows: CS Lifeline features PR-AUC {_fmt(xp['cslifeline']['pr_auc'])}; with verified WOW Sir and DBWOW features {_fmt(xp['combined']['pr_auc'])} "
             f"(difference {dd['diff']:+.3f}, 95 % CI {dd['ci_low']:+.3f} to {dd['ci_high']:+.3f}).")
    for k, lab in (("wowsir_only", "WOW Sir"), ("dbwow_only", "DBWOW")):
        v = xp[k]
        if "skipped" in v:
            L.append(f"* {lab}: {v['skipped']}.")
        else:
            c = v["combined_minus_cslifeline"]
            L.append(f"* Learners with a verified {lab} link ({v['rows_test']} hold-out rows): {lab} features alone PR-AUC {_fmt(v['platform_only']['pr_auc'])}; CS Lifeline alone {_fmt(v['cslifeline_same_rows']['pr_auc'])}; "
                     f"combined {_fmt(v['combined_same_rows']['pr_auc'])} (combined − CS Lifeline {c['diff']:+.3f}, CI {c['ci_low']:+.3f} to {c['ci_high']:+.3f}).")
    L += ["", "Combined data is reported as better only when the confidence interval excludes zero.", "",
          "## Most influential features", "", "| Feature | Weight |", "|---|---|"]
    for r in e["importance"][:10]:
        L.append(f"| {r['feature']} | {r['weight']:+.3f} |")
    L += ["", "Weights are standardised logistic coefficients (log-odds per standard deviation) for logistic regression, or impurity importance for tree ensembles.", ""]
    path = out / f"evaluation_{e['model_version']}.md"
    path.write_text("\n".join(L))
    (out / "LATEST.md").write_text("\n".join(L))
    return path
