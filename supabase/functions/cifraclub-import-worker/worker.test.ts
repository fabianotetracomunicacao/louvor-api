import { parseCifraClub } from "../_shared/cifraImporter.ts";
import {
  classifyUpstream,
  nextRunAt,
  normalizeIdentity,
} from "../_shared/importQueue.ts";
import {
  createHandler,
  createProductionRuntime,
  type ImportClaim,
  processClaim,
  type ProcessResult,
  type ProductionConfig,
  runOne,
  type WorkerDeps,
} from "./index.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (actual !== expected) {
    throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertMatch(actual: string, expected: RegExp): void {
  if (!expected.test(actual)) {
    throw new Error(`Expected ${actual} to match ${expected}`);
  }
}

function assertJsonEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`Expected ${expectedJson}, got ${actualJson}`);
  }
}

const fixtureClaim: ImportClaim = {
  jobId: "job-1",
  artistName: "Artista do catálogo",
  artistSlug: "artista",
  createdBy: "user-1",
  itemId: "item-1",
  songName: "Canção",
  songSlug: "cancao",
  attempts: 1,
  claimToken: "claim-1",
  needsDiscovery: false,
};

function workerDeps(
  overrides: Partial<WorkerDeps> = {},
): WorkerDeps {
  return {
    fetchCatalog: async () => ({
      status: 200,
      body: "{}",
      data: {
        artist: { name: "Artista canônico", slug: "artista" },
        songs: [],
      },
    }),
    saveDiscovery: async () => undefined,
    failDiscovery: async (_claim, reason) => ({ status: "failed", reason }),
    findSlugDuplicate: async () => null,
    fetchCifra: async () => ({
      status: 200,
      body: "{}",
      data: {
        name: "Canção",
        artist: "Artista canônico",
        cifra: ["G       D", "Deus de promessas"],
        cifraclub_url: "https://www.cifraclub.com.br/artista/cancao",
        youtube_url: "https://www.youtube.com/watch?v=video",
        style: "Gospel",
      },
    }),
    findCanonicalDuplicate: async () => null,
    insertSong: async () => ({ id: "song-1" }),
    finish: async (_claim, outcome) => ({
      status: outcome.status,
      songId: outcome.songId ?? undefined,
    }),
    pause: async (_claim, reason) => ({ status: "paused", reason }),
    now: () => new Date("2026-07-28T12:00:00.000Z"),
    random: () => 0,
    ...overrides,
  };
}

Deno.test("converte acordes sobre a letra", () => {
  const result = parseCifraClub(["G       D", "Deus de promessas"]);

  assertEquals(result.content, "[G]Deus de [D]promessas");
});

Deno.test("remove parenteses externos de linha de acordes", () => {
  const result = parseCifraClub(["(G       D)", "Deus de promessas"]);

  assertEquals(result.content, "D[G]eus de p[D]romessas");
});

Deno.test("preserva secoes e acordes isolados", () => {
  const result = parseCifraClub([
    "[Intro]",
    "G       D",
    "",
    "Refrão:",
    "C",
  ]);

  assertEquals(result.content, "{c: Intro}\n[G]       [D]\n\n{c: Refrão}\n[C]");
});

Deno.test("identidade ignora acento, caixa e pontuacao", () => {
  assertEquals(normalizeIdentity("  Além do Véu! "), "alem do veu");
  assertEquals(normalizeIdentity("  A   mesma---musica. "), "a mesma musica");
});

Deno.test("403 e captcha pausam a fila", () => {
  assertEquals(classifyUpstream(403, ""), "blocked");
  assertEquals(classifyUpstream(200, "captcha challenge"), "blocked");
});

Deno.test("classifica falhas temporarias e permanentes", () => {
  assertEquals(classifyUpstream(429, "too many requests"), "blocked");
  assertEquals(classifyUpstream(503, "upstream unavailable"), "temporary");
  assertEquals(classifyUpstream(404, "not found"), "permanent");
  assertEquals(classifyUpstream(200, ""), "permanent");
});

Deno.test("agenda a proxima execucao entre 30 e 60 segundos", () => {
  const now = new Date("2026-07-28T12:00:00.000Z");

  assertEquals(nextRunAt(now, () => 0).getTime(), now.getTime() + 30_000);
  assertEquals(nextRunAt(now, () => 0.999).getTime(), now.getTime() + 60_000);
  assertMatch(
    nextRunAt(now, () => 0.5).toISOString(),
    /2026-07-28T12:00:4[5-6]\.000Z/,
  );
});

Deno.test("titulo igual com artista diferente e importado com nomes canonicos", async () => {
  let inserted: unknown = null;
  let finishedStatus = "";
  const result = await processClaim(
    fixtureClaim,
    workerDeps({
      findCanonicalDuplicate: async (title, artist) => {
        assertEquals(title, "Canção");
        assertEquals(artist, "Outro Artista");
        return null;
      },
      fetchCifra: async () => ({
        status: 200,
        body: "{}",
        data: {
          name: "Canção",
          artist: "Outro Artista",
          cifra: ["G       D", "Deus de promessas"],
          cifraclub_url: "https://www.cifraclub.com.br/artista/cancao",
        },
      }),
      insertSong: async (payload) => {
        inserted = payload;
        return { id: "song-1" };
      },
      finish: async (claim, outcome) => {
        assertEquals(claim.claimToken, "claim-1");
        finishedStatus = outcome.status;
        return { status: outcome.status, songId: outcome.songId ?? undefined };
      },
    }),
  );

  assertEquals(result.status, "imported");
  assertEquals(finishedStatus, "imported");
  assertJsonEquals(inserted, {
    title: "Canção",
    artist: "Outro Artista",
    content: "[G]Deus de [D]promessas",
    original_key: "G",
    style: null,
    youtube_links: [],
    type: "chords",
    cifraclub_slug: "artista/cancao",
    cifraclub_url: "https://www.cifraclub.com.br/artista/cancao",
    is_official: false,
    created_by: "user-1",
  });
});

Deno.test("slug existente e ignorado sem baixar cifra", async () => {
  let fetched = false;
  let finishSongId: string | null | undefined = "unexpected";
  const result = await processClaim(
    fixtureClaim,
    workerDeps({
      findSlugDuplicate: async () => ({ id: "existing" }),
      fetchCifra: async () => {
        fetched = true;
        throw new Error("must not fetch");
      },
      finish: async (_claim, outcome) => {
        finishSongId = outcome.songId;
        return { status: outcome.status };
      },
    }),
  );

  assertEquals(result.status, "skipped");
  assertEquals(fetched, false);
  assertEquals(finishSongId, null);
});

Deno.test("duplicata pelos nomes canonicos e ignorada depois da coleta", async () => {
  let inserted = false;
  const result = await processClaim(
    fixtureClaim,
    workerDeps({
      findCanonicalDuplicate: async () => ({ id: "canonical-existing" }),
      insertSong: async () => {
        inserted = true;
        return { id: "never" };
      },
    }),
  );

  assertEquals(result.status, "skipped");
  assertEquals(inserted, false);
});

Deno.test("conflito unico ao inserir vira skipped", async () => {
  let slugChecks = 0;
  const result = await processClaim(
    fixtureClaim,
    workerDeps({
      findSlugDuplicate: async () => {
        slugChecks += 1;
        return slugChecks === 1 ? null : { id: "racing-import" };
      },
      insertSong: async () => {
        throw { code: "23505", message: "duplicate key value" };
      },
    }),
  );

  assertEquals(result.status, "skipped");
  assertEquals(slugChecks, 2);
});

Deno.test("403 pausa o trabalho sem finalizar o item", async () => {
  let finished = false;
  let pauseReason = "";
  const result = await processClaim(
    fixtureClaim,
    workerDeps({
      fetchCifra: async () => ({ status: 403, body: "forbidden", data: null }),
      finish: async () => {
        finished = true;
        return { status: "failed" };
      },
      pause: async (_claim, reason) => {
        pauseReason = reason;
        return { status: "paused", reason };
      },
    }),
  );

  assertEquals(result.status, "paused");
  assertEquals(finished, false);
  assertMatch(pauseReason, /403/);
});

Deno.test("descoberta salva artista canonico e agenda intervalo antes do primeiro item", async () => {
  const discoveryClaim: ImportClaim = {
    ...fixtureClaim,
    itemId: null,
    songName: null,
    songSlug: null,
    attempts: null,
    claimToken: null,
    needsDiscovery: true,
  };
  let saved: unknown = null;
  const result = await processClaim(
    discoveryClaim,
    workerDeps({
      fetchCatalog: async () => ({
        status: 200,
        body: "{}",
        data: {
          artist: { id: 10, name: "Artista Canônico", slug: "artista" },
          songs: [
            {
              artist: "Artista Canônico",
              name: "Canção",
              artist_slug: "artista",
              song_slug: "cancao",
              url: "https://www.cifraclub.com.br/artista/cancao",
            },
          ],
          total: 1,
        },
      }),
      saveDiscovery: async (_claim, discovery) => {
        saved = discovery;
      },
    }),
  );

  assertEquals(result.status, "discovered");
  assertJsonEquals(saved, {
    artistName: "Artista Canônico",
    songs: [{ name: "Canção", songSlug: "cancao" }],
    nextRunAt: "2026-07-28T12:00:30.000Z",
  });
});

Deno.test("falha permanente da descoberta libera o trabalho como failed", async () => {
  const discoveryClaim: ImportClaim = {
    ...fixtureClaim,
    itemId: null,
    songName: null,
    songSlug: null,
    attempts: null,
    claimToken: null,
    needsDiscovery: true,
  };
  let failureReason = "";
  const result = await processClaim(
    discoveryClaim,
    workerDeps({
      fetchCatalog: async () => ({
        status: 404,
        body: '{"error":"Artist not found"}',
        data: { error: "Artist not found" },
      }),
      failDiscovery: async (_claim, reason) => {
        failureReason = reason;
        return { status: "failed", reason };
      },
    }),
  );

  assertEquals(result.status, "failed");
  assertMatch(failureReason, /404/);
});

Deno.test("runOne reivindica e processa no maximo um item", async () => {
  let claims = 0;
  const result = await runOne({
    ...workerDeps(),
    claim: async () => {
      claims += 1;
      return fixtureClaim;
    },
  });

  assertEquals(result.status, "imported");
  assertEquals(claims, 1);
});

Deno.test("handler exige segredo validado antes de executar", async () => {
  let runs = 0;
  const handler = createHandler({
    validateSecret: async (secret) => secret === "vault-secret",
    run: async (): Promise<ProcessResult> => {
      runs += 1;
      return { status: "idle" };
    },
  });

  const unauthorized = await handler(
    new Request("http://localhost/functions/v1/cifraclub-import-worker", {
      method: "POST",
    }),
  );
  const authorized = await handler(
    new Request("http://localhost/functions/v1/cifraclub-import-worker", {
      method: "POST",
      headers: { "x-worker-secret": "vault-secret" },
    }),
  );

  assertEquals(unauthorized.status, 401);
  assertEquals(authorized.status, 200);
  assertEquals(runs, 1);
});

Deno.test("adaptador de producao usa RPCs, fencing e API sem rede real", async () => {
  const config: ProductionConfig = {
    supabaseUrl: "https://project.supabase.co",
    serviceRoleKey: "service-role",
    cifraApiUrl: "https://cifra.example/api",
    leaseSeconds: 120,
    now: () => new Date("2026-07-28T12:00:00.000Z"),
    random: () => 0,
  };
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ url, method, body });

    if (url.endsWith("/rpc/validate_cifraclub_import_worker_secret")) {
      return Response.json(true);
    }
    if (url.endsWith("/rpc/claim_cifraclub_import_work")) {
      return Response.json([{
        job_id: "job-1",
        artist_name: "Artista do catálogo",
        artist_slug: "artista",
        created_by: "user-1",
        item_id: "item-1",
        song_name: "Canção",
        song_slug: "cancao",
        attempts: 1,
        claim_token: "claim-1",
        needs_discovery: false,
      }]);
    }
    if (url.endsWith("/rpc/find_cifraclub_song_duplicate")) {
      return Response.json([]);
    }
    if (url === "https://cifra.example/api/artists/artista/songs/cancao") {
      return Response.json({
        name: "Canção",
        artist: "Artista Canônico",
        cifra: ["G       D", "Deus de promessas"],
        cifraclub_url: "https://www.cifraclub.com.br/artista/cancao",
      });
    }
    if (url.endsWith("/songs?select=id")) {
      return Response.json([{ id: "song-created" }], { status: 201 });
    }
    if (url.endsWith("/rpc/finish_cifraclub_import_item")) {
      return Response.json({ id: "job-1" });
    }
    return Response.json({ error: "unexpected request" }, { status: 500 });
  };
  const runtime = createProductionRuntime(config, fakeFetch);

  assertEquals(await runtime.validateSecret("vault-secret"), true);
  const result = await runOne(runtime);

  assertEquals(result.status, "imported");
  assertJsonEquals(calls.map((call) => call.url), [
    "https://project.supabase.co/rest/v1/rpc/validate_cifraclub_import_worker_secret",
    "https://project.supabase.co/rest/v1/rpc/claim_cifraclub_import_work",
    "https://project.supabase.co/rest/v1/rpc/find_cifraclub_song_duplicate",
    "https://cifra.example/api/artists/artista/songs/cancao",
    "https://project.supabase.co/rest/v1/rpc/find_cifraclub_song_duplicate",
    "https://project.supabase.co/rest/v1/songs?select=id",
    "https://project.supabase.co/rest/v1/rpc/finish_cifraclub_import_item",
  ]);
  assertJsonEquals(calls[1].body, { p_lease_seconds: 120 });
  assertJsonEquals(calls[6].body, {
    p_item_id: "item-1",
    p_claim_token: "claim-1",
    p_status: "imported",
    p_song_id: "song-created",
    p_error: null,
    p_next_run_at: "2026-07-28T12:00:30.000Z",
  });
});
