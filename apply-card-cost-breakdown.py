from pathlib import Path
import json

# app.js
p = Path('app.js')
s = p.read_text()
s = s.replace("const APP_VERSION = '1.10.3';", "const APP_VERSION = '1.10.4';")
old_active = "<div class=\"property-total\"><span>Total Cash Required</span><strong>${money(calc.totalCashRequired)}</strong></div>"
new_active = "<div class=\"property-total property-cost-breakdown\"><div><span>Cash to Buy Property</span><strong>${money(calc.totalCashRequired - calc.refurbishment)}</strong></div><div class=\"refurbishment-row\"><span>+ Refurbishment</span><strong>${money(calc.refurbishment)}</strong></div><div class=\"investment-total\"><span>Total Investment</span><strong>${money(calc.totalCashRequired)}</strong></div></div>"
if old_active not in s:
    raise SystemExit('Active card total block not found')
s = s.replace(old_active, new_active, 1)
if old_active not in s:
    raise SystemExit('Archived card total block not found')
s = s.replace(old_active, new_active, 1)
p.write_text(s)

# styles.css
p = Path('styles.css')
s = p.read_text()
anchor = ".property-total strong { font-size: 19px; color: var(--brand); }"
addition = anchor + "\n.property-cost-breakdown { display: grid; gap: 8px; align-items: stretch; }\n.property-cost-breakdown > div { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }\n.property-cost-breakdown > div strong { font-size: 15px; color: var(--text); }\n.property-cost-breakdown .refurbishment-row { padding-bottom: 8px; border-bottom: 1px dashed var(--border); }\n.property-cost-breakdown .refurbishment-row span { color: var(--muted); }\n.property-cost-breakdown .investment-total { padding-top: 2px; }\n.property-cost-breakdown .investment-total span { color: var(--brand); font-weight: 800; }\n.property-cost-breakdown .investment-total strong { font-size: 19px; color: var(--brand); }"
if anchor not in s:
    raise SystemExit('Property total style anchor not found')
s = s.replace(anchor, addition, 1)
p.write_text(s)

# release.json
p = Path('release.json')
data = json.loads(p.read_text())
data['version'] = '1.10.4'
data['notes'] = [
    'Property cards separate purchase cash from refurbishment',
    'Total Investment shown as purchase cash plus refurbishment',
    'Viewed status remains automatic after viewing time passes'
]
p.write_text(json.dumps(data, indent=2) + '\n')

# service-worker.js
p = Path('service-worker.js')
s = p.read_text()
import re
s = re.sub(r"const CACHE_NAME = '[^']+';", "const CACHE_NAME = 'spv-property-calculator-v1.10.4-card-cost-breakdown';", s, count=1)
p.write_text(s)

# trigger
