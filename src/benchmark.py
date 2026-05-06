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
        pop_health: str = "average",
    ) -> BenchmarkResult:
        state = state.upper()
        if state not in self.data["state_index_single"]:
            raise ValueError(f"Unknown state code: {state}")
        if industry not in self.data["industry_index"]:
            raise ValueError(f"Unknown industry: {industry}")
        if employees < 1:
            raise ValueError("Employee count must be >= 1")
        if pop_health not in ("healthier", "average", "less_healthy"):
            raise ValueError("pop_health must be 'healthier', 'average', or 'less_healthy'")

        baseline = self.data["national_baseline"]
        bucket = self.firm_size_bucket(employees)
        ind_factor = self.data["industry_index"][industry]["factor"]
        variability = self.data["industry_index"][industry].get("health_variability_pct", 0.0)
        health_delta = (
            -variability if pop_health == "healthier"
            else variability if pop_health == "less_healthy"
            else 0.0
        )
        health_factor = 1.0 + health_delta
        unc = self.data["model_uncertainty"]
        state_tax = self.data["state_premium_tax"][state]
        insurer_margin = self.data["self_funded_components"]["insurer_margin_pct"]
        stop_loss = bucket["stop_loss_pct"]
        sf_ratio = 1.0 - state_tax - insurer_margin + stop_loss
        sf_extra_uncertainty = 0.04

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

        sf_single_annual = single_annual * sf_ratio * health_factor
        sf_family_annual = family_annual * sf_ratio * health_factor
        sf_unc_single = unc["single_pct"] + sf_extra_uncertainty
        sf_unc_family = unc["family_pct"] + sf_extra_uncertainty
        sf_single = self._wrap(sf_single_annual, sf_unc_single)
        sf_family = self._wrap(sf_family_annual, sf_unc_family)
        sf_blended = self._blend(sf_single, sf_family, single_share, family_share)

        monthly_savings = fi_blended.monthly - sf_blended.monthly
        annual_savings = monthly_savings * 12

        notes = self._build_notes(
            employees, bucket, state, sf_ratio, state_tax, insurer_margin, stop_loss, pop_health, health_delta
        )

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

    def _build_notes(
        self,
        employees: int,
        bucket: dict,
        state: str,
        sf_ratio: float,
        state_tax: float,
        insurer_margin: float,
        stop_loss: float,
        pop_health: str,
        health_delta: float,
    ) -> list[str]:
        notes = [
            f"Benchmark based on AHRQ MEPS-IC {self.data['_meta']['data_year']} published summary tables.",
            f"Estimates apply to employers in the {bucket['label']} bucket; "
            f"~{int(bucket['self_insured_pct']*100)}% of enrollees in this size bucket "
            f"are in self-insured plans nationally.",
            f"Self-funded cost built up component-wise: FI premium "
            f"− state A/H premium tax ({state_tax*100:.2f}% in {state}) "
            f"− insurer profit/risk margin ({insurer_margin*100:.1f}%) "
            f"+ stop-loss premium ({stop_loss*100:.1f}% for {bucket['label']}). "
            f"Net SF/FI ratio: {sf_ratio:.3f}.",
            "Range reflects benchmark-level uncertainty only. True quotes also depend on "
            "workforce age/sex mix, claims history, plan design, and carrier — none of which "
            "MEPS-IC captures at the employer level.",
        ]
        if health_delta != 0:
            direction = "below" if health_delta < 0 else "above"
            notes.append(
                f"Population-health adjustment: {abs(health_delta)*100:.0f}% {direction} the "
                f"industry baseline, applied to the self-funded estimate only. Fully-insured "
                f"premiums reflect industry-pooled experience and don't fully pass through a single "
                f"employer's population health, but self-funded actual claims do."
            )
        if sf_ratio >= 1.0:
            notes.append(
                "For this state and firm-size combination, modeled stop-loss cost exceeds "
                "modeled premium-tax + insurer-margin savings, so self-funding is not projected "
                "to lower employer cost."
            )
        if employees < 50:
            notes.append(
                "At <50 employees, ACA small-group rating rules apply (modified community rating). "
                "Self-funded comparison is unusual at this size; many small employers use "
                "level-funded arrangements instead."
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
    pop_health: str = "average",
) -> BenchmarkResult:
    return Benchmarks().estimate(state, employees, industry, single_share, pop_health)
