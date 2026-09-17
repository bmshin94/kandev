---
created: 2026-09-18
status: draft
requirements:
  - REQ-TASKS-QUEUED-SESSION-OWNERSHIP-001
  - REQ-TASKS-QUEUED-SESSION-OWNERSHIP-002
system_design:
  - ../../specs/tasks/system-design/queued-session-ownership.md
legacy_specs: []
---

# Fix plan: Session-open recovery eligibility

## Overview

Restore automatic conversation recovery after workflow reuse and queue settlement.
One sequential work order covers both eligibility defects and their combined
restart case. The task system owns this repair because it owns workflow
recipients, parking, and deferred launch metadata.

## Evidence and requirement conformance

Read-only investigation targeted task `62f15ae6-bb2d-40c5-863b-91366636114d`.
The running build was `f4c9131307`, the merge commit for PR #3779, and included #3776.
Both PRs corrected deadlocks. The failing eligibility branches originated in #3755.

| UTC, 2026-09-17 | Evidence |
| --- | --- |
| 23:00:49 | Startup preserved both resume tokens. Primary `73dced9b-29e5-4f54-bf9a-80c39452cf24` remained input-ready. Secondary `92dc05a8-c936-4647-8142-9fa8acd18daa` changed from RUNNING to WAITING_FOR_INPUT. |
| 23:01:44 | The browser opened the primary session and requested status. Workspace infrastructure recovered, but the agent did not resume. |
| 23:05:45 | A read-only status request returned `is_resumable=true`, `needs_resume=true`, `auto_resume_allowed=false`, and `ownership_unavailable`. |

Scoped database inspection found a consumed workflow-switch stop intent on the
primary session. The current committed route named that session as destination.
Its current parking marker was absent. The task also retained `deferred_launch: {}`.

`autoResumeEligibility` rejects the historical stop marker first. If that marker
is absent, the empty deferred object independently fails `ReadCeilingDeferral`.
The frontend then chooses `idle` rather than requesting recovery.
`stripCeilingRecordKeys` intentionally produces the empty settled representation.

The existing requirement's AC 001.4 permits legitimate reuse. Its compatibility
section preserves ordinary recovery. Added AC 001.7 and 001.8 make the restart
and settled-queue cases explicit. They clarify the same ownership contract.
The existing passive-inspection ADR already rejects permanent tombstone parking;
no new ADR or broader ownership policy is needed.

Diagnostic archives remain task-local evidence, not required implementation inputs:
backend `0c3f8966f98672ab5da9906558307b6f.zip` and frontend
`97e6c50b66eadef43f5293490e69efd9.zip` under `.kandev/diagnostics/`.
The backend archive truncated older history; the restart and open events were present.
Temporary extractions were removed. The investigation did not modify affected task state.

## Scope

### In scope

- Recognize a consumed historical stop for the exact current committed recipient.
- Treat an empty settled deferral as no pending launch.
- Preserve restrictive parking, queue, preference, and automatic-capacity checks.
- Add service, restart, stale-status, and desktop/mobile recovery regressions.

### Out of scope

- Removing callback tombstones, repairing the live database, or adding migrations.
- Changing lock order, replay claims, workflow routing, or queue dispatch policy.
- Automatically continuing interrupted prompts or replaying settled workflow prompts.
- New recovery controls, layout, copy, translations, or diagnostics dashboards.
- Broadening recovery for unrelated legacy ambiguity or nonempty non-ceiling records.

## Technical approach

Follow [Recovery after reuse and queue settlement](../../specs/tasks/system-design/queued-session-ownership.md#recovery-after-reuse-and-queue-settlement).
Keep the decision in `task_operations.go:autoResumeEligibility`; extract a small
helper only if needed for existing complexity limits. Do not alter the general
stop-intent parser or delete its consumed tombstone.

Require the exact committed route, current step, matching profile, primary
membership, and absent current parking before accepting historical stop evidence.
Then evaluate pending work. Do not let the route exception bypass a real deferral.
Accept only an absent, null, or empty deferred object as no queue work. Preserve
all existing nonempty-record checks and replay parser behavior.

Exercise `GetTaskSessionStatus`, `passiveLaunchResponse` in `session_launch.go`,
and `EnsureSession` through their existing service paths. Verify stale allowed
status cannot authorize execution after a later park or queue change. Preserve
all admission guards introduced by #3776 and #3779.

No rendered layout changes are planned, so no ASCII UI preview is required.
Mobile uses the existing dedicated task layout, task drawer, and session picker.
The closest exemplar is `mobile-queued-session-ownership.spec.ts`; reuse its
navigation, session identity assertions, and overflow check. The phone outcome
matches desktop: recover the eligible conversation without an explicit Resume click.

## Tests

AC suffixes below use `AC-TASKS-QUEUED-SESSION-OWNERSHIP-`.
New test names are proposed and must exist before their commands run.

| Proposed test in `apps/backend/internal/orchestrator/session_open_recovery_test.go` | Coverage | AC |
| --- | --- | --- |
| `TestSessionOpenRecoveryEligibility` | Historical consumed marker only; empty deferral only; both together; absent/null deferral baseline | 001.4, 001.7, 001.8 |
| `TestSessionOpenRecoveryRestrictions` | Current valid/malformed parking; unconsumed marker; primary alone; missing/prepared/wrong-step/wrong-profile route; non-primary source; nonempty invalid and real queued records | 001.1, 001.2, 001.6 |
| `TestSessionOpenRecoveryStatusAndLaunch` | Status and passive launch agree; explicit execution remains distinct; no settled prompt replay or new session | 001.3, 001.5, 001.7, 001.8 |
| `TestSessionOpenRecoveryAfterRestart` | Real persisted route promotion and queue settlement, repository reopen/startup reconciliation, retained token and tombstone | 001.4, 001.7, 001.8; 002.4 |
| `TestSessionOpenRecoveryRechecksOwnership` | Allowed status followed by a new parking stamp, route change, or queued successor; no stale dispatch or metadata clear | 001.1, 001.2, 001.6; 002.6 |

Use existing resume, passive launch, workflow reuse, and queue settlement fixtures.
Assert zero unintended runtime calls, turns, prompts, and metadata mutations in
negative cases. Keep callback suppression coverage with the original execution
stamp after successful reuse. Run the existing deadlock regressions unchanged.

## E2E tests

Add scenarios to existing desktop and mobile queued-session ownership specs.
Use their shared helper and isolated `backend.restart()` fixture. Do not restart
the developer instance or write production database rows.

1. Create a source, switch away, then legitimately return through workflow reuse.
   Settle the turn, restart the fixture backend, and open the reused conversation.
2. Defer a destination behind a fixture capacity holder, release capacity, and
   wait for exactly one dispatch. Settle it, restart, and open that conversation.
3. Combine reuse and settled deferral in one scenario to prevent either fix from
   masking the other. Include auto-start prevention enabled as a negative control.

Assert fixture metadata establishes each precondition before restart. Observe
`session_open` recovery and restored agent readiness without clicking Resume or
sending a new prompt. Verify the same session and conversation survive, the
settled workflow prompt appears once, and the parked sibling gains no activity.
A workspace-ready signal alone is not sufficient evidence of agent recovery.
With prevention enabled, opening remains passive and explicit Resume still works.
Existing capacity-full and parked/queued inspection tests remain required controls.

On phones, enter through the task drawer and use the existing session picker.
Assert visible conversation identity and no horizontal document overflow at 393 px.
Keep fixture settings and capacity holders scoped, restore them in `finally`,
and use bounded event/poll assertions rather than arbitrary sleeps.

## Work orders

- [ ] [Task 01: Repair and verify session-open eligibility](task-01-repair-session-open-eligibility.md)

No subagents are authorized. All implementation checks belong to Task 01.

## Related delivery records

[Queued ownership](../queued-session-ownership/plan.md) and its Task 01 own the
original inspection contract. This package adds the missing recovery regressions.
Their historical results and outstanding PostgreSQL checks remain unchanged.
[Boot deadlock](../ceiling-boot-deadlock/plan.md) and
[replay/cancellation deadlock](../ceiling-replay-cancellation-deadlock/plan.md)
remain compatibility inputs. This package does not reopen their completed work.

## Documentation impact

This design-only change updates internal requirements, design, and delivery records.
Implementation restores documented recovery behavior without new settings or copy.
Recheck `docs/public/tasks-and-workflows.md` and `docs/public/agents-and-profiles.md`
during implementation; update only if their recovery explanation contradicts the fix.

## Verification results

Implementation: pending. No production code or permanent tests changed in planning.
Design validation on 2026-09-18:

- `python3 scripts/list-docs.py validate`: passed (288 decisions, 1002 specifications).
- `python3 scripts/lint-spec-files.test.py`: passed (36 tests).
- `python3 scripts/lint-spec-files.py --all`: passed.
- `git diff --check`: passed.
- Work-order AC and design references: checked against existing owning files.
- Package status: draft plan and pending work order; implementation tests not run.

## Risks

- Ignoring all consumed markers can wake a parked predecessor. Require current destination evidence.
- Returning early for a reused destination can bypass its real queued launch.
- Removing tombstones can let delayed callbacks damage the reused session.
- A workspace-only execution can make an E2E test pass without agent recovery.
- New locks or runtime calls under admission can reintroduce the fixed deadlocks.
