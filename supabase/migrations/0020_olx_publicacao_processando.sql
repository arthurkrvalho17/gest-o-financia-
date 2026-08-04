-- =====================================================================
-- OLX Autoupload — status honesto da publicação
--
-- statusCode 0 no import da OLX NÃO é publicação confirmada: significa
-- apenas que o lote passou na validação síncrona e entrou na moderação
-- ASSÍNCRONA. A resposta traz um `token` de importação (válido por 7
-- dias) usado para consultar o resultado real em
-- POST /autoupload/import/{token}. Só quando esse retorno diz "accepted"
-- o anúncio existe de fato — e é dele que sai a URL real.
--
-- Este migration:
--   1. guarda o token de importação em anuncio_publicacao
--   2. documenta o novo status 'processando' (entre o envio e a
--      confirmação da moderação). Não há CHECK constraint em status —
--      o domínio é documentado por comment, como nas demais colunas.
-- =====================================================================

alter table anuncio_publicacao
  add column if not exists token_importacao text;

comment on column anuncio_publicacao.token_importacao is
  'Token devolvido pelo import da OLX (expira em 7 dias) — usado por consultarStatus para confirmar a moderação assíncrona.';

comment on column anuncio_publicacao.status is
  'pendente | processando (enviado, moderação assíncrona em curso) | publicado | erro | despublicado';
