/**
 * Time-sortable monotonic IDs. ULID-shaped without an external dep. 26 chars,
 * Crockford base32, 48-bit timestamp prefix. Sorts lexicographically by time.
 */
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function ulid(seedTime?: number): string {
  const time = seedTime ?? Date.now();
  let timePart = "";
  let t = time;
  for (let i = 0; i < 10; i++) {
    timePart = ENCODING[t % 32] + timePart;
    t = Math.floor(t / 32);
  }
  let randomPart = "";
  for (let i = 0; i < 16; i++) {
    randomPart += ENCODING[Math.floor(Math.random() * 32)];
  }
  return timePart + randomPart;
}

export function shortId(): string {
  return ulid().slice(-8).toLowerCase();
}
