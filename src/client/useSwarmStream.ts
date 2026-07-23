/**
 * client/useSwarmStream.ts — SSE 流读取 hook
 *
 * 使用浏览器原生 EventSource 不可行（需要 POST body），
 * 改用 fetch + ReadableStream 手动解析 SSE 格式。
 *
 * 每收到一个 step 事件就回调 onStep，
 * 收到 done 事件回调 onDone。
 */

import { useCallback, useRef, useState } from "react";

export type StepEvent = {
  step: number;
  total: number;
  role: string;
  status: string;
  result?: unknown;
  phase: string;
};

export type DoneEvent = {
  done: true;
  result: unknown;
  intent?: unknown;
  budget?: unknown;
  error?: string;
};

export type SwarmStreamState = "idle" | "streaming" | "done" | "error";

export function useSwarmStream() {
  const [state, setState] = useState<SwarmStreamState>("idle");
  const [steps, setSteps] = useState<StepEvent[]>([]);
  const [finalResult, setFinalResult] = useState<DoneEvent | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (
    objective: string,
    packId: string,
    onStep?: (step: StepEvent) => void,
    onDone?: (result: DoneEvent) => void,
  ) => {
    setState("streaming");
    setSteps([]);
    setFinalResult(null);
    setError("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/intelligence/swarm/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ objective, packId }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`stream request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // SSE lines start with "data: "
      const parseSSE = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;
          try {
            const event = JSON.parse(jsonStr);
            if (event.done) {
              setFinalResult(event as DoneEvent);
              onDone?.(event as DoneEvent);
            } else {
              setSteps((prev) => [...prev, event as StepEvent]);
              onStep?.(event as StepEvent);
            }
          } catch {
            // skip malformed line
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        parseSSE(decoder.decode(value));
      }

      setState("done");
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
      setState("error");
    } finally {
      abortRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setState("idle");
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setSteps([]);
    setFinalResult(null);
    setError("");
  }, []);

  return { state, steps, finalResult, error, stream, abort, reset };
}