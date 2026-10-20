# Commits

## Subject

- Conventional Commits: `<type>(<scope>): <summary>`, with the types `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `style`, `revert`. The scope names the app or area, comma-separated for several: `fix(web,admin): …`.
- It ends with the issue number: `fix(web): cart total rounding #12`.

## Body

A commit body is permanent. A fact needed once, to run a cutover, review this merge or answer today's question, goes in the conversation or the MR description instead.

- A body earns text only when the cause is subtle enough that a future reader hitting this code would misdiagnose it. When the subject states the cause ("X had no password"), the body is empty.
- It says why, in a reader's terms. What the diff shows, how the work went, and what stayed the same ("no X changed") stay out.
- The message reads as the author's own: no Co-Authored-By trailer or "Generated with" line naming a tool or model.

## Vertical commits

One commit per change, complete across every app it touches.

- When the API contract changes, the frontend change that matches it goes in the same commit.
- A backend change with no contract change is its own commit.
- Every commit works: a checkout of any commit builds, passes its tests and runs. A series that removes something removes its last consumer first and the provider last.
- A shared issue number or file does not make two changes one.

## Folding follow-ups

A fix, rework or next step for a commit already on the branch belongs in that commit. Make it with `git commit --fixup=<sha>`, then, before pushing, recommend folding it, say why, and ask. Fold on the user's yes:

```sh
GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash origin/<base>
```

A branch already on origin then goes up with `--force-with-lease`.
