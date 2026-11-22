"""Builds the four deliverable files (2 Excel, 2 offline HTML reports); shared by the UI and the CLI."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from wellperf import config, exports, gaslift, pipeline, plots, pta, vfm

REPORT_PLOTS = ("loglog", "horner", "mdh", "history")


def vfm_report(prepared: pipeline.Prepared, model: vfm.VFMModel, pred: pd.DataFrame,
               tests: pd.DataFrame | None) -> str:
    sections = [
        ("Method", f"<pre>{vfm.__doc__}</pre>"),
        ("Held-out validation (leave-one-test-out)", exports.table_html(model.cv_metrics.round(3))),
        ("Forward validation (only earlier tests)", exports.table_html(model.forward_metrics.round(3))),
        ("Per-well sensitivities", exports.table_html(vfm.sensitivities(model).round(3))),
        ("Validation parity plot", exports.fig_html(plots.cv_parity(model.cv_predictions))),
        ("Well-test label corrections", exports.table_html(model.label_corrections)),
        ("Gas-lift upsets", exports.table_html(prepared.upsets)),
        ("Sensor data quality", exports.table_html(prepared.qc)),
    ]
    for well in sorted(pred[config.WELL_COL].unique()):
        sections.append((f"Daily rates — {well}", exports.fig_html(plots.daily_rates(pred, tests, well))))
    return exports.html_report("Virtual Flow Metering Report", sections)


def pta_report(prepared: pipeline.Prepared, pred: pd.DataFrame, analyses: dict[str, pipeline.EventAnalysis],
               results: pd.DataFrame) -> str:
    sections = [("Reservoir properties (k = effective permeability to oil)",
                 exports.table_html(exports.round_numeric(exports.pta_deliverable(results), 3))),
                ("Method", f"<pre>{pta.__doc__}</pre>")]
    for event_id, analysis in analyses.items():
        figs = plots.pta_figures(analysis, prepared.minute, pred)
        notes = "".join(f"<li>{n}</li>" for n in pta.interpret(analysis.result))
        body = f"<ul>{notes}</ul>" + "".join(exports.fig_html(figs[k]) for k in REPORT_PLOTS)
        sections.append((f"Shut-in {event_id} — radial flow: {analysis.result.iarf_quality}", body))
    return exports.html_report("Pressure Transient Analysis Report", sections)


def build_outputs(prepared: pipeline.Prepared, model: vfm.VFMModel, pred: pd.DataFrame,
                  analyses: dict[str, pipeline.EventAnalysis], tests: pd.DataFrame | None) -> dict[str, bytes]:
    results = pipeline.pta_results_table(analyses, pipeline.forward_oil_uncertainty(model))
    return {
        "vfm_daily_predictions.xlsx": exports.vfm_excel(
            pred, model.cv_metrics, model.cv_predictions, model.label_corrections, prepared.qc,
            {"forward_validation_metrics": model.forward_metrics.round(3),
             "forward_validation_per_test": model.forward_predictions,
             "sensitivities": vfm.sensitivities(model).round(4), "gas_lift_upsets": prepared.upsets,
             "lift_gas_ranking": gaslift.lift_gas_value(prepared.minute, prepared.upsets, results).round(2)}),
        "pta_reservoir_properties.xlsx": exports.pta_excel(results, analyses),
        "vfm_report.html": vfm_report(prepared, model, pred, tests).encode(),
        "pta_report.html": pta_report(prepared, pred, analyses, results).encode(),
    }


def write_outputs(files: dict[str, bytes], out_dir: Path = config.OUTPUTS_DIR) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    paths = [out_dir / name for name in files]
    for path, data in zip(paths, files.values()):
        path.write_bytes(data)
    return paths
