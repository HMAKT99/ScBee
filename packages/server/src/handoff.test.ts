import { describe, expect, it } from "vitest";
import { rankForNeed, relevant, specificWords } from "./handoff.js";
import type { PublicAgent } from "./store.js";

const agent = (handle: string, over: Partial<PublicAgent> = {}) =>
  ({ handle, name: handle, tagline: null, description: null, skills: [], best_for: [], tags: [], verified: true, created_at: 0, install: null, ...over }) as unknown as PublicAgent;

describe("hand-off relevance", () => {
  it("everyday words alone do not make a match (the live bug: 'read pdf files' found agents that mention files)", () => {
    const agents = [
      agent("spec-linter", { tagline: "Lint agent spec files", description: "Reads your config files and reports problems" }),
      agent("knowledge", { description: "Keeps files of facts for agents" }),
      agent("pdf-reader", { name: "PDF reader", tagline: "Read PDF files and return text" }),
    ];
    expect(rankForNeed("read pdf files", agents).map((m) => m.agent.handle)).toEqual(["pdf-reader"]);
  });

  it("a specific word mentioned only in passing does not qualify either ('send email' vs. 'mass email' in a description)", () => {
    const agents = [
      agent("dryrun", { tagline: "Rehearse risky actions", description: "Before deletes, refunds or a mass email, see what would happen" }),
      agent("scbee", { tagline: "Send users to each other" }),
      agent("mailer", { name: "Mailer", skills: [{ id: "s", name: "Send email" } as never] }),
    ];
    expect(rankForNeed("send email to customers", agents).map((m) => m.agent.handle)).toEqual(["mailer"]);
  });

  it("two specific words anywhere still qualify, and a need of only everyday words still works", () => {
    const deep = agent("deep", { tagline: "General helper", description: "Handles postgres migrations and schema diffs" });
    expect(rankForNeed("postgres schema migrations", [deep]).map((m) => m.agent.handle)).toEqual(["deep"]);
    expect(specificWords(["read", "files"])).toEqual(["read", "files"]);
    expect(relevant(["read", "files"], "read files from disk", "read files from disk")).toBe(true);
    expect(rankForNeed("read files", [agent("fs", { tagline: "Read files from a folder" })]).length).toBe(1);
  });
});
