// ===== React performance rule categories =====

export type ReactRuleCategory =
  | "waterfall"
  | "bundle"
  | "server"
  | "client"
  | "rerender"
  | "rendering"
  | "js"
  | "advanced";

// ===== React performance rule descriptor =====

export interface ReactPerformanceRule {
  id: string;
  category: ReactRuleCategory;
  impact: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  check?: (code: string) => string[];
}

// ===== Rule collection =====

export const REACT_PERFORMANCE_RULES: ReactPerformanceRule[] = [
  // ----- waterfall: avoid request waterfalls -----
  {
    id: "async-cheap-condition-before-await",
    category: "waterfall",
    impact: "high",
    title: "Place cheap conditions before await",
    description:
      "Move synchronous guards (auth checks, param validation) before any await so failures fail fast without waiting on network.",
    check: (code: string): string[] => {
      const issues: string[] = [];
      const lines = code.split("\n");
      let seenAwait = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("await ")) seenAwait = true;
        if (seenAwait && /\b(if|throw)\b.*\b(auth|session|user|param)/i.test(line)) {
          issues.push(`Line ${i + 1}: cheap condition appears after an await — move it before the first await.`);
        }
      }
      return issues;
    },
  },
  {
    id: "async-defer-await",
    category: "waterfall",
    impact: "medium",
    title: "Defer await until value is needed",
    description:
      "Start promises eagerly and await them later, allowing independent work to run in parallel.",
  },
  {
    id: "async-parallel",
    category: "waterfall",
    impact: "critical",
    title: "Run independent async calls in parallel",
    description:
      "Use Promise.all for independent async calls instead of awaiting them sequentially.",
    check: (code: string): string[] => {
      const issues: string[] = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length - 1; i++) {
        const cur = lines[i];
        const next = lines[i + 1];
        if (/await\s+\w+\(/.test(cur) && /await\s+\w+\(/.test(next)) {
          issues.push(`Lines ${i + 1}-${i + 2}: consecutive awaits may be serializable with Promise.all.`);
        }
      }
      return issues;
    },
  },
  {
    id: "async-dependencies",
    category: "waterfall",
    impact: "high",
    title: "Only serialize when data depends on prior result",
    description:
      "Await sequentially only when a later call needs the result of an earlier one.",
  },
  {
    id: "async-api-routes",
    category: "waterfall",
    impact: "high",
    title: "Parallelize fetching inside API routes",
    description:
      "In route handlers, kick off all independent fetches together to cut response time.",
  },
  {
    id: "async-suspense-boundaries",
    category: "waterfall",
    impact: "medium",
    title: "Wrap sibling Suspense boundaries for parallel streaming",
    description:
      "Place Suspense around independent components so they stream in parallel instead of blocking on the slowest.",
  },

  // ----- bundle: ship less JavaScript -----
  {
    id: "bundle-barrel-imports",
    category: "bundle",
    impact: "high",
    title: "Avoid barrel file imports that defeat tree-shaking",
    description:
      "Prefer deep imports or modern bundlers that preserve module graph analysis. Barrel files can pull in unwanted modules.",
    check: (code: string): string[] => {
      const issues: string[] = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/from\s+['"][^'"]+\/(components|utils|icons)['"]/.test(lines[i])) {
          issues.push(`Line ${i + 1}: barrel import detected — prefer a specific module path.`);
        }
      }
      return issues;
    },
  },
  {
    id: "bundle-analyzable-paths",
    category: "bundle",
    impact: "medium",
    title: "Keep import paths statically analyzable",
    description:
      "Avoid dynamic string concatenation in import paths so bundlers can trace dependencies.",
  },
  {
    id: "bundle-dynamic-imports",
    category: "bundle",
    impact: "high",
    title: "Code-split heavy routes with dynamic import",
    description:
      "Use React.lazy / next/dynamic for large or conditionally rendered components.",
  },
  {
    id: "bundle-defer-third-party",
    category: "bundle",
    impact: "medium",
    title: "Defer third-party scripts until needed",
    description:
      "Load analytics, chat widgets, and embeds lazily to keep main bundle small.",
  },
  {
    id: "bundle-conditional",
    category: "bundle",
    impact: "medium",
    title: "Conditionally import environment-specific code",
    description:
      "Use environment guards so dev-only or feature-only code is excluded from production bundles.",
  },
  {
    id: "bundle-preload",
    category: "bundle",
    impact: "low",
    title: "Preload critical chunks for next navigation",
    description:
      "Hint the next likely route chunk so it loads during idle time.",
  },

  // ----- server: server component best practices -----
  {
    id: "server-auth-actions",
    category: "server",
    impact: "critical",
    title: "Authorize inside server actions",
    description:
      "Always re-validate the user session inside server actions; never trust client claims.",
  },
  {
    id: "server-cache-react",
    category: "server",
    impact: "high",
    title: "Use React cache to deduplicate reads per request",
    description:
      "Wrap data loaders in cache() so multiple components in a request share one fetch.",
  },
  {
    id: "server-cache-lru",
    category: "server",
    impact: "medium",
    title: "Use LRU cache for expensive pure computations",
    description:
      "Cache derived data across requests with an LRU when staleness is acceptable.",
  },
  {
    id: "server-dedup-props",
    category: "server",
    impact: "medium",
    title: "Deduplicate server-side data via props",
    description:
      "Fetch once in a server component and pass down rather than refetching in children.",
  },
  {
    id: "server-hoist-static-io",
    category: "server",
    impact: "high",
    title: "Hoist static I/O out of render",
    description:
      "Move file reads, env lookups, and constant fetches to module scope.",
  },
  {
    id: "server-no-shared-module-state",
    category: "server",
    impact: "critical",
    title: "Never share mutable state across requests at module scope",
    description:
      "Module-level mutable state leaks between users in server runtimes. Use request-scoped storage.",
  },
  {
    id: "server-serialization",
    category: "server",
    impact: "medium",
    title: "Serialize data before crossing the server/client boundary",
    description:
      "Pass plain JSON-safe values to client components; do not pass class instances or functions.",
  },
  {
    id: "server-parallel-fetching",
    category: "server",
    impact: "high",
    title: "Parallelize server-side fetches",
    description:
      "Use Promise.all in server components and loaders to avoid serial waterfalls.",
  },

  // ----- client: client-side data and events -----
  {
    id: "client-swr-dedup",
    category: "client",
    impact: "high",
    title: "Deduplicate requests with SWR or React Query",
    description:
      "Use a data-fetching library that dedupes concurrent requests and caches results.",
  },
  {
    id: "client-event-listeners",
    category: "client",
    impact: "medium",
    title: "Clean up event listeners on unmount",
    description:
      "Always return a cleanup function from useEffect when adding listeners.",
    check: (code: string): string[] => {
      const issues: string[] = [];
      if (/addEventListener\(/.test(code) && !/return\s*\(/.test(code) && !/removeEventListener\(/.test(code)) {
        issues.push("addEventListener detected without a matching cleanup / removeEventListener.");
      }
      return issues;
    },
  },
  {
    id: "client-passive-event-listeners",
    category: "client",
    impact: "medium",
    title: "Use passive listeners for scroll/touch events",
    description:
      "Mark scroll and touch listeners as passive to avoid blocking the main thread.",
  },
  {
    id: "client-localstorage-schema",
    category: "client",
    impact: "low",
    title: "Schema-validate localStorage reads",
    description:
      "Parse and validate persisted values; treat malformed data as missing.",
  },

  // ----- rerender: minimize unnecessary re-renders -----
  {
    id: "rerender-defer-reads",
    category: "rerender",
    impact: "high",
    title: "Defer context reads to leaves",
    description:
      "Read reactive context in the deepest relevant component to limit re-render scope.",
  },
  {
    id: "rerender-memo",
    category: "rerender",
    impact: "medium",
    title: "Memoize expensive components",
    description:
      "Wrap computationally heavy components in React.memo when props are stable.",
  },
  {
    id: "rerender-memo-with-default-value",
    category: "rerender",
    impact: "medium",
    title: "Memoize even with default prop values",
    description:
      "Default object/array props break memo; stabilize them with useMemo or module scope.",
  },
  {
    id: "rerender-dependencies",
    category: "rerender",
    impact: "high",
    title: "Stabilize useEffect/useMemo dependencies",
    description:
      "Avoid inline objects/arrays in dependency arrays; hoist or memoize them.",
  },
  {
    id: "rerender-derived-state",
    category: "rerender",
    impact: "high",
    title: "Avoid mirroring props into state",
    description:
      "Compute derived values during render instead of syncing props into state with effects.",
  },
  {
    id: "rerender-functional-setstate",
    category: "rerender",
    impact: "medium",
    title: "Use functional setState when next depends on previous",
    description:
      "Pass an updater function to setState to avoid stale closures and extra dependencies.",
  },
  {
    id: "rerender-lazy-state-init",
    category: "rerender",
    impact: "medium",
    title: "Initialize expensive state lazily",
    description:
      "Pass an initializer to useState so the expensive default runs only once.",
  },
  {
    id: "rerender-no-inline-components",
    category: "rerender",
    impact: "high",
    title: "Do not define components inside other components",
    description:
      "Inline component definitions remount on every parent render, destroying state and slowing reconciliation.",
    check: (code: string): string[] => {
      const issues: string[] = [];
      const lines = code.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/function\s+[A-Z]\w*\s*\(/.test(lines[i]) && i > 0 && /\breturn\s*\(/.test(lines[i - 1]) === false) {
          if (lines.slice(0, i).some((l) => /function\s+[A-Z]\w*\s*\(/.test(l))) {
            issues.push(`Line ${i + 1}: component defined inside another component — hoist it to module scope.`);
          }
        }
      }
      return issues;
    },
  },

  // ----- rendering: rendering performance -----
  {
    id: "rendering-animate-svg-wrapper",
    category: "rendering",
    impact: "medium",
    title: "Animate SVG via wrapper, not internal nodes",
    description:
      "Animate transform/opacity on a wrapping element to avoid layout thrash inside the SVG.",
  },
  {
    id: "rendering-content-visibility",
    category: "rendering",
    impact: "medium",
    title: "Use content-visibility for long lists",
    description:
      "Apply CSS content-visibility: auto to off-screen sections to skip rendering work.",
  },
  {
    id: "rendering-hoist-jsx",
    category: "rendering",
    impact: "low",
    title: "Hoist static JSX to module scope",
    description:
      "Constant JSX trees defined outside the component avoid re-creating vnodes each render.",
  },
  {
    id: "rendering-conditional-render",
    category: "rendering",
    impact: "medium",
    title: "Prefer conditional render over hidden DOM",
    description:
      "Render components only when visible instead of using display:none for large subtrees.",
  },
  {
    id: "rendering-usetransition-loading",
    category: "rendering",
    impact: "medium",
    title: "Use useTransition for non-urgent updates",
    description:
      "Mark heavy state updates as transitions so urgent UI stays responsive.",
  },

  // ----- js: general JS-level micro-optimizations -----
  {
    id: "js-batch-dom-css",
    category: "js",
    impact: "medium",
    title: "Batch DOM style writes",
    description:
      "Group style mutations to avoid forced synchronous layout recalcs.",
  },
  {
    id: "js-index-maps",
    category: "js",
    impact: "medium",
    title: "Use maps for O(1) lookups by key",
    description:
      "Convert lists to keyed maps when doing repeated lookups instead of scanning arrays.",
  },
  {
    id: "js-cache-property-access",
    category: "js",
    impact: "low",
    title: "Cache deep property access in hot loops",
    description:
      "Store deeply nested values in locals before iterating to avoid repeated member lookups.",
  },
  {
    id: "js-set-map-lookups",
    category: "js",
    impact: "medium",
    title: "Use Set for membership tests",
    description:
      "Prefer Set.has over Array.includes for repeated membership checks.",
  },
  {
    id: "js-early-exit",
    category: "js",
    impact: "low",
    title: "Exit early from functions",
    description:
      "Guard clauses reduce nesting and short-circuit unnecessary work.",
  },
  {
    id: "js-flatmap-filter",
    category: "js",
    impact: "low",
    title: "Use flatMap to combine map+filter",
    description:
      "flatMap can replace a map+filter chain with a single pass.",
  },

  // ----- advanced: advanced React patterns -----
  {
    id: "advanced-effect-event-deps",
    category: "advanced",
    impact: "high",
    title: "Use effect events for non-reactive deps",
    description:
      "Move values that should not retrigger an effect into an effect event to avoid re-running it.",
  },
  {
    id: "advanced-event-handler-refs",
    category: "advanced",
    impact: "medium",
    title: "Store latest props in refs for stable handlers",
    description:
      "Keep handlers stable while still reading the latest props via a ref indirection.",
  },
  {
    id: "advanced-init-once",
    category: "advanced",
    impact: "medium",
    title: "Initialize expensive resources once",
    description:
      "Use a ref + lazy initializer to ensure singletons across renders.",
  },
  {
    id: "advanced-use-latest",
    category: "advanced",
    impact: "medium",
    title: "Always read latest value in async callbacks",
    description:
      "Use a ref-based latest pattern to avoid stale closures in setTimeout/async handlers.",
  },
];

// ===== Query helpers =====

export function getRulesByCategory(category: ReactRuleCategory): ReactPerformanceRule[] {
  return REACT_PERFORMANCE_RULES.filter((rule) => rule.category === category);
}

export function getRulesByImpact(impact: "critical" | "high" | "medium" | "low"): ReactPerformanceRule[] {
  return REACT_PERFORMANCE_RULES.filter((rule) => rule.impact === impact);
}

// ===== Audit function =====

export function auditReactCode(code: string): { ruleId: string; issues: string[] }[] {
  const results: { ruleId: string; issues: string[] }[] = [];
  for (const rule of REACT_PERFORMANCE_RULES) {
    if (typeof rule.check === "function") {
      const issues = rule.check(code);
      if (issues.length > 0) {
        results.push({ ruleId: rule.id, issues });
      }
    }
  }
  return results;
}
