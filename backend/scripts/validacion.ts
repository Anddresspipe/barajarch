/* Resume docs/validacion/resultados.csv y calcula el SUS. No inventa nada: sin filas, no hay resumen.
 *   npm run validacion              resumen de las sesiones registradas
 *   npm run validacion -- sus 4 2 4 1 4 2 5 1 4 2   SUS de un cuestionario (10 respuestas de 1 a 5) */
import { readFileSync } from 'fs';
import { join } from 'path';

const RUTA = join(__dirname, '..', '..', 'docs', 'validacion', 'resultados.csv');
const CRITERIOS = { cierreValido: 0.8, sus: 68, satisfaccion: 4 };

export function calcularSus(respuestas: number[]): number {
  if (respuestas.length !== 10 || respuestas.some((r) => !Number.isInteger(r) || r < 1 || r > 5)) {
    throw new Error('El SUS necesita 10 respuestas enteras de 1 a 5');
  }
  const suma = respuestas.reduce((acc, r, i) => acc + (i % 2 === 0 ? r - 1 : 5 - r), 0);
  return suma * 2.5;
}

function media(valores: number[]): number | undefined {
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : undefined;
}

function numeros(filas: Record<string, string>[], col: string): number[] {
  return filas.map((f) => f[col]).filter((v) => v !== undefined && v.trim() !== '' && !Number.isNaN(Number(v))).map(Number);
}

function leerFilas(texto: string): Record<string, string>[] {
  const [cabecera, ...resto] = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
  const cols = (cabecera ?? '').split(',');
  return resto.map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
}

function fmt(n: number | undefined, d = 1): string { return n === undefined ? 'sin datos' : n.toFixed(d); }

function resumen(ruta: string = RUTA): void {
  const filas = leerFilas(readFileSync(ruta, 'utf8'));
  if (!filas.length) { console.log('resultados.csv no tiene sesiones todavia: no hay nada que resumir.'); return; }
  const cierres = filas.filter((f) => f.cerro_ronda_valida !== '');
  const tasa = cierres.length ? cierres.filter((f) => /^(si|sí|true|1)$/i.test(f.cerro_ronda_valida)).length / cierres.length : undefined;
  const sus = media(numeros(filas, 'sus_0a100')), sat = media(numeros(filas, 'satisfaccion_1a5'));
  console.log(`Sesiones: ${filas.length}`);
  console.log(`Tasa de cierre valido: ${tasa === undefined ? 'sin datos' : `${(tasa * 100).toFixed(0)} %`} (criterio >= ${CRITERIOS.cierreValido * 100} %)`);
  console.log(`Errores por sesion: ${fmt(media(numeros(filas, 'errores')))}`);
  console.log(`Tiempo medio por turno: ${fmt(media(numeros(filas, 'tiempo_por_turno_s')))} s`);
  console.log(`Satisfaccion media: ${fmt(sat)} (criterio >= ${CRITERIOS.satisfaccion})`);
  console.log(`Latencia percibida media: ${fmt(media(numeros(filas, 'latencia_percibida_1a5')))}`);
  console.log(`SUS medio: ${fmt(sus)} (criterio >= ${CRITERIOS.sus})`);
}

if (require.main === module) {
  const [orden, ...args] = process.argv.slice(2);
  if (orden === 'sus') console.log(`SUS = ${calcularSus(args.map(Number))}`);
  else resumen(orden ? join(process.cwd(), orden) : RUTA);
}
