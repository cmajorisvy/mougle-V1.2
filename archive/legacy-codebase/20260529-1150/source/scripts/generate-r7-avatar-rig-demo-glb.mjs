// scripts/generate-r7-avatar-rig-demo-glb.mjs
// One-shot generator for client/public/demo-assets/avatar-rig-demo.glb
//
// Hand-rolls a minimal valid glTF 2.0 binary (GLB) file containing a
// hierarchy of 19 named joint nodes representing a simple humanoid rig in
// T-pose. There is no skinned mesh, no animation, no texture, no material.
// The R7 Avatar Rig Visual Preview page reads the node hierarchy via
// useGLTF and renders joints/bones programmatically.
//
// Hand-rolled (no three.js exporter) to keep the dependency surface zero
// for a one-shot build artifact. The output is committed to the repo so
// this script only runs when the demo asset needs to be regenerated.
//
// Usage:
//   node scripts/generate-r7-avatar-rig-demo-glb.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(HERE, "../client/public/demo-assets/avatar-rig-demo.glb");

// Joint definitions: name, translation relative to parent, parent index (-1 = root)
// Order matters: parents must come before children.
const joints = [
  { name: "Root",          t: [0, 0,    0], parent: -1 }, // 0
  { name: "Hips",          t: [0, 0.95, 0], parent: 0  }, // 1
  { name: "Spine",         t: [0, 0.15, 0], parent: 1  }, // 2
  { name: "Chest",         t: [0, 0.2,  0], parent: 2  }, // 3
  { name: "Neck",          t: [0, 0.2,  0], parent: 3  }, // 4
  { name: "Head",          t: [0, 0.15, 0], parent: 4  }, // 5
  { name: "LeftShoulder",  t: [ 0.15, 0.15, 0], parent: 3 }, // 6
  { name: "LeftUpperArm",  t: [ 0.15, 0,    0], parent: 6 }, // 7
  { name: "LeftLowerArm",  t: [ 0.25, 0,    0], parent: 7 }, // 8
  { name: "LeftHand",      t: [ 0.22, 0,    0], parent: 8 }, // 9
  { name: "RightShoulder", t: [-0.15, 0.15, 0], parent: 3 }, // 10
  { name: "RightUpperArm", t: [-0.15, 0,    0], parent: 10 }, // 11
  { name: "RightLowerArm", t: [-0.25, 0,    0], parent: 11 }, // 12
  { name: "RightHand",     t: [-0.22, 0,    0], parent: 12 }, // 13
  { name: "LeftUpperLeg",  t: [ 0.10, -0.05, 0], parent: 1 }, // 14
  { name: "LeftLowerLeg",  t: [ 0, -0.40, 0], parent: 14 }, // 15
  { name: "LeftFoot",      t: [ 0, -0.40, 0.10], parent: 15 }, // 16
  { name: "RightUpperLeg", t: [-0.10, -0.05, 0], parent: 1 }, // 17
  { name: "RightLowerLeg", t: [ 0, -0.40, 0], parent: 17 }, // 18
  { name: "RightFoot",     t: [ 0, -0.40, 0.10], parent: 18 }, // 19
];

// Build glTF nodes
const nodes = joints.map((j) => ({
  name: j.name,
  translation: j.t,
}));
// Wire children
joints.forEach((j, i) => {
  if (j.parent >= 0) {
    const p = nodes[j.parent];
    if (!p.children) p.children = [];
    p.children.push(i);
  }
});

const json = {
  asset: { version: "2.0", generator: "mougle-r7-avatar-rig-demo" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes,
  extras: {
    rigName: "MougleDemoRig",
    rigKind: "humanoid",
    jointCount: joints.length,
    pose: "t_pose",
    internalOnly: true,
  },
};

let jsonStr = JSON.stringify(json);
while (jsonStr.length % 4 !== 0) jsonStr += " ";
const jsonBuf = Buffer.from(jsonStr, "utf8");

const HEADER_LEN = 12;
const CHUNK_HDR  = 8;
const totalLen = HEADER_LEN + CHUNK_HDR + jsonBuf.byteLength;

const out = Buffer.alloc(totalLen);
let o = 0;
out.writeUInt32LE(0x46546C67, o); o += 4; // "glTF"
out.writeUInt32LE(2, o);          o += 4;
out.writeUInt32LE(totalLen, o);   o += 4;
out.writeUInt32LE(jsonBuf.byteLength, o); o += 4;
out.writeUInt32LE(0x4E4F534A, o);         o += 4; // "JSON"
jsonBuf.copy(out, o); o += jsonBuf.byteLength;

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, out);

console.log(`Wrote ${OUT_PATH} (${out.byteLength} bytes, ${joints.length} joints)`);
