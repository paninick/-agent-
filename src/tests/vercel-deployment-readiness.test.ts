import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import vercelHandler from "../../api/index";

interface VercelConfig {
  buildCommand: string;
  outputDirectory: string;
  rewrites: Array<{ source: string; destination: string }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

describe("P14 Vercel deployment readiness", () => {
  it("exports the Express app as the Vercel serverless handler", () => {
    expect(typeof vercelHandler).toBe("function");
  });

  it("routes API requests to the serverless entry and all other paths to the static app", () => {
    const config = readJson<VercelConfig>("vercel.json");

    expect(config.buildCommand).toBe("npm run build");
    expect(config.outputDirectory).toBe("dist/client");
    expect(config.rewrites).toEqual([
      { source: "/api/(.*)", destination: "/api/index" },
      { source: "/(.*)", destination: "/index.html" },
    ]);
  });

  it("includes api files in TypeScript validation", () => {
    const tsconfig = readJson<{ include: string[] }>("tsconfig.json");

    expect(tsconfig.include).toContain("api");
  });

  it("does not create project link or credential files", () => {
    const packageJson = readFileSync("package.json", "utf8");
    const vercelJson = readFileSync("vercel.json", "utf8");

    expect(packageJson).not.toContain("VERCEL_TOKEN");
    expect(vercelJson).not.toContain("VERCEL_TOKEN");
    expect(vercelJson).not.toContain("projectId");
    expect(vercelJson).not.toContain("orgId");
  });
});
