---
"bahaospanov": patch
---

- **bahaospanov-skills**: **release** asks for "push" before the force push and "deploy" per wave, the words git-gates lets a push through on; "go" was blocked. Promotion resolves the tip to its full SHA, checks the fast-forward with `merge-base --is-ancestor`, and pushes a quoted literal `"<sha>:refs/heads/<target>"`, so a mistyped short SHA or a zsh `:r` modifier cannot mangle the refspec.
