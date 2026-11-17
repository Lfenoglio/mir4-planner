# MIR4 Planner de misiones

Planner para ir marcando las misiones de MIR4 que ya hiciste. Cada una vuelve a aparecer sola cuando le toca el reset.

**Publicado en https://lfenoglio.github.io/mir4-planner/**. Repositorio: https://github.com/Lfenoglio/mir4-planner. Cada `git push` a `main` actualiza la página en uno o dos minutos.

## Categorías

En la barra lateral podés ver todas juntas o una sola:
- **Jefes de mapa:** ordenados por cuál sale primero, con cuenta regresiva y filtros de plano, mundo y nivel. Se resaltan los que salen en menos de 15 minutos.
- **Dominación:** Pueblo de Sabuk, Laberinto y Valle oculto del Dragón negro.
- **Purgatorio de Luna sangrienta:** pisos 3 a 7.
- **Jefes invocados:** materiales para craftear, recompensas e ítem de invocación, con filtro de nivel del mapa.
- **Expedición:** Cima inexplorada y misiones por mundo.

## Cómo se usa

- Cuando terminás algo, tocás **✓ Hecha** y desaparece. Si fue un error, tocás **Deshacer** en el aviso que aparece abajo durante 10 segundos. También se puede deshacer desde **Historial de realizadas**, al final de la página.
- Resets, en tu hora local:
  - **Diaria:** todos los días a las 00:00.
  - **Semanal:** el lunes a las 00:00, cuando termina el domingo.
  - **Mensual:** el día 1 a las 00:00, cuando termina el mes.
- Lo que marcás se guarda en el navegador. Si activás la sincronización (ver abajo), también queda en la nube y se ve en todos tus dispositivos.

## Sincronización entre dispositivos (Supabase)

Cada dispositivo muestra en la barra lateral un **código** (por ejemplo `ABCD-EFGH-JKLM`). En el otro dispositivo tocás **Usar el código de otro dispositivo**, lo pegás, y desde ahí los dos comparten las marcas. Se sincroniza al abrir la página, un segundo después de cada marca, cada minuto y al volver a la pestaña. Si dos dispositivos tocan la misma misión, gana lo último que se hizo (marcar o deshacer).

Para activarla, una sola vez:
1. Creá una cuenta gratis en https://supabase.com y un proyecto nuevo.
2. En el proyecto, abrí **SQL Editor**, pegá todo `supabase.sql` y tocá **Run**.
3. En **Project Settings › API** (o el botón **Connect**), copiá la **Project URL** y la clave pública (**anon** o **publishable**) y pegalas en `js/config.js`. Nunca uses la clave `service_role` ni la `secret`.

Datos que conviene saber:
- La clave pública puede estar en el código sin problema. La tabla está cerrada, y solo se lee o se escribe con el código exacto.
- El código funciona como una contraseña: el que lo tenga ve y cambia tus marcas.
- En el plan gratis, Supabase pausa el proyecto si pasa una semana sin uso. Se reactiva desde su panel.

## Cómo abrirlo

```bash
cd C:\Users\leonardo\Desktop\CLAUDE\mir4-dashboard
python scripts/servidor.py
```

Después abrí http://localhost:8000. Si abrís `index.html` con doble clic no anda, porque el navegador bloquea la carga del JSON.

## Datos: `data/horarios.json`

Todo se carga a mano en este archivo, en hora local:

| Clave | Contenido |
|---|---|
| `jefes` | `{nivel, mundo, mapa, jefe, seguir, horas: ["HH:MM", …]}` |
| `misiones` | `{dominacion: [...], purgatorio: [...], invocado: [...], expedicion: [...]}`. Cada una es `{zona, nombre, detalle, frecuencia: "diaria"/"semanal"/"mensual", iconos, nivel?, info?, misiones?}` |

`iconos` son recortes de capturas del juego: `{img, x, y, w, h, iw, ih}`. Las imágenes están en `img/`.

## Archivos

- `index.html`, `styles.css`: estructura y estilo (oscuro con dorado)
- `js/app.js`: carga de datos, menú lateral y rutas (`#/planner`, `#/planner/invocado`, …)
- `js/planner.js`: el planner
- `js/sync.js`, `js/config.js`, `supabase.sql`: sincronización con Supabase
- `js/util.js`: escape de HTML, cuenta regresiva y guardado local
- `scripts/servidor.py`: servidor local sin caché
