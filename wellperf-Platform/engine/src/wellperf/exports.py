"""Excel and HTML report exports for both deliverables."""

from __future__ import annotations

import html
from io import BytesIO

import pandas as pd
from plotly.offline import get_plotlyjs

from wellperf import config
from wellperf.features import DATE_COL
from wellperf.pipeline import EventAnalysis
from wellperf.pta import interpret

VFM_DELIVERABLE_COLS = ["date", "well_name", "oil_rate_stbd", "water_rate_stbd", "gas_rate_mscfd"]
PTA_DELIVERABLE_COLS = [
    "event_id",
    "well_name",
    "shut_in_start",
    "shut_in_end",
    "horner_slope_psi_per_cycle",
    "skin",
    "permeability_md",
    "delta_p_skin_psi",
]


def _to_excel(sheets: dict[str, pd.DataFrame]) -> bytes:
    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        for name, df in sheets.items():
            df.to_excel(writer, sheet_name=name[:31], index=False)
            sheet = writer.sheets[name[:31]]
            for i, col in enumerate(df.columns, start=1):
                width = min(45, max(10, len(str(col)) + 2))
                sheet.column_dimensions[sheet.cell(row=1, column=i).column_letter].width = width
    return buffer.getvalue()


def vfm_deliverable(pred: pd.DataFrame) -> pd.DataFrame:
    out = pred.rename(columns={DATE_COL: "date"})[VFM_DELIVERABLE_COLS]
    return out.assign(date=out["date"].dt.date).round({"oil_rate_stbd": 1, "water_rate_stbd": 1, "gas_rate_mscfd": 1})


def vfm_excel(pred: pd.DataFrame, cv_metrics: pd.DataFrame, cv_pred: pd.DataFrame,
              corrections: pd.DataFrame, qc: pd.DataFrame, extra_sheets: dict[str, pd.DataFrame] | None = None) -> bytes:
    """Sheet 'predictions' holds exactly the deliverable columns; P10/P90 bands go to 'prediction_details'."""
    return _to_excel(
        {
            "predictions": vfm_deliverable(pred),
            "prediction_details": pred.assign(**{DATE_COL: pred[DATE_COL].dt.date}),
            "validation_metrics": cv_metrics.round(3),
            "validation_per_test": cv_pred,
            "well_test_corrections": corrections,
            "sensor_data_quality": qc,
            **(extra_sheets or {}),
        }
    )


def round_numeric(df: pd.DataFrame, decimals: int) -> pd.DataFrame:
    numeric = df.select_dtypes("number").columns
    return df.assign(**{c: df[c].round(decimals) for c in numeric})


def pta_deliverable(results: pd.DataFrame) -> pd.DataFrame:
    extras = [c for c in results.columns if c not in PTA_DELIVERABLE_COLS]
    return results[PTA_DELIVERABLE_COLS + extras]


def pta_excel(results: pd.DataFrame, analyses: dict[str, EventAnalysis]) -> bytes:
    inputs = pd.DataFrame(
        [{"event_id": k, **a.inputs.__dict__, "tp_hours": a.inputs.tp_hours} for k, a in analyses.items()]
    )
    notes = pd.DataFrame(
        [{"event_id": k, "interpretation": " ".join(interpret(a.result))} for k, a in analyses.items()]
    )
    return _to_excel(
        {
            "reservoir_properties": round_numeric(pta_deliverable(results), 4),
            "analysis_inputs": inputs,
            "interpretation": notes,
        }
    )


def html_report(title: str, sections: list[tuple[str, str]]) -> str:
    """sections = [(heading, html_fragment)]; plotly.js is embedded once, so the report works offline."""
    body = "\n".join(f"<section><h2>{html.escape(h)}</h2>{frag}</section>" for h, frag in sections)
    return f"""<!doctype html><html><head><meta charset="utf-8"><title>{html.escape(title)}</title>
<script type="text/javascript">{get_plotlyjs()}</script>
<style>body{{font-family:system-ui,sans-serif;max-width:1150px;margin:24px auto;padding:0 16px;color:#222}}
table{{border-collapse:collapse;font-size:13px}}td,th{{border:1px solid #ccc;padding:4px 8px;text-align:right}}
th{{background:#f2f2f2}}h2{{border-bottom:2px solid #2E7D32;padding-bottom:4px}}</style></head>
<body><h1>{html.escape(title)}</h1>{body}</body></html>"""


def fig_html(fig) -> str:
    return fig.to_html(full_html=False, include_plotlyjs=False)


def table_html(df: pd.DataFrame) -> str:
    return df.to_html(index=False, float_format=lambda v: f"{v:,.3f}", border=0)


def summarize_events(analyses: dict[str, EventAnalysis]) -> pd.DataFrame:
    return pd.DataFrame(
        [{"event_id": k, config.WELL_COL: a.event[config.WELL_COL], "interpretation": " ".join(interpret(a.result))}
         for k, a in analyses.items()]
    )
