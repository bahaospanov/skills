# Triage labels

Written by `/setup-triage-labels`: re-running it rewrites everything above **Project labels** and keeps that section. This file is the project's whole label vocabulary; a label instruction anywhere else gives way to it.

## Base set

| Label | Colour | Meaning |
| --- | --- | --- |
| `type::feature` | `#9400d3` | A new capability |
| `type::bug` | `#dc143c` | Something is broken: it fails, errors or does what nobody meant |
| `type::fix` | `#ed9121` | A correction to work that behaves as built: a spec gap, a review or audit note |
| `type::tech-debt` | `#00c0ca` | Better code, no new capability: a refactor, a removal, performance, hardening |
| `type::infra` | `#808080` | Hosts, CI, deploys, backups, agent tooling |
| `type::release` | `#6699cc` | A release's runbook |
| `priority::high` | `#dc143c` | Next |
| `priority::medium` | `#ed9121` | After the high ones |
| `priority::low` | `#6699cc` | When nothing ranks higher |
| `shipped::dev` | `#cf9aca` | All its work is merged into the base and deployed |
| `shipped::prod` | `#7c1484` | Released to production |

An issue carries one `type::` and one `priority::`: changing either removes the old one in the same call, since only GitLab Premium enforces a scope. `shipped::` labels add up: `shipped::prod` joins `shipped::dev`.

## When labels change

The base is the playbook's Base fact.

1. **Created.** The issue draft the user agrees to carries one `type::` and every project label that fits. A `priority::` goes on only when the user named one. A child Task takes its own type and its parent's project labels.
2. **Triaged.** An open issue with no `priority::` is untriaged. Triage is the user's: they set the priority and correct the type, and an agent relabels on their word.
3. **Shipped to dev.** Once the pipeline holding the work's last merge into the base has passed, the moment the playbook's cleanup adds How to test, the issue gets `shipped::dev`. Work still to merge, another MR or an open step, holds it back. A revert on the base takes it off.
4. **Released.** The release skill notes each shipped issue with `shipped::prod` and labels its runbook `type::release`; a release by hand does the same. A partly shipped issue waits for its last piece.

Labels change by adding and removing; sending the whole set replaces it and drops what someone else just added. Every label comes from this file. The tracker turns any other string into a new label on first use, so a label the work needs gets its row under Project labels first, on the user's yes.

## Recipes

### GitLab

Over REST, with `$API` and `$TOKEN` as the tracker recipes set them.

```sh
# untriaged: open issues with no priority::, child Tasks left out.
# Lists page at 100: follow the x-next-page response header
curl -sS -G --header "PRIVATE-TOKEN: $TOKEN" "$API/issues" \
  --data 'state=opened&issue_type=issue&per_page=100' \
  --data-urlencode 'not[labels]=priority::high,priority::medium,priority::low'

# on dev, waiting for a release
curl -sS -G --header "PRIVATE-TOKEN: $TOKEN" "$API/issues" --data 'state=opened&per_page=100' \
  --data-urlencode 'labels=shipped::dev' --data-urlencode 'not[labels]=shipped::prod'

# triage: the user's priority, and their type correction in the same call
curl -sS -X PUT "$API/issues/<iid>" --header "PRIVATE-TOKEN: $TOKEN" \
  --data-urlencode 'add_labels=priority::high,type::fix' --data-urlencode 'remove_labels=type::bug'

# shipped to dev; a release adds shipped::prod the same way
curl -sS -X PUT "$API/issues/<iid>" --header "PRIVATE-TOKEN: $TOKEN" --data-urlencode 'add_labels=shipped::dev'

# label ids, for a work item made over GraphQL: labelIds takes gid://gitlab/ProjectLabel/<id>
curl -sS --header "PRIVATE-TOKEN: $TOKEN" "$API/labels?per_page=100" | jq -r '.[] | "\(.id) \(.name)"'
```

### GitHub

```sh
# untriaged: open issues with no priority::, sub-issues left out
gh issue list --state open --limit 100 \
  --search 'no:parent-issue -label:"priority::high" -label:"priority::medium" -label:"priority::low"'

# on dev, waiting for a release
gh issue list --state open --limit 100 --label shipped::dev --search '-label:"shipped::prod"'

# triage: the user's priority, and their type correction in the same call
gh issue edit <n> --add-label priority::high,type::fix --remove-label type::bug

# shipped to dev; a release adds shipped::prod the same way
gh issue edit <n> --add-label shipped::dev
```

## Project labels

Added to the base set; a row named like a base label overrides it.

| Label | Colour | Meaning | Set when |
| --- | --- | --- | --- |
