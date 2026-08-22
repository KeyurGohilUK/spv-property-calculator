from pathlib import Path
import json

branch_version = '1.10.2'

# index.html
p = Path('index.html')
s = p.read_text()
s = s.replace('''              <label class="field viewing-date-field">\n                <span>Viewing Date <em>optional</em></span>\n                <div class="viewing-date-input">\n                  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 10h18"></path></svg>\n                  <input id="viewingDate" name="viewingDate" type="date" autocomplete="off">\n                </div>\n              </label>''', '''              <div class="field-grid viewing-date-time-grid">\n                <label class="field viewing-date-field">\n                  <span>Viewing Date <em>optional</em></span>\n                  <div class="viewing-date-input">\n                    <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4"></path><path d="M8 3v4"></path><path d="M3 10h18"></path></svg>\n                    <input id="viewingDate" name="viewingDate" type="date" autocomplete="off">\n                  </div>\n                </label>\n                <label class="field viewing-date-field">\n                  <span>Viewing Time <em>optional</em></span>\n                  <div class="viewing-date-input">\n                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>\n                    <input id="viewingTime" name="viewingTime" type="time" step="60" autocomplete="off">\n                  </div>\n                </label>\n              </div>''')
p.write_text(s)

# app.js
p = Path('app.js')
s = p.read_text()
s = s.replace("const APP_VERSION = '1.10.1';", "const APP_VERSION = '1.10.2';")
s = s.replace('''function formatViewingDate(value) {\n  const raw = String(value || '').trim();\n  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(raw);\n  if (!match) return '';\n  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));\n  if (Number.isNaN(date.getTime())) return '';\n  return dateFormat.format(date);\n}''', '''function formatViewingDateTime(dateValue, timeValue = '') {\n  const rawDate = String(dateValue || '').trim();\n  const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(rawDate);\n  if (!match) return '';\n  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));\n  if (Number.isNaN(date.getTime())) return '';\n  const formattedDate = dateFormat.format(date);\n  const rawTime = String(timeValue || '').trim();\n  return /^([01]\\d|2[0-3]):[0-5]\\d$/.test(rawTime) ? `${formattedDate} · ${rawTime}` : formattedDate;\n}''')
s = s.replace("    viewingDate: $('viewingDate').value || '',\n", "    viewingDate: $('viewingDate').value || '',\n    viewingTime: $('viewingTime').value || '',\n")
s = s.replace("  $('viewingDate').value = property.viewingDate || '';\n", "  $('viewingDate').value = property.viewingDate || '';\n  $('viewingTime').value = property.viewingTime || '';\n")
s = s.replace("    const viewingDateLabel = formatViewingDate(property.viewingDate);", "    const viewingDateLabel = formatViewingDateTime(property.viewingDate, property.viewingTime);")
p.write_text(s)

# service-worker.js
p = Path('service-worker.js')
s = p.read_text().replace("spv-property-calculator-v1.10.1-viewing-date", "spv-property-calculator-v1.10.2-viewing-date-time")
p.write_text(s)

# release.json
p = Path('release.json')
data = json.loads(p.read_text())
data['version'] = branch_version
data['notes'] = [
    'Viewing date with hour and minute',
    'Viewing date and time shown on property cards',
    'Advanced forecast return and risk metrics'
]
p.write_text(json.dumps(data, indent=2) + '\n')
