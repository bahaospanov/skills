// Asked for 2026-10-15 (scanwow): a teammate's branches grew a commit per fix and per
// increment of the one feature they built, and nobody sat beside them to fold those in.

export const FOLLOW_UP_MODEL = 'claude-sonnet-5-5'

// git's own markers for a commit made to fold into an earlier one.
const MARKED = /^(fixup|squash|amend)! (.+)$/

export const markedFollowUp = (subjects: string[]) => {
  for (const subject of subjects) {
    const target = MARKED.exec(subject)?.[2]
    if (target !== undefined) return `'${subject}' is marked to fold into '${target}'`
  }
  return undefined
}

const ACKNOWLEDGES = /\b(keep|leave) (the |these |both |all |separate )?commits\b|\bcommits are (fine|ok|okay|right|separate|intended)\b/iu

export const acknowledgesSplit = (text: string) => ACKNOWLEDGES.test(text)

export const followUpsRefused = (command: string, reason: string) =>
  `git-gates (one commit per change): holding '${command}' for the user — ${reason}

A commit that fixes, reworks or extends an earlier commit of this branch usually
belongs in that commit, so the merge request reads as one commit per change. The
choice is the user's: leave the commits as they are, show the user the commits
named above with this reason, recommend folding them, and ask.
- Fold: \`git reset --soft\` when they are the last commits, otherwise a rebase
  with GIT_SEQUENCE_EDITOR; push with --force-with-lease if the branch is on origin.
- Keep: push again as is. Once the user has answered, these commits go through.`
