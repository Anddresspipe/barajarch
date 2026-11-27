import { PartidaService } from '../../src/partidas/servicio/PartidaService';
import { PartidaRepositoryEnMemoria } from '../../src/partidas/repositorio/PartidaRepositoryEnMemoria';
import { MotorLogicaJuego } from '../../src/motor-reglas/MotorLogicaJuego';
import { crearRegistroPorDefecto } from '../../src/motor-reglas/registroPorDefecto';
import { BusEventos } from '../../src/compartido/BusEventos';
import { aleatorioConSemilla } from '../../src/partidas/modelo/Mazo';
import { vistaPara } from '../../src/partidas/servicio/VistaPartida';

const TURNO = 10_000;

function montar(turnoMs = TURNO) {
  const repo = new PartidaRepositoryEnMemoria();
  const svc = new PartidaService(repo, new MotorLogicaJuego(crearRegistroPorDefecto()), new BusEventos(), aleatorioConSemilla(7), turnoMs);
  return { repo, svc };
}
async function iniciada(modalidad = 'CLASICA', turnoMs = TURNO, extra: string[] = []) {
  const m = montar(turnoMs);
  const p = await m.svc.crear(modalidad, 'a', 'Ana');
  await m.svc.unirse(p.id, 'b', 'Beto');
  for (const x of extra) await m.svc.unirse(p.id, x, x);
  await m.svc.iniciar(p.id, 'a');
  return { ...m, id: p.id };
}
const avanzar = async (ms: number): Promise<void> => { await jest.advanceTimersByTimeAsync(ms); };

describe('Limite de tiempo por turno', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('la vista informa el tiempo restante y el reloj se reinicia en cada jugada', async () => {
    const { svc, id } = await iniciada();
    let p = await svc.obtener(id);
    expect(vistaPara(p, 'a').turnoRestanteMs).toBe(TURNO);
    await avanzar(4000);
    p = await svc.robar(id, 'a', 'MAZO');
    expect(vistaPara(p, 'a').turnoRestanteMs).toBe(TURNO);
  });

  it('si se acaba el tiempo el sistema juega por el jugador y pasa el turno', async () => {
    const { svc, id } = await iniciada();
    await avanzar(TURNO + 1);
    const p = await svc.obtener(id);
    expect(p.turno).toBe(1);
    expect(p.jugadores[0].mano).toHaveLength(10);
    expect(p.pozo).toHaveLength(2);
    expect(p.jugadores[0].inactividad).toBe(1);
    const v = vistaPara(p, 'b');
    expect(v.auto?.expulsado).toBe(false);
    expect(v.auto?.jugadorId).toBe(vistaPara(p, 'a').yo);
  });

  it('un jugador que juega a tiempo no acumula inactividad', async () => {
    const { svc, id, repo } = await iniciada();
    await avanzar(TURNO + 1);                                  // a vence
    await svc.robar(id, 'b', 'MAZO');
    const mano = (await repo.cargar(id))!.jugadores[1].mano[0].codigo();
    await svc.descartar(id, 'b', mano);
    await svc.robar(id, 'a', 'MAZO');                          // a vuelve a jugar
    expect((await repo.cargar(id))!.jugadores[0].inactividad).toBe(0);
  });

  it('tras varios turnos vencidos seguidos el jugador sale y, si queda uno solo, gana', async () => {
    const { svc, id } = await iniciada();
    for (let i = 0; i < 5; i++) await avanzar(TURNO + 1);
    const p = await svc.obtener(id);
    expect(p.estado).toBe('FINALIZADA');
    expect(p.ganadorId).toBeDefined();
    expect(p.jugadores.some((j) => j.abandono)).toBe(true);
  });

  it('con tres jugadores, quien se retira devuelve sus cartas al mazo y la partida sigue', async () => {
    const { svc, id } = await iniciada('CLASICA', TURNO, ['c']);
    const antes = (await svc.obtener(id)).mazo.length;
    await svc.abandonar(id, 'a');
    const p = await svc.obtener(id);
    expect(p.estado).toBe('EN_CURSO');
    expect(p.mazo.length).toBe(antes + 10);
    expect(p.turno).toBe(1);
    expect(p.jugadores[0].abandono).toBe(true);
  });

  it('sin limite configurado no se programa ningun reloj', async () => {
    const { svc, id } = await iniciada('CLASICA', 0);
    await avanzar(10 * TURNO);
    const p = await svc.obtener(id);
    expect(p.turno).toBe(0);
    expect(vistaPara(p, 'a').turnoRestanteMs).toBeUndefined();
  });

  it('al reiniciar el servidor se vuelven a armar los relojes de las partidas en curso', async () => {
    const { repo, id } = await iniciada();
    const nuevo = new PartidaService(repo, new MotorLogicaJuego(crearRegistroPorDefecto()), new BusEventos(), aleatorioConSemilla(1), TURNO);
    await nuevo.reanudarTemporizadores();
    await avanzar(TURNO + 1);
    expect((await repo.cargar(id))!.turno).toBe(1);
  });
});

describe('Volver a una partida', () => {
  it('partidasDe lista las partidas sin terminar del jugador y no las de otros', async () => {
    const { svc, id } = await iniciada('CLASICA', 0);
    expect((await svc.partidasDe('b')).map((p) => p.id)).toEqual([id]);
    expect(await svc.partidasDe('zzz')).toEqual([]);
  });

  it('abandonar una sala en espera libera el lugar; el admin pasa al siguiente y la sala vacia desaparece', async () => {
    const { svc } = montar(0);
    const p = await svc.crear('CLASICA', 'a', 'Ana');
    await svc.unirse(p.id, 'b', 'Beto');
    await svc.abandonar(p.id, 'a');
    let s = await svc.obtener(p.id);
    expect(s.adminId).toBe('b');
    expect(s.jugadores).toHaveLength(1);
    await svc.abandonar(p.id, 'b');
    s = await svc.obtener(p.id);
    expect(s.estado).toBe('FINALIZADA');
    expect(await svc.listarAbiertas()).toHaveLength(0);
  });

  it('quien no juega en la partida no puede abandonarla', async () => {
    const { svc, id } = await iniciada('CLASICA', 0);
    await expect(svc.abandonar(id, 'intruso')).rejects.toMatchObject({ codigo: 'NO_ES_JUGADOR' });
  });
});
