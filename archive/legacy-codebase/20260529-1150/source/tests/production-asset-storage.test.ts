import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  putAssetBytes,
  headAsset,
  issueSignedPreviewUrl,
  __setBackendForTests,
  type ProductionAssetStorageBackend,
} from "../server/services/production-asset-storage";

interface PutCall {
  bucketName: string;
  objectName: string;
  buffer: Buffer;
}
interface SignCall {
  bucketName: string;
  objectName: string;
  ttlSeconds: number;
}

let puts: PutCall[] = [];
let signs: SignCall[] = [];
let store: Map<string, Buffer> = new Map();

const fakeBackend: ProductionAssetStorageBackend = {
  async putBytes(bucketName, objectName, buffer) {
    puts.push({ bucketName, objectName, buffer });
    store.set(`${bucketName}/${objectName}`, buffer);
  },
  async headObject(bucketName, objectName) {
    const buf = store.get(`${bucketName}/${objectName}`);
    if (!buf) return { exists: false };
    return { exists: true, byteSize: buf.byteLength };
  },
  async signGetUrl(bucketName, objectName, ttlSeconds) {
    signs.push({ bucketName, objectName, ttlSeconds });
    return `https://signed.test/${bucketName}/${objectName}?ttl=${ttlSeconds}`;
  },
  async deleteObject(bucketName, objectName) {
    const key = `${bucketName}/${objectName}`;
    const had = store.delete(key);
    return { deleted: had };
  },
};

const ORIGINAL_PRIVATE = process.env.PRIVATE_OBJECT_DIR;
const ORIGINAL_PUBLIC = process.env.PUBLIC_OBJECT_SEARCH_PATHS;

before(() => {
  process.env.PRIVATE_OBJECT_DIR = "/test-bucket/.private";
  process.env.PUBLIC_OBJECT_SEARCH_PATHS = "/test-bucket/public";
  __setBackendForTests(fakeBackend);
});

after(() => {
  if (ORIGINAL_PRIVATE === undefined) delete process.env.PRIVATE_OBJECT_DIR;
  else process.env.PRIVATE_OBJECT_DIR = ORIGINAL_PRIVATE;
  if (ORIGINAL_PUBLIC === undefined)
    delete process.env.PUBLIC_OBJECT_SEARCH_PATHS;
  else process.env.PUBLIC_OBJECT_SEARCH_PATHS = ORIGINAL_PUBLIC;
  __setBackendForTests(null);
});

beforeEach(() => {
  puts = [];
  signs = [];
  store = new Map();
});

const VALID_KEY =
  "production-assets/11111111-1111-1111-1111-111111111111.glb";
const VALID_KEY_GLTF =
  "production-assets/22222222-2222-2222-2222-222222222222.gltf";

describe("production-asset-storage / putAssetBytes", () => {
  it("rejects keys that don't match the allowed shape", async () => {
    const bad = [
      "production-assets/not-hex-uuid.glb",
      "production-assets/abc.png",
      "other-prefix/11111111-1111-1111-1111-111111111111.glb",
      "production-assets/../escape.glb",
      "production-assets/11111111-1111-1111-1111-111111111111",
      "",
    ];
    for (const key of bad) {
      await assert.rejects(
        () => putAssetBytes(key, Buffer.from("x")),
        /invalid storageKey/i,
        `expected rejection for key: ${JSON.stringify(key)}`,
      );
    }
    assert.equal(puts.length, 0);
  });

  it("refuses to write when PRIVATE_OBJECT_DIR resolves under a public search path", async () => {
    const savedPrivate = process.env.PRIVATE_OBJECT_DIR;
    const savedPublic = process.env.PUBLIC_OBJECT_SEARCH_PATHS;
    process.env.PRIVATE_OBJECT_DIR = "/test-bucket/public/oops";
    process.env.PUBLIC_OBJECT_SEARCH_PATHS = "/test-bucket/public";
    try {
      await assert.rejects(
        () => putAssetBytes(VALID_KEY, Buffer.from("x")),
        /PUBLIC_OBJECT_SEARCH_PATHS/,
      );
      assert.equal(puts.length, 0);
    } finally {
      process.env.PRIVATE_OBJECT_DIR = savedPrivate;
      process.env.PUBLIC_OBJECT_SEARCH_PATHS = savedPublic;
    }
  });

  it("writes bytes under PRIVATE_OBJECT_DIR/production-assets/ and headAsset round-trips", async () => {
    const buf = Buffer.from([1, 2, 3, 4, 5]);
    await putAssetBytes(VALID_KEY, buf);
    assert.equal(puts.length, 1);
    assert.equal(puts[0].bucketName, "test-bucket");
    assert.equal(
      puts[0].objectName,
      ".private/production-assets/11111111-1111-1111-1111-111111111111.glb",
    );

    const head = await headAsset(VALID_KEY);
    assert.deepEqual(head, { exists: true, byteSize: 5 });

    const missing = await headAsset(VALID_KEY_GLTF);
    assert.deepEqual(missing, { exists: false });
  });
});

describe("production-asset-storage / issueSignedPreviewUrl", () => {
  it("clamps TTL to 900 seconds when caller asks for more", async () => {
    const before = Date.now();
    const result = await issueSignedPreviewUrl(VALID_KEY, {
      adminUserId: "admin-1",
      ttlSeconds: 86400,
    });
    const after = Date.now();
    assert.equal(signs.length, 1);
    assert.equal(signs[0].ttlSeconds, 900);
    const expiresMs = result.expiresAt.getTime();
    assert.ok(expiresMs >= before + 900 * 1000 - 5);
    assert.ok(expiresMs <= after + 900 * 1000 + 5);
    assert.match(result.url, /^https:\/\/signed\.test\//);
  });

  it("honors smaller TTL values without raising the clamp", async () => {
    await issueSignedPreviewUrl(VALID_KEY, {
      adminUserId: "admin-2",
      ttlSeconds: 60,
    });
    assert.equal(signs[0].ttlSeconds, 60);
  });

  it("rejects invalid storageKey and missing adminUserId", async () => {
    await assert.rejects(
      () =>
        issueSignedPreviewUrl("not-a-valid-key", {
          adminUserId: "admin-1",
          ttlSeconds: 100,
        }),
      /invalid storageKey/i,
    );
    await assert.rejects(
      () =>
        issueSignedPreviewUrl(VALID_KEY, {
          adminUserId: "",
          ttlSeconds: 100,
        }),
      /adminUserId/,
    );
    await assert.rejects(
      () =>
        issueSignedPreviewUrl(VALID_KEY, {
          adminUserId: "admin-1",
          ttlSeconds: 0,
        }),
      /ttlSeconds/,
    );
  });
});
