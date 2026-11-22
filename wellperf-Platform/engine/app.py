"""Intelligent Well Performance Analysis — Streamlit entry point.

Run:  uv run streamlit run app.py
"""

from __future__ import annotations

import streamlit as st

from wellperf.ui import page_data, page_export, page_pta, page_vfm

st.set_page_config(page_title="Well Performance Analysis", page_icon="🛢️", layout="wide")

PAGES = [
    st.Page(page_data.render, title="1 · Field data", url_path="data", default=True),
    st.Page(page_vfm.render, title="2 · Virtual flow metering", url_path="vfm"),
    st.Page(page_pta.render, title="3 · Pressure transient analysis", url_path="pta"),
    st.Page(page_export.render, title="4 · Reports & export", url_path="export"),
]

with st.sidebar:
    st.title("Well Performance")
    st.caption("VFM → PTA workflow: raw sensor data to reservoir properties.")

st.navigation(PAGES).run()
