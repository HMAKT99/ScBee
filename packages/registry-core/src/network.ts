/** Honest network measures: counted from real connections only. Nothing here is estimated or projected. */

import { terms } from "./feed.js";

export interface NetNode { id: string; kind: "agent" | "project"; text: string }
export interface OverlapEdge { a: string; b: string; w: number; why: string[] }

/**
 * Edges for the living map: two nodes are linked when what they do overlaps (shared words in their listings).
 * This is similarity, not a connection anyone agreed to, and the map labels it that way. Deterministic.
 * Each node keeps at most `perNode` strongest links; two projects are never linked to each other.
 */
export function overlapEdges(nodes: NetNode[], { minShared = 2, perNode = 3 }: { minShared?: number; perNode?: number } = {}): OverlapEdge[] {
  const bag = new Map(nodes.map((n) => [n.id, terms(n.text)]));
  const all: OverlapEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i]!, b = nodes[j]!;
      if (a.kind === "project" && b.kind === "project") continue;
      const shared = [...bag.get(a.id)!].filter((t) => bag.get(b.id)!.has(t)).sort();
      if (shared.length >= minShared) all.push({ a: a.id, b: b.id, w: shared.length, why: shared.slice(0, 3) });
    }
  }
  all.sort((x, y) => y.w - x.w || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
  const deg = new Map<string, number>();
  const keep: OverlapEdge[] = [];
  for (const e of all) {
    if ((deg.get(e.a) ?? 0) >= perNode || (deg.get(e.b) ?? 0) >= perNode) continue;
    deg.set(e.a, (deg.get(e.a) ?? 0) + 1);
    deg.set(e.b, (deg.get(e.b) ?? 0) + 1);
    keep.push(e);
  }
  return keep;
}

/** A measured average is only shown once there are at least this many accepted connections. */
export const MIN_CONNECTIONS_FOR_DEGREES = 5;

/** How many different pairs of agents could be introduced to each other. A count, not a value in dollars. */
export const possibleIntroductions = (agents: number) => (agents < 2 ? 0 : (agents * (agents - 1)) / 2);

export interface Degrees {
  /** Average number of links on the shortest path, over pairs that are connected at all. Null when there is nothing to measure. */
  average: number | null;
  /** Pairs of agents that can reach each other through accepted connections. */
  reachable_pairs: number;
  total_pairs: number;
}

/** Shortest-path distances (in links) between agents, using only the accepted connections given. Breadth-first from each agent. */
export function degreesOfSeparation(nodes: number[], edges: [number, number][]): Degrees {
  const adj = new Map<number, number[]>(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) {
    if (a === b || !adj.has(a) || !adj.has(b)) continue;
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  let sum = 0, pairs = 0;
  for (const start of nodes) {
    const dist = new Map<number, number>([[start, 0]]);
    const queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i]!;
      for (const nx of adj.get(cur)!) if (!dist.has(nx)) { dist.set(nx, dist.get(cur)! + 1); queue.push(nx); }
    }
    for (const [n, d] of dist) if (n > start) { sum += d; pairs++; } // count each pair once
  }
  return { average: pairs ? Math.round((sum / pairs) * 100) / 100 : null, reachable_pairs: pairs, total_pairs: possibleIntroductions(nodes.length) };
}
