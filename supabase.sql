-- MIR4 Planner: tabla y funciones para sincronizar las marcas entre dispositivos.
-- Pegalo entero en Supabase > SQL Editor > New query y tocá Run.

create table if not exists public.planner (
  codigo text primary key,
  datos jsonb not null,
  actualizado timestamptz not null default now()
);

-- Nadie puede leer ni escribir la tabla directamente (RLS activo y sin políticas).
-- Solo se accede con las dos funciones de abajo, y hay que conocer el código exacto.
alter table public.planner enable row level security;

create or replace function public.leer_planner(p_codigo text)
returns jsonb language sql stable security definer set search_path = public as $$
  select datos from public.planner where codigo = p_codigo;
$$;

create or replace function public.guardar_planner(p_codigo text, p_datos jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_codigo !~ '^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$' then
    raise exception 'codigo invalido';
  end if;
  if pg_column_size(p_datos) > 200000 then
    raise exception 'datos demasiado grandes';
  end if;
  insert into public.planner (codigo, datos, actualizado) values (p_codigo, p_datos, now())
  on conflict (codigo) do update set datos = excluded.datos, actualizado = now();
end $$;

revoke all on function public.leer_planner(text), public.guardar_planner(text, jsonb) from public;
grant execute on function public.leer_planner(text), public.guardar_planner(text, jsonb) to anon, authenticated;
