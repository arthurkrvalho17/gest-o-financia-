-- =====================================================================
-- BLOQUEIA AUTOPROMOÇÃO — funcionário não pode virar dono sozinho
--
-- Achado (31/08/2026, durante o reteste de RLS multi-loja): a policy de
-- UPDATE em `usuarios` só valida a LOJA, não a COLUNA:
--
--   create policy "editar usuarios da minha loja" on usuarios
--     for update using (loja_id = loja_do_usuario())
--     with check (loja_id = loja_do_usuario());
--
-- Isso permite que QUALQUER usuário autenticado da loja — inclusive um
-- funcionário — rode, com a própria anon key:
--
--   update usuarios set papel = 'dono' where id = auth.uid();
--
-- e vire dono na hora (AuthContext.jsx relê `papel` do banco a cada login/
-- refresh de sessão — nunca confia em valor do cliente, então essa troca
-- concede acesso real). Sem fechar isso, qualquer proteção de coluna por
-- papel (ex.: valor de compra) é decorativa: o funcionário se autopromove
-- e ignora a máscara.
--
-- Correção: trigger que barra mudança de `papel`/`loja_id` quando a
-- requisição vem pela API pública (anon/authenticated) — não bloqueia
-- service_role nem sessões diretas (SQL Editor/migrations), porque o
-- roadmap já prevê um convite de acesso via Edge Function (service_role)
-- para promover um usuário a funcionário/dono no futuro (README §11).
-- =====================================================================

create or replace function bloquear_autopromocao_usuario()
returns trigger language plpgsql as $$
begin
  if auth.role() in ('anon', 'authenticated')
     and (new.papel is distinct from old.papel or new.loja_id is distinct from old.loja_id) then
    raise exception 'papel e loja_id não podem ser alterados por este caminho — precisa de uma Edge Function com service_role';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_autopromocao_usuario on usuarios;
create trigger trg_bloquear_autopromocao_usuario
  before update on usuarios
  for each row execute function bloquear_autopromocao_usuario();
