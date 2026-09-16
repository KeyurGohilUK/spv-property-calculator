import { calculateProperty } from '../properties/calculations.js';

export const HMO_SCREENING_STANDARDS = Object.freeze({
  bedroomAdultSingle: 6.51,
  3: Object.freeze({ kitchen: 5, communal: 13.5 }),
  4: Object.freeze({ kitchen: 6, communal: 17 })
});

export function monthlyMortgagePayment(balance, annualRate, type = 'interest-only', termYears = 25) {
  const principal = Math.max(0, Number(balance) || 0);
  const rate = Math.max(0, Number(annualRate) || 0) / 100 / 12;
  const months = Math.max(1, Math.round((Number(termYears) || 25) * 12));
  if (!principal) return 0;
  if (type === 'interest-only') return principal * rate;
  if (!rate) return principal / months;
  return principal * rate / (1 - Math.pow(1 + rate, -months));
}

export function calculateLettingStrategy({
  purchasePrice,
  purchaseCash,
  mortgageBalance,
  monthlyRent,
  annualRate,
  mortgageType = 'interest-only',
  mortgageTerm = 25,
  householdBills = 0,
  maintenanceVoidPercent = 10,
  managementPercent = 0
} = {}) {
  const rent = Math.max(0, Number(monthlyRent) || 0);
  const mortgage = monthlyMortgagePayment(mortgageBalance, annualRate, mortgageType, mortgageTerm);
  const reservePercent = Math.max(0, Number(maintenanceVoidPercent) || 0) + Math.max(0, Number(managementPercent) || 0);
  const operatingReserve = rent * reservePercent / 100;
  const bills = Math.max(0, Number(householdBills) || 0);
  const totalMonthlyCost = mortgage + bills + operatingReserve;
  const monthlyCashFlow = rent - totalMonthlyCost;
  const annualRent = rent * 12;
  const annualCashFlow = monthlyCashFlow * 12;
  const price = Math.max(0, Number(purchasePrice) || 0);
  const cash = Math.max(0, Number(purchaseCash) || 0);

  return {
    monthlyRent: rent,
    annualRent,
    mortgage,
    householdBills: bills,
    operatingReserve,
    totalMonthlyCost,
    monthlyCashFlow,
    annualCashFlow,
    grossYield: price ? annualRent / price * 100 : 0,
    cashOnCash: cash ? annualCashFlow / cash * 100 : 0
  };
}

export function compareLettingStrategies({ property, assumptions } = {}) {
  const purchase = calculateProperty(property || {});
  const roomRents = Array.isArray(assumptions?.roomRents) ? assumptions.roomRents : [];
  const shared = {
    purchasePrice: purchase.purchasePrice,
    purchaseCash: purchase.totalCashRequired,
    mortgageBalance: purchase.mortgageRequired,
    mortgageType: assumptions?.mortgageType || 'interest-only',
    mortgageTerm: assumptions?.mortgageTerm || 25,
    maintenanceVoidPercent: assumptions?.maintenanceVoidPercent ?? 10,
    managementPercent: assumptions?.managementPercent ?? 0
  };
  const bills = Math.max(0, Number(assumptions?.hmoBills) || 0);
  const family = calculateLettingStrategy({
    ...shared,
    monthlyRent: assumptions?.familyRent,
    annualRate: assumptions?.btlRate,
    householdBills: 0
  });
  const hmo3 = calculateLettingStrategy({
    ...shared,
    monthlyRent: roomRents.slice(0, 3).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0),
    annualRate: assumptions?.hmoRate,
    householdBills: bills
  });
  const hmo4 = calculateLettingStrategy({
    ...shared,
    monthlyRent: roomRents.slice(0, 4).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0),
    annualRate: assumptions?.hmoRate,
    householdBills: bills
  });

  return {
    purchase,
    family,
    hmo3: { ...hmo3, differenceVsBtl: hmo3.monthlyCashFlow - family.monthlyCashFlow },
    hmo4: { ...hmo4, differenceVsBtl: hmo4.monthlyCashFlow - family.monthlyCashFlow }
  };
}

function screeningMetric(value, minimum, closeMargin = 0.5) {
  const numeric = Math.max(0, Number(value) || 0);
  if (!numeric) return { value: numeric, minimum, status: 'unknown' };
  if (numeric < minimum) return { value: numeric, minimum, status: 'fail' };
  if (numeric < minimum + closeMargin) return { value: numeric, minimum, status: 'close' };
  return { value: numeric, minimum, status: 'pass' };
}

export function evaluateHmoSuitability({ occupants = 4, roomSizes = [], kitchenArea = 0, communalArea = 0 } = {}) {
  const count = occupants === 3 ? 3 : 4;
  const standard = HMO_SCREENING_STANDARDS[count];
  const bedrooms = Array.from({ length: count }, (_, index) => screeningMetric(roomSizes[index], HMO_SCREENING_STANDARDS.bedroomAdultSingle));
  const kitchen = screeningMetric(kitchenArea, standard.kitchen);
  const communal = screeningMetric(communalArea, standard.communal, 1);
  const metrics = [...bedrooms, kitchen, communal];
  const status = metrics.some((item) => item.status === 'fail')
    ? 'fail'
    : metrics.some((item) => item.status === 'unknown' || item.status === 'close')
      ? 'check'
      : 'pass';
  return { occupants: count, bedrooms, kitchen, communal, status };
}

export function buildPriceSensitivity({ property, prices = [], assumptions } = {}) {
  return prices
    .map((price) => Math.max(0, Number(price) || 0))
    .filter((price) => price > 0)
    .map((price) => {
      const scenarioProperty = { ...(property || {}), purchasePrice: price };
      const comparison = compareLettingStrategies({ property: scenarioProperty, assumptions });
      return {
        purchasePrice: price,
        purchaseCash: comparison.purchase.totalCashRequired,
        familyCashFlow: comparison.family.monthlyCashFlow,
        hmo3CashFlow: comparison.hmo3.monthlyCashFlow,
        hmo4CashFlow: comparison.hmo4.monthlyCashFlow,
        hmo4CashOnCash: comparison.hmo4.cashOnCash
      };
    });
}
