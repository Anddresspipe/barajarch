'use strict';
const SIMBOLO = { C: '♥', D: '♦', T: '♣', P: '♠' };
const CODIGO_NO_AUTORIZADO = 4001;
const ESPERA_RECONEXION_MS = 1500;
const NOMBRE_PALO = { C: 'corazones', D: 'diamantes', T: 'tréboles', P: 'picas' };
const PALOS = ['C', 'D', 'T', 'P'];
const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const estado = { reloj: null, retomar: false, id: null, nombre: null, ws: null, partidaId: null, vista: null, orden: [], rondaVista: 0, ordenEnviado: '', reversoEnviado: '' };
const $ = (id) => document.getElementById(id);

function mostrar(pantalla) {
  for (const p of ['login', 'lobby', 'juego']) $('pantalla-' + p).hidden = p !== pantalla;
}
function aviso(texto) { $('mensaje').textContent = texto || ''; }

function olvidar() {
  try { sessionStorage.removeItem('barajarch'); } catch { /* sin almacenamiento */ }
}
function guardar() {
  try { sessionStorage.setItem('barajarch', JSON.stringify({ id: estado.id, nombre: estado.nombre, partidaId: estado.partidaId, orden: estado.orden, rondaVista: estado.rondaVista })); } catch { /* sin almacenamiento */ }
}

async function entrar() {
  const nombre = $('nombre').value.trim();
  let r, d;
  try {
    r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nombre, pin: $('pin').value }) });
    d = await r.json();
  } catch { return aviso('No se pudo conectar con el servidor, intenta de nuevo'); }
  if (!r.ok) return aviso(d.mensaje);
  $('pin').value = '';
  estado.id = d.id; estado.nombre = d.nombre;
  guardar();
  conectar();
  mostrar('lobby');
}

function conectar() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?jugador=${estado.id}`);
  ws.onopen = () => {
    $('estado-conexion').textContent = 'conectado como ' + estado.nombre;
    aviso('');
    estado.ordenEnviado = ''; estado.reversoEnviado = '';   // el servidor pudo reiniciarse: se vuelve a informar el orden
    // Reconexion: se recupera la partida en curso desde el servidor
    if (estado.partidaId) ws.send(JSON.stringify({ accion: 'estado', partidaId: estado.partidaId }));
    else { estado.retomar = true; pedirMias(); }   // recien conectado: si tenia una partida en curso, se vuelve a ella
  };
  ws.onclose = (ev) => {
    if (ev.code === CODIGO_NO_AUTORIZADO) return cerrarSesion('Tu sesión ya no es válida, entra de nuevo');
    if (estado.ws !== ws || !estado.id) return;
    $('estado-conexion').textContent = 'reconectando…';
    setTimeout(() => { if (estado.ws === ws) conectar(); }, ESPERA_RECONEXION_MS);
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.tipo === 'salio') return;
    if (m.tipo === 'mias') return alRecibirMias(m.partidas);
    if (m.tipo === 'historial') return alRecibirHistorial(m.historial);
    if (m.tipo === 'error') {
      if (['PARTIDA_NO_ENCONTRADA', 'NO_ES_JUGADOR'].includes(m.codigo) && estado.partidaId) volverAlLobby();   // la partida guardada ya no existe o ya no es mia
      if (m.codigo === 'CIERRE_INVALIDO') $('ayuda-cierre').textContent = '✖ ' + m.mensaje;
      return aviso(m.mensaje);
    }
    aviso('');
    const actual = estado.vista;
    if (actual && actual.id === m.vista.id && m.vista.version < actual.version) return;   // llego tarde: ya se mostro una mas nueva
    if (m.vista.id !== estado.partidaId) estado.rondaVista = 0;   // otra partida: sus rondas empiezan de nuevo
    estado.vista = m.vista; estado.partidaId = m.vista.id;
    guardar();
    mostrar('juego'); pintar(); revisarResultado();
  };
  estado.ws = ws;
}

function cerrarSesion(texto) {
  olvidar();
  estado.id = null; estado.nombre = null; estado.ws = null; estado.partidaId = null; estado.vista = null; estado.orden = []; estado.rondaVista = 0;
  ocultarResultado();
  $('estado-conexion').textContent = '';
  mostrar('login');
  aviso(texto);
}

/** `abandonar`: deja el asiento (sala en espera) o se retira de la partida; si no, solo se cambia de pantalla y la partida sigue en "Mis partidas". */
function volverAlLobby(abandonar = false) {
  if (estado.ws && estado.ws.readyState === WebSocket.OPEN) {
    estado.ws.send(JSON.stringify(abandonar ? { accion: 'abandonar', partidaId: estado.partidaId } : { accion: 'salir' }));
  }
  detenerReloj();
  estado.partidaId = null; estado.vista = null; estado.orden = []; estado.rondaVista = 0;
  ocultarResultado();
  guardar();
  mostrar('lobby');
  pedirMias();
}

function pedirMias() {
  if (!estado.ws || estado.ws.readyState !== WebSocket.OPEN) return;
  estado.ws.send(JSON.stringify({ accion: 'mias' }));
  estado.ws.send(JSON.stringify({ accion: 'historial' }));
}

const TEXTO_RESULTADO = { GANADA: 'Ganada', GANADA_POR_ABANDONO: 'Ganada (rival se fue)', PERDIDA: 'Perdida', ABANDONADA: 'Abandonada' };

/** Conteo por modalidad y ultimas partidas: lo que el servidor calcula de las partidas terminadas. */
function alRecibirHistorial(h) {
  const tabla = $('historial-tabla');
  tabla.innerHTML = '<tr><th>Modo</th><th>Jugadas</th><th>Ganadas</th><th>Ganadas (rival se fue)</th><th>Perdidas</th><th>Abandonadas</th></tr>';
  for (const [modo, c] of Object.entries(h.porModalidad)) {
    const tr = document.createElement('tr');
    for (const t of [nombreModalidad(modo), c.jugadas, c.ganadas, c.ganadasPorAbandono, c.perdidas, c.abandonadas]) {
      const td = document.createElement('td'); td.textContent = t; tr.appendChild(td);
    }
    tabla.appendChild(tr);
  }
  const ul = $('historial-recientes'); ul.innerHTML = '';
  for (const p of h.recientes) {
    const li = document.createElement('li');
    li.textContent = `${nombreModalidad(p.modalidad)} · ${TEXTO_RESULTADO[p.resultado]} · ${p.rondas} ronda(s) · contra ${p.rivales.join(', ') || '—'}`;
    ul.appendChild(li);
  }
  $('historial').hidden = false;
  $('historial-vacio').hidden = h.recientes.length > 0;
}

/** Partidas sin terminar del jugador: si hay una en curso y no estaba en pantalla, se vuelve a ella; si no, se listan. */
function alRecibirMias(partidas) {
  const ul = $('lista-mias'); ul.innerHTML = '';
  $('mis-partidas').hidden = partidas.length === 0;
  for (const p of partidas) {
    const li = document.createElement('li');
    li.textContent = `${p.id} · ${nombreModalidad(p.modalidad)} · ${p.estado === 'EN_CURSO' ? 'en curso' : 'esperando'} · ${p.jugadores.join(', ')} `;
    const b = document.createElement('button'); b.textContent = 'Volver';
    b.onclick = () => enviarA(p.id, { accion: 'estado' });
    li.appendChild(b); ul.appendChild(li);
  }
  const enCurso = partidas.filter((p) => p.estado === 'EN_CURSO');
  const retomar = estado.retomar; estado.retomar = false;
  if (retomar && !estado.partidaId && enCurso.length === 1) enviarA(enCurso[0].id, { accion: 'estado' });
}

function enviarA(partidaId, cmd) { estado.ws.send(JSON.stringify({ partidaId, ...cmd })); }

function enviar(cmd) { estado.ws.send(JSON.stringify({ partidaId: estado.partidaId, ...cmd })); }

const esComodin = (codigo) => codigo.startsWith('JK');

function textoCarta(codigo) {
  if (esComodin(codigo)) return '★';
  return codigo.slice(0, -1) + SIMBOLO[codigo.slice(-1)];
}

// ---- orden de la mano (solo en el cliente: el servidor no conoce ni necesita este orden) ----
function reconciliarOrden(tuMano) {
  const enMano = new Set(tuMano);
  const conservadas = estado.orden.filter((c) => enMano.has(c));
  const nuevas = tuMano.filter((c) => !conservadas.includes(c));   // la carta robada queda al final
  estado.orden = conservadas.concat(nuevas);
}

function moverCarta(codigo, indiceDestino) {
  const desde = estado.orden.indexOf(codigo);
  if (desde < 0 || indiceDestino < 0 || indiceDestino >= estado.orden.length) return;
  estado.orden.splice(desde, 1);
  estado.orden.splice(indiceDestino, 0, codigo);
  guardar();
  pintarMano(codigo);
  sincronizarOrden();
}

function ordenarMano(clave) {
  const palo = (c) => (esComodin(c) ? PALOS.length : PALOS.indexOf(c.slice(-1)));   // los comodines van al final
  const valor = (c) => (esComodin(c) ? VALORES.length : VALORES.indexOf(c.slice(0, -1)));
  const comparar = clave === 'palo' ? (a, b) => palo(a) - palo(b) || valor(a) - valor(b)
                                    : (a, b) => valor(a) - valor(b) || palo(a) - palo(b);
  estado.orden.sort(comparar);
  guardar();
  pintarMano();
  sincronizarOrden();
}

// El servidor no decide el orden, pero lo recuerda para mostrar la mano final tal como cada jugador la tenia.
function sincronizarOrden() {
  const v = estado.vista;
  if (!v || v.estado !== 'EN_CURSO' || !estado.ws || estado.ws.readyState !== WebSocket.OPEN) return;
  const huella = v.id + '|' + estado.orden.join(',');
  if (huella === estado.ordenEnviado) return;
  estado.ordenEnviado = huella;
  enviar({ accion: 'orden', codigos: estado.orden });
}

/** Carta boca arriba (anverso), sin comportamiento: el pozo, las manos finales y la base de la mano propia. */
function cartaVisible(codigo) {
  const d = document.createElement('div');
  const palo = codigo.slice(-1);
  d.className = 'carta' + (esComodin(codigo) ? ' comodin' : palo === 'C' || palo === 'D' ? ' roja' : '');
  d.dataset.codigo = codigo;
  d.textContent = textoCarta(codigo);
  d.setAttribute('aria-label', esComodin(codigo) ? 'Comodín' : `${codigo.slice(0, -1)} de ${NOMBRE_PALO[palo]}`);
  return d;
}

/** Carta boca abajo (reverso): no lleva codigo, el cliente nunca sabe que carta es. */
function cartaReverso(diseno) {
  const d = document.createElement('div');
  d.className = 'carta reverso';
  if (diseno) d.dataset.reverso = diseno;   // lo elige el dueño de la carta; el CSS ignora los desconocidos
  d.setAttribute('aria-hidden', 'true');
  return d;
}

function elementoCarta(codigo, puedeDescartar) {
  const d = cartaVisible(codigo);
  const palo = codigo.slice(-1);
  d.classList.toggle('inactiva', !puedeDescartar);
  d.tabIndex = 0;
  d.draggable = true;
  d.setAttribute('role', 'button');
  if (!puedeDescartar) d.setAttribute('aria-disabled', 'true');
  const descartar = () => { if (puedeDescartar) enviar({ accion: 'descartar', carta: codigo }); };
  d.onclick = descartar;
  d.onkeydown = (ev) => teclaEnCarta(ev, codigo, descartar);
  d.ondragstart = (ev) => { ev.dataTransfer.setData('text/plain', codigo); ev.dataTransfer.effectAllowed = 'move'; d.classList.add('arrastrando'); };
  d.ondragend = () => d.classList.remove('arrastrando');
  d.ondragover = (ev) => { ev.preventDefault(); d.classList.add('sobre'); };
  d.ondragleave = () => d.classList.remove('sobre');
  d.ondrop = (ev) => {
    ev.preventDefault();
    moverCarta(ev.dataTransfer.getData('text/plain'), estado.orden.indexOf(codigo));
  };
  return d;
}

function teclaEnCarta(ev, codigo, descartar) {
  const i = estado.orden.indexOf(codigo);
  if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); descartar(); return; }
  if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
  ev.preventDefault();
  const destino = i + (ev.key === 'ArrowRight' ? 1 : -1);
  if (ev.shiftKey) return moverCarta(codigo, destino);
  const vecina = $('mano').children[destino];
  if (vecina) vecina.focus();
}

function pintarMano(codigoConFoco) {
  const v = estado.vista;
  const puedeDescartar = v.turnoDe === v.yo && v.estado === 'EN_CURSO' && v.fase === 'DESCARTAR';
  const mano = $('mano'); mano.innerHTML = '';
  for (const c of estado.orden) mano.appendChild(elementoCarta(c, puedeDescartar));
  if (codigoConFoco) {
    const el = [...mano.children].find((x) => x.dataset.codigo === codigoConFoco);
    if (el) el.focus();
  }
}

// ---- mesa: rivales alrededor, boca abajo ----
// Ubicacion segun cuantos rivales hay; se recorren en orden de turno a partir del jugador (sentido horario).
const UBICACIONES = { 1: ['arriba'], 2: ['izquierda', 'derecha'], 3: ['izquierda', 'arriba', 'derecha'] };

function rivalesEnOrden(v) {
  const yo = v.jugadores.findIndex((j) => j.id === v.yo);
  const n = v.jugadores.length;
  return Array.from({ length: n - 1 }, (_, k) => v.jugadores[(yo + 1 + k) % n]);
}

/** Por que un jugador no esta activo ahora mismo: se fue, lo sacaron, perdio por puntos o perdio la conexion. */
function estadoJugador(j) {
  if (j.abandono) return ' (abandonó)';
  if (j.eliminado) return ' (eliminado)';
  return j.conectado ? '' : ' (sin conexión)';
}

function pintarAsiento(ubicacion, j, v) {
  const el = $('asiento-' + ubicacion);
  el.innerHTML = '';
  el.className = 'asiento ' + ubicacion;
  if (!j) return;
  if (j.eliminado) el.classList.add('eliminado');
  if (j.id === v.turnoDe && v.estado === 'EN_CURSO') el.classList.add('turno');
  const etiqueta = document.createElement('div');
  etiqueta.className = 'etiqueta';
  const nombre = document.createElement('b');
  nombre.textContent = j.nombre + estadoJugador(j);
  if (!j.conectado) el.classList.add('desconectado');
  etiqueta.append(nombre, `${j.acumulado} pts · ${j.cartas} cartas`);
  const abanico = document.createElement('div');
  abanico.className = 'abanico';
  for (let i = 0; i < j.cartas; i++) abanico.appendChild(cartaReverso(j.reverso));
  el.append(etiqueta, abanico, ultimoDescarte(j.ultimoDescarte));
}

/** Ultima carta que descarto un jugador en esta ronda, como carta pequeña con su rotulo (vacio si aun no descarto). */
function ultimoDescarte(codigo) {
  const d = document.createElement('div');
  d.className = 'ultimo-descarte';
  if (!codigo) { d.classList.add('sin-descarte'); d.textContent = 'Aún no descarta'; return d; }
  const rotulo = document.createElement('span');
  rotulo.textContent = 'Descartó';
  const c = cartaVisible(codigo);
  c.classList.add('mini');
  c.style.cursor = 'default';
  d.append(rotulo, c);
  return d;
}

function pintarRivales(v) {
  const rivales = rivalesEnOrden(v);
  const sitios = UBICACIONES[rivales.length] || [];
  for (const u of ['izquierda', 'arriba', 'derecha']) {
    const i = sitios.indexOf(u);
    pintarAsiento(u, i >= 0 ? rivales[i] : null, v);
  }
}

function pintarMiDescarte(v) {
  const el = $('mi-descarte');
  el.innerHTML = '';
  const yo = v.jugadores.find((j) => j.id === v.yo);
  if (yo && yo.ultimoDescarte) el.appendChild(ultimoDescarte(yo.ultimoDescarte));
}

function pintarPozo(v) {
  const el = $('tope-pozo');
  el.innerHTML = '';
  if (v.pozoTope) {
    const c = cartaVisible(v.pozoTope);
    hacerRobable(c, 'POZO', 'Robar la carta del pozo');
    el.appendChild(c);
    return;
  }
  const vacio = document.createElement('div');
  vacio.className = 'vacio';
  vacio.textContent = '–';
  el.appendChild(vacio);
}

// ---- robar: el mazo y el pozo son las propias cartas, no botones aparte ----
function puedeRobar() {
  const v = estado.vista;
  return !!v && v.estado === 'EN_CURSO' && v.turnoDe === v.yo && v.fase === 'ROBAR';
}

function hacerRobable(el, origen, etiqueta) {
  const activo = puedeRobar();
  el.classList.toggle('robable', activo);
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', etiqueta);
  el.setAttribute('aria-disabled', String(!activo));
  el.tabIndex = activo ? 0 : -1;
  el.onclick = () => { if (puedeRobar()) enviar({ accion: 'robar', origen }); };
  el.onkeydown = (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    el.onclick();
  };
}

// ---- skins: el anverso y el reverso se eligen por separado y solo cambian variables CSS (ver style.css) ----
const CLAVE_SKINS = 'barajarch-skins';
function aplicarSkins(skins) {
  document.body.dataset.anverso = skins.anverso;   // el anverso es personal: solo cambia lo que YO veo
  $('skin-anverso').value = skins.anverso;
  $('skin-reverso').value = skins.reverso;
  $('carta-mazo').dataset.reverso = skins.reverso;   // el mazo que veo lleva mi propio reverso
}
function leerSkins() {
  let g = null;
  try { g = JSON.parse(localStorage.getItem(CLAVE_SKINS) || 'null'); } catch { g = null; }
  const valido = (id, valor) => [...$(id).options].some((o) => o.value === valor);
  return {
    anverso: g && valido('skin-anverso', g.anverso) ? g.anverso : 'clasico',
    reverso: g && valido('skin-reverso', g.reverso) ? g.reverso : 'azul',
  };
}
function cambiarSkin() {
  const skins = { anverso: $('skin-anverso').value, reverso: $('skin-reverso').value };
  aplicarSkins(skins);
  try { localStorage.setItem(CLAVE_SKINS, JSON.stringify(skins)); } catch { /* sin almacenamiento: vale para esta visita */ }
  sincronizarReverso();
}

// El reverso que elijo lo ven los demas en mis cartas: se le informa al servidor cuando difiere de lo que tiene registrado.
function sincronizarReverso() {
  const v = estado.vista;
  if (!v || !estado.ws || estado.ws.readyState !== WebSocket.OPEN) return;
  const yo = v.jugadores.find((j) => j.id === v.yo);
  const elegido = $('skin-reverso').value;
  if (!yo || yo.reverso === elegido) return;
  const huella = v.id + '|' + elegido;
  if (huella === estado.reversoEnviado) return;
  estado.reversoEnviado = huella;
  enviar({ accion: 'reverso', valor: elegido });
}

// ---- reloj del turno (el servidor manda el tiempo restante; el cliente solo lo cuenta hacia atras) ----
function detenerReloj() { clearInterval(estado.reloj); estado.reloj = null; $('reloj').hidden = true; }

function pintarReloj(v, miTurno) {
  detenerReloj();
  if (v.turnoRestanteMs === undefined) return;
  const fin = Date.now() + v.turnoRestanteMs;
  const tic = () => {
    const seg = Math.max(0, Math.ceil((fin - Date.now()) / 1000));
    $('reloj').hidden = false;
    $('reloj').textContent = `⏱ ${seg} s${miTurno ? ' para jugar' : ` · turno de ${nombreDe(v.turnoDe)}`}`;
    $('reloj').className = miTurno && seg <= 10 ? 'urgente' : '';
  };
  tic();
  estado.reloj = setInterval(tic, 500);
}

// ---- turno ----
function textoAuto(v) {
  if (!v.auto) return '';
  const quien = v.auto.jugadorId === v.yo ? 'Se te acabó el tiempo' : `A ${nombreDe(v.auto.jugadorId)} se le acabó el tiempo`;
  return `${quien}: ${v.auto.expulsado ? 'salió de la partida por inactividad. ' : 'el sistema jugó por él. '}`.replace('por él', v.auto.jugadorId === v.yo ? 'por ti' : 'por él');
}

function mensajeTurno(v, miTurno) {
  if (v.estado === 'FINALIZADA') {
    if (!v.ganadorId) return { clase: 'fin', texto: 'Partida terminada · se fueron todos: cuenta como derrota para todos' };
    const porAbandono = v.fin === 'ABANDONO' ? ' (los demás se fueron)' : '';
    return { clase: 'fin', texto: (v.ganadorId === v.yo ? '🏆 ¡Ganaste la partida!' : `Partida terminada · ganó ${nombreDe(v.ganadorId)}`) + porAbandono };
  }
  if (v.estado === 'ESPERANDO') {
    const h = v.herencia ? ` · conservar puntos: aceptan ${v.herencia.aceptan} de ${v.herencia.total}` : '';
    return { clase: '', texto: `Código de la sala: ${v.id} · esperando jugadores… hay ${v.jugadores.length} en la sala${h}` };
  }
  const auto = textoAuto(v) + (v.barajado ? 'Se acabó el mazo: se barajó el pozo para formar uno nuevo. ' : '');
  if (miTurno) {
    return { clase: 'tuyo', texto: auto + (v.fase === 'ROBAR'
      ? '▶ ES TU TURNO: roba tocando el mazo o el pozo, o cierra la ronda'
      : '▶ ES TU TURNO: descarta una carta (clic) o cierra la ronda') };
  }
  return { clase: '', texto: auto + `Turno de ${nombreDe(v.turnoDe)}: esperando que ${v.fase === 'ROBAR' ? 'robe' : 'descarte'}…` };
}

function pintar() {
  const v = estado.vista;
  const miTurno = v.turnoDe === v.yo && v.estado === 'EN_CURSO';
  const admin = v.jugadores[0] && v.jugadores[0].id === v.yo;
  $('info').textContent = `Sala ${v.id} · ${v.modalidad}${v.comodines ? ' · con comodines' : ''} · ronda ${v.ronda}`;
  $('btn-copiar-codigo').hidden = v.estado !== 'ESPERANDO';
  const t = mensajeTurno(v, miTurno);
  $('turno').className = t.clase; $('turno').textContent = t.texto;
  $('panel-mano').className = miTurno ? 'tuyo' : '';
  document.title = (miTurno ? '● Tu turno · ' : '') + 'BarajaArch – Cartas';
  $('n-mazo').textContent = v.cartasMazo;
  pintarPozo(v);
  pintarRivales(v);
  pintarMiDescarte(v);
  hacerRobable($('carta-mazo'), 'MAZO', 'Robar del mazo');
  // El juego no dice si la mano esta lista: el jugador decide cuando cerrar, y si se equivoca pierde 5 puntos.
  $('btn-cerrar').disabled = !(miTurno && v.estado === 'EN_CURSO');
  $('ayuda-cierre').textContent = miTurno ? 'Cerrar con la mano mal armada resta 5 puntos.' : '';
  $('btn-iniciar').hidden = !(admin && v.estado === 'ESPERANDO');
  $('btn-salir').hidden = v.estado === 'ESPERANDO';
  $('btn-salir').textContent = v.estado === 'FINALIZADA' ? 'Volver al lobby' : 'Ir al lobby (sigo en la partida)';
  $('btn-abandonar').hidden = v.estado === 'FINALIZADA';
  $('btn-abandonar').textContent = v.estado === 'ESPERANDO' ? 'Salir de la sala' : 'Abandonar partida';
  pintarReloj(v, miTurno);
  reconciliarOrden(v.tuMano);
  pintarMano();
  sincronizarOrden();
  sincronizarReverso();
  $('conteo-mano').textContent = `· ${estado.orden.length} cartas`;   // se cuenta en el cliente, de la mano que se ve
  const tabla = $('marcador');
  tabla.innerHTML = '<tr><th>Jugador</th><th>Acumulado</th></tr>';
  for (const j of v.jugadores) {
    const tr = document.createElement('tr');
    if (j.id === v.turnoDe && v.estado === 'EN_CURSO') tr.className = 'turno';
    if (!j.conectado) tr.classList.add('desconectado');
    const nombre = j.nombre + (j.id === v.yo ? ' (tú)' : '') + estadoJugador(j);
    for (const texto of [nombre, j.acumulado]) {
      const td = document.createElement('td'); td.textContent = texto; tr.appendChild(td);
    }
    tabla.appendChild(tr);
  }
}

// ---- pantalla de resultado entre rondas ----
function filaResultado(v, j) {
  const delta = v.ultimoCierre.deltas[j.id];
  const tr = document.createElement('tr');
  const nombre = document.createElement('td');
  nombre.textContent = j.nombre + (j.id === v.yo ? ' (tú)' : '') + (j.id === v.ultimoCierre.cierraId ? ' · cerró' : '');
  const puntos = document.createElement('td');
  puntos.textContent = delta === undefined ? '—' : (delta > 0 ? '+' : '') + delta;
  if (delta !== undefined) puntos.className = delta > 0 ? 'suma' : 'resta';
  const total = document.createElement('td');
  total.textContent = j.acumulado + (j.eliminado ? ' (eliminado)' : '');
  tr.append(nombre, puntos, total);
  return tr;
}

function manoFinal(v, j) {
  const cartas = v.ultimoCierre.manos[j.id];
  if (!cartas) return null;
  const fila = document.createElement('div');
  fila.className = 'mano-final';
  const quien = document.createElement('span');
  quien.textContent = j.nombre;
  fila.appendChild(quien);
  for (const c of cartas) {
    const el = cartaVisible(c);
    el.classList.add('mini');
    fila.appendChild(el);
  }
  return fila;
}

function tituloResultado(v) {
  const c = v.ultimoCierre;
  if (v.estado === 'FINALIZADA') {
    return { titulo: v.ganadorId === v.yo ? '🏆 ¡Ganaste la partida!' : `🏁 Ganó ${nombreDe(v.ganadorId)}`, sub: `Última ronda (${c.ronda}) cerrada por ${nombreDe(c.cierraId)}` };
  }
  return { titulo: c.cierraId === v.yo ? '✅ ¡Cerraste la ronda!' : `Ronda ${c.ronda} cerrada`, sub: `${nombreDe(c.cierraId)} cerró la ronda ${c.ronda}. Al continuar empieza la ronda ${v.ronda}.` };
}

function revisarResultado() {
  const v = estado.vista;
  if (!v.ultimoCierre) return ocultarResultado();   // partida nueva: no hay resultado que mostrar
  if (v.ultimoCierre.ronda <= estado.rondaVista) return;
  const { titulo, sub } = tituloResultado(v);
  $('resultado-titulo').textContent = titulo;
  $('resultado-sub').textContent = sub;
  const tabla = $('resultado-tabla');
  tabla.innerHTML = '<tr><th>Jugador</th><th>Esta ronda</th><th>Acumulado</th></tr>';
  v.jugadores.forEach((j) => tabla.appendChild(filaResultado(v, j)));
  const manos = $('resultado-manos'); manos.innerHTML = '';
  v.jugadores.forEach((j) => { const f = manoFinal(v, j); if (f) manos.appendChild(f); });
  pintarRevancha($('revancha-resultado'), v);
  $('btn-continuar').textContent = v.estado === 'FINALIZADA' ? 'Volver al lobby' : 'Continuar';
  const yaVisible = !$('resultado').hidden;
  $('resultado').hidden = false;
  if (!yaVisible) $('btn-continuar').focus();
}

// ---- seguir jugando con los mismos jugadores sin pasar por el lobby ----
function nombreModalidad(valor) {
  const op = [...$('modalidad').options].find((o) => o.value === valor);
  return op ? op.textContent : valor;
}

function botonRevancha(texto, modalidad, conservar) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.onclick = () => enviar({ accion: 'revancha', modalidad, conservar });
  return b;
}

function pintarRevancha(contenedor, v) {
  contenedor.innerHTML = '';
  contenedor.hidden = v.estado !== 'FINALIZADA';
  if (contenedor.hidden) return;
  const traspasables = v.traspasables || [];
  for (const o of $('modalidad').options) {
    if (o.value === v.modalidad) { contenedor.appendChild(botonRevancha(`Otra partida: ${o.textContent}`, o.value, false)); continue; }
    if (!traspasables.includes(o.value)) { contenedor.appendChild(botonRevancha(`Pasar a ${o.textContent}`, o.value, false)); continue; }
    contenedor.appendChild(botonRevancha(`Pasar a ${o.textContent} conservando puntos`, o.value, true));
    contenedor.appendChild(botonRevancha(`Pasar a ${o.textContent} desde cero`, o.value, false));
    const nota = document.createElement('p');
    nota.className = 'ayuda';
    nota.textContent = 'Los puntos solo se conservan si todos los jugadores eligen conservarlos; si alguno elige desde cero, todos empiezan en 0.';
    contenedor.appendChild(nota);
  }
}

function ocultarResultado() { $('resultado').hidden = true; }

function continuarTrasResultado() {
  const v = estado.vista;
  estado.rondaVista = v.ultimoCierre.ronda;
  guardar();
  ocultarResultado();
  if (v.estado === 'FINALIZADA') volverAlLobby();
}

function nombreDe(id) { const j = estado.vista.jugadores.find((x) => x.id === id); return j ? j.nombre : id; }

$('skin-anverso').onchange = cambiarSkin;
$('skin-reverso').onchange = cambiarSkin;
aplicarSkins(leerSkins());
const EXPLICACION_MODALIDAD = {
  CLASICA: 'Se reparten 10 cartas. En tu turno robas del mazo o del pozo y descartas una. Gana quien cierra primero: con tus 10 cartas armas una cuarta (4 cartas) y dos ternas (3 cartas cada una), y descartas la carta 11. Un grupo es del mismo valor con palos distintos, o una escalera del mismo palo. Si se acaba el tiempo del turno (60 s), el sistema juega por ti.',
  APUNTADO: 'Se juega por rondas hasta que haya ganador. Una ronda se cierra de dos formas: como en Clásica (una cuarta y dos ternas, y descartas la carta 11) o con toque (3 ternas y un sobrante que valga menos de 5 puntos). Quien cierra como en Clásica suma 10 puntos. Quien cierra con toque no suma: resta los puntos de su carta sobrante, pero asegura la ronda y los demás restan los puntos de sus cartas sueltas. Gana quien llegue a 51 y queda eliminado quien llegue a -101.',
};
function mostrarAyudaModalidad(abrir) {
  const caja = $('ayuda-modalidad');
  caja.textContent = EXPLICACION_MODALIDAD[$('modalidad').value] || '';
  caja.hidden = !abrir;
  $('btn-ayuda-modalidad').setAttribute('aria-expanded', String(abrir));
}
$('btn-ayuda-modalidad').onclick = () => mostrarAyudaModalidad($('ayuda-modalidad').hidden);
$('modalidad').addEventListener('change', () => { if (!$('ayuda-modalidad').hidden) mostrarAyudaModalidad(true); });
$('btn-entrar').onclick = entrar;
function unirseConCodigo() {
  const codigo = $('codigo-sala').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(codigo)) return aviso('El código tiene 6 letras o números');
  enviar({ accion: 'unirse', partidaId: codigo, nombre: estado.nombre });
}
$('btn-unirse-codigo').onclick = unirseConCodigo;
$('codigo-sala').onkeydown = (ev) => { if (ev.key === 'Enter') unirseConCodigo(); };
$('codigo-sala').oninput = (ev) => { ev.target.value = ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
$('btn-copiar-codigo').onclick = async () => {
  const codigo = estado.vista && estado.vista.id;
  if (!codigo) return;
  try { await navigator.clipboard.writeText(codigo); aviso('Código copiado: ' + codigo); } catch { aviso('Código de la sala: ' + codigo); }
};
$('btn-crear').onclick = () => enviar({ accion: 'crear', modalidad: $('modalidad').value, nombre: estado.nombre, comodines: $('con-comodines').checked });
$('btn-salir').onclick = () => volverAlLobby();
$('btn-abandonar').onclick = () => {
  const v = estado.vista;
  if (v.estado === 'EN_CURSO' && !confirm('¿Abandonar la partida? No podrás volver a ella.')) return;
  volverAlLobby(true);
};
$('btn-continuar').onclick = continuarTrasResultado;
$('btn-orden-palo').onclick = () => ordenarMano('palo');
$('btn-orden-valor').onclick = () => ordenarMano('valor');
$('mano').ondragover = (ev) => ev.preventDefault();
$('mano').ondrop = (ev) => {   // soltar en un hueco vacio = mandar la carta al final
  if (ev.target === $('mano')) moverCarta(ev.dataTransfer.getData('text/plain'), estado.orden.length - 1);
};
$('btn-iniciar').onclick = () => enviar({ accion: 'iniciar' });
$('btn-cerrar').onclick = () => enviar({ accion: 'cerrar', ronda: estado.vista.ronda });

// Restaura la sesion si la pagina se recarga
(function restaurar() {
  let g = null;
  try { g = JSON.parse(sessionStorage.getItem('barajarch') || 'null'); } catch { g = null; }
  if (!g || !g.id) return;
  estado.id = g.id; estado.nombre = g.nombre; estado.partidaId = g.partidaId; estado.orden = g.orden || []; estado.rondaVista = g.rondaVista || 0;
  conectar();
  mostrar('lobby');
})();
