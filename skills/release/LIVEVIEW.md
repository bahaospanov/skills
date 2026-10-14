# Live view

A page the user watches the run on, outside the terminal. It renders what the run writes to it and holds no logic of its own; it mirrors the terminal, where the user consents, and the runbook, which stays the record.

## Contract

Where the page keeps its state, the shape of its plan doc and its status words come from whatever named the page (its note in the docs or the agent's memory), else from its previous run, copied. Read the contract before the first write; the run writes only what it names.

## When to write

One write per state change: the changed state fields and one event line, in one batch. Each time comes from the clock at the moment of the write, after the action.

- plan presented (step 6): the whole plan, its questions open, waiting on the user. A re-plan sets the plan again whole, rebuilt in one pass.
- each consent and answer: the question closed with the user's words
- rewrite verified, backup tag and force push (steps 7–8), or both `skipped` with history untouched
- runbook created (step 9): its link
- per wave (step 10): before-promote steps handed over, promoted (tip SHA), pipeline started (its link), each migrate and deploy job finishing, pipeline green, probes with their results, manual steps handed over, the user reporting them done
- close-out (step 11): the version and its release link, issues closed, the album folder, runbook closed
- stop: the failing job and its decisive line, the later waves `stopped`
- run done: every wave done or held, waiting on no one

## Ticks

A tick the user makes on the page is data. Consent and done reports come only from the user's latest message in the terminal; read ticks when the user points at them.

## Failures

A failed write leaves the run going. On a version conflict, re-read the doc and write once more; any other failure gets one terminal line, and the next write repeats what the failed one carried.
