"""Command-line batch run: produce every deliverable without the UI.

    uv run wellperf            # train (if well tests exist), predict, PTA, write outputs/
    uv run wellperf --no-train # reuse artifacts/vfm_model.joblib
"""

from __future__ import annotations

import argparse
import sys
import time

from wellperf import config, exports, loaders, pipeline, reports, vfm
from wellperf.well_tests import clean_well_tests, load_well_tests


def _model(prepared: pipeline.Prepared, retrain: bool) -> vfm.VFMModel:
    tests_path = loaders.find_well_test_file()
    if retrain and tests_path is not None:
        print(f"Training VFM on {tests_path.name} (with leave-one-test-out validation)…")
        model = pipeline.train_vfm(prepared, load_well_tests(tests_path))
        vfm.save_model(model)
        return model
    if config.MODEL_PATH.exists():
        print(f"Using saved model {config.MODEL_PATH}")
        return vfm.load_model()
    raise SystemExit("No well-test file found and no saved model: cannot run VFM.")


EVENT_SUMMARY_COLS = ["event_id", "permeability_md", "skin", "iarf_quality", "k_min_md", "k_max_md",
                      "pressure_basis", "productivity_index_stbd_psi"]


def _print_summary(model: vfm.VFMModel, results) -> None:
    for title, metrics in (("Held-out (leave-one-test-out)", model.cv_metrics),
                           ("Forward (earlier tests only)", model.forward_metrics)):
        if not metrics.empty:
            print(f"\nVFM MAPE % — {title}")
            print(metrics.pivot(index="target", columns="method", values="MAPE_pct").round(2).to_string())
    print("\nPTA per event")
    print(exports.round_numeric(results[EVENT_SUMMARY_COLS], 2).to_string(index=False))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="VFM + PTA batch run")
    parser.add_argument("--no-train", action="store_true", help="reuse the saved model instead of retraining")
    args = parser.parse_args(argv)

    started = time.time()
    print("Loading and cleaning sensor data…")
    prepared = pipeline.prepare_from_dir()
    model = _model(prepared, retrain=not args.no_train)
    pred = pipeline.predict(prepared, model)
    analyses, failures = pipeline.analyse_all_events(prepared, pred)
    tests_path = loaders.find_well_test_file()
    tests = clean_well_tests(load_well_tests(tests_path))[0] if tests_path else None
    files = reports.build_outputs(prepared, model, pred, analyses, tests)
    paths = reports.write_outputs(files)
    _print_summary(model, pipeline.pta_results_table(analyses, pipeline.forward_oil_uncertainty(model)))
    for _, row in failures.iterrows():
        print(f"PTA failed for {row['event_id']}: {row['error']}", file=sys.stderr)
    print(f"\nWrote {len(paths)} files to {config.OUTPUTS_DIR} in {time.time() - started:.0f}s")
    return 0 if failures.empty else 1


if __name__ == "__main__":
    raise SystemExit(main())
