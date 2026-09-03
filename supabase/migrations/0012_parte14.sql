-- =====================================================================
-- PARTE 14 — Nota fiscal anexável em qualquer despesa
-- Rode depois de 0000–0011.
-- =====================================================================
-- Permite anexar a nota fiscal (foto JPG/PNG ou PDF) em qualquer despesa:
-- despesas (fixa/outra) e gastos de preparação. O arquivo vai ao Storage
-- (bucket "notas-fiscais", isolado por loja) e a URL fica no lançamento.

-- Despesas fixas/outras (tabela única "despesas", categoria = fixa|outra).
alter table despesas            add column if not exists nota_fiscal_url text;
alter table despesas            add column if not exists nota_fiscal_tipo text; -- imagem | pdf

-- Gastos de preparação (mesma fonte do custo do carro e da despesa do mês).
alter table preparacao_gastos   add column if not exists nota_fiscal_url text;
alter table preparacao_gastos   add column if not exists nota_fiscal_tipo text;

-- ---------------------------------------------------------------------
-- Storage: bucket privado "notas-fiscais", isolado por loja.
-- Convenção de caminho: <loja_id>/<arquivo>. As policies abaixo só liberam
-- o objeto cujo 1º segmento do nome é a loja do usuário (loja_do_usuario()).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('notas-fiscais', 'notas-fiscais', false)
on conflict (id) do nothing;

drop policy if exists "nf_select_own_loja" on storage.objects;
create policy "nf_select_own_loja" on storage.objects for select
  using (bucket_id = 'notas-fiscais'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "nf_insert_own_loja" on storage.objects;
create policy "nf_insert_own_loja" on storage.objects for insert
  with check (bucket_id = 'notas-fiscais'
              and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "nf_update_own_loja" on storage.objects;
create policy "nf_update_own_loja" on storage.objects for update
  using (bucket_id = 'notas-fiscais'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "nf_delete_own_loja" on storage.objects;
create policy "nf_delete_own_loja" on storage.objects for delete
  using (bucket_id = 'notas-fiscais'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);
