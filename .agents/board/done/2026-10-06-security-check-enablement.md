---
id: grid-security-check-enablement
title: restore private repository security analysis checks
type: bug
from: human
to: pm
priority: high
status: done
assignee: none
reviewer: reliability_review
parent: 2026-10-06-grid-reliability.md
depends_on: []
branch: agent/backend/reliability-audit
worktree: /home/ghost/Projects/grid-worktrees/agent/backend/reliability-audit
scope: []
allowed_shared: []
created: 2026-10-06
updated: 2026-10-06
---

## What

Resolve the private repository feature/access configuration needed for dependency review and CodeQL. The last Security run on merged main, 37393103513, failed; dependency review reported unsupported private-repository feature configuration, and CodeQL workflow metadata access returned HTTP 403. The reliability patch grants CodeQL job-only actions: read while preserving security checks. Actual new PR results must establish whether any permission failure remains. Paid feature enablement or repository visibility/access changes require a product-owner decision and are not implied by the audit.

## Validation

Confirm both checks execute and pass on the exact PR head; do not disable checks or use continue-on-error to conceal failures. Verify configuration with the repository owner before recommending a paid capability.

## Resolution

Open external follow-up. Current repository is private; API security_and_analysis was null. Official GitHub documentation describes private repository feature eligibility. A source code patch cannot establish that feature availability. Browser verification is tracked separately.


## Closed

Deferred by the product owner on 2026-10-06. CodeQL and dependency review on this private repository need GitHub's paid code security features, and the owner chose not to buy them for now. The checks stay in the workflows and are not disabled or hidden. They are expected to fail until the repository is public or the feature is enabled. Their failures are not regressions and do not block merges.
