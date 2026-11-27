import { Carta } from '../Carta';
import { BONO_CIERRE, ReglaJuego } from '../ReglaJuego';
import { ResultadoValidacion } from '../../compartido/tipos';
import { combinaciones, describirFaltantes, minimoPuntosSueltos, particionar } from '../EvaluadorCombinaciones';

export const LIMITE_ELIMINACION = -101;
export const META_VICTORIA = 51;
export const SOBRANTE_MAXIMO_EXCLUSIVO = 5;

/** Apuntado 101: se cierra como en Clasica (cuarta + 2 ternas) o con toque (3 ternas + sobrante < 5 puntos), con 10 u 11 cartas. */
export class ReglaApuntado101 implements ReglaJuego {
  getCodigo(): string { return 'APUNTADO'; }
  getCartasPorMano(): number { return 10; }
  conservaHistorial(): boolean { return true; }
  debeEliminar(acumulado: number): boolean { return acumulado <= LIMITE_ELIMINACION; }
  haGanado(acumulado: number): boolean { return acumulado >= META_VICTORIA; }

  validarCierre(mano: readonly Carta[]): ResultadoValidacion {
    const n = this.getCartasPorMano();
    if (mano.length !== n && mano.length !== n + 1) {
      return { valido: false, motivo: 'La mano debe tener 10 u 11 cartas al cerrar' };
    }
    for (const diez of mano.length === n ? [mano] : combinaciones(mano, n)) {
      if (particionar(diez, [4, 3, 3])) return { valido: true };   // cierre como en Clasica
    }
    if (this.sobranteDelToque(mano) !== undefined) return { valido: true };
    const faltan = describirFaltantes(mano, [3, 3, 3]);
    const faltanClasica = describirFaltantes(mano, [4, 3, 3]);
    const opciones = '(cuarta + 2 ternas con 1 descarte, o 3 ternas y un sobrante de menos de 5 puntos)';
    return { valido: false, motivo: faltan
      ? `Aún no puedes cerrar: te falta ${faltan} para 3 ternas, o ${faltanClasica} para cuarta + 2 ternas ${opciones}`
      : 'Aún no puedes cerrar: con 3 ternas el sobrante debe valer menos de 5 puntos' };
  }

  /** Puntos de la carta que queda suelta si la mano cierra con toque (3 ternas + sobrante < 5); si no, undefined. */
  private sobranteDelToque(mano: readonly Carta[]): number | undefined {
    let mejor: number | undefined;
    for (const nueve of combinaciones(mano, 9)) {
      if (!particionar(nueve, [3, 3, 3])) continue;
      const sobrantes = mano.filter((c) => !nueve.includes(c));
      const sobrante = Math.min(...sobrantes.map((c) => c.puntos()));   // con 11 cartas, se descarta la mas alta
      if (sobrante < SOBRANTE_MAXIMO_EXCLUSIVO && (mejor === undefined || sobrante < mejor)) mejor = sobrante;
    }
    return mejor;
  }

  /** Cierre como en Clasica: +10. Cierre con toque: no suma, resta los puntos de la carta sobrante. */
  calcularBonoCierre(mano: readonly Carta[]): number {
    const n = this.getCartasPorMano();
    for (const diez of mano.length === n ? [mano] : combinaciones(mano, n)) {
      if (particionar(diez, [4, 3, 3])) return BONO_CIERRE;
    }
    const sobrante = this.sobranteDelToque(mano);
    return sobrante === undefined ? BONO_CIERRE : -sobrante;
  }

  calcularPenalizacion(mano: readonly Carta[]): number {
    return minimoPuntosSueltos(mano, [3]);
  }
}
