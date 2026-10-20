export const FETCH_TIMEOUT_MS = 20_000

const ACKNOWLEDGES = /\b(no|skip|without|don'?t)\s+rebas(e|ing)\b|\b(stale|old|behind)\b[^.!?\n]*\b(fine|ok|okay|intended)\b/iu

export const acknowledgesStaleBase = (text: string) => ACKNOWLEDGES.test(text)

export const staleBaseRefused = (command: string, source: string, target: string) =>
  `git-tidy (fresh base): blocking '${command}' — '${source}' does not contain the latest '${target}' (origin/${target}, just fetched).

The checks ran against an old '${target}', so whatever the newer commits there
break or conflict with stays hidden until the merge. Rebase onto it
(\`git fetch origin ${target} && git rebase origin/${target}\`), run the checks
again, push with --force-with-lease, then open the merge request. If the old
base is intended, say so, e.g. "no rebase", and this check steps aside.`
