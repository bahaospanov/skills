---
"bahaospanov": minor
---

- **bahaospanov-skills**: **release** step 11 is now close-out, on the user's "release" once production works: a SemVer tag from the shipped commits (`scripts/next-version.sh`: breaking → major, `feat` → minor, else patch; first `v1.0.0`) with a release entry listing the shipped issues; each shipped issue labelled `shipped::prod`, noted and closed, or noted and left open when work remains (`scripts/issue-close.sh`); the release album with the version on every slide; the runbook labelled `type::release`, dated and closed.
