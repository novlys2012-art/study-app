"""One-time pass: tag plain-text UI strings in index.html with data-i18n and write src/i18n/sk.json.

Usage: python3 tools/tag-i18n.py   (run once, right after split-legacy.py)
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
path = ROOT / "index.html"
html = path.read_text(encoding="utf-8")
SKIP_IDS = {"eyebrow", "h1"}  # set per subject by the app
EL = re.compile(r'<(p|button|span|label)((?: [^>]*)?)>([^<>]{2,})</\1>')

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")[:24]

strings, out, section, pos = {}, [], "header", 0
for m in EL.finditer(html):
    chunk = html[pos:m.start()]
    for s in re.findall(r'<section [^>]*id="(\w+)"', chunk):
        section = s
    out.append(chunk)
    pos = m.end()
    tag, attrs, text = m.groups()
    ident = re.search(r' id="(\w+)"', attrs)
    data = re.search(r' data-[a-z]="([^"]*)"', attrs)
    if (ident and ident.group(1) in SKIP_IDS) or text.strip().isdigit() or "data-i18n" in attrs:
        out.append(m.group(0))
        continue
    name = ident.group(1) if ident else (data.group(1) or "default") if data else slug(text)
    key = f"{section}.{name}"
    n = 2
    while key in strings and strings[key] != text:
        key, n = f"{section}.{name}{n}", n + 1
    strings[key] = text
    out.append(f'<{tag}{attrs} data-i18n="{key}">{text}</{tag}>')
out.append(html[pos:])
path.write_text("".join(out), encoding="utf-8")
(ROOT / "src/i18n/sk.json").write_text(json.dumps(strings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(len(strings), "strings")
