#!/usr/bin/env python3
"""
Builds the deployable site in demo/site/ and the double-clickable local copies.

There are two sources of truth, both content-only (no <html>/<head>/<body>) because the
Artifact host supplies its own skeleton:

    artifact-source.html          the interactive product demo
    court-documents-artifact.html the generated pleadings

Everything else here is derived. Editing a generated file directly gets overwritten the
next time this runs, which is exactly the mistake this script exists to prevent.

    python3 demo/build-site.py
"""

import pathlib
import re
import sys

HERE = pathlib.Path(__file__).parent
SITE = HERE / 'site'

# The site's own address. og:image has to be absolute for some link scrapers, and a
# relative one is simply wrong once the site has a home. Pass --domain to change it, or
# leave it empty to build a bundle that still works from any folder on any host.
DOMAIN = 'https://bbcmsummons.co.za'
for i, arg in enumerate(sys.argv):
    if arg == '--domain':
        DOMAIN = sys.argv[i + 1].rstrip('/') if i + 1 < len(sys.argv) else ''
    elif arg == '--no-domain':
        DOMAIN = ''

FAVICON = (
    "data:image/svg+xml,"
    "%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E"
    "%3Crect width='64' height='64' rx='14' fill='%230f172a'/%3E"
    "%3Ctext x='32' y='44' font-family='Georgia,serif' font-size='30' font-weight='700'"
    " text-anchor='middle' fill='%23e3c04b'%3EBS%3C/text%3E%3C/svg%3E"
)

PAGES = {
    'index.html': {
        'source': 'artifact-source.html',
        'local': 'bbcm-summons-demo.html',
        'title': 'BBCM Summons — Interactive Demo',
        'card': 'BBCM Summons — court documents for South African attorneys',
        'desc': ('Capture a divorce matter once and generate the Combined Summons, '
                 'Particulars of Claim, Settlement Agreement and a paginated Court '
                 'Online bundle.'),
    },
    'documents.html': {
        'source': 'court-documents-artifact.html',
        'local': 'court-documents.html',
        'title': 'Mokoena v Mokoena — Court Documents',
        'card': 'Mokoena v Mokoena — Court Documents',
        'desc': ('The Combined Summons, Particulars of Claim, Settlement Agreement, '
                 'Index and Annexure Schedule, laid out on A4 and ready to print.'),
    },
}


def head(page: dict, name: str) -> str:
    """
    Head tags the content-only sources cannot carry.

    og:image is absolute when a domain is known, because some link scrapers will not
    resolve a relative one, and relative is meaningless to a scraper anyway. Build with
    --no-domain for a bundle that has to work from an unknown folder on an unknown host.
    """
    image = f'{DOMAIN}/preview.png' if DOMAIN else 'preview.png'
    # The home page's canonical address is the bare domain — that is the URL people
    # share and the one a search engine should index, not /index.html.
    page_url = f'{DOMAIN}/' if name == 'index.html' else f'{DOMAIN}/{name}'
    canonical = f'<link rel="canonical" href="{page_url}">\n' if DOMAIN else ''
    return f'''{canonical}<meta name="description" content="{page['desc']}">
<meta name="theme-color" content="#0f172a">
<link rel="icon" href="{FAVICON}">

<meta property="og:type" content="website">
<meta property="og:site_name" content="BBCM Summons">
<meta property="og:title" content="{page['card']}">
<meta property="og:url" content="{page_url}">
<meta property="og:description" content="{page['desc']}">
<meta property="og:image" content="{image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{page['card']}">
<meta name="twitter:description" content="{page['desc']}">
<meta name="twitter:image" content="{image}">
'''


def wrap(page: dict, name: str, body: str, style: str) -> str:
    return (
        '<!doctype html>\n<html lang="en">\n<head>\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f"<title>{page['title']}</title>\n"
        f'{head(page, name)}'
        f'{style}\n</head>\n<body>\n{body}\n</body>\n</html>\n'
    )


def split(src: str) -> tuple[str, str]:
    """Returns (style, markup) from a content-only source."""
    style = src[src.index('<style>'):src.index('</style>') + len('</style>')]
    after = src.index('</style>') + len('</style>')
    return style, src[after:].strip()


def add_cross_links(name: str, markup: str) -> str:
    """Relative links, so the pair still find each other inside a subfolder."""
    if name == 'index.html':
        return markup.replace(
            '<button class="btn btn--ghost btn--sm" id="themeBtn" style="margin-left:auto">',
            '<a class="btn btn--ghost btn--sm" href="documents.html" '
            'style="margin-left:auto;text-decoration:none">Court documents</a>\n'
            '      <button class="btn btn--ghost btn--sm" id="themeBtn">',
            1,
        )
    return markup.replace(
        '<button class="print" onclick="window.print()">Print</button>',
        '<a href="index.html">Back to the app</a>\n'
        '    <button class="print" onclick="window.print()">Print</button>',
        1,
    )


def main() -> None:
    SITE.mkdir(exist_ok=True)

    for name, page in PAGES.items():
        src = (HERE / page['source']).read_text()
        style, markup = split(src)
        markup = add_cross_links(name, markup)
        html = wrap(page, name, markup, style)

        (SITE / name).write_text(html)
        (HERE / page['local']).write_text(html)  # same bytes, for opening off disk
        print(f"  {name:16} {len(html):>7,} bytes")

    (SITE / 'robots.txt').write_text('User-agent: *\nAllow: /\n')

    # Defence in depth. The layout already keeps notes and scripts out of this folder;
    # this makes sure that if one is ever uploaded by hand it is not served. LiteSpeed
    # and Apache both honour it; hosts that ignore it simply lose the extra protection.
    (SITE / '.htaccess').write_text('''# Never serve source, notes or archives.
<FilesMatch "\\.(md|py|sh|mjs|zip|map|log)$">
  Require all denied
</FilesMatch>

# A missing page should show the styled 404, not the server's default.
ErrorDocument 404 /404.html
''')

    (SITE / '404.html').write_text(f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found — BBCM Summons</title>
<link rel="icon" href="{FAVICON}">
<style>
  body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0f172a;
    color:#e9eefb;font-family:Inter,system-ui,-apple-system,sans-serif;text-align:center;padding:24px}}
  h1{{font-family:Georgia,serif;font-size:30px;margin:0 0 10px}}
  p{{color:#8ea0be;margin:0 0 22px}}
  a{{display:inline-block;padding:10px 18px;border-radius:9px;text-decoration:none;
    color:#231a02;font-weight:650;
    background:linear-gradient(135deg,#f7e7ad,#e3c04b 30%,#c9a227 60%,#e3c04b)}}
</style>
</head>
<body>
  <div>
    <h1>That page isn&rsquo;t here</h1>
    <p>The link may be out of date.</p>
    <a href="index.html">Go to BBCM Summons</a>
  </div>
</body>
</html>
''')

    if not (SITE / 'preview.png').exists():
        print('  preview.png missing — run: python3 demo/make-og-image.py')

    print(f'\nSite built in {SITE}')


if __name__ == '__main__':
    main()
