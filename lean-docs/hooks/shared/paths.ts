const TEMP_ROOTS = ['/tmp/', '/private/tmp/', '/var/folders/', '/private/var/folders/']

export const dirOf = (path: string) => {
  const slash = path.lastIndexOf('/')
  return slash > 0 ? path.slice(0, slash) : slash === 0 ? '/' : '.'
}

export const isDotfileOrTemp = (path: string, home: string | undefined, tmpdir: string | undefined) =>
  (home !== undefined && path.startsWith(`${home}/.`)) ||
  TEMP_ROOTS.some((root) => path.startsWith(root)) ||
  (tmpdir !== undefined && tmpdir !== '' && path.startsWith(tmpdir))

export const isTrim = (added: string, removed: string) => added.length < removed.length

// `sh -c MEDIA_CHECK lean <path>` exits 0 for media and marketing work (a reel, a brand sheet): the file's own checkout
// ignores it, or a folder between it and that checkout's root holds a .lean-skip marker. Run from the file's checkout,
// a worktree under a main repo's ignored .worktrees/ still counts as code.
export const MEDIA_CHECK = [
  'd=$(dirname "$1"); while [ ! -d "$d" ]; do d=$(dirname "$d"); done; cd "$d" || exit 1',
  'git check-ignore -q -- "$1" 2>/dev/null && exit 0',
  'r=$(git rev-parse --show-toplevel 2>/dev/null) || exit 1; x=$(pwd -P)',
  'while :; do [ -e "$x/.lean-skip" ] && exit 0; { [ "$x" = "$r" ] || [ "$x" = / ]; } && exit 1; x=$(dirname "$x"); done',
].join('\n')
