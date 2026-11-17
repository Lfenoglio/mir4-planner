// Helpers compartidos: escape de HTML, cuenta regresiva y guardado local.

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function cuentaRegresiva(ms) {
  if (ms <= 0) return "ahora";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600),
    m = Math.floor(s % 3600 / 60), ss = s % 60;
  const p = (x) => String(x).padStart(2, "0");
  return d > 0 ? `${d}d ${p(h)}h ${p(m)}m` : `${p(h)}:${p(m)}:${p(ss)}`;
}

// localStorage tolerante a fallos
export const guardado = {
  leer(k, def) { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } },
  escribir(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
