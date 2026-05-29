const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

const DEFAULT_MAX_BYTE_SIZE = 25 * 1024 * 1024;
const DEFAULT_MAX_NODES = 200;
const DEFAULT_MAX_MESHES = 200;
const DEFAULT_MAX_ACCESSORS = 2000;
const DEFAULT_MAX_BUFFER_VIEWS = 2000;
const DEFAULT_EXTENSIONS_REQUIRED_ALLOW_LIST: readonly string[] = [];

export interface ValidatorOptions {
  format?: "glb" | "gltf";
  maxByteSize?: number;
  maxNodes?: number;
  maxMeshes?: number;
  maxAccessors?: number;
  maxBufferViews?: number;
  extensionsRequiredAllowList?: readonly string[];
}

export interface ValidatorBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface ValidatorMetadata {
  format: "glb" | "gltf";
  byteSize: number;
  vertexCount: number;
  indexCount: number;
  accessorCount: number;
  bufferViewCount: number;
  nodeCount: number;
  meshCount: number;
  bounds: ValidatorBounds | null;
  validatorVersion: "r5c-1";
}

export type ValidatorFailureReason =
  | "glb_bad_magic"
  | "glb_bad_version"
  | "glb_length_mismatch"
  | "glb_json_chunk_invalid"
  | "glb_bin_chunk_inconsistent"
  | "gltf_version_unsupported"
  | "gltf_complexity_cap_exceeded"
  | "gltf_size_cap_exceeded"
  | "gltf_extension_required_disallowed"
  | "gltf_external_image_uri_disallowed";

export type ValidatorOk = { ok: true; metadata: ValidatorMetadata };
export type ValidatorFail = { ok: false; reason: ValidatorFailureReason };
export type ValidatorResult = ValidatorOk | ValidatorFail;

export function validateGlbOrGltf(
  buffer: Buffer,
  opts: ValidatorOptions = {},
): ValidatorResult {
  try {
    const maxByteSize = opts.maxByteSize ?? DEFAULT_MAX_BYTE_SIZE;
    const maxNodes = opts.maxNodes ?? DEFAULT_MAX_NODES;
    const maxMeshes = opts.maxMeshes ?? DEFAULT_MAX_MESHES;
    const maxAccessors = opts.maxAccessors ?? DEFAULT_MAX_ACCESSORS;
    const maxBufferViews = opts.maxBufferViews ?? DEFAULT_MAX_BUFFER_VIEWS;
    const extAllow =
      opts.extensionsRequiredAllowList ?? DEFAULT_EXTENSIONS_REQUIRED_ALLOW_LIST;

    if (!buffer || !Buffer.isBuffer(buffer)) {
      return { ok: false, reason: "glb_bad_magic" };
    }

    const format: "glb" | "gltf" = opts.format === "gltf" ? "gltf" : "glb";

    let json: unknown;

    if (format === "glb") {
      if (buffer.byteLength < 12) {
        return { ok: false, reason: "glb_bad_magic" };
      }
      const magic = buffer.readUInt32LE(0);
      if (magic !== GLB_MAGIC) {
        return { ok: false, reason: "glb_bad_magic" };
      }
      const version = buffer.readUInt32LE(4);
      if (version !== 2) {
        return { ok: false, reason: "glb_bad_version" };
      }
      const totalLength = buffer.readUInt32LE(8);
      if (totalLength !== buffer.byteLength) {
        return { ok: false, reason: "glb_length_mismatch" };
      }

      if (buffer.byteLength < 20) {
        return { ok: false, reason: "glb_json_chunk_invalid" };
      }
      const jsonChunkLen = buffer.readUInt32LE(12);
      const jsonChunkType = buffer.readUInt32LE(16);
      if (jsonChunkType !== JSON_CHUNK_TYPE) {
        return { ok: false, reason: "glb_json_chunk_invalid" };
      }
      const jsonStart = 20;
      const jsonEnd = jsonStart + jsonChunkLen;
      if (jsonEnd > buffer.byteLength) {
        return { ok: false, reason: "glb_json_chunk_invalid" };
      }
      let jsonStr: string;
      try {
        jsonStr = buffer.slice(jsonStart, jsonEnd).toString("utf8");
        json = JSON.parse(jsonStr);
      } catch {
        return { ok: false, reason: "glb_json_chunk_invalid" };
      }
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        return { ok: false, reason: "glb_json_chunk_invalid" };
      }

      const jsonObj = json as Record<string, unknown>;
      const buffers = Array.isArray(jsonObj.buffers)
        ? (jsonObj.buffers as Array<Record<string, unknown>>)
        : [];
      const declaredBuffer0 = buffers[0];
      const declaredByteLength =
        declaredBuffer0 && typeof declaredBuffer0.byteLength === "number"
          ? (declaredBuffer0.byteLength as number)
          : null;
      const declaredHasUri =
        declaredBuffer0 && typeof declaredBuffer0.uri === "string";

      if (jsonEnd < buffer.byteLength) {
        if (jsonEnd + 8 > buffer.byteLength) {
          return { ok: false, reason: "glb_bin_chunk_inconsistent" };
        }
        const binChunkLen = buffer.readUInt32LE(jsonEnd);
        const binChunkType = buffer.readUInt32LE(jsonEnd + 4);
        if (binChunkType !== BIN_CHUNK_TYPE) {
          return { ok: false, reason: "glb_bin_chunk_inconsistent" };
        }
        const binStart = jsonEnd + 8;
        const binEnd = binStart + binChunkLen;
        if (binEnd > buffer.byteLength) {
          return { ok: false, reason: "glb_bin_chunk_inconsistent" };
        }
        if (declaredByteLength !== null) {
          if (
            binChunkLen < declaredByteLength ||
            binChunkLen - declaredByteLength > 3
          ) {
            return { ok: false, reason: "glb_bin_chunk_inconsistent" };
          }
        }
      } else if (
        declaredByteLength !== null &&
        declaredByteLength > 0 &&
        !declaredHasUri
      ) {
        return { ok: false, reason: "glb_bin_chunk_inconsistent" };
      }
    } else {
      try {
        json = JSON.parse(buffer.toString("utf8"));
      } catch {
        return { ok: false, reason: "glb_json_chunk_invalid" };
      }
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        return { ok: false, reason: "glb_json_chunk_invalid" };
      }
    }

    const jsonObj = json as Record<string, unknown>;
    const asset = jsonObj.asset as Record<string, unknown> | undefined;
    if (!asset || asset.version !== "2.0") {
      return { ok: false, reason: "gltf_version_unsupported" };
    }

    const nodes = Array.isArray(jsonObj.nodes)
      ? (jsonObj.nodes as Array<Record<string, unknown>>)
      : [];
    const meshes = Array.isArray(jsonObj.meshes)
      ? (jsonObj.meshes as Array<Record<string, unknown>>)
      : [];
    const accessors = Array.isArray(jsonObj.accessors)
      ? (jsonObj.accessors as Array<Record<string, unknown>>)
      : [];
    const bufferViews = Array.isArray(jsonObj.bufferViews)
      ? (jsonObj.bufferViews as Array<Record<string, unknown>>)
      : [];

    if (
      nodes.length > maxNodes ||
      meshes.length > maxMeshes ||
      accessors.length > maxAccessors ||
      bufferViews.length > maxBufferViews
    ) {
      return { ok: false, reason: "gltf_complexity_cap_exceeded" };
    }

    if (buffer.byteLength > maxByteSize) {
      return { ok: false, reason: "gltf_size_cap_exceeded" };
    }

    const extRequired = Array.isArray(jsonObj.extensionsRequired)
      ? (jsonObj.extensionsRequired as unknown[])
      : [];
    for (const ext of extRequired) {
      if (typeof ext !== "string" || !extAllow.includes(ext)) {
        return { ok: false, reason: "gltf_extension_required_disallowed" };
      }
    }

    if (Array.isArray(jsonObj.images)) {
      for (const img of jsonObj.images as Array<Record<string, unknown>>) {
        if (img && typeof img.uri === "string" && !img.uri.startsWith("data:")) {
          return { ok: false, reason: "gltf_external_image_uri_disallowed" };
        }
      }
    }

    let vertexCount = 0;
    let indexCount = 0;
    let bounds: ValidatorBounds | null = null;

    for (const mesh of meshes) {
      const primitives = Array.isArray(mesh.primitives)
        ? (mesh.primitives as Array<Record<string, unknown>>)
        : [];
      for (const prim of primitives) {
        const attrs = (prim.attributes ?? {}) as Record<string, unknown>;
        const posIdx = attrs.POSITION;
        if (typeof posIdx === "number" && accessors[posIdx]) {
          const acc = accessors[posIdx];
          if (typeof acc.count === "number") {
            vertexCount += acc.count as number;
          }
          const accMin = acc.min;
          const accMax = acc.max;
          if (
            Array.isArray(accMin) &&
            accMin.length === 3 &&
            Array.isArray(accMax) &&
            accMax.length === 3 &&
            accMin.every((n) => typeof n === "number") &&
            accMax.every((n) => typeof n === "number")
          ) {
            const minA = accMin as [number, number, number];
            const maxA = accMax as [number, number, number];
            if (!bounds) {
              bounds = {
                min: [minA[0], minA[1], minA[2]],
                max: [maxA[0], maxA[1], maxA[2]],
              };
            } else {
              bounds.min[0] = Math.min(bounds.min[0], minA[0]);
              bounds.min[1] = Math.min(bounds.min[1], minA[1]);
              bounds.min[2] = Math.min(bounds.min[2], minA[2]);
              bounds.max[0] = Math.max(bounds.max[0], maxA[0]);
              bounds.max[1] = Math.max(bounds.max[1], maxA[1]);
              bounds.max[2] = Math.max(bounds.max[2], maxA[2]);
            }
          }
        }
        const idxIdx = prim.indices;
        if (typeof idxIdx === "number" && accessors[idxIdx]) {
          const acc = accessors[idxIdx];
          if (typeof acc.count === "number") {
            indexCount += acc.count as number;
          }
        }
      }
    }

    return {
      ok: true,
      metadata: {
        format,
        byteSize: buffer.byteLength,
        vertexCount,
        indexCount,
        accessorCount: accessors.length,
        bufferViewCount: bufferViews.length,
        nodeCount: nodes.length,
        meshCount: meshes.length,
        bounds,
        validatorVersion: "r5c-1",
      },
    };
  } catch {
    return { ok: false, reason: "glb_json_chunk_invalid" };
  }
}
