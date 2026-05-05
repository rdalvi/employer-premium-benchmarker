"""Core benchmarking logic for the MEPS-IC employer premium estimator.

Given an employer's state, employee count, and industry, returns benchmark
estimates for monthly premium PEPM (per employee per month) under
fully-insured and self-funded arrangements.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "meps_benchmarks.json"


@dataclass
class PremiumEstimate:
    annual: float
    monthly: float
    low: float
    high: float

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class BenchmarkResult:
    inputs: dict
    firm_size_bucket: str
    self_insured_probability: float
    fully_insured_single: PremiumEstimate
    fully_insured_family: PremiumEstimate
    fully_insured_blended_pepm: PremiumEstimate
    self_funded_single: PremiumEstimate
    self_funded_family: PremiumEstimate
    self_funded_blended_pepm: PremiumEstimate
    monthly_savings_pepm: float
    annual_savings_per_employee: float
    notes: list[str]

    def as_dict(self) -> dict:
        d = asdict(self)
        for k in (
            "fully_insured_single",
            "fully_insured_family",
            "fully_insured_blended_pepm",
            "self_funded_single",
            "self_funded_family",
            "self_funded_blended_pepm",
        ):
            d[k] = getattr(self, k).as_dict()
        return d


class Benchmarks:
    def __init__(self, data_path: Path = DATA_PATH):
        self.data = json.loads(data_path.read_text())

    @property
    def states(self) -> list[str]:
        return sorted(
            k for k in self.data["state_index_single"].keys() if not k.startswith("_")
        )

    @property
    def industries(self) -> dict[str, str]:
        return {
            k: v["label"]
            for k, v in self.data["industry_index"].items()
            if not k.startswith("_")
        }

    def firm_size_bucket(self, employees: int) -> dict:
        for b in self.data["firm_size_buckets"]:
            lo, hi = b["min"], b["max"]
            if employees >= lo and (hi is None or employees <= hi):
                return b
        raise ValueError(f"No firm-size bucket for employee count {employees}")

    def estimate(
        self,
        state: str,
        employees: int,
        industry: str,
        single_share: Optional[float] = None,
    ) -> BenchmarkResult:
        state = state.upper()
        if state not in self.data["state_index_single"]:
            raise ValueError(f"Unknown state code: {state}")
        if industry not in self.data["industry_index"]:
            raise ValueError(f"Unknown industry: {industry}")
        if employees < 1:
            raise ValueError("Employee count must be >= 1")

        baseline = self.data["national_baseline"]
        bucket = self.firm_size_bucket(employees)
        ind_factor = self.data["industry_index"][industry]["factor"]
        sf_adj = self.data["self_funded_adjustment"]
        unc = self.data["model_uncertainty"]

        single_share = (
            single_share
            if single_share is not None
            else self.data["enrollment_mix"]["single_share"]
        )
        family_share = 1.0 - single_share

        single_annual = (
            baseline["single_annual"]
            * self.data["state_index_single"][state]
            * bucket["single_index"]
            * ind_factor
        )
        family_annual = (
            baseline["family_annual"]
            * self.data["state_index_family"][state]
            * bucket["family_index"]
            * ind_factor
        )

        fi_single = self._wrap(single_annual, unc["single_pct"])
        fi_family = self._wrap(family_annual, unc["family_pct"])
        fi_blended = self._blend(fi_single, fi_family, single_share, family_share)

        sf_single_annual = single_annual * sf_adj["single_ratio"]
        sf_family_annual = family_annual * sf_adj["family_ratio"]
        # Self-funded carries additional employer-specific variance from claims volatility.
        sf_unc_single = unc["single_pct"] + sf_adj["uncertainty_pct"]
        sf_unc_family = unc["family_pct"] + sf_adj["uncertainty_pct"]
        sf_single = self._wrap(sf_single_annual, sf_unc_single)
        sf_family = self._wrap(sf_family_annual, sf_unc_family)
        sf_blended = self._blend(sf_single, sf_family, single_share, family_share)

        monthly_savings = fi_blended.monthly - sf_blended.monthly
        annual_savings = monthly_savings * 12

        notes = self._build_notes(employees, bucket, state)

        return BenchmarkResult(
            inputs={
                "state": state,
                "employees": employees,
                "industry": industry,
                "industry_label": self.data["industry_index"][industry]["label"],
                "single_share": single_share,
                "family_share": family_share,
            },
            firm_size_bucket=bucket["label"],
            self_insured_probability=bucket["self_insured_pct"],
            fully_insured_single=fi_single,
            fully_insured_family=fi_family,
            fully_insured_blended_pepm=fi_blended,
            self_funded_single=sf_single,
            self_funded_family=sf_family,
            self_funded_blended_pepm=sf_blended,
            monthly_savings_pepm=round(monthly_savings, 2),
            annual_savings_per_employee=round(annual_savings, 2),
            notes=notes,
        )

    @staticmethod
    def _wrap(annual: float, uncertainty_pct: float) -> PremiumEstimate:
        return PremiumEstimate(
            annual=round(annual, 0),
            monthly=round(annual / 12, 2),
            low=round(annual * (1 - uncertainty_pct) / 12, 2),
            high=round(annual * (1 + uncertainty_pct) / 12, 2),
        )

    @staticmethod
    def _blend(
        single: PremiumEstimate,
        family: PremiumEstimate,
        single_share: float,
        family_share: float,
    ) -> PremiumEstimate:
        monthly = single.monthly * single_share + family.monthly * family_share
        low = single.low * single_share + family.low * family_share
        high = single.high * single_share + family.high * family_share
        return PremiumEstimate(
            annual=round(monthly * 12, 0),
            monthly=round(monthly, 2),
            low=round(low, 2),
            high=round(high, 2),
        )

    def _build_notes(self, employees: int, bucket: dict, state: str) -> list[str]:
        notes = [
            f"Benchmark based on AHRQ MEPS-IC {self.data['_meta']['data_year']} published summary tables.",
            f"Estimates apply to employers in the {bucket['label']} bucket; "
            f"~{int(bucket['self_insured_pct']*100)}% of enrollees in this size bucket "
            f"are in self-insured plans nationally.",
            "Self-funded figure is an employer-cost equivalent (claims + admin + stop-loss), "
            "not a market premium.",
            "Range reflects benchmark-level uncertainty only. True quotes also depend on "
            "workforce age/sex mix, claims history, plan design, and carrier — none of which "
            "MEPS-IC captures at the employer level.",
        ]
        if employees < 50:
            notes.append(
                "At <50 employees, ACA small-group rating rules apply (modified community rating). "
                "Self-funded comparison is unusual at this size and stop-loss costs can be material."
            )
        if employees >= 1000:
            notes.append(
                "At 1,000+ employees, the vast majority of similar employers are already self-funded; "
                "fully-insured benchmark is shown for comparison but may not be a realistic option."
            )
        return notes


def estimate(
    state: str,
    employees: int,
    industry: str,
    single_share: Optional[float] = None,
) -> BenchmarkResult:
    return Benchmarks().estimate(state, employees, industry, single_share)
