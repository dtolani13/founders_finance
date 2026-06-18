# Founders Finance Repository Protocol

This file applies to the entire Founders Finance repository.

## Canonical Work List

`docs/MASTER_TODO.md` is the single source of truth for remaining work, priority, verification status, and session handoff notes.

Do not begin implementation from memory, chat history, `docs/NEXT_BUILD_STEPS.md`, or `docs/FEATURE_STATUS.md`. Those files may provide context, but the master TODO controls priority and status.

## Mandatory Session Start

Every new work session must follow this sequence before implementation:

1. Read `docs/MASTER_TODO.md` completely.
2. Perform an initial repository pass:
   - inspect `git status` and recent commits;
   - inspect the relevant source, schema, API contract, tests, scripts, and documentation;
   - search for naming drift, stale claims, TODO markers, and untracked generated behavior;
   - identify changes made since the TODO was last updated.
3. Read `docs/MASTER_TODO.md` again.
4. Perform a second codebase verification pass:
   - compare each relevant TODO status with actual implementation evidence;
   - verify dependencies and cross-layer contracts align;
   - correct the TODO immediately if code reality and documented status differ.
5. Select the highest-priority unblocked item unless the user explicitly directs otherwise.

The two repository passes must be independent checks. Do not treat the first pass as sufficient verification.

## Status Rules

Use only these statuses in `docs/MASTER_TODO.md`:

- `[x]` Complete: implemented and verified against the listed acceptance evidence.
- `[~]` Partial: meaningful implementation exists, but acceptance evidence is incomplete.
- `[ ]` Not started or materially incomplete.
- `[!]` Blocked: cannot proceed without a specific external dependency or user decision.

Do not mark an item complete because code exists. Completion requires its acceptance checks to pass.

## During Work

- Keep the master TODO aligned with discoveries that change scope, priority, risk, or status.
- Add newly discovered work to the correct priority section instead of keeping an informal side list.
- Preserve financial history. Company and transaction removal must use lifecycle or void semantics unless an explicit, verified hard-delete requirement exists.
- Keep database schema, API implementation, OpenAPI contract, generated clients, UI, tests, and documentation synchronized.
- Never manually edit generated API files as the final state. Update the OpenAPI source and regenerate, or document and resolve a code-generation blocker before completion.
- Do not mark security, backup, restore, accounting integrity, or migration work complete using UI-only evidence.

## Mandatory Session End

Before ending every work session:

1. Inspect the complete diff and `git status`.
2. Run the verification appropriate to the changed surface. At minimum for code changes:
   - `pnpm run typecheck`
   - `pnpm run build`
3. Run focused tests or live API/browser checks for changed workflows.
4. Scan for prohibited remnants, including legacy platform-builder names and all pre-rebrand product-name variants. The clean result is zero matches outside explicit historical audit records.
5. Update every affected item in `docs/MASTER_TODO.md`.
6. Add a dated entry to the session log in the master TODO with:
   - work completed;
   - verification performed;
   - unresolved findings;
   - next highest-priority action.
7. Read the master TODO one final time.
8. Perform a final repository alignment pass and confirm the TODO matches the codebase.
9. Commit and push when requested, then confirm the working tree and remote state.

No session is complete until the master TODO has been updated and verified against the repository.
