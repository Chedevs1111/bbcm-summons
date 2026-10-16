#!/usr/bin/env node
/**
 * Regenerates the embedded font and ICC assets under src/pdf/assets/.
 *
 *   python3 -m pip install fonttools pillow
 *   node packages/documents/scripts/build-fonts.mjs
 *
 * Why these assets are checked in: a Worker has no filesystem, so the font bytes and
 * the ICC profile have to be part of the bundle. PDF/A requires every font to be
 * embedded (even ones a normal PDF could reference as standard-14) and requires an
 * OutputIntent with an embedded destination profile.
 *
 * Tinos is metric-compatible with Times New Roman and OFL-1.1 licensed. Subsetting to
 * the characters a pleading can contain takes each face from ~326 KB to ~18 KB.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoRoot = path.resolve(pkgRoot, '../..');

const script = String.raw`
import base64, io, os
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options
from PIL import ImageCms

src = os.path.join(${JSON.stringify(repoRoot)}, 'node_modules/@fontsource/tinos/files')
dest = os.path.join(${JSON.stringify(pkgRoot)}, 'src/pdf/assets')
os.makedirs(dest, exist_ok=True)

faces = {
    'regular':    'tinos-latin-400-normal.woff',
    'bold':       'tinos-latin-700-normal.woff',
    'italic':     'tinos-latin-400-italic.woff',
    'boldItalic': 'tinos-latin-700-italic.woff',
}

# Latin-1 plus the punctuation SA pleadings use. Horizontal rules are drawn as vector
# lines, so no box-drawing glyphs are required.
extra = '“”‘’—–…§€£R×÷°'
chars = set(chr(c) for c in range(0x20, 0x7F)) | set(chr(c) for c in range(0xA0, 0x180)) | set(extra)

def chunks(v):
    return '\n  '.join("'" + v[i:i+96] + "' +" for i in range(0, len(v), 96)).rstrip(' +')

out = {}
for name, fn in faces.items():
    font = TTFont(os.path.join(src, fn))   # WOFF is zlib-based, so no brotli needed
    font.flavor = None
    opts = Options(); opts.layout_features = ['*']; opts.notdef_outline = True
    sub = Subsetter(options=opts); sub.populate(text=''.join(sorted(chars))); sub.subset(font)
    buf = io.BytesIO(); font.save(buf); data = buf.getvalue()
    assert data[:4] in (b'\x00\x01\x00\x00', b'true'), name
    out[name] = base64.b64encode(data).decode()
    print(f'{name:11s} {len(data):>7,} bytes')

header = '''/**
 * Tinos, subset to the characters a South African pleading can contain.
 *
 * Tinos is metric-compatible with Times New Roman and is licensed under the SIL Open
 * Font License 1.1 (see LICENSE-Tinos.txt), so it can be embedded in generated
 * documents. PDF/A requires every font to be embedded — including fonts a normal PDF
 * could reference as standard-14 — which is why real font data ships here.
 *
 * Regenerate with scripts/build-fonts.mjs. Do not edit by hand.
 */

'''
body = '\n\n'.join(f'export const TINOS_{k.upper()}_BASE64 =\n  {chunks(v)};' for k, v in out.items())
open(os.path.join(dest, 'fonts.ts'), 'w').write(header + body + '\n')

prof = ImageCms.createProfile('sRGB')
icc = ImageCms.ImageCmsProfile(prof).tobytes()
desc = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(prof)).strip()
b64 = base64.b64encode(icc).decode()
open(os.path.join(dest, 'srgb-icc.ts'), 'w').write(f'''/**
 * sRGB IEC61966-2.1 ICC profile, generated with littleCMS (MIT).
 *
 * PDF/A-2b requires a PDF to declare an OutputIntent with an embedded destination
 * colour profile, so a viewer can reproduce colour without external resources.
 * Regenerate with scripts/build-fonts.mjs. Do not edit by hand.
 */

export const SRGB_ICC_DESCRIPTION = {desc!r};
export const SRGB_ICC_BYTES = {len(icc)};

export const SRGB_ICC_BASE64 =
  {chunks(b64)};
''')
print(f'icc {len(icc)} bytes')
`;

execFileSync('python3', ['-c', script], { stdio: 'inherit' });
console.log('Assets regenerated in packages/documents/src/pdf/assets/');
