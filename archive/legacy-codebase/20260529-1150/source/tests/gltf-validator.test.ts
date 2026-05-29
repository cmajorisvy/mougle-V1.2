import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateGlbOrGltf,
  type ValidatorFailureReason,
} from "../server/services/gltf-validator";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

function buildGlb(jsonObj: unknown, binBuf?: Buffer): Buffer {
  let jsonStr = JSON.stringify(jsonObj);
  while (jsonStr.length % 4 !== 0) jsonStr += " ";
  const jsonBuf = Buffer.from(jsonStr, "utf8");
  const hasBin = !!binBuf;
  let bin = binBuf ?? Buffer.alloc(0);
  if (hasBin) {
    while (bin.byteLength % 4 !== 0) bin = Buffer.concat([bin, Buffer.alloc(1)]);
  }
  const total =
    12 + 8 + jsonBuf.byteLength + (hasBin ? 8 + bin.byteLength : 0);
  const out = Buffer.alloc(total);
  let o = 0;
  out.writeUInt32LE(GLB_MAGIC, o);
  o += 4;
  out.writeUInt32LE(2, o);
  o += 4;
  out.writeUInt32LE(total, o);
  o += 4;
  out.writeUInt32LE(jsonBuf.byteLength, o);
  o += 4;
  out.writeUInt32LE(JSON_CHUNK_TYPE, o);
  o += 4;
  jsonBuf.copy(out, o);
  o += jsonBuf.byteLength;
  if (hasBin) {
    out.writeUInt32LE(bin.byteLength, o);
    o += 4;
    out.writeUInt32LE(BIN_CHUNK_TYPE, o);
    o += 4;
    bin.copy(out, o);
  }
  return out;
}

const minimalGltfJson = { asset: { version: "2.0" } };

describe("validateGlbOrGltf — happy path", () => {
  it("validates the committed sandbox-cube.glb", () => {
    const buf = readFileSync(
      resolve(process.cwd(), "client/public/demo-assets/sandbox-cube.glb"),
    );
    const result = validateGlbOrGltf(buf);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) return;
    assert.equal(result.metadata.format, "glb");
    assert.equal(result.metadata.byteSize, buf.byteLength);
    assert.equal(result.metadata.vertexCount, 24);
    assert.equal(result.metadata.indexCount, 36);
    assert.equal(result.metadata.accessorCount, 3);
    assert.equal(result.metadata.bufferViewCount, 3);
    assert.equal(result.metadata.nodeCount, 1);
    assert.equal(result.metadata.meshCount, 1);
    assert.equal(result.metadata.validatorVersion, "r5c-1");
    assert.ok(result.metadata.bounds);
    assert.deepEqual(result.metadata.bounds!.min, [-0.5, -0.5, -0.5]);
    assert.deepEqual(result.metadata.bounds!.max, [0.5, 0.5, 0.5]);
  });
});

describe("validateGlbOrGltf — failure reasons", () => {
  function expectFail(buf: Buffer, reason: ValidatorFailureReason, opts = {}) {
    const r = validateGlbOrGltf(buf, opts);
    assert.equal(r.ok, false, `expected fail with ${reason}, got ${JSON.stringify(r)}`);
    if (!r.ok) assert.equal(r.reason, reason);
  }

  it("glb_bad_magic — wrong magic bytes", () => {
    const buf = Buffer.alloc(20);
    buf.writeUInt32LE(0x12345678, 0);
    expectFail(buf, "glb_bad_magic");
  });

  it("glb_bad_version — version != 2", () => {
    const buf = Buffer.alloc(20);
    buf.writeUInt32LE(GLB_MAGIC, 0);
    buf.writeUInt32LE(99, 4);
    buf.writeUInt32LE(20, 8);
    expectFail(buf, "glb_bad_version");
  });

  it("glb_length_mismatch — header length != buffer length", () => {
    const buf = Buffer.alloc(20);
    buf.writeUInt32LE(GLB_MAGIC, 0);
    buf.writeUInt32LE(2, 4);
    buf.writeUInt32LE(9999, 8);
    expectFail(buf, "glb_length_mismatch");
  });

  it("glb_json_chunk_invalid — wrong JSON chunk type", () => {
    const buf = Buffer.alloc(20);
    buf.writeUInt32LE(GLB_MAGIC, 0);
    buf.writeUInt32LE(2, 4);
    buf.writeUInt32LE(20, 8);
    buf.writeUInt32LE(0, 12);
    buf.writeUInt32LE(0xdeadbeef, 16);
    expectFail(buf, "glb_json_chunk_invalid");
  });

  it("glb_bin_chunk_inconsistent — bin chunk length less than declared buffer", () => {
    const json = {
      asset: { version: "2.0" },
      buffers: [{ byteLength: 1000 }],
    };
    const bin = Buffer.alloc(16);
    const buf = buildGlb(json, bin);
    expectFail(buf, "glb_bin_chunk_inconsistent");
  });

  it("gltf_version_unsupported — asset.version != '2.0'", () => {
    const buf = buildGlb({ asset: { version: "1.0" } });
    expectFail(buf, "gltf_version_unsupported");
  });

  it("gltf_complexity_cap_exceeded — too many nodes (with cap override)", () => {
    const json = {
      asset: { version: "2.0" },
      nodes: [{}, {}, {}],
    };
    const buf = buildGlb(json);
    expectFail(buf, "gltf_complexity_cap_exceeded", { maxNodes: 2 });
  });

  it("gltf_size_cap_exceeded — buffer larger than configured cap", () => {
    const buf = buildGlb(minimalGltfJson);
    expectFail(buf, "gltf_size_cap_exceeded", { maxByteSize: 10 });
  });

  it("gltf_extension_required_disallowed — extensionsRequired not empty", () => {
    const json = {
      asset: { version: "2.0" },
      extensionsRequired: ["KHR_materials_unlit"],
    };
    const buf = buildGlb(json);
    expectFail(buf, "gltf_extension_required_disallowed");
  });

  it("gltf_external_image_uri_disallowed — image has non-data URI", () => {
    const json = {
      asset: { version: "2.0" },
      images: [{ uri: "https://example.com/tex.png" }],
    };
    const buf = buildGlb(json);
    expectFail(buf, "gltf_external_image_uri_disallowed");
  });
});
