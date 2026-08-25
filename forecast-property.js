import { getActiveProperties } from './storage.js';
import { calculateProperty } from './calculations.js';

export function getForecastProperties() {
  return getActiveProperties();
}

export function getForecastProperty(id) {
  const properties = getForecastProperties();
  return properties.find((item) => String(item.id) === String(id)) || properties[0] || null;
}

export function getPurchaseNumbers(property) {
  const calculated = calculateProperty(property || {});
  return {
    price: calculated.purchasePrice,
    deposit: calculated.depositAmount,
    mortgage: calculated.mortgageRequired,
    cash: calculated.totalCashRequired,
    refurbishment: calculated.refurbishment
  };
}