// Asked for 2026-10-15 (scanwow): a teammate's merge requests carried several features at once,
// often in one commit ("asset page details, specs list and collections, model physical size, …").

import { refsInText } from './shared/issue-refs'

// On 9 real scanwow commits, 3 runs each: the 4 bundles were held 12 of 12, the 5 single features
// passed 14 of 15. Before the prompt said a shared page joins nothing, the bundles passed half the time.
export const SCOPE_MODEL = 'claude-sonnet-5-5'

const ACKNOWLEDGES = /\b(one|same|single) (mr|pr|merge request|pull request)\b|\bkeep (it |them |these |both |all )?together\b/iu

export const acknowledgesScope = (text: string) => ACKNOWLEDGES.test(text)

export const manyIssues = (messages: string[]) => {
  const refs = [...new Set(messages.flatMap((message) => refsInText(message, true)))]
  return refs.length > 1 ? `the branch's commits name ${refs.length} issues: ${refs.join(', ')}` : undefined
}

export const scopeRefused = (command: string, reason: string) =>
  `git-gates (one feature per MR): holding '${command}' for the user — ${reason}

A merge request that carries one feature is reviewed, tested and reverted on its
own, and closes its one issue. The choice is the user's: leave the branch as it
is, show the user the features named above with this reason, recommend a branch
and MR per feature, each from its own issue, and ask.
- Split: per feature, a branch off the base taking its commits (\`git cherry-pick\`),
  or its files when one commit carries several (\`git checkout <commit> -- <paths>\`).
- Keep: push again as is. Once the user has answered, this branch goes through.
The playbook skill's BRANCHES.md has the rule.`
