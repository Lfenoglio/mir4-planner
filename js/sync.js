// Sincroniza las marcas del planner entre dispositivos usando Supabase (ver supabase.sql y config.js).
// Cada dispositivo guarda sus marcas en localStorage y las une con las de la nube:
// por cada misión gana la acción más reciente (marcar como hecha o deshacer).
import { esc, guardado } from "./util.js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

const CLAVE = "mir4:planner", CLAVE_CODIGO = "mir4:sync-codigo";
const FORMATO = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
export const configurado = !!(SUPABASE_URL && SUPABASE_KEY);

let alCambiar = () => {}, timer = null, enCurso = null;

function nuevoCodigo() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I para que no se confundan
  const s = [...crypto.getRandomValues(new Uint8Array(12))].map((x) => abc[x % abc.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}
export function codigo() {
  let c = guardado.leer(CLAVE_CODIGO, null);
  if (!c) { c = nuevoCodigo(); guardado.escribir(CLAVE_CODIGO, c); }
  return c;
}

async function rpc(fn, args) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8000);
  const headers = { apikey: SUPABASE_KEY, "Content-Type": "application/json" };
  if (SUPABASE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_KEY}`; // clave "anon" vieja (JWT)
  try {
    const res = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/rpc/${fn}`,
      { method: "POST", headers, body: JSON.stringify(args), signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  } finally { clearTimeout(t); }
}

/** Une dos estados: por cada misión gana lo más reciente entre "hecha" y "deshecha". */
export function unir(a, b) {
  const out = { hechas: {}, deshechas: {} };
  const claves = new Set([a, b].flatMap((s) => [...Object.keys(s?.hechas || {}), ...Object.keys(s?.deshechas || {})]));
  for (const k of claves) {
    const h = Math.max(a?.hechas?.[k] || 0, b?.hechas?.[k] || 0);
    const d = Math.max(a?.deshechas?.[k] || 0, b?.deshechas?.[k] || 0);
    if (h > d) out.hechas[k] = h; else out.deshechas[k] = d;
  }
  return out;
}
const firma = (s) => JSON.stringify([Object.entries(s?.hechas || {}).sort(), Object.entries(s?.deshechas || {}).sort()]);

/** Baja lo de la nube, lo une con lo local y sube el resultado. Devuelve true si cambió lo local. */
export function sincronizar() {
  if (!configurado) return Promise.resolve(false);
  if (enCurso) return enCurso;
  enCurso = (async () => {
    pintar("sincronizando");
    try {
      const cod = codigo();
      const remoto = await rpc("leer_planner", { p_codigo: cod });
      // se lee lo local después de la descarga, así no se pisa algo marcado mientras tanto
      const local = guardado.leer(CLAVE, { hechas: {}, custom: [] });
      const unido = unir(local, remoto);
      const cambio = firma(unido) !== firma(local);
      if (cambio) guardado.escribir(CLAVE, { ...local, ...unido });
      if (firma(unido) !== firma(remoto)) await rpc("guardar_planner", { p_codigo: cod, p_datos: unido });
      pintar("ok");
      return cambio;
    } catch (e) {
      console.warn("Sincronización:", e);
      pintar("error");
      return false;
    } finally { enCurso = null; }
  })();
  return enCurso;
}

async function sincronizarYAvisar() {
  while (enCurso) await enCurso;
  if (await sincronizar()) alCambiar();
}

/** El planner avisa que cambió algo: se sube un segundo después (agrupa varios toques seguidos). */
export function avisarCambio() {
  if (!configurado) return;
  pintar("pendiente");
  clearTimeout(timer);
  timer = setTimeout(sincronizarYAvisar, 1000);
}

const TEXTOS = {
  sincronizando: "Sincronizando…", pendiente: "Guardando…",
  ok: "✓ Sincronizado", error: "Sin conexión: se reintenta solo",
};
function pintar(e) {
  const s = document.getElementById("sync-estado");
  if (!s) return;
  s.textContent = TEXTOS[e];
  s.dataset.e = e;
}

function armarPanel() {
  const el = document.getElementById("sync");
  if (!configurado) {
    el.innerHTML = `<div class="nav-group">Sincronización</div>
      <p class="sync-txt">Desactivada: lo que marcás queda solo en este navegador.</p>`;
    return;
  }
  el.innerHTML = `<div class="nav-group">Sincronización</div>
    <div class="sync-txt">Tu código</div>
    <div class="sync-codigo"><code id="sync-codigo">${esc(codigo())}</code>
      <button class="icon-btn" id="sync-copiar" type="button" title="Copiar código" aria-label="Copiar código">⧉</button></div>
    <div class="sync-txt" id="sync-estado"></div>
    <button class="btn sync-btn" id="sync-cambiar" type="button">Usar el código de otro dispositivo</button>`;
  el.querySelector("#sync-copiar").addEventListener("click", async (ev) => {
    try { await navigator.clipboard.writeText(codigo()); ev.currentTarget.textContent = "✓"; }
    catch { prompt("Copiá tu código:", codigo()); }
  });
  el.querySelector("#sync-cambiar").addEventListener("click", async () => {
    const txt = prompt("Pegá el código que aparece en tu otro dispositivo.\nLo que marcaste acá se suma a ese código.");
    if (txt === null) return;
    const c = txt.trim().toUpperCase().replace(/\s+/g, "");
    if (!FORMATO.test(c)) { alert("Ese código no es válido. Tiene que ser como ABCD-EFGH-JKLM."); return; }
    guardado.escribir(CLAVE_CODIGO, c);
    el.querySelector("#sync-codigo").textContent = c;
    while (enCurso) await enCurso;
    await sincronizar();
    alCambiar();
  });
}

/** Arma el panel lateral, sincroniza al abrir, cada minuto y al volver a la pestaña. */
export function iniciar(cuandoCambia) {
  alCambiar = cuandoCambia;
  armarPanel();
  if (!configurado) return;
  sincronizarYAvisar();
  setInterval(() => { if (document.visibilityState === "visible") sincronizarYAvisar(); }, 60e3);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizarYAvisar(); });
}
