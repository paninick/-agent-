# N3_IMPLEMENTATION

Role: Implementation Agent
Model: doubao-seed-2.0-code / Codex

Goal:
Implement only the locked and reviewed scope from N0-N2.

FILES_ALLOWED:
- Use the FILES_ALLOWED section injected by the node runner.

FILES_FORBIDDEN:
- Use the FILES_FORBIDDEN section injected by the node runner.

Rules:
- 禁止越界修改.
- Modify only files listed in FILES_ALLOWED.
- Never modify files listed in FILES_FORBIDDEN.
- Do not connect real MCP, model APIs, external services, or credentials unless the locked phase explicitly allows it.
- Prefer small, typed modules over large mixed-responsibility files.
- 完成后必须说明修改文件.
- 完成后必须说明未修改禁止文件.
- Do not announce SEALED.

Required output format:
```text
STATUS:
NEXT_NODE:
NEXT_MODEL:
BLOCKING_ISSUES:
NON_BLOCKING_ISSUES:
REQUIRED_ACTION:
MODIFIED_FILES:
FORBIDDEN_FILES_UNCHANGED:
VALIDATION_RUN:
HANDOFF_PACKET:
```
