/** Honest network measures: counted from real connections only. Nothing here is estimated or projected. */

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
