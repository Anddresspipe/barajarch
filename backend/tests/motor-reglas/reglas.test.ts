import { manoDesde, Carta, crearBaraja } from '../../src/motor-reglas/Carta';
import { esTerna, esCuarta, minimoPuntosSueltos } from '../../src/motor-reglas/EvaluadorCombinaciones';
import { ReglaClasicaCuartaTerna } from '../../src/motor-reglas/plugins/ReglaClasicaCuartaTerna';
import { ReglaApuntado101 } from '../../src/motor-reglas/plugins/ReglaApuntado101';
import { MotorLogicaJuego } from '../../src/motor-reglas/MotorLogicaJuego';
import { crearRegistroPorDefecto } from '../../src/motor-reglas/registroPorDefecto';

const clasica = new ReglaClasicaCuartaTerna();
const apuntado = new ReglaApuntado101();

describe('Carta y combinaciones', () => {
  it('puntos: As=1, figuras=10', () => {
    expect(Carta.desde('AC').puntos()).toBe(1);
    expect(Carta.desde('KP').puntos()).toBe(10);
    expect(Carta.desde('7D').puntos()).toBe(7);
  });
  it('rechaza cartas invalidas', () => { expect(() => Carta.desde('ZZ')).toThrow(); });
  it('terna por valor y por escalera (As bajo, alto y circular)', () => {
    expect(esTerna(manoDesde('7C 7D 7T'))).toBe(true);
    expect(esTerna(manoDesde('AC 2C 3C'))).toBe(true);
    expect(esTerna(manoDesde('QC KC AC'))).toBe(true);
    expect(esTerna(manoDesde('KC AC 2C'))).toBe(true); // escalera circular
    expect(esTerna(manoDesde('QC AC 2C'))).toBe(false); // hueco
    expect(esTerna(manoDesde('7C 7D 7D'))).toBe(false);
  });
  it('cuarta por valor y por escalera', () => {
    expect(esCuarta(manoDesde('7C 7D 7T 7P'))).toBe(true);
    expect(esCuarta(manoDesde('5C 6C 7C 8C'))).toBe(true);
    expect(esCuarta(manoDesde('5C 6C 7C 9C'))).toBe(false);
    expect(esCuarta(manoDesde('QC KC AC 2C'))).toBe(true); // circular
    expect(esCuarta(manoDesde('QC KC AC 3C'))).toBe(false);
  });
  it('minimo de puntos sueltos', () => {
    expect(minimoPuntosSueltos(manoDesde('7C 7D 7T KP'), [3, 4])).toBe(10);
  });
});

describe('Clasica 4-3-3', () => {
  it('cierre valido: cuarta + 2 ternas + descarte', () => {
    expect(clasica.validarCierre(manoDesde('7C 7D 7T 7P 2C 3C 4C 9D 10D JD KP')).valido).toBe(true);
  });
  it('rechaza si falta una terna (3 ternas incompletas)', () => {
    const r = clasica.validarCierre(manoDesde('7C 7D 7T 7P 2C 3C 4C 9D 10D 2P KP'));
    expect(r.valido).toBe(false);
  });
  it('rechaza mano que no tiene 11 cartas', () => {
    expect(clasica.validarCierre(manoDesde('7C 7D 7T 7P')).valido).toBe(false);
  });
  it('no conserva historial', () => { expect(clasica.conservaHistorial()).toBe(false); });
});

describe('Clasica con 10 cartas', () => {
  it('cierra con la cuarta y las 2 ternas ya formadas, sin robar', () => {
    expect(clasica.validarCierre(manoDesde('AC AD AT AP 2C 3C 4C 5D 6D 7D')).valido).toBe(true);
  });
  it('con 10 cartas sin combinar no cierra y no menciona descarte', () => {
    const r = clasica.validarCierre(manoDesde('AC AD AT 2C 3C 4C 5D 6D 8D KC'));
    expect(r.valido).toBe(false);
    expect(r.motivo).not.toMatch(/descarte/);
  });
  it('rechaza manos de otro tamano', () => {
    expect(clasica.validarCierre(manoDesde('AC AD AT')).valido).toBe(false);
  });
});

describe('Apuntado 101', () => {
  const base = 'AC AD AT 2C 3C 4C 5D 6D 7D';
  it('cierre valido con sobrante < 5', () => {
    expect(apuntado.validarCierre(manoDesde(`${base} KC 3P`)).valido).toBe(true);
  });
  it('sobrante exactamente 5 puntos es invalido (estricto)', () => {
    expect(apuntado.validarCierre(manoDesde(`${base} KC 5P`)).valido).toBe(false);
  });
  it('sobrante de 4 puntos es valido', () => {
    expect(apuntado.validarCierre(manoDesde(`${base} KC 4P`)).valido).toBe(true);
  });
  it('tambien cierra como en Clasica: cuarta + 2 ternas + 1 descarte', () => {
    expect(apuntado.validarCierre(manoDesde('AC AD AT AP 2C 3C 4C 5D 6D 7D KC')).valido).toBe(true);
  });
  it('cuarta + 2 ternas con descarte alto sigue siendo valido (no exige sobrante < 5)', () => {
    expect(apuntado.validarCierre(manoDesde('AC AD AT AP 2C 3C 4C 5D 6D 7D KP')).valido).toBe(true);
  });
  it('cierra con 10 cartas: cuarta + 2 ternas, o 3 ternas + sobrante < 5', () => {
    expect(apuntado.validarCierre(manoDesde('AC AD AT AP 2C 3C 4C 5D 6D 7D')).valido).toBe(true);
    expect(apuntado.validarCierre(manoDesde(`${base} 3P`)).valido).toBe(true);
    expect(apuntado.validarCierre(manoDesde(`${base} KP`)).valido).toBe(false);
  });
  it('3 ternas incompletas no cierran', () => {
    expect(apuntado.validarCierre(manoDesde('AC AD AT 2C 3C 4C 5D 6D 8D KC 3P')).valido).toBe(false);
  });
  it('penalizacion = puntos no combinados', () => {
    expect(apuntado.calcularPenalizacion(manoDesde('AC AD AT 2C 3C 4C 5D 6D KC 3P'))).toBe(23);
  });
  it('cierre con toque no suma: resta los puntos de la carta sobrante', () => {
    const base = 'AC AD AT 2C 3C 4C 5D 6D 7D';
    expect(apuntado.calcularBonoCierre(manoDesde(`${base} 3P`))).toBe(-3);
    expect(apuntado.calcularBonoCierre(manoDesde(`${base} 3P KP`))).toBe(-3);   // con 11 cartas se descarta la mas alta
  });
  it('cierre como en Clasica suma 10 aunque tambien sirva el toque', () => {
    expect(apuntado.calcularBonoCierre(manoDesde('AC AD AT 2C 3C 4C 5D 6D 7D 8D'))).toBe(10);
    expect(apuntado.calcularBonoCierre(manoDesde('AC AD AT AP 2C 3C 4C 5D 6D 7D'))).toBe(10);
  });
  it('liquidacion: quien cierra con toque resta, los demas siguen restando', () => {
    const motor = new MotorLogicaJuego(crearRegistroPorDefecto());
    const liq = motor.liquidarRonda('APUNTADO', 'a', {
      a: manoDesde('AC AD AT 2C 3C 4C 5D 6D 7D 3P'),
      b: manoDesde('AC AD AT 2C 3C 4C 5D 6D KC 3P'),
    });
    expect(liq.deltas).toEqual({ a: -3, b: -23 });
  });
  it('eliminacion exacta a -101 y victoria a 51', () => {
    expect(apuntado.debeEliminar(-101)).toBe(true);
    expect(apuntado.debeEliminar(-100)).toBe(false);
    expect(apuntado.haGanado(51)).toBe(true);
    expect(apuntado.haGanado(50)).toBe(false);
  });
});

describe('MotorLogicaJuego', () => {
  const motor = new MotorLogicaJuego(crearRegistroPorDefecto());
  it('liquidacion: +10 al que cierra, penalizacion a los demas', () => {
    const l = motor.liquidarRonda('APUNTADO', 'a', {
      a: manoDesde('AC AD AT 2C 3C 4C 5D 6D 7D KC'),
      b: manoDesde('AC AD AT 2C 3C 4C 5D 6D KC 3P'),
    });
    expect(l.deltas).toEqual({ a: 10, b: -23 });
    expect(l.conservaHistorial).toBe(true);
  });
  it('modalidad desconocida lanza error de dominio', () => {
    expect(() => motor.validarCierre('XX', [])).toThrow(/no registrada/);
  });
});

describe('Comodines (opcionales)', () => {
  const clasica = new ReglaClasicaCuartaTerna();
  const apuntado = new ReglaApuntado101();

  it('la baraja con comodines tiene 56 cartas con codigos unicos', () => {
    const b = crearBaraja(true);
    expect(b).toHaveLength(56);
    expect(new Set(b.map((c) => c.codigo())).size).toBe(56);
    expect(crearBaraja()).toHaveLength(52);
    expect(Carta.desde('JKP').esComodin()).toBe(true);
  });
  it('un comodin completa una terna de mismo valor o una escalera', () => {
    expect(esTerna(manoDesde('7C 7D JKP'))).toBe(true);
    expect(esTerna(manoDesde('5D 7D JKC'))).toBe(true);   // 5-6-7
    expect(esTerna(manoDesde('QD AD JKT'))).toBe(true);   // Q-K-A circular
    expect(esCuarta(manoDesde('7C 7D 7T JKP'))).toBe(true);
  });
  it('maximo un comodin por grupo y sin cartas que no combinan', () => {
    expect(esTerna(manoDesde('7C JKD JKP'))).toBe(false);
    expect(esTerna(manoDesde('JKC JKD JKP'))).toBe(false);
    expect(esTerna(manoDesde('7C 8D JKP'))).toBe(false);
    expect(esTerna(manoDesde('7C 7D JKC')) ).toBe(true);
    expect(esTerna(manoDesde('5D 9D JKC'))).toBe(false);
  });
  it('un comodin suelto penaliza 15 puntos', () => {
    expect(Carta.desde('JKT').puntos()).toBe(15);
    expect(minimoPuntosSueltos(manoDesde('AC JKD'))).toBe(16);
  });
  it('permite cerrar usando comodines como parte de los grupos', () => {
    expect(clasica.validarCierre(manoDesde('AC AD JKT 2C 3C 4C 5D 6D JKP 8D')).valido).toBe(true);   // cuarta con comodin + terna con comodin + terna
    expect(apuntado.validarCierre(manoDesde('AC AD JKT 2C 3C JKP 5D 6D 7D 2P')).valido).toBe(true);   // 3 ternas (2 con comodin) + sobrante 2
  });
  it('un comodin como sobrante nunca cumple el toque', () => {
    expect(apuntado.validarCierre(manoDesde('AC AD AT 2C 3C 4C 5D 9D KP JKP')).valido).toBe(false);
  });
});
