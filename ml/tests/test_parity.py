"""The Python features and the browser's features must be identical (risk.js ↔ features.py),
and the registered logistic artefact must give the same probability in the browser and in sklearn."""
import json
import math
from pathlib import Path

import joblib
import pandas as pd
import pytest

from cslifeline_ml.features import FEATURE_NAMES, compute_features

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "tests" / "fixtures" / "feature_parity.json"


@pytest.fixture(scope="module")
def fixture():
    if not FIX.exists():
        pytest.skip("run: node scripts/make-feature-fixture.mjs")
    return json.loads(FIX.read_text())


def close(a, b):
    if a is None or b is None:
        return a is None and b is None
    return math.isclose(float(a), float(b), rel_tol=1e-9, abs_tol=1e-9)


def test_features_match_javascript(fixture):
    for case in fixture["cases"]:
        py = compute_features(case["responses"], case["sessions"], fixture["as_of"], fixture["median_times"])
        for f in FEATURE_NAMES:
            assert close(py[f], case["features"][f]), f"{case['uid']} {f}: python {py[f]} vs js {case['features'][f]}"


def test_logistic_artefact_matches_sklearn(fixture):
    v = fixture.get("model_version")
    if not v:
        pytest.skip("no production model")
    d = ROOT / "ml" / "models" / v
    entry = json.loads((d / "registry_entry.json").read_text())
    if "artefact" not in entry:
        pytest.skip("production model is not logistic")
    model = joblib.load(d / "model.joblib")
    for case in fixture["cases"]:
        if case["js_probability"] is None:
            continue
        X = pd.DataFrame([{f: (math.nan if case["features"][f] is None else case["features"][f]) for f in entry["features"]}])
        p = model.predict_proba(X)[0, 1]
        assert math.isclose(p, case["js_probability"], abs_tol=1e-9), f"{case['uid']}: sklearn {p} vs browser {case['js_probability']}"
