import { describe, expect, test } from 'claude-code/testing'
import {
  acknowledgesPipeline,
  cleanupOf,
  coverageOf,
  githubPipelines,
  gitlabPipelines,
  issuesEditedBy,
  pipelineRefused,
  remoteOf,
  type Pipeline,
} from '../hooks/pipeline-first'

const pipeline = (id: string, state: Pipeline['state'], covers: boolean, status: string = state) => ({ id, sha: id, state, status, covers })

describe('pipeline first: what a command cleans up or fills in', () => {
  test('branch deletes and worktree removals, but not remote-tracking refs', () => {
    expect(cleanupOf('cd /repo && git worktree remove --force .claude/worktrees/a && git branch -D fix/a fix/b')).toEqual({
      branches: ['fix/a', 'fix/b'],
      worktrees: ['.claude/worktrees/a'],
    })
    expect(cleanupOf('git branch --delete fix/a')).toEqual({ branches: ['fix/a'], worktrees: [] })
    expect(cleanupOf('git branch -r -d origin/fix/a')).toBeUndefined()
    expect(cleanupOf('git branch fix/a && git worktree list')).toBeUndefined()
  })

  test("rewriting an issue's body, over REST or a CLI", () => {
    expect(issuesEditedBy(`curl -sS -X PUT "$API/issues/98" --form "description=<issue-98.md"`)).toEqual(['#98'])
    expect(issuesEditedBy(`gh api -X PATCH repos/o/r/issues/7 -f body=@body.md`)).toEqual(['#7'])
    expect(issuesEditedBy('gh issue edit 12 --body-file body.md')).toEqual(['#12'])
    expect(issuesEditedBy('glab issue update 5 --description "x"')).toEqual(['#5'])
  })

  test('closing, a comment, a label change or a new issue is not filling anything in', () => {
    expect(issuesEditedBy(`curl -sS -X PUT "$API/issues/98" --header "PRIVATE-TOKEN: $T" --data 'state_event=close'`)).toEqual([])
    expect(issuesEditedBy(`gh api -X PATCH repos/o/r/issues/7 -f state=closed`)).toEqual([])
    expect(issuesEditedBy('gh issue close 12 --comment done')).toEqual([])
    expect(issuesEditedBy(`jq -n --arg b "$T" '{body:$b}' | curl -X POST "$API/issues/98/notes" --data @-`)).toEqual([])
    expect(issuesEditedBy('gh issue edit 12 --add-label bug')).toEqual([])
    expect(issuesEditedBy(`curl -X POST "$API/issues" --form "description=<new.md"`)).toEqual([])
    expect(issuesEditedBy(`curl -s "$API/issues/98"`)).toEqual([])
  })
})

describe('pipeline first: reading the forge', () => {
  test('remotes in scp, ssh and https form', () => {
    expect(remoteOf('git@gitlab.dev-scanwow.com:scanwow/scanwow-monorepo.git')).toEqual({
      host: 'gitlab.dev-scanwow.com',
      path: 'scanwow/scanwow-monorepo',
    })
    expect(remoteOf('ssh://git@gitlab.example.com:2222/a/b/c.git')).toEqual({ host: 'gitlab.example.com', path: 'a/b/c' })
    expect(remoteOf('https://github.com/bahaospanov/skills')).toEqual({ host: 'github.com', path: 'bahaospanov/skills' })
    expect(remoteOf('/srv/git/repo.git')).toBeUndefined()
  })

  test('GitLab statuses: manual and canceled did not ship', () => {
    const list = gitlabPipelines(
      JSON.stringify([
        { id: 346, sha: 'c1', status: 'running', web_url: 'https://g/p/346' },
        { id: 345, sha: 'b1', status: 'manual' },
        { id: 344, sha: 'a1', status: 'success' },
      ]),
    )
    expect(list?.map((p) => [p.id, p.state])).toEqual([
      ['#346', 'running'],
      ['#345', 'failed'],
      ['#344', 'success'],
    ])
    expect(gitlabPipelines('{"message":"401 Unauthorized"}')).toBeUndefined()
  })

  test('GitHub: a sha is green only when every workflow run on it passed', () => {
    const list = githubPipelines(
      JSON.stringify([
        { databaseId: 3, headSha: 's2', status: 'in_progress', conclusion: '' },
        { databaseId: 2, headSha: 's1', status: 'completed', conclusion: 'success' },
        { databaseId: 1, headSha: 's1', status: 'completed', conclusion: 'failure' },
      ]),
    )
    expect(list?.map((p) => [p.sha, p.state])).toEqual([
      ['s2', 'running'],
      ['s1', 'failed'],
    ])
  })
})

describe('pipeline first: verdict', () => {
  test('any green pipeline holding the work ships it', () => {
    expect(coverageOf([pipeline('#3', 'running', true), pipeline('#2', 'success', true)])).toEqual({ kind: 'green' })
  })

  test('a running one holding it waits; failed ones hold it back', () => {
    expect(coverageOf([pipeline('#3', 'running', true), pipeline('#2', 'success', false)]).kind).toBe('waiting')
    expect(coverageOf([pipeline('#3', 'failed', true, 'canceled'), pipeline('#2', 'success', false)])).toMatchObject({
      kind: 'failed',
      pipeline: { id: '#3' },
    })
  })

  test('no pipeline holding the work is unknown, not a block', () => {
    expect(coverageOf([pipeline('#2', 'success', false)])).toEqual({ kind: 'unknown', why: 'no pipeline holds this work' })
    expect(coverageOf([]).kind).toBe('unknown')
  })

  test('the user can wave the check off; shipping words do not', () => {
    expect(acknowledgesPipeline('skip the pipeline, clean up')).toBe(true)
    expect(acknowledgesPipeline("don't wait for CI")).toBe(true)
    expect(acknowledgesPipeline('merged')).toBe(false)
    expect(acknowledgesPipeline('ship')).toBe(false)
  })

  test('the refusal names the work, the pipeline and the way out', () => {
    const reason = pipelineRefused('git branch -D fix/a', "'fix/a'", 'dev', {
      kind: 'waiting',
      pipeline: { id: '#346', sha: 'c1', state: 'running', status: 'running', url: 'https://g/p/346' },
    })
    expect(reason).toContain("'fix/a' landed in 'dev', and pipeline #346 (https://g/p/346) is still running")
    expect(reason).toContain('skip the pipeline')
  })
})
