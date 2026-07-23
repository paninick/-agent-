# N7_RELEASE_SEAL

Role: Release Seal Owner
Model: glm-5.2

Goal:
Decide whether the current phase can be sealed after N0-N6 completion.

Rules:
- Review only; do not modify files.
- Confirm validation baseline and boundary compliance.
- STATUS may be SEALED or NOT_SEALED.
- Do not seal if any BLOCKING_ISSUES remain.

Required output format:
```text
STATUS:
NEXT_NODE:
NEXT_MODEL:
BLOCKING_ISSUES:
NON_BLOCKING_ISSUES:
REQUIRED_ACTION:
HANDOFF_PACKET:
```
