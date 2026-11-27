import { Carta } from './Carta';
import { ResultadoValidacion } from '../compartido/tipos';

export const BONO_CIERRE = 10;

/** Contrato que implementa cada modalidad (plug-in). */
export interface ReglaJuego {
  getCodigo(): string;
  getCartasPorMano(): number;
  validarCierre(mano: readonly Carta[]): ResultadoValidacion;
  calcularPenalizacion(mano: readonly Carta[]): number;
  /** Puntos que recibe quien cierra con esa mano (la regla puede dar un bono o descontar). */
  calcularBonoCierre(mano: readonly Carta[]): number;
  debeEliminar(acumulado: number): boolean;
  haGanado(acumulado: number): boolean;
  conservaHistorial(): boolean;
}

export interface IRegistroReglas {
  obtener(codigo: string): ReglaJuego;
  codigos(): string[];
}
