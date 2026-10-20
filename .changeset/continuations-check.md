---
"bahaospanov": patch
---

- **git-gates**, **git-tidy**: the mods whose follow-up prompts continue the user's turn live in one shared list, and `npm run check:continuations` fails when a mod sending follow-ups is missing from it or a listed one sends none.
