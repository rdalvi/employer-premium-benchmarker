"use strict";

const STATE_NAMES = {
  AL:"Alabama", AK:"Alaska", AZ:"Arizona", AR:"Arkansas", CA:"California",
  CO:"Colorado", CT:"Connecticut", DE:"Delaware", DC:"District of Columbia",
  FL:"Florida", GA:"Georgia", HI:"Hawaii", ID:"Idaho", IL:"Illinois",
  IN:"Indiana", IA:"Iowa", KS:"Kansas", KY:"Kentucky", LA:"Louisiana",
  ME:"Maine", MD:"Maryland", MA:"Massachusetts", MI:"Michigan", MN:"Minnesota",
  MS:"Mississippi", MO:"Missouri", MT:"Montana", NE:"Nebraska", NV:"Nevada",
  NH:"New Hampshire", NJ:"New Jersey", NM:"New Mexico", NY:"New York",
  NC:"North Carolina", ND:"North Dakota", OH:"Ohio", OK:"Oklahoma",
  OR:"Oregon", PA:"Pennsylvania", RI:"Rhode Island", SC:"South Carolina",
  SD:"South Dakota", TN:"Tennessee", TX:"Texas", UT:"Utah", VT:"Vermont",
  VA:"Virginia", WA:"Washington", WV:"West Virginia", WI:"Wisconsin", WY:"Wyoming",
};

const D = window.MEPS_DATA;

const fmtUSD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtUSD2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const $ = (id) => document.getElementById(id);

function listStates() {
  return Object.keys(D.state_index_single)
    .filter((k) => !k.startsWith("_"))
    .sort((a, b) => (STATE_NAMES[a] || a).localeCompare(STATE_NAMES[b] || b));
}
function listIndustries() {
  return Object.keys(D.industry_index).filter((k) => !k.startsWith("_"));
}
function firmSizeBucket(employees) {
  for (const b of D.firm_size_buckets) {
    if (employees >= b.min && (b.max == null || employees <= b.max)) return b;
  }
  throw new Error(`No firm-size bucket for ${employees}`);
}

function wrap(annual) {
  return { annual: Math.round(annual), monthly: annual / 12 };
}
function blend(single, family, singleShare, familyShare) {
  const monthly = single.monthly * singleShare + family.monthly * familyShare;
  return { annual: Math.round(monthly * 12), monthly };
}

function sfRatio(state, bucket) {
  const tax = D.state_premium_tax[state] ?? 0;
  const margin = D.self_funded_components.insurer_margin_pct;
  const stopLoss = bucket.stop_loss_pct;
  return {
    statePremiumTax: tax,
    insurerMargin: margin,
    stopLoss: stopLoss,
    ratio: 1 - tax - margin + stopLoss,
  };
}

function healthAdjustment(industry, popHealth) {
  const variability = D.industry_index[industry].health_variability_pct ?? 0;
  if (popHealth === "healthier") return { factor: 1 - variability, delta: -variability };
  if (popHealth === "less_healthy") return { factor: 1 + variability, delta: variability };
  return { factor: 1, delta: 0 };
}

function estimate({ state, employees, industry, singleShare, popHealth }) {
  const baseline = D.national_baseline;
  const bucket = firmSizeBucket(employees);
  const indFactor = D.industry_index[industry].factor;
  const health = healthAdjustment(industry, popHealth);
  const familyShare = 1 - singleShare;

  const fiSingleAnn =
    baseline.single_annual *
    D.state_index_single[state] *
    bucket.single_index *
    indFactor;
  const fiFamilyAnn =
    baseline.family_annual *
    D.state_index_family[state] *
    bucket.family_index *
    indFactor;

  const fiSingle = wrap(fiSingleAnn);
  const fiFamily = wrap(fiFamilyAnn);
  const fiBlended = blend(fiSingle, fiFamily, singleShare, familyShare);

  const sf = sfRatio(state, bucket);
  const sfSingle = wrap(fiSingleAnn * sf.ratio * health.factor);
  const sfFamily = wrap(fiFamilyAnn * sf.ratio * health.factor);
  const sfBlended = blend(sfSingle, sfFamily, singleShare, familyShare);

  const notes = [
    `Benchmark based on AHRQ MEPS-IC ${D._meta.data_year} published summary tables.`,
    `Estimates apply to employers in the ${bucket.label} bucket; ~${Math.round(
      bucket.self_insured_pct * 100
    )}% of enrollees in this size bucket are in self-insured plans nationally.`,
    `Self-funded cost is built up component-wise: FI premium − state A/H premium tax (${(sf.statePremiumTax * 100).toFixed(2)}% in ${state}) − insurer profit/risk margin (${(sf.insurerMargin * 100).toFixed(1)}%) + stop-loss premium (${(sf.stopLoss * 100).toFixed(1)}% for ${bucket.label}). Net ratio: ${sf.ratio.toFixed(3)}.`,
    "Figures shown are point estimates from a bucket-level model. Real-world variance is large — true quotes also depend on workforce age/sex mix, claims history, plan design, and carrier, none of which MEPS-IC captures at the employer level.",
  ];
  if (health.delta !== 0) {
    const direction = health.delta < 0 ? "below" : "above";
    notes.push(
      `Population-health adjustment: ${(Math.abs(health.delta) * 100).toFixed(0)}% ${direction} the industry baseline, applied to the self-funded estimate only. Fully-insured premiums reflect industry-pooled experience and don't fully pass through a single employer's population health, but self-funded actual claims do — which is why healthy groups have more upside in self-funding and unhealthy groups have less.`
    );
  }
  if (sf.ratio >= 1)
    notes.push(
      `For this state and firm-size combination, modeled stop-loss cost exceeds modeled premium-tax + insurer-margin savings, so self-funding is not projected to lower employer cost. Small employers in low-premium-tax states often see this result.`
    );
  if (employees < 50)
    notes.push(
      "At <50 employees, ACA small-group rating rules apply (modified community rating). Self-funded comparison is unusual at this size and stop-loss costs can be material; many small employers use level-funded arrangements instead."
    );
  if (employees >= 1000)
    notes.push(
      "At 1,000+ employees, the vast majority of similar employers are already self-funded; fully-insured benchmark is shown for comparison but may not be a realistic option."
    );

  return {
    bucket,
    fiBlended,
    sfBlended,
    sfComponents: sf,
    health,
    notes,
  };
}

function populateSelects() {
  const stateSel = $("state");
  for (const code of listStates()) {
    const o = document.createElement("option");
    o.value = code;
    o.textContent = `${STATE_NAMES[code] || code} (${code})`;
    stateSel.appendChild(o);
  }
  stateSel.value = "CA";

  const indSel = $("industry");
  for (const k of listIndustries()) {
    const o = document.createElement("option");
    o.value = k;
    o.textContent = D.industry_index[k].label;
    indSel.appendChild(o);
  }
  indSel.value = "professional_services";

  $("single-share").value = D.enrollment_mix.single_share;
}

function recalc() {
  const state = $("state").value;
  const industry = $("industry").value;
  const employees = Math.max(1, parseInt($("employees").value, 10) || 1);
  const singleShare = parseFloat($("single-share").value);
  const popHealth = $("pop-health").value;
  $("single-share-readout").textContent = `(${Math.round(singleShare * 100)}% single / ${Math.round(
    (1 - singleShare) * 100
  )}% family)`;

  const variability = D.industry_index[industry].health_variability_pct ?? 0;
  const sign = popHealth === "healthier" ? "−" : popHealth === "less_healthy" ? "+" : "±";
  const magnitude = popHealth === "average" ? 0 : variability;
  $("health-readout").textContent =
    popHealth === "average"
      ? `(industry baseline; ±${(variability * 100).toFixed(0)}% range available)`
      : `(${sign}${(magnitude * 100).toFixed(0)}% vs industry baseline)`;

  const r = estimate({ state, employees, industry, singleShare, popHealth });
  const indLabel = D.industry_index[industry].label.toLowerCase();
  $("headline-title").textContent = `Benchmark for a ${r.bucket.label} ${indLabel} employer in ${
    STATE_NAMES[state] || state
  }`;

  $("fi-pepm").textContent = fmtUSD2.format(r.fiBlended.monthly);
  $("sf-pepm").textContent = fmtUSD2.format(r.sfBlended.monthly);
  const delta = r.sfBlended.monthly - r.fiBlended.monthly;
  const deltaEl = $("sf-delta");
  deltaEl.textContent = `${fmtUSD2.format(delta)} vs FI`;
  deltaEl.className = "metric-delta " + (delta < 0 ? "good" : "bad");
  $("sf-prob").textContent = `${Math.round(r.bucket.self_insured_pct * 100)}%`;

  const annualFI = r.fiBlended.monthly * 12 * employees;
  const annualSF = r.sfBlended.monthly * 12 * employees;
  const annualSavings = annualFI - annualSF;
  const sfCheaper = annualSavings >= 0;

  $("ann-fi").textContent = fmtUSD0.format(annualFI);
  $("ann-sf").textContent = fmtUSD0.format(annualSF);

  const callout = $("savings-callout");
  const calloutLabel = $("savings-callout-label");
  const legendLabel = $("legend-savings-label");
  const legendSwatch = $("legend-swatch-savings");
  if (sfCheaper) {
    $("ann-savings").textContent = fmtUSD0.format(annualSavings);
    calloutLabel.textContent = "Implied annual savings if self-funded";
    legendLabel.textContent = "Implied annual savings if self-funded";
    callout.classList.remove("negative");
    legendSwatch.classList.remove("negative");
  } else {
    $("ann-savings").textContent = fmtUSD0.format(Math.abs(annualSavings));
    calloutLabel.textContent = "Modeled additional cost if self-funded";
    legendLabel.textContent = "Modeled additional cost if self-funded";
    callout.classList.add("negative");
    legendSwatch.classList.add("negative");
  }

  const maxVal = Math.max(annualFI, annualSF, 1);
  $("bar-fi").style.width = `${(annualFI / maxVal) * 100}%`;
  const sfPct = (Math.min(annualSF, annualFI) / maxVal) * 100;
  $("bar-sf").style.width = `${sfPct}%`;
  $("bar-savings").style.left = `${sfPct}%`;
  $("bar-savings").style.width = `${(Math.abs(annualSavings) / maxVal) * 100}%`;
  $("bar-savings").classList.toggle("negative", !sfCheaper);

  const sfc = r.sfComponents;
  const fundingRatio = sfc.ratio;
  const netRatio = fundingRatio * r.health.factor;
  $("buildup-intro").textContent =
    `For a ${r.bucket.label} employer in ${STATE_NAMES[state] || state}, ` +
    `self-funded employer cost is modeled as ${(netRatio * 100).toFixed(2)}% of the fully-insured premium.`;
  $("buildup-state").textContent = `(${state})`;
  $("buildup-bucket").textContent = `(${r.bucket.label})`;
  $("buildup-tax").textContent = `−${(sfc.statePremiumTax * 100).toFixed(2)}%`;
  $("buildup-margin").textContent = `−${(sfc.insurerMargin * 100).toFixed(2)}%`;
  $("buildup-stoploss").textContent = `+${(sfc.stopLoss * 100).toFixed(2)}%`;
  $("buildup-funding-ratio").textContent = `${(fundingRatio * 100).toFixed(2)}%`;

  const healthRow = $("buildup-health-row");
  if (r.health.delta === 0) {
    healthRow.style.display = "none";
  } else {
    healthRow.style.display = "";
    const direction = r.health.delta < 0 ? "healthier than peers" : "less healthy than peers";
    const sign = r.health.delta < 0 ? "−" : "+";
    $("buildup-health-detail").textContent =
      `(${direction}, ${sign}${(Math.abs(r.health.delta) * 100).toFixed(0)}%)`;
    $("buildup-health").textContent =
      `× ${r.health.factor.toFixed(3)} (${sign}${(Math.abs(r.health.delta) * 100).toFixed(2)}%)`;
  }
  $("buildup-ratio").textContent = `${(netRatio * 100).toFixed(2)}%`;

  const notesEl = $("notes");
  notesEl.innerHTML = "";
  for (const n of r.notes) {
    const li = document.createElement("li");
    li.textContent = n;
    notesEl.appendChild(li);
  }
}

function init() {
  $("subtitle").textContent =
    `Benchmarks derived from ${D._meta.publication}. Data year: ${D._meta.data_year}. ` +
    `Estimates are bucket-level benchmarks, not underwritten quotes.`;
  $("meta-json").textContent = JSON.stringify(D._meta, null, 2);
  populateSelects();
  for (const id of ["state", "industry", "employees", "single-share", "pop-health"]) {
    $(id).addEventListener("input", recalc);
    $(id).addEventListener("change", recalc);
  }
  recalc();
}

document.addEventListener("DOMContentLoaded", init);
