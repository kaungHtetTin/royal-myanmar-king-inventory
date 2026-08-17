## Autonomous Phase Execution

When asked to implement a development phase:

- Read SRS.md and DEVELOPMENT_ROADMAP.md first.
- Identify every requirement belonging to the requested phase.
- Work through all tasks and subtasks autonomously.
- Do not stop after completing an individual function, component,
  CRUD module, API endpoint, migration, test, or feature.
- After completing one task, immediately continue to the next
  unfinished task.
- Do not ask "should I continue?" or wait for user confirmation
  between normal development steps.
- Run appropriate tests/build/lint commands throughout implementation.
- Fix errors encountered during implementation and continue.
- Keep DEVELOPMENT_PROGRESS.md updated as work is completed.

A phase is complete only when:
1. Every requirement for the phase is implemented.
2. Relevant tests pass.
3. The application builds successfully.
4. No known blocking implementation errors remain.

Only stop before completion if:
- required information is genuinely missing;
- continuing requires a destructive or irreversible action;
- there is a blocker that cannot reasonably be solved from the repository.