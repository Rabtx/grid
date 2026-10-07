---
id: grid-runner-access-control
title: stop any instance user from getting a shell or folder access on the runner's machine
type: bug
from: pm
to: backend
priority: high
status: done
assignee: claude
reviewer: human
parent: none
depends_on: []
branch: none
worktree: none
scope: [apps/runner/src/**]
allowed_shared: []
created: 2026-10-07
updated: 2026-10-07
---

## What

Terminal routes (`apps/runner/src/server.ts:591-619`) check only that the caller is signed in; there is no permission for terminals. `may()` (`permissions.ts:40-44`) passes every owner, and "owner" is the caller's role in *their own* workspace, which any user can create (`apps/api/src/modules/workspaces/routes.ts:56`). The runner accepts any workspace the user belongs to (`auth.ts`), so nothing ties it to its machine's owner. The same gap lets any member switch branches in any project folder under the projects directory (`folders/routes.ts:176-181`).

## Proposal or Ask

Bind the runner to the workspace(s) it serves (its owner's), refuse other workspaces, and gate shells behind an explicit permission (owner and admin by default). Regression tests: a member of another workspace and a plain member are refused a terminal; the owner is not.

Found in the PM audit of `main` at `9237603`, 2026-10-07. Every claim was checked against the code
and the live data.

## Validation

- A regression test for the fix, failing before and passing after.
- The affected suites, plus root lint, typecheck, format and architecture checks.
- Never run tests against the live API on :4000 or the live chat database.

## Resolution
Fixed by claude, 2026-10-07.

- **The runner now has an owner** (`apps/runner/src/owner.ts`, kept in `chat.db`): `RUNNER_OWNER` (an email or user id) when set. Otherwise it is the first workspace owner to sign in, and on a runner that already holds work, only an owner of a workspace that work belongs to. It serves only the workspaces its owner is in, and that set follows the owner each time they sign in. Anyone else gets 403 "This runner works for another workspace" (close code 4403 on sockets) from the token verifier, so every route and socket is covered.
- **Shells need the `machines` permission** (`mayUseTerminals`): owners and admins by default, changeable in Settings → Roles. This applies to `/terminals`, agent setup terminals, and terminal sockets, both direct and over the link.
- **Tests:** in `owner.test.ts`, a stranger's own workspace, a teammate's other workspace, a non-owner claiming the runner, a restart, and leaving a workspace. In `permissions.test.ts`, members and viewers are refused a terminal over HTTP and sockets, while owners, admins and a member granted `machines` are not. The terminal tests fail on `main` (201 and 4404) and pass here. Runner 494/494, typecheck, lint, format and the architecture check all pass.
- **On the live install:** chat.db holds work only for workspaces `demo` and `acme`, both owned by demo@grid.dev, so that account claims the runner on its next sign-in.
- **Follow-ups:** `/fs/git/checkout` still lets members of the owner's workspaces switch branches in any folder under the projects directory; they are trusted teammates now, so I left it. The console still shows terminal entry points to members and gets a 403 message; hiding them is console work.
