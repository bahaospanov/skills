---
name: presentation
description: Phone-sized slides of what changed for a product's users, one changed place per slide with its page URL and desktop before/after shots, the change outlined, to post in a chat. Use when the user wants a what's-new post or a visual report of shipped changes.
disable-model-invocation: true
---

# Presentation

A few phone-sized images of what changed for the people using the product, posted to a chat (a Telegram group, say) where they are read on a phone. Each slide is one **place** a user meets a change: where it is, how it looked before, how it looks now, the change outlined.

## Input

- **changes**: each one's visible effect and its place: a page URL plus the clicks that open it (a menu, a filter, a tab)
- **label**: the version or occasion on the top line (`v1.4.0`, `Week 42`), or none
- **date**: today, unless one is named
- **site**: where the changes are live; production, unless one is named
- **before**: a site that still lacks the changes: production while they are live only on dev or staging. A caller about to deploy them everywhere shoots its before first (`shoot.mjs … before`) and hands the shots over; with no before left, each slide shows the after alone.
- **folder**: the docs' or the agent's memory's place for presentations or release reports, else the scratchpad (tell the user it is temporary)

A skill that calls this one hands over what it knows: take that as given. The rest comes from the user's words, else from the commits and closed issues since the last version tag (or the date the user names), each read for what a user would see. Ask the user only for what neither shows.

Done when every change has its place, or is out.

## What goes in

Changes someone outside can see: pages, UI, behaviour, emails, search titles. Infrastructure, CI, docs, refactors and backend internals stay out unless they change what a user sees; then the slide shows that effect, not the cause. A change the site does not show yet, unshipped or behind a flag that is off, stays out. With no visible change left, say so: the run ends without a presentation.

- one place per slide: a headline of up to six words with one accent word; the place's URL, path in the accent colour and `→ Catalog` for the clicks that open it; one line on what replaced what; the before shot above the after shot
- outlines: dashed red on what went away, solid accent on what is new
- a change with no single place to point at (a ranking, a fix) goes on a closing "Also new" slide, up to four bullets with a short line each, or stays out
- up to eight slides
- the top line of every slide: brand · label · date · `n / total`, the label left out when there is none
- copy in the language of the product's public site

## Format

4:5 PNGs, 1080×1350: slides of 540×675 CSS pixels rendered at 2×. Body text at least 17 px CSS, headlines 34 px. Shots come from a desktop browser, 1440 wide at 2×, each cropped to its slide frame around the outlines.

## Build

Paths under `scripts/` are in this skill's folder.

1. Copy the previous presentation's `presentation.html` (`album.html` in older folders) from the folder when there is one, so the style carries over; else `scripts/presentation.html`, its `:root` tokens set to the product's colours.
2. Write `shots.json`, one entry per place ([SHOTS.md](SHOTS.md): format and traps), and shoot: `node scripts/shoot.mjs shots.json shots/` writes `<name>-before.png` and `<name>-after.png`. A caller's `shots.json` and before shots are taken as given: copy them in and shoot the after side alone, `node scripts/shoot.mjs shots.json shots/ after`.
3. View every shot. Done when each outline sits on its change and nothing else, and every open menu or popover is opaque.
4. Write the slides, then render: `node scripts/render.mjs presentation.html <folder>/<date>/`.
5. View every PNG. Done when no text overlaps or clips, no slide is half empty, and each slide reads at phone width.
6. Hand the user the folder and a caption ready to paste: one line per slide, its place then what changed, then the site link.

Both scripts need `playwright-core` and a local Chrome: they resolve `playwright-core` from the current directory, or from the `PLAYWRIGHT_CORE` path (an app's `node_modules/playwright-core`).
