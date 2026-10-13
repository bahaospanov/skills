# Migrations

How step 4 classifies a schema migration and step 5 places it in a wave. Tool-agnostic: read the revision files themselves, whatever generated them.

## Chain

The new revisions must form one line from the target's current head: one head, each revision's parent the one before. A fork, or two revisions claiming the same parent, stops the run — the user fixes the chain before the deploy.

A revision the target already has, changed in range, is a red flag: production applied the old text and never reruns it. Show it in the plan.

## Classes

- **expand** — additive: new table, new nullable column or one with a default, new index built without blocking. Old and new code both run against it; it ships with the code that uses it.
- **contract** — removes or narrows: drop a table or column, rename, narrow a type, drop or shrink an enum or custom type, add NOT NULL or a constraint to an existing column, drop a default old code relies on. Old code breaks against it — check how the target's code maps what changes, not only whether it names it.
- **data** — rewrites rows (backfill, normalisation). Note duration, locks, and whether it is safe to rerun; a backfill run by a script instead of the migration is a one-time script with a timing.
- **heavy** — an operation that locks or rewrites a whole table (blocking index build, column type change). Flag it by the operation; when the table's size matters and nothing read-only shows it, ask.

A revision carries every class it matches.

## Placement

Find when CI migrates relative to deploying (step 1):

- **migrate before deploy** — between the two, the old code runs on the new schema. A contract revision ships in a later wave than the code that stops using what it removes: search the target's tree for the dropped or renamed name; while the deployed code still reads it, the contract waits. "Using" reaches one layer out: when the same change removes an API that served the dropped object, its clients must stop calling it first, unless CI deploys them in the same pipeline.
- **migrate after deploy** — the new code runs on the old schema first. An expand revision that new code needs ships a wave before that code.

When the contract revision and the code it waits for share one commit, the plan says so and asks the user: the rewrite never splits a commit.
