#!/usr/bin/env node

import { existsSync, statSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const RENDER_DIR = join(PROJECT_ROOT, ".local/media-assets/render");

const BASE_URL = (process.env.MEDIA_E2E_BASE_URL || process.env.BASE_URL || "http://127.0.0.1:5001").replace(/\/+$/, "");
const RENDER_TIMEOUT_MS = Number(process.env.MEDIA_E2E_RENDER_TIMEOUT_MS || 180_000);
const ENABLE_PROVIDER_CALLS = process.env.MEDIA_E2E_ENABLE_PROVIDER_CALLS === "1";
const FORCE_REMOTION = process.env.MEDIA_E2E_ENABLE_REMOTION === "1";
const SKIP_REMOTION = process.env.MEDIA_E2E_ENABLE_REMOTION === "0";
const LOAD_DOTENV = process.env.MEDIA_E2E_LOAD_DOTENV === "1";
const DEFAULT_ADMIN_STORAGE_STATE = "output/playwright/auth-state-5001/admin.storage-state.json";

if (LOAD_DOTENV) {
  try {
    await import("dotenv/config");
  } catch {
    // Optional convenience only. The test still requires explicit safe inputs.
  }
}

const summary = {
  baseUrl: BASE_URL,
  startedAt: new Date().toISOString(),
  auth: { mode: null },
  source: null,
  scenePackageId: null,
  voice: { status: "not_attempted", packageId: null, providerCall: false },
  renderPlan: null,
  ffmpeg: null,
  remotion: { status: "not_attempted", reason: null },
  storage: null,
  safety: {
    checkedObjects: [],
    missingFields: [],
    forbiddenEndpointsTouched: [],
  },
  access: {
    adminAsset: null,
    publicAsset: null,
    publicPackage: null,
  },
  endedAt: null,
};

function fail(message, detail) {
  const suffix = detail ? `\n${safeJson(detail)}` : "";
  throw new Error(`${message}${suffix}`);
}

function safeJson(value) {
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === "string" && val.length > 240) return `${val.slice(0, 237)}...`;
    return val;
  }, 2);
}

function assertLocalBaseUrl() {
  const parsed = new URL(BASE_URL);
  const host = parsed.hostname;
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"]);
  if (!localHosts.has(host) && process.env.MEDIA_E2E_ALLOW_REMOTE !== "1") {
    fail("Refusing to run media render E2E against a non-local URL. Set MEDIA_E2E_ALLOW_REMOTE=1 only for a safe staging target.", {
      host,
    });
  }
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  ingest(headers) {
    const raw = typeof headers.getSetCookie === "function"
      ? headers.getSetCookie()
      : [headers.get("set-cookie")].filter(Boolean);
    for (const item of raw) {
      for (const cookie of splitSetCookieHeader(item)) {
        const first = cookie.split(";")[0];
        const eq = first.indexOf("=");
        if (eq > 0) this.cookies.set(first.slice(0, eq), first.slice(eq + 1));
      }
    }
  }

  header() {
    return Array.from(this.cookies.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
  }

  set(name, value) {
    if (name && value) this.cookies.set(String(name), String(value));
  }
}

function splitSetCookieHeader(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((v) => v.trim()).filter(Boolean);
}

const jar = new CookieJar();
let csrfToken = null;

async function api(method, path, body, opts = {}) {
  const url = new URL(path, BASE_URL).toString();
  const headers = {
    Accept: "application/json",
    ...(opts.headers || {}),
  };
  const cookie = opts.auth === false ? "" : jar.header();
  if (cookie) headers.Cookie = cookie;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) headers["x-csrf-token"] = csrfToken;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
  } catch (err) {
    fail(`Request failed: ${method} ${path}`, { message: err?.message || String(err) });
  }

  if (opts.auth !== false) jar.ingest(response.headers);
  const type = response.headers.get("content-type") || "";
  let data = null;
  let text = "";
  if (type.includes("application/json")) {
    try { data = await response.json(); } catch { data = null; }
  } else {
    text = await response.text();
  }
  if (opts.expectOk !== false && !response.ok) {
    fail(`Unexpected ${response.status} from ${method} ${path}`, data || text);
  }
  return { status: response.status, ok: response.ok, headers: response.headers, data, text };
}

async function binary(path, opts = {}) {
  const url = new URL(path, BASE_URL).toString();
  const headers = {};
  const cookie = opts.auth === false ? "" : jar.header();
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(url, { headers, redirect: "manual" });
  const contentType = response.headers.get("content-type") || "";
  const storageSource = response.headers.get("x-mougle-storage-source");
  const buffer = response.ok ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
  return { status: response.status, ok: response.ok, contentType, storageSource, buffer };
}

function assertSafetyFalse(label, value) {
  const fields = ["publicPublishing", "youtubeUpload", "socialPosting", "liveStream", "autonomousExecution"];
  const aliases = {
    socialPosting: ["socialPosting", "socialPost"],
    liveStream: ["liveStream", "liveStreaming"],
  };
  const found = {};
  const missing = [];
  for (const field of fields) {
    const keys = aliases[field] || [field];
    const present = keys.find((key) => Object.prototype.hasOwnProperty.call(value || {}, key));
    if (!present) {
      missing.push(field);
      continue;
    }
    if (value[present] !== false) {
      fail(`Safety field is not false on ${label}`, { field, actual: value[present] });
    }
    found[field] = false;
  }
  summary.safety.checkedObjects.push({ label, found });
  for (const field of missing) summary.safety.missingFields.push(`${label}.${field}`);
}

function chooseId(collection, listKey, fallback) {
  const items = Array.isArray(collection?.[listKey]) ? collection[listKey] : [];
  return items.find((item) => item?.id)?.id || fallback;
}

async function authenticateAdmin() {
  const storageStatePath = resolveStorageStatePath();
  if (storageStatePath && existsSync(storageStatePath)) {
    loadStorageStateCookies(storageStatePath);
    const csrf = await api("GET", "/api/auth/csrf-token", undefined, { expectOk: false });
    csrfToken = csrf.data?.csrfToken || null;
    const verify = await api("GET", "/api/admin/verify", undefined, { expectOk: false });
    if (verify.ok && verify.data?.isAdmin && csrfToken) {
      summary.auth.mode = "playwright_storage_state";
      return;
    }
  }

  const username = process.env.MEDIA_E2E_ADMIN_USERNAME || process.env.ADMIN_USERNAME;
  const password = process.env.MEDIA_E2E_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    fail("Missing local test admin credentials. Set MEDIA_E2E_ADMIN_USERNAME and MEDIA_E2E_ADMIN_PASSWORD, or provide a valid Playwright admin storage state.");
  }

  const csrf = await api("GET", "/api/auth/csrf-token");
  csrfToken = csrf.data?.csrfToken;
  if (!csrfToken) fail("CSRF token was not returned by the local app.");

  const login = await api("POST", "/api/admin/login", { username, password });
  if (!login.data?.success) fail("Admin login did not return success.");

  const verify = await api("GET", "/api/admin/verify");
  if (!verify.data?.isAdmin) fail("Admin session was not verified.");
  summary.auth.mode = "credentials_login";
}

function resolveStorageStatePath() {
  const requested = process.env.MEDIA_E2E_ADMIN_STORAGE_STATE || DEFAULT_ADMIN_STORAGE_STATE;
  return isAbsolute(requested) ? requested : join(PROJECT_ROOT, requested);
}

function loadStorageStateCookies(storageStatePath) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(storageStatePath, "utf8"));
  } catch {
    return;
  }
  const cookies = Array.isArray(parsed?.cookies) ? parsed.cookies : [];
  for (const cookie of cookies) {
    if (cookie?.name && cookie?.value) jar.set(cookie.name, cookie.value);
  }
}

async function selectSafeNewsSource() {
  const response = await api("GET", "/api/news/updates?limit=1", undefined, { expectOk: false, auth: false });
  const item = response.ok && Array.isArray(response.data?.items) ? response.data.items[0] : null;
  if (item) {
    summary.source = {
      status: "published_news_item_selected",
      title: item.title || null,
      sourceName: item.sourceName || null,
      publishedAt: item.publishedAt || null,
    };
    return item;
  }
  const synthetic = {
    title: "Local render baseline verification",
    summaryExcerpt: "Internal-only synthetic newsroom source used when no published item is available locally.",
    sourceName: "Mougle Local E2E",
    canonicalUrl: "local://media-render-baseline-check",
    categoryTags: ["internal"],
    developingLabel: null,
  };
  summary.source = { status: "synthetic_source_used", title: synthetic.title };
  return synthetic;
}

async function createScenePackage(newsItem) {
  const [characters, visualAssets, stylePresets, sceneTemplates] = await Promise.all([
    api("GET", "/api/admin/media-characters").then((r) => r.data),
    api("GET", "/api/admin/media-visual-assets").then((r) => r.data),
    api("GET", "/api/admin/media-style-presets").then((r) => r.data),
    api("GET", "/api/admin/media-scene-templates").then((r) => r.data),
  ]);

  const characterId = chooseId(characters, "characters", "mougle_brickston");
  const backgroundAssetId = chooseId(visualAssets, "assets", "mougle_newsroom_master");
  const stylePresetId = chooseId(stylePresets, "presets", "mougle_brick_newsroom_v1");
  const sceneTemplateId = chooseId(sceneTemplates, "templates", "top_story_breakdown");
  const title = String(newsItem.title || "Local render baseline verification").slice(0, 110);
  const summaryText = String(newsItem.summaryExcerpt || "Internal-only verification of the Mougle media render baseline.").slice(0, 220);

  const sceneData = {
    status: "approved_for_preview",
    sourceItemId: newsItem.canonicalUrl || "local-media-render-baseline-source",
    sourceType: "news_item_or_safe_synthetic",
    sceneTemplateId,
    stylePresetId,
    characterId,
    targetFormat: "news_clip",
    backgroundAssetId,
    shotType: "wide",
    sceneTitle: title,
    onScreenText: title,
    subheadline: summaryText,
    lowerThirdText: "Internal render baseline check",
    tickerHint: "Mougle internal preview only | no upload | no public publishing | manual approval required",
    confidenceLabel: "INTERNAL",
    authorityTier: "internal_test",
    sourceReferences: [newsItem.sourceName, newsItem.canonicalUrl].filter(Boolean).join(" | "),
    voiceoverSegment: [
      "This is an internal Mougle render baseline verification.",
      title,
      "The preview is generated locally for admin review only and is not published anywhere.",
    ].join(" "),
    estimatedDuration: 5,
    inferred: {
      lowerThirdType: "general_news_lower_third",
      storySummary: summaryText,
      dataPanelMode: "stat_card",
      panelModules: ["source_verification", "story_context"],
      topStories: [
        title,
        "Admin-only preview asset access is verified.",
      ],
      timeline: [
        {
          segmentId: "intro",
          startSec: 0,
          endSec: 2.5,
          label: "Intro",
          activePanels: ["source_verification"],
          voiceoverHint: "intro",
          lowerThirdMode: "general_news",
        },
        {
          segmentId: "context",
          startSec: 2.5,
          endSec: 5,
          label: "Context",
          activePanels: ["story_context"],
          voiceoverHint: "context",
          lowerThirdMode: "general_news",
        },
      ],
    },
  };

  const created = await api("POST", "/api/admin/media-packages/scene", { data: sceneData });
  assertSafetyFalse("scene_create_response.safety", created.data?.safety || {});
  const pkg = created.data?.package;
  if (!pkg?.id) fail("Scene package was not created.", created.data);
  summary.scenePackageId = pkg.id;

  const blocked = await api("GET", `/api/admin/media-packages/scene/${pkg.id}`, undefined, {
    auth: false,
    expectOk: false,
  });
  summary.access.publicPackage = blocked.status;
  if (blocked.status === 200) fail("Unauthenticated package access was not blocked.");
  return pkg;
}

async function attachOrGenerateVoice(scenePackage) {
  const voices = await api("GET", "/api/admin/media-packages/voice?limit=25", undefined, { expectOk: false });
  if (voices.ok) {
    const voicePackage = voices.data?.items?.find((item) => item?.data?.audioRef);
    if (voicePackage) {
      await api("PATCH", `/api/admin/media-packages/scene/${scenePackage.id}`, {
        data: {
          voicePackage: {
            audioRef: voicePackage.data.audioRef,
            provider: voicePackage.data.providerId || voicePackage.data.provider || "existing_local_voice_package",
          },
        },
      });
      summary.voice = { status: "existing_voice_attached", packageId: voicePackage.id, providerCall: false };
      return voicePackage.id;
    }
  }

  if (!ENABLE_PROVIDER_CALLS) {
    summary.voice = {
      status: "skipped_provider_call_disabled",
      packageId: null,
      providerCall: false,
    };
    return null;
  }

  const tts = await api("POST", "/api/admin/media-tts/generate", {
    sceneId: scenePackage.id,
    text: scenePackage.data?.voiceoverSegment || "Mougle internal preview render check.",
    savePackage: true,
  }, { expectOk: false });

  if (!tts.ok) {
    summary.voice = {
      status: `provider_unavailable_${tts.status}`,
      packageId: null,
      providerCall: true,
    };
    return null;
  }
  assertSafetyFalse("tts_response.safety", tts.data?.safety || {});
  const voicePackage = tts.data?.voicePackage;
  if (voicePackage?.id && voicePackage?.data?.audioRef) {
    await api("PATCH", `/api/admin/media-packages/scene/${scenePackage.id}`, {
      data: {
        voicePackage: {
          audioRef: voicePackage.data.audioRef,
          provider: "openai_tts_adapter",
        },
      },
    });
    summary.voice = { status: "generated", packageId: voicePackage.id, providerCall: true };
    return voicePackage.id;
  }
  summary.voice = { status: "generated_without_package", packageId: null, providerCall: true };
  return null;
}

async function generateRenderPlan(sceneId) {
  const response = await api("POST", "/api/admin/media-render-plans/generate", { sceneId, format: "16x9" });
  assertSafetyFalse("render_plan_response.safety", response.data?.safety || {});
  const plan = response.data?.plan;
  if (!plan?.renderPlanId) fail("Render plan was not generated.", response.data);
  assertSafetyFalse("render_plan", plan);
  if (plan.renderReadiness === "blocked") fail("Render plan is blocked.", { missingAssets: plan.missingAssets });
  summary.renderPlan = {
    id: plan.renderPlanId,
    readiness: plan.renderReadiness,
    layers: Array.isArray(plan.layers) ? plan.layers.length : 0,
    durationSec: plan.durationSec,
    captionTracks: Array.isArray(plan.captionTracks) ? plan.captionTracks.length : 0,
  };
  return plan;
}

async function renderFfmpeg(sceneId, voicePackageId) {
  const queued = await api("POST", "/api/admin/media-render/ffmpeg/generate", {
    sceneId,
    format: "16x9",
    ...(voicePackageId ? { voicePackageId } : {}),
  });
  assertSafetyFalse("ffmpeg_queue.safety", queued.data?.safety || {});
  const job = await pollJob(queued.data?.statusUrl, "ffmpeg");
  const result = job.result;
  if (!result?.outputRef || !result.outputFile) fail("FFmpeg render completed without an output file.", job);
  assertSafetyFalse("ffmpeg_status.safety", job.safety || {});
  assertSafetyFalse("ffmpeg_result.safety", result.safety || {});
  await verifyRenderedAsset("ffmpeg", result);
  summary.ffmpeg = {
    status: job.status,
    outputFile: result.outputFile,
    outputRef: result.outputRef,
    captionsRef: result.captionsRef || null,
    fileSize: result.fileSize,
    voiceStatus: result.voiceStatus,
    storage: result.storage || null,
    persistence: result.persistence?.status || null,
  };
  return result;
}

async function maybeRenderRemotion(sceneId, voicePackageId) {
  if (SKIP_REMOTION) {
    summary.remotion = { status: "skipped", reason: "MEDIA_E2E_ENABLE_REMOTION=0" };
    return null;
  }

  const plugins = await api("GET", "/api/admin/media-plugins?category=renderer", undefined, { expectOk: false });
  const remotion = plugins.data?.plugins?.find((plugin) => plugin.id === "remotion_renderer_adapter");
  const shouldRun = FORCE_REMOTION || (remotion?.adapterImplemented && remotion.status === "configured");
  if (!shouldRun) {
    summary.remotion = {
      status: "skipped",
      reason: remotion
        ? `adapter status: ${remotion.status}`
        : "remotion renderer adapter not listed",
    };
    return null;
  }

  const queued = await api("POST", "/api/admin/media-render/remotion/generate", {
    sceneId,
    format: "16x9",
    ...(voicePackageId ? { voicePackageId } : {}),
  }, { expectOk: false });

  if (!queued.ok) {
    if (FORCE_REMOTION || remotion?.status === "configured") {
      fail("Remotion renderer was selected but could not be queued.", {
        status: queued.status,
        response: queued.data,
      });
    }
    summary.remotion = { status: "skipped", reason: `queue returned ${queued.status}` };
    return null;
  }

  assertSafetyFalse("remotion_queue.safety", queued.data?.safety || {});
  const job = await pollJob(queued.data?.statusUrl, "remotion");
  const result = job.result;
  if (!result?.outputRef || !result.outputFile) fail("Remotion render completed without an output file.", job);
  assertSafetyFalse("remotion_status.safety", job.safety || {});
  assertSafetyFalse("remotion_result.safety", result.safety || {});
  await verifyRenderedAsset("remotion", result);
  summary.remotion = {
    status: job.status,
    outputFile: result.outputFile,
    outputRef: result.outputRef,
    captionsRef: result.captionsRef || null,
    fileSize: result.fileSize,
    voiceStatus: result.voiceStatus,
    storage: result.storage || null,
    persistence: result.persistence?.status || null,
  };
  return result;
}

async function pollJob(statusUrl, label) {
  if (!statusUrl) fail(`${label} render did not return a status URL.`);
  const deadline = Date.now() + RENDER_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    const response = await api("GET", statusUrl);
    last = response.data;
    if (last?.safety) assertSafetyFalse(`${label}_poll.safety`, last.safety);
    if (last?.status === "done") return last;
    if (last?.status === "failed" || last?.status === "cancelled") {
      fail(`${label} render did not complete.`, last);
    }
    await delay(1500);
  }
  fail(`${label} render timed out.`, last);
}

async function verifyRenderedAsset(label, result) {
  const file = basename(String(result.outputFile || ""));
  const localPath = join(RENDER_DIR, file);
  if (!existsSync(localPath)) fail(`${label} local MP4 output does not exist.`, { localPath });
  const stat = statSync(localPath);
  if (stat.size < 1024) fail(`${label} local MP4 output is too small to be valid.`, { size: stat.size });
  const head = readFileSync(localPath, { encoding: null }).subarray(0, 256);
  if (!head.includes(Buffer.from("ftyp"))) fail(`${label} MP4 does not contain an ftyp header near the start.`);

  const adminAsset = await binary(result.outputRef);
  if (!adminAsset.ok) fail(`${label} admin asset stream failed.`, { status: adminAsset.status });
  if (!adminAsset.contentType.includes("video/mp4")) fail(`${label} admin asset did not return video/mp4.`, { contentType: adminAsset.contentType });
  if (!adminAsset.buffer.subarray(0, 256).includes(Buffer.from("ftyp"))) fail(`${label} streamed MP4 is not playable enough to identify.`);

  const publicAsset = await binary(result.outputRef, { auth: false });
  summary.access.adminAsset = adminAsset.status;
  summary.access.publicAsset = publicAsset.status;
  if (publicAsset.status === 200) fail(`${label} asset was reachable without admin auth.`);

  if (result.captionsRef) {
    const captions = await binary(result.captionsRef);
    if (!captions.ok) fail(`${label} captions asset could not be read by admin.`, { status: captions.status });
    const captionText = captions.buffer.toString("utf8");
    if (!captionText.includes("-->")) fail(`${label} captions do not look like SRT.`);
    const publicCaptions = await binary(result.captionsRef, { auth: false });
    if (publicCaptions.status === 200) fail(`${label} captions were reachable without admin auth.`);
  }
}

async function readStorageAndSafety() {
  const [storage, overview] = await Promise.all([
    api("GET", "/api/admin/media-storage/status", undefined, { expectOk: false }),
    api("GET", "/api/admin/media-pipeline/overview", undefined, { expectOk: false }),
  ]);
  if (storage.ok) {
    assertSafetyFalse("storage_status.safety", storage.data?.safety || {});
    summary.storage = {
      status: storage.data?.status || null,
      driver: storage.data?.driver || null,
      publicSafe: storage.data?.publicSafe ?? null,
    };
  }
  if (overview.ok) {
    assertSafetyFalse("pipeline_overview.safety", overview.data?.safety || {});
  }
}

function assertNoForbiddenExecution() {
  if (summary.safety.forbiddenEndpointsTouched.length) {
    fail("Forbidden publishing endpoint was touched.", summary.safety.forbiddenEndpointsTouched);
  }
}

function assertSafetyCoverage() {
  const fields = ["publicPublishing", "youtubeUpload", "socialPosting", "liveStream", "autonomousExecution"];
  for (const field of fields) {
    const covered = summary.safety.checkedObjects.some((entry) => entry.found?.[field] === false);
    if (!covered) fail("Safety field was never verified as false.", { field });
  }
}

async function main() {
  assertLocalBaseUrl();
  await authenticateAdmin();
  const news = await selectSafeNewsSource();
  const scene = await createScenePackage(news);
  const voicePackageId = await attachOrGenerateVoice(scene);
  await generateRenderPlan(scene.id);
  await renderFfmpeg(scene.id, voicePackageId);
  await maybeRenderRemotion(scene.id, voicePackageId);
  await readStorageAndSafety();
  assertSafetyCoverage();
  assertNoForbiddenExecution();

  summary.endedAt = new Date().toISOString();
  console.log("Media render baseline E2E passed.");
  console.log(safeJson(summary));
}

main().catch((err) => {
  summary.endedAt = new Date().toISOString();
  console.error("Media render baseline E2E failed.");
  console.error(err?.message || String(err));
  console.error(safeJson(summary));
  process.exit(1);
});
