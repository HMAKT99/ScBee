import { isIP } from "node:net";

function v4Private(parts: number[]): boolean {
  const [a, b] = parts as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function expandV6(ip: string): number[] | null {
  let s = ip.split("%")[0]!.toLowerCase();
  const v4tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4tail) {
    const p = v4tail[1]!.split(".").map(Number);
    if (p.some((n) => n > 255)) return null;
    s = s.slice(0, -v4tail[1]!.length) + ((p[0]! << 8) | p[1]!).toString(16) + ":" + ((p[2]! << 8) | p[3]!).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/** True when the address is not a public unicast address. Unparseable input counts as private. */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return v4Private(ip.split(".").map(Number));
  if (kind === 6) {
    const g = expandV6(ip);
    if (!g) return true;
    const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
    if (g.every((x) => x === 0)) return true; // ::
    if (g.slice(0, 7).every((x) => x === 0) && g7 === 1) return true; // ::1
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) // ::ffff:a.b.c.d
      return v4Private([g6 >> 8, g6 & 255, g7 >> 8, g7 & 255]);
    if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) // ::a.b.c.d (deprecated)
      return true;
    if (g0 === 0x64 && g1 === 0xff9b) return true; // NAT64
    if ((g0 & 0xfe00) === 0xfc00) return true; // unique local
    if ((g0 & 0xffc0) === 0xfe80) return true; // link-local
    if ((g0 & 0xff00) === 0xff00) return true; // multicast
    if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
    return false;
  }
  return true;
}
