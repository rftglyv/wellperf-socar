"""Plotly figures for the VFM and PTA modules."""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from wellperf import config
from wellperf.features import DATE_COL
from wellperf.pipeline import EventAnalysis
from wellperf.pta import horner_time

OIL, WATER, GAS = "#2E7D32", "#1565C0", "#E65100"
PRESSURE, DERIV, FIT = "#37474F", "#C62828", "#6A1B9A"
SENSOR_LABELS = {
    "whp_psia": "WHP (psia)",
    "whp_downstream_psia": "Downstream WHP (psia)",
    "dh_pressure_psia": "Downhole P (psia)",
    "dh_temperature_degf": "Downhole T (°F)",
    "annulus_pressure_psia": "Annulus P (psia)",
    "gas_lift_rate_mscfd": "Gas lift (Mscf/d)",
}
BAR_LABEL_HEADROOM = 1.35  # x-axis room for labels outside bars
PLOT_BINS = 3000  # time bins for min/max envelope thinning
PHASES = (("oil_rate_stbd", OIL, "Oil (STB/d)"), ("water_rate_stbd", WATER, "Water (STB/d)"),
          ("gas_rate_mscfd", GAS, "Gas (Mscf/d)"))


def _layout(fig: go.Figure, title: str, height: int = 450) -> go.Figure:
    return fig.update_layout(title=title, height=height, margin=dict(l=60, r=20, t=60, b=40),
                             legend=dict(orientation="h", y=-0.15), template="plotly_white")


def minmax_thin(df: pd.DataFrame, col: str, bins: int = PLOT_BINS) -> tuple[np.ndarray, np.ndarray]:
    """Min and max of `col` per time bin, interleaved: spikes and short events stay visible."""
    if len(df) <= 2 * bins:
        return df[config.TIME_COL].to_numpy(), df[col].to_numpy()
    edges = pd.cut(df[config.TIME_COL], bins=bins, labels=False)
    grouped = df.groupby(edges)
    lo, hi = grouped[col].min(), grouped[col].max()
    t_lo, t_hi = grouped[config.TIME_COL].first(), grouped[config.TIME_COL].last()
    times = np.column_stack([t_lo.to_numpy(), t_hi.to_numpy()]).ravel()
    values = np.column_stack([lo.to_numpy(), hi.to_numpy()]).ravel()
    return times, values


def _shade(fig: go.Figure, spans: pd.DataFrame, start: str, end: str, color: str) -> None:
    for _, span in spans.iterrows():
        fig.add_vrect(x0=span[start], x1=span[end], fillcolor=color, opacity=0.15, line_width=0)


def sensor_panels(minute: pd.DataFrame, well: str, events: pd.DataFrame,
                  upsets: pd.DataFrame | None = None) -> go.Figure:
    df = minute[minute[config.WELL_COL] == well]
    fig = make_subplots(rows=len(SENSOR_LABELS), cols=1, shared_xaxes=True, vertical_spacing=0.02)
    for i, (col, label) in enumerate(SENSOR_LABELS.items(), start=1):
        x, y = minmax_thin(df, col)
        fig.add_trace(go.Scattergl(x=x, y=y, mode="lines", name=label, line=dict(width=1)), row=i, col=1)
        fig.update_yaxes(title_text=label, title_font=dict(size=10), row=i, col=1)
    _shade(fig, events[events[config.WELL_COL] == well], "shut_in_start", "shut_in_end", "red")
    if upsets is not None and not upsets.empty:
        _shade(fig, upsets[upsets[config.WELL_COL] == well], "start", "end", "orange")
    return _layout(fig, f"{well} — cleaned sensor data (min/max envelope; red = shut-in, orange = gas-lift upset)", 900)


def _band(fig: go.Figure, df: pd.DataFrame, col: str, color: str, secondary: bool) -> None:
    if f"{col}_p10" not in df:
        return
    x = pd.concat([df[DATE_COL], df[DATE_COL][::-1]])
    y = pd.concat([df[f"{col}_p90"], df[f"{col}_p10"][::-1]])
    fig.add_trace(go.Scatter(x=x, y=y, fill="toself", fillcolor=color, opacity=0.15, line=dict(width=0),
                             hoverinfo="skip", showlegend=False), secondary_y=secondary)


def daily_rates(pred: pd.DataFrame, tests: pd.DataFrame | None, well: str) -> go.Figure:
    """Oil and water on the left axis, gas on the right; shaded P10–P90 bands from forward validation."""
    df = pred[pred[config.WELL_COL] == well]
    t = tests[tests[config.WELL_COL] == well] if tests is not None and not tests.empty else None
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    for col, color, name in PHASES:
        secondary = col == "gas_rate_mscfd"
        _band(fig, df, col, color, secondary)
        fig.add_trace(go.Scatter(x=df[DATE_COL], y=df[col], mode="lines", name=f"VFM {name}",
                                 line=dict(color=color)), secondary_y=secondary)
        if t is not None:
            fig.add_trace(go.Scatter(x=t["test_start"], y=t[col], mode="markers", name=f"Well test {name}",
                                     marker=dict(color=color, size=9, symbol="diamond",
                                                 line=dict(width=1, color="black"))), secondary_y=secondary)
    fig.update_yaxes(title_text="Liquid rate (STB/d)", secondary_y=False)
    fig.update_yaxes(title_text="Gas rate (Mscf/d)", secondary_y=True)
    return _layout(fig, f"{well} — predicted daily rates (P10–P90 band) vs well tests")


def error_vs_time(predictions: pd.DataFrame, well: str, title: str) -> go.Figure:
    """% error (VFM − measured)/measured per phase over time for one well."""
    df = predictions[predictions[config.WELL_COL] == well].sort_values("test_start")
    fig = go.Figure()
    for col, color, name in PHASES:
        err = 100 * (df[f"{col}_vfm"] / df[f"{col}_actual"] - 1)
        fig.add_trace(go.Scatter(x=df["test_start"], y=err, mode="lines+markers", name=name.split(" ")[0],
                                 line=dict(color=color)))
    fig.add_hline(y=0, line=dict(color="grey", dash="dash"))
    fig.update_yaxes(title_text="Error vs well test (%)")
    return _layout(fig, f"{well} — {title}", 380)


def cv_parity(cv_pred: pd.DataFrame) -> go.Figure:
    fig = make_subplots(rows=1, cols=3, subplot_titles=["Oil (STB/d)", "Water (STB/d)", "Gas (Mscf/d)"])
    for i, (col, color, _) in enumerate(PHASES, 1):
        actual, pred = cv_pred[f"{col}_actual"], cv_pred[f"{col}_vfm"]
        lim = [float(min(actual.min(), pred.min()) * 0.9), float(max(actual.max(), pred.max()) * 1.1)]
        fig.add_trace(go.Scatter(x=lim, y=lim, mode="lines", line=dict(color="grey", dash="dash"), showlegend=False), 1, i)
        fig.add_trace(go.Scatter(x=actual, y=pred, mode="markers", marker=dict(color=color), name=col,
                                 text=cv_pred[config.WELL_COL], showlegend=False), 1, i)
        fig.update_xaxes(title_text="Measured (well test)", type="log", row=1, col=i)
        fig.update_yaxes(title_text="VFM (held-out)", type="log", row=1, col=i)
    return _layout(fig, "Leave-one-test-out validation: every point predicted by a model that never saw it", 420)


def pta_history(a: EventAnalysis, minute: pd.DataFrame, pred: pd.DataFrame) -> go.Figure:
    ev = a.event
    lo = ev["shut_in_start"] - pd.Timedelta(days=5)
    hi = (ev["shut_in_end"] if pd.notna(ev["shut_in_end"]) else ev["shut_in_start"]) + pd.Timedelta(days=2)
    m = minute[(minute[config.WELL_COL] == ev[config.WELL_COL]) & minute[config.TIME_COL].between(lo, hi)]
    d = pred[(pred[config.WELL_COL] == ev[config.WELL_COL]) & pred[DATE_COL].between(lo.normalize(), hi)]
    fig = make_subplots(specs=[[{"secondary_y": True}]])
    fig.add_trace(go.Scattergl(x=m[config.TIME_COL], y=m["dh_pressure_psia"], name="Downhole pressure (psia)",
                               line=dict(color=PRESSURE, width=1)), secondary_y=False)
    fig.add_trace(go.Bar(x=d[DATE_COL] + pd.Timedelta(hours=12), y=d["oil_rate_stbd"], name="VFM daily oil (STB/d)",
                         marker_color=OIL, opacity=0.45), secondary_y=True)
    fig.add_vrect(x0=ev["shut_in_start"], x1=hi if pd.isna(ev["shut_in_end"]) else ev["shut_in_end"],
                  fillcolor="red", opacity=0.08, line_width=0)
    fig.update_yaxes(title_text="Pressure (psia)", secondary_y=False)
    fig.update_yaxes(title_text="Oil rate (STB/d)", secondary_y=True)
    return _layout(fig, "Rate and pressure history around the shut-in")


def pta_loglog(a: EventAnalysis) -> go.Figure:
    d = a.diagnostics
    lo, hi = d.iarf_slice
    level = float(np.nanmedian(d.derivative[lo:hi + 1]))
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=d.dte, y=d.dp, mode="markers", name="Δp (psi)", marker=dict(color=PRESSURE, size=6)))
    fig.add_trace(go.Scatter(x=d.dte, y=d.derivative, mode="markers", name="Bourdet derivative",
                             marker=dict(color=DERIV, size=6)))
    fig.add_trace(go.Scatter(x=[d.dte[lo], d.dte[hi]], y=[level, level], mode="lines",
                             name=f"Fitted window (derivative slope {a.result.derivative_log_slope:+.3f}, "
                                  f"{a.result.iarf_quality.replace('_', ' ')})",
                             line=dict(color=FIT, width=3)))
    valid = np.isfinite(d.dp) & (d.dp > 0)
    t0, p0 = d.dte[valid][0], d.dp[valid][0]
    fig.add_trace(go.Scatter(x=[t0, t0 * 10], y=[p0, p0 * 10], mode="lines", name="Unit slope (storage)",
                             line=dict(color="grey", dash="dot")))
    fig.add_vrect(x0=d.dte[lo], x1=d.dte[hi], fillcolor=FIT, opacity=0.07, line_width=0)
    fig.update_xaxes(type="log", title_text="Equivalent time Δte (h)")
    fig.update_yaxes(type="log", title_text="Δp, Δp' (psi)")
    return _layout(fig, "Log-log diagnostic plot")


def pta_horner(a: EventAnalysis) -> go.Figure:
    r, d = a.result, a.diagnostics
    ht = horner_time(d.dt, r.tp_hours)
    pws = d.dp + r.pwf_psia
    lo, hi = d.iarf_slice
    x_line = np.array([1.0, ht.max()])
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=ht, y=pws, mode="markers", name="Shut-in pressure", marker=dict(color=PRESSURE, size=6)))
    fig.add_trace(go.Scatter(x=ht[lo:hi + 1], y=pws[lo:hi + 1], mode="markers", name="Radial-flow points",
                             marker=dict(color=FIT, size=8, symbol="circle-open")))
    fig.add_trace(go.Scatter(x=x_line, y=r.p_star_psia - r.horner_slope_psi_cycle * np.log10(x_line), mode="lines",
                             name=f"Horner line: m = {r.horner_slope_psi_cycle:.1f} psi/cycle, "
                                  f"p* (semilog extrapolation) = {r.p_star_psia:.0f} psia",
                             line=dict(color=DERIV, dash="dash")))
    fig.add_trace(go.Scatter(x=x_line, y=[r.last_measured_pws_psia] * 2, mode="lines",
                             name=f"Last measured pws = {r.last_measured_pws_psia:.0f} psia",
                             line=dict(color=OIL, dash="dot")))
    fig.update_xaxes(type="log", autorange="reversed", title_text="Horner time (tp + Δt)/Δt")
    fig.update_yaxes(title_text="Shut-in pressure pws (psia)")
    return _layout(fig, "Horner plot")


def pta_mdh(a: EventAnalysis) -> go.Figure:
    d = a.diagnostics
    lo, hi = d.iarf_slice
    pws = d.dp + a.result.pwf_psia
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=d.dt, y=pws, mode="markers", name="Shut-in pressure", marker=dict(color=PRESSURE, size=6)))
    fig.add_trace(go.Scatter(x=d.dt[lo:hi + 1], y=pws[lo:hi + 1], mode="markers", name="Radial-flow points",
                             marker=dict(color=FIT, size=8, symbol="circle-open")))
    fig.update_xaxes(type="log", title_text="Shut-in time Δt (h)")
    fig.update_yaxes(title_text="pws (psia)")
    return _layout(fig, "MDH (semilog) plot")


def pta_figures(a: EventAnalysis, minute: pd.DataFrame, pred: pd.DataFrame) -> dict[str, go.Figure]:
    return {
        "history": pta_history(a, minute, pred),
        "loglog": pta_loglog(a),
        "horner": pta_horner(a),
        "mdh": pta_mdh(a),
    }


def lift_gas_ranking(table: pd.DataFrame) -> go.Figure:
    """Horizontal bars: extra oil per +100 Mscf/d lift gas; solid = measured PI, faded = estimated."""
    from wellperf.gaslift import CONFIDENCE_MEASURED

    df = table.sort_values("oil_gain_stbd_per_100_mscfd")
    measured = df["confidence"] == CONFIDENCE_MEASURED
    fig = go.Figure(go.Bar(
        x=df["oil_gain_stbd_per_100_mscfd"], y=df[config.WELL_COL], orientation="h",
        marker=dict(color=np.where(measured, OIL, "#A5D6A7"), line=dict(color=OIL, width=1)),
        text=[f"+{v:.0f}{'' if m else ' (est.)'}" for v, m in zip(df["oil_gain_stbd_per_100_mscfd"], measured)],
        textposition="outside", hovertemplate="%{y}: +%{x:.1f} STB/d per +100 Mscf/d<extra></extra>",
    ))
    fig.update_xaxes(title_text="Extra oil (STB/d) per +100 Mscf/d of lift gas",
                     range=[0, float(df["oil_gain_stbd_per_100_mscfd"].max()) * BAR_LABEL_HEADROOM])
    return _layout(fig, "Dark = measured · light = estimated", 380)
