# Board

`story.canvas` is a [JSON Canvas 1.0](https://jsoncanvas.org/spec/1.0/) file. Every story uses the same layout, so a reader knows where to look and a new round lands in a known place.

## Format

The file holds `nodes` and `edges` and nothing else; an editor's own bookkeeping (Skena's `nodeLabel`, a saved `viewport`) is dropped on write.

- **Nodes** list groups first, since later nodes draw on top. Each has `id`, `type`, `x`, `y`, `width`, `height` and an optional `color`.
  - `text`: `text`, in Markdown.
  - `file`: `file`, a path from the board's own folder (`shots/r1-home-a-1440.png`).
  - `link`: `url`.
  - `group`: `label`. A card belongs to the group whose box holds it whole.
- **Edges**: `id`, `fromNode`, `fromSide`, `toNode`, `toSide` (`top`, `right`, `bottom`, `left`) and an optional `label`. The arrowhead is at the `to` end.
- **Colours**: `"1"` red, `"2"` orange, `"3"` yellow, `"4"` green, `"5"` cyan, `"6"` purple.

## Layout

Rows of groups, top to bottom, 120 apart across and down. Inside a group, cards start 30 from its left edge and 60 below its top (the label band), 40 apart.

1. **Top row**
   - **Idea** group: the problem and the goal in one text card, the issue as a link card under it.
   - **Starting point** group, when the work began from something earlier: a parked prototype, a prior decision.
   - **Flow** group: one 180×70 text card per step, joined left to right by arrows; one row of cards per actor when several act (host, guest).
   - **Decision log**: one text card, colour `"6"`, outside any group, under Flow.
2. **A row per round**: a group per page judged, labelled `Round <n> · <page> at <width> px`. One screenshot card per variant, 300 high and as wide as the shot's aspect ratio (a 1440×900 shot is 480×300); 20 under each, a 150-high verdict card. Other widths and states of the same round get groups of their own in the next row (`Round 1 · at 870 px`, `Round 1 · more states`), each shot captioned by a 56-high card.
3. A new round starts a new row under the last; existing cards keep their places.

Arrows between groups name the relation: `started from`, `round 2`, `decided`, `narrower`.

## Verdict cards

The variant in bold (`**A · Split**`), one line on what it is, then the verdict:

- **chosen**: colour `"4"`, `★ chosen`, then its reason when one was given
- **rejected**: colour `"1"`, `Rejected: <reason>`
- **open or unknown**: no colour, `Verdict: _not recorded_`

## Decision log

`## Decision log`, then one line per decision, oldest first: `- **<what>:** <the choice>. Why: <reason, or _not recorded_>. (<date>, #<issue or PR>)`
