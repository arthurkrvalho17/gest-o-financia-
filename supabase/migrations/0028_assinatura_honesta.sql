-- =====================================================================
-- Assinatura do cliente — parar de afirmar o que não existe (31/08-01/09/2026)
--
-- Achado: a UI (AssinaturaModal.jsx) descrevia "assinatura eletrônica
-- avançada (Lei 14.063/2020), com trilha de auditoria" — nada disso existe
-- hoje (sem identificação do signatário, hash, carimbo de tempo ou log; a
-- plataforma externa — ZapSign — nunca foi integrada). O próprio traço
-- desenhado no canvas era descartado (nunca persistido).
--
-- Esta migration só ajusta o que o BANCO afirma por default; a mudança de
-- comportamento está no código (useContratos.js, AssinaturaModal.jsx).
-- Rode depois de 0000–0027.
-- =====================================================================

-- `nivel_assinatura` tinha default 'avancada' — todo documento nascia
-- afirmando um nível de assinatura que nenhum código jamais implementou.
-- Sem default: fica null até o dia em que uma via realmente avançada
-- (ZapSign ou equivalente) for integrada e puder setar isso de verdade.
alter table documentos alter column nivel_assinatura drop default;
comment on column documentos.nivel_assinatura is
  'avancada | qualificada — só preenchido quando uma plataforma de assinatura eletrônica de verdade (ex.: ZapSign) estiver integrada. Null = aceite interno, sem validade jurídica de assinatura avançada.';

-- Path (Storage privado, nunca URL pública) da imagem capturada na via
-- "assinar no aparelho" — um registro visual do traço, não uma assinatura
-- eletrônica avançada. Diferente de `url_pdf_assinado` (documento final
-- assinado por uma plataforma de verdade — ainda não implementado).
alter table documentos add column if not exists assinatura_imagem_path text;
comment on column documentos.assinatura_imagem_path is
  'Path no bucket privado "assinaturas" (Storage) da imagem do traço desenhado no aparelho. Registro de aceite visual, SEM valor probatório de assinatura eletrônica avançada.';

-- ── Bucket "assinaturas" (privado, RLS por loja) ──────────────────────
-- Mesma convenção dos demais buckets (0014): <loja_id>/... como 1º segmento.
insert into storage.buckets (id, name, public)
values ('assinaturas', 'assinaturas', false)
on conflict (id) do nothing;

drop policy if exists "assinatura_select" on storage.objects;
create policy "assinatura_select" on storage.objects for select
  using (bucket_id = 'assinaturas'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "assinatura_insert" on storage.objects;
create policy "assinatura_insert" on storage.objects for insert
  with check (bucket_id = 'assinaturas'
              and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "assinatura_update" on storage.objects;
create policy "assinatura_update" on storage.objects for update
  using (bucket_id = 'assinaturas'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);

drop policy if exists "assinatura_delete" on storage.objects;
create policy "assinatura_delete" on storage.objects for delete
  using (bucket_id = 'assinaturas'
         and (storage.foldername(name))[1] = loja_do_usuario()::text);
