# BBCM Summons — static site bundle

**Upload the contents of `site/`, not this file.** This README is instructions for
whoever publishes the site; it is deliberately kept outside `site/` so it cannot end up
on a public URL. `site/.htaccess` also blocks `.md` and other source files, in case one
is ever uploaded by hand.

    site/index.html      the interactive product walkthrough (the home page)
    site/documents.html  the five generated pleadings, laid out on A4 and printable
    site/preview.png     the card shown when a link to the site is shared
    site/404.html        shown for a URL that does not exist
    site/robots.txt      allows search engines
    site/.htaccess       404 handling, and refuses to serve source files

Everything is self-contained: no CDN, no external fonts, no tracking, no network
requests at all. It works offline and from a subfolder.

## Uploading

**Shared hosting (cPanel, Plesk, FTP)** — upload everything in `site/` into `public_html`, or
into a subfolder if the site should live at `example.co.za/summons/`. Links between the
pages are relative, so a subfolder works without changes.

**Netlify or Vercel** — drag the `site` folder onto the dashboard's deploy area.

**Cloudflare Pages** — `npx wrangler pages deploy site --project-name=bbcm-summons-demo`

**Amazon S3** — upload the files, enable static website hosting, set `index.html` as the
index document and `404.html` as the error document.

## One change to make once you have a domain

`og:image` is relative in these files so the bundle works from any folder. Most link
scrapers resolve that fine, but some require an absolute URL. Once the site has a real
address, run this in the folder:

```bash
sed -i '' 's#content="preview.png"#content="https://YOUR-DOMAIN/preview.png"#g' index.html documents.html
```

Replace `YOUR-DOMAIN` with the real hostname. On Linux, use `sed -i` without the `''`.

Check the result by pasting the URL into https://cards-dev.twitter.com/validator or
posting it in a Slack message to yourself.

## What this bundle is, and what it is not

This is a **demonstration**. It runs entirely in the browser on a snapshot of real
generated output, so the screens, the pleadings and the bundle index are genuine.

It is **not the working application**. Nothing is saved, any password signs you in, and
the buttons that would produce a file — Download PDF, Issue, DOCX — show a message
instead. The parts that make the real system trustworthy are all server-side and are
deliberately absent here: per-firm access control, password verification, rate limiting
and the audit trail.

Two screens, Review & Confirm and Detailed OCR, are labelled **Illustrative**. Document
extraction has never been run against a real document, so those confidence scores stand
in for a result rather than reporting one.

Do not put this bundle forward as a live legal service. It is a showcase of one.
