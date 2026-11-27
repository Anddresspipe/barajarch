import { Carta } from '../Carta';
import { BONO_CIERRE, ReglaJuego } from '../ReglaJuego';
import { ResultadoValidacion } from '../../compartido/tipos';
import { combinaciones, describirFaltantes, minimoPuntosSueltos, particionar } from '../EvaluadorCombinaciones';

/** Clasica: 1 cuarta + 2 ternas. Se cierra con 10 cartas ya formadas, o con 11 (la sobrante es el descarte). */
export class ReglaClasicaCuartaTerna implements ReglaJuego {
  getCodigo(): string { return 'CLASICA'; }
  getCartasPorMano(): number { return 10; }
  conservaHistorial(): boolean { return false; }
  debeEliminar(): boolean { return false; }
  haGanado(): boolean { return false; }

  validarCierre(mano: readonly Carta[]): ResultadoValidacion {
    const n = this.getCartasPorMano();
    if (mano.length !== n && mano.length !== n + 1) {
      return { valido: false, motivo: 'La mano debe tener 10 u 11 cartas al cerrar' };
    }
    for (const diez of mano.length === n ? [mano] : combinaciones(mano, n)) {
      if (particionar(diez, [4, 3, 3])) return { valido: true };
    }
    return { valido: false, motivo: `Aún no puedes cerrar: te falta ${describirFaltantes(mano, [4, 3, 3])} (cuarta + 2 ternas${mano.length > n ? ', más 1 carta de descarte' : ''})` };
  }

  calcularBonoCierre(): number { return BONO_CIERRE; }

  calcularPenalizacion(mano: readonly Carta[]): number {
    return minimoPuntosSueltos(mano, [3, 4]);
  }
}
