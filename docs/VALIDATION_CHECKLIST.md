# Launch Desk Validation Checklist

## Agent Behavior

- [ ] Uses the OpenAI Agents SDK, not Assistants API or legacy Chat Completions scaffolding.
- [ ] Calls launch tools before final synthesis.
- [ ] Produces a prioritized release plan with P0/P1/P2 work.
- [ ] Includes a risk register with mitigations and owners.
- [ ] Includes owner checklists that engineering, product, support, data, and GTM can act on.
- [ ] Drafts Slack, email, changelog, and social/channel copy.
- [ ] Asks follow-up questions when audience, date, constraints, assets, success metrics, or owners are unclear.

## Frontend Flow

- [ ] User can enter product brief, audience, launch date, constraints, and assets.
- [ ] Submitting the form posts to `/api/launch-plan`.
- [ ] The UI shows progressive tool events.
- [ ] The UI appends model text deltas as they arrive.
- [ ] Missing `OPENAI_API_KEY` is shown as a useful server error.
- [ ] Layout remains usable at desktop and mobile widths.

## Tool Outputs

- [ ] `extract_tasks_from_brief` returns priority, lane, owner hint, due offset, and evidence.
- [ ] `check_launch_readiness` returns area, score, status, and rationale.
- [ ] `generate_owner_checklists` groups work by owner.
- [ ] `draft_channel_copy` returns internal Slack, customer email, changelog, and social copy.

## Local Verification

- [ ] `npm run test` passes.
- [ ] `npm run build` passes.
- [ ] Server is started with a real `OPENAI_API_KEY` in the server process.
- [ ] `npm run verify:stream` receives at least one `tool_progress` event.
- [ ] `npm run verify:stream` receives at least one `text_delta` event.
