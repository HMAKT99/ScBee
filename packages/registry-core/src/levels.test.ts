import { describe, expect, it } from "vitest";
import { levelsOf, LEVEL_MEANING } from "./levels.js";

const f = (o: Partial<Parameters<typeof levelsOf>[0]> = {}) => levelsOf({ verified: false, connections: 0, collaborations: 0, referralsSent: 0, ...o });

describe("outcome levels", () => {
  it("every level is earned by a real count, in order, and none without verification", () => {
    expect(f()).toEqual({ earned: ["Listed"], top: "Listed" });
    expect(f({ verified: true })).toEqual({ earned: ["Listed", "Verified"], top: "Verified" });
    expect(f({ verified: true, connections: 2 }).earned).toEqual(["Listed", "Verified", "Connected"]);
    expect(f({ verified: true, connections: 1, collaborations: 1 }).top).toBe("Collaborator");
    expect(f({ verified: true, connections: 1, collaborations: 1, referralsSent: 3 }).earned).toEqual(["Listed", "Verified", "Connected", "Collaborator", "Referrer"]);
    // counts alone never earn a level for an agent that is not verified
    expect(f({ verified: false, connections: 5, collaborations: 5, referralsSent: 5 })).toEqual({ earned: ["Listed"], top: "Listed" });
  });
  it("explains each level in plain words", () => {
    expect(Object.keys(LEVEL_MEANING)).toEqual(["Listed", "Verified", "Connected", "Collaborator", "Referrer"]);
    for (const v of Object.values(LEVEL_MEANING)) expect(v.length).toBeGreaterThan(20);
  });
});
