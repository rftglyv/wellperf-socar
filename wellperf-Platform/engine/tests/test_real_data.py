"""Acceptance checks on the real hackathon data (skipped when the dataset or model is absent)."""

from __future__ import annotations

import pytest

from wellperf import config, pipeline, vfm

pytestmark = pytest.mark.skipif(
    not (config.DATA_DIR / config.HIGH_FREQ_FILE).exists() or not config.MODEL_PATH.exists(),
    reason="real dataset or trained model not available",
)


@pytest.fixture(scope="module")
def real():
    prepared = pipeline.prepare_from_dir()
    model = vfm.load_model()
    pred = pipeline.predict(prepared, model)
    analyses, failures = pipeline.analyse_all_events(prepared, pred)
    return prepared, model, pred, analyses, failures


def _by_well(analyses):
    return {a.event[config.WELL_COL]: a.result for a in analyses.values()}


def test_unstable_buildups_not_rated_good(real):
    results = _by_well(real[3])
    assert results["GL-01"].iarf_quality != "good"
    assert results["GL-10"].iarf_quality != "good"


@pytest.mark.parametrize("well", ["GL-02", "GL-04", "GL-06", "GL-08"])
def test_stable_buildups_rated_good(real, well):
    r = _by_well(real[3])[well]
    assert r.iarf_quality == "good"
    assert (r.k_max_md - r.k_min_md) / r.permeability_md < 0.05


def test_gl01_pi_uses_measured_pressure(real):
    r = _by_well(real[3])["GL-01"]
    assert r.pressure_basis == "last_measured"
    assert r.productivity_index_stbd_psi == pytest.approx(3.76, abs=0.1)


def test_field_wide_gas_lift_upset_on_14_june(real):
    upsets = real[0].upsets
    june = upsets[(upsets["start"] >= "2025-06-14 09:30") & (upsets["start"] <= "2025-06-14 10:30")]
    assert set(june[config.WELL_COL]) == {f"GL-{i:02d}" for i in range(1, 11)}
    assert (june["scope"] == "field-wide").all()


def test_shut_ins_are_not_upsets(real):
    prepared = real[0]
    for _, ev in prepared.events.iterrows():
        same = prepared.upsets[prepared.upsets[config.WELL_COL] == ev[config.WELL_COL]]
        overlap = (same["start"] < ev["shut_in_end"]) & (same["end"] > ev["shut_in_start"])
        assert not overlap.any(), ev["event_id"]


def test_pwf_sensitivity_negative_for_every_well(real):
    sens = vfm.sensitivities(real[1])
    assert (sens["liquid_pct_per_10psi_pwf"] < 0).all()


def test_forward_validation_present(real):
    model = real[1]
    assert 40 <= len(model.forward_predictions) <= 70
    oil = model.forward_metrics[model.forward_metrics["target"] == "oil_rate_stbd"].set_index("method")["MAPE_pct"]
    assert oil["VFM model"] < oil["Last test carried forward (baseline)"]
