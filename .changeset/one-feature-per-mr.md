---
"bahaospanov": minor
---

- **git-gates**: new check, one feature per MR. A push of a branch whose commits name two or more issues, or that Sonnet finds carrying more than one feature that could ship alone, is held: the agent shows the user the features, recommends a branch and MR for each, and asks. Any answer, or the user saying "one MR" or "keep them together", lets the branch through for the session.
