#!/usr/bin/env python3
"""
Generates the Open Graph preview card used when a link to the site is shared.

1200x630 is the size every major platform crops from, so the card is drawn at that
exact ratio and nothing important sits within ~60px of an edge — Slack, WhatsApp and
Twitter each trim slightly differently.

Gold is faked as a vertical two-stop blend rather than the CSS gradient the site uses:
a flat yellow reads as highlighter at thumbnail size, which is the only size this is
ever seen at.
"""

import pathlib
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
NAVY, NAVY_HI = (15, 23, 42), (26, 39, 64)
GOLD_TOP, GOLD_BOT = (247, 231, 173), (176, 138, 40)
SLATE = (150, 165, 192)

GEORGIA = '/System/Library/Fonts/Supplemental/Georgia.ttf'
GEORGIA_B = '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'
HELV = '/System/Library/Fonts/Helvetica.ttc'


def gold_text(base, xy, text, font, anchor='la'):
    """Draws text filled with a vertical gold blend, via a gradient masked by the glyphs."""
    mask = Image.new('L', base.size, 0)
    ImageDraw.Draw(mask).text(xy, text, font=font, fill=255, anchor=anchor)

    grad = Image.new('RGB', (1, base.size[1]))
    for y in range(base.size[1]):
        t = y / max(1, base.size[1] - 1)
        grad.putpixel((0, y), tuple(
            round(GOLD_TOP[i] + (GOLD_BOT[i] - GOLD_TOP[i]) * t) for i in range(3)
        ))
    base.paste(grad.resize(base.size), (0, 0), mask)


def main() -> None:
    img = Image.new('RGB', (W, H), NAVY)
    d = ImageDraw.Draw(img)

    # A soft diagonal lift so the flat navy does not read as dead space.
    for y in range(H):
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(
            round(NAVY[i] + (NAVY_HI[i] - NAVY[i]) * t * 0.75) for i in range(3)
        ))

    # Monogram tile
    d.rounded_rectangle([80, 150, 212, 282], radius=26, fill=(2, 6, 23),
                        outline=(150, 118, 36), width=2)
    gold_text(img, (146, 216), 'BS', ImageFont.truetype(GEORGIA_B, 62), anchor='mm')

    gold_text(img, (250, 178), 'BBCM Summons', ImageFont.truetype(GEORGIA_B, 74))
    d.text((254, 268), 'LEGAL DOCUMENT GENERATOR',
           font=ImageFont.truetype(HELV, 22), fill=SLATE)

    d.text((82, 372), 'Court-ready divorce documents for',
           font=ImageFont.truetype(HELV, 40), fill=(233, 238, 251))
    d.text((82, 424), 'South African attorneys.',
           font=ImageFont.truetype(HELV, 40), fill=(233, 238, 251))

    d.text((82, 508), 'Combined Summons  ·  Particulars of Claim  ·  Settlement  ·  Court Online bundles',
           font=ImageFont.truetype(HELV, 21), fill=SLATE)

    # Gold rule along the foot, echoing the site's hairline.
    for x in range(W):
        t = x / W
        d.line([(x, H - 6), (x, H)], fill=tuple(
            round(GOLD_BOT[i] + (GOLD_TOP[i] - GOLD_BOT[i]) * (0.35 + 0.65 * t)) for i in range(3)
        ))

    out = pathlib.Path(__file__).parent / 'site' / 'preview.png'
    img.save(out, optimize=True)
    print(f'wrote {out} ({out.stat().st_size:,} bytes)')


if __name__ == '__main__':
    main()
