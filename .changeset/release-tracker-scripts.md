---
"bahaospanov": minor
---

- **bahaospanov-skills**: **release** ships scripts for the bookkeeping a run repeats. `gitlab-pipeline-watch.sh` prints job changes and exits with the pipeline's result, for a background watch; GitHub uses `gh run watch`. `issue-tick.sh` ticks runbook items by text on GitLab or GitHub, writing nothing when a text matches no open item. `gitlab-file-var-line.sh` sets one `NAME=value` line in a CI File variable without printing it: it proves the edit touches only that line, keeps the variable's attributes, and reads it back byte for byte. TRACKERS.md lists them beside the recipes; step 10 points to them.
