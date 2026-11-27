export type Palo = 'C' | 'D' | 'T' | 'P';
export type Valor = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'JK';

export const PALOS: readonly Palo[] = ['C', 'D', 'T', 'P'];
/** Valor de los comodines (opcionales): uno por palo para que cada codigo sea unico (JKC, JKD, JKT, JKP). */
export const COMODIN: Valor = 'JK';
export const VALORES: readonly Valor[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export interface ResultadoValidacion {
  readonly valido: boolean;
  readonly motivo?: string;
}

/** Traduce cualquier error a una respuesta publica: solo los errores de dominio exponen su mensaje. */
export function describirError(e: unknown): { codigo: string; mensaje: string; esDominio: boolean } {
  if (e instanceof ErrorDominio) return { codigo: e.codigo, mensaje: e.message, esDominio: true };
  console.error('error no controlado', e);
  return { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor', esDominio: false };
}

export class ErrorDominio extends Error {
  constructor(public readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDominio';
  }
}
