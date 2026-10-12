const ENTRY_TYPES = new Set(['offer', 'counteroffer', 'price_reduction']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function createPriceHistoryEntry({ type, price, date, note = '', id } = {}) {
  const normalizedType = String(type || '');
  const amount = Number(String(price ?? '').replace(/,/g, '').trim());
  const normalizedDate = String(date || '');
  const normalizedNote = String(note || '').trim();
  if (!ENTRY_TYPES.has(normalizedType)) throw new Error('Choose an offer, counteroffer, or listing price reduction.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a price greater than £0.');
  const parsedDate = DATE_PATTERN.test(normalizedDate) ? new Date(`${normalizedDate}T00:00:00Z`) : new Date(Number.NaN);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== normalizedDate) {
    throw new Error('Enter a valid price history date.');
  }
  if (normalizedNote.length > 500) throw new Error('Keep the note to 500 characters or fewer.');
  return {
    id: String(id || globalThis.crypto?.randomUUID?.() || `price-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    type: normalizedType,
    price: amount,
    date: normalizedDate,
    note: normalizedNote
  };
}

export function normalizePriceHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    try { return [createPriceHistoryEntry(entry)]; } catch { return []; }
  });
}
