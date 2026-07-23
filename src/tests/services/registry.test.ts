import { describe, expect, it } from "vitest";
import { InMemoryRegistry } from "../../services/registry";
import type { RegistryItem } from "../../domain/common";

type TestItem = RegistryItem & { label: string };

function makeItem(id: string, label?: string, enabled = true): TestItem {
  return { id, enabled, label: label ?? id };
}

describe("InMemoryRegistry", () => {
  it("register adds item and get returns it", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    const item = makeItem("a", "Alpha");
    const result = reg.register(item);

    expect(result.ok).toBe(true);
    expect(result.data).toBe(item);
    expect(reg.get("a")).toBe(item);
  });

  it("register rejects duplicate with structured error", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    reg.register(makeItem("a"));

    const result = reg.register(makeItem("a"));
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("REGISTRY_DUPLICATE_ID");
    expect(result.error!.message).toContain("TestReg");
    expect(result.error!.message).toContain("a");
  });

  it("get returns undefined for non-existent id", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    expect(reg.get("missing")).toBeUndefined();
  });

  it("require returns ok for existing item", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    const item = makeItem("a");
    reg.register(item);

    const result = reg.require("a");
    expect(result.ok).toBe(true);
    expect(result.data).toBe(item);
  });

  it("require returns error for missing item with recoverable flag", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    const result = reg.require("missing");

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.code).toBe("REGISTRY_ITEM_NOT_FOUND");
    expect(result.error!.recoverable).toBe(true);
    expect(result.error!.fallback).toBeDefined();
  });

  it("list returns all registered items", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    reg.register(makeItem("a"));
    reg.register(makeItem("b"));
    reg.register(makeItem("c"));

    expect(reg.list().length).toBe(3);
    expect(reg.list().map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("enabled returns only items with enabled=true", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    reg.register(makeItem("a", undefined, true));
    reg.register(makeItem("b", undefined, false));
    reg.register(makeItem("c", undefined, true));

    const enabled = reg.enabled();
    expect(enabled.length).toBe(2);
    expect(enabled.map((i) => i.id)).toEqual(["a", "c"]);
  });

  it("delete removes item and returns true", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    reg.register(makeItem("a"));
    reg.register(makeItem("b"));

    expect(reg.delete("a")).toBe(true);
    expect(reg.get("a")).toBeUndefined();
    expect(reg.list().length).toBe(1);
  });

  it("delete returns false for non-existent id", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    expect(reg.delete("missing")).toBe(false);
  });

  it("clear empties the registry", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    reg.register(makeItem("a"));
    reg.register(makeItem("b"));

    reg.clear();
    expect(reg.list().length).toBe(0);
    expect(reg.enabled().length).toBe(0);
    expect(reg.get("a")).toBeUndefined();
  });

  it("fresh registry has empty list", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    expect(reg.list()).toEqual([]);
    expect(reg.enabled()).toEqual([]);
  });

  it("supports re-registration after delete", () => {
    const reg = new InMemoryRegistry<TestItem>("TestReg");
    reg.register(makeItem("a", "First"));
    reg.delete("a");

    const item = makeItem("a", "Second");
    const result = reg.register(item);
    expect(result.ok).toBe(true);
    expect(reg.get("a")?.label).toBe("Second");
  });
});