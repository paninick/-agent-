// ===== UI checklist categories =====

export type UIChecklistCategory =
  | "accessibility"
  | "touch"
  | "performance"
  | "style"
  | "layout"
  | "typography"
  | "animation"
  | "forms"
  | "navigation"
  | "charts";

// ===== UI checklist item descriptor =====

export interface UIChecklistItem {
  id: string;
  category: UIChecklistCategory;
  priority: number; // 1-10, 1 is highest
  check: string;
  passCriteria: string;
  failExample?: string;
}

// ===== Checklist collection =====

export const UI_CHECKLIST: UIChecklistItem[] = [
  // ----- accessibility: inclusive by default -----
  {
    id: "a11y-color-contrast",
    category: "accessibility",
    priority: 1,
    check: "Color contrast meets WCAG AA",
    passCriteria: "Body text contrast >= 4.5:1; large text >= 3:1; interactive UI >= 3:1.",
    failExample: "Light gray (#bbb) text on white background.",
  },
  {
    id: "a11y-alt-text",
    category: "accessibility",
    priority: 1,
    check: "All meaningful images have alt text",
    passCriteria: "Informative images have concise alt; decorative images use alt=\"\".",
    failExample: "<img src=\"chart.png\" />",
  },
  {
    id: "a11y-keyboard-nav",
    category: "accessibility",
    priority: 1,
    check: "All interactions reachable by keyboard",
    passCriteria: "Tab order is logical; custom widgets support arrow/Enter/Escape as appropriate.",
    failExample: "A modal that can only be closed by clicking the backdrop.",
  },
  {
    id: "a11y-aria-label",
    category: "accessibility",
    priority: 2,
    check: "Icon-only buttons have aria-label",
    passCriteria: "Every icon-only control has an accessible name via aria-label or aria-labelledby.",
    failExample: "<button><SvgIcon /></button>",
  },
  {
    id: "a11y-focus-ring",
    category: "accessibility",
    priority: 1,
    check: "Visible focus indicator is never removed",
    passCriteria: "Focus ring has >= 3:1 contrast and is visible on every focusable element.",
    failExample: "*:focus { outline: none; } with no replacement.",
  },
  {
    id: "a11y-heading-hierarchy",
    category: "accessibility",
    priority: 2,
    check: "Heading levels increase by one",
    passCriteria: "No skipped heading levels (e.g., h2 -> h4); exactly one h1 per page.",
    failExample: "<h1>Title</h1> ... <h4>Section</h4>",
  },

  // ----- touch: thumb-friendly mobile interaction -----
  {
    id: "touch-target-size",
    category: "touch",
    priority: 1,
    check: "Touch targets are at least 44x44 px",
    passCriteria: "Every tappable element has a 44x44px hit area (may use padding).",
    failExample: "A 24x24px close icon with no padding.",
  },
  {
    id: "touch-spacing",
    category: "touch",
    priority: 2,
    check: "Adjacent touch targets have >= 8px gap",
    passCriteria: "Minimum 8px gap between targets to prevent mis-taps.",
    failExample: "Two buttons directly adjacent with no margin.",
  },
  {
    id: "touch-loading-feedback",
    category: "touch",
    priority: 2,
    check: "Tap shows immediate loading feedback",
    passCriteria: "Submit-like actions show a spinner or disabled state within 100ms.",
    failExample: "Form submit button stays unchanged for 2 seconds while waiting.",
  },
  {
    id: "touch-press-feedback",
    category: "touch",
    priority: 3,
    check: "Press state gives visual feedback",
    passCriteria: ":active state changes appearance (opacity, scale, or color).",
    failExample: "Button looks identical when pressed.",
  },

  // ----- performance: fast perceived and actual load -----
  {
    id: "perf-image-formats",
    category: "performance",
    priority: 1,
    check: "Use modern image formats",
    passCriteria: "Serve WebP or AVIF with a PNG/JPEG fallback via <picture>.",
    failExample: "<img src=\"hero.png\" /> with no format negotiation.",
  },
  {
    id: "perf-lazy-load",
    category: "performance",
    priority: 1,
    check: "Lazy-load below-the-fold media",
    passCriteria: "Images and iframes outside viewport use loading=\"lazy\".",
    failExample: "A 50-image gallery all loading eagerly.",
  },
  {
    id: "perf-cls",
    category: "performance",
    priority: 1,
    check: "Cumulative Layout Shift < 0.1",
    passCriteria: "Reserve space for ads, images, and fonts; avoid injecting content above current scroll.",
    failExample: "Image without dimensions causing text to jump.",
  },
  {
    id: "perf-font-loading",
    category: "performance",
    priority: 2,
    check: "Fonts load without FOUT/FOIT blocking text",
    passCriteria: "Use font-display: swap and preload the primary font.",
    failExample: "font-display: block hiding text for 3 seconds.",
  },

  // ----- style: consistent visual language -----
  {
    id: "style-consistency",
    category: "style",
    priority: 1,
    check: "Reuse a single design system",
    passCriteria: "Colors, spacing, radii, and shadows come from defined tokens, not ad-hoc values.",
    failExample: "Three different button colors across the same app.",
  },
  {
    id: "style-svg-icons",
    category: "style",
    priority: 2,
    check: "Use SVG icons over icon fonts",
    passCriteria: "Icons are inline SVG or from an icon component; no icon font glyph hacks.",
    failExample: "<i class=\"fa fa-check\"></i> rendered as a font.",
  },
  {
    id: "style-dark-mode",
    category: "style",
    priority: 2,
    check: "Support dark mode via tokens",
    passCriteria: "Colors reference CSS variables that flip in a prefers-color-scheme: dark media query.",
    failExample: "Hard-coded white background preventing dark mode.",
  },
  {
    id: "style-shadow-consistency",
    category: "style",
    priority: 3,
    check: "Elevation uses a consistent shadow scale",
    passCriteria: "Shadows come from a token scale (e.g., sm/md/lg/xl); no arbitrary blur/offset.",
    failExample: "box-shadow: 0 2px 7px rgba(0,0,0,0.13) hand-tuned per component.",
  },

  // ----- layout: responsive and predictable -----
  {
    id: "layout-mobile-first",
    category: "layout",
    priority: 1,
    check: "Author mobile-first styles",
    passCriteria: "Base styles target mobile; min-width media queries enhance for larger screens.",
    failExample: "Desktop styles overridden by max-width: 768px hacks.",
  },
  {
    id: "layout-breakpoints",
    category: "layout",
    priority: 2,
    check: "Use a shared breakpoint scale",
    passCriteria: "All breakpoints come from a shared token set (e.g., sm/md/lg/xl).",
    failExample: "@media (max-width: 873px) used once and never again.",
  },
  {
    id: "layout-no-horizontal-scroll",
    category: "layout",
    priority: 1,
    check: "No horizontal scroll on mobile",
    passCriteria: "Content fits within viewport at 320px width without overflow-x.",
    failExample: "A 1200px-wide table inside a 375px viewport.",
  },
  {
    id: "layout-spacing-system",
    category: "layout",
    priority: 2,
    check: "Spacing uses a scale",
    passCriteria: "Margins/paddings use multiples of 4 or 8 from a spacing token.",
    failExample: "margin: 13px in one component, 15px in another.",
  },

  // ----- typography: readable and hierarchical -----
  {
    id: "type-base-size",
    category: "typography",
    priority: 1,
    check: "Base font size is at least 16px",
    passCriteria: "html { font-size: 16px; } or 1rem; smaller sizes are deliberate.",
    failExample: "body { font-size: 12px; } for desktop content.",
  },
  {
    id: "type-line-height",
    category: "typography",
    priority: 1,
    check: "Body line-height is at least 1.5",
    passCriteria: "Paragraphs use line-height >= 1.5; headings may use 1.2-1.3.",
    failExample: "p { line-height: 1.1; } making text cramped.",
  },
  {
    id: "type-semantic-color",
    category: "typography",
    priority: 2,
    check: "Text colors are semantic",
    passCriteria: "Use text-primary/text-muted tokens, not raw hex values per use.",
    failExample: "color: #333 on one element, color: #2b2b2b on another.",
  },
  {
    id: "type-font-pairing",
    category: "typography",
    priority: 3,
    check: "Limit to two font families",
    passCriteria: "One display + one body font (or a single variable font); no more.",
    failExample: "Four different Google Fonts loaded on the same page.",
  },

  // ----- animation: meaningful motion -----
  {
    id: "anim-duration",
    category: "animation",
    priority: 1,
    check: "Transitions are 150-300ms",
    passCriteria: "Micro-interactions use 150-300ms; larger scenes up to 500ms.",
    failExample: "transition: all 2s on a hover state.",
  },
  {
    id: "anim-transform-opacity",
    category: "animation",
    priority: 1,
    check: "Animate only transform and opacity",
    passCriteria: "Avoid animating width/height/top/left; prefer transform: translate/scale.",
    failExample: "transition: width 0.3s on a growing bar.",
  },
  {
    id: "anim-skeleton",
    category: "animation",
    priority: 2,
    check: "Use skeletons for loading > 200ms",
    passCriteria: "Content areas show a skeleton placeholder rather than a blank gap.",
    failExample: "An empty white card while data loads for 1.5 seconds.",
  },
  {
    id: "anim-reduce-motion",
    category: "animation",
    priority: 1,
    check: "Honor prefers-reduced-motion",
    passCriteria: "Non-essential animations are disabled or shortened under prefers-reduced-motion: reduce.",
    failExample: "A 30-second looping background with no reduced-motion fallback.",
  },

  // ----- forms: forgiving data entry -----
  {
    id: "form-visible-labels",
    category: "forms",
    priority: 1,
    check: "Every input has a visible label",
    passCriteria: "Use <label> bound to the input; do not rely on placeholders alone.",
    failExample: "<input placeholder=\"Email\" /> with no label.",
  },
  {
    id: "form-error-proximity",
    category: "forms",
    priority: 1,
    check: "Errors appear next to the field",
    passCriteria: "Inline error message is associated via aria-describedby and placed near the input.",
    failExample: "All form errors summarized only at the top of the page.",
  },
  {
    id: "form-help-text",
    category: "forms",
    priority: 2,
    check: "Provide help text for complex fields",
    passCriteria: "Password rules, format hints, and units are shown before submission.",
    failExample: "A password field rejecting submission without stating the rules.",
  },
  {
    id: "form-progressive-disclosure",
    category: "forms",
    priority: 3,
    check: "Use progressive disclosure for long forms",
    passCriteria: "Conditional fields appear only when relevant; multi-step flows split long forms.",
    failExample: "A 40-field single-page form with no grouping.",
  },

  // ----- navigation: predictable wayfinding -----
  {
    id: "nav-predictable-back",
    category: "navigation",
    priority: 1,
    check: "Back button behaves predictably",
    passCriteria: "Hardware/browser back returns to the previous logical screen, not an unexpected state.",
    failExample: "Back button exits the app from a modal that was opened via deep link.",
  },
  {
    id: "nav-bottom-nav-limit",
    category: "navigation",
    priority: 2,
    check: "Bottom navigation has <= 5 items",
    passCriteria: "Primary bottom nav contains 3-5 destinations; more go into a 'More' menu.",
    failExample: "A bottom bar with 8 tabs that wrap awkwardly.",
  },
  {
    id: "nav-deep-links",
    category: "navigation",
    priority: 2,
    check: "Deep links restore screen state",
    passCriteria: "Refreshing or sharing a URL returns the user to the same screen with the same data.",
    failExample: "Reloading a detail page resets to the home screen.",
  },
  {
    id: "nav-active-state",
    category: "navigation",
    priority: 3,
    check: "Current destination is visually marked",
    passCriteria: "Active nav item uses color, weight, or icon fill to indicate current location.",
    failExample: "All nav items look identical regardless of route.",
  },

  // ----- charts: honest and legible data viz -----
  {
    id: "chart-legend",
    category: "charts",
    priority: 1,
    check: "Charts have a legend or direct labels",
    passCriteria: "Each series is identifiable via a legend or labels placed next to the data.",
    failExample: "Three colored lines with no legend and no labels.",
  },
  {
    id: "chart-tooltip",
    category: "charts",
    priority: 2,
    check: "Hover/focus reveals exact values",
    passCriteria: "A tooltip or data table shows precise numbers for the focused point.",
    failExample: "A bar chart where users must guess the value from the axis.",
  },
  {
    id: "chart-accessible-colors",
    category: "charts",
    priority: 1,
    check: "Series colors are colorblind-safe",
    passCriteria: "Use a colorblind-safe palette and differentiate by shape or pattern too.",
    failExample: "Red and green bars distinguished only by hue.",
  },
  {
    id: "chart-axis-baseline",
    category: "charts",
    priority: 2,
    check: "Bar charts start the y-axis at zero",
    passCriteria: "Quantitative bar baselines begin at zero to avoid misleading ratios.",
    failExample: "A bar chart with y-axis starting at 50 to exaggerate differences.",
  },
];

// ===== Query helpers =====

export function getChecklistByCategory(category: UIChecklistCategory): UIChecklistItem[] {
  return UI_CHECKLIST.filter((item) => item.category === category);
}

export function getChecklistByPriority(maxPriority: number): UIChecklistItem[] {
  return UI_CHECKLIST.filter((item) => item.priority <= maxPriority);
}

// ===== Audit function =====

export function auditUiComponent(
  componentCode: string,
): { itemId: string; status: "pass" | "fail" | "warning"; note?: string }[] {
  const results: { itemId: string; status: "pass" | "fail" | "warning"; note?: string }[] = [];

  // a11y-color-contrast: cannot measure contrast statically, warn if inline color used
  if (/color:\s*['"]?#[0-9a-fA-F]{3,6}/.test(componentCode) || /backgroundColor:\s*['"]?#/.test(componentCode)) {
    results.push({
      itemId: "a11y-color-contrast",
      status: "warning",
      note: "Inline color detected — verify contrast ratio >= 4.5:1.",
    });
  }

  // a11y-alt-text
  const imgMatches = componentCode.match(/<img[^>]*>/g) ?? [];
  const imgWithoutAlt = imgMatches.filter((tag) => !/\balt=/.test(tag));
  if (imgWithoutAlt.length > 0) {
    results.push({
      itemId: "a11y-alt-text",
      status: "fail",
      note: `${imgWithoutAlt.length} <img> tag(s) missing alt attribute.`,
    });
  }

  // a11y-aria-label: icon-only buttons
  const buttonMatches = componentCode.match(/<button[^>]*>[\s\S]*?<\/button>/g) ?? [];
  for (const btn of buttonMatches) {
    const innerText = btn.replace(/<button[^>]*>/, "").replace(/<\/button>/, "").trim();
    const hasOnlyIcon = /<svg|<img|<Icon/.test(innerText) && innerText.replace(/<[^>]+>/g, "").trim() === "";
    if (hasOnlyIcon && !/aria-label=/.test(btn)) {
      results.push({
        itemId: "a11y-aria-label",
        status: "fail",
        note: "Icon-only button missing aria-label.",
      });
    }
  }

  // a11y-focus-ring
  if (/outline:\s*(?:none|0)/.test(componentCode) && !/outline:/.test(componentCode.replace(/outline:\s*(?:none|0)[^;]*;?/, ""))) {
    results.push({
      itemId: "a11y-focus-ring",
      status: "fail",
      note: "outline: none detected without a replacement focus style.",
    });
  }

  // touch-target-size: warn when button has explicit small size
  if (/width:\s*(?:\d{1,2})(?:px)?/.test(componentCode) && /height:\s*(?:\d{1,2})(?:px)?/.test(componentCode)) {
    const widthMatch = componentCode.match(/width:\s*(\d{1,2})/);
    const heightMatch = componentCode.match(/height:\s*(\d{1,2})/);
    if (widthMatch && heightMatch) {
      const w = parseInt(widthMatch[1], 10);
      const h = parseInt(heightMatch[1], 10);
      if (w < 44 || h < 44) {
        results.push({
          itemId: "touch-target-size",
          status: "warning",
          note: `Element sized ${w}x${h}px — ensure the tappable area is >= 44x44px (use padding).`,
        });
      }
    }
  }

  // perf-image-formats
  if (/<img[^>]+src=['"][^'"]+\.(?:png|jpe?g)(?:\?[^'"]*)?['"]/.test(componentCode)) {
    results.push({
      itemId: "perf-image-formats",
      status: "warning",
      note: "PNG/JPEG image detected — prefer WebP/AVIF via <picture>.",
    });
  }

  // perf-lazy-load
  const belowFoldImg = componentCode.match(/<img[^>]*>/g) ?? [];
  const missingLazy = belowFoldImg.filter((tag) => !/loading=['"]?lazy/.test(tag));
  if (missingLazy.length > 0) {
    results.push({
      itemId: "perf-lazy-load",
      status: "warning",
      note: `${missingLazy.length} <img> without loading="lazy" — add it for below-the-fold images.`,
    });
  }

  // type-base-size
  if (/font-size:\s*(?:1[0-5]px|0\.[0-9]+rem)/.test(componentCode)) {
    results.push({
      itemId: "type-base-size",
      status: "warning",
      note: "font-size below 16px detected — confirm it is intentional for a small-text context.",
    });
  }

  // type-line-height
  if (/line-height:\s*1\.[0-4]\b/.test(componentCode)) {
    results.push({
      itemId: "type-line-height",
      status: "warning",
      note: "line-height < 1.5 detected — use >= 1.5 for body text.",
    });
  }

  // anim-duration
  if (/transition(?:-duration)?:\s*\d+s/.test(componentCode)) {
    const durationMatch = componentCode.match(/transition(?:-duration)?:\s*(\d+(?:\.\d+)?)s/);
    if (durationMatch) {
      const dur = parseFloat(durationMatch[1]);
      if (dur < 0.15 || dur > 0.5) {
        results.push({
          itemId: "anim-duration",
          status: "warning",
          note: `Transition of ${dur}s is outside the 150-300ms micro-interaction range.`,
        });
      }
    }
  }

  // anim-transform-opacity
  if (/transition[^;]*\b(?:width|height|top|left|right|bottom|margin|padding)\b/.test(componentCode)) {
    results.push({
      itemId: "anim-transform-opacity",
      status: "fail",
      note: "Animating layout properties (width/height/top/left) — prefer transform/opacity.",
    });
  }

  // form-visible-labels
  const inputMatches = componentCode.match(/<input[^>]*>/g) ?? [];
  for (const input of inputMatches) {
    const hasPlaceholder = /placeholder=/.test(input);
    const hasId = /id=['"]([^'"]+)['"]/.test(input);
    if (hasPlaceholder && !hasId) {
      results.push({
        itemId: "form-visible-labels",
        status: "fail",
        note: "Input relies on placeholder without a <label> association.",
      });
    }
  }

  // chart-legend: crude check for chart libs without legend
  if (/<(?:canvas|svg)[^>]*chart/i.test(componentCode) && !/legend/i.test(componentCode)) {
    results.push({
      itemId: "chart-legend",
      status: "warning",
      note: "Chart element detected without a legend reference — verify series are labeled.",
    });
  }

  // If no issues found, report pass for the whole set's coverage
  if (results.length === 0) {
    results.push({
      itemId: "all",
      status: "pass",
      note: "No static issues detected. Confirm contrast, semantics, and behavior manually.",
    });
  }

  return results;
}
