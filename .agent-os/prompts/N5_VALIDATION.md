# N5_VALIDATION

Role: Validation Reviewer
Model: deepseek-v4-pro

Goal:
Run or verify the phase validation baseline.

Required validation commands:
```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run verify:intelligence
```

Rules:
- Review validation results only; do not modify files.
- Report lint/typecheck/test/build/verify:intelligence results.
- Report boundary check results.
- Mark STATUS: BLOCK on failed validation unless the failure is explicitly out of scope and documented.
- Do not announce SEALED.

Required output format:
```text
STATUS:
NEXT_NODE:
NEXT_MODEL:
VALIDATION_RESULTS:
BLOCKING_ISSUES:
NON_BLOCKING_ISSUES:
REQUIRED_ACTION:
BOUNDARY_CHECK_RESULTS:
HANDOFF_PACKET:
```
