import { Pool } from 'pg';
import { PartidaRepositoryPostgres } from '../../src/partidas/repositorio/PartidaRepositoryPostgres';
import { PartidaService } from '../../src/partidas/servicio/PartidaService';
import { MotorLogicaJuego } from '../../src/motor-reglas/MotorLogicaJuego';
import { crearRegistroPorDefecto } from '../../src/motor-reglas/registroPorDefecto';
import { BusEventos } from '../../src/compartido/BusEventos';
import { aleatorioConSemilla } from '../../src/partidas/modelo/Mazo';
import { UsuarioRepositoryPostgres } from '../../src/lobby/repositorio/UsuarioRepositoryPostgres';
import { LobbyService } from '../../src/lobby/servicio/LobbyService';
import { manoDesde } from '../../src/motor-reglas/Carta';

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

describeDb('Persistencia PostgreSQL', () => {
  const pool = new Pool({ connectionString: url });
  afterAll(() => pool.end());

  it('cierre de ronda atomico e idempotente (indice unico partida+ronda)', async () => {
    const repo = new PartidaRepositoryPostgres(pool);
    const svc = new PartidaService(repo, new MotorLogicaJuego(crearRegistroPorDefecto()), new BusEventos(), aleatorioConSemilla(7));
    const p = await svc.crear('APUNTADO', 'a', 'Ana');
    await svc.unirse(p.id, 'b', 'Beto');
    await svc.iniciar(p.id, 'a');
    const cargada = (await repo.cargar(p.id))!;
    cargada.jugadores[cargada.turno].mano = manoDesde('AC AD AT 2C 3C 4C 5D 6D 7D KC 3P');
    cargada.fase = 'DESCARTAR';
    await repo.guardar(cargada);
    const quien = cargada.jugadores[cargada.turno].id;
    const r = await Promise.allSettled([svc.cerrarRonda(p.id, quien, 1), svc.cerrarRonda(p.id, quien, 1)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const filas = await pool.query('SELECT count(*)::int AS n FROM ronda_cierre WHERE partida_id = $1::varchar', [p.id]);
    expect(filas.rows[0].n).toBe(1);
  });

  it('el indice unico impide registrar dos veces la misma ronda', async () => {
    const repo = new PartidaRepositoryPostgres(pool);
    const svc = new PartidaService(repo, new MotorLogicaJuego(crearRegistroPorDefecto()), new BusEventos());
    const p = await svc.crear('CLASICA', 'x', 'X');
    const cierre = { partidaId: p.id, ronda: 1, cierraId: 'x', deltas: { x: 10 }, snapshot: p };
    await repo.guardarCierreRonda(cierre);
    await expect(repo.guardarCierreRonda(cierre)).rejects.toMatchObject({ codigo: 'RONDA_YA_CERRADA' });
  });

  it('los usuarios sobreviven a un reinicio: el mismo nombre y PIN dan la misma identidad', async () => {
    const nombre = 'Pg' + Date.now().toString(36).slice(-8);
    const partidas = new PartidaService(new PartidaRepositoryPostgres(pool), new MotorLogicaJuego(crearRegistroPorDefecto()), new BusEventos());
    const antes = new LobbyService(new UsuarioRepositoryPostgres(pool), partidas);
    const ficha1 = (await antes.entrar(nombre, '1234')).id;
    const despues = new LobbyService(new UsuarioRepositoryPostgres(pool), partidas);   // "reinicio": sesiones nuevas, misma base
    const ficha2 = (await despues.entrar(nombre.toUpperCase(), '1234')).id;
    expect(despues.identidadDeSesion(ficha2)!.id).toBe(antes.identidadDeSesion(ficha1)!.id);
    await expect(despues.entrar(nombre, '0000')).rejects.toMatchObject({ codigo: 'PIN_INCORRECTO' });
  });

  it('el historial lee las partidas terminadas del jugador desde la base', async () => {
    const repo = new PartidaRepositoryPostgres(pool);
    const svc = new PartidaService(repo, new MotorLogicaJuego(crearRegistroPorDefecto()), new BusEventos(), aleatorioConSemilla(5));
    const quien = 'h' + Date.now().toString(36);
    const p = await svc.crear('CLASICA', quien, 'Hist');
    await svc.unirse(p.id, quien + 'r', 'Rival');
    await svc.iniciar(p.id, quien);
    await svc.abandonar(p.id, quien + 'r');
    const h = await svc.historialDe(quien);
    expect(h.porModalidad.CLASICA).toMatchObject({ jugadas: 1, ganadasPorAbandono: 1 });
  });
});
