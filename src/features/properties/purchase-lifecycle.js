export const PURCHASE_STAGES = Object.freeze({
  opportunity: 'Opportunity',
  under_offer: 'Under offer · Sold STC',
  exchanged: 'Exchanged',
  completed: 'Completed · Portfolio'
});

export function normalizePurchaseStage(value) {
  const stage = String(value || 'opportunity');
  return Object.hasOwn(PURCHASE_STAGES, stage) ? stage : 'opportunity';
}

export function getPortfolioProperties(properties = []) {
  return properties.filter((property) => !property.deletedAt && normalizePurchaseStage(property.purchaseStage) === 'completed');
}

export function getOpportunityProperties(properties = []) {
  return properties.filter((property) => !property.deletedAt && normalizePurchaseStage(property.purchaseStage) !== 'completed');
}
