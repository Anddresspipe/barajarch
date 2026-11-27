import { PartidaService } from '../../src/partidas/servicio/PartidaService';
import { PartidaRepositoryEnMemoria } from '../../src/partidas/repositorio/PartidaRepositoryEnMemoria';
import { MotorLogicaJuego } from '../../src/motor-reglas/MotorLogicaJuego';
import { crearRegistroPorDefecto } from '../../src/motor-reglas/registroPorDefecto';
import { BusEventos } from '../../src/compartido/BusEventos';
import { aleatorioConSemilla } from '../../src/partidas/modelo/Mazo';
import { manoDesde } from '../../src/motor-reglas/Carta';
import { Partida } from '../../src/partidas/modelo/Partida';
import { vistaPara } from '../../src/partidas/servicio/VistaPartida';
import { ColaPorPartida } from '../../src/compartido/ColaPorPartida';

const MANO_APUNTADO = 'AC AD AT AP 2C 3C 4C 5D 6D 7D KC';   // cuarta + 2 ternas + descarte
const MANO_TOQUE = 'AC AD AT 2C 3C 4C 5D 6D 7D KC 3P';   // 3 ternas + sobrante de 3 puntos (se descarta la K)
const MANO_CLASICA = '7C 7D 7T 7P 2C 3C 4C 9D 10D JD KP';

function montar() {
  const repo = new PartidaRepositoryEnMemoria();
  const bus = new BusEventos();
  const eventos: string[] = [];
  bus.suscribir((e) => eventos.push(e.tipo));
  const svc = new PartidaService(repo, new MotorLogicaJuego(crearRegistroPorDefecto()), bus, aleatorioConSemilla(42));
  return { repo, svc, eventos };
}

async function cargarOFallar(repo: PartidaRepositoryEnMemoria, id: string): Promise<Partida> {
  const p = await repo.cargar(id);
  if (!p) throw new Error(`partida ${id} no existe`);
  return p;
}

async function iniciada(modalidad: string) {
  const { repo, svc, eventos } = montar();
  const p = await svc.crear(modalidad, 'a', 'Ana');
  await svc.unirse(p.id, 'b', 'Beto');
  await svc.iniciar(p.id, 'a');
  return { repo, svc, id: p.id, eventos };
}

/** Deja al jugador de turno con una mano de 11 cartas lista para cerrar. */
async function prepararCierre(repo: PartidaRepositoryEnMemoria, id: string, mano: string, ajuste?: (p: Partida) => void) {
  const p = await cargarOFallar(repo, id);
  p.jugadores[p.turno].mano = manoDesde(mano);
  p.fase = 'DESCARTAR';
  ajuste?.(p);
  await repo.guardar(p);
  return p.jugadores[p.turno].id;
}

describe('Ciclo de partida', () => {
  it('reparte 10 cartas, deja 1 en el pozo y arranca en ROBAR', async () => {
    const { svc, id } = await iniciada('CLASICA');
    const v = await svc.obtener(id);
    expect(v.jugadores.every((j) => j.mano.length === 10)).toBe(true);
    expect(v.pozo).toHaveLength(1);
    expect(v.mazo).toHaveLength(52 - 20 - 1);
    expect(v.fase).toBe('ROBAR');
  });

  it('turnos: robar luego descartar y pasa al siguiente', async () => {
    const { svc, id } = await iniciada('CLASICA');
    await svc.robar(id, 'a', 'MAZO');
    const p = await svc.obtener(id);
    const carta = p.jugadores[0].mano[0].codigo();
    const q = await svc.descartar(id, 'a', carta);
    expect(q.turno).toBe(1);
    expect(q.jugadores[0].mano).toHaveLength(10);
  });

  it('cada jugador muestra la ultima carta que descarto y se limpia al repartir otra ronda', async () => {
    const { svc, id } = await iniciada('CLASICA');
    expect(vistaPara(await svc.obtener(id), 'b').jugadores.every((j) => j.ultimoDescarte === undefined)).toBe(true);
    await svc.robar(id, 'a', 'MAZO');
    const carta = (await svc.obtener(id)).jugadores[0].mano[0].codigo();
    await svc.descartar(id, 'a', carta);
    const v = vistaPara(await svc.obtener(id), 'b');
    expect(v.jugadores[0].ultimoDescarte).toBe(carta);
    expect(v.jugadores[1].ultimoDescarte).toBeUndefined();
  });

  it('con comodines el mazo suma 4 cartas y la vista lo indica', async () => {
    const { svc } = montar();
    const sala = await svc.crear('CLASICA', 'a', 'Ana', true);
    await svc.unirse(sala.id, 'b', 'Beto');
    const p = await svc.iniciar(sala.id, 'a');
    expect(p.mazo).toHaveLength(56 - 20 - 1);
    expect(vistaPara(p, 'a').comodines).toBe(true);
    const sin = await iniciada('CLASICA');
    expect(vistaPara(await sin.svc.obtener(sin.id), 'a').comodines).toBe(false);
  });

  it('rechaza accion fuera de turno y fase incorrecta', async () => {
    const { svc, id } = await iniciada('CLASICA');
    await expect(svc.robar(id, 'b', 'MAZO')).rejects.toMatchObject({ codigo: 'NO_ES_TU_TURNO' });
    await expect(svc.descartar(id, 'a', 'AC')).rejects.toMatchObject({ codigo: 'FASE_INCORRECTA' });
  });

  it('solo el admin inicia y se requieren 2 jugadores', async () => {
    const { svc } = montar();
    const p = await svc.crear('CLASICA', 'a', 'Ana');
    await expect(svc.iniciar(p.id, 'a')).rejects.toMatchObject({ codigo: 'JUGADORES_INSUFICIENTES' });
    await svc.unirse(p.id, 'b', 'Beto');
    await expect(svc.iniciar(p.id, 'b')).rejects.toMatchObject({ codigo: 'NO_ES_ADMIN' });
  });

  it('sala llena a 4 jugadores', async () => {
    const { svc } = montar();
    const p = await svc.crear('APUNTADO', 'a', 'A');
    for (const j of ['b', 'c', 'd']) await svc.unirse(p.id, j, j);
    await expect(svc.unirse(p.id, 'e', 'E')).rejects.toMatchObject({ codigo: 'SALA_LLENA' });
  });

  it('recicla el pozo cuando se acaba el mazo', async () => {
    const { svc, repo, id } = await iniciada('CLASICA');
    const p = await cargarOFallar(repo, id);
    const resto = p.mazo; p.mazo = []; p.pozo = [...p.pozo, ...resto.slice(0, 5)];
    await repo.guardar(p);
    const q = await svc.robar(id, 'a', 'MAZO');
    expect(q.jugadores[0].mano).toHaveLength(11);
    expect(q.pozo).toHaveLength(1);
  });
});

describe('Codigo de sala', () => {
  it('es de 6 caracteres sin letras ambiguas y es unico', async () => {
    const { svc } = montar();
    const codigos = new Set<string>();
    for (let i = 0; i < 20; i++) codigos.add((await svc.crear('CLASICA', `u${i}`, `U${i}`)).id);
    expect(codigos.size).toBe(20);
    for (const c of codigos) expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
  });
});

describe('Cierre de ronda', () => {
  it('Clasica: cierre valido finaliza la partida', async () => {
    const { svc, repo, id } = await iniciada('CLASICA');
    const quien = await prepararCierre(repo, id, MANO_CLASICA);
    const p = await svc.cerrarRonda(id, quien, 1);
    expect(p.estado).toBe('FINALIZADA');
    expect(p.ganadorId).toBe(quien);
  });

  it('cierra con 10 cartas al empezar el turno, sin robar', async () => {
    const { svc, repo, id } = await iniciada('CLASICA');
    const quien = await prepararCierre(repo, id, 'AC AD AT AP 2C 3C 4C 5D 6D 7D', (p) => { p.fase = 'ROBAR'; });
    const p = await svc.cerrarRonda(id, quien, 1);
    expect(p.estado).toBe('FINALIZADA');
    expect(p.ganadorId).toBe(quien);
  });

  it('cierre incorrecto: resta 5 puntos, no revela que le falta y conserva su turno', async () => {
    const { svc, repo, id } = await iniciada('APUNTADO');
    const quien = await prepararCierre(repo, id, 'AC AD AT 2C 3C 4C 5D 6D 8D KC 3P');
    const err = await svc.cerrarRonda(id, quien, 1).catch((e) => e);
    expect(err).toMatchObject({ codigo: 'CIERRE_INVALIDO' });
    expect(err.message).toBe('Cierre incorrecto: pierdes 5 puntos');
    const p = await cargarOFallar(repo, id);
    expect(p.ronda).toBe(1);
    expect(p.jugadores.find((j) => j.id === quien)?.acumulado).toBe(-5);
    expect(p.jugadores[p.turno].id).toBe(quien);
    expect(p.fase).toBe('DESCARTAR');
  });

  it('cada cierre incorrecto vuelve a restar 5 puntos y en Clasica tambien cuenta', async () => {
    const { svc, repo, id } = await iniciada('CLASICA');
    const quien = await prepararCierre(repo, id, '7C 7D 7T 2C 3C 4C 9D 10D JD KP 5P');
    await svc.cerrarRonda(id, quien, 1).catch(() => undefined);
    await svc.cerrarRonda(id, quien, 1).catch(() => undefined);
    expect((await cargarOFallar(repo, id)).jugadores.find((j) => j.id === quien)?.acumulado).toBe(-10);
  });

  it('Apuntado: los cierres incorrectos pueden eliminar al jugador al llegar a -101', async () => {
    const { svc, repo, id } = await iniciada('APUNTADO');
    const quien = await prepararCierre(repo, id, 'AC AD AT 2C 3C 4C 5D 6D 8D KC 3P', (p) => { p.jugadores[p.turno].acumulado = -97; });
    await svc.cerrarRonda(id, quien, 1).catch(() => undefined);
    const p = await cargarOFallar(repo, id);
    expect(p.estado).toBe('FINALIZADA');
    expect(p.jugadores.find((j) => j.id === quien)?.eliminado).toBe(true);
    expect(p.ganadorId).not.toBe(quien);
  });

  it('Apuntado: cierre valido liquida y abre la ronda 2 conservando marcador', async () => {
    const { svc, repo, id } = await iniciada('APUNTADO');
    const quien = await prepararCierre(repo, id, MANO_APUNTADO);
    const p = await svc.cerrarRonda(id, quien, 1);
    expect(p.estado).toBe('EN_CURSO');
    expect(p.ronda).toBe(2);
    expect(p.jugadores.find((j) => j.id === quien)!.acumulado).toBe(10);
    expect(p.jugadores.find((j) => j.id !== quien)!.acumulado).toBeLessThan(0);
  });

  it.each(['CLASICA', 'APUNTADO'])('%s: dos cierres simultaneos de la misma ronda -> solo uno gana', async (mod) => {
    const { svc, repo, id } = await iniciada(mod);
    const quien = await prepararCierre(repo, id, mod === 'CLASICA' ? MANO_CLASICA : MANO_APUNTADO);
    const r = await Promise.allSettled([svc.cerrarRonda(id, quien, 1), svc.cerrarRonda(id, quien, 1)]);
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    const rechazo = r.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    expect(rechazo.reason.codigo).toBe('RONDA_YA_CERRADA');
  });

  it('Apuntado: cerrar con toque no suma, resta los puntos del sobrante', async () => {
    const { svc, repo, id } = await iniciada('APUNTADO');
    const quien = await prepararCierre(repo, id, MANO_TOQUE);
    const p = await svc.cerrarRonda(id, quien, 1);
    expect(p.ultimoCierre?.deltas[quien]).toBe(-3);
    expect(p.jugadores.find((j) => j.id === quien)!.acumulado).toBe(-3);
  });

  it('Apuntado: gana al llegar a 51 acumulados', async () => {
    const { svc, repo, id } = await iniciada('APUNTADO');
    const quien = await prepararCierre(repo, id, MANO_APUNTADO, (p) => { p.jugadores[p.turno].acumulado = 45; });
    const p = await svc.cerrarRonda(id, quien, 1);
    expect(p.estado).toBe('FINALIZADA');
    expect(p.ganadorId).toBe(quien);
  });

  it('Apuntado: eliminacion a -101 termina la partida si queda un jugador', async () => {
    const { svc, repo, id } = await iniciada('APUNTADO');
    const quien = await prepararCierre(repo, id, MANO_APUNTADO, (p) => {
      p.jugadores[(p.turno + 1) % p.jugadores.length].acumulado = -100;
    });
    const p = await svc.cerrarRonda(id, quien, 1);
    expect(p.jugadores.find((j) => j.id !== quien)!.eliminado).toBe(true);
    expect(p.estado).toBe('FINALIZADA');
  });

  it('emite eventos de dominio', async () => {
    const { eventos } = await iniciada('CLASICA');
    expect(eventos).toEqual(expect.arrayContaining(['SALA_CREADA', 'JUGADOR_UNIDO', 'PARTIDA_INICIADA']));
  });
});

describe('Vista por jugador (privacidad)', () => {
  it('no expone manos ajenas ni los ids reales (que actuan como credencial)', async () => {
    const { svc, id } = await iniciada('CLASICA');
    const v = vistaPara(await svc.obtener(id), 'a');
    const texto = JSON.stringify(v);
    expect(v.tuMano).toHaveLength(10);
    expect(v.jugadores.every((j) => j.cartas === 10)).toBe(true);
    expect(texto).not.toMatch(/"(a|b)"/);          // ningun id real
    expect(v.turnoDe).toBe(v.yo);                    // 'a' es quien inicia
    const otra = vistaPara(await svc.obtener(id), 'b');
    expect(otra.tuMano).not.toEqual(v.tuMano);
  });
});

describe('Resumen de la ronda cerrada', () => {
  it('Apuntado: queda el resumen de la ronda 1 aunque ya se reparta la 2, con ids publicos', async () => {
    const { svc, repo, id } = await iniciada('APUNTADO');
    const quien = await prepararCierre(repo, id, MANO_APUNTADO);
    const p = await svc.cerrarRonda(id, quien, 1);
    expect(p.ronda).toBe(2);
    expect(p.ultimoCierre?.ronda).toBe(1);
    expect(p.ultimoCierre?.deltas[quien]).toBe(10);
    expect(p.ultimoCierre?.manos[quien]).toHaveLength(11);
    const v = vistaPara(p, quien);
    expect(v.ultimoCierre?.cierraId).toBe(v.yo);
    expect(JSON.stringify(v.ultimoCierre)).not.toMatch(/"(a|b)"/);   // ningun id real
    expect(Object.keys(v.ultimoCierre?.manos ?? {})).toHaveLength(2);
  });

  it('Clasica: la partida termina pero el resumen del cierre tambien se conserva', async () => {
    const { svc, repo, id } = await iniciada('CLASICA');
    const quien = await prepararCierre(repo, id, MANO_CLASICA);
    const p = await svc.cerrarRonda(id, quien, 1);
    expect(p.estado).toBe('FINALIZADA');
    expect(p.ultimoCierre?.cierraId).toBe(quien);
  });
});

describe('Orden de la mano y ayuda de cierre', () => {
  it('la mano final se muestra en el orden que cada jugador tenia', async () => {
    const { svc, repo, id } = await iniciada('APUNTADO');
    const quien = await prepararCierre(repo, id, MANO_APUNTADO);
    const otro = quien === 'a' ? 'b' : 'a';
    const invertida = MANO_APUNTADO.split(' ').reverse();
    await svc.registrarOrden(id, quien, invertida);
    const p0 = await cargarOFallar(repo, id);
    const manoOtro = p0.jugadores.find((j) => j.id === otro)?.mano.map((c) => c.codigo()) ?? [];
    await svc.registrarOrden(id, otro, [...manoOtro].reverse());
    const p = await svc.cerrarRonda(id, quien, 1);
    expect(p.ultimoCierre?.manos[quien]).toEqual(invertida);
    expect(p.ultimoCierre?.manos[otro]).toEqual([...manoOtro].reverse());
  });

  it('cartas sin orden conocido van al final y las ajenas al jugador se ignoran', async () => {
    const { svc, repo, id } = await iniciada('CLASICA');
    const quien = await prepararCierre(repo, id, MANO_CLASICA);
    await svc.registrarOrden(id, quien, ['KP', 'ZZ', 'KP']);
    const p = await svc.cerrarRonda(id, quien, 1);
    const mano = p.ultimoCierre?.manos[quien] ?? [];
    expect(mano[0]).toBe('KP');
    expect(mano).toHaveLength(11);
    expect(new Set(mano).size).toBe(11);
  });

  it('rechaza ordenes mal formados y a quien no juega', async () => {
    const { svc, id } = await iniciada('CLASICA');
    await expect(svc.registrarOrden(id, 'a', 'x')).rejects.toMatchObject({ codigo: 'ORDEN_INVALIDO' });
    await expect(svc.registrarOrden(id, 'a', new Array(30).fill('AC'))).rejects.toMatchObject({ codigo: 'ORDEN_INVALIDO' });
    await expect(svc.registrarOrden(id, 'zzz', ['AC'])).rejects.toMatchObject({ codigo: 'NO_ES_JUGADOR' });
  });

  it('el orden no cambia la version de la partida', async () => {
    const { svc, id } = await iniciada('CLASICA');
    const antes = (await svc.obtener(id)).version;
    await svc.registrarOrden(id, 'a', ['AC']);
    expect((await svc.obtener(id)).version).toBe(antes);
  });

  it('la vista nunca dice si la mano esta lista para cerrar', async () => {
    const { svc, repo, id } = await iniciada('CLASICA');
    const quien = await prepararCierre(repo, id, MANO_CLASICA);
    const v = vistaPara(await cargarOFallar(repo, id), quien);
    expect(v).not.toHaveProperty('cierre');
    expect(JSON.stringify(v)).not.toMatch(/te falta|puedes cerrar/);
    expect(svc).toBeDefined();
  });
});

describe('Revancha sin pasar por el lobby', () => {
  async function terminada(modalidad = 'CLASICA') {
    const ctx = await iniciada(modalidad);
    const quien = await prepararCierre(ctx.repo, ctx.id, MANO_CLASICA);
    await ctx.svc.cerrarRonda(ctx.id, quien, 1);
    return ctx;
  }

  it('el primero abre la sala y, cuando entran todos los de la partida, arranca sola', async () => {
    const { svc, id } = await terminada();
    const sala = await svc.revancha(id, 'a', 'APUNTADO');
    expect(sala.estado).toBe('ESPERANDO');
    expect(sala.modalidad).toBe('APUNTADO');
    expect(sala.id).not.toBe(id);
    expect(sala.adminId).toBe('a');
    const lista = await svc.revancha(id, 'b', 'APUNTADO');
    expect(lista.id).toBe(sala.id);
    expect(lista.estado).toBe('EN_CURSO');
    expect(lista.jugadores.map((j) => j.nombre)).toEqual(['Ana', 'Beto']);
    expect(lista.jugadores.every((j) => j.mano.length === 10)).toBe(true);
  });

  it('se puede seguir en la misma modalidad; cada modalidad tiene su sala', async () => {
    const { svc, id } = await terminada();
    const igual = await svc.revancha(id, 'a', 'CLASICA');
    const otra = await svc.revancha(id, 'b', 'APUNTADO');
    expect(igual.modalidad).toBe('CLASICA');
    expect(otra.id).not.toBe(igual.id);
    expect(otra.estado).toBe('ESPERANDO');
  });

  it('pedirla dos veces no duplica al jugador ni abre otra sala', async () => {
    const { svc, id } = await terminada();
    const a1 = await svc.revancha(id, 'a', 'CLASICA');
    const a2 = await svc.revancha(id, 'a', 'CLASICA');
    expect(a2.id).toBe(a1.id);
    expect(a2.jugadores).toHaveLength(1);
  });

  describe('traspaso de puntos', () => {
    it('si todos aceptan, Apuntado arranca con los acumulados de la ultima ronda de Clasica', async () => {
      const { svc, id } = await terminada();
      const fin = await svc.obtener(id);
      const puntos = Object.fromEntries(fin.jugadores.map((j) => [j.id, j.acumulado]));
      expect(Object.values(puntos).some((x) => x !== 0)).toBe(true);
      await svc.revancha(id, 'a', 'APUNTADO', true);
      const sala = await svc.revancha(id, 'b', 'APUNTADO', true);
      expect(sala.estado).toBe('EN_CURSO');
      expect(Object.fromEntries(sala.jugadores.map((j) => [j.id, j.acumulado]))).toEqual(puntos);
    });

    it('si alguien no acepta, todos empiezan de cero', async () => {
      const { svc, id } = await terminada();
      await svc.revancha(id, 'a', 'APUNTADO', true);
      const sala = await svc.revancha(id, 'b', 'APUNTADO', false);
      expect(sala.estado).toBe('EN_CURSO');
      expect(sala.jugadores.map((j) => j.acumulado)).toEqual([0, 0]);
    });

    it('quien entra sin votar (por el lobby) tampoco da la unanimidad', async () => {
      const { svc, id } = await terminada();
      const sala = await svc.revancha(id, 'a', 'APUNTADO', true);
      await svc.unirse(sala.id, 'c', 'Carla');
      const iniciada = await svc.iniciar(sala.id, 'a');
      expect(iniciada.jugadores.map((j) => j.acumulado)).toEqual([0, 0]);
    });

    it('la vista cuenta cuantos aceptan y la partida terminada dice a que modalidades se pueden traspasar', async () => {
      const { svc, id } = await terminada();
      const fin = await svc.obtener(id);
      expect(svc.traspasables(fin)).toEqual(['APUNTADO']);
      const sala = await svc.revancha(id, 'a', 'APUNTADO', true);
      expect(svc.herenciaPendiente(sala)).toEqual({ aceptan: 1, total: 1 });
      const cambia = await svc.revancha(id, 'a', 'APUNTADO', false);
      expect(svc.herenciaPendiente(cambia)).toEqual({ aceptan: 0, total: 1 });
    });

    it('desde Apuntado no se ofrece traspasar: Clasica no acumula historial', async () => {
      const { svc, id } = await terminada();
      const fin = await svc.obtener(id);
      fin.modalidad = 'APUNTADO';
      expect(svc.traspasables(fin)).toEqual([]);
    });

    it('no aplica a la misma modalidad', async () => {
      const { svc, id } = await terminada();
      await svc.revancha(id, 'a', 'CLASICA', true);
      const igual = await svc.revancha(id, 'b', 'CLASICA', true);
      expect(igual.jugadores.map((j) => j.acumulado)).toEqual([0, 0]);
      expect(svc.herenciaPendiente(igual)).toBeUndefined();
    });
  });

  it('solo desde una partida terminada y solo para quien jugo', async () => {
    const { svc, id } = await iniciada('CLASICA');
    await expect(svc.revancha(id, 'a', 'CLASICA')).rejects.toMatchObject({ codigo: 'REVANCHA_NO_DISPONIBLE' });
    const fin = await terminada();
    await expect(fin.svc.revancha(fin.id, 'intruso', 'CLASICA')).rejects.toMatchObject({ codigo: 'NO_ES_JUGADOR' });
    await expect(fin.svc.revancha(fin.id, 'a', 'POKER')).rejects.toMatchObject({ codigo: 'MODALIDAD_DESCONOCIDA' });
  });
});

describe('Reverso elegido por cada jugador', () => {
  it('lo que elige un jugador lo ven los demas en la vista, solo en sus cartas', async () => {
    const { svc, id } = await iniciada('CLASICA');
    const antes = (await svc.obtener(id)).version;
    const p = await svc.cambiarReverso(id, 'a', 'burdeos');
    expect(p.version).toBe(antes + 1);
    const vistaDeBeto = vistaPara(p, 'b');
    expect(vistaDeBeto.jugadores.find((j) => j.nombre === 'Ana')?.reverso).toBe('burdeos');
    expect(vistaDeBeto.jugadores.find((j) => j.nombre === 'Beto')?.reverso).toBeUndefined();
  });

  it('repetir el mismo valor no escribe ni sube la version; vale tambien con la partida terminada', async () => {
    const { svc, repo, id } = await iniciada('CLASICA');
    await svc.cambiarReverso(id, 'a', 'bosque');
    const v = (await svc.obtener(id)).version;
    expect((await svc.cambiarReverso(id, 'a', 'bosque')).version).toBe(v);
    const quien = await prepararCierre(repo, id, MANO_CLASICA);
    await svc.cerrarRonda(id, quien, 1);
    expect((await svc.cambiarReverso(id, 'b', 'liso')).estado).toBe('FINALIZADA');
  });

  it('rechaza disenos con formato raro y a quien no juega', async () => {
    const { svc, id } = await iniciada('CLASICA');
    for (const malo of ['', 'A B', '<img src=x>', 'x'.repeat(21), 5, null, { a: 1 }]) {
      await expect(svc.cambiarReverso(id, 'a', malo)).rejects.toMatchObject({ codigo: 'DISENO_INVALIDO' });
    }
    await expect(svc.cambiarReverso(id, 'intruso', 'azul')).rejects.toMatchObject({ codigo: 'NO_ES_JUGADOR' });
  });
});

describe('Limites de salas abiertas', () => {
  it('un jugador no puede acumular salas esperando indefinidamente', async () => {
    const { svc } = montar();
    for (let i = 0; i < 3; i++) await svc.crear('CLASICA', 'a', 'Ana');
    await expect(svc.crear('CLASICA', 'a', 'Ana')).rejects.toMatchObject({ codigo: 'DEMASIADAS_SALAS' });
    await expect(svc.crear('CLASICA', 'b', 'Beto')).resolves.toBeDefined();   // el tope es por jugador
  });

  it('obtenerComoJugador solo responde a quien participa', async () => {
    const { svc, id } = await iniciada('CLASICA');
    await expect(svc.obtenerComoJugador(id, 'a')).resolves.toBeDefined();
    await expect(svc.obtenerComoJugador(id, 'intruso')).rejects.toMatchObject({ codigo: 'NO_ES_JUGADOR' });
  });
});

describe('Version de la vista', () => {
  it('cada accion sube la version y la vista la expone para que el cliente descarte repetidas y viejas', async () => {
    const { svc, id } = await iniciada('CLASICA');
    const antes = vistaPara(await svc.obtener(id), 'a').version;
    await svc.robar(id, 'a', 'MAZO');
    const despues = vistaPara(await svc.obtener(id), 'a').version;
    expect(despues).toBe(antes + 1);
    expect(vistaPara(await svc.obtener(id), 'b').version).toBe(despues);
  });
});

describe('Persistencia y utilidades', () => {
  it('lo guardado se restaura con cartas que siguen siendo Carta (no objetos planos)', async () => {
    const { repo, svc, id } = await iniciada('CLASICA');
    const p = await cargarOFallar(repo, id);
    expect(p.jugadores[0].mano[0].puntos()).toBeGreaterThan(0);
    expect(p.mazo[0].codigo()).toMatch(/^(A|[2-9]|10|J|Q|K)[CDTP]$/);
    expect((await svc.obtener(id)).version).toBe(p.version);
  });

  it('solo se listan las salas en espera', async () => {
    const { repo, svc, id } = await iniciada('CLASICA');
    await svc.crear('APUNTADO', 'z', 'Zeta');
    const abiertas = await repo.listarPorEstado('ESPERANDO');
    expect(abiertas).toHaveLength(1);
    expect(abiertas.some((x) => x.id === id)).toBe(false);
  });

  it('la cola por partida libera su entrada al terminar y sigue ordenando', async () => {
    const cola = new ColaPorPartida();
    const orden: number[] = [];
    await Promise.allSettled([
      cola.ejecutar('p', async () => { await new Promise((r) => setTimeout(r, 20)); orden.push(1); }),
      cola.ejecutar('p', async () => { throw new Error('falla'); }),
      cola.ejecutar('p', async () => { orden.push(3); }),
    ]);
    expect(orden).toEqual([1, 3]);
    expect((cola as unknown as { colas: Map<string, unknown> }).colas.size).toBe(0);
  });
});
