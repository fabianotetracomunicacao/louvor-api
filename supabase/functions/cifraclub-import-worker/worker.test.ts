import { parseCifraClub } from "../_shared/cifraImporter.ts";
import {
  classifyUpstream,
  nextRunAt,
  normalizeIdentity,
} from "../_shared/importQueue.ts";

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
