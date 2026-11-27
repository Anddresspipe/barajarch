import { Carta } from './Carta';
import { PALOS, VALORES } from '../compartido/tipos';

export function esMismoValor(cs: readonly Carta[]): boolean {
  if (cs.length < 3 || cs.length > 4 || cs.some((c) => c.esComodin())) return false;
  const mismoValor = cs.every((c) => c.valor === cs[0].valor);
  return mismoValor && new Set(cs.map((c) => c.palo)).size === cs.length;
}

const RANGOS = 13;

/** Escalera circular: los rangos forman un tramo continuo en el anillo A-2-...-K-A (p. ej. Q-K-A-2). */
export function esEscalera(cs: readonly Carta[]): boolean {
  if (cs.length < 3 || cs.some((c) => c.esComodin()) || !cs.every((c) => c.palo === cs[0].palo)) return false;
  const rangos = [...new Set(cs.map((c) => c.rango()))].sort((a, b) => a - b);
  if (rangos.length !== cs.length) return false;
  const saltos = rangos.filter((r, i) => (rangos[(i + 1) % rangos.length] - r + RANGOS) % RANGOS !== 1);
  return saltos.length <= 1;
}

const sinComodin = (cs: readonly Carta[]): boolean => esMismoValor(cs) || esEscalera(cs);

/**
 * Grupo valido (mismo valor con palos distintos, o escalera del mismo palo). Un comodin vale por cualquier carta,
 * pero como maximo uno por grupo: se prueba con las cartas que podrian reemplazarlo.
 */
export function esGrupo(cs: readonly Carta[]): boolean {
  const comodines = cs.filter((c) => c.esComodin()).length;
  if (comodines === 0) return sinComodin(cs);
  if (comodines > 1) return false;
  const reales = cs.filter((c) => !c.esComodin());
  const base = reales[0];
  const candidatos = [...PALOS.map((p) => new Carta(base.valor, p)), ...VALORES.map((v) => new Carta(v, base.palo))];
  return candidatos.some((c) => sinComodin([...reales, c]));
}
export const esTerna = (cs: readonly Carta[]): boolean => cs.length === 3 && esGrupo(cs);
export const esCuarta = (cs: readonly Carta[]): boolean => cs.length === 4 && esGrupo(cs);

export function* combinaciones<T>(items: readonly T[], k: number, desde = 0): Generator<T[]> {
  if (k === 0) { yield []; return; }
  for (let i = desde; i <= items.length - k; i++) {
    for (const resto of combinaciones(items, k - 1, i + 1)) yield [items[i], ...resto];
  }
}

/** Intenta repartir TODAS las cartas en grupos validos con los tamanos dados (en cualquier orden). */
export function particionar(cartas: readonly Carta[], tamanos: readonly number[]): Carta[][] | null {
  if (tamanos.length === 0) return cartas.length === 0 ? [] : null;
  if (cartas.length === 0) return null;
  const [primera, ...otras] = cartas;
  for (const t of new Set(tamanos)) {
    const restoTamanos = [...tamanos];
    restoTamanos.splice(restoTamanos.indexOf(t), 1);
    for (const comp of combinaciones(otras, t - 1)) {
      const grupo = [primera, ...comp];
      if (!esGrupo(grupo)) continue;
      const resto = otras.filter((c) => !comp.includes(c));
      const r = particionar(resto, restoTamanos);
      if (r) return [grupo, ...r];
    }
  }
  return null;
}

/** Minimo de puntos que quedan sin combinar usando grupos de los tamanos permitidos. */
export function minimoPuntosSueltos(cartas: readonly Carta[], tamanos: readonly number[] = [3, 4]): number {
  if (cartas.length === 0) return 0;
  const [primera, ...otras] = cartas;
  let mejor = primera.puntos() + minimoPuntosSueltos(otras, tamanos);
  for (const t of tamanos) {
    for (const comp of combinaciones(otras, t - 1)) {
      const grupo = [primera, ...comp];
      if (!esGrupo(grupo)) continue;
      const resto = otras.filter((c) => !comp.includes(c));
      mejor = Math.min(mejor, minimoPuntosSueltos(resto, tamanos));
    }
  }
  return mejor;
}

const NOMBRE_GRUPO: Record<number, string> = { 3: 'terna', 4: 'cuarta' };

/** Mayor numero de grupos disjuntos que se pueden formar (uno por cada tamano pedido). Devuelve los tamanos formados. */
export function gruposFormables(cartas: readonly Carta[], tamanos: readonly number[]): number[] {
  if (tamanos.length === 0) return [];
  const [t, ...resto] = tamanos;
  let mejor = gruposFormables(cartas, resto);
  for (const comp of combinaciones(cartas, t)) {
    if (!esGrupo(comp)) continue;
    const posible = [t, ...gruposFormables(cartas.filter((c) => !comp.includes(c)), resto)];
    if (posible.length > mejor.length) mejor = posible;
  }
  return mejor;
}

/** Texto con los grupos que aun faltan, p. ej. "1 cuarta y 1 terna". Cadena vacia si no falta ninguno. */
export function describirFaltantes(cartas: readonly Carta[], tamanos: readonly number[]): string {
  const formados = [...gruposFormables(cartas, tamanos)];
  const faltan = tamanos.filter((t) => { const i = formados.indexOf(t); if (i < 0) return true; formados.splice(i, 1); return false; });
  const cuenta = (t: number): string => {
    const n = faltan.filter((x) => x === t).length;
    return n === 0 ? '' : `${n} ${NOMBRE_GRUPO[t]}${n > 1 ? 's' : ''}`;
  };
  return [4, 3].map(cuenta).filter(Boolean).join(' y ');
}
