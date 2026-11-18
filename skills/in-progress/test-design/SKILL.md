---
name: test-design
description: How a test earns its place — a business rule told as one story through one seam, interaction checked by worked example, nothing too thin or too tangled to keep. Use when writing, changing or reviewing tests.
---

# Test design

A business rule is told as a **story** through one **seam**: what the caller
starts with, what they do, what they get back. A reader who never opened the
code learns from it what the product promises. The rules are what the stories
are for: what a sale costs, who may see a record, how two people are related.
The interaction around them — a gesture, a scroll, a zoom, layout, motion —
holds no rule and gets no story: it is checked by **worked example**
([Interaction](#interaction)). A test earns its place by telling a story or
working an example: a **thin** test does neither, a **tangled** one cannot be
retold after one read.

## Seams

A seam is where a unit's interface lives. The test acts and checks through
that interface.

A story stays on one **level**: its Given, When and Then all go through the
same seam, so a reader follows one abstraction. State set up through use cases
and then read over HTTP makes them hold two, and track how one turns into the
other. Beneath the seam our code runs for real; only outside services are
answered, at the wire ([Outside services](#the-story)).

| Seam | Its public API | Driven by |
| --- | --- | --- |
| **Browser flow** | the product as a user meets it | a real browser on the running stack — only the few paths the product cannot live without (sign up, pay, get what was paid for), one flow each |
| **API** | what an outside caller sends: an HTTP route, an RPC, a CLI command, a queue message | a real request to the app wired as it runs |
| **Use case** | one business operation that APIs, jobs and commands call | its function, state built through other use cases |
| **Client** | our wrapper over an outside service the product depends on: payments, mail, a sign-in provider | a fake at the wire — a stub transport, a local double of the service — so our wrapper runs for real |
| **Module** | exported functions of a self-contained piece: pricing, parsing, formatting, a store; a component's props, events and what a user does to it | its exports |

Tell each rule at the seam that decides it, the nearest to its caller that
keeps the story short. A rule a caller meets over the API is told there; a rule
several APIs share is told once through its use case; arithmetic, parsing and
formatting go through their module. A helper with one caller is reached through
that caller, exported or not: its cases become rows of the caller's story. A
component earns a story only for a rule it decides about what is shown — layout
and copy get none, its gestures and motion a worked example.

## Which stories

- **A feature**: one story per business rule it brings, its main outcome
  first, each told by contrast; its interaction, by worked example. Input
  permutations are rows of a table test, not new stories.
- **A bug fix**: its own story, named for the case, seen red on the bug before
  the fix lands — never an extra line slipped into another story's setup.
- **A one-off** — a data move, a backfill — that cannot be undone: stories
  while it waits to run, deleted with it once it has run.

The bar is a story per rule, not a coverage number: a coverage floor pushes
toward the thin tests this skill cuts.

## The story

```ts
test('a member who cancels keeps access until the paid period ends', async () => {
  const member = await paidMember({ periodEnd: '2026-12-01' })

  await api.post('/subscription/cancel', { as: member })

  const subscription = await api.get('/subscription', { as: member })
  expect(subscription.status).toBe('cancelled')
  expect(subscription.accessUntil).toBe('2026-12-01')
})
```

- **Name**: the rule the story proves, said the way a person would say it, in
  the project's domain words, reading alone in a failure report: "a member who
  cancels keeps access until the paid period ends". A name that strings the
  steps or every check together with _and_ and _but_ is a transcript of the
  code: name what holds. The group around it (`describe`, class, file) names
  the seam. Why the test exists — the bug, the issue — belongs to the commit.
- **Given**: state built the way production builds it, through the story's own
  seam — an API story's earlier requests, delivered webhooks and run jobs; a
  use case story's other use cases; never a row or object written by hand into
  a shape the code would reach on its own. Input from outside the
  unit — an API response the frontend receives — is written by hand, typed in
  full by a shared fixture, never cast from a partial. A failure is reached
  through input the real path rejects (a missing file), a timeout through a
  config knob (a 10 ms limit); a branch no input can reach is a design issue.
- **Time and chance**: a story whose outcome turns on the time fixes the
  instant — a clock setting or a time-freezing library — and asserts literals
  for it (10 unused days, not 9 to 10). Random input comes from a seeded
  generator; a random id appears only where its value is never asserted.
- **Outside services**: a story that reaches one declares, in its own body,
  every answer the service gives it: a mock named for the service, one route
  per call, each answer a literal or a named constant. A reader follows one
  program, ours, with the service as plain data; a fake with logic of its own
  is a second program to learn beside it. Above each route, a comment says
  which of our steps makes the call and what for. The mock becomes the
  client's transport, undone with the test:

  ```python
  paypal_mock = respx.Router()
  # Auth: the access token our client fetches before calling PayPal.
  paypal_mock.post("/v1/oauth2/token").respond(json=_TOKEN)
  # Buying credits: PayPal creates order ORDER-1 with its approval link.
  paypal_mock.post("/v2/checkout/orders").respond(201, json=_ORDER_1)
  monkeypatch.setattr(paypal_client, "transport", MockTransport(paypal_mock.handler))
  ```

  Helpers run our own code through the story's seam — a request to our route,
  a webhook delivered, a job run — and leave declaring and patching to the
  story. The story reads what the service
  received from its routes' calls. A guard over every client fails a request
  no story declared, naming the service, so a forgotten route fails the test
  instead of reaching the network.
- **When**: one action through the seam. A **flow** — one user's steps in
  order: sign up, confirm, buy — chains several, each followed by what the
  user sees after it. Each step reads as the user's action (`stop`, `resume`,
  a helper named for it when the call is long); a step that changes nothing
  is cut.
- **Waiting**: on the event itself — the awaited task, the fired event, the
  seam's next read. Where only polling can see it, one shared poll helper with
  a deadline fails naming what never happened. A fixed sleep is a race, and a
  flaky test is a bug in the test or the code: fix it or delete it, never
  rerun it.
- **Then**: what the caller gets — the response, the return value, the next
  read through the same seam. An effect that leaves the system (a sent letter,
  a stored file, a pushed event) is checked where it lands; a row the seam
  never shows is not checked at all.
- **Contrast**: a rule that turns on an input is told by the same call with
  the input flipped, side by side — on and off, owner and stranger.
- **Expected values**: literals from the spec or a worked example, written by
  hand — never recomputed the way the code computes them, never recorded from
  its output by a snapshot. An outside standard's formula (an RFC's hash)
  counts as a spec. Where a reader cannot see how a literal follows from the
  input, a comment above the test works the example: beside the notes on its
  outside services' routes, the one comment a test carries.
- **Table**: rows of one rule. Each row has an id naming its case and carries
  everything that differs — input, expected value, even the function called —
  so the body runs the same lines for every row. A row that needs its own
  setup or steps is its own story.

## Too thin

A thin test fails only when someone edits a literal or the framework breaks.
Tell the story behind it instead, or leave it unwritten:

- static output — a page renders its title, a button shows its label, a
  component rendered with nothing varied, the fixed copy inside an
  otherwise computed result or picked by a kind (assert only what the inputs
  decide);
- a visual component's behaviour anyone confirms by looking at the running
  app — a sheet slides up, a tab highlights, a picked row shows its check: the
  page title again, only moving;
- a constant, enum or schema field compared with its own definition;
- the framework, language or library doing its job — a router 404s an
  unknown path, a validator rejects a wrong type, a prop reaches the template;
- a passthrough to a unit whose own story already covers it;
- one check repeated per endpoint — sign-in required, say — where a single
  guard over every endpoint tells it once.

Thin is not short. A two-line case of a rounding rule tells a whole story;
keep it, as one row of a table test when it has siblings.

## Too tangled

A tangled test cannot be retold after one read:

- setup longer than the story, or comments explaining why a setup step is
  there;
- several actions that are not one user's flow;
- a story that changes level: set up through use cases or by hand, then
  checked over the API, or the reverse;
- a mock or patch of our own code — a private function, our own client's
  wrapper — or an assertion on which internal function ran with what and how
  often: the seam is in the wrong place;
- assertions on fields no caller sees.

Amend a tangled test you touch: one test per story, setup moved into a factory
named for the state (`paidMember`, `draftOrder`), connections and cleanup into
a fixture that owns them, the check moved to the seam's own read. A story that needs our own code mocked to be told means the
unit has no real seam: raise it as a design issue.

## Interaction

A gesture, a scroll, a zoom, a drag, layout and motion carry no business rule,
and what a look at the running app confirms gets no test ([Too thin](#too-thin)).
What a look cannot catch — a case too rare to set up by hand (a ring crowded
past its room, a face on the seam), an error a few points off — sits in
arithmetic in a module (a viewport, a layout pass, a gesture's tracker) and is
checked there by worked example: a scene with numbers a reader can follow, one
per thing a user would notice going wrong (the spot under the fingers drifts,
a caption covers a face, two lines cross).

```ts
// Fingers 100 apart around (150, 100) spread to 200 apart: scale 2 around
// (150, 100) puts the corner at (-150, -100). The finger left at (250, 100)
// then moves by (30, 40), and the corner moves with it to (-120, -60).
test('lifting a finger mid-pinch keeps the view, then pans with the other', () => {
  const pinch = pinchPan({ scale: 1, offset: [0, 0] })
  pinch.track([[100, 100], [200, 100]])
  const pinched = pinch.track([[50, 100], [250, 100]])
  expect(pinch.track([[250, 100]])).toEqual(pinched)
  expect(pinch.track([[280, 140]])).toEqual({ scale: 2, offset: [-120, -60] })
})
```

The name says the behaviour in a few words; the comment carries the scene and
its arithmetic, which no name can.

## Guards

A **guard** checks one invariant across every instance of something — every
route, every locale file, every model against the migrations — rather than
telling a story. One guard per invariant, and its failure message names the
bug it prevents and the fix. A guard earns its place only where ordinary
feature work keeps breaking the invariant: a shipped bug, or a slip each new
route or file can repeat.

## Slow stories

An outside tool our code runs on the machine — a converter, an image
processor — and a second process of our own are driven for real, in a slow
cohort every CI run includes. Through the Client seam: one story per job we
hand the tool, plus how our wrapper reports it failing. Each process boundary
gets one end-to-end flow. A slow path runs once in the suite: a caller above it
tells only its own rules.

## Out of scope

Infrastructure is **checked once**: set it up, trigger it by hand, consider it
working. That covers DNS, CDN delivery and caching, TLS, the reverse proxy, the
hosting provider, the toolchain an image installs, config and secrets read at
boot, an outside service's own behaviour, and the infrastructure aspect of any
feature — with our code whose
only job is to serve it: a health endpoint for probes, the URLs a cache purge
sends, a mail transport's certificate check. A shipped bug or a regression
nobody would notice there is still checked once, by hand.

What stays:

- a failure no one can trigger by hand — a torn read, a race, an intermittent
  refusal: test how our code handles it;
- how our own story survives the infrastructure failing: "deleting an image
  succeeds while the CDN is down" tells the delete, the CDN only its failure;
- an invariant feature work keeps breaking: a guard.

Plumbing feature code calls every day — the transaction context, the database
session — is a module, not infrastructure.

## Reviewing

Give every test in the change a verdict: the story it tells and its seam, the
example it works, the invariant it guards, or thin, tangled or out of scope
with the fix. Done when no test is left without one.
