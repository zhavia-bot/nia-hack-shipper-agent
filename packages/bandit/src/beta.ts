/**
 * Beta distribution helpers — log-gamma, regularized incomplete beta,
 * quantile via bisection, and Marsaglia-Tsang gamma sampler for Beta sampling.
 *
 * Algorithms taken from Numerical Recipes 3rd ed. §6.4 (continued fraction
 * for I_x(a,b)) and Marsaglia & Tsang 2000 (gamma sampler). Validate against
 * scipy.stats.beta.{cdf,ppf,rvs} when adding tests (open Q in readiness.md).
 */

const LANCZOS_G = 7;
const LANCZOS_C: readonly number[] = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

/** Log of the Gamma function via Lanczos approximation. Accurate to ~1e-15. */
export function lnGamma(z: number): number {
  if (z < 0.5) {
    // Reflection formula: Γ(z)Γ(1-z) = π / sin(πz)
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  let zz = z - 1;
  let x = LANCZOS_C[0]!;
  for (let i = 1; i < LANCZOS_G + 2; i++) {
    x += LANCZOS_C[i]! / (zz + i);
  }
  const t = zz + LANCZOS_G + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (zz + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  );
}

const CF_MAX_ITER = 200;
const CF_EPS = 1e-15;
const CF_FPMIN = 1e-300;

/**
 * Continued-fraction expansion of the regularized incomplete beta. Caller
 * is responsible for the `x < (a+1)/(a+b+2)` symmetry check before invoking.
 */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < CF_FPMIN) d = CF_FPMIN;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= CF_MAX_ITER; m++) {
    const m2 = 2 * m;
    // even step
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < CF_FPMIN) d = CF_FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < CF_FPMIN) c = CF_FPMIN;
    d = 1 / d;
    h *= d * c;
    // odd step
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < CF_FPMIN) d = CF_FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < CF_FPMIN) c = CF_FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < CF_EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b) — the Beta(a, b) CDF at x. */
export function betaCDF(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnNorm = lnGamma(a + b) - lnGamma(a) - lnGamma(b);
  const logFront = a * Math.log(x) + b * Math.log(1 - x) + lnNorm;
  const front = Math.exp(logFront);

  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/**
 * Inverse CDF of Beta(a, b) at probability p, via bisection on [0, 1].
 * 50 iterations gives ~1e-15 precision; usually converges much sooner.
 */
export function betaQuantile(a: number, b: number, p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (betaCDF(mid, a, b) < p) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-15) break;
  }
  return (lo + hi) / 2;
}

/* ------------------------- sampling ----------------------------------- */

function randomNormal(): number {
  // Box-Muller. We only need one of the two values per call.
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia-Tsang gamma sampler. Shape > 0, scale = 1. */
export function gammaSample(shape: number): number {
  if (shape < 1) {
    // Stuart's theorem: X * U^(1/shape) where X ~ Gamma(shape+1)
    return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x: number;
    let v: number;
    do {
      x = randomNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x ** 4) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Sample x ~ Beta(a, b) via Gamma(a)/(Gamma(a)+Gamma(b)). */
export function betaSample(a: number, b: number): number {
  const x = gammaSample(a);
  const y = gammaSample(b);
  return x / (x + y);
}
