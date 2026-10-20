---
name: presentation
description: Presentation of phone-sized slides showing what changed for a product's users, to post in a chat. Use when the user wants a what's-new post or a visual report of shipped changes.
---

# Presentation

A few phone-sized images of what changed for the people using the product, posted to a chat (a Telegram group, say) where they are read on a phone.

## Input

- **changes**: each one's visible effect and where a user meets it (a page URL, an email, a link preview)
- **label**: the version or occasion on the top line (`v1.4.0`, `Week 42`), or none
- **date**: today, unless one is named
- **site**: where the changes are live; production, unless one is named
- **folder**: the docs' or the agent's memory's place for presentations or release reports, else the scratchpad (tell the user it is temporary)

A skill that calls this one hands over what it knows: take that as given. The rest comes from the user's words, else from the commits and closed issues since the last version tag (or the date the user names), each read for what a user would see. Ask the user only for what neither shows.

Done when every change has its visible effect and where a user meets it, or is out.

## What goes in

Changes someone outside can see: pages, UI, behaviour, link previews, emails, search titles. Infrastructure, CI, docs, refactors and backend internals stay out unless they change what a user sees; then the slide shows that effect, not the cause. A change the site does not show yet, unshipped or behind a flag that is off, stays out. With no visible change left, say so: the run ends without a presentation.

- one change per slide; a headline of up to six words with one accent word, one line under it, one big visual
- small changes share a closing "Also new" slide, up to four bullets with a short line each
- up to six slides
- the top line of every slide: brand · label · date · `n / total`, the label left out when there is none
- copy in the language of the product's public site

## Format

4:5 PNGs, 1080×1350: slides of 540×675 CSS pixels rendered at 2×. Body text at least 17 px CSS, headlines 34 px. Pictures are screenshots of the site with the change live, at phone size unless the change only shows on a wide screen (a desktop strip then sits above phone shots).

## Build

Paths under `scripts/` are in this skill's folder.

1. Copy the previous presentation's `presentation.html` (`album.html` in older folders) from the folder when there is one, so the style carries over; else `scripts/presentation.html`, its `:root` tokens set to the product's colours.
2. Shoot the site: `node scripts/shoot.mjs shots.json shots/` — phone by default (390×844 at 3×, cookie banner accepted, lazy images loaded), `"desktop": true` and a `clip` for a wide strip, `"anchor"` to scroll to a section. A link-preview slide uses the page's `og:image` and its `og:title` / `og:description`.
3. Write the slides, then render: `node scripts/render.mjs presentation.html <folder>/<date>/`.
4. View every PNG. Done when no text overlaps or clips, no slide is half empty, and each slide reads at phone width.
5. Hand the user the folder and a caption ready to paste: one line per slide's change, then the site link.

Both scripts need `playwright-core` and a local Chrome: they resolve `playwright-core` from the current directory, or from the `PLAYWRIGHT_CORE` path (an app's `node_modules/playwright-core`).
