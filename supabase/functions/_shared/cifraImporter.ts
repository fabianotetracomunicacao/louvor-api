export interface ParsedCifra {
  content: string;
  originalKey: string | null;
}

const CHORD_PATTERN =
  /^([A-G][#b]?)(m|M|maj|min|dim|aug|sus|add|\+|°|ø|2|4|5|6|7|9|11|13|\(|\))*(\/([A-G][#b]?|[0-9]+))?$/;
const SECTION_PATTERN =
  /^(Intro|Solo|Refrão|Pré-Refrão|Pre-Refrão|Pre-Chorus|Chorus|Ponte|Bridge|Final|Outro|Parte\s*\d+|Primeira\s+Parte|Segunda\s+Parte|Terceira\s+Parte|Vocal|Instrumental|Interlúdio|Tag)$/i;

function isChord(token: string): boolean {
  return CHORD_PATTERN.test(token);
}

function preCleanSlashes(line: string): string {
  return line.replace(/\s*\/\s*/g, "/");
}

function mergeSeparatedChords(line: string): string {
  let previous = "";
  let current = line;

  while (previous !== current) {
    previous = current;
    const tokens = current.split(/(\s+)/);
    const merged: string[] = [];

    for (const token of tokens) {
      if (token.trim() && merged.length >= 2) {
        const separator = merged[merged.length - 1];
        const preceding = merged[merged.length - 2];
        if (preceding.trim() && !separator.trim()) {
          const combined = preceding + token;
          if (isChord(combined) && (!isChord(preceding) || !isChord(token))) {
            merged.pop();
            merged.pop();
            merged.push(combined);
            continue;
          }
        }
      }
      merged.push(token);
    }

    current = merged.join("");
  }

  return current;
}

function isSectionHeader(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^\[.*\]$/.test(trimmed) || /^[\p{L}\p{N}\s]+:$/u.test(trimmed)) {
    return true;
  }
  return SECTION_PATTERN.test(trimmed);
}

function isTabLine(line: string): boolean {
  const trimmed = line.trim();
  return /^[A-Ga-g]\|/.test(trimmed) || (trimmed.match(/-/g) || []).length > 2;
}

function isChordLine(line: string): boolean {
  let trimmed = line.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    trimmed = trimmed.slice(1, -1).trim();
  }

  const tokens = mergeSeparatedChords(preCleanSlashes(trimmed)).split(/\s+/);
  const validTokens = tokens.filter((token) =>
    /^\[.*\]$/.test(token) ||
    /^\(.*\)$/.test(token) ||
    isSectionHeader(token) ||
    isChord(token)
  );

  return validTokens.length / tokens.length >= 0.5;
}

function mergeChordsAndLyrics(chordLine: string, lyricLine: string): string {
  let result = /^\(\s*\)$/.test(lyricLine.trim()) ? "" : lyricLine;
  const chords = [...chordLine.matchAll(/\S+/g)]
    .map((match) => ({ text: match[0], index: match.index ?? 0 }))
    .sort((left, right) => right.index - left.index);

  for (const { text, index } of chords) {
    if (index > result.length) result = result.padEnd(index, " ");
    const chord = text.startsWith("[") ? text : `[${text}]`;
    result = result.slice(0, index) + chord + result.slice(index);
  }

  return result;
}

function formatChordsOnlyLine(line: string): string {
  return line.replace(/\S+/g, (token) => {
    if (token.startsWith("[")) return token;
    const clean = token.replace(/[:.,;)]+$/, "");
    if (
      isChord(clean) ||
      isChord(token) ||
      /^\(.*\)$/.test(token) ||
      /^\[.*\]$/.test(token) ||
      token.endsWith(":") ||
      isSectionHeader(token)
    ) {
      return `[${token}]`;
    }
    return token;
  });
}

function keyFromChordLine(line: string): string | null {
  const chord = line.match(
    /(?:^|\s)([A-G][#b]?)(m)?(?:maj|min|dim|aug|sus|add|\+|°|ø|2|4|5|6|7|9|11|13)*(?:\/[^\s]+)?(?=\s|$)/,
  );
  return chord ? `${chord[1]}${chord[2] || ""}` : null;
}

export function parseCifraClub(lines: string[]): ParsedCifra {
  const output: string[] = [];
  let originalKey: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("{c:") || trimmed.startsWith("{comment:")) {
      output.push(line);
      continue;
    }

    if (isSectionHeader(line)) {
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        output.push(`{c: ${trimmed.slice(1, -1)}}`);
      } else {
        output.push(`{c: ${trimmed.replace(/:$/, "")}}`);
      }
      continue;
    }

    if (isChordLine(line)) {
      let workingLine = mergeSeparatedChords(preCleanSlashes(line));
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith("(") && trimmedLine.endsWith(")")) {
        const start = line.indexOf("(");
        const end = line.lastIndexOf(")");
        workingLine = line.substring(0, start) +
          " " +
          line.substring(start + 1, end) +
          " " +
          line.substring(end + 1);
      }
      if (!originalKey) originalKey = keyFromChordLine(workingLine);

      const nextLine = index + 1 < lines.length ? lines[index + 1] : null;
      if (
        nextLine !== null &&
        !isChordLine(nextLine) &&
        !isSectionHeader(nextLine) &&
        !isTabLine(nextLine) &&
        nextLine.trim()
      ) {
        output.push(mergeChordsAndLyrics(workingLine, nextLine));
        index += 1;
      } else {
        output.push(formatChordsOnlyLine(workingLine));
      }
      continue;
    }

    output.push(line);
  }

  return { content: output.join("\n"), originalKey };
}
