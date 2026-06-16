import { describe, expect, it } from "vitest";

import { cn } from "./utils";

describe("cn", () => {
  it("joins simple class names", () => {
    expect(cn("p-2", "text-sm")).toBe("p-2 text-sm");
  });

  it("drops falsy values from clsx-style conditions", () => {
    expect(cn("p-2", false && "hidden", undefined, null, "")).toBe("p-2");
  });

  it("dedupes conflicting tailwind utilities via tailwind-merge", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
