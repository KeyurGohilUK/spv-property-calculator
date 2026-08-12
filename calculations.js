import { TAX_CONFIG } from './tax-config.js';

export function safeNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, safeNumber(value)));
}

export function calculateDeposit(purchasePrice, depositPercent) {
  const price = Math.max(0, safeNumber(purchasePrice));
  const percent = clamp(depositPercent, 0, 100);
  return price * (percent / 100);
}

export function calculateMortgage(purchasePrice, depositAmount) {
  const price = Math.max(0, safeNumber(purchasePrice));
  const deposit = Math.max(0, safeNumber(depositAmount));
  return Math.max(0, price - deposit);
}

function progressiveTax(price, bands, surcharge = 0) {
  const breakdown = [];
  let total = 0;

  for (const band of bands) {
    if (price <= band.from) continue;
    const upper = Number.isFinite(band.to) ? Math.min(price, band.to) : price;
    const taxableAmount = Math.max(0, upper - band.from);
    if (taxableAmount <= 0) continue;

    const rate = band.rate + surcharge;
    const tax = taxableAmount * rate;
    total += tax;
    breakdown.push({
      from: band.from,
      to: band.to,
      taxableAmount,
      rate,
      tax
    });
  }

  return { total, breakdown };
}

/**
 * Calculates estimated SDLT for an SPV/company residential purchase.
 *
 * Options:
 * - qualifyingCorporateRelief (default true): when true, the app assumes the
 *   transaction qualifies for relief from the 17% corporate flat rate where relevant
 *   (e.g. qualifying property rental business) and uses progressive higher rates.
 * - nonResident: adds the 2 percentage point non-resident surcharge where applicable.
 */
export function calculateSDLT(
  purchasePrice,
  { qualifyingCorporateRelief = true, nonResident = false } = {}
) {
  const price = Math.max(0, safeNumber(purchasePrice));
  if (price <= 0) {
    return { total: 0, breakdown: [], method: 'none', label: 'No SDLT', warnings: [] };
  }

  const nonResidentExtra = nonResident ? TAX_CONFIG.nonResidentSurcharge : 0;

  if (
    price > TAX_CONFIG.corporateFlatRateThreshold &&
    !qualifyingCorporateRelief
  ) {
    const rate = TAX_CONFIG.corporateFlatRate + nonResidentExtra;
    const total = price * rate;
    return {
      total,
      breakdown: [{ from: 0, to: price, taxableAmount: price, rate, tax: total }],
      method: 'corporate-flat-rate',
      label: `Corporate whole-price rate (${formatPercent(rate)})`,
      warnings: [
        'The 17% corporate rate can apply to certain company purchases over £500,000 when no qualifying relief applies.'
      ]
    };
  }

  const higherRatesApply = price >= TAX_CONFIG.higherRatesMinimumConsideration;
  const surcharge = (higherRatesApply ? TAX_CONFIG.additionalPropertySurcharge : 0) + nonResidentExtra;
  const result = progressiveTax(price, TAX_CONFIG.standardResidentialBands, surcharge);

  return {
    ...result,
    method: higherRatesApply ? 'company-higher-rates' : 'standard-bands',
    label: higherRatesApply
      ? `Company / additional-property bands${nonResident ? ' + non-resident surcharge' : ''}`
      : `Standard residential bands${nonResident ? ' + non-resident surcharge' : ''}`,
    warnings: []
  };
}

export function calculateCostGroups(model = {}) {
  const legalProfessional =
    safeNumber(model.solicitorFee) + safeNumber(model.surveyCost);

  const mortgageCosts =
    safeNumber(model.mortgageArrangementFee) +
    safeNumber(model.mortgageBrokerFee) +
    safeNumber(model.mortgageValuationFee);

  const companyCosts =
    safeNumber(model.companyFormationCost) +
    safeNumber(model.spvAdministrationCost);

  const otherPurchaseCosts =
    safeNumber(model.landRegistrySearches) +
    safeNumber(model.insuranceCost) +
    safeNumber(model.auctionReservationFee) +
    (Array.isArray(model.customExpenses)
      ? model.customExpenses.reduce((sum, item) => sum + safeNumber(item.amount), 0)
      : 0);

  return { legalProfessional, mortgageCosts, companyCosts, otherPurchaseCosts };
}

export function calculateProperty(model = {}) {
  const purchasePrice = Math.max(0, safeNumber(model.purchasePrice));
  const depositPercent = clamp(model.depositPercent ?? 25, 0, 100);
  const depositAmount = calculateDeposit(purchasePrice, depositPercent);
  const mortgageRequired = calculateMortgage(purchasePrice, depositAmount);
  const sdlt = calculateSDLT(purchasePrice, {
    qualifyingCorporateRelief: model.qualifyingCorporateRelief !== false,
    nonResident: Boolean(model.nonResident)
  });

  const groups = calculateCostGroups(model);
  const refurbishment = Math.max(0, safeNumber(model.refurbishmentCost));

  const feesExcludingDeposit =
    sdlt.total +
    groups.legalProfessional +
    groups.mortgageCosts +
    groups.companyCosts +
    groups.otherPurchaseCosts +
    refurbishment;

  const purchaseCostsExcludingDepositAndRefurb = feesExcludingDeposit - refurbishment;
  const totalCashRequired = depositAmount + feesExcludingDeposit;

  return {
    purchasePrice,
    depositPercent,
    depositAmount,
    mortgageRequired,
    sdlt,
    ...groups,
    refurbishment,
    totalPurchaseCostsExcludingDeposit: purchaseCostsExcludingDepositAndRefurb,
    totalPurchaseCostsIncludingDeposit: depositAmount + purchaseCostsExcludingDepositAndRefurb,
    totalInvestmentCostsExcludingDeposit: feesExcludingDeposit,
    totalCashRequired
  };
}

export function formatPercent(rate) {
  const value = Number(rate) * 100;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}
