#!/usr/bin/env python3
"""
Renders the generated court documents to a static, printable HTML page.

The marker grammar is resolved here rather than in the browser, so the output is plain
document markup: it prints correctly, reads with JavaScript off, and survives being
emailed to someone as a single file.

This is a port of packages/documents/src/markers.ts. Two details carry over because
getting them wrong is what produced real bugs in the product:

  * {{C}} and {{R}} state spans line breaks. Resetting it per line once left
    "(GAUTENG DIVISION, PRETORIA)" at the left margin in every pleading.
  * {{R}} with text before it on the same line is a tab stop, not block alignment,
    and the split happens at the marker — never at a space. Splitting on whitespace
    truncated "THANDIWE GRACE MOKOENA -> PLAINTIFF" to "THANDIWE -> GRACE".
"""

import html
import json
import pathlib
import re

INLINE = {'B': 'strong', 'I': 'em', 'U': 'u'}
STOP = '\u0000'  # sentinel for the {{R}} tab stop; cannot occur in document text


def esc(text: str) -> str:
    return html.escape(text, quote=False)


def inline(text: str, state: dict) -> str:
    """Applies bold/italic/underline, carrying open tags across lines."""
    out, i = '', 0
    pattern = re.compile(r'\{\{(/?)(B|I|U)\}\}')
    while i < len(text):
        m = pattern.search(text, i)
        if not m:
            out += esc(text[i:])
            break
        out += esc(text[i:m.start()])
        tag = INLINE[m.group(2)]
        if m.group(1):
            if state.get(m.group(2), 0) > 0:
                out += f'</{tag}>'
                state[m.group(2)] -= 1
        else:
            out += f'<{tag}>'
            state[m.group(2)] = state.get(m.group(2), 0) + 1
        i = m.end()
    return out


def render_lines(chunk: str) -> str:
    centred = right = False
    marks: dict = {}
    out = ''

    for raw in chunk.split('\n'):
        line = raw
        stripped = line.strip()
        if re.fullmatch(r'═{3,}', stripped):
            out += '<hr class="rule rule--double">'
            continue
        if re.fullmatch(r'[─―—]{3,}', stripped):
            out += '<hr class="rule rule--single">'
            continue

        opens_c, closes_c = '{{C}}' in line, '{{/C}}' in line
        opens_r, closes_r = '{{R}}' in line, '{{/R}}' in line

        r_index = line.find('{{R}}')
        before = re.sub(r'\{\{/?[A-Z]+\}\}', '', line[:r_index]) if r_index > 0 else ''
        is_split = r_index > 0 and before.strip() != ''

        content_centred = centred or opens_c
        content_right = right or (opens_r and not is_split)
        if opens_c:
            centred = True
        if opens_r and not is_split:
            right = True

        line = re.sub(
            r'\{\{(/?)([CR])\}\}',
            lambda m: STOP if (is_split and m.group(0) == '{{R}}') else '',
            line,
        )

        cls = 'line'
        if is_split:
            left, _, rest = line.partition(STOP)
            cls += ' line--split'
            inner = f'<span>{inline(left, marks)}</span><span>{inline(rest, marks)}</span>'
        else:
            if content_centred:
                cls += ' line--center'
            elif content_right:
                cls += ' line--right'
            inner = inline(line, marks)

        if closes_c:
            centred = False
        if closes_r:
            right = False

        out += f'<p class="{cls}">{inner or "&nbsp;"}</p>'
    return out


def render(body: str) -> str:
    """Signature tables are block level and span many lines, so they come out first."""
    table = re.compile(r'\{\{TABLE\}\}(.*?)\{\{/TABLE\}\}', re.S)
    out, rest = '', body
    while True:
        m = table.search(rest)
        if not m:
            out += render_lines(rest)
            break
        out += render_lines(rest[:m.start()])
        cells = re.findall(r'\{\{TD\}\}(.*?)\{\{/TD\}\}', m.group(1), re.S)
        out += '<div class="sigtable">' + ''.join(
            f'<div>{inline(c.strip(), {})}</div>' for c in cells
        ) + '</div>'
        rest = rest[m.end():]
    return out


HEAD = """<title>Mokoena v Mokoena — Court Documents</title>

<style>
  :root{
    --navy:#0f172a; --gold:#c9a227;
    --ground:#eceff4; --paper:#fff; --ink:#14181f;
    --chrome:#fff; --chrome-ink:#46536b; --line:#dfe4ec;
  }
  @media (prefers-color-scheme: dark){
    :root{ --ground:#0a1020; --chrome:#111a2c; --chrome-ink:#b4c2dc; --line:#233350; }
  }
  :root[data-theme="dark"]{ --ground:#0a1020; --chrome:#111a2c; --chrome-ink:#b4c2dc; --line:#233350; }
  :root[data-theme="light"]{ --ground:#eceff4; --chrome:#fff; --chrome-ink:#46536b; --line:#dfe4ec; }

  *,*::before,*::after{box-sizing:border-box}
  body{
    margin:0; background:var(--ground); color:var(--chrome-ink);
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
    -webkit-font-smoothing:antialiased;
  }

  /* ---------- chrome (never prints) ---------- */
  .bar{
    position:sticky; top:0; z-index:10;
    display:flex; align-items:center; gap:14px; flex-wrap:wrap;
    padding:11px 20px; background:var(--chrome); border-bottom:1px solid var(--line);
  }
  .bar__brand{display:flex; align-items:center; gap:11px; margin-right:6px}
  .mark{
    width:34px;height:34px;flex:none;display:grid;place-items:center;border-radius:9px;
    background:var(--navy); border:1px solid rgb(201 162 39/.5);
  }
  .mark b{
    font-family:Georgia,serif;font-size:15px;
    background:linear-gradient(135deg,#f7e7ad,#e3c04b 25%,#c9a227 50%,#8a6a15 65%,#f7e7ad);
    background-clip:text;-webkit-background-clip:text;color:transparent;-webkit-text-fill-color:transparent;
  }
  .bar__title{font-size:13.5px;font-weight:650;color:var(--chrome-ink)}
  .bar__sub{font-size:11px;color:var(--chrome-ink);opacity:.7}
  .bar nav{display:flex; gap:4px; flex-wrap:wrap; margin-left:auto}
  .bar a, .bar button{
    font:inherit; font-size:12.5px; color:var(--chrome-ink); text-decoration:none; cursor:pointer;
    padding:6px 11px; border-radius:7px; border:1px solid var(--line); background:transparent;
  }
  .bar a:hover, .bar button:hover{border-color:var(--gold); color:inherit}
  .bar .print{background:var(--gold); border-color:var(--gold); color:#231a02; font-weight:650}

  /* ---------- paper ---------- */
  main{padding:26px 16px 60px}
  .sheet{
    width:210mm; min-height:297mm; margin:0 auto 26px; padding:25.4mm;
    background:var(--paper); color:var(--ink);
    box-shadow:0 1px 3px rgb(15 23 42/.14), 0 12px 30px -12px rgb(15 23 42/.3);
  }
  .sheet__tag{
    font-family:Inter,system-ui,sans-serif; font-size:9.5px; letter-spacing:.14em;
    text-transform:uppercase; color:#8b93a3; margin:0 0 14px;
  }

  .doc{font-family:Georgia,"Times New Roman",Times,serif; font-size:12pt; line-height:1.5}
  .doc .line{margin:0; min-height:1.5em; white-space:pre-wrap; word-break:break-word}
  .doc .line--center{text-align:center}
  .doc .line--right{text-align:right}
  .doc .line--split{display:flex; justify-content:space-between; gap:2rem}
  .doc .rule{border:0; margin:.45em 0}
  .doc .rule--double{border-top:3px double currentColor}
  .doc .rule--single{border-top:1px solid #64748b}
  .doc .sigtable{display:grid; grid-template-columns:1fr 1fr; gap:2.5rem; margin-top:1.4em}
  .doc .sigtable>div{white-space:pre-wrap}

  @media (max-width:230mm){
    .sheet{width:auto; max-width:210mm; min-height:0; padding:26px 22px}
  }

  /* ---------- print ---------- */
  @page{size:A4; margin:25.4mm}
  @media print{
    body{background:#fff}
    .bar{display:none}
    main{padding:0}
    .sheet{
      width:auto; min-height:0; margin:0; padding:0;
      box-shadow:none; break-after:page; page-break-after:always;
    }
    .sheet:last-child{break-after:auto; page-break-after:auto}
    .sheet__tag{display:none}
  }
</style>
"""


def main() -> None:
    here = pathlib.Path(__file__).parent
    docs = json.loads((here / 'bodies.json').read_text())

    nav = ''.join(
        f'<a href="#{d["type"]}">{esc(d["title"])}</a>' for d in docs
    )

    sheets = ''.join(
        f'<article class="sheet" id="{d["type"]}">'
        f'<p class="sheet__tag">{esc(d["title"])} &middot; Mokoena v Mokoena &middot; '
        f'case 45678/2026</p>'
        f'<div class="doc">{render(d["body"])}</div>'
        f'</article>'
        for d in docs
    )

    page = f"""{HEAD}
<div class="bar">
  <div class="bar__brand">
    <div class="mark"><b>BS</b></div>
    <div>
      <p class="bar__title">Mokoena v Mokoena</p>
      <p class="bar__sub">VDM/2026/D/007 &middot; Case 45678/2026 &middot; Gauteng Division, Pretoria</p>
    </div>
  </div>
  <nav>
    {nav}
    <button class="print" onclick="window.print()">Print</button>
  </nav>
</div>

<main>
  {sheets}
</main>
"""

    out = pathlib.Path.home() / 'bbcm-summons' / 'demo' / 'court-documents.html'
    standalone = (
        '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + page[: page.index('</style>') + len('</style>')]
        + '\n</head>\n<body>\n'
        + page[page.index('</style>') + len('</style>'):].strip()
        + '\n</body>\n</html>\n'
    )
    out.write_text(standalone)

    # The artifact host supplies its own skeleton, so it gets the content-only form.
    (here / 'court-documents-artifact.html').write_text(page)

    print(f'wrote {out} ({out.stat().st_size:,} bytes), {len(docs)} documents')


if __name__ == '__main__':
    main()
