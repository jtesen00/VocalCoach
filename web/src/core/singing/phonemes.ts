/**
 * Fonemas del español cantado (Fase 9, voz sintética que canta la letra). La ortografía del
 * español es muy regular: unas pocas reglas bastan para pasar de una sílaba escrita a sus
 * sonidos. Pronunciación neutra con seseo (c/z = s), la más extendida.
 */
export type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';

export type Consonant =
  | 'p' | 't' | 'k' // oclusivas sordas
  | 'b' | 'd' | 'g' // oclusivas sonoras (suaves entre vocales)
  | 'f' | 's' | 'x' | 'ch' // fricativas y africada sordas (x = jota)
  | 'y' // «ll» / «y» ante vocal
  | 'm' | 'n' | 'ny' // nasales
  | 'l' | 'r' | 'rr'; // líquidas

export type Phone = Vowel | Consonant;

export interface Syllable {
  /** Consonantes antes del núcleo («pl» en «pla»). */
  onset: Consonant[];
  /**
   * Núcleo: una vocal o un diptongo/triptongo. La vocal que se sostiene (la más abierta) va en
   * `main`; las semivocales que la rodean, en `glideIn`/`glideOut` («cie-lo»: i + e).
   */
  glideIn: Vowel[];
  main: Vowel;
  glideOut: Vowel[];
  coda: Consonant[];
}

const VOWELS: Record<string, Vowel> = { a: 'a', á: 'a', e: 'e', é: 'e', i: 'i', í: 'i', o: 'o', ó: 'o', u: 'u', ú: 'u', ü: 'u' };
const OPEN = new Set<Vowel>(['a', 'e', 'o']);
/** Vocales con tilde: hiato, se sostienen aunque sean cerradas («dí-a»). */
const STRESSED_CLOSED = new Set(['í', 'ú']);

const isVowelChar = (c: string | undefined) => !!c && c in VOWELS;

/** Texto → secuencia de fonemas (consonantes y vocales), aplicando las reglas ortográficas. */
export function graphemesToPhones(text: string): { phone: Phone; stressed: boolean }[] {
  const s = text.toLowerCase().normalize('NFC').replace(/[^a-záéíóúüñ]/g, '');
  const out: { phone: Phone; stressed: boolean }[] = [];
  const push = (phone: Phone, stressed = false) => out.push({ phone, stressed });
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const next = s[i + 1];
    const frontNext = next === 'e' || next === 'é' || next === 'i' || next === 'í';
    if (isVowelChar(c)) {
      push(VOWELS[c], STRESSED_CLOSED.has(c));
      continue;
    }
    switch (c) {
      case 'h':
        break; // muda
      case 'c':
        if (next === 'h') {
          push('ch');
          i++;
        } else push(frontNext ? 's' : 'k');
        break;
      case 'q':
        push('k');
        if (next === 'u' && isVowelChar(s[i + 2])) i++; // «que», «qui»: la u no suena
        break;
      case 'g':
        if (next === 'u' && (s[i + 2] === 'e' || s[i + 2] === 'é' || s[i + 2] === 'i' || s[i + 2] === 'í')) {
          push('g');
          i++; // «gue», «gui»
        } else push(frontNext ? 'x' : 'g');
        break;
      case 'j':
        push('x');
        break;
      case 'l':
        if (next === 'l') {
          push('y');
          i++;
        } else push('l');
        break;
      case 'r':
        if (next === 'r') {
          push('rr');
          i++;
        } else push(i === 0 ? 'rr' : 'r'); // a principio de palabra suena fuerte
        break;
      case 'y':
        // «y» sola o al final («hoy», «muy») es vocal; ante vocal, consonante.
        if (isVowelChar(next)) push('y');
        else push('i');
        break;
      case 'ñ':
        push('ny');
        break;
      case 'v':
        push('b');
        break;
      case 'w':
        push('u');
        break;
      case 'z':
        push('s');
        break;
      case 'x':
        if (i === 0) push('s');
        else {
          push('k');
          push('s');
        }
        break;
      case 'b': case 'd': case 'f': case 'k': case 'm': case 'n': case 'p': case 's': case 't':
        push(c as Consonant);
        break;
      default:
        break;
    }
  }
  return out;
}

const isVowel = (p: Phone): p is Vowel => p.length === 1 && 'aeiou'.includes(p);

/**
 * Una sílaba escrita (la de una nota) → su estructura. Si la sílaba trae varias vocales
 * separadas por consonantes (texto sin separar), se toma la primera vocal como núcleo y lo
 * demás va a la coda: la nota sostiene una sola vocal.
 */
export function parseSyllable(text: string): Syllable | null {
  const phones = graphemesToPhones(text);
  const firstV = phones.findIndex((p) => isVowel(p.phone));
  if (firstV < 0) return null;
  let endV = firstV;
  while (endV + 1 < phones.length && isVowel(phones[endV + 1].phone)) endV++;
  const nucleus = phones.slice(firstV, endV + 1);
  // Núcleo: la vocal con tilde cerrada (hiato) o la más abierta; si no, la última («ui» → i).
  let mainIdx = nucleus.findIndex((p) => p.stressed);
  if (mainIdx < 0) mainIdx = nucleus.findIndex((p) => OPEN.has(p.phone as Vowel));
  if (mainIdx < 0) mainIdx = nucleus.length - 1;
  const vowels = nucleus.map((p) => p.phone as Vowel);
  return {
    onset: phones.slice(0, firstV).map((p) => p.phone as Consonant),
    glideIn: vowels.slice(0, mainIdx),
    main: vowels[mainIdx],
    glideOut: vowels.slice(mainIdx + 1),
    coda: phones.slice(endV + 1).filter((p) => !isVowel(p.phone)).map((p) => p.phone as Consonant),
  };
}
