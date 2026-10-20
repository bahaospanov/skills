---
"bahaospanov": minor
---

- **bahaospanov-skills**: `presentation` builds one slide per changed place: the page URL and the clicks that open it, a before shot from a site that still lacks the change above the after shot, dashed red on what went away and solid accent on what is new. Shots come from a 1440-wide desktop browser instead of a phone. `scripts/shoot.mjs` now reads a before/after `shots.json` (format and traps in `SHOTS.md`): steps that open menus and filters, elements to outline, and a crop around them. Up to eight slides; with no before site left, a slide shows the after alone.
- **bahaospanov-skills**: `release` shoots the album's before shots from production ahead of wave 1's promote and hands them to `presentation`, so the release album shows each change before and after.
