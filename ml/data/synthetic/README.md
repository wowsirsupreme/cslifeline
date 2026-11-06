# Synthetic data (generated — do not edit)

Produced by `node scripts/synthetic/generate.mjs --seed 2026` on 2026-11-06.
EVERY row is synthetic (uids start with `syn_`, `is_synthetic = true`). It exists to test software and
exercise the ML pipeline. Metrics computed on it are NOT evidence about real learners.

| File | Rows | Content |
|---|---|---|
| learners.csv | 676 | one row per synthetic learner, cohort H1 / H2 / C |
| ground_truth.csv | 676 | simulated latent ability, engagement and held misconceptions (for evaluating the misconception engine — never a model feature) |
| responses.csv.gz | 69697 | canonical response records, marked by the application's marking engine |
| sessions.csv.gz | 9271 | practice sessions |
| learning_events.csv.gz | 17152 | WOW Sir and DBWOW activity converted by the real adapters (`linkage` shows whether the learner link is verified) |
| identity_map.csv | 2681 | cross-platform identity links (only `verified` links are used) |
| interventions.csv | 264 | simulated teacher interventions |

See docs/DATA_DICTIONARY.md for every column.
