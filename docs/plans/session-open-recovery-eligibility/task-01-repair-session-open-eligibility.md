---
id: "01-repair-session-open-eligibility"
title: "Repair and verify session-open eligibility"
status: pending
wave: 1
depends_on: []
plan: "plan.md"
requirements:
  - REQ-TASKS-QUEUED-SESSION-OWNERSHIP-001
  - REQ-TASKS-QUEUED-SESSION-OWNERSHIP-002
acceptance_criteria:
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-001.1
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-001.2
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-001.3
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-001.4
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-001.5
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-001.6
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-001.7
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-001.8
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-002.4
  - AC-TASKS-QUEUED-SESSION-OWNERSHIP-002.6
system_design:
  - ../../specs/tasks/system-design/queued-session-ownership.md
---

# Task 01: Repair and verify session-open eligibility

## Summary

Correct historical-stop and settled-deferral classification in the shared passive
recovery predicate. Prove each defect independently, then verify their combined
restart path through desktop and phone task opening.

## In scope

- Add the five proposed service tests in the [plan matrix](plan.md#tests).
- Start with `TestSessionOpenRecoveryEligibility` and record behavioral RED for
  historical-stop only, empty-deferral only, and combined persisted metadata.
- Add restrictive controls before changing `autoResumeEligibility`.
- Require the exact committed destination evidence defined in the design.
- Continue checking pending work after recognizing historical stop evidence.
- Accept absent, null, and empty deferred objects without changing the replay parser.
- Cover status, passive launch, ensure, persistence/restart, and stale allowed status.
- Exercise existing workflow promotion and queue settlement writers in integration tests.
- Keep both the tombstone and delayed-callback suppression intact after reuse.
- Extend the existing E2E specs with all three restart scenarios and the preference control.
- Record RED/GREEN results and synchronize this package and companion references.

## Out of scope

No schema, repository writer, live-data repair, lock-order, or replay-policy change
is planned. No new UI layout, copy, settings, or provider-specific behavior is
required. Do not infer permission to resume unrelated parked conversations.

## Acceptance

1. Each positive case reports eligible recovery and reaches the existing automatic
   admission path. The same conversation resumes without another session or
   duplicate settled workflow prompt. Status reads leave metadata unchanged.
2. Current parking, queued work, ambiguous ownership, terminal/archive rules,
   prevention preference, and capacity limits retain their existing behavior.
   A newer ownership change defeats stale allowed status at passive admission.
3. The backend tests and both rendered E2E projects pass. Tombstones remain
   effective against delayed callbacks, and the existing deadlock tests pass.

## Verification

Run from the repository root. Install dependencies once when this worktree lacks them.
Use the repository TDD skill and backend test guidance before writing tests.
The proposed tests must exist before the corresponding commands run.

```bash
(cd apps && pnpm install --frozen-lockfile)
(cd apps/backend && go test ./internal/orchestrator -run '^TestSessionOpenRecovery' -count=1 -timeout=120s)
(cd apps/backend && go test -race ./internal/orchestrator -run 'TestSessionOpenRecovery|TestAutoResumeEligibility|TestGetTaskSessionStatus|TestPassiveLaunchResponse|TestEnsureSession|TestReuseCommittedWorkflowRoute|TestPromoteWorkflowSessionRoute|TestClearWorkflowParking|Test.*ProfileSwitch|TestCeilingReplay' -count=1 -timeout=300s)
(cd apps/web && pnpm exec vitest run hooks/domains/session/use-session-resumption.test.ts)
(cd apps/web && pnpm e2e:run --project chromium tests/workflow/queued-session-ownership.spec.ts)
(cd apps/web && pnpm e2e:run --project mobile-chrome tests/workflow/mobile-queued-session-ownership.spec.ts)
python3 scripts/list-docs.py validate
python3 scripts/lint-spec-files.test.py
python3 scripts/lint-spec-files.py --all
git diff --check
```

Run desktop and phone suites sequentially. The managed E2E runner builds the
application and owns fixture teardown. Do not overlap full suites or override
its worker budget. Capture actual test counts and relevant failure reasons.
A compile failure, missing test, or missing selector does not establish behavioral RED.

For persisted coverage, reopen the test repository and execute startup reconciliation.
Do not model restart solely by resetting a struct. For E2E, use the worker's
`backend.restart()` after closing or navigating away from the target conversation.
Wait for reconnection before task opening. Do not click Resume in positive cases.
Assert provider readiness separately from workspace readiness.

No SQL changes are planned, so this package adds no PostgreSQL prerequisite.
The original ownership package's outstanding PostgreSQL checks remain recorded
there. If implementation requires dialect-sensitive persistence changes, expand
this work order and its database checks before marking it complete.

## Files likely touched

Production:

- `apps/backend/internal/orchestrator/task_operations.go` (`autoResumeEligibility`).
- A focused helper in the same package only if existing complexity limits require it.

Regression tests:

- `apps/backend/internal/orchestrator/session_open_recovery_test.go` (new).
- `apps/web/e2e/tests/workflow/queued-session-ownership.spec.ts`.
- `apps/web/e2e/tests/workflow/mobile-queued-session-ownership.spec.ts`.
- `apps/web/e2e/tests/workflow/queued-session-ownership-helpers.ts`.

Read-only implementation references:

- `apps/backend/internal/orchestrator/task_operations_resume_test.go`.
- `apps/backend/internal/orchestrator/session_launch.go` and `session_launch_test.go`.
- `apps/backend/internal/orchestrator/session_ensure.go` and `session_ensure_test.go`.
- `apps/backend/internal/orchestrator/workflow_session_target.go` and its tests.
- `apps/backend/internal/orchestrator/workflow_profile_session_lifecycle.go`.
- `apps/backend/internal/orchestrator/ceiling_replay.go` (`stripCeilingRecordKeys`).
- `apps/backend/internal/orchestrator/service.go` (startup reconciliation).
- `apps/web/hooks/domains/session/use-session-resumption-operations.ts`.
- `apps/web/e2e/fixtures/backend.ts` and `apps/web/e2e/pages/session-page.ts`.

Delivery records:

- This work order and `plan.md`.
- `docs/plans/queued-session-ownership/plan.md` and its Task 01 follow-up link.

## Dependencies

None. Implement this work order sequentially after an explicit implementation request.

## Risks

Consumed stop markers protect against delayed callbacks. Do not remove them or
ignore them solely because `consumed` is true. An exact current destination must
still pass queue checks. Keep newer parking stamps authoritative.

A stale committed route for another step or profile cannot authorize recovery.
An empty queue object is a known settled representation; a nonempty malformed
record remains ambiguous. Keep automatic admission separate from manual overrides.

## Parallelism

`sequential`

## Inputs

- [Requirements](../../specs/tasks/requirements/queued-session-ownership.md),
  especially 001.1-8 and 002.4/6.
- [Design: recovery after reuse and queue settlement](../../specs/tasks/system-design/queued-session-ownership.md#recovery-after-reuse-and-queue-settlement).
- [Passive inspection ADR](../../decisions/2026-09-16-passive-session-inspection.md).
- [Plan evidence, test matrix, and E2E scenarios](plan.md).
- Existing `TestAutoResumeEligibilityPreservesSessionOwnership`,
  `TestReuseCommittedWorkflowRouteClearsDestinationParkingOnly`, and
  `TestPassiveLaunchResponseBlocksAmbiguousLegacyParking` fixtures.
- Existing desktop/mobile queued-session scenarios and scoped capacity cleanup.

## Results

Pending. No production change, permanent test, or implementation verification
was performed during planning.
