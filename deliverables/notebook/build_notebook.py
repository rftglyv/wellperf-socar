"""Builds WellPerf_results.ipynb with every cell executed and its outputs stored (text + figures)."""
import base64, contextlib, io, json, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

CELLS = [
("md", "# WellPerf — VFM + PTA results\nSOCAR Hackathon 2026, team Enthuzone. Cells were executed against the WellPerf engine (`wellperf-Platform/engine`) with Jan–Sep 2025 loaded."),
("code", """import json, pickle, urllib.request
import pandas as pd
import matplotlib.pyplot as plt
ENGINE = "http://127.0.0.1:8000"
get = lambda p: json.load(urllib.request.urlopen(ENGINE + p))
print("engine stages:", get("/api/status")["stages"])"""),
("md", "## 1. Trained VFM model (.pkl)"),
("code", """model = pickle.load(open("../model/vfm_model.pkl", "rb"))
print(type(model).__name__)
m = get("/api/model")
print(json.dumps({k: m[k] for k in m if "mape" in k.lower()}, indent=1)[:1200])"""),
("md", "## 2. Phase 1 — VFM daily predictions"),
("code", """vfm = pd.read_csv("../vfm_daily_predictions.csv")
print(vfm.shape)
print(vfm.head(10).to_string())
print(vfm.describe().round(1).to_string())"""),
("code", """fig, ax = plt.subplots(figsize=(10, 4))
for w, g in vfm.groupby(vfm.columns[1]):
    ax.plot(pd.to_datetime(g.iloc[:, 0]), g.iloc[:, 2], lw=0.8, label=w)
ax.set_title("VFM daily oil rate per well"); ax.set_ylabel("STB/d"); ax.legend(ncol=5, fontsize=7)
plt.show()"""),
("md", "## 3. Phase 2 — PTA results (Horner, k, skin, ΔP-skin)"),
("code", """pta = pd.DataFrame(get("/api/results/pta")["results"])
cols = ["well_name","shut_in_start","horner_slope_psi_per_cycle","permeability_md","skin","delta_p_skin_psi","iarf_quality"]
print(pta[cols].round(2).to_string(index=False))"""),
("md", "## 4. PTA plots per shut-in (also saved to `../pta_plots/`)"),
("code", """for eid in pta.event_id:
    d = get(f"/api/pta/{eid}")
    fig, ax = plt.subplots(1, 3, figsize=(14, 3.8))
    L = d["loglog"]; ax[0].loglog(L["dte"], L["dp"], ".", ms=3, label="Δp"); ax[0].loglog(L["dte"], L["deriv"], ".", ms=3, label="Bourdet derivative")
    ax[0].set_title("Log-log"); ax[0].set_xlabel("Δte (h)"); ax[0].legend(fontsize=7)
    H = d["horner"]; ax[1].plot(H["ht"], H["pws"], ".", ms=3); ax[1].invert_xaxis(); ax[1].set_xscale("log"); ax[1].set_title("Horner"); ax[1].set_xlabel("(tp+Δt)/Δt")
    M = d["mdh"]; ax[2].semilogx(M["dt"], M["pws"], ".", ms=3); ax[2].set_title("MDH"); ax[2].set_xlabel("Δt (h)")
    r = d["result"]
    fig.suptitle(f"{d['well_name']} {d['shut_in_start'][:16]} · k={r['permeability_md']:.1f} md · skin={r['skin']:.2f} · ΔPskin={r['delta_p_skin_psi']:.1f} psi")
    fig.tight_layout(); fig.savefig(f"../pta_plots/{eid}.png", dpi=130)
    plt.show()"""),
]

nb = {"cells": [], "metadata": {"kernelspec": {"name": "python3", "display_name": "Python 3", "language": "python"}, "language_info": {"name": "python"}}, "nbformat": 4, "nbformat_minor": 5}
ns, n = {}, 0
for kind, src in CELLS:
    if kind == "md":
        nb["cells"].append({"cell_type": "markdown", "metadata": {}, "source": src}); continue
    n += 1
    figs = []
    plt.show = lambda *a, **k: (figs.append(plt.gcf()), plt.figure())[0]
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        exec(src, ns)
    outs = []
    if buf.getvalue():
        outs.append({"output_type": "stream", "name": "stdout", "text": buf.getvalue()})
    for f in figs:
        b = io.BytesIO(); f.savefig(b, format="png", dpi=90, bbox_inches="tight"); plt.close(f)
        outs.append({"output_type": "display_data", "metadata": {}, "data": {"image/png": base64.b64encode(b.getvalue()).decode(), "text/plain": "<Figure>"}})
    nb["cells"].append({"cell_type": "code", "execution_count": n, "metadata": {}, "source": src, "outputs": outs})
json.dump(nb, open("WellPerf_results.ipynb", "w"), indent=1)
print("cells", len(nb["cells"]))
