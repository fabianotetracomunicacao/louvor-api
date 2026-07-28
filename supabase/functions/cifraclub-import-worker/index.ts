import { parseCifraClub } from "../_shared/cifraImporter.ts";
import { classifyUpstream, nextRunAt } from "../_shared/importQueue.ts";

export interface ImportClaim {
  jobId: string;
  artistName: string;
  artistSlug: string;
  createdBy: string;
  itemId: string | null;
  songName: string | null;
  songSlug: string | null;
  attempts: number | null;
  claimToken: string | null;
  needsDiscovery: boolean;
}

export interface UpstreamResponse {
  status: number;
  body: string;
  data: unknown;
}

export interface DuplicateSong {
  id: string;
}

export interface SongPayload {
  title: string;
  artist: string;
  content: string;
  original_key: string | null;
  style: string | null;
  youtube_links: string[];
  type: "chords";
  cifraclub_slug: string;
  cifraclub_url: string;
  is_official: false;
  created_by: string;
}

export interface DiscoveryPayload {
  artistName: string;
  songs: Array<{ name: string; songSlug: string }>;
  nextRunAt: string;
}

export type ProcessStatus =
  | "idle"
  | "discovered"
  | "imported"
  | "skipped"
  | "failed"
  | "paused";

export interface ProcessResult {
  status: ProcessStatus;
  songId?: string;
  existingSongId?: string;
  reason?: string;
}

export interface FinishOutcome {
  status: "imported" | "skipped" | "failed";
  songId: string | null;
  error: string | null;
  nextRunAt: string;
}

export interface WorkerDeps {
  fetchCatalog(claim: ImportClaim): Promise<UpstreamResponse>;
  saveDiscovery(
    claim: ImportClaim,
    discovery: DiscoveryPayload,
  ): Promise<void>;
  failDiscovery(
    claim: ImportClaim,
    reason: string,
  ): Promise<ProcessResult>;
  findSlugDuplicate(slug: string): Promise<DuplicateSong | null>;
  fetchCifra(claim: ImportClaim): Promise<UpstreamResponse>;
  findCanonicalDuplicate(
    title: string,
    artist: string,
  ): Promise<DuplicateSong | null>;
  insertSong(payload: SongPayload): Promise<{ id: string }>;
  finish(
    claim: ImportClaim,
    outcome: FinishOutcome,
  ): Promise<ProcessResult>;
  pause(claim: ImportClaim, reason: string): Promise<ProcessResult>;
  now(): Date;
  random(): number;
}

export interface WorkerRuntimeDeps extends WorkerDeps {
  claim(): Promise<ImportClaim | null>;
}

interface CanonicalCifra {
  title: string;
  artist: string;
  lines: string[];
  sourceUrl: string;
  youtubeLinks: string[];
  style: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  value: unknown,
  field: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Invalid upstream field: ${field}`);
  }
  return value.trim();
}

function validateCanonical(
  claim: ImportClaim,
  data: unknown,
): CanonicalCifra {
  if (!isRecord(data)) throw new Error("Invalid cifra response");

  if (
    !Array.isArray(data.cifra) ||
    !data.cifra.every((line) => typeof line === "string") ||
    data.cifra.length === 0
  ) {
    throw new Error("Invalid upstream field: cifra");
  }

  const sourceUrl = typeof data.cifraclub_url === "string" &&
      /^https?:\/\//.test(data.cifraclub_url)
    ? data.cifraclub_url
    : `https://www.cifraclub.com.br/${claim.artistSlug}/${claim.songSlug}`;
  const youtubeLinks = typeof data.youtube_url === "string" &&
      /^https?:\/\//.test(data.youtube_url)
    ? [data.youtube_url]
    : [];

  return {
    title: requiredString(data.name, "name"),
    artist: requiredString(data.artist, "artist"),
    lines: data.cifra,
    sourceUrl,
    youtubeLinks,
    style: typeof data.style === "string" && data.style.trim()
      ? data.style.trim()
      : null,
  };
}

function validateDiscovery(
  claim: ImportClaim,
  data: unknown,
  scheduledAt: Date,
): DiscoveryPayload {
  if (!isRecord(data) || !isRecord(data.artist) || !Array.isArray(data.songs)) {
    throw new Error("Invalid catalog response");
  }

  const artistName = requiredString(data.artist.name, "artist.name");
  const artistSlug = requiredString(data.artist.slug, "artist.slug");
  if (artistSlug !== claim.artistSlug) {
    throw new Error("Catalog artist does not match claim");
  }

  const songs: Array<{ name: string; songSlug: string }> = [];
  const seen = new Set<string>();
  for (const song of data.songs) {
    if (!isRecord(song) || song.artist_slug !== claim.artistSlug) continue;
    const songSlug = typeof song.song_slug === "string"
      ? song.song_slug.trim()
      : "";
    if (!/^[a-z0-9-]+$/.test(songSlug) || seen.has(songSlug)) continue;
    seen.add(songSlug);
    songs.push({
      name: requiredString(song.name, "songs.name"),
      songSlug,
    });
  }

  return {
    artistName,
    songs,
    nextRunAt: scheduledAt.toISOString(),
  };
}

function buildSongPayload(
  claim: ImportClaim,
  canonical: CanonicalCifra,
): SongPayload {
  if (!claim.songSlug) throw new Error("Item claim has no song slug");
  const parsed = parseCifraClub(canonical.lines);

  return {
    title: canonical.title,
    artist: canonical.artist,
    content: parsed.content,
    original_key: parsed.originalKey,
    style: canonical.style,
    youtube_links: canonical.youtubeLinks,
    type: "chords",
    cifraclub_slug: `${claim.artistSlug}/${claim.songSlug}`,
    cifraclub_url: canonical.sourceUrl,
    is_official: false,
    created_by: claim.createdBy,
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === "string") {
    return error.message;
  }
  return String(error);
}

function isUniqueViolation(error: unknown): boolean {
  return isRecord(error) && error.code === "23505";
}

async function finish(
  claim: ImportClaim,
  deps: WorkerDeps,
  status: FinishOutcome["status"],
  songId: string | null,
  error: string | null,
): Promise<void> {
  await deps.finish(claim, {
    status,
    songId,
    error,
    nextRunAt: nextRunAt(deps.now(), deps.random).toISOString(),
  });
}

async function processDiscovery(
  claim: ImportClaim,
  deps: WorkerDeps,
): Promise<ProcessResult> {
  let response: UpstreamResponse;
  try {
    response = await deps.fetchCatalog(claim);
  } catch (error) {
    return await deps.failDiscovery(claim, errorMessage(error));
  }
  const classification = classifyUpstream(response.status, response.body);
  if (classification === "blocked") {
    return await deps.pause(
      claim,
      `Catalog blocked with HTTP ${response.status}`,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    return await deps.failDiscovery(
      claim,
      `Catalog request failed with HTTP ${response.status}`,
    );
  }

  try {
    const discovery = validateDiscovery(
      claim,
      response.data,
      nextRunAt(deps.now(), deps.random),
    );
    await deps.saveDiscovery(claim, discovery);
    return { status: "discovered" };
  } catch (error) {
    return await deps.failDiscovery(claim, errorMessage(error));
  }
}

export async function processClaim(
  claim: ImportClaim,
  deps: WorkerDeps,
): Promise<ProcessResult> {
  if (claim.needsDiscovery) return await processDiscovery(claim, deps);
  if (!claim.itemId || !claim.songSlug || !claim.claimToken) {
    throw new Error("Invalid item claim");
  }

  const slug = `${claim.artistSlug}/${claim.songSlug}`;
  const duplicate = await deps.findSlugDuplicate(slug);
  if (duplicate) {
    await finish(claim, deps, "skipped", null, null);
    return { status: "skipped", existingSongId: duplicate.id };
  }

  let response: UpstreamResponse;
  try {
    response = await deps.fetchCifra(claim);
  } catch (error) {
    const reason = errorMessage(error);
    await finish(claim, deps, "failed", null, reason);
    return { status: "failed", reason };
  }

  const classification = classifyUpstream(response.status, response.body);
  if (classification === "blocked") {
    return await deps.pause(
      claim,
      `Cifra blocked with HTTP ${response.status}`,
    );
  }
  if (response.status < 200 || response.status >= 300) {
    const reason = `Cifra request failed with HTTP ${response.status}`;
    await finish(claim, deps, "failed", null, reason);
    return { status: "failed", reason };
  }

  let canonical: CanonicalCifra;
  try {
    canonical = validateCanonical(claim, response.data);
  } catch (error) {
    const reason = errorMessage(error);
    await finish(claim, deps, "failed", null, reason);
    return { status: "failed", reason };
  }

  const duplicateAfterFetch = await deps.findCanonicalDuplicate(
    canonical.title,
    canonical.artist,
  );
  if (duplicateAfterFetch) {
    await finish(claim, deps, "skipped", null, null);
    return { status: "skipped", existingSongId: duplicateAfterFetch.id };
  }

  try {
    const song = await deps.insertSong(buildSongPayload(claim, canonical));
    await finish(claim, deps, "imported", song.id, null);
    return { status: "imported", songId: song.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      const racingDuplicate = await deps.findSlugDuplicate(slug);
      await finish(claim, deps, "skipped", null, null);
      return {
        status: "skipped",
        existingSongId: racingDuplicate?.id,
      };
    }

    const reason = errorMessage(error);
    await finish(claim, deps, "failed", null, reason);
    return { status: "failed", reason };
  }
}

export async function runOne(
  deps: WorkerRuntimeDeps,
): Promise<ProcessResult> {
  const claim = await deps.claim();
  return claim ? await processClaim(claim, deps) : { status: "idle" };
}

export interface HandlerDeps {
  validateSecret(secret: string): Promise<boolean>;
  run(): Promise<ProcessResult>;
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function createHandler(
  deps: HandlerDeps,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const secret = request.headers.get("x-worker-secret");
    if (!secret || !await deps.validateSecret(secret)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    try {
      return jsonResponse(await deps.run(), 200);
    } catch (error) {
      return jsonResponse({ error: errorMessage(error) }, 500);
    }
  };
}

export interface ProductionConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  cifraApiUrl: string;
  leaseSeconds?: number;
  now?: () => Date;
  random?: () => number;
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface ClaimRow {
  job_id: string;
  artist_name: string;
  artist_slug: string;
  created_by: string;
  item_id: string | null;
  song_name: string | null;
  song_slug: string | null;
  attempts: number | null;
  claim_token: string | null;
  needs_discovery: boolean;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function mapClaim(row: ClaimRow): ImportClaim {
  return {
    jobId: row.job_id,
    artistName: row.artist_name,
    artistSlug: row.artist_slug,
    createdBy: row.created_by,
    itemId: row.item_id,
    songName: row.song_name,
    songSlug: row.song_slug,
    attempts: row.attempts,
    claimToken: row.claim_token,
    needsDiscovery: row.needs_discovery,
  };
}

async function responseData(response: Response): Promise<{
  body: string;
  data: unknown;
}> {
  const body = await response.text();
  if (!body) return { body, data: null };
  try {
    return { body, data: JSON.parse(body) };
  } catch {
    return { body, data: null };
  }
}

function databaseError(status: number, data: unknown, body: string): Error {
  const error = new Error(
    isRecord(data) && typeof data.message === "string"
      ? data.message
      : `Database request failed with HTTP ${status}`,
  ) as Error & { code?: string; details?: string };
  if (isRecord(data) && typeof data.code === "string") error.code = data.code;
  if (isRecord(data) && typeof data.details === "string") {
    error.details = data.details;
  } else if (body) {
    error.details = body;
  }
  return error;
}

function firstRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null;
  return isRecord(data) ? data as T : null;
}

export function createProductionRuntime(
  config: ProductionConfig,
  fetcher: FetchLike = fetch,
): WorkerRuntimeDeps & {
  validateSecret(secret: string): Promise<boolean>;
} {
  const supabaseUrl = trimTrailingSlash(config.supabaseUrl);
  const cifraApiUrl = trimTrailingSlash(config.cifraApiUrl);
  const restUrl = `${supabaseUrl}/rest/v1`;
  const leaseSeconds = config.leaseSeconds ?? 120;
  const databaseHeaders = {
    apikey: config.serviceRoleKey,
    authorization: `Bearer ${config.serviceRoleKey}`,
    "content-type": "application/json",
  };

  async function databaseRequest(
    path: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const response = await fetcher(`${restUrl}/${path}`, {
      method: "POST",
      headers: { ...databaseHeaders, ...headers },
      body: JSON.stringify(body),
    });
    const parsed = await responseData(response);
    if (!response.ok) {
      throw databaseError(response.status, parsed.data, parsed.body);
    }
    return parsed.data;
  }

  async function upstreamRequest(url: string): Promise<UpstreamResponse> {
    const response = await fetcher(url, {
      headers: { accept: "application/json" },
    });
    const parsed = await responseData(response);
    return {
      status: response.status,
      body: parsed.body,
      data: parsed.data,
    };
  }

  async function findDuplicate(
    slug: string | null,
    title: string | null,
    artist: string | null,
  ): Promise<DuplicateSong | null> {
    const data = await databaseRequest(
      "rpc/find_cifraclub_song_duplicate",
      { p_slug: slug, p_title: title, p_artist: artist },
    );
    return firstRow<DuplicateSong>(data);
  }

  const runtime: WorkerRuntimeDeps & {
    validateSecret(secret: string): Promise<boolean>;
  } = {
    validateSecret: async (secret) => {
      const data = await databaseRequest(
        "rpc/validate_cifraclub_import_worker_secret",
        { p_secret: secret },
      );
      return data === true;
    },
    claim: async () => {
      const data = await databaseRequest(
        "rpc/claim_cifraclub_import_work",
        { p_lease_seconds: leaseSeconds },
      );
      const row = firstRow<ClaimRow>(data);
      return row ? mapClaim(row) : null;
    },
    fetchCatalog: (claim) =>
      upstreamRequest(
        `${cifraApiUrl}/artists/${
          encodeURIComponent(claim.artistSlug)
        }/catalog`,
      ),
    saveDiscovery: async (claim, discovery) => {
      await databaseRequest(
        "rpc/complete_cifraclub_import_discovery",
        {
          p_job_id: claim.jobId,
          p_artist_name: discovery.artistName,
          p_songs: discovery.songs.map((song) => ({
            name: song.name,
            song_slug: song.songSlug,
          })),
          p_next_run_at: discovery.nextRunAt,
        },
      );
    },
    failDiscovery: async (claim, reason) => {
      await databaseRequest(
        "rpc/fail_cifraclub_import_discovery",
        { p_job_id: claim.jobId, p_error: reason },
      );
      return { status: "failed", reason };
    },
    findSlugDuplicate: (slug) => findDuplicate(slug, null, null),
    fetchCifra: (claim) =>
      upstreamRequest(
        `${cifraApiUrl}/artists/${encodeURIComponent(claim.artistSlug)}/songs/${
          encodeURIComponent(claim.songSlug ?? "")
        }`,
      ),
    findCanonicalDuplicate: (title, artist) =>
      findDuplicate(null, title, artist),
    insertSong: async (payload) => {
      const data = await databaseRequest(
        "songs?select=id",
        payload,
        { prefer: "return=representation" },
      );
      const song = firstRow<{ id: string }>(data);
      if (!song?.id) throw new Error("Song insert returned no id");
      return song;
    },
    finish: async (claim, outcome) => {
      if (!claim.itemId || !claim.claimToken) {
        throw new Error("Cannot finish an unfenced item claim");
      }
      await databaseRequest(
        "rpc/finish_cifraclub_import_item",
        {
          p_item_id: claim.itemId,
          p_claim_token: claim.claimToken,
          p_status: outcome.status,
          p_song_id: outcome.songId,
          p_error: outcome.error,
          p_next_run_at: outcome.nextRunAt,
        },
      );
      return {
        status: outcome.status,
        songId: outcome.songId ?? undefined,
        reason: outcome.error ?? undefined,
      };
    },
    pause: async (claim, reason) => {
      await databaseRequest(
        "rpc/pause_cifraclub_import_job",
        {
          p_job_id: claim.jobId,
          p_item_id: claim.itemId,
          p_claim_token: claim.claimToken,
          p_error: reason,
        },
      );
      return { status: "paused", reason };
    },
    now: config.now ?? (() => new Date()),
    random: config.random ?? Math.random,
  };

  return runtime;
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function productionConfigFromEnv(): ProductionConfig {
  return {
    supabaseUrl: requiredEnv("SUPABASE_URL"),
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    cifraApiUrl: requiredEnv("CIFRA_API_URL"),
    leaseSeconds: 120,
  };
}

export function createProductionHandler(
  config: ProductionConfig,
  fetcher: FetchLike = fetch,
): (request: Request) => Promise<Response> {
  const runtime = createProductionRuntime(config, fetcher);
  return createHandler({
    validateSecret: runtime.validateSecret,
    run: () => runOne(runtime),
  });
}

if (import.meta.main) {
  Deno.serve(createProductionHandler(productionConfigFromEnv()));
}
