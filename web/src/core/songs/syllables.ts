/**
 * Separación en sílabas del español (para repartir la letra entre las notas sin escribir
 * guiones). Reglas ortográficas clásicas:
 *  - una consonante entre vocales va con la segunda (ca-sa);
 *  - dos consonantes se separan (can-to), salvo los grupos inseparables pl, pr, bl, br,
 *    fl, fr, cl, cr, gl, gr, dr, tr (ha-blar); ch, ll y rr cuentan como una (ca-lle);
 *  - con tres o cuatro, el grupo inseparable va con la vocal siguiente (ins-tan-te, obs-truc);
 *  - diptongo: vocal cerrada átona (i, u) junto a otra vocal (cie-lo, rei-na); hiato: dos
 *    abiertas (le-er) o una cerrada con tilde (dí-a).
 * La «u» de «que, qui, gue, gui» no es vocal; la «y» final («hoy») sí.
 */

const OPEN = 'aeoáéó';
const CLOSED = 'iuü';
const CLOSED_STRESSED = 'íú';
const VOWELS = OPEN + CLOSED + CLOSED_STRESSED;
const CLUSTERS = new Set(['pl', 'pr', 'bl', 'br', 'fl', 'fr', 'cl', 'cr', 'gl', 'gr', 'dr', 'tr', 'kl', 'kr']);

interface Unit {
  text: string;
  vowel: boolean;
}

/** Palabra → unidades (vocales y consonantes; ch, ll, rr y qu/gu+e/i como una sola). */
function units(word: string): Unit[] {
  const w = word.toLowerCase();
  const out: Unit[] = [];
  for (let i = 0; i < word.length; i++) {
    const c = w[i];
    const two = w.slice(i, i + 2);
    if (two === 'ch' || two === 'll' || two === 'rr') {
      out.push({ text: word.slice(i, i + 2), vowel: false });
      i++;
      continue;
    }
    // «que», «qui», «gue», «gui»: la u es muda y va con la consonante.
    if ((c === 'q' || c === 'g') && w[i + 1] === 'u' && 'eéií'.includes(w[i + 2] ?? '')) {
      out.push({ text: word.slice(i, i + 2), vowel: false });
      i++;
      continue;
    }
    // «y» final o entre consonantes suena como vocal («hoy», «muy»).
    const yVowel = c === 'y' && !VOWELS.includes(w[i + 1] ?? '') && i > 0;
    out.push({ text: word[i], vowel: VOWELS.includes(c) || yVowel });
  }
  return out;
}

/** ¿Se separan dos vocales seguidas (hiato)? */
function hiatus(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === 'y' || y === 'y') return false;
  if (CLOSED_STRESSED.includes(x) || CLOSED_STRESSED.includes(y)) return true;
  if (OPEN.includes(x) && OPEN.includes(y)) return true;
  return CLOSED.includes(x) && CLOSED.includes(y) && x === y; // «chiita»
}

/** Una palabra → sus sílabas («canción» → «can», «ción»). Sin vocales, la palabra entera. */
export function syllabifyWord(word: string): string[] {
  const u = units(word);
  if (!u.some((x) => x.vowel)) return [word];
  // Núcleos: tramos de vocales, partidos en los hiatos.
  const cuts: number[] = []; // índice de unidad donde empieza cada sílaba (salvo la primera)
  let i = 0;
  while (i < u.length && !u[i].vowel) i++;
  while (i < u.length) {
    // Avanza por el núcleo actual.
    let j = i;
    while (j + 1 < u.length && u[j + 1].vowel && !hiatus(u[j].text, u[j + 1].text)) j++;
    if (j + 1 < u.length && u[j + 1].vowel) {
      cuts.push(j + 1); // hiato: la sílaba siguiente empieza en la vocal
      i = j + 1;
      continue;
    }
    // Consonantes hasta la siguiente vocal.
    let k = j + 1;
    while (k < u.length && !u[k].vowel) k++;
    if (k >= u.length) break; // consonantes finales: coda de la última sílaba
    const cons = u.slice(j + 1, k).map((x) => x.text.toLowerCase());
    const n = cons.length;
    let take: number; // consonantes que van con la sílaba siguiente
    if (n <= 1) take = n;
    else if (CLUSTERS.has(cons[n - 2] + cons[n - 1])) take = 2;
    else take = 1;
    cuts.push(k - take);
    i = k;
  }
  const out: string[] = [];
  let start = 0;
  for (const c of cuts) {
    out.push(u.slice(start, c).map((x) => x.text).join(''));
    start = c;
  }
  out.push(u.slice(start).map((x) => x.text).join(''));
  return out.filter(Boolean);
}

export interface LyricToken {
  /** Sílaba tal como se muestra (con la puntuación pegada a su palabra). */
  text: string;
  /** Empieza palabra. */
  wordStart: boolean;
}

/**
 * Texto → sílabas. Los guiones que escriba el usuario mandan («a-mor»); si una palabra no los
 * lleva, se separa sola. «_» une dos sílabas en una nota (sinalefa escrita a mano).
 */
export function syllabifyText(text: string): LyricToken[] {
  const out: LyricToken[] = [];
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const parts = word.includes('-') || word.includes('_') ? word.split('-').filter(Boolean) : syllabifyWord(word);
    parts.forEach((p, i) => out.push({ text: p.replace(/_/g, ' '), wordStart: i === 0 }));
  }
  return out;
}

const firstLetter = (s: string) => s.replace(/^[^a-záéíóúüñ]+/i, '')[0]?.toLowerCase() ?? '';
const lastLetter = (s: string) => s.replace(/[^a-záéíóúüñ]+$/i, '').slice(-1).toLowerCase();

/**
 * Ajusta las sílabas a `n` notas como haría un cantante:
 *  - si sobran, se unen primero las sinalefas (final de palabra en vocal + palabra que empieza
 *    por vocal: «dón-de es-tás» → «dón-de_es-tás») y, si aún sobran, las últimas en la última nota;
 *  - si faltan, cada sílaba empieza en la nota proporcional y el resto son melismas («»).
 */
export function fitSyllables(tokens: readonly LyricToken[], n: number): string[] {
  let syl = tokens.map((t) => ({ ...t }));
  const isV = (c: string) => !!c && (VOWELS.includes(c) || c === 'y' || c === 'h');
  while (syl.length > n) {
    const i = syl.findIndex((t, k) => k > 0 && t.wordStart && isV(firstLetter(t.text)) && VOWELS.includes(lastLetter(syl[k - 1].text)));
    if (i < 0) break;
    syl[i - 1] = { text: `${syl[i - 1].text} ${syl[i].text}`, wordStart: syl[i - 1].wordStart };
    syl = syl.filter((_, k) => k !== i);
  }
  const out = new Array<string>(n).fill('');
  if (!syl.length || !n) return out;
  if (syl.length >= n) {
    for (let i = 0; i < n - 1; i++) out[i] = syl[i].text;
    out[n - 1] = syl.slice(n - 1).map((t) => t.text).join(' ');
    return out;
  }
  syl.forEach((s, i) => (out[Math.floor((i * n) / syl.length)] = s.text));
  return out;
}
