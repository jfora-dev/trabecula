# Working on this repository with an AI coding agent

These are the rules an agent (and a human reviewing its work) should follow here. They exist
because generated code is only as good as the checks it has to pass.

## What this is

A case portal for patient-specific surgical planning, as a demo. `backend/` is a Spring Boot
REST API on PostgreSQL. `frontend/` is an Angular app with a three.js viewer and a voxel
pipeline (CT slice view, marching cubes in a web worker). All data is synthetic.

## Before you call a change done

Run the checks for the side you touched. A change is not done while any of them fails.

| Where | Command | What it proves |
| --- | --- | --- |
| `backend/` | `mvn -B verify` | Unit tests, HTTP contract tests, and the integration test against PostgreSQL (needs Docker) |
| `frontend/` | `npm run format:check` | Formatting |
| `frontend/` | `npm test` | Unit tests |
| `frontend/` | `npm run build` | Type check and production build, including bundle budgets |
| repository root | `docker compose up --build --wait`, then `npm run e2e` in `frontend/` | The stack works end to end in a browser |

Say which of these you ran and what they reported. If you could not run one, say so instead of
assuming it passes.

## Rules

1. **A behaviour change comes with a test.** Workflow rules are tested in
   `SurgicalCaseTest` / `CaseWorkflowTest`, the HTTP contract in `CaseControllerTest`, geometry
   and voxel code in the `*.spec.ts` next to it.
2. **Do not weaken a test to make it pass.** If a test is wrong, explain why in the change.
3. **The API contract has two copies.** The Java records in `backend/.../cases/api` and
   `frontend/src/app/core/api/case.models.ts` must change together.
4. **The database schema changes only through a new Flyway migration.** Never edit a migration
   that has been merged. Hibernate does not create or alter tables.
5. **Workflow rules live in the domain** (`SurgicalCase`, `CaseWorkflow`), not in controllers
   and not in the frontend. The frontend reads `allowedActions` from the API.
6. **Errors are RFC 9457 problem documents** with a `detail` a user can act on and a `code`.
   Add new error types in `ApiExceptionHandler`.
7. **No patient data, ever.** Demo cases come from `tools/demo-data/generate.py` only. Do not
   add scans, names or identifiers from any real source, not even as test fixtures.
8. **Generated files are regenerated, not edited:** `frontend/src/app/voxel/mc-tables.ts`
   (`npm run generate:mc-tables`) and `backend/src/main/resources/demo-assets/`
   (`python tools/demo-data/generate.py`).
9. **Keep three.js out of Angular's way.** 3D logic belongs in `viewer3d/scene-engine.ts`,
   which knows nothing about Angular. Components pass it data through `Viewport`.
10. **Heavy voxel work stays off the main thread.** Anything that walks the whole volume runs
    in the worker (`voxel/surface.worker.ts`), with the pure function tested separately.
11. **New dependencies need a reason** stated in the change. Prefer what the platform, Spring
    or Angular already provide.
12. **Never commit secrets.** Configuration comes from environment variables with local
    defaults (`application.yml`, `docker-compose.yml`).

## Things that are easy to get wrong here

- **Units and frames.** Everything spatial is in millimetres in one right-handed frame shared
  by the CT volume and the STL models: y runs volar to dorsal, z proximal to distal. Radial is
  +x on a right wrist and -x on a left one.
- **Stored values are not Hounsfield units.** `HU = stored * rescaleSlope + rescaleIntercept`.
  Convert at the edge (`huToStored`, `storedToHu`) and keep inner loops in stored values.
- **Voxel order.** x runs fastest, then y, then z, little-endian int16.
- **Optimistic locking.** Every transition carries `expectedVersion`. Do not remove the check
  to make a test or a retry simpler.

## Reviewing agent-written changes

Read the diff as you would a colleague's. In particular check that new code paths have tests
that would fail without them, that no check from the table above was skipped or silenced, and
that comments describe why the code is the way it is rather than what the agent did.
