export const BRRR_DEFAULTS = Object.freeze({
  gdv: 200000,
  refurbCost: 25000,
  monthlyRent: 1100,
  purchaseLtv: 70,
  refinanceLtv: 75,
  mortgageRate: 5.5,
  stressRate: 5.5,
  icrRatio: 1.25,
  purchaseCostsPct: 5,
  managementPct: 10,
  refurbWeeks: 12,
  minOffer: 130000,
  maxOffer: 180000,
  offerStep: 5000,
});

function nonNegative(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function positive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function calcBrrr(offerPrice, inputs = {}) {
  const price = nonNegative(offerPrice);
  const gdv = nonNegative(inputs.gdv);
  const refurbCost = nonNegative(inputs.refurbCost);
  const monthlyRent = nonNegative(inputs.monthlyRent);
  const purchaseLtv = nonNegative(inputs.purchaseLtv);
  const refinanceLtv = nonNegative(inputs.refinanceLtv);
  const mortgageRate = nonNegative(inputs.mortgageRate);
  const stressRate = nonNegative(inputs.stressRate);
  const icrRatio = positive(inputs.icrRatio);
  const purchaseCostsPct = nonNegative(inputs.purchaseCostsPct);
  const managementPct = nonNegative(inputs.managementPct);
  const refurbWeeks = nonNegative(inputs.refurbWeeks);

  const ltvFrac = purchaseLtv / 100;
  const purchaseDeposit = price * (1 - ltvFrac);
  const purchaseMortgage = price * ltvFrac;
  const purchaseCosts = price * (purchaseCostsPct / 100);
  const carryingCost = purchaseMortgage * (mortgageRate / 100) * (refurbWeeks / 52);
  const totalCashIn = purchaseDeposit + purchaseCosts + refurbCost + carryingCost;

  const annualRent = monthlyRent * 12;
  const stressDecimal = stressRate / 100;
  const icrLimit = stressDecimal > 0 && icrRatio > 0
    ? annualRent / (stressDecimal * icrRatio)
    : 0;
  const ltvLimit = gdv * (refinanceLtv / 100);
  const icrIsBinding = icrLimit < ltvLimit;
  const refinanceMortgage = Math.min(ltvLimit, icrLimit);
  const cashReleased = Math.max(0, refinanceMortgage - purchaseMortgage);
  const capitalLeft = totalCashIn - cashReleased;

  const annualMortgageInterest = refinanceMortgage * (mortgageRate / 100);
  const annualManagement = annualRent * (managementPct / 100);
  const netAnnualCashFlow = annualRent - annualMortgageInterest - annualManagement;
  const monthlyCashFlow = netAnnualCashFlow / 12;
  const grossYield = gdv > 0 ? (annualRent / gdv) * 100 : 0;

  return {
    offerPrice: price,
    purchaseDeposit,
    purchaseMortgage,
    purchaseCosts,
    carryingCost,
    totalCashIn,
    icrLimit,
    ltvLimit,
    icrIsBinding,
    refinanceMortgage,
    cashReleased,
    capitalLeft,
    annualRent,
    annualMortgageInterest,
    annualManagement,
    netAnnualCashFlow,
    monthlyCashFlow,
    grossYield,
  };
}

export function calcBreakeven(inputs = {}) {
  const gdv = nonNegative(inputs.gdv);
  const refurbCost = nonNegative(inputs.refurbCost);
  const monthlyRent = nonNegative(inputs.monthlyRent);
  const purchaseLtv = nonNegative(inputs.purchaseLtv);
  const refinanceLtv = nonNegative(inputs.refinanceLtv);
  const mortgageRate = nonNegative(inputs.mortgageRate);
  const stressRate = nonNegative(inputs.stressRate);
  const icrRatio = positive(inputs.icrRatio);
  const purchaseCostsPct = nonNegative(inputs.purchaseCostsPct);
  const refurbWeeks = nonNegative(inputs.refurbWeeks);

  const purchaseLtvFraction = purchaseLtv / 100;
  const carryFactor = purchaseLtvFraction * (mortgageRate / 100) * (refurbWeeks / 52);
  const cashInFactor = 1 - purchaseLtvFraction + (purchaseCostsPct / 100) + carryFactor;
  const annualRent = monthlyRent * 12;
  const stressDecimal = stressRate / 100;
  const icrLimit = stressDecimal > 0 && icrRatio > 0
    ? annualRent / (stressDecimal * icrRatio)
    : 0;
  const ltvLimit = gdv * (refinanceLtv / 100);
  const refinanceLimit = Math.min(ltvLimit, icrLimit);
  const denominator = cashInFactor + purchaseLtvFraction;

  if (denominator <= 0 || refinanceLimit <= refurbCost) return 0;
  return Math.max(0, (refinanceLimit - refurbCost) / denominator);
}
