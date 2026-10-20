# Cleanup

Merged is not shipped: the work is cleaned up once the pipeline holding the merge has passed.

1. Wait for that pipeline. While it runs, or after it failed, the worktree, the branch and the issue stay as they are; a failure goes to the user.
2. Once it passed:
   - add the issue's How to test ([ISSUES.md](ISSUES.md));
   - remove the worktree and the branch, local and on origin;
   - fast-forward the local base: `git merge --ff-only origin/<base>` where it is checked out, else `git fetch origin <base>:<base>`.
3. Leave the issue open for the user to close.

A branch is removed only once it has merged, into the base or through an MR naming it as the source, or when the user says to abandon it.
