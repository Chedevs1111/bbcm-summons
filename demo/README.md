# Interactive demo

A single-file, self-contained walkthrough of the app: sign in, dashboard, the generated
pleadings, the court bundle, Service & Fees, and the client portal. No server, no build
step, nothing saved. It runs on a snapshot of real data pulled from `wrangler dev` with
the seeded database, so the document bodies and bundle index are genuine output rather
than mock-ups.

## Which file to edit

**`artifact-source.html` is the source. Edit that one.**

`bbcm-summons-demo.html` is generated from it — the same content wrapped in a
`<!doctype html>` skeleton so it can be opened straight off disk. Editing it directly
gets overwritten the next time the pair is regenerated.

The split exists because the hosted copy supplies its own document skeleton, while a
file opened by double-clicking needs one of its own or the browser drops into quirks
mode.

To regenerate the standalone after changing the source:

```bash
python3 - <<'PY'
import pathlib
src = pathlib.Path('demo/artifact-source.html').read_text()
title  = '<title>BBCM Summons — Interactive Demo</title>'
style  = src[src.index('<style>'):src.index('</style>') + len('</style>')]
markup = src[src.index('<div class="progress"'):].rstrip()
pathlib.Path('demo/bbcm-summons-demo.html').write_text(
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    f'{title}\n{style}\n</head>\n<body>\n{markup}\n</body>\n</html>\n')
PY
```

Note that macOS filesystems are case-insensitive by default: `BBCM-Summons-demo.html`
and `bbcm-summons-demo.html` are the same path, so writing to one clobbers the other.

## What it does not include

The demo is a shell. Buttons like **Download PDF**, **Issue** and **DOCX** raise a toast
instead of doing the work, because that work happens in the Worker. More importantly,
none of the security is here and none of it can be — per-firm scoping, PBKDF2 password
verification and rate limiting all live server-side. Any password signs you in.
