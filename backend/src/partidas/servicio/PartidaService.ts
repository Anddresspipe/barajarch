import { randomInt } from 'crypto';
import { Carta } from '../../motor-reglas/Carta';
import { MotorLogicaJuego } from '../../motor-reglas/MotorLogicaJuego';
import { BusEventos } from '../../compartido/BusEventos';
import { ColaPorPartida } from '../../compartido/ColaPorPartida';
import { ErrorDominio } from '../../compartido/tipos';
import { Presencia } from '../../compartido/Presencia';
import { IPartidaRepository } from '../repositorio/IPartidaRepository';
import { Partida, Jugador, MIN_JUGADORES, MAX_JUGADORES } from '../modelo/Partida';
import { armarHistorial, HistorialJugador } from './Historial';
import { Aleatorio, barajar, nuevoMazo } from '../modelo/Mazo';

export type OrigenRobo = 'MAZO' | 'POZO';
const MAX_CARTAS_ORDEN = 20;
const FORMATO_DISENO = /^[a-z0-9-]{1,20}$/;   // identificador de diseño de reverso: el servidor no conoce los diseños, solo los reparte
/** Puntos que pierde quien pulsa Cerrar sin tener la mano lista (el juego no le avisa que le falta nada). */
export const PENALIZACION_CIERRE_FALLIDO = 5;
const MAX_SALAS_POR_ADMIN = 3;     // salas abiertas que un mismo jugador puede tener esperando
const MAX_INACTIVIDAD = 3;         // turnos seguidos vencidos tras los que el jugador sale de la partida
const MAX_HISTORIAL = 500;         // partidas terminadas que se revisan para las estadisticas de un jugador
const MAX_SALAS_ABIERTAS = 500;    // las salas que nadie inicia no caducan: sin tope se acumularian sin limite

export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LARGO_CODIGO = 6;

export class PartidaService {
  private readonly cola = new ColaPorPartida();
  private readonly revanchas = new Map<string, string>();   // `${partida}:${modalidad}` -> sala de revancha
  /** Sala de revancha -> puntos de la partida anterior y quien acepta conservarlos. */
  private readonly herencias = new Map<string, { puntos: Record<string, number>; acepta: Map<string, boolean> }>();
  private readonly ordenes = new Map<string, Map<string, string[]>>();   // partida -> jugador -> orden de su mano
  private readonly relojes = new Map<string, NodeJS.Timeout>();   // partida -> temporizador del turno en curso
  private readonly esperasAbandono = new Map<string, NodeJS.Timeout>();   // partida -> cuenta atras de una partida sin nadie conectado

  constructor(
    private readonly repo: IPartidaRepository,
    private readonly motor: MotorLogicaJuego,
    private readonly bus: BusEventos,
    private readonly azar: Aleatorio = Math.random,
    /** Tiempo maximo por turno en ms; 0 = sin limite. */
    private readonly turnoMs = 0,
    private readonly presencia: Presencia = new Presencia(),
    /** Tiempo que una partida en curso puede quedar sin ningun jugador conectado antes de darse por abandonada. */
    private readonly abandonoTotalMs = 300_000,
  ) {
    presencia.alCambiar((jugadorId) => {
      this.alCambiarPresencia(jugadorId).catch((e) => console.error('presencia: fallo', e));
    });
  }

  /** Jugadores de la partida con alguna conexion abierta (para mostrar quien esta y para pausar el reloj). */
  conectadosDe(p: Partida): ReadonlySet<string> {
    return new Set(p.jugadores.filter((j) => this.presencia.estaConectado(j.id)).map((j) => j.id));
  }

  private sinNadie(p: Partida): boolean { return !this.presencia.hayAlguien(p.jugadores.filter((j) => !j.abandono).map((j) => j.id)); }

  /**
   * Con alguien conectado el reloj corre; sin nadie queda en pausa y empieza la cuenta atras del abandono total.
   * Al volver el primero, el turno actual empieza de nuevo (el tiempo que nadie estuvo no se le cobra a nadie).
   */
  private async alCambiarPresencia(jugadorId: string): Promise<void> {
    for (const { id } of await this.repo.listarDeJugador(jugadorId)) {
      await this.cola.ejecutar(id, async () => {
        const p = await this.repo.cargar(id);
        if (!p || p.estado !== 'EN_CURSO') return;
        const pausada = !this.relojes.has(id) && this.turnoMs > 0;
        if (!this.sinNadie(p) && pausada) { await this.persistir(p, 'PRESENCIA'); return; }
        this.programar(p);
        this.emitir(p, 'PRESENCIA');
      });
    }
  }

  /** Nadie volvio a tiempo: la partida termina sin ganador y cuenta como derrota para todos. */
  private abandonoTotal(id: string): Promise<void> {
    return this.cola.ejecutar(id, async () => {
      const p = await this.repo.cargar(id);
      if (!p || p.estado !== 'EN_CURSO' || !this.sinNadie(p)) return;
      p.fin = 'ABANDONO_TOTAL';
      this.terminar(p, undefined);
      await this.persistir(p, 'PARTIDA_ABANDONADA');
    });
  }

  /** Tras un reinicio los temporizadores se perdieron: se vuelven a armar (sin nadie conectado, solo corre la cuenta del abandono total). */
  async reanudarTemporizadores(): Promise<void> {
    for (const p of await this.repo.listarPorEstado('EN_CURSO')) this.programar(p);
  }

  /** Partidas sin terminar de un jugador: lo que necesita para volver a ellas tras recargar o cambiar de pantalla. */
  partidasDe(jugadorId: string): Promise<Partida[]> { return this.repo.listarDeJugador(jugadorId); }

  /** Estadisticas por modalidad y ultimas partidas de un jugador (de las ultimas MAX_HISTORIAL terminadas). */
  async historialDe(jugadorId: string): Promise<HistorialJugador> {
    return armarHistorial(await this.repo.listarTerminadasDeJugador(jugadorId, MAX_HISTORIAL), jugadorId, this.motor.modalidades());
  }

  /**
   * Salir de una sala que aun no inicio (deja su lugar; si era el admin pasa al siguiente y si queda vacia se cierra)
   * o abandonar una partida en curso (se retira y el resto sigue).
   */
  abandonar(id: string, jugadorId: string): Promise<Partida> {
    return this.cola.ejecutar(id, async () => {
      const p = await this.cargar(id);
      const i = p.jugadores.findIndex((j) => j.id === jugadorId);
      if (i < 0) throw new ErrorDominio('NO_ES_JUGADOR', 'No participas en esta partida');
      if (p.estado === 'FINALIZADA') return p;
      if (p.estado === 'ESPERANDO') this.salirDeSala(p, i);
      else this.retirar(p, jugadorId);
      return this.persistir(p, 'JUGADOR_SALIO');
    });
  }

  private salirDeSala(p: Partida, i: number): void {
    p.jugadores.splice(i, 1);
    if (p.jugadores.length === 0) { p.estado = 'FINALIZADA'; return; }
    if (!p.jugadores.some((j) => j.id === p.adminId)) p.adminId = p.jugadores[0].id;
  }


  listarAbiertas(): Promise<Partida[]> { return this.repo.listarPorEstado('ESPERANDO'); }
  obtener(id: string): Promise<Partida> { return this.cargar(id); }

  /** Consulta de un participante: quien no juega en la partida no la ve ni se suscribe a sus cambios. */
  async obtenerComoJugador(id: string, jugadorId: string): Promise<Partida> {
    const p = await this.cargar(id);
    if (!p.jugadores.some((j) => j.id === jugadorId)) throw new ErrorDominio('NO_ES_JUGADOR', 'No participas en esta partida');
    return p;
  }

  async crear(modalidad: string, adminId: string, nombre: string, comodines = false): Promise<Partida> {
    this.motor.cartasPorMano(modalidad); // valida que la modalidad exista
    const abiertas = await this.repo.listarPorEstado('ESPERANDO');
    if (abiertas.length >= MAX_SALAS_ABIERTAS) throw new ErrorDominio('DEMASIADAS_SALAS', 'Hay demasiadas salas abiertas, intenta más tarde');
    if (abiertas.filter((a) => a.adminId === adminId).length >= MAX_SALAS_POR_ADMIN) {
      throw new ErrorDominio('DEMASIADAS_SALAS', 'Ya tienes varias salas esperando jugadores');
    }
    const p: Partida = {
      id: await this.nuevoCodigo(), modalidad, adminId, estado: 'ESPERANDO', ...(comodines ? { comodines: true } : {}),
      jugadores: [this.nuevoJugador(adminId, nombre)], mazo: [], pozo: [], turno: 0,
      fase: 'ROBAR', ronda: 0, version: 0,
    };
    await this.repo.guardar(p);
    this.emitir(p, 'SALA_CREADA');
    return p;
  }

  unirse(id: string, jugadorId: string, nombre: string): Promise<Partida> {
    return this.mutar(id, (p) => {
      if (p.estado !== 'ESPERANDO') throw new ErrorDominio('PARTIDA_YA_INICIADA', 'La partida ya inició');
      if (p.jugadores.some((j) => j.id === jugadorId)) return;
      if (p.jugadores.length >= MAX_JUGADORES) throw new ErrorDominio('SALA_LLENA', 'Sala llena');
      p.jugadores.push(this.nuevoJugador(jugadorId, nombre));
    }, 'JUGADOR_UNIDO');
  }

  iniciar(id: string, jugadorId: string): Promise<Partida> {
    return this.mutar(id, (p) => {
      if (p.adminId !== jugadorId) throw new ErrorDominio('NO_ES_ADMIN', 'Solo el administrador inicia');
      if (p.estado !== 'ESPERANDO') throw new ErrorDominio('PARTIDA_YA_INICIADA', 'Ya iniciada');
      if (p.jugadores.length < MIN_JUGADORES) throw new ErrorDominio('JUGADORES_INSUFICIENTES', 'Se requieren al menos 2 jugadores');
      this.heredarSiHayUnanimidad(p);
      p.estado = 'EN_CURSO';
      this.repartir(p);
    }, 'PARTIDA_INICIADA');
  }

  /**
   * Seguir jugando con los mismos jugadores sin pasar por el lobby, en la misma modalidad o en otra.
   * El primero que elige una modalidad abre la sala; los demas que eligen la misma entran en ella, y
   * cuando estan todos los de la partida anterior arranca sola.
   */
  revancha(id: string, jugadorId: string, modalidad: string, conservar = false): Promise<Partida> {
    return this.cola.ejecutar(id, async () => {
      const previa = await this.cargar(id);
      const yo = previa.jugadores.find((j) => j.id === jugadorId);
      if (!yo) throw new ErrorDominio('NO_ES_JUGADOR', 'No participaste en esa partida');
      if (previa.estado !== 'FINALIZADA') throw new ErrorDominio('REVANCHA_NO_DISPONIBLE', 'La partida aún no termina');
      const clave = `${id}:${modalidad}`;
      const sala = await this.salaDeRevancha(clave, jugadorId, yo.nombre, modalidad, previa.comodines === true);
      if (sala.estado === 'ESPERANDO' && this.puedeHeredar(previa.modalidad, modalidad)) {
        this.votarHerencia(sala.id, previa, jugadorId, conservar);
      }
      if (sala.estado === 'ESPERANDO' && sala.jugadores.length >= previa.jugadores.filter((j) => !j.abandono).length) {
        return this.iniciar(sala.id, sala.adminId);
      }
      return sala;
    });
  }

  /** Los puntos solo se traspasan al cambiar de modalidad hacia una que acumula historial. */
  private puedeHeredar(origen: string, destino: string): boolean {
    return origen !== destino && this.motor.modalidadesConHistorial().includes(destino);
  }

  private votarHerencia(salaId: string, previa: Partida, jugadorId: string, conservar: boolean): void {
    const h = this.herencias.get(salaId) ?? {
      puntos: Object.fromEntries(previa.jugadores.map((j) => [j.id, j.acumulado])),
      acepta: new Map<string, boolean>(),
    };
    h.acepta.set(jugadorId, conservar);
    this.herencias.set(salaId, h);
  }

  /** Decision unanime: si todos los que van a jugar aceptaron, conservan los puntos; si no, empiezan de cero. */
  private heredarSiHayUnanimidad(p: Partida): void {
    const h = this.herencias.get(p.id);
    this.herencias.delete(p.id);
    if (!h || !p.jugadores.every((j) => h.acepta.get(j.id) === true)) return;
    for (const j of p.jugadores) j.acumulado = h.puntos[j.id] ?? 0;
  }

  /** Estado de la votacion de una sala de revancha, para mostrarlo a quienes esperan. */
  herenciaPendiente(p: Partida): { aceptan: number; total: number } | undefined {
    const h = this.herencias.get(p.id);
    if (!h || p.estado !== 'ESPERANDO') return undefined;
    return { aceptan: p.jugadores.filter((j) => h.acepta.get(j.id) === true).length, total: p.jugadores.length };
  }

  /** Modalidades a las que se pueden traspasar los puntos de una partida terminada. */
  traspasables(p: Partida): string[] {
    return p.estado === 'FINALIZADA' ? this.motor.modalidadesConHistorial().filter((m) => this.puedeHeredar(p.modalidad, m)) : [];
  }

  private async salaDeRevancha(clave: string, jugadorId: string, nombre: string, modalidad: string, comodines: boolean): Promise<Partida> {
    const existente = this.revanchas.get(clave);
    const abierta = existente ? await this.repo.cargar(existente) : undefined;
    if (abierta && abierta.estado === 'ESPERANDO') return this.unirse(abierta.id, jugadorId, nombre);
    if (abierta && abierta.jugadores.some((j) => j.id === jugadorId)) return abierta;   // ya arranco con el: se queda en ella
    const nueva = await this.crear(modalidad, jugadorId, nombre, comodines);
    this.revanchas.set(clave, nueva.id);
    return nueva;
  }

  robar(id: string, jugadorId: string, origen: OrigenRobo): Promise<Partida> {
    return this.mutar(id, (p) => {
      this.exigirTurno(p, jugadorId, 'ROBAR');
      this.jugadorActual(p).inactividad = 0;
      const carta = origen === 'POZO' ? this.tomarPozo(p) : this.tomarMazo(p);
      this.jugadorActual(p).mano.push(carta);
      p.fase = 'DESCARTAR';
    }, 'CARTA_ROBADA');
  }

  descartar(id: string, jugadorId: string, codigo: string): Promise<Partida> {
    return this.mutar(id, (p) => {
      this.exigirTurno(p, jugadorId, 'DESCARTAR');
      const mano = this.jugadorActual(p).mano;
      const i = mano.findIndex((c) => c.codigo() === codigo);
      if (i < 0) throw new ErrorDominio('CARTA_NO_EN_MANO', 'No tienes esa carta');
      const carta = mano.splice(i, 1)[0];
      p.pozo.push(carta);
      this.jugadorActual(p).ultimoDescarte = carta.codigo();
      p.turno = this.siguienteTurno(p);
      p.fase = 'ROBAR';
    }, 'CARTA_DESCARTADA');
  }

  /**
   * El orden de la mano lo decide cada cliente; se recuerda (solo en memoria, sin versionar ni difundir)
   * para mostrar las manos finales tal como cada jugador las tenia. Pasa por la cola para quedar
   * ordenado respecto de un cierre que llegue justo despues.
   */
  registrarOrden(id: string, jugadorId: string, codigos: unknown): Promise<Partida> {
    return this.cola.ejecutar(id, async () => {
      const p = await this.cargar(id);
      if (!p.jugadores.some((j) => j.id === jugadorId)) throw new ErrorDominio('NO_ES_JUGADOR', 'No participas en esta partida');
      if (!Array.isArray(codigos) || codigos.length > MAX_CARTAS_ORDEN || !codigos.every((c) => typeof c === 'string' && c.length <= 3)) {
        throw new ErrorDominio('ORDEN_INVALIDO', 'Orden de mano inválido');
      }
      const porJugador = this.ordenes.get(id) ?? new Map<string, string[]>();
      porJugador.set(jugadorId, codigos);
      this.ordenes.set(id, porJugador);
      return p;
    });
  }

  /**
   * El reverso de MIS cartas lo elijo yo y lo ven los demas. Se puede cambiar en cualquier momento
   * (incluso con la partida terminada), por eso no pasa por `mutar`; si no cambia nada, no escribe.
   */
  cambiarReverso(id: string, jugadorId: string, valor: unknown): Promise<Partida> {
    return this.cola.ejecutar(id, async () => {
      const p = await this.cargar(id);
      const yo = p.jugadores.find((j) => j.id === jugadorId);
      if (!yo) throw new ErrorDominio('NO_ES_JUGADOR', 'No participas en esta partida');
      if (typeof valor !== 'string' || !FORMATO_DISENO.test(valor)) throw new ErrorDominio('DISENO_INVALIDO', 'Diseño de reverso inválido');
      if (yo.reverso === valor) return p;
      yo.reverso = valor;
      p.version++;
      await this.repo.guardar(p);
      this.emitir(p, 'REVERSO_CAMBIADO');
      return p;
    });
  }

  /** Cierre de ronda. `rondaEsperada` hace la operacion idempotente ante cierres simultaneos. */
  cerrarRonda(id: string, jugadorId: string, rondaEsperada: number): Promise<Partida> {
    return this.cola.ejecutar(id, async () => {
      const p = await this.cargar(id);
      if (p.ronda !== rondaEsperada || p.estado === 'FINALIZADA') {
        throw new ErrorDominio('RONDA_YA_CERRADA', 'La ronda ya fue cerrada');
      }
      this.exigirTurno(p, jugadorId);   // se cierra al empezar el turno (10 cartas) o tras robar (11)
      const v = this.motor.validarCierre(p.modalidad, this.jugadorActual(p).mano);
      if (!v.valido) return this.penalizarCierreFallido(p, jugadorId);
      this.jugadorActual(p).inactividad = 0;
      this.liquidar(p, jugadorId);
      p.version++;
      if (this.turnoMs > 0 && p.estado === 'EN_CURSO') p.turnoLimite = Date.now() + this.turnoMs; else delete p.turnoLimite;
      await this.repo.guardarCierreRonda({
        partidaId: p.id, ronda: rondaEsperada, cierraId: jugadorId,
        deltas: p.ultimoCierre?.deltas ?? {}, snapshot: p,
      });
      this.programar(p);
      this.emitir(p, 'RONDA_CERRADA');
      return p;
    });
  }

  /** Cierre incorrecto: resta puntos, puede eliminarlo (Apuntado), avisa a todos y le responde con un error al que cerro. */
  private async penalizarCierreFallido(p: Partida, jugadorId: string): Promise<never> {
    const j = this.jugadorActual(p);
    j.acumulado -= PENALIZACION_CIERRE_FALLIDO;
    j.inactividad = 0;
    if (this.motor.debeEliminar(p.modalidad, j.acumulado)) this.retirar(p, jugadorId, false);
    await this.persistir(p, 'CIERRE_FALLIDO');
    throw new ErrorDominio('CIERRE_INVALIDO', `Cierre incorrecto: pierdes ${PENALIZACION_CIERRE_FALLIDO} puntos`);
  }

  // ---- helpers privados ----
  /** Codigo de sala de 6 caracteres, sin letras ni cifras que se confunden (0/O, 1/I/L), que los jugadores se dictan o escriben. */
  private async nuevoCodigo(): Promise<string> {
    for (;;) {
      const c = Array.from({ length: LARGO_CODIGO }, () => ALFABETO_CODIGO[randomInt(ALFABETO_CODIGO.length)]).join('');
      if (!(await this.repo.cargar(c))) return c;
    }
  }

  private nuevoJugador(id: string, nombre: string): Jugador {
    return { id, nombre, mano: [], acumulado: 0, eliminado: false };
  }

  private async cargar(id: string): Promise<Partida> {
    const p = await this.repo.cargar(id);
    if (!p) throw new ErrorDominio('PARTIDA_NO_ENCONTRADA', 'Partida no existe');
    return p;
  }

  private mutar(id: string, fn: (p: Partida) => void, evento: string): Promise<Partida> {
    return this.cola.ejecutar(id, async () => {
      const p = await this.cargar(id);
      if (p.estado === 'FINALIZADA') throw new ErrorDominio('PARTIDA_FINALIZADA', 'La partida terminó');
      fn(p);
      return this.persistir(p, evento);
    });
  }

  /** Version nueva, reloj del turno, guardado y aviso. Todo cambio de estado de juego termina aqui. */
  private async persistir(p: Partida, evento: string): Promise<Partida> {
    p.version++;
    if (this.turnoMs > 0 && p.estado === 'EN_CURSO') p.turnoLimite = Date.now() + this.turnoMs; else delete p.turnoLimite;
    await this.repo.guardar(p);
    this.programar(p);
    this.emitir(p, evento);
    return p;
  }

  private programar(p: Partida): void {
    this.detenerRelojes(p.id);
    if (p.estado !== 'EN_CURSO') return;
    if (this.sinNadie(p)) { this.armar(this.esperasAbandono, p.id, this.abandonoTotalMs, () => this.abandonoTotal(p.id)); return; }
    if (this.turnoMs <= 0) return;
    const restante = Math.max(0, (p.turnoLimite ?? Date.now() + this.turnoMs) - Date.now());
    const version = p.version;
    this.armar(this.relojes, p.id, restante, () => this.vencerTurno(p.id, version));
  }

  private armar(donde: Map<string, NodeJS.Timeout>, id: string, ms: number, accion: () => Promise<void>): void {
    const t = setTimeout(() => { accion().catch((e) => console.error('temporizador: fallo', e)); }, ms);
    t.unref();   // un temporizador pendiente no debe impedir que el proceso termine
    donde.set(id, t);
  }

  private detenerRelojes(id: string): void {
    for (const m of [this.relojes, this.esperasAbandono]) { clearTimeout(m.get(id)); m.delete(id); }
  }

  /**
   * Se acabo el tiempo: el sistema juega por quien tenia el turno (roba del mazo y suelta la carta que menos estorba).
   * Si la partida ya cambio (`version` distinta) el aviso llega tarde y no se hace nada.
   */
  private vencerTurno(id: string, version: number): Promise<void> {
    return this.cola.ejecutar(id, async () => {
      const p = await this.repo.cargar(id);
      if (!p || p.estado !== 'EN_CURSO' || p.version !== version) return;
      const actual = this.jugadorActual(p);
      actual.inactividad = (actual.inactividad ?? 0) + 1;
      const expulsado = actual.inactividad >= MAX_INACTIVIDAD;
      if (expulsado) this.retirar(p, actual.id);
      else this.jugarPorTiempo(p);
      p.ultimaAuto = { jugadorId: actual.id, version: p.version + 1, expulsado };
      await this.persistir(p, 'TURNO_VENCIDO');
    });
  }

  private jugarPorTiempo(p: Partida): void {
    const actual = this.jugadorActual(p);
    if (p.fase === 'ROBAR') { actual.mano.push(this.cartaParaRobar(p)); p.fase = 'DESCARTAR'; }
    const carta = actual.mano.splice(this.motor.mejorDescarte(p.modalidad, actual.mano), 1)[0];
    p.pozo.push(carta);
    actual.ultimoDescarte = carta.codigo();
    p.turno = this.siguienteTurno(p);
    p.fase = 'ROBAR';
  }

  /** El jugador sale de la partida en curso: sus cartas vuelven al fondo del mazo y, si quedaba el turno en el, pasa al siguiente. */
  private retirar(p: Partida, jugadorId: string, porAbandono = true): void {
    const j = p.jugadores.find((x) => x.id === jugadorId);
    if (!j || j.eliminado) return;
    const eraSuTurno = this.jugadorActual(p).id === jugadorId;
    p.mazo.unshift(...j.mano);
    j.mano = [];
    j.eliminado = true;
    if (porAbandono) j.abandono = true;
    const vivos = p.jugadores.filter((x) => !x.eliminado);
    if (vivos.length <= 1) { if (porAbandono) p.fin = 'ABANDONO'; this.terminar(p, vivos[0]?.id ?? jugadorId); return; }
    if (eraSuTurno) { p.turno = this.siguienteTurno(p); p.fase = 'ROBAR'; }
  }

  private emitir(p: Partida, tipo: string): void {
    this.bus.publicar({ tipo, partidaId: p.id });
  }

  private jugadorActual(p: Partida): Jugador { return p.jugadores[p.turno]; }

  private exigirTurno(p: Partida, jugadorId: string, fase?: Partida['fase']): void {
    if (p.estado !== 'EN_CURSO') throw new ErrorDominio('PARTIDA_NO_ACTIVA', 'La partida no está en curso');
    if (this.jugadorActual(p).id !== jugadorId) throw new ErrorDominio('NO_ES_TU_TURNO', 'No es tu turno');
    if (fase && p.fase !== fase) throw new ErrorDominio('FASE_INCORRECTA', `Debes ${p.fase === 'ROBAR' ? 'robar' : 'descartar'}`);
  }

  /** Del mazo; si ya no hay con que formarlo (el pozo solo tiene su tope), el tope del pozo. */
  private cartaParaRobar(p: Partida): Carta {
    return p.mazo.length + p.pozo.length > 1 ? this.tomarMazo(p) : this.tomarPozo(p);
  }

  private tomarPozo(p: Partida): Carta {
    return this.sacar(p.pozo, 'POZO_VACIO', 'El pozo está vacío');
  }

  private tomarMazo(p: Partida): Carta {
    if (p.mazo.length === 0) this.reciclarPozo(p);
    return this.sacar(p.mazo, 'MAZO_VACIO', 'No quedan cartas');
  }

  private sacar(pila: Carta[], codigo: string, mensaje: string): Carta {
    const c = pila.pop();
    if (!c) throw new ErrorDominio(codigo, mensaje);
    return c;
  }

  private reciclarPozo(p: Partida): void {
    p.barajadoEn = p.version + 1;   // la jugada que se esta armando es la proxima version
    const tope = p.pozo.pop();
    p.mazo = barajar(p.pozo, this.azar);
    p.pozo = tope ? [tope] : [];
  }

  private siguienteTurno(p: Partida): number {
    let t = p.turno;
    do { t = (t + 1) % p.jugadores.length; } while (p.jugadores[t].eliminado);
    return t;
  }

  private repartir(p: Partida): void {
    p.ronda++;
    p.mazo = nuevoMazo(this.azar, p.comodines === true);
    const n = this.motor.cartasPorMano(p.modalidad);
    for (const j of p.jugadores) {
      j.mano = j.eliminado ? [] : p.mazo.splice(-n, n);
      delete j.ultimoDescarte;
    }
    p.pozo = [this.sacar(p.mazo, 'MAZO_VACIO', 'No quedan cartas')];
    p.fase = 'ROBAR';
    p.turno = p.jugadores.findIndex((j) => !j.eliminado);
  }

  private liquidar(p: Partida, cierraId: string): void {
    const manos: Record<string, Carta[]> = {};
    p.jugadores.filter((j) => !j.eliminado).forEach((j) => { manos[j.id] = j.mano; });
    const liq = this.motor.liquidarRonda(p.modalidad, cierraId, manos);
    p.ultimoCierre = {
      ronda: p.ronda, cierraId, deltas: liq.deltas,
      manos: Object.fromEntries(Object.entries(manos).map(([id, m]) => [id, this.enOrdenDelJugador(p.id, id, m)])),
    };
    for (const j of p.jugadores) {
      if (j.id in liq.deltas) j.acumulado += liq.deltas[j.id];
      if (this.motor.debeEliminar(p.modalidad, j.acumulado)) j.eliminado = true;
    }
    this.resolverFin(p, cierraId, liq.conservaHistorial);
  }

  private resolverFin(p: Partida, cierraId: string, conservaHistorial: boolean): void {
    const vivos = p.jugadores.filter((j) => !j.eliminado);
    const meta = vivos.find((j) => this.motor.haGanado(p.modalidad, j.acumulado));
    if (!conservaHistorial) return this.terminar(p, cierraId);
    if (meta) return this.terminar(p, meta.id);
    if (vivos.length === 1) return this.terminar(p, vivos[0].id);
    this.repartir(p);
  }

  /** Codigos de la mano en el orden que el jugador la tenia; las cartas sin orden conocido van al final. */
  private enOrdenDelJugador(partidaId: string, jugadorId: string, mano: readonly Carta[]): string[] {
    const codigos = mano.map((c) => c.codigo());
    const orden = this.ordenes.get(partidaId)?.get(jugadorId) ?? [];
    const conocidas = [...new Set(orden)].filter((c) => codigos.includes(c));
    return conocidas.concat(codigos.filter((c) => !conocidas.includes(c)));
  }

  private terminar(p: Partida, ganadorId: string | undefined): void {
    this.ordenes.delete(p.id);
    this.detenerRelojes(p.id);
    p.estado = 'FINALIZADA';
    p.ganadorId = ganadorId;
  }
}
