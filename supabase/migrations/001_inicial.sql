-- Augenda · estrutura inicial do banco no Supabase
-- Como usar: Supabase > SQL Editor > New query > cole este arquivo > Run.
-- Pode ser executado mais de uma vez sem erro.

-- ============================================================
-- Tabelas
-- ============================================================

create table if not exists public.perfis (
    id              uuid primary key references auth.users (id) on delete cascade,
    nome            text not null default '' check (char_length(nome) <= 60),
    sobrenome       text not null default '' check (char_length(sobrenome) <= 80),
    data_nascimento date,
    foto_path       text,
    atualizado_em   timestamptz not null default now()
);

create table if not exists public.animais (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
    nome            text not null check (char_length(nome) between 1 and 60),
    especie         text not null check (especie in ('Cão', 'Gato', 'Outro')),
    porte           text check (porte in ('Pequeno', 'Médio', 'Grande')),
    raca            text check (char_length(raca) <= 60),
    data_nascimento date,
    sexo            text check (sexo in ('Fêmea', 'Macho')),
    foto_path       text,
    criado_em       timestamptz not null default now()
);

create table if not exists public.registros (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
    animal_id       uuid not null references public.animais (id) on delete cascade,
    tipo            text not null check (tipo in (
                        'Peso e condição corporal', 'Alimentação', 'Atividade física',
                        'Vacinação', 'Consulta', 'Medicamento', 'Comportamento anormal')),
    data            date not null,
    proxima_data    date,
    peso            numeric(6, 2) check (peso > 0),
    bcs             smallint check (bcs between 1 and 9),
    mcs             text check (mcs in ('Normal', 'Leve', 'Moderada', 'Grave')),
    duracao         integer check (duracao > 0),
    descricao       text check (char_length(descricao) <= 1000),
    percebido_em    timestamp,
    tipo_observacao text check (tipo_observacao in ('behavior', 'bruise', 'both')),
    criado_em       timestamptz not null default now()
);

-- Índices: as consultas sempre filtram por usuário e por animal
create index if not exists animais_user_id_idx on public.animais (user_id);
create index if not exists registros_user_id_idx on public.registros (user_id);
create index if not exists registros_animal_data_idx on public.registros (animal_id, data desc);

-- ============================================================
-- Segurança (RLS): cada usuário só enxerga e altera os próprios dados
-- ============================================================

alter table public.perfis enable row level security;
alter table public.animais enable row level security;
alter table public.registros enable row level security;

grant select, insert, update, delete on public.perfis, public.animais, public.registros to authenticated;
revoke all on public.perfis, public.animais, public.registros from anon;

drop policy if exists "perfis_dono" on public.perfis;
create policy "perfis_dono" on public.perfis
    for all to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

drop policy if exists "animais_dono" on public.animais;
create policy "animais_dono" on public.animais
    for all to authenticated
    using (user_id = (select auth.uid()))
    with check (user_id = (select auth.uid()));

drop policy if exists "registros_dono" on public.registros;
create policy "registros_dono" on public.registros
    for all to authenticated
    using (user_id = (select auth.uid()))
    with check (
        user_id = (select auth.uid())
        and exists (
            select 1 from public.animais a
            where a.id = animal_id and a.user_id = (select auth.uid())
        )
    );

-- ============================================================
-- Storage: fotos de pets e da tutora (bucket privado, pasta por usuário)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 1048576, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "fotos_dono_select" on storage.objects;
create policy "fotos_dono_select" on storage.objects
    for select to authenticated
    using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "fotos_dono_insert" on storage.objects;
create policy "fotos_dono_insert" on storage.objects
    for insert to authenticated
    with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "fotos_dono_update" on storage.objects;
create policy "fotos_dono_update" on storage.objects
    for update to authenticated
    using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "fotos_dono_delete" on storage.objects;
create policy "fotos_dono_delete" on storage.objects
    for delete to authenticated
    using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text);
