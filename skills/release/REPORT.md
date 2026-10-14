# Report

The release album: a few phone-sized images of what changed for the people using the product, posted to a chat (a Telegram group, say) where they are read on a phone.

## What goes in

Changes someone outside can see: pages, UI, behaviour, link previews, emails, search titles. Infrastructure, CI, docs, refactors and backend internals stay out unless they change what a user sees; then the slide shows that effect, not the cause. The step 4 extraction is the source: each shipped ticket's how-to-test items name the visible change. A held or flag-off change stays out.

- one change per slide; a headline of up to six words with one accent word, one line under it, one big visual
- small changes share a closing "Also new" slide, up to four bullets with a short line each
- up to six slides
- the top line of every slide: brand · version · date · `n / total`
- copy in the language of the product's public site

## Format

4:5 PNGs, 1080×1350: slides of 540×675 CSS pixels rendered at 2×. Body text at least 17 px CSS, headlines 34 px. Pictures are screenshots of production after the deploy, at phone size unless the change only shows on a wide screen (a desktop strip then sits above phone shots).

## Build

In a report folder: the docs' or the agent's memory's place for release reports, else the scratchpad (tell the user it is temporary).

1. Copy the previous run's `album.html` from that folder when there is one, so the style carries over; else `scripts/report/album.html`, its `:root` tokens set to the product's colours.
2. Shoot production: `node scripts/report/shoot.mjs shots.json shots/` — phone by default (390×844 at 3×, cookie banner accepted, lazy images loaded), `"desktop": true` and a `clip` for a wide strip, `"anchor"` to scroll to a section. A link-preview slide uses the page's `og:image` and its `og:title` / `og:description`.
3. Write the slides, then render: `node scripts/report/render.mjs album.html <report folder>/<date>/`.
4. View every PNG. Done when no text overlaps or clips, no slide is half empty, and each slide reads at phone width.
5. Hand the user the folder and a caption ready to paste: one line per slide's change, then the site link.

Both scripts need `playwright-core` and a local Chrome: they resolve `playwright-core` from the current directory, or from the `PLAYWRIGHT_CORE` path (an app's `node_modules/playwright-core`).
