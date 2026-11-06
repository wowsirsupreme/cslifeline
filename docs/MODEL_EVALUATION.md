# Model evaluation

> **All results below were obtained on SYNTHETIC data.** They show that the pipeline runs, that the validation design works and what it reports. They say nothing about how well any model predicts real learners, and must not be cited as predictive accuracy. Re-run the pipeline on real, consented data before making any claim.

Full generated report: `ml/reports/evaluation_logistic-regression-20261106-4ed8f1.md` (with figures). Registry entry: `ml/models/logistic-regression-20261106-4ed8f1/registry_entry.json`. Data hash `4ed8f1…` (seed 2026); scikit-learn 1.9.1; Python 3.13.

## 1. Set-up

* Training term H1: 467 labelled rows from 289 learners; prevalence 6.2 %.
* Temporal hold-out term H2: 465 labelled rows from 269 **different** learners; prevalence 10.3 %.
* Label: assessment accuracy below 50 % in the 28 days after the cut-off (after weeks 5 and 8).

## 2. Model comparison

| Model | CV PR-AUC | CV ROC-AUC | Hold-out PR-AUC | Hold-out ROC-AUC | Hold-out recall | Hold-out precision | Hold-out Brier | Hold-out ECE |
|---|---|---|---|---|---|---|---|---|
| **Logistic regression (chosen)** | 0.447 | 0.943 | 0.755 | 0.964 | 0.90 | 0.48 | 0.045 | 0.016 |
| Decision tree | 0.347 | 0.883 | 0.547 | 0.916 | 0.88 | 0.49 | 0.055 | 0.018 |
| Random forest | 0.433 | 0.937 | 0.716 | 0.957 | 0.83 | 0.53 | 0.050 | 0.030 |
| Gradient boosting | 0.443 | 0.931 | 0.577 | 0.942 | 0.85 | 0.54 | 0.067 | 0.059 |
| SVM (RBF) | 0.322 | 0.823 | 0.642 | 0.917 | 0.92 | 0.27 | 0.063 | 0.050 |
| XGBoost | 0.430 | 0.937 | 0.660 | 0.945 | 0.81 | 0.52 | 0.058 | 0.045 |

Logistic regression had the best cross-validated PR-AUC, so the selection rule chose it. It also has the best calibration on the hold-out term. The more complex models did not earn their place on this data.

## 3. Chosen model on the hold-out term

PR-AUC 0.755 against a no-skill baseline of 0.103; ROC-AUC 0.964; Brier 0.045; ECE 0.016.

| Threshold | Value | Accuracy | Precision | Recall | F1 | TP | FP | FN | TN |
|---|---|---|---|---|---|---|---|---|---|
| Moderate or high (flag) | 0.102 | 0.890 | 0.483 | 0.896 | 0.628 | 43 | 46 | 5 | 371 |
| High only | 0.179 | 0.918 | 0.574 | 0.812 | 0.672 | 39 | 29 | 9 | 388 |

The 70 % precision target for "high" was not reachable on the training term, so the recorded rule fell back to the F1-maximising threshold. At the flag threshold, about half of flagged learners went on to do fine (false positives: a conversation that turns out unnecessary) and 5 of 48 learners who fell below 50 % were missed (false negatives). Missed learners had higher prior accuracy than caught ones — the model, like a teacher, is slow to anticipate a sudden drop.

## 4. Ablation and cross-platform experiments

| Comparison (hold-out PR-AUC) | Result | 95 % CI of difference |
|---|---|---|
| Outcome features only vs. full set (+ behaviour and engagement) | 0.746 vs 0.755 | −0.037 to +0.052 — **no demonstrated gain** |
| CS Lifeline features vs. + verified WOW Sir and DBWOW features (all learners) | 0.755 vs 0.752 | −0.065 to +0.061 — no demonstrated gain |
| Learners with a verified WOW Sir link: CS Lifeline only vs. combined | 0.579 vs 0.646 | −0.047 to +0.174 — no demonstrated gain |
| Learners with a verified DBWOW link: CS Lifeline only vs. combined | 0.823 vs 0.856 | −0.069 to +0.170 — no demonstrated gain |

In the simulation, behaviour and cross-platform data did not add predictive value beyond CS Lifeline's own assessment and practice records. Whether they do for real learners is an open research question that this pipeline can now answer once real data exists.

## 5. Misconception engine (mce-1.1) against simulated ground truth

Synthetic learners hold known misconceptions, so classifications can be checked (`scripts/evaluate-misconceptions.mjs`; tuned on H1, reported on H2).

| Classified as | Precision | Recall |
|---|---|---|
| demonstrated | 27.4 % | 13.0 % |
| demonstrated or possible | 12.2 % | 38.6 % |

* No misconception was ever reported as demonstrated from fewer than two wrong answers.
* Version 1.0 had 16.3 % precision for "demonstrated"; requiring discriminating distractors and errors above the learner's own baseline raised it to 27–30 % at the cost of recall.
* The main limit is the question bank: on many items every distractor is linked to the same misconception, so a wrong answer cannot separate that misconception from guessing. **Writing items whose distractors map to different misconceptions is the most effective way to improve detection** (the question editor shows this warning).
* Part of the "false positives" are misconceptions that were genuinely shown and then resolved during the term.

These figures make the engine's behaviour transparent; they are conservative by design, which is why teachers can review and correct every classification.
