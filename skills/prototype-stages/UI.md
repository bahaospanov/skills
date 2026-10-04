# UI Prototype

Generate **radically different UI variations** on a real route and steer them from a **stage panel**. The question can be one decision on one page, or a whole multi-step flow where many decisions multiply; either way every decision is a row of one-click options, filed under the stage of the flow it acts on. The user flips combinations in the browser, picks one (or steals bits from each), then throws the rest away.

If the question is about logic/state rather than what something looks like, this is the wrong branch. Use [LOGIC.md](LOGIC.md).

## When this is the right shape

- "What should this page look like?"
- "I want to see a few options for this dashboard before committing."
- "Try a different layout for the settings screen."
- "Prototype the signup flow: every way to do each step, multiplied together."
- Any time the user would otherwise spend a day picking between vague mockups in their head.

## Stages and dimensions

- **Stage**: one phase of the flow's lifecycle, numbered in order (① Start, ② Photo, ③ Scan …) and named by what is true of the system during it ("scan finished, still a draft"), not by its screen. Every screen belongs to exactly one stage; a single-page prototype is one stage.
- **Dimension**: one open design decision, a URL search param with options `a`, `b`, `c` …, each named in a few words. Acts at one stage.
- **Spanning dimension**: a decision whose options act at different stages (where to ask for the user's name: during the scan, on the result, at the final tap). It lives in an **aside** block after the stages, and each option's name starts with its stage number.
- **Knob**: a simulation input, not a design choice: backend timing and failure, first-time vs returning user, simulated vs real device surfaces. Sits under the stage it affects.
- **Requires**: a dimension that only matters under one knob value (remembered-name behaviour with a returning user only).
- **Now marker**: "◀ now" on the stage the flow is in, plus any aside whose UI is on screen.

## Two sub-shapes: strongly prefer sub-shape A

A UI prototype is much easier to judge when it's **butting up against the rest of the app**: real header, real sidebar, real data, real density. A throwaway route on its own is a vacuum: every variant looks fine in isolation. Default to sub-shape A whenever there's a plausible existing page to host the variants. Only reach for sub-shape B if the prototype genuinely has no nearby home.

### Sub-shape A: adjustment to an existing page (preferred)

The route already exists. Variants are rendered **on the same route**, gated by URL search params, one per dimension. The existing data fetching, params, and auth all stay. Only the rendering swaps. This is the default; pick it unless there's a specific reason not to.

If the prototype is for something that doesn't yet have a page but *would naturally live inside one* (a new section of the dashboard, a new card on the settings screen, a new step in an existing flow), it's still sub-shape A. Mount the variants inside the host page. A whole flow mounts on the route it really starts from, with the current page kept reachable behind `?legacy=1`.

### Sub-shape B: a new page (last resort)

Only use this when the thing being prototyped genuinely has no existing page to live inside (e.g. an entirely new top-level surface, or a flow that can't be embedded anywhere sensible).

Create a **throwaway route** following whatever routing convention the project already uses. Don't invent a new top-level structure. Name it so it's obviously a prototype (e.g. include the word `prototype` in the path or filename). Same search-param pattern.

Before committing to sub-shape B, sanity-check: is there really no existing page this could be embedded in? An empty route hides design problems that a populated one would expose.

In both sub-shapes the stage panel is identical.

## Process

### 1. State the question, map the stages, pick the dimensions

Walk the flow from its first screen to its end state and cut wherever what is true of the system changes. Done when every screen names exactly one stage and every stage has a one-line note.

Every open decision from the conversation becomes a dimension at its stage; every option anyone floated becomes an option of it. Default to **3 options per dimension**. More than 5 stops being radically different and starts being noise, so cap there; breadth comes from more dimensions, which multiply. Add the knobs the flow needs to reach its branches. Done when every dimension has a stage (or is spanning, with every option stage-tagged) and every hidden dependency is a `requires`.

Write down the plan in one line, in the prototype's location or a top-of-file comment:

> "Signup flow on `/`, four stages, six dimensions and two knobs, steered from the stage panel."

This works whether the user is here to push back or not.

### 2. Generate radically different variants

Draft each option of each dimension. Hold each one to:

- The screen's purpose and the data it has access to.
- The project's component library / styling system (TailwindCSS, shadcn, MUI, plain CSS, whatever).
- A clear component name, e.g. `NameSheet`, `NameInline`, `NameChat`.

Options must be **structurally different**: different layout, different information hierarchy, different primary affordance, not just different colours. Three slightly-tweaked card grids isn't a UI prototype, it's wallpaper. If two drafts come out too similar, redo one with explicit "do not use a card grid" guidance.

### 3. Wire them together

Read every dimension from its search param and render the flow step by step:

```tsx
// pseudo-code, adapt to the project's framework
const entry = param('entry');
const nameAsk = param('name');
const [step, setStep] = useState('landing');
return (
  <>
    {step === 'landing' && <Landing variant={entry} onStart={start} />}
    {step === 'scanning' && <Scanning nameAsk={nameAsk} />}
    {step === 'result' && <Result nameAsk={nameAsk} onOpen={open} />}
    <StagePanel stages={STAGES} dimensions={DIMENSIONS} current={stageOf[step]} />
  </>
);
```

A multi-step flow also needs:

- A step → stage map that feeds the now marker.
- A mocked backend on timers, every pending timer cancelled by restart and rewind; knobs set durations and outcomes.
- The app's real components on fixture data; OS surfaces (camera, file chooser, share sheet) faked by default, real under a knob.
- An **event log** of what the backend would be doing ("+0.4s draft row created in background"), the state the user cannot see on screen.
- Each stage's inputs (the photo, the typed name, the created record) held where a rewind can keep them and replay the stages after.
- A combination of options that conflicts resolves to one sensible behaviour, and the event log names it ("auto-open waits for the name").

For sub-shape A (existing page): keep all the existing data fetching above the flow; only the rendered subtree changes per option.

For sub-shape B (new page): the throwaway route under `/prototype/<name>` mounts the same panel.

### 4. Build the stage panel

The panel is how the user steers. It has one job: flip any option in one click while seeing where in the flow it bites.

**Placement.** On desktop it is fixed in the gutter beside the app, always open, scrolling on its own, so panel and flow stay in view together: flip, watch, flip. If the app fills the desktop width, the prototype route narrows it to a phone-width column so the gutter exists. On a phone, a small floating button opens the same content as a bottom sheet. Either way it is visually distinct from the page (dark, high contrast), so it's obviously not part of the design being evaluated.

**Pieces, top to bottom:**

- **Restart**: a button and the `R` key, with a one-line note that a flip rewinds to the option's stage.
- **One block per stage, in flow order**: the stage number and name, its one-line note, then its dimensions. A stage without dimensions keeps its block, so the timeline stays whole.
- **Aside blocks** for spanning dimensions, after the stages.
- **A legend** for the option styles.
- **Status**: the line saying what exists right now (the main record, the current step, key state), then the last lines of the event log.

**A dimension** is its label, then every option as a chip reading `key name`, all of them visible at once, the selected one filled. Knob chips are dashed. While a dimension's `requires` is unmet, it is dimmed with the condition beside its label.

**The now marker** gives the current stage's block an accent border, a tint, and "◀ now". An aside block lights the same way while its UI is on screen.

Behaviour:

- Clicking a chip updates its URL search param (use the framework's router, e.g. `router.replace` on Next, `navigate` on React Router, etc) so every combination is shareable and reload-stable.
- A flip **rewinds** the flow to the stage the option acts on, keeping everything the flow produced before that stage, so the user peeks at another option without redoing the earlier steps:
  - Option for a later stage than now: nothing moves; it takes effect when the flow gets there.
  - Option for the current stage: re-applied in place; the stage's own state resets.
  - Option for an earlier stage: the flow jumps back to it with the earlier inputs kept; that stage and everything after re-run on them (a scan knob reruns the scan on the same photo).
  - Spanning dimension: rewinds to its earliest stage and clears the value it collects, so the new way of asking shows.
  - First-stage option: the rewind is a restart.
  - Several params flipped at once: the earliest stage wins. Knobs rewind the same way as design options.
  - The event log names each rewind ("D2 changed → rewound to ② Photo, photo kept").
- Detect a flip by diffing the params against the previous render, after the URL updates; a click handler still holds the old values.
- `R` restarts. Don't intercept it when an `<input>`, `<textarea>`, or `[contenteditable]` is focused.
- Hidden in production builds: gate on `process.env.NODE_ENV !== 'production'` or an equivalent check, so a stray prototype merge can't ship the panel to users.

Put the panel in a single shared component so both sub-shapes can reuse it. Locate it wherever shared UI lives in the project.

### 5. Hand it over

Check it first at phone width in a browser: every stage reached at least once, every spanning option shown at its own stage, an earlier-stage option flipped from the last stage rewinds with the earlier state kept, no new console errors. Save screenshots under `prototype-screens/<name>/`.

Surface the run command, the URL, the LAN URL for a phone, and the stage map as a table: stage, what is true, its dimensions. The user will flip through whenever they get to it. The interesting feedback is usually **"I want the entry from b with the name ask from d"**, which is the actual design they want.

### 6. While the user plays

- A settled dimension is hard-coded and removed from the panel in the same turn; name the dimensions still open.
- A new idea becomes a new option on its dimension, or a new dimension at its stage.
- Feedback on the panel names friction or confusion; fix the panel's structure for that, then return to the flow.

### 7. Capture the answer and clean up

Once a combination has won, capture the answer (which options and why), then capture the prototype the way the [SKILL](SKILL.md) describes. Fold the winner into the real code and move the rest onto the throwaway branch, not into main:

- **Sub-shape A**: fold the winning options into the existing page or flow; drop the losing options and the panel from main.
- **Sub-shape B**: promote the winning combination to a real route; drop the throwaway route and the panel from main.

The full set of options is the primary source, so it lands on the throwaway branch, not the bin, since variant components and the panel left in the main branch rot fast and confuse the next reader.

## Anti-patterns

- **Options that differ only in colour or copy.** That's a tweak, not a prototype. Real options disagree about structure.
- **Sharing too much code between options.** A shared `<Header>` is fine; a shared `<Layout>` defeats the point. Each option should be free to throw out the layout.
- **A picker that shows one option at a time.** Arrows cycling through values, or a collapsed pill, make every comparison a hunt. Every option stays in view, one click away.
- **A flip that throws away progress.** Restarting on every flip makes each peek at a later stage cost the whole flow again. Rewind to the option's stage instead.
- **Options without their stage.** A flat list leaves the user guessing which part of the flow an option changes. File every dimension under its stage and mark where the flow is now.
- **Wiring options to real mutations.** Read-only prototypes are fine. If an option needs to mutate, point it at a stub: the question is "what should this look like", not "does the backend work".
- **Promoting the prototype directly to production.** The variant code was written under prototype constraints (no tests, minimal error handling). Rewrite it properly when you fold it in.
