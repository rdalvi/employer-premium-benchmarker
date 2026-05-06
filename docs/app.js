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

function estimate({ state, employees, industry, singleShare }) {
  const baseline = D.national_baseline;
  const bucket = firmSizeBucket(employees);
  const indFactor = D.industry_index[industry].factor;
  const sfAdj = D.self_funded_adjustment;
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

  const sfSingle = wrap(fiSingleAnn * sfAdj.single_ratio);
  const sfFamily = wrap(fiFamilyAnn * sfAdj.family_ratio);
  const sfBlended = blend(sfSingle, sfFamily, singleShare, familyShare);

  const notes = [
    `Benchmark based on AHRQ MEPS-IC ${D._meta.data_year} published summary tables.`,
    `Estimates apply to employers in the ${bucket.label} bucket; ~${Math.round(
      bucket.self_insured_pct * 100
    )}% of enrollees in this size bucket are in self-insured plans nationally.`,
    "Self-funded figure is an employer-cost equivalent (claims + admin + stop-loss), not a market premium.",
    "Figures shown are point estimates from a bucket-level model. Real-world variance is large — true quotes also depend on workforce age/sex mix, claims history, plan design, and carrier, none of which MEPS-IC captures at the employer level.",
  ];
  if (employees < 50)
    notes.push(
      "At <50 employees, ACA small-group rating rules apply (modified community rating). Self-funded comparison is unusual at this size and stop-loss costs can be material."
    );
  if (employees >= 1000)
    notes.push(
      "At 1,000+ employees, the vast majority of similar employers are already self-funded; fully-insured benchmark is shown for comparison but may not be a realistic option."
    );

  return {
    bucket,
    fiBlended,
    sfBlended,
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
  $("single-share-readout").textContent = `(${Math.round(singleShare * 100)}% single / ${Math.round(
    (1 - singleShare) * 100
  )}% family)`;

  const r = estimate({ state, employees, industry, singleShare });
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
  const annualSavings = Math.max(0, annualFI - annualSF);
  $("ann-fi").textContent = fmtUSD0.format(annualFI);
  $("ann-sf").textContent = fmtUSD0.format(annualSF);
  $("ann-savings").textContent = fmtUSD0.format(annualSavings);

  const maxVal = Math.max(annualFI, 1);
  const sfPct = (annualSF / maxVal) * 100;
  const savingsPct = (annualSavings / maxVal) * 100;
  $("bar-sf").style.width = `${sfPct}%`;
  $("bar-savings").style.left = `${sfPct}%`;
  $("bar-savings").style.width = `${savingsPct}%`;

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
  for (const id of ["state", "industry", "employees", "single-share"]) {
    $(id).addEventListener("input", recalc);
    $(id).addEventListener("change", recalc);
  }
  recalc();
}

document.addEventListener("DOMContentLoaded", init);
