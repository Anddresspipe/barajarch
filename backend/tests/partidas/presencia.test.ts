import { PartidaService } from '../../src/partidas/servicio/PartidaService';
import { PartidaRepositoryEnMemoria } from '../../src/partidas/repositorio/PartidaRepositoryEnMemoria';
import { MotorLogicaJuego } from '../../src/motor-reglas/MotorLogicaJuego';
import { crearRegistroPorDefecto } from '../../src/motor-reglas/registroPorDefecto';
import { BusEventos } from '../../src/compartido/BusEventos';
import { Presencia } from '../../src/compartido/Presencia';
import { aleatorioConSemilla } from '../../src/partidas/modelo/Mazo';
import { vistaPara } from '../../src/partidas/servicio/VistaPartida';
import { armarHistorial, resultadoDe } from '../../src/partidas/servicio/Historial';
import { manoDesde } from '../../src/motor-reglas/Carta';

const TURNO = 10_000;
const ABANDONO = 60_000;

async function montar(modalidad = 'CLASICA') {
  const presencia = new Presencia();
  presencia.rastrear();
  const repo = new PartidaRepositoryEnMemoria();
  const svc = new PartidaService(repo, new MotorLogicaJuego(crearRegistroPorDefecto()), new BusEventos(), aleatorioConSemilla(3), TURNO, presencia, ABANDONO);
  presencia.conectar('a'); presencia.conectar('b');
  const p = await svc.crear(modalidad, 'a', 'Ana');
  await svc.unirse(p.id, 'b', 'Beto');
  await svc.iniciar(p.id, 'a');
  return { svc, repo, presencia, id: p.id };
}
const avanzar = async (ms: number): Promise<void> => { await jest.advanceTimersByTimeAsync(ms); };

describe('Presencia y abandono total', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('la vista indica quien esta conectado', async () => {
    const { svc, repo, presencia, id } = await montar();
    let p = (await repo.cargar(id))!;
    expect(vistaPara(p, 'a', {}, svc.conectadosDe(p)).jugadores.map((j) => j.conectado)).toEqual([true, true]);
    presencia.desconectar('b');
    p = (await repo.cargar(id))!;
    expect(vistaPara(p, 'a', {}, svc.conectadosDe(p)).jugadores.map((j) => j.conectado)).toEqual([true, false]);
  });

  it('con uno desconectado el reloj sigue corriendo', async () => {
    const { repo, presencia, id } = await montar();
    presencia.desconectar('b'); await avanzar(0);
    await avanzar(TURNO + 1);
    expect((await repo.cargar(id))!.turno).toBe(1);
  });

  it('sin nadie conectado el reloj se pausa y al volver el turno empieza de nuevo', async () => {
    const { repo, presencia, id } = await montar();
    presencia.desconectar('a'); presencia.desconectar('b'); await avanzar(0);
    await avanzar(ABANDONO - 1000);                    // casi el limite, sin llegar
    const p = (await repo.cargar(id))!;
    expect(p.turno).toBe(0);                           // nadie jugo por nadie
    expect(p.estado).toBe('EN_CURSO');
    presencia.conectar('b'); await avanzar(0);
    await avanzar(TURNO / 2);                          // el turno arranca de cero: no se cobra el tiempo que nadie estuvo
    expect((await repo.cargar(id))!.turno).toBe(0);
    await avanzar(TURNO);
    const tras = (await repo.cargar(id))!;
    expect(tras.estado).toBe('EN_CURSO');              // hay alguien conectado: no es abandono total
    expect(tras.turno).toBe(1);
  });

  it('si nadie vuelve, la partida termina sin ganador y es derrota para todos', async () => {
    const { repo, presencia, id } = await montar();
    presencia.desconectar('a'); presencia.desconectar('b'); await avanzar(0);
    await avanzar(ABANDONO + 1);
    const p = (await repo.cargar(id))!;
    expect(p.estado).toBe('FINALIZADA');
    expect(p.ganadorId).toBeUndefined();
    expect(p.fin).toBe('ABANDONO_TOTAL');
    expect(resultadoDe(p, 'a')).toBe('PERDIDA');
    expect(resultadoDe(p, 'b')).toBe('PERDIDA');
  });
});

describe('Resultado de cada jugador', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('abandonar da victoria por abandono al rival y "abandonada" a quien se fue', async () => {
    const { svc, repo, id } = await montar();
    await svc.abandonar(id, 'a');
    const p = (await repo.cargar(id))!;
    expect(resultadoDe(p, 'a')).toBe('ABANDONADA');
    expect(resultadoDe(p, 'b')).toBe('GANADA_POR_ABANDONO');
  });

  it('un cierre normal da ganada y perdida, y el historial separa por modalidad', async () => {
    const { svc, repo, id } = await montar('CLASICA');
    const p = (await repo.cargar(id))!;
    p.jugadores[p.turno].mano = manoDesde('7C 7D 7T 7P 2C 3C 4C 9D 10D JD KP'); p.fase = 'DESCARTAR';
    await repo.guardar(p);
    const quien = p.jugadores[p.turno].id; const otro = quien === 'a' ? 'b' : 'a';
    await svc.cerrarRonda(id, quien, p.ronda);
    const fin = (await repo.cargar(id))!;
    expect(resultadoDe(fin, quien)).toBe('GANADA');
    expect(resultadoDe(fin, otro)).toBe('PERDIDA');
    const h = await svc.historialDe(quien);
    expect(h.porModalidad.CLASICA).toEqual({ jugadas: 1, ganadas: 1, ganadasPorAbandono: 0, perdidas: 0, abandonadas: 0 });
    expect(h.porModalidad.APUNTADO.jugadas).toBe(0);
    expect(h.recientes[0]).toMatchObject({ id, modalidad: 'CLASICA', resultado: 'GANADA', rivales: [expect.any(String)] });
  });

  it('una sala que nunca arranco no cuenta como partida jugada', async () => {
    const { svc } = await montar();
    const sala = await svc.crear('APUNTADO', 'c', 'Cami');
    await svc.abandonar(sala.id, 'c');
    expect((await svc.historialDe('c')).porModalidad.APUNTADO.jugadas).toBe(0);
    expect(armarHistorial([], 'c', ['X']).porModalidad.X.jugadas).toBe(0);
  });
});

describe('Mazo agotado', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('el tiempo agotado juega aunque no haya con que formar un mazo', async () => {
    const { repo, id } = await montar();
    const p = (await repo.cargar(id))!;
    p.mazo = []; p.pozo = p.pozo.slice(-1); await repo.guardar(p);
    await avanzar(TURNO + 1);
    const despues = (await repo.cargar(id))!;
    expect(despues.turno).toBe(1);
    expect(despues.jugadores[0].mano).toHaveLength(10);
  });

  it('al robar con el mazo vacio se baraja el pozo y la vista lo avisa una vez', async () => {
    const { svc, repo, id } = await montar();
    const p = (await repo.cargar(id))!;
    p.pozo = p.mazo.splice(0, 5).concat(p.pozo); p.mazo = []; await repo.guardar(p);
    const tras = await svc.robar(id, p.jugadores[p.turno].id, 'MAZO');
    expect(vistaPara(tras, 'a').barajado).toBe(true);
    expect(tras.mazo.length).toBeGreaterThan(0);
    const siguiente = await svc.descartar(id, tras.jugadores[tras.turno].id, tras.jugadores[tras.turno].mano[0].codigo());
    expect(vistaPara(siguiente, 'a').barajado).toBeUndefined();
  });
});
