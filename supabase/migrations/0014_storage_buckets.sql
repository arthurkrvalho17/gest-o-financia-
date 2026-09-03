-- =====================================================================
-- STORAGE — buckets para fotos de veículos, documentos e logo da loja
-- Rode depois de 0000–0013.
-- Convenção de caminho em todos: <loja_id>/... (1º segmento = loja_id,
-- validado pelas policies abaixo via storage.foldername(name)[1]).
-- =====================================================================

-- ── fotos-veiculos ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('fotos-veiculos', 'fotos-veiculos', false)
on conflict (id) do nothing;

drop policy if exists "foto_select" on storage.objects;
create policy "foto_select" on storage.objects for select
  using (bucket_id = 'fotos-veiculos'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "foto_insert" on storage.objects;
create policy "foto_insert" on storage.objects for insert
  with check (bucket_id = 'fotos-veiculos'
              and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "foto_update" on storage.objects;
create policy "foto_update" on storage.objects for update
  using (bucket_id = 'fotos-veiculos'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "foto_delete" on storage.objects;
create policy "foto_delete" on storage.objects for delete
  using (bucket_id = 'fotos-veiculos'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

-- ── docs-veiculos ──────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('docs-veiculos', 'docs-veiculos', false)
on conflict (id) do nothing;

drop policy if exists "doc_select" on storage.objects;
create policy "doc_select" on storage.objects for select
  using (bucket_id = 'docs-veiculos'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "doc_insert" on storage.objects;
create policy "doc_insert" on storage.objects for insert
  with check (bucket_id = 'docs-veiculos'
              and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "doc_update" on storage.objects;
create policy "doc_update" on storage.objects for update
  using (bucket_id = 'docs-veiculos'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "doc_delete" on storage.objects;
create policy "doc_delete" on storage.objects for delete
  using (bucket_id = 'docs-veiculos'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

-- ── logos-lojas ────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('logos-lojas', 'logos-lojas', false)
on conflict (id) do nothing;

drop policy if exists "logo_select" on storage.objects;
create policy "logo_select" on storage.objects for select
  using (bucket_id = 'logos-lojas'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "logo_insert" on storage.objects;
create policy "logo_insert" on storage.objects for insert
  with check (bucket_id = 'logos-lojas'
              and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "logo_update" on storage.objects;
create policy "logo_update" on storage.objects for update
  using (bucket_id = 'logos-lojas'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "logo_delete" on storage.objects;
create policy "logo_delete" on storage.objects for delete
  using (bucket_id = 'logos-lojas'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

-- loja_config: colunas de identidade (endereço e cidade_uf, usados nos documentos)
alter table loja_config add column if not exists endereco text;
alter table loja_config add column if not exists cidade_uf text;

-- veiculo_documento: path do arquivo no Storage (para exclusão limpa)
alter table veiculo_documento add column if not exists arquivo_path text;
