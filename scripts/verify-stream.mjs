const endpoint = process.env.LAUNCH_DESK_ENDPOINT || "http://127.0.0.1:8787/api/launch-plan";

const payload = {
  productBrief:
    "Launch a self-serve incident insights dashboard for engineering managers. It summarizes service health, postmortem actions, and release risk before weekly planning.",
  audience: "Engineering managers and incident commanders",
  launchDate: "2026-08-15",
  constraints:
    "Security review is due next week, support needs FAQ coverage, launch week has an on-call freeze, and beta customers want CSV export.",
  assets: "Prototype screenshots, metrics dashboard, beta quotes, FAQ outline"
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});

if (!response.ok || !response.body) {
  throw new Error(`Verification request failed: ${response.status} ${response.statusText}`);
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let sawToolProgress = false;
let sawTextDelta = false;
let sawError = "";
let textChars = 0;

function parseBlock(block) {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6))
    .join("\n");
  if (!data) return null;
  return JSON.parse(data);
}

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const blocks = buffer.split("\n\n");
  buffer = blocks.pop() ?? "";

  for (const block of blocks) {
    const event = parseBlock(block);
    if (!event) continue;

    if (event.type === "tool_progress") {
      sawToolProgress = true;
      console.log(`tool_progress: ${event.status} ${event.name}`);
    }

    if (event.type === "text_delta") {
      sawTextDelta = true;
      textChars += event.delta?.length ?? 0;
    }

    if (event.type === "error") {
      sawError = event.message || "Unknown streamed error";
    }
  }
}

if (sawError) {
  throw new Error(`Stream emitted error: ${sawError}`);
}

if (!sawToolProgress || !sawTextDelta) {
  throw new Error(
    `Expected at least one tool_progress and one text_delta. sawToolProgress=${sawToolProgress} sawTextDelta=${sawTextDelta}`
  );
}

console.log(`verified_stream: tool_progress=true text_delta=true text_chars=${textChars}`);
