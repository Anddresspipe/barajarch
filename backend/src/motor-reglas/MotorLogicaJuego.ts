import { Carta } from './Carta';
import { IRegistroReglas } from './ReglaJuego';
import { ResultadoValidacion } from '../compartido/tipos';

export { BONO_CIERRE } from './ReglaJuego';


export interface Liquidacion {
  readonly deltas: Record<string, number>;
  readonly conservaHistorial: boolean;
}

/** Fachada del motor: solo conoce el contrato ReglaJuego, nunca una modalidad concreta. */
export class MotorLogicaJuego {
  constructor(private readonly registro: IRegistroReglas) {}

  validarCierre(modalidad: string, mano: readonly Carta[]): ResultadoValidacion {
    return this.registro.obtener(modalidad).validarCierre(mano);
  }

  cartasPorMano(modalidad: string): number {
    return this.registro.obtener(modalidad).getCartasPorMano();
  }

  liquidarRonda(
    modalidad: string,
    cierraId: string,
    manos: Record<string, readonly Carta[]>,
  ): Liquidacion {
    const regla = this.registro.obtener(modalidad);
    const deltas: Record<string, number> = {};
    for (const [id, mano] of Object.entries(manos)) {
      deltas[id] = id === cierraId ? regla.calcularBonoCierre(mano) : -regla.calcularPenalizacion(mano);
    }
    return { deltas, conservaHistorial: regla.conservaHistorial() };
  }

  modalidades(): string[] { return this.registro.codigos(); }

  /** Modalidades cuyo marcador se acumula entre rondas (solo a estas se pueden traspasar puntos). */
  modalidadesConHistorial(): string[] {
    return this.registro.codigos().filter((c) => this.registro.obtener(c).conservaHistorial());
  }

  /**
   * Carta que conviene soltar: la que deja la mano con menos puntos sueltos segun la modalidad
   * (a igualdad, la de mas puntos). Es lo que juega el sistema cuando a alguien se le acaba el tiempo.
   */
  mejorDescarte(modalidad: string, mano: readonly Carta[]): number {
    const regla = this.registro.obtener(modalidad);
    let mejor = 0;
    let menor = Infinity;
    mano.forEach((carta, i) => {
      const sueltos = regla.calcularPenalizacion(mano.filter((_, k) => k !== i));
      if (sueltos < menor || (sueltos === menor && carta.puntos() > mano[mejor].puntos())) { menor = sueltos; mejor = i; }
    });
    return mejor;
  }

  debeEliminar(modalidad: string, acumulado: number): boolean {
    return this.registro.obtener(modalidad).debeEliminar(acumulado);
  }

  haGanado(modalidad: string, acumulado: number): boolean {
    return this.registro.obtener(modalidad).haGanado(acumulado);
  }
}
