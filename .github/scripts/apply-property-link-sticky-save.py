from pathlib import Path
import re

# index.html
p = Path('index.html')
text = p.read_text()
needle = '''              <label class="field">\n                <span>Property Details <em>optional</em></span>\n                <textarea id="details" name="details" rows="4" placeholder="Address, estate agent, auction details, property condition or notes"></textarea>\n              </label>\n\n              <div class="field-grid">'''
replacement = '''              <label class="field">\n                <span>Property Details <em>optional</em></span>\n                <textarea id="details" name="details" rows="4" placeholder="Address, estate agent, auction details, property condition or notes"></textarea>\n              </label>\n\n              <label class="field listing-link-field">\n                <span>Property Listing Link <em>optional</em></span>\n                <div class="listing-link-input">\n                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14 21 3"></path><path d="M15 3h6v6"></path><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"></path></svg>\n                  <input id="listingUrl" name="listingUrl" type="url" inputmode="url" autocomplete="url" maxlength="1000" placeholder="https://www.rightmove.co.uk/..." aria-describedby="listingUrlHelp listingUrlError">\n                </div>\n                <small id="listingUrlHelp">Rightmove, Zoopla, estate-agent or other web listing.</small>\n                <small id="listingUrlError" class="error-text hidden">Enter a valid http:// or https:// property listing link.</small>\n              </label>\n\n              <div class="field-grid">'''
if needle not in text:
    raise SystemExit('index insertion point not found')
p.write_text(text.replace(needle, replacement, 1))

# app.js
p = Path('app.js')
text = p.read_text()
needle = '''function normalizeDepositPercent(value) {\n  const clamped = clamp(safeNumber(value), 0, 100);\n  return Math.round(clamped / 5) * 5;\n}\n\nfunction getFormModel() {'''
replacement = '''function normalizeDepositPercent(value) {\n  const clamped = clamp(safeNumber(value), 0, 100);\n  return Math.round(clamped / 5) * 5;\n}\n\nfunction normalizeListingUrl(value) {\n  const raw = String(value || '').trim();\n  if (!raw) return '';\n  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;\n  try {\n    const parsed = new URL(candidate);\n    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';\n    return parsed.href;\n  } catch {\n    return '';\n  }\n}\n\nfunction getFormModel() {'''
if needle not in text:
    raise SystemExit('normalize insertion point not found')
text = text.replace(needle, replacement, 1)

needle = '''    title: $('title').value.trim(),\n    details: $('details').value.trim(),\n    purchasePrice: safeNumber($('purchasePrice').value),'''
replacement = '''    title: $('title').value.trim(),\n    details: $('details').value.trim(),\n    listingUrl: $('listingUrl').value.trim(),\n    purchasePrice: safeNumber($('purchasePrice').value),'''
if needle not in text:
    raise SystemExit('form model insertion point not found')
text = text.replace(needle, replacement, 1)

needle = '''  const deposit = safeNumber($('depositPercent').value);\n  const depositValid = deposit >= 0 && deposit <= 100;\n\n  $('titleError').classList.toggle('hidden', titleValid);\n  $('priceError').classList.toggle('hidden', priceValid);\n  $('depositPercent').setCustomValidity(depositValid ? '' : 'Deposit must be between 0% and 100%.');\n\n  if (!titleValid || !priceValid || !depositValid) openPrimaryDetailsSection();\n\n  if (!titleValid) $('title').focus();\n  else if (!priceValid) $('purchasePrice').focus();\n  else if (!depositValid) $('depositPercent').focus();\n\n  return titleValid && priceValid && depositValid;'''
replacement = '''  const deposit = safeNumber($('depositPercent').value);\n  const depositValid = deposit >= 0 && deposit <= 100;\n  const listingRaw = $('listingUrl').value.trim();\n  const listingUrl = normalizeListingUrl(listingRaw);\n  const listingValid = !listingRaw || Boolean(listingUrl);\n\n  $('titleError').classList.toggle('hidden', titleValid);\n  $('priceError').classList.toggle('hidden', priceValid);\n  $('listingUrlError').classList.toggle('hidden', listingValid);\n  $('listingUrl').setCustomValidity(listingValid ? '' : 'Enter a valid http:// or https:// property listing link.');\n  $('depositPercent').setCustomValidity(depositValid ? '' : 'Deposit must be between 0% and 100%.');\n\n  if (!titleValid || !priceValid || !depositValid || !listingValid) openPrimaryDetailsSection();\n\n  if (!titleValid) $('title').focus();\n  else if (!priceValid) $('purchasePrice').focus();\n  else if (!listingValid) $('listingUrl').focus();\n  else if (!depositValid) $('depositPercent').focus();\n\n  if (listingValid && listingRaw && listingUrl !== listingRaw) $('listingUrl').value = listingUrl;\n  return titleValid && priceValid && depositValid && listingValid;'''
if needle not in text:
    raise SystemExit('validation block not found')
text = text.replace(needle, replacement, 1)

needle = '''  $('saveMessage').textContent = '';\n  $('titleError').classList.add('hidden');\n  $('priceError').classList.add('hidden');'''
replacement = '''  $('saveMessage').textContent = '';\n  $('titleError').classList.add('hidden');\n  $('priceError').classList.add('hidden');\n  $('listingUrlError').classList.add('hidden');\n  $('listingUrl').setCustomValidity('');'''
if needle not in text:
    raise SystemExit('reset insertion point not found')
text = text.replace(needle, replacement, 1)

needle = '''  $('title').value = property.title || '';\n  $('details').value = property.details || '';\n  $('purchasePrice').value = property.purchasePrice ? formatInputValue(property.purchasePrice) : '';'''
replacement = '''  $('title').value = property.title || '';\n  $('details').value = property.details || '';\n  $('listingUrl').value = property.listingUrl || '';\n  $('purchasePrice').value = property.purchasePrice ? formatInputValue(property.purchasePrice) : '';'''
if needle not in text:
    raise SystemExit('load insertion point not found')
text = text.replace(needle, replacement, 1)

start = text.find('    card.innerHTML=`<div class="property-card-tools"')
end = text.find("    card.addEventListener('keydown'", start)
if start < 0 or end < 0:
    raise SystemExit('property card block not found')
old = text[start:end]
new = '''    const listingUrl = normalizeListingUrl(property.listingUrl);\n    const listingAction = listingUrl ? `<button class="property-card-icon-action listing" type="button" data-action="listing" aria-label="Open property listing for ${escapeHtml(propertyTitle)}" title="Open property listing" data-tooltip="Listing"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14 21 3"></path><path d="M15 3h6v6"></path><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"></path></svg></button>` : '';\n    card.innerHTML=`<div class="property-card-tools" aria-label="Property actions">${listingAction}<button class="property-card-icon-action" type="button" data-action="duplicate" aria-label="Duplicate ${escapeHtml(propertyTitle)}" title="Duplicate property" data-tooltip="Duplicate"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="2"></rect><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path></svg></button><button class="property-card-icon-action archive" type="button" data-action="archive" aria-label="Archive ${escapeHtml(propertyTitle)}" title="Archive property" data-tooltip="Archive"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M5 7l1 12h12l1-12"></path><path d="M9 11h6"></path><path d="M7 4h10l1 3H6l1-3Z"></path></svg></button></div><div class="property-card-header"><div><h3>${escapeHtml(propertyTitle)}</h3><p class="property-meta">Updated ${property.updatedAt?dateFormat.format(new Date(property.updatedAt)):'recently'}</p></div></div><div class="property-stats"><div><span>Purchase Price</span><strong>${money(calc.purchasePrice)}</strong></div><div><span>Deposit</span><strong>${numberFormat.format(calc.depositPercent)}% · ${money(calc.depositAmount)}</strong></div><div><span>Mortgage</span><strong>${money(calc.mortgageRequired)}</strong></div><div><span>Purchase Costs</span><strong>${money(calc.totalPurchaseCostsExcludingDeposit)}</strong></div></div><div class="property-total"><span>Total Cash Required</span><strong>${money(calc.totalCashRequired)}</strong></div>`;\n    card.addEventListener('click',(event)=>{ if(!event.target.closest('button')) showEditor(property.id); });\n    if (listingUrl) card.querySelector('[data-action="listing"]').addEventListener('click',()=>{ window.open(listingUrl,'_blank','noopener,noreferrer'); });\n'''
text = text[:start] + new + text[end:]

needle = '''  const { model, calc } = renderCalculation();\n  try {\n    const saved = saveProperty({ ...model, calculated: calc });'''
replacement = '''  const { model, calc } = renderCalculation();\n  model.listingUrl = normalizeListingUrl(model.listingUrl);\n  try {\n    const saved = saveProperty({ ...model, calculated: calc });'''
if needle not in text:
    raise SystemExit('save normalization point not found')
text = text.replace(needle, replacement, 1)
p.write_text(text)

# styles.css
p = Path('styles.css')
text = p.read_text()
text = text.replace('.property-card-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding-right: 82px; }', '.property-card-header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding-right: 124px; }', 1)
needle = '.editor-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }'
replacement = '''.editor-topbar {\n  position: sticky;\n  top: calc(var(--safe-top) + 72px);\n  z-index: 18;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 10px;\n  margin: -6px -6px 14px;\n  padding: 8px;\n  border: 1px solid color-mix(in srgb, var(--border) 78%, transparent);\n  border-radius: 16px;\n  background: color-mix(in srgb, var(--surface) 92%, transparent);\n  box-shadow: 0 8px 22px color-mix(in srgb, #000 8%, transparent);\n  backdrop-filter: blur(16px);\n  -webkit-backdrop-filter: blur(16px);\n}'''
if needle not in text:
    raise SystemExit('editor topbar style not found')
text = text.replace(needle, replacement, 1)
marker = '.field textarea { resize: vertical; min-height: 100px; }\n'
addition = '''.listing-link-input {\n  display: flex;\n  align-items: center;\n  min-height: 50px;\n  border: 1px solid var(--border);\n  border-radius: 13px;\n  background: var(--bg);\n  overflow: hidden;\n}\n.listing-link-input svg {\n  width: 18px;\n  height: 18px;\n  flex: 0 0 18px;\n  margin-left: 13px;\n  fill: none;\n  stroke: var(--muted);\n  stroke-width: 1.8;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n.listing-link-input input { min-height: 48px !important; border: 0 !important; border-radius: 0 !important; background: transparent !important; }\n.listing-link-input:focus-within { border-color: color-mix(in srgb, var(--brand) 55%, var(--border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 15%, transparent); }\n.property-card-icon-action.listing:hover,\n.property-card-icon-action.listing:focus-visible { color: var(--brand); background: color-mix(in srgb, var(--brand) 12%, var(--surface)); }\n'''
if marker not in text:
    raise SystemExit('listing styles insertion point not found')
text = text.replace(marker, marker + addition, 1)
text += '''\n/* v1.7.8 listing link + always-visible save */\n@media (max-width: 430px) {\n  .property-card-header { padding-right: 112px; }\n  .property-card-tools { gap: 4px; }\n  .property-card-icon-action { width: 33px; height: 33px; min-width: 33px; min-height: 33px; }\n  #editorView .editor-topbar { top: calc(var(--safe-top) + 66px); margin-inline: -3px; }\n}\n'''
p.write_text(text)

# service-worker.js
p = Path('service-worker.js')
text = p.read_text()
text, count = re.subn(r"spv-property-calculator-v[^']+", 'spv-property-calculator-v1.7.8-listing-sticky-save', text, count=1)
if count != 1:
    raise SystemExit('cache version not found')
p.write_text(text)
