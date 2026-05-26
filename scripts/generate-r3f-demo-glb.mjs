// scripts/generate-r3f-demo-glb.mjs
// One-shot generator for client/public/demo-assets/sandbox-cube.glb
//
// Hand-rolls a minimal valid glTF 2.0 binary (GLB) file containing a single
// unit cube with per-face normals so flat lighting looks correct.
//
// Why hand-rolled: keeps the dependency surface zero (no three.js exporter,
// no jsdom, no extra npm package) for a one-shot build artifact. The output
// is committed to the repo so this script only runs when the demo asset
// needs to be regenerated.
//
// Usage:
//   node scripts/generate-r3f-demo-glb.mjs
//
// Output:
//   client/public/demo-assets/sandbox-cube.glb (~ 1 KB)

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(HERE, "../client/public/demo-assets/sandbox-cube.glb");

// Cube with 24 vertices (4 per face × 6 faces), 12 triangles (36 indices).
// Per-face normals → flat shading.
const S = 0.5; // half-extent
// Face order: +X, -X, +Y, -Y, +Z, -Z
const faces = [
  { n: [ 1, 0, 0], v: [[ S,-S, S],[ S,-S,-S],[ S, S,-S],[ S, S, S]] },
  { n: [-1, 0, 0], v: [[-S,-S,-S],[-S,-S, S],[-S, S, S],[-S, S,-S]] },
  { n: [ 0, 1, 0], v: [[-S, S, S],[ S, S, S],[ S, S,-S],[-S, S,-S]] },
  { n: [ 0,-1, 0], v: [[-S,-S,-S],[ S,-S,-S],[ S,-S, S],[-S,-S, S]] },
  { n: [ 0, 0, 1], v: [[-S,-S, S],[ S,-S, S],[ S, S, S],[-S, S, S]] },
  { n: [ 0, 0,-1], v: [[ S,-S,-S],[-S,-S,-S],[-S, S,-S],[ S, S,-S]] },
];

const positions = []; // Float32  (24 * 3)
const normals   = []; // Float32  (24 * 3)
const indices   = []; // Uint16   (12 * 3)

faces.forEach((f, fi) => {
  for (const v of f.v) {
    positions.push(...v);
    normals.push(...f.n);
  }
  const base = fi * 4;
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
});

const posBuf = Buffer.from(new Float32Array(positions).buffer);
const nrmBuf = Buffer.from(new Float32Array(normals).buffer);
let idxBuf = Buffer.from(new Uint16Array(indices).buffer);

// Pad indices buffer to 4-byte alignment (glTF spec)
if (idxBuf.byteLength % 4 !== 0) {
  const pad = 4 - (idxBuf.byteLength % 4);
  idxBuf = Buffer.concat([idxBuf, Buffer.alloc(pad)]);
}

const posOffset = 0;
const nrmOffset = posOffset + posBuf.byteLength;
const idxOffset = nrmOffset + nrmBuf.byteLength;
const binTotal  = posBuf.byteLength + nrmBuf.byteLength + idxBuf.byteLength;

const json = {
  asset: { version: "2.0", generator: "mougle-r3f-sandbox-demo (R5B)" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "SandboxCube" }],
  meshes: [{
    name: "SandboxCube",
    primitives: [{
      attributes: { POSITION: 0, NORMAL: 1 },
      indices: 2,
      mode: 4, // TRIANGLES
    }],
  }],
  buffers: [{ byteLength: binTotal }],
  bufferViews: [
    { buffer: 0, byteOffset: posOffset, byteLength: posBuf.byteLength, target: 34962 },
    { buffer: 0, byteOffset: nrmOffset, byteLength: nrmBuf.byteLength, target: 34962 },
    { buffer: 0, byteOffset: idxOffset, byteLength: Buffer.from(new Uint16Array(indices).buffer).byteLength, target: 34963 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 24, type: "VEC3",
      min: [-S, -S, -S], max: [S, S, S] },
    { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
    { bufferView: 2, componentType: 5123, count: indices.length, type: "SCALAR" },
  ],
};

let jsonStr = JSON.stringify(json);
// Pad JSON chunk content with spaces to 4-byte boundary
while (jsonStr.length % 4 !== 0) jsonStr += " ";
const jsonBuf = Buffer.from(jsonStr, "utf8");

const binChunk = Buffer.concat([posBuf, nrmBuf, idxBuf]);

const HEADER_LEN = 12;
const CHUNK_HDR  = 8;
const totalLen = HEADER_LEN + CHUNK_HDR + jsonBuf.byteLength + CHUNK_HDR + binChunk.byteLength;

const out = Buffer.alloc(totalLen);
let o = 0;
// GLB header
out.writeUInt32LE(0x46546C67, o); o += 4; // "glTF"
out.writeUInt32LE(2, o);          o += 4; // version 2
out.writeUInt32LE(totalLen, o);   o += 4;
// JSON chunk
out.writeUInt32LE(jsonBuf.byteLength, o); o += 4;
out.writeUInt32LE(0x4E4F534A, o);         o += 4; // "JSON"
jsonBuf.copy(out, o); o += jsonBuf.byteLength;
// BIN chunk
out.writeUInt32LE(binChunk.byteLength, o); o += 4;
out.writeUInt32LE(0x004E4942, o);          o += 4; // "BIN\0"
binChunk.copy(out, o); o += binChunk.byteLength;

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, out);

console.log(`Wrote ${OUT_PATH} (${out.byteLength} bytes)`);
