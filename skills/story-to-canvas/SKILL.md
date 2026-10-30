---
name: story-to-canvas
description: Save a feature's story as a canvas board in the repo: idea, flow, each prototype round's screenshots with a verdict per variant, and the decision log. Use when the user wants a feature's story recorded or updated, or a prototype captured before it is thrown away.
---

# Story to canvas

A **story** is one feature's record on a canvas: its idea, its flow, every prototype **round** with a screenshot and a **verdict** per variant, and the decision log with the reason behind each choice. It lives in the repo beside the code and outlives the prototype branch it was captured from.

```
docs/stories/<slug>/
  story.canvas   # JSON Canvas 1.0, laid out by BOARD.md
  shots/         # the PNGs the board points to
```

People open the board in VS Code with the Canvas Design extension (`EvenSo.canvas-design`) to pan, zoom and move cards; agents read and write its JSON. Paths under `scripts/` are in this skill's folder.

## Steps

1. **Sources.** The slug is the feature's name in the project's domain words. An existing `story.canvas` is the base: read it first and keep every card where the user left it. Gather what each round and decision rests on: the issue, the prototype branch and its variant switcher (the variant marked chosen there), commits, ADRs, existing screenshots, the conversation. Done when every variant and every decision has a source, or is marked _not recorded_.
2. **Shots.** One PNG per variant at each width it was judged at, in `shots/`, named `r<round>-<page>-<variant>[-<state>]-<width>.png` (`r1-home-a-1440.png`, `r1-claim-a-edit-1440.png`). A screenshot that already shows the variant is copied in. The rest are shot from the running prototype, so capture while its dev server is still up:

   ```json
   {
     "base": "http://localhost:3000",
     "shots": [
       { "name": "r1-home-a-1440", "path": "/?variant=a", "width": 1440, "height": 900 },
       { "name": "r1-claim-a-edit-1440", "path": "/claim?variant=a", "steps": [{ "click": { "text": "Edit" } }] }
     ]
   }
   ```

   `node scripts/shoot.mjs shots.json docs/stories/<slug>/shots/` writes `<name>.png`: the first screen at `width`×`height` (1440×900 by default), or the whole page with `"fullPage": true`. `steps` open what a state sits behind: `{ "click": target }` or `{ "press": "Escape" }`, each followed by `wait` ms (800 by default); a target is `{ "text", "exact"? }`, `{ "role", "name" }` or `{ "css" }`. The script needs `playwright-core` and a local Chrome; it resolves `playwright-core` from the current directory, or from `PLAYWRIGHT_CORE` (an app's `node_modules/playwright-core`). A dev server's overlay badge (Next.js's) paints over the page: switch it off for the run.

   View every shot. Done when each shows its variant, with no error page and no overlay over the content.
3. **Board.** Write `story.canvas` by [BOARD.md](BOARD.md). A verdict's reason comes from a source; with none, the card says `Verdict: _not recorded_`, a gap left in view for the user to fill. Done when every variant has its verdict card and every decision its log line.
4. **Check.** `node scripts/check.mjs docs/stories/<slug>/story.canvas`. Done when it prints `ok`.
5. **Hand over.** Give the user the command that opens the board, `code <repo> docs/stories/<slug>/story.canvas` (a board that opens as JSON: its tab's **Reopen Editor With…** → **Canvas Design**), then each _not recorded_ verdict as a question.
