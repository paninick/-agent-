// Reuse the barrel's type surface for the ESM subpath entry.
// lucide-react ships types only for the root package name; this alias makes
// the deep ESM path (used for explicit tree-shaking) type-check identically.
declare module "lucide-react/dist/esm/lucide-react.mjs" {
  export * from "lucide-react";
}
