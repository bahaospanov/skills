---
"bahaospanov": minor
---

- **issue-first**: owns every issue-number check. A commit missing the issue the user named, or the one its branch names, still runs, and the user gets a suggestion to end the subject with it, as git-gates did. A `feat` commit names its issue at the end of its subject or in its branch; a number in the body no longer counts.
- **git-gates**: no longer checks issue numbers; that moved to issue-first.
- **git-cleanup**: the shared issue-refs copy drops the code issue-first now keeps.
