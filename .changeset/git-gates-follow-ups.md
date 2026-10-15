---
"bahaospanov": minor
---

- **git-gates**: new check, one commit per change. A push to a feature branch is held while a later commit of the branch only fixes, reworks or extends lines an earlier one added (a `fixup!`/`squash!`/`amend!` subject without asking; otherwise Sonnet). The agent leaves the commits alone, shows the user the reason, recommends folding and asks; once the user answers, the same commits go through. It reads the whole branch since its integration branch, so pushing after every commit does not slip past it; a push straight to an integration branch is not reviewed. "keep the commits" in the message skips it.
