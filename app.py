"""Streamlit UI for the MEPS-IC employer premium benchmarking tool.

Run:  streamlit run app.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from benchmark import Benchmarks  # noqa: E402


STATE_NAMES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
    "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
    "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii",
    "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
    "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine",
    "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska",
    "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico",
    "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
    "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island",
    "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas",
    "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington",
    "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
}


@st.cache_resource
def load_benchmarks() -> Benchmarks:
    return Benchmarks()


def fmt_dollar(x: float) -> str:
    return f"${x:,.0f}"


def fmt_dollar_cents(x: float) -> str:
    return f"${x:,.2f}"


def main() -> None:
    st.set_page_config(
        page_title="Employer Premium Benchmarker",
        page_icon=None,
        layout="wide",
    )

    bm = load_benchmarks()
    meta = bm.data["_meta"]

    st.title("Employer Health Premium Benchmarker")
    st.caption(
        f"Benchmarks derived from {meta['publication']}. "
        f"Data year: {meta['data_year']}. "
        "Estimates are bucket-level benchmarks, not underwritten quotes."
    )

    with st.sidebar:
        st.header("Employer profile")
        state_options = sorted(bm.states, key=lambda c: STATE_NAMES.get(c, c))
        state = st.selectbox(
            "State",
            options=state_options,
            format_func=lambda c: f"{STATE_NAMES.get(c, c)} ({c})",
            index=state_options.index("CA") if "CA" in state_options else 0,
        )

        employees = st.number_input(
            "Number of employees",
            min_value=1,
            max_value=500_000,
            value=250,
            step=10,
        )

        industries = bm.industries
        industry_keys = list(industries.keys())
        default_ind = "professional_services"
        industry = st.selectbox(
            "Industry",
            options=industry_keys,
            format_func=lambda k: industries[k],
            index=industry_keys.index(default_ind) if default_ind in industry_keys else 0,
        )

        with st.expander("Advanced"):
            default_share = bm.data["enrollment_mix"]["single_share"]
            single_share = st.slider(
                "Share of enrollees on single-coverage tier",
                min_value=0.0,
                max_value=1.0,
                value=float(default_share),
                step=0.05,
                help="Default reflects MEPS-IC national mix (~58% single, ~42% family).",
            )

    result = bm.estimate(state, int(employees), industry, single_share=single_share)

    st.subheader(
        f"Benchmark for a {result.firm_size_bucket} {industries[industry].lower()} "
        f"employer in {STATE_NAMES.get(state, state)}"
    )

    fi = result.fully_insured_blended_pepm
    sf = result.self_funded_blended_pepm

    cols = st.columns(3)
    cols[0].metric(
        "Fully-insured PEPM",
        fmt_dollar_cents(fi.monthly),
        help=f"Range: {fmt_dollar_cents(fi.low)} – {fmt_dollar_cents(fi.high)} PEPM",
    )
    cols[1].metric(
        "Self-funded equivalent PEPM",
        fmt_dollar_cents(sf.monthly),
        delta=f"{fmt_dollar_cents(sf.monthly - fi.monthly)} vs FI",
        delta_color="inverse",
        help=f"Range: {fmt_dollar_cents(sf.low)} – {fmt_dollar_cents(sf.high)} PEPM",
    )
    cols[2].metric(
        "% of similar-size employers self-funded",
        f"{int(result.self_insured_probability * 100)}%",
        help="From MEPS-IC self-insured enrollment share, by firm-size bucket.",
    )

    st.markdown("### Breakdown by coverage tier")
    table_rows = [
        {
            "Tier": "Single coverage",
            "FI annual": fmt_dollar(result.fully_insured_single.annual),
            "FI monthly": fmt_dollar_cents(result.fully_insured_single.monthly),
            "FI range (monthly)": f"{fmt_dollar_cents(result.fully_insured_single.low)} – {fmt_dollar_cents(result.fully_insured_single.high)}",
            "SF annual": fmt_dollar(result.self_funded_single.annual),
            "SF monthly": fmt_dollar_cents(result.self_funded_single.monthly),
        },
        {
            "Tier": "Family coverage",
            "FI annual": fmt_dollar(result.fully_insured_family.annual),
            "FI monthly": fmt_dollar_cents(result.fully_insured_family.monthly),
            "FI range (monthly)": f"{fmt_dollar_cents(result.fully_insured_family.low)} – {fmt_dollar_cents(result.fully_insured_family.high)}",
            "SF annual": fmt_dollar(result.self_funded_family.annual),
            "SF monthly": fmt_dollar_cents(result.self_funded_family.monthly),
        },
    ]
    st.dataframe(table_rows, hide_index=True, use_container_width=True)

    st.markdown("### Estimated annual impact")
    annual_total_fi = fi.monthly * 12 * employees
    annual_total_sf = sf.monthly * 12 * employees
    impact_cols = st.columns(3)
    impact_cols[0].metric("Fully-insured total annual", fmt_dollar(annual_total_fi))
    impact_cols[1].metric("Self-funded equivalent total annual", fmt_dollar(annual_total_sf))
    impact_cols[2].metric(
        "Implied annual savings if self-funded",
        fmt_dollar(annual_total_fi - annual_total_sf),
        help=(
            "Equals the FI vs SF point-estimate gap times headcount. "
            "Real-world variance is large — see notes below."
        ),
    )

    st.markdown("### Notes & caveats")
    for n in result.notes:
        st.markdown(f"- {n}")

    with st.expander("How is this calculated?"):
        st.markdown(
            """
            For each of single and family coverage:

            1. Start with the **national average annual premium** from MEPS-IC.
            2. Multiply by the **state index** (state premium ÷ national premium).
            3. Multiply by the **firm-size factor** for the employer's size bucket.
            4. Multiply by the **industry factor** (national-level industry premium ratio).
            5. For self-funded, multiply by the **SF/FI cost ratio** (~0.96), reflecting elimination of
               state premium tax and insurer profit margin, net of stop-loss premium.

            Single and family results are blended using the configured enrollment-tier mix.
            The reported range reflects benchmark-level uncertainty; it does **not** include
            employer-specific variance from age/sex mix, claims history, or plan design.
            """
        )

    with st.expander("Data sources"):
        st.json(meta)


if __name__ == "__main__":
    main()
