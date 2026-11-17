import { esc, guardado, cuentaRegresiva } from "./util.js";
import { avisarCambio } from "./sync.js";

const stat = (label, value, hint = "") => `
  <div class="card stat"><div class="label">${label}</div><div class="value">${value}</div>
  ${hint ? `<div class="hint">${hint}</div>` : ""}</div>`;

// Horarios: todo en HORA LOCAL (la de la PC).

const aMin = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** Próxima aparición de una lista de horas diarias. Devuelve {fecha, activo} o null. */
function proxima(horas, ventanaMin = 0, ahora = new Date()) {
  if (!horas?.length) return null;
  const base = new Date(ahora); base.setHours(0, 0, 0, 0);
  let mejor = null;
  for (const dia of [0, 1]) {
    for (const h of horas) {
      const d = new Date(base); d.setDate(d.getDate() + dia); d.setMinutes(aMin(h));
      const fin = d.getTime() + ventanaMin * 60e3;
      if (fin > ahora.getTime() && (!mejor || d < mejor.fecha)) mejor = { fecha: d, hora: h, activo: d <= ahora };
    }
  }
  return mejor;
}

const VENTANA_JEFE = 5; // min que un jefe se muestra "apareció" después de su hora

// ---------- Planner de misiones ----------
// Marcás lo que hiciste y desaparece hasta el reset (hora local):
//   diaria  = todos los días 00:00
//   semanal = cuando termina el domingo (lunes 00:00)
//   mensual = cuando termina el mes (día 1, 00:00)
const FRECUENCIAS = {
  diaria: { nombre: "Diaria", vuelve: "todos los días a las 00:00" },
  semanal: { nombre: "Semanal", vuelve: "el lunes a las 00:00 (al terminar el domingo)" },
  mensual: { nombre: "Mensual", vuelve: "el día 1 a las 00:00 (al terminar el mes)" },
};
const CATS = {
  mapa: { nombre: "Jefe de mapa", plural: "Jefes de mapa", color: "#3987e5" },
  dominacion: { nombre: "Dominación", plural: "Dominación", color: "#199e70",
    vacio: "No quedan misiones de dominación pendientes esta semana." },
  purgatorio: { nombre: "Purgatorio", plural: "Purgatorio de Luna sangrienta", color: "#e66767",
    vacio: "No quedan misiones de purgatorio pendientes esta semana." },
  invocado: { nombre: "Jefe invocado", plural: "Jefes invocados", color: "#d95926",
    vacio: "No hay jefes invocados cargados en data/horarios.json." },
  expedicion: { nombre: "Expedición", plural: "Expedición", color: "#9085e9",
    vacio: "No hay misiones de expedición cargadas en data/horarios.json." },
};

function inicioDia(ahora = new Date()) {
  const d = new Date(ahora); d.setHours(0, 0, 0, 0);
  return d;
}
function inicioSemana(ahora = new Date()) {
  const d = inicioDia(ahora);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // lunes 00:00
  return d;
}
function inicioMes(ahora = new Date()) {
  return new Date(ahora.getFullYear(), ahora.getMonth(), 1);
}
/** Inicio del período actual de una frecuencia: lo marcado antes de esa fecha ya se reinició. */
const inicioPeriodo = (frec, ahora = new Date()) =>
  frec === "diaria" ? inicioDia(ahora) : frec === "mensual" ? inicioMes(ahora) : inicioSemana(ahora);
/** Próximo reset de una frecuencia. */
function proximoReset(frec, ahora = new Date()) {
  const d = inicioPeriodo(frec, ahora);
  if (frec === "diaria") d.setDate(d.getDate() + 1);
  else if (frec === "mensual") d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 7);
  return d;
}
/** Categorías del planner para el submenú de la barra lateral. */
export const CATEGORIAS_PLANNER = () => Object.entries(CATS).map(([id, c]) => ({ id, nombre: c.plural, color: c.color }));

// Secciones con lista propia, en orden. Las FIJAS vienen de horarios.json (todas semanales) y no tienen formulario.
const LISTAS = ["dominacion", "purgatorio", "invocado", "expedicion"];
const FIJAS = ["dominacion", "purgatorio", "invocado", "expedicion"];
const badgeFrec = (frec) => `<span class="freq ${frec}">${FRECUENCIAS[frec]?.nombre || frec}</span>`;
const cuando = (t) => new Date(t).toLocaleString("es-AR", { weekday: "short", hour: "2-digit", minute: "2-digit" });

export function planner(ctx, el, param) {
  // Vista: "todas" (todo junto) o una categoría puntual (#/planner/dominacion, etc.)
  const vista = CATS[param] ? param : "todas";
  const enVista = (m) => vista === "todas" || m.cat === vista;
  const ver = (c) => vista === "todas" || vista === c;
  if (vista !== "todas") document.getElementById("title").textContent = `Planner · ${CATS[vista].plural}`;
  const st = guardado.leer("mir4:planner", { hechas: {}, custom: [] });
  st.hechas ??= {}; st.deshechas ??= {}; st.custom ??= [];
  delete st.plan; // la versión anterior tenía un "plan"; ya no se usa
  try { localStorage.removeItem("mir4:jefes-seguir"); } catch { /* sin almacenamiento */ }
  // cambio=false: limpieza local que no hace falta subir a la nube
  const guardar = (cambio = true) => { guardado.escribir("mir4:planner", st); if (cambio) avisarCambio(); };
  // "deshacer" deja la hora en que se deshizo, así el otro dispositivo sabe qué pasó último
  const deshacer = (k) => { delete st.hechas[k]; st.deshechas[k] = Date.now(); };

  const catalogo = () => [
    ...(ctx.D.jefes || []).map((j) => ({
      key: `mapa|${j.mundo}|${j.jefe}`, cat: "mapa", nombre: j.jefe, detalle: `${j.mundo} · ${j.mapa}`,
      nivel: j.nivel, mundo: j.mundo, mapa: j.mapa, horas: j.horas || [], frecuencia: "semanal",
      // "L3W1" -> plano "L3", mundo "W1"
      plano: (j.mundo.match(/^L\d+/i) || [""])[0].toUpperCase(), w: (j.mundo.match(/W\d+$/i) || [""])[0].toUpperCase(),
    })),
    // solo las categorías conocidas (horarios.json también trae claves de notas como "_nota")
    ...Object.entries(ctx.D.misiones || {}).filter(([cat, xs]) => CATS[cat] && Array.isArray(xs)).flatMap(([cat, xs]) => xs.map((m) => ({
      key: `${cat}|${m.zona || ""}|${m.nombre}`, cat, nombre: m.nombre, detalle: m.detalle || "",
      zona: m.zona || "", frecuencia: m.frecuencia || "semanal", iconos: m.iconos || [], info: m.info || null,
      nivel: m.nivel || "", misiones: m.misiones || null,
    }))),
    ...st.custom.map((m) => ({ ...m, propia: true })),
  ];

  const hecha = (m) => {
    const t = st.hechas[m.key];
    return !!t && t >= inicioPeriodo(m.frecuencia).getTime();
  };

  // limpia marcas que ya se reiniciaron en todas las frecuencias
  const limiteViejo = Math.min(inicioSemana().getTime(), inicioMes().getTime());
  for (const lista of [st.hechas, st.deshechas]) {
    Object.keys(lista).forEach((k) => { if (lista[k] < limiteViejo) delete lista[k]; });
  }
  guardar(false);

  const FILTROS_MAPA = ["plano", "w", "nivel"];
  const f = { plano: "", w: "", nivel: "", ...guardado.leer("mir4:f-planner", {}) };

  const tarjetaMapa = `
      <section class="card">
        <div class="card-head"><div><h2>Jefes de mapa</h2>
          <p class="sub">Ordenados por cuál sale primero · tu hora local</p></div>
        </div>
        <div class="filters" style="margin-bottom:8px">
          <label class="field">Plano<select data-filtro="plano"></select></label>
          <label class="field">Mundo<select data-filtro="w"></select></label>
          <label class="field">Nivel<select data-filtro="nivel"></select></label>
          <button class="btn" type="button" id="limpiar-filtros">Limpiar</button>
        </div>
        <div id="mapa"></div>
      </section>`;
  const tarjetaLista = (c) => `
        <section class="card">
          <div class="card-head"><div><h2>${CATS[c].plural}</h2><p class="sub" data-sub="${c}"></p></div></div>
          ${c === "invocado" ? `<div class="filters" style="margin-bottom:8px">
            <label class="field">Nivel del mapa<select data-filtro-inv="nivel"></select></label></div>` : ""}
          <div data-lista="${c}"></div>
          ${FIJAS.includes(c) ? "" : formulario(c)}
        </section>`;
  const tarjetaProgreso = `
      <section class="card">
        <div class="card-head"><div><h2>Progreso</h2><p class="sub">${vista === "mapa" ? "Por nivel" : "Por zona"} · período actual</p></div></div>
        <div id="progreso"></div>
      </section>`;

  el.innerHTML = `
    <div class="grid g-3" id="kpis"></div>
    ${vista === "todas"
      ? `${tarjetaMapa}<div class="grid g-2 listas">${LISTAS.map(tarjetaLista).join("")}</div>`
      : `<div class="grid g-21">${vista === "mapa" ? tarjetaMapa : tarjetaLista(vista)}${tarjetaProgreso}</div>`}
    <section class="card">
      <div class="card-head"><div><h2>Historial de realizadas</h2>
        <p class="sub">${vista === "todas" ? "Todas las categorías" : esc(CATS[vista].plural)} · vuelven solas con su reset (diario, semanal o mensual)</p></div></div>
      <div id="hechas"></div>
    </section>`;

  function formulario(c) {
    return `<form class="nueva" data-form="${c}">
      <label class="field">Nombre<input type="text" name="nombre" required placeholder="${c === "invocado" ? "Jefe que invocás" : "Nombre de la misión"}"></label>
      <label class="field">${c === "invocado" ? "Recursos que pide" : "Servidor / detalle"}<input type="text" name="detalle"></label>
      <label class="field">Tipo<select name="frecuencia">${Object.entries(FRECUENCIAS).map(([k, v]) =>
        `<option value="${k}" ${k === "semanal" ? "selected" : ""}>${v.nombre} · vuelve ${v.vuelve.replace(/ \(.*\)/, "")}</option>`).join("")}</select></label>
      <button class="btn btn-gold" type="submit">Agregar</button>
    </form>`;
  }

  // Ícono de recompensa recortado de una captura del juego (sprite): {img, x, y, w, h, iw, ih}
  const icono = (i, tam = 40) => {
    const k = tam / i.w;
    return `<span class="ico" style="background-image:url('${esc(i.img)}');background-size:${i.iw * k}px ${i.ih * k}px;background-position:-${i.x * k}px -${i.y * k}px"></span>`;
  };
  // Datos de invocación: ítem que se invoca, dónde se crea y cómo conseguir los materiales.
  const lineas = (t) => esc(t).split("\n").join("<br>");
  // Orden de importancia: 1) materiales para craftear, 2) recompensas, 3) ítem de invocación que se crea.
  const infoExtra = (i, m) => `
    ${i.craft_img ? `
    <div class="inv-craft">
      <div class="inv-label">Materiales para craftear</div>
      <a href="${esc(i.craft_img.img)}" target="_blank" rel="noopener" title="Ver en grande">
        <img src="${esc(i.craft_img.img)}" alt="Materiales para craftear ${esc(i.item)}" loading="lazy"
          class="${i.craft_img.w / i.craft_img.h < 2 ? "cuadrada" : ""}"></a>
    </div>` : ""}
    <div class="inv-fila">
      ${m.misiones
        // doble recompensa: una sola invocación completa 2 misiones; se muestran las recompensas de cada una
        ? `<div class="inv-bloque"><div class="inv-label">${m.misiones.length} recompensas</div>
          <div class="inv-dobles">${m.misiones.map((x) => `<div class="inv-doble">
            <div class="iconos chicos">${x.iconos.map((ic) => icono(ic, 34)).join("")}</div>
            <span>${esc(x.nombre)}</span></div>`).join("")}</div></div>`
        : m.iconos?.length ? `<div class="inv-bloque"><div class="inv-label">Recompensas</div>
        <div class="iconos chicos">${m.iconos.map((x) => icono(x, 34)).join("")}</div></div>` : ""}
      <div class="inv-bloque"><div class="inv-label">Invocación que se crea</div>
        <div class="inv-item">${i.icono ? icono(i.icono, 34) : ""}<b>${esc(i.item)}</b></div></div>
    </div>
    <details class="inv-detalle"><summary>Dónde se crea y cómo farmear</summary>
      <dl class="kv">
        <dt>Se crea en</dt><dd>${i.npc ? esc(i.npc) : `<span class="muted">Sin datos todavía</span>`}</dd>
        ${i.craft ? `<dt>Materiales</dt><dd>${lineas(i.craft)}</dd>` : ""}
        <dt>Cómo farmear</dt><dd>${i.farmeo ? lineas(i.farmeo) : `<span class="muted">Sin datos todavía</span>`}</dd>
      </dl>
    </details>`;
  const fila = (m, extra = "") => `
    <div class="mision ${m.info ? "invocacion" : ""}" data-key="${esc(m.key)}">
      ${m.iconos?.length && !m.info ? `<div class="iconos" aria-hidden="true">${m.iconos.map((i) => icono(i)).join("")}</div>` : ""}
      ${m.cat === "invocado"
        // jefes invocados: primero el mapa (lo que más importa para ubicarse), después la misión
        ? `<div class="info"><div class="name mapa-titulo">${esc(m.detalle)} ${badgeFrec(m.frecuencia)}${m.misiones ? ` <span class="badge-doble">${m.misiones.length} recompensas</span>` : ""}</div>
        <div class="mision-sub">${esc(m.nombre)}</div>`
        : `<div class="info"><div class="name">${esc(m.nombre)} ${m.cat === "mapa" ? "" : badgeFrec(m.frecuencia)}</div>
        <div class="muted" style="font-size:12px">${esc(m.detalle) || "&nbsp;"}</div>`}
        ${m.info ? infoExtra(m.info, m) : ""}</div>
      ${extra}
      <button class="btn btn-ok" data-hecha="${esc(m.key)}" title="Marcar como hecha">✓ Hecha</button>
      ${m.propia ? `<button class="icon-btn" data-borrar="${esc(m.key)}" title="Borrar misión" aria-label="Borrar ${esc(m.nombre)}">×</button>` : ""}
    </div>`;

  function dibujarKpis() {
    const todo = catalogo().filter(enVista), n = todo.filter(hecha).length;
    const pistaPend = vista === "todas"
      ? Object.keys(CATS).map((c) => [c, todo.filter((m) => m.cat === c && !hecha(m)).length]).filter(([, k]) => k)
        .map(([c, k]) => `${k} ${CATS[c].plural.toLowerCase()}`).join(" · ")
      : CATS[vista].plural;
    el.querySelector("#kpis").innerHTML = `
      <div class="card stat"><div class="label">Realizadas</div>
        <div class="value">${n} <span class="muted" style="font-size:16px">/ ${todo.length}</span></div>
        <div class="progress" style="margin-top:8px"><i style="width:${todo.length ? n / todo.length * 100 : 0}%"></i></div></div>
      ${stat("Pendientes", todo.length - n, pistaPend)}
      <div class="card stat"><div class="label">Próximos resets</div>
        <dl class="kv resets">${Object.entries(FRECUENCIAS).map(([k, v]) =>
          `<dt>${badgeFrec(k)}</dt><dd><span class="countdown" data-cd="${k}"></span> <span class="muted">· ${v.vuelve.replace(/ \(.*\)/, "")}</span></dd>`).join("")}</dl></div>`;
  }

  function dibujarMapa() {
    if (!el.querySelector("#mapa")) return;
    const ahora = new Date();
    const todos = catalogo().filter((m) => m.cat === "mapa");
    // Cada filtro ofrece solo los valores posibles según los otros (ej.: plano L1 -> mundos W1-W3).
    const pasa = (m, salvo) => FILTROS_MAPA.every((k) => k === salvo || !f[k] || m[k] === f[k]);
    const orden = (a, b) => a.localeCompare(b, "es", { numeric: true });
    FILTROS_MAPA.forEach((k) => {
      const valores = [...new Set(todos.filter((m) => pasa(m, k)).map((m) => m[k]))].filter(Boolean).sort(orden);
      if (f[k] && !valores.includes(f[k])) f[k] = "";
      el.querySelector(`[data-filtro="${k}"]`).innerHTML = `<option value="">Todos</option>` +
        valores.map((v) => `<option ${v === f[k] ? "selected" : ""}>${esc(v)}</option>`).join("");
    });
    el.querySelector("#limpiar-filtros").hidden = !FILTROS_MAPA.some((k) => f[k]);
    const xs = todos.filter((m) => !hecha(m) && pasa(m))
      .map((m) => ({ m, p: proxima(m.horas, VENTANA_JEFE, ahora) }))
      .sort((a, b) => (a.p ? a.p.fecha : Infinity) - (b.p ? b.p.fecha : Infinity));
    el.querySelector("#mapa").innerHTML = xs.length ? xs.map(({ m }) =>
      fila({ ...m, detalle: `${m.detalle} · ${m.nivel}` }, `<div class="when" data-when="${esc(m.key)}"></div>`)).join("")
      : `<p class="muted">No quedan jefes de mapa pendientes${FILTROS_MAPA.some((k) => f[k]) ? " con estos filtros" : ""} esta semana.</p>`;
    actualizarTiempos();
  }

  function actualizarTiempos() {
    const ahora = new Date(), porKey = new Map(catalogo().map((m) => [m.key, m]));
    el.querySelectorAll("[data-when]").forEach((w) => {
      const m = porKey.get(w.dataset.when);
      const p = m && proxima(m.horas, VENTANA_JEFE, ahora);
      if (!p) { w.innerHTML = `<span class="muted">sin horario</span>`; w.closest(".mision")?.classList.remove("urgente"); return; }
      const falta = p.fecha - ahora;
      const cls = p.activo ? "live" : falta < 15 * 60e3 ? "soon" : "";
      w.innerHTML = `${p.hora}<br><span class="countdown ${cls}">${p.activo ? "¡salió!" : cuentaRegresiva(falta)}</span>`;
      w.closest(".mision")?.classList.toggle("urgente", !!cls);
    });
    el.querySelectorAll("[data-cd]").forEach((c) => { c.textContent = cuentaRegresiva(proximoReset(c.dataset.cd, ahora) - ahora); });
  }

  function dibujarListas() {
    const todo = catalogo();
    // filtro de nivel de los jefes invocados (ofrece solo niveles que existen, en orden: -140, 141+, 143+…)
    const selInv = el.querySelector("[data-filtro-inv]");
    if (selInv) {
      const orden = (a, b) => parseInt(a) * (a.startsWith("-") ? -1 : 1) - parseInt(b) * (b.startsWith("-") ? -1 : 1);
      const niveles = [...new Set(todo.filter((m) => m.cat === "invocado" && m.nivel).map((m) => m.nivel))]
        .sort((a, b) => Math.abs(parseInt(a)) - Math.abs(parseInt(b)) || orden(a, b));
      if (f.nivelInv && !niveles.includes(f.nivelInv)) f.nivelInv = "";
      selInv.innerHTML = `<option value="">Todos</option>` +
        niveles.map((n) => `<option ${n === f.nivelInv ? "selected" : ""}>${esc(n)}</option>`).join("");
    }
    const pasaInv = (m) => m.cat !== "invocado" || !f.nivelInv || m.nivel === f.nivelInv;
    LISTAS.filter(ver).forEach((c) => {
      const xs = todo.filter((m) => m.cat === c && !hecha(m) && pasaInv(m));
      const total = todo.filter((m) => m.cat === c).length;
      const nHechas = todo.filter((m) => m.cat === c && hecha(m)).length; // sin filtro de nivel
      const hechasTxt = total ? `${nHechas} de ${total} hechas` : "";
      // subtítulo según los tipos que tiene la sección (ej.: todas semanales, o semanales + 1 mensual)
      const frecs = Object.keys(FRECUENCIAS).filter((k) => todo.some((m) => m.cat === c && m.frecuencia === k));
      const tipos = frecs.length === 1
        ? `${badgeFrec(frecs[0])} Todas ${FRECUENCIAS[frecs[0]].nombre.toLowerCase()}es: vuelven ${FRECUENCIAS[frecs[0]].vuelve.replace(/ \(.*\)/, "")}`
        : frecs.map((k) => `${badgeFrec(k)} ${todo.filter((m) => m.cat === c && m.frecuencia === k).length}`).join(" ");
      el.querySelector(`[data-sub="${c}"]`).innerHTML = FIJAS.includes(c)
        ? `${tipos}${hechasTxt ? ` · ${hechasTxt}` : ""}`
        : hechasTxt;
      let zona = null;
      el.querySelector(`[data-lista="${c}"]`).innerHTML = xs.length ? xs.map((m) => {
        const titulo = m.zona && m.zona !== zona ? `<div class="zona">${esc(m.zona)}</div>` : "";
        zona = m.zona;
        return titulo + fila(m);
      }).join("") : `<p class="muted">${total ? "Todo hecho por ahora." : CATS[c].vacio}</p>`;
    });
  }

  function dibujarHechas() {
    const xs = catalogo().filter((m) => enVista(m) && hecha(m)).sort((a, b) => st.hechas[b.key] - st.hechas[a.key]);
    el.querySelector("#hechas").innerHTML = xs.length ? xs.map((m) => `
      <div class="mision hecha">
        <span class="cat" style="--c:${CATS[m.cat].color}">${CATS[m.cat].nombre}</span>
        ${m.iconos?.length ? `<div class="iconos" aria-hidden="true">${m.iconos.map((i) => icono(i, 28)).join("")}</div>` : ""}
        <div class="info"><div class="name">${m.cat === "invocado" ? `${esc(m.detalle)} <span class="muted" style="font-weight:400">· ${esc(m.nombre)}</span>` : esc(m.nombre)}</div>
          <div class="muted" style="font-size:12px">${badgeFrec(m.frecuencia)} ${cuando(st.hechas[m.key])}</div></div>
        <button class="btn" data-deshacer="${esc(m.key)}">Deshacer</button>
      </div>`).join("") : `<p class="muted">Todavía no marcaste nada${vista === "todas" ? "" : ` de ${esc(CATS[vista].plural.toLowerCase())}`} en este período.</p>`;
  }

  // Detalle de una categoría: avance por zona (o por nivel en jefes de mapa).
  function dibujarProgreso() {
    const box = el.querySelector("#progreso"); if (!box) return;
    const grupo = (m) => m.cat === "mapa" ? m.nivel : (m.zona || FRECUENCIAS[m.frecuencia]?.nombre || "Otras");
    const grupos = new Map();
    catalogo().filter(enVista).forEach((m) => {
      const g = grupo(m);
      if (!grupos.has(g)) grupos.set(g, { total: 0, hechas: 0 });
      grupos.get(g).total++; if (hecha(m)) grupos.get(g).hechas++;
    });
    box.innerHTML = grupos.size ? [...grupos].map(([g, { total, hechas }]) => `
      <div class="prog-fila ${hechas === total ? "completa" : ""}">
        <div class="prog-tit"><span>${esc(g)}</span><span class="muted">${hechas === total ? "✓ " : ""}${hechas} / ${total}</span></div>
        <div class="progress"><i style="width:${hechas / total * 100}%"></i></div>
      </div>`).join("") : `<p class="muted">Sin misiones cargadas.</p>`;
  }

  const todo_ = () => { dibujarKpis(); dibujarMapa(); dibujarListas(); dibujarProgreso(); dibujarHechas(); };

  // Aviso abajo con "Deshacer" a mano, para corregir un toque equivocado sin buscar la lista de hechas.
  let timerAviso;
  function avisoDeshacer(key) {
    const m = catalogo().find((x) => x.key === key);
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast-aviso"; document.body.append(t); }
    t.innerHTML = `<span>✓ <b>${esc(m?.nombre || "Misión")}</b> marcada como hecha</span>
      <button class="btn btn-gold" type="button">Deshacer</button>`;
    t.classList.add("show");
    t.querySelector("button").addEventListener("click", () => {
      deshacer(key); guardar(); todo_();
      t.classList.remove("show");
    });
    clearTimeout(timerAviso);
    timerAviso = setTimeout(() => t.classList.remove("show"), 10000);
  }

  el.addEventListener("click", (ev) => {
    const b = ev.target.closest("button"); if (!b) return;
    if (b.dataset.hecha) { st.hechas[b.dataset.hecha] = Date.now(); avisoDeshacer(b.dataset.hecha); }
    else if (b.dataset.deshacer) deshacer(b.dataset.deshacer);
    else if (b.dataset.borrar) {
      st.custom = st.custom.filter((m) => m.key !== b.dataset.borrar);
      deshacer(b.dataset.borrar);
    } else return;
    guardar(); todo_();
  });
  el.querySelector("[data-filtro-inv]")?.addEventListener("change", (ev) => {
    f.nivelInv = ev.target.value; guardado.escribir("mir4:f-planner", f); dibujarListas();
  });
  el.querySelectorAll("[data-filtro]").forEach((s) => s.addEventListener("change", () => {
    f[s.dataset.filtro] = s.value; guardado.escribir("mir4:f-planner", f); dibujarMapa();
  }));
  el.querySelector("#limpiar-filtros")?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    FILTROS_MAPA.forEach((k) => { f[k] = ""; });
    guardado.escribir("mir4:f-planner", f); dibujarMapa();
  });
  el.querySelectorAll("form[data-form]").forEach((form) => form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const fd = new FormData(form), nombre = fd.get("nombre").trim();
    if (!nombre) return;
    const cat = form.dataset.form;
    st.custom.push({ key: `${cat}|propia|${Date.now()}`, cat, nombre, detalle: fd.get("detalle").trim(), frecuencia: fd.get("frecuencia") });
    guardar(); form.reset(); todo_();
  }));

  todo_();
  // cada segundo: cuentas regresivas; cada minuto se reordenan los jefes; al pasar la medianoche (reset) se rehace todo
  let periodo = inicioDia().getTime(), ultimo = Date.now();
  ctx.alSegundo(() => {
    const p = inicioDia().getTime();
    if (p !== periodo) { periodo = p; todo_(); return; }
    if (Date.now() - ultimo > 60e3) { ultimo = Date.now(); dibujarMapa(); return; }
    actualizarTiempos();
  });
}
