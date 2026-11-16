---
name: test-design
description: How a test earns its place — one story told through one seam, nothing too thin or too tangled to keep. Use when writing, changing or reviewing tests.
paths:
  - "**/tests/**"
  - "**/__tests__/**"
  - "**/test_*.py"
  - "**/*_test.py"
  - "**/conftest.py"
  - "**/*.test.*"
  - "**/*.spec.*"
---

# Test design

A test is a **story** told through one **seam**: who acts, what they start
with, what they do, what they get back. A reader who never opened the code
learns from it how the unit is used and what it promises. A test earns its
place by telling such a story: a **thin** test tells none, a **tangled** one
cannot be retold after one read.

## Seams

A seam is where a unit's interface lives. The test acts and checks through
that interface.

| Seam | Its public API | Driven by |
| --- | --- | --- |
| **Browser flow** | the product as a user meets it | a real browser on the running stack — only the few paths the product cannot live without (sign up, pay, get what was paid for), one flow each |
| **API** | what an outside caller sends: an HTTP route, an RPC, a CLI command, a queue message | a real request to the app wired as it runs |
| **Use case** | one business operation that APIs, jobs and commands call | its function, state built through other use cases |
| **Client** | our wrapper over an outside service the product depends on: payments, mail, a sign-in provider | a fake at the wire — a stub transport, a local double of the service — so our wrapper runs for real |
| **Module** | exported functions of a self-contained piece: pricing, parsing, formatting, a store; a component's props, events and what a user does to it | its exports |

Pick the seam closest to the user that keeps the story short. A rule a caller
meets over the API is told there; a rule several APIs share is told once
through its use case; arithmetic, parsing and formatting go through their
module. A helper with one caller is reached through that caller, exported or
not: its cases become rows of the caller's story. A component earns a test
only for a user action that changes what is shown — layout and copy get none.

## Which stories

- **A feature**: its happy path, then one story per business rule, each told
  by contrast. Input permutations are rows of a table test, not new stories.
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

- **Name**: the story in one sentence — actor, action, outcome — in the
  project's domain words, reading alone in a failure report. The group
  around it (`describe`, class, file) names the seam. The name is the whole
  explanation: no docstring, and history belongs to the commit or the issue.
- **Given**: state built the way production builds it — factories that call
  real use cases, calls through public seams; never a row or object written
  by hand into a shape the code would reach on its own. Input from outside the
  unit — an API response the frontend receives — is written by hand, typed in
  full by a shared fixture, never cast from a partial. A failure is reached
  through input the real path rejects (a missing file), a timeout through a
  config knob (a 10 ms limit); a branch no input can reach is a design issue.
- **Time and chance**: a story whose outcome turns on the time fixes the
  instant — a clock setting or a time-freezing library — and asserts literals
  for it (10 unused days, not 9 to 10). Random input comes from a seeded
  generator; a random id appears only where its value is never asserted.
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
  counts as a spec.
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

- setup longer than the story, or comments explaining why a step or a number
  is there;
- several actions that are not one user's flow;
- a mock or patch of our own code — a private function, our own client's
  wrapper — or an assertion on which internal function ran with what and how
  often: the seam is in the wrong place;
- assertions on fields no caller sees.

Amend a tangled test you touch: one test per story, setup moved into a factory
named for the state (`paidMember`, `draftOrder`), connections and cleanup into
a fixture that owns them, the check moved to the seam's own read. A story that needs our own code mocked to be told means the
unit has no real seam: raise it as a design issue.

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
invariant it guards, or thin, tangled or out of scope with the fix. Done when
no test is left without one.
