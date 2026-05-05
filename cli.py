"""Command-line wrapper for the MEPS-IC employer premium benchmarker.

Examples:
    python cli.py --state CA --employees 250 --industry professional_services
    python cli.py --list-industries
    python cli.py --state TX --employees 1200 --industry manufacturing --json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from benchmark import Benchmarks  # noqa: E402


def _print_industries(bm: Benchmarks) -> None:
    print("Available industry codes:")
    for k, label in bm.industries.items():
        print(f"  {k:<32}  {label}")


def _print_states(bm: Benchmarks) -> None:
    print("Available state codes: " + ", ".join(bm.states))


def _print_human(result) -> None:
    inputs = result.inputs
    fi = result.fully_insured_blended_pepm
    sf = result.self_funded_blended_pepm
    print()
    print(f"Employer profile : {inputs['employees']:,} employees, "
          f"{inputs['industry_label']}, {inputs['state']}")
    print(f"Firm-size bucket : {result.firm_size_bucket} "
          f"(~{int(result.self_insured_probability*100)}% self-funded nationally)")
    print()
    print("BLENDED PEPM (single + family weighted)")
    print(f"  Fully-insured           : ${fi.monthly:>9,.2f}/mo   "
          f"(range ${fi.low:,.2f} – ${fi.high:,.2f})")
    print(f"  Self-funded equivalent  : ${sf.monthly:>9,.2f}/mo   "
          f"(range ${sf.low:,.2f} – ${sf.high:,.2f})")
    print(f"  Difference (FI − SF)    : ${result.monthly_savings_pepm:>9,.2f}/mo  "
          f"= ${result.annual_savings_per_employee:,.0f}/yr per employee")
    print()
    print("BY COVERAGE TIER (annual)")
    print(f"  Single  FI: ${result.fully_insured_single.annual:>9,.0f}   "
          f"SF: ${result.self_funded_single.annual:>9,.0f}")
    print(f"  Family  FI: ${result.fully_insured_family.annual:>9,.0f}   "
          f"SF: ${result.self_funded_family.annual:>9,.0f}")
    print()
    total_fi = fi.monthly * 12 * inputs["employees"]
    total_sf = sf.monthly * 12 * inputs["employees"]
    print("ESTIMATED ANNUAL TOTALS")
    print(f"  Fully-insured           : ${total_fi:>14,.0f}")
    print(f"  Self-funded equivalent  : ${total_sf:>14,.0f}")
    print(f"  Implied annual savings  : ${total_fi - total_sf:>14,.0f}")
    print()
    print("NOTES")
    for n in result.notes:
        print(f"  - {n}")
    print()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Benchmark monthly employer health premium (FI vs SF) "
                    "using MEPS-IC data."
    )
    parser.add_argument("--state", help="Two-letter state code (e.g. CA)")
    parser.add_argument("--employees", type=int, help="Number of employees")
    parser.add_argument("--industry", help="Industry code (see --list-industries)")
    parser.add_argument(
        "--single-share",
        type=float,
        default=None,
        help="Override share of enrollees on single coverage (0–1).",
    )
    parser.add_argument("--json", action="store_true", help="Output JSON instead of human-readable.")
    parser.add_argument("--list-industries", action="store_true")
    parser.add_argument("--list-states", action="store_true")
    args = parser.parse_args(argv)

    bm = Benchmarks()

    if args.list_industries:
        _print_industries(bm)
        return 0
    if args.list_states:
        _print_states(bm)
        return 0

    missing = [n for n in ("state", "employees", "industry") if getattr(args, n) is None]
    if missing:
        parser.error(f"missing required arguments: {', '.join('--' + m for m in missing)}")

    try:
        result = bm.estimate(
            state=args.state,
            employees=args.employees,
            industry=args.industry,
            single_share=args.single_share,
        )
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(result.as_dict(), indent=2))
    else:
        _print_human(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
