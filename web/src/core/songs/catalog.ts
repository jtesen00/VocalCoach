import { phrase } from './melody';
import type { Song } from './types';

/*
 * Canciones del MVP: solo contenido tradicional, de dominio público u original (spec §15).
 * La melodía se escribe a mano como datos (MIDI + pulsos + sílabas); no hay audio grabado.
 * Las notas se escriben en Do y se desplazan a la tonalidad indicada con `shift`.
 */

const q = (n: number) => Array(n).fill(1);

const estrellita: Song = {
  id: 'estrellita',
  title: 'Estrellita',
  credit: 'Tradicional · melodía de «Ah! vous dirai-je, maman» (siglo XVIII)',
  license: 'traditional',
  bpm: 100,
  key: { tonic: 60, mode: 'mayor' },
  sections: [
    {
      name: 'Estrofa',
      phrases: [
        phrase('p1', 'Es-tre-lli-ta, dón-de_es-tás', [60, 60, 67, 67, 69, 69, 67], [...q(6), 2], 0, 'C:4 F:2 C:2'),
        phrase('p2', 'me pre-gun-to qué se-rás', [65, 65, 64, 64, 62, 62, 60], [...q(6), 2], 0, 'F:2 C:2 G:2 C:2'),
      ],
    },
    {
      name: 'Puente',
      phrases: [
        phrase('p3', 'en el cie-lo_y en el mar', [67, 67, 65, 65, 64, 64, 62], [...q(6), 2], 0, 'C:2 F:2 C:2 G:2'),
        phrase('p4', 'un dia-man-te de ver-dad', [67, 67, 65, 65, 64, 64, 62], [...q(6), 2], 0, 'C:2 F:2 C:2 G:2'),
      ],
    },
    {
      name: 'Final',
      phrases: [
        phrase('p5', 'Es-tre-lli-ta, dón-de_es-tás', [60, 60, 67, 67, 69, 69, 67], [...q(6), 2], 0, 'C:4 F:2 C:2'),
        phrase('p6', 'me pre-gun-to qué se-rás', [65, 65, 64, 64, 62, 62, 60], [...q(6), 2], 0, 'F:2 C:2 G:2 C:2'),
      ],
    },
  ],
};

const MARTINILLO_SHIFT = 5; // Fa mayor
const martinillo: Song = {
  id: 'martinillo',
  title: 'Martinillo',
  credit: 'Tradicional (canon «Frère Jacques»)',
  license: 'traditional',
  bpm: 96,
  key: { tonic: 60 + MARTINILLO_SHIFT, mode: 'mayor' },
  sections: [
    {
      name: 'Parte A',
      phrases: [
        phrase('p1', 'Mar-ti-ni-llo, mar-ti-ni-llo', [60, 62, 64, 60, 60, 62, 64, 60], q(8), MARTINILLO_SHIFT, 'C:8'),
        phrase('p2', '¿dón-de_es-tás? ¿dón-de_es-tás?', [64, 65, 67, 64, 65, 67], [1, 1, 2, 1, 1, 2], MARTINILLO_SHIFT, 'C:4 C:4'),
      ],
    },
    {
      name: 'Parte B',
      phrases: [
        phrase(
          'p3',
          'To-ca la cam-pa-na, to-ca la cam-pa-na',
          [67, 69, 67, 65, 64, 60, 67, 69, 67, 65, 64, 60],
          [0.5, 0.5, 0.5, 0.5, 1, 1, 0.5, 0.5, 0.5, 0.5, 1, 1],
          MARTINILLO_SHIFT,
          'C:2 G:1 C:1 C:2 G:1 C:1',
        ),
        phrase('p4', 'din don dan, din don dan', [60, 55, 60, 60, 55, 60], [1, 1, 2, 1, 1, 2], MARTINILLO_SHIFT, 'C:1 G:1 C:2 C:1 G:1 C:2'),
      ],
    },
  ],
};

const ODA_SHIFT = 2; // Re mayor
const ODA_A = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];
const ODA_B = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60];
const ODA_BEATS = [...q(12), 1.5, 0.5, 2];
const oda: Song = {
  id: 'oda-alegria',
  title: 'Oda a la alegría',
  credit: 'Melodía: L. van Beethoven, Sinfonía n.º 9 (dominio público) · Letra original de Vocal Coach',
  license: 'public-domain',
  bpm: 100,
  key: { tonic: 60 + ODA_SHIFT, mode: 'mayor' },
  sections: [
    {
      name: 'Estrofa',
      phrases: [
        phrase('p1', 'Can-ta, can-ta, que la luz del dí-a lle-ga con el sol', ODA_A, ODA_BEATS, ODA_SHIFT, 'C:4 G:4 C:4 G:4'),
        phrase('p2', 'a-bre tu ven-ta-na y can-ta, que vue-le la can-ción', ODA_B, ODA_BEATS, ODA_SHIFT, 'C:4 G:4 C:4 G:2 C:2'),
      ],
    },
    {
      name: 'Puente',
      phrases: [
        phrase(
          'p3',
          'Hoy can-ta-mos jun-tos, tú y yo, can-tan-do to-dos a la vez',
          [62, 62, 64, 60, 62, 64, 65, 64, 60, 62, 64, 65, 64, 62, 60, 62, 55],
          [1, 1, 1, 1, 1, 0.5, 0.5, 1, 1, 1, 0.5, 0.5, 1, 1, 1, 1, 2],
          ODA_SHIFT,
          'G:2 C:2 G:2 C:2 G:2 C:2 C:1 G:3',
        ),
      ],
    },
    {
      name: 'Final',
      phrases: [phrase('p4', 'Can-ta, can-ta, que la luz del dí-a lle-ga con el sol', ODA_B, ODA_BEATS, ODA_SHIFT, 'C:4 G:4 C:4 G:2 C:2')],
    },
  ],
};

/**
 * Balada original escrita para la app: estrofa media-grave y estribillo agudo con saltos
 * y una nota final larga y aguda. Sirve para probar el recomendador de tono.
 */
const luzDePuerto: Song = {
  id: 'luz-de-puerto',
  title: 'Luz de puerto',
  credit: 'Canción original de Vocal Coach',
  license: 'original',
  bpm: 76,
  key: { tonic: 57, mode: 'menor' },
  sections: [
    {
      name: 'Estrofa',
      phrases: [
        phrase('p1', 'Ca-mi-no so-lo jun-to_al mar', [64, 64, 62, 60, 62, 64, 64, 67], [...q(7), 3], 0, 'Am:4 C:3 G:3'),
        phrase('p2', 'y_el vien-to me ha-bla de ti', [67, 67, 69, 67, 64, 62, 60, 57], [...q(7), 3], 0, 'C:4 G:3 Am:3'),
        phrase('p3', 'las lu-ces del puer-to se van', [60, 62, 64, 64, 67, 69, 67, 64], [...q(7), 3], 0, 'Am:4 F:3 C:3'),
        phrase('p4', 'y yo me que-do_a-quí', [64, 62, 60, 62, 60, 57], [...q(5), 3], 0, 'G:4 Am:4'),
      ],
    },
    {
      name: 'Estribillo',
      phrases: [
        phrase('p5', 'Luz de puer-to, llé-va-me', [64, 69, 72, 72, 71, 69, 72], [...q(6), 3], 0, 'Am:4 E:2 Am:3'),
        phrase('p6', 'don-de nun-ca se_a-pa-gue_el sol', [72, 72, 74, 76, 74, 72, 74, 76], [...q(7), 4], 0, 'F:4 G:3 C:4'),
        phrase('p7', 'y si me pier-do_en la no-che', [67, 67, 69, 72, 71, 69, 67, 64], [...q(7), 2], 0, 'C:4 G:3 Am:2'),
        phrase('p8', 'tu luz me de-vuel-ve_a mí', [57, 60, 64, 69, 72, 74, 76], [...q(6), 4], 0, 'Am:3 F:2 G:1 Am:4'),
      ],
    },
  ],
};

export const SONGS: readonly Song[] = [estrellita, martinillo, oda, luzDePuerto];

export function findSong(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}
