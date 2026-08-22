from pathlib import Path
import json

# index.html
p = Path('index.html')
s = p.read_text()
needle = '''              <div class="field-grid">\n                <label class="field currency-field">'''
replacement = '''              <label class="field viewing-date-field">\n                <span>Viewing Date <em>optional</em></span>\n                <div class="viewing-date-input">\n                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 10h18"></path></svg>\n                  <input id="viewingDate" name="viewingDate" type="date" autocomplete="off">\n                </div>\n              </label>\n\n              <div class="field-grid">\n                <label class="field currency-field">'''
if needle not in s: raise SystemExit('index insertion point not found')
s = s.replace(needle, replacement, 1)
p.write_text(s)

# app.js
p = Path('app.js')
s = p.read_text()
s = s.replace("const APP_VERSION = '1.10.0';", "const APP_VERSION = '1.10.1';", 1)
needle = '''function normalizeListingUrl(value) {\n  const raw = String(value || '').trim();'''
helper = '''function formatViewingDate(value) {\n  const raw = String(value || '').trim();\n  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(raw);\n  if (!match) return '';\n  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));\n  if (Number.isNaN(date.getTime())) return '';\n  return dateFormat.format(date);\n}\n\nfunction normalizeListingUrl(value) {\n  const raw = String(value || '').trim();'''
if needle not in s: raise SystemExit('helper insertion point not found')
s = s.replace(needle, helper, 1)
s = s.replace("    listingUrl: $('listingUrl').value.trim(),\n    purchasePrice:", "    listingUrl: $('listingUrl').value.trim(),\n    viewingDate: $('viewingDate').value || '',\n    purchasePrice:", 1)
s = s.replace("  $('listingUrl').value = property.listingUrl || '';\n  $('purchasePrice').value", "  $('listingUrl').value = property.listingUrl || '';\n  $('viewingDate').value = property.viewingDate || '';\n  $('purchasePrice').value", 1)
needle = "    const listingUrl = normalizeListingUrl(property.listingUrl);\n    const listingAction ="
replacement = "    const listingUrl = normalizeListingUrl(property.listingUrl);\n    const viewingDateLabel = formatViewingDate(property.viewingDate);\n    const viewingDateRow = viewingDateLabel ? `<p class=\"property-viewing-date\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"></rect><path d=\"M16 3v4\"></path><path d=\"M8 3v4\"></path><path d=\"M3 10h18\"></path></svg><span>Viewing ${escapeHtml(viewingDateLabel)}</span></p>` : '';\n    const listingAction ="
if needle not in s: raise SystemExit('card setup point not found')
s = s.replace(needle, replacement, 1)
needle = "<p class=\"property-meta\">Updated ${property.updatedAt?dateFormat.format(new Date(property.updatedAt)):'recently'}</p></div></div><div class=\"property-stats\">"
replacement = "<p class=\"property-meta\">Updated ${property.updatedAt?dateFormat.format(new Date(property.updatedAt)):'recently'}</p>${viewingDateRow}</div></div><div class=\"property-stats\">"
if needle not in s: raise SystemExit('card html point not found')
s = s.replace(needle, replacement, 1)
p.write_text(s)

# styles.css
p = Path('styles.css')
s = p.read_text()
s += '''\n\n/* v1.10.1 property viewing date */\n.viewing-date-field { max-width: 420px; }\n.viewing-date-input {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-height: 48px;\n  padding: 0 13px;\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  background: var(--surface-2);\n}\n.viewing-date-input svg {\n  width: 19px;\n  height: 19px;\n  flex: 0 0 19px;\n  fill: none;\n  stroke: var(--muted);\n  stroke-width: 1.8;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n.viewing-date-input input {\n  width: 100%;\n  min-height: 46px;\n  padding: 0;\n  border: 0 !important;\n  background: transparent !important;\n  color: var(--text);\n}\n.property-viewing-date {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  margin: 8px 0 0;\n  padding: 5px 9px;\n  border-radius: 999px;\n  background: color-mix(in srgb, var(--brand) 11%, var(--surface-2));\n  color: var(--brand);\n  font-size: 11px;\n  font-weight: 800;\n  line-height: 1.2;\n}\n.property-viewing-date svg {\n  width: 14px;\n  height: 14px;\n  fill: none;\n  stroke: currentColor;\n  stroke-width: 1.9;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n@media (max-width: 620px) {\n  .viewing-date-field { max-width: none; }\n}\n'''
p.write_text(s)

# release.json
p = Path('release.json')
release = json.loads(p.read_text())
release['version'] = '1.10.1'
release['notes'] = [
    'Viewing date on property editor and cards',
    'Advanced forecast return and risk metrics',
    'Smarter in-app update checks'
]
p.write_text(json.dumps(release, indent=2) + '\n')

# service-worker.js
p = Path('service-worker.js')
s = p.read_text().replace("spv-property-calculator-v1.10.0-advanced-forecasting", "spv-property-calculator-v1.10.1-viewing-date", 1)
p.write_text(s)
