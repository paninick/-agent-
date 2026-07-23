// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";

// Tell React this is an act-enabled environment.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React Flow v12 requires ResizeObserver which jsdom does not provide.
class ResizeObserverPolyfill {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_cb: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverPolyfill;

import { WorkflowDesigner } from "../client/WorkflowDesigner";

function renderToDom(element: ReturnType<typeof createElement>): { root: HTMLElement; cleanup: () => void } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    root: container,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("WorkflowDesigner", () => {
  it("renders the workflow graph header", () => {
    const { root, cleanup } = renderToDom(
      createElement(WorkflowDesigner, {
        steps: ["scout", "collector", "verifier", "analyst", "synthesizer", "memory"],
      }),
    );
    expect(root.textContent).toContain("WORKFLOW GRAPH");
    cleanup();
  });

  it("displays cost badge when costRecord is provided", () => {
    const { root, cleanup } = renderToDom(
      createElement(WorkflowDesigner, {
        steps: ["collector", "verifier", "memory"],
        costRecord: { totalCost: 0.024, modelCost: 0.024 },
      }),
    );
    expect(root.textContent).toContain("$0.0240");
    cleanup();
  });

  it("does not display cost badge when costRecord is undefined", () => {
    const { root, cleanup } = renderToDom(
      createElement(WorkflowDesigner, {
        steps: ["collector", "memory"],
      }),
    );
    expect(root.textContent).not.toMatch(/\$/);
    cleanup();
  });

  it("renders node detail panel with selected role", () => {
    const { root, cleanup } = renderToDom(
      createElement(WorkflowDesigner, {
        steps: ["scout", "collector", "memory"],
        results: [
          { role: "scout", status: "completed" },
          { role: "collector", status: "completed" },
          { role: "memory", status: "pending" },
        ],
      }),
    );
    // First node (scout) should be selected by default
    expect(root.textContent).toContain("Scout");
    expect(root.textContent).toContain("completed");
    expect(root.textContent).toContain("1 / 3");
    cleanup();
  });

  it("shows pending state for steps without results", () => {
    const { root, cleanup } = renderToDom(
      createElement(WorkflowDesigner, {
        steps: ["scout", "memory"],
      }),
    );
    expect(root.textContent).toContain("pending");
    cleanup();
  });
});
