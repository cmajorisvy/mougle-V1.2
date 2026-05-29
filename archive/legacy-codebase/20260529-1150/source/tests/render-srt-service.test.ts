import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sep, resolve } from "path";
import {
  buildSrtFromSegments,
  srtPreviewFromText,
  isValidRenderFilename,
  localPathForRenderFilename,
} from "../server/services/render-srt-service";

describe("buildSrtFromSegments + timecode formatting", () => {
  it("emits HH:MM:SS,mmm formatted timecodes and sequential cue numbers", () => {
    const { srt, cueCount } = buildSrtFromSegments(
      [
        { segmentIndex: 0, startMs: 0, endMs: 1500, text: "hello world" },
        { segmentIndex: 1, startMs: 3_661_234, endMs: 3_662_500, text: "second cue" },
      ],
      { maxCharsPerLine: 40, maxLines: 2 },
    );
    assert.equal(cueCount, 2);
    assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\nhello world\n\n/);
    assert.match(srt, /2\n01:01:01,234 --> 01:01:02,500\nsecond cue\n$/);
  });

  it("clamps negative timestamps to zero in output", () => {
    const { srt } = buildSrtFromSegments(
      [{ segmentIndex: 0, startMs: -500, endMs: -200, text: "x" }],
      { maxCharsPerLine: 10, maxLines: 1 },
    );
    assert.match(srt, /00:00:00,000 --> 00:00:00,500/);
  });

  it("enforces 1s minimum cue duration when endMs is too close to startMs", () => {
    const { srt } = buildSrtFromSegments(
      [{ segmentIndex: 0, startMs: 0, endMs: 200, text: "short" }],
      { maxCharsPerLine: 10, maxLines: 1 },
    );
    assert.match(srt, /00:00:00,000 --> 00:00:01,000/);
  });

  it("skips empty segments and returns empty string for no cues", () => {
    const { srt, cueCount } = buildSrtFromSegments(
      [{ segmentIndex: 0, startMs: 0, endMs: 1000, text: "   " }],
      { maxCharsPerLine: 10, maxLines: 2 },
    );
    assert.equal(srt, "");
    assert.equal(cueCount, 0);
  });

  it("wraps long text into multi-line cues", () => {
    const { srt } = buildSrtFromSegments(
      [{ segmentIndex: 0, startMs: 0, endMs: 2000, text: "the quick brown fox jumps" }],
      { maxCharsPerLine: 10, maxLines: 3 },
    );
    const lines = srt.split("\n");
    assert.ok(lines.length >= 5);
  });
});

describe("srtPreviewFromText", () => {
  it("returns first N lines and total count", () => {
    const srt = Array.from({ length: 20 }, (_, i) => `line${i}`).join("\n");
    const { firstLines, lineCount } = srtPreviewFromText(srt, 5);
    assert.equal(firstLines.length, 5);
    assert.equal(lineCount, 20);
  });
});

describe("isValidRenderFilename allowlist", () => {
  it("accepts valid lowercase filenames with .srt/.mp4", () => {
    assert.equal(isValidRenderFilename("rj_1_abc123.srt"), true);
    assert.equal(isValidRenderFilename("rj_42_xyz.mp4"), true);
  });
  it("rejects path traversal", () => {
    assert.equal(isValidRenderFilename(".."), false);
    assert.equal(isValidRenderFilename("../etc/passwd"), false);
    assert.equal(isValidRenderFilename("..\\windows"), false);
  });
  it("rejects path separators", () => {
    assert.equal(isValidRenderFilename("foo/bar.srt"), false);
    assert.equal(isValidRenderFilename("foo\\bar.srt"), false);
  });
  it("rejects uppercase characters", () => {
    assert.equal(isValidRenderFilename("FILE.srt"), false);
    assert.equal(isValidRenderFilename("Mixed.mp4"), false);
  });
  it("rejects invalid extensions", () => {
    assert.equal(isValidRenderFilename("file.txt"), false);
    assert.equal(isValidRenderFilename("file.exe"), false);
    assert.equal(isValidRenderFilename("file"), false);
  });
  it("rejects non-string and empty values", () => {
    assert.equal(isValidRenderFilename("" as string), false);
    assert.equal(isValidRenderFilename(123 as unknown as string), false);
    assert.equal(isValidRenderFilename(null as unknown as string), false);
  });
  it("rejects disallowed punctuation in basename", () => {
    assert.equal(isValidRenderFilename("file-name.srt"), false);
    assert.equal(isValidRenderFilename("file name.srt"), false);
    assert.equal(isValidRenderFilename("file$.srt"), false);
  });
});

describe("captions.srt route filename guard (malicious storageKey variants)", () => {
  // Mirrors the route logic in server/routes.ts at GET
  // /api/admin/video-render/jobs/:id/captions.srt:
  //   const rawFilename = storageKey.split("/").pop() || "";
  //   if (!srtService.isValidRenderFilename(rawFilename) || !rawFilename.endsWith(".srt")) -> 400
  //   const localPath = srtService.localPathForRenderFilename(rawFilename);
  //   if (!localPath) -> 404
  const routeGuard = (storageKey: string): { status: number } => {
    const rawFilename = storageKey.split("/").pop() || "";
    if (!isValidRenderFilename(rawFilename) || !rawFilename.endsWith(".srt")) {
      return { status: 400 };
    }
    const localPath = localPathForRenderFilename(rawFilename);
    if (!localPath) return { status: 404 };
    return { status: 200 };
  };

  it("rejects path traversal storage keys", () => {
    assert.equal(routeGuard("renders/../../../etc/passwd").status, 400);
    assert.equal(routeGuard("..%2F..%2Fpasswd.srt").status, 400);
    assert.equal(routeGuard("renders/..").status, 400);
  });

  it("rejects mp4 filenames on the srt route", () => {
    assert.equal(routeGuard("renders/rj_1_abc.mp4").status, 400);
  });

  it("rejects uppercase or unusual basenames", () => {
    assert.equal(routeGuard("renders/RJ_1_ABC.srt").status, 400);
    assert.equal(routeGuard("renders/rj 1 abc.srt").status, 400);
    assert.equal(routeGuard("renders/rj-1-abc.srt").status, 400);
  });

  it("rejects empty storage key", () => {
    assert.equal(routeGuard("").status, 400);
    assert.equal(routeGuard("/").status, 400);
  });

  it("accepts a well-formed storage key (passes both guards)", () => {
    assert.equal(routeGuard("renders/rj_1_abc.srt").status, 200);
    assert.equal(routeGuard("rj_1_abc.srt").status, 200);
  });
});

describe("localPathForRenderFilename containment", () => {
  const ROOT = resolve(process.cwd(), ".local/media-assets/render");

  it("returns a path inside the render directory for valid names", () => {
    const p = localPathForRenderFilename("rj_1_abc.srt");
    assert.ok(p);
    assert.equal(p!.startsWith(`${ROOT}${sep}`), true);
    assert.equal(p, resolve(ROOT, "rj_1_abc.srt"));
  });

  it("returns null for invalid/traversal names", () => {
    assert.equal(localPathForRenderFilename("../escape.srt"), null);
    assert.equal(localPathForRenderFilename("/etc/passwd"), null);
    assert.equal(localPathForRenderFilename("foo/bar.srt"), null);
    assert.equal(localPathForRenderFilename(".."), null);
    assert.equal(localPathForRenderFilename("BAD.srt"), null);
  });
});
