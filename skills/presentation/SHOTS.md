# shots.json

What `scripts/shoot.mjs` shoots: each changed place on the before site and on the after site, in a 1440×900 desktop browser at 2×, the change outlined and the shot cropped to the slide's frame around the outlines.

```json
{
  "before": "https://example.com",
  "after": "https://dev.example.com",
  "accent": "#b8f23c",
  "shots": [
    {
      "name": "model",
      "path": "/library/3d-assets/avocado-02",
      "before": { "mark": [{ "text": "Tris Count", "minWidth": 300 }] },
      "after": { "mark": [{ "css": "dl", "closest": "section" }] }
    },
    {
      "name": "filter",
      "path": "/library/results",
      "viewport": true,
      "after": {
        "steps": [
          { "click": { "text": "Add filter" } },
          { "click": { "role": "checkbox", "name": "Height" } },
          { "press": "Escape" },
          { "click": { "text": "Height", "exact": true } },
          { "click": { "role": "button", "name": "5–7" }, "wait": 2500 }
        ],
        "mark": [{ "point": [140, 175], "minWidth": 230, "minHeight": 110, "inset": true }]
      }
    }
  ]
}
```

- **Sites**: `before` and `after` are base URLs; a shot's `path` is opened on each. With no `before`, only after shots are taken, cropped twice as tall to fill a slide alone (a shot's `"aspect"`, width over height, overrides the crop's shape); `node scripts/shoot.mjs shots.json shots/ before` takes only the before ones, for a caller that must shoot them ahead of its own deploy. `accent` is the after outline's colour (the slides' `--accent`); the before outline is dashed red.
- **Per side**: `before` and `after` each take `steps`, `mark` and `clip`. The same keys on the shot itself apply to both sides.
- **steps** open what the change sits behind, in order: `{ "click": target }`, `{ "press": "Escape" }`, each followed by `wait` ms (800 by default). A target is `{ "text", "exact"? }`, `{ "role", "name" }` or `{ "css" }`.
- **mark** finds elements and outlines them. Find by `css` (`"all": true` for every match), `text` (`"exact": true` for the whole text) or `point` (`[x, y]` in the viewport, for an element with no stable text or class). From there `minWidth` / `minHeight` climb to the first ancestor that large, `closest` to the nearest ancestor matching a selector, `up` that many parents.
- **clip** is left out to crop around the outlines, `"top"` for the page's top strip, `{ "around": [finds] }` to crop around elements without outlining them, or a rect `{ "x", "y", "width", "height" }` in page pixels.

Traps:

- A parent with `overflow: hidden` cuts an outline drawn outside the box: `"inset": true` draws it inside.
- Children that paint over their parent (a hero image) hide its outline: `"overlay": true` lays a frame on top instead.
- An open menu or popover renders faded in a full-page capture: the shot takes `"viewport": true`, the viewport as it stands.
- An item at the bottom of a list that scrolls inside a popover is cut off: `"reveal": true` scrolls it into view.
- `"plain": true` widens the crop to an element without outlining it, to keep the control that opened a popover in the shot.
- A thing the before site lacks reads as missing only when both sides show the same stretch of page: give both the same shot-level `clip: { "around": [...] }`.
- A page the before site lacks opens its 404 page, and that 404 is the before shot.
