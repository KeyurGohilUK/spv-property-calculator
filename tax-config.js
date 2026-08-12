/**
 * SPV Property Calculator - SDLT configuration
 *
 * UPDATE UK TAX RATES HERE
 *
 * Current configuration is for residential property in England and Northern Ireland,
 * using rates effective from 1 April 2025 and the 5 percentage point higher-rate
 * surcharge applicable to company purchases, subject to transaction-specific rules.
 *
 * Certain corporate bodies buying dwellings for more than £500,000 can be charged a
 * 17% flat rate on the whole price. Relief may be available, including for qualifying
 * property rental businesses. The app exposes this assumption to the user.
 */

export const TAX_CONFIG = Object.freeze({
  jurisdiction: 'England & Northern Ireland',
  taxName: 'Stamp Duty Land Tax (SDLT)',
  effectiveFrom: '2025-04-01',
  sourceChecked: '2026-08-12',

  // Standard residential bands from 1 April 2025.
  standardResidentialBands: Object.freeze([
    { from: 0, to: 125000, rate: 0.00 },
    { from: 125000, to: 250000, rate: 0.02 },
    { from: 250000, to: 925000, rate: 0.05 },
    { from: 925000, to: 1500000, rate: 0.10 },
    { from: 1500000, to: Infinity, rate: 0.12 }
  ]),

  // Company purchases generally attract the higher-rate surcharge when the
  // consideration is at least £40,000 and the statutory conditions are met.
  additionalPropertySurcharge: 0.05,
  higherRatesMinimumConsideration: 40000,

  // Certain corporate / non-natural-person transactions above £500,000 may be
  // subject to this flat whole-price rate unless a relief applies.
  corporateFlatRateThreshold: 500000,
  corporateFlatRate: 0.17,

  // Certain non-UK resident residential transactions can attract this surcharge.
  nonResidentSurcharge: 0.02
});
