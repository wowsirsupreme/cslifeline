# Misconception engine evaluation (mce-1.1) — synthetic cohort H2

> Synthetic learners are generated with known misconceptions, so the engine can be checked against ground truth. These figures describe behaviour on simulated data and are not evidence about real classrooms.

Learners: 282. Simulated learner–misconception pairs: 424. Responses: 30956.

Ground truth = misconceptions the simulated learner held at the start of term. A held misconception counts as missed only if the learner answered at least one question probing it. Some held misconceptions are resolved during the term by practice or intervention, so a "false positive" can be a misconception that was genuinely shown and later resolved.

| Classified as | True positives | False positives | Missed | Precision | Recall |
|---|---|---|---|---|---|
| demonstrated | 29 | 77 | 194 | 27.4% | 13.0% |
| demonstrated or possible | 86 | 619 | 137 | 12.2% | 38.6% |

Status counts across all learner–misconception pairs with evidence: knowledge_gap 1107, isolated_error 1420, insufficient_evidence 2432, possible 599, demonstrated 106.

"Demonstrated" findings supported by fewer than two wrong answers: 0 (the engine requires repeated evidence; this must be 0).
