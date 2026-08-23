from pathlib import Path
import json


def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f'Could not find {label}')
    return text.replace(old, new, 1)

p = Path('app.js')
s = p.read_text()
s = replace_once(s, "const APP_VERSION = '1.10.2';", "const APP_VERSION = '1.10.3';", 'app version')

anchor = """function normalizeViewingDateTime(value) {\n  const raw = String(value || '').trim();\n  if (!raw) return '';\n  if (/^\\d{4}-\\d{2}-\\d{2}$/.test(raw)) return raw + 'T00:00';\n  const match = /^(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2})/.exec(raw);\n  return match ? match[1] : '';\n}\n"""
addition = anchor + """\nfunction isViewingPassed(value, now = new Date()) {\n  const raw = String(value || '').trim();\n  const match = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})$/.exec(raw);\n  if (!match) return false;\n  const viewing = new Date(\n    Number(match[1]),\n    Number(match[2]) - 1,\n    Number(match[3]),\n    Number(match[4]),\n    Number(match[5])\n  );\n  return !Number.isNaN(viewing.getTime()) && viewing.getTime() <= now.getTime();\n}\n"""
s = replace_once(s, anchor, addition, 'viewing passed helper')

old = """    const viewingDateLabel = formatViewingDate(property.viewingDate);\n    const viewingDateRow = viewingDateLabel ? `<p class=\"property-viewing-date\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"></rect><path d=\"M16 3v4\"></path><path d=\"M8 3v4\"></path><path d=\"M3 10h18\"></path></svg><span>Viewing ${escapeHtml(viewingDateLabel)}</span></p>` : '';\n"""
new = """    const viewingDateLabel = formatViewingDate(property.viewingDate);\n    const viewingPassed = isViewingPassed(property.viewingDate);\n    const viewingDateRow = viewingPassed\n      ? `<p class=\"property-viewing-date viewed\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><circle cx=\"12\" cy=\"12\" r=\"9\"></circle><path d=\"m8.5 12 2.2 2.2 4.8-4.8\"></path></svg><span>Viewed</span></p>`\n      : viewingDateLabel\n        ? `<p class=\"property-viewing-date\"><svg viewBox=\"0 0 24 24\" aria-hidden=\"true\"><rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"></rect><path d=\"M16 3v4\"></path><path d=\"M8 3v4\"></path><path d=\"M3 10h18\"></path></svg><span>Viewing ${escapeHtml(viewingDateLabel)}</span></p>`\n        : '';\n"""
s = replace_once(s, old, new, 'property viewing row')
p.write_text(s)

p = Path('release.json')
data = json.loads(p.read_text())
data['version'] = '1.10.3'
data['notes'] = [
    'Property cards change to Viewed after the viewing time passes',
    'Viewing date and time stay available when reopening the property',
    'Single Viewing Date & Time field with hour and minute'
]
p.write_text(json.dumps(data, indent=2) + '\n')

p = Path('service-worker.js')
s = p.read_text()
import re
s = re.sub(r"const CACHE_NAME = '[^']+';", "const CACHE_NAME = 'spv-property-calculator-v1.10.3-viewed-status';", s, count=1)
p.write_text(s)
