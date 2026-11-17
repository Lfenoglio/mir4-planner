import { esc } from "./util.js";
import * as P from "./planner.js";
import * as sync from "./sync.js";

// Jefes de mapa y misiones, cargados a mano en hora local.
const DATOS = "data/horarios.json";

let ctx, ticks = [];

function reloj() {
  const d = new Date(), p = (x) => String(x).padStart(2, "0");
  document.getElementById("server-clock").textContent = `Tu hora: ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function armarSubPlanner() {
  const sub = document.getElementById("sub-planner");
  sub.innerHTML = [{ id: "todas", nombre: "Todas las misiones" }, ...P.CATEGORIAS_PLANNER()].map((c) =>
    `<a href="#/planner${c.id === "todas" ? "" : `/${c.id}`}" data-cat="${c.id}">
      <i style="background:${c.color || "var(--gold)"}"></i>${esc(c.nombre)}</a>`).join("");
}

// subir=false: se redibuja sin mover la página (por ejemplo, cuando llegan marcas de otro dispositivo)
function render(subir = true) {
  ticks = [];
  const [, param] = location.hash.replace(/^#\/?/, "").split("/");
  document.querySelectorAll("#sub-planner a").forEach((a) =>
    a.classList.toggle("active", a.dataset.cat === (param || "todas")));
  document.getElementById("title").textContent = "Planner de misiones";
  document.title = "Planner de misiones · MIR4";
  // contenedor nuevo en cada vista: así no se acumulan los listeners de la vista anterior
  const viejo = document.getElementById("view");
  const el = viejo.cloneNode(false);
  viejo.replaceWith(el);
  document.getElementById("toast")?.remove();
  try {
    P.planner(ctx, el, param);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<p class="empty">Error al mostrar el planner: ${esc(e.message)}</p>`;
  }
  if (subir !== false) window.scrollTo(0, 0);
}

async function iniciar() {
  let D;
  try {
    const res = await fetch(DATOS, { cache: "no-store" });
    if (!res.ok) throw new Error(`${DATOS}: ${res.status}`);
    D = await res.json();
  } catch (e) {
    document.getElementById("view").innerHTML =
      `<p class="empty">No se pudieron cargar las misiones (${esc(e.message)}).<br>
       Abrilo con el servidor local: <code>python scripts/servidor.py</code></p>`;
    return;
  }
  ctx = { D, alSegundo(fn) { ticks.push(fn); fn(); } };
  armarSubPlanner();
  window.addEventListener("hashchange", render);
  setInterval(() => { reloj(); ticks.forEach((f) => f()); }, 1000);
  reloj();
  render();
  // muestra lo local al instante y después trae lo de la nube (si cambió algo, redibuja)
  sync.iniciar(() => render(false));
}

iniciar();
