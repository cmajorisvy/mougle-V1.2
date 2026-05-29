const PERM = new Uint8Array(512);
const GRAD3 = [
  [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
  [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
  [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1],
];

(function init() {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function dot3(g: number[], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z;
}

export function noise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255;
  const Y = Math.floor(y) & 255;
  const Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x), v = fade(y), w = fade(z);
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;

  const lerp = (t: number, a: number, b: number) => a + t * (b - a);

  return lerp(w,
    lerp(v,
      lerp(u, dot3(GRAD3[PERM[AA] % 12], x, y, z),
              dot3(GRAD3[PERM[BA] % 12], x - 1, y, z)),
      lerp(u, dot3(GRAD3[PERM[AB] % 12], x, y - 1, z),
              dot3(GRAD3[PERM[BB] % 12], x - 1, y - 1, z))),
    lerp(v,
      lerp(u, dot3(GRAD3[PERM[AA + 1] % 12], x, y, z - 1),
              dot3(GRAD3[PERM[BA + 1] % 12], x - 1, y, z - 1)),
      lerp(u, dot3(GRAD3[PERM[AB + 1] % 12], x, y - 1, z - 1),
              dot3(GRAD3[PERM[BB + 1] % 12], x - 1, y - 1, z - 1))));
}

export function fbm(x: number, y: number, z: number, octaves: number = 3): number {
  let val = 0, amp = 0.5, freq = 1;
  for (let i = 0; i < octaves; i++) {
    val += amp * noise3D(x * freq, y * freq, z * freq);
    amp *= 0.5;
    freq *= 2;
  }
  return val;
}
