// Conector RENAVE (Renave Fácil) — ADR-16, revisado 02/09/2026.
//
// Papel real (confirmado direto na doc oficial, apidoc.renavefacil.net):
// alimentar cadastro (cliente/veículo) e enviar a chave da NF-e já emitida
// (compra/venda/transferência), e ESPELHAR status/documentos que a própria
// Renave Fácil expõe só leitura. O Financia+ NÃO registra entrada/saída no
// RENAVE — isso é feito no painel da própria integradora. Não existe
// consignação nesta API, não existe webhook.
//
// Toda chamada passa pela Edge Function `renave-api` (Fase B, ainda não
// implementada nesta fase) — nunca chama a Renave Fácil direto do
// navegador: a chave de parceiro (modelo Owner, igual Spedy/ADR-17) nunca
// pode transitar pelo cliente.
//
// Base real: https://api.renavefacil.net/v2/integration — SEM ambiente de
// homologação. Auth: header Authorization: Bearer <apiKey> (chave de
// parceiro, nunca por loja).
import { supabase } from '../../lib/supabase';

// invoke devolve FunctionsHttpError em não-2xx; o body real (erro da Renave
// Fácil ou da própria função) fica em error.context — mesmo padrão dos
// outros conectores (ver conectorOlx.js).
async function chamarRenaveApi(action, payload) {
  const { data, error } = await supabase.functions.invoke('renave-api', { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    let status = error.context?.status;
    try {
      const detalhe = await error.context.json();
      msg = detalhe.erro || msg;
      status = detalhe.status ?? status;
    } catch { /* mantém a mensagem genérica */ }
    const erro = new Error(msg);
    erro.status = status;
    throw erro;
  }
  return data;
}

// situacaoEstoqueRenave (GET /docs/status) → status exibido no Estoque.
// '' (sem processo) e códigos fora da lista documentada caem em 'sem_processo'
// / 'desconhecido' em vez de quebrar — a Renave Fácil pode devolver algo que
// ainda não documentou, e isso não pode virar exceção não tratada na UI.
export const MAPA_SITUACAO_ESTOQUE = {
  S: 'solicitado',
  T: 'transferido', // processo aberto no Detran, ainda não finalizado
  C: 'confirmado', // em estoque
  X: 'cancelado',
  V: 'vendido',
  E: 'transferencia_entre_estabelecimentos', // CNPJ raiz distinto
  I: 'transferencia_entre_filiais',
  '': 'sem_processo',
};

export function mapearSituacaoEstoque(situacao) {
  if (situacao == null) return 'sem_processo';
  return MAPA_SITUACAO_ESTOQUE[situacao] ?? 'desconhecido';
}

export const conectorRenave = {
  canal: 'renave',

  // POST/PUT /dms/{cnpjEstab}/client[/{cpfCnpj}] — a doc não lista o shape
  // completo do body de cliente; repassamos o que o chamador montar, sem
  // inventar campos que a doc não documentou.
  async sincronizarCliente({ cpfCnpj, dados }) {
    if (!cpfCnpj) throw new Error('cpfCnpj é obrigatório para sincronizar cliente na Renave Fácil.');
    try {
      await chamarRenaveApi('sincronizar_cliente', { cpfCnpj, dados });
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  // POST/PUT /dms/{cnpjEstab}/vehicle[/{chassi}/{tipoVeiculo}]
  // body: tipoVeiculo (N|U), chassi, descricao, anoFabricacao, anoModelo,
  // placa, renavam, codigoFipe (opcional). placa/renavam em branco se novo.
  async sincronizarVeiculo(veiculo) {
    const { chassi, tipoVeiculo, descricao, anoFabricacao, anoModelo, placa, renavam, codigoFipe } = veiculo || {};
    if (!chassi) throw new Error('chassi é obrigatório para sincronizar veículo na Renave Fácil.');
    if (tipoVeiculo !== 'N' && tipoVeiculo !== 'U') {
      throw new Error("tipoVeiculo precisa ser 'N' (novo) ou 'U' (usado).");
    }
    try {
      await chamarRenaveApi('sincronizar_veiculo', {
        chassi,
        tipoVeiculo,
        descricao,
        anoFabricacao,
        anoModelo,
        placa: placa || '',
        renavam: renavam || '',
        ...(codigoFipe ? { codigoFipe } : {}),
      });
      return { ok: true };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  // POST /dms/{cnpjEstab}/vehicle/nfe/{purchase|sales|transfer}
  // body: chassi, tipoVeiculo, chaveNfe, cpfCnpj, dtHrProcesso, valor.
  // A doc é explícita: o veículo precisa estar cadastrado ANTES, senão 404.
  //
  // Se o chamador passar `veiculoParaSincronizar` (os dados que ele já tem
  // à mão, ex.: ao registrar uma venda), o conector sincroniza o cadastro e
  // reenvia a chave UMA ÚNICA VEZ — nunca em loop. Sem esse dado, devolve
  // um erro tipado (`veiculo_nao_cadastrado`) pro chamador decidir.
  async _enviarChaveNfe(rota, { chassi, tipoVeiculo, chaveNfe, cpfCnpj, dtHrProcesso, valor, veiculoParaSincronizar }) {
    if (!chassi) throw new Error('chassi é obrigatório para enviar a chave da NF-e.');
    if (!chaveNfe) throw new Error('chaveNfe é obrigatória.');
    const enviar = () => chamarRenaveApi(`enviar_chave_nfe_${rota}`, { chassi, tipoVeiculo, chaveNfe, cpfCnpj, dtHrProcesso, valor });

    try {
      await enviar();
      return { ok: true };
    } catch (e) {
      if (e.status !== 404) return { ok: false, erro: e.message };

      if (!veiculoParaSincronizar) {
        return {
          ok: false,
          erro: 'veiculo_nao_cadastrado',
          mensagem: 'Veículo ainda não cadastrado na Renave Fácil — sincronize o cadastro do veículo antes de enviar a chave da NF-e.',
        };
      }

      const sinc = await this.sincronizarVeiculo(veiculoParaSincronizar);
      if (!sinc.ok) {
        return { ok: false, erro: 'veiculo_nao_cadastrado', mensagem: `Falha ao cadastrar o veículo antes de enviar a chave: ${sinc.erro}` };
      }
      try {
        await enviar();
        return { ok: true, reenfileirouCadastro: true };
      } catch (e2) {
        return { ok: false, erro: e2.message };
      }
    }
  },
  async enviarChaveNfeCompra(dados) {
    return this._enviarChaveNfe('purchase', dados);
  },
  async enviarChaveNfeVenda(dados) {
    return this._enviarChaveNfe('sales', dados);
  },
  async enviarChaveNfeTransferencia(dados) {
    return this._enviarChaveNfe('transfer', dados);
  },

  // GET /renave/{cnpjEstab}/docs/status?placa=&renavam=
  //
  // GUARD contra envio/consulta em massa: a doc da Renave Fácil proíbe
  // explicitamente sincronização em massa ("não é permitido o envio em
  // massa de dados, o envio deve ser sob demanda") — cadastro sem processo
  // aberto por >90 dias é apagado da base dela. Por isso esta função EXIGE
  // identificar um veículo específico (placa OU renavam); sem isso, não
  // existe "consultar todos" nesta interface, de propósito.
  async consultarStatus({ placa, renavam } = {}) {
    if (!placa && !renavam) {
      throw new Error('consultarStatus precisa de placa ou renavam — não existe consulta em lote nesta integração (proibido pela Renave Fácil).');
    }
    try {
      const resp = await chamarRenaveApi('consultar_status', { placa, renavam });
      return {
        ok: true,
        situacao: resp?.situacaoEstoqueRenave ?? '',
        statusEstoque: mapearSituacaoEstoque(resp?.situacaoEstoqueRenave),
        documentosDisponiveis: resp?.documentosDisponiveis || {},
        chassi: resp?.chassi,
        placa: resp?.placa,
        renavam: resp?.renavam,
        descricao: resp?.descricao,
      };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },

  // GET /docs/{atpve/entrada|atpve/saida|crlve} — só existe quando
  // documentosDisponiveis indicar presença (ex.: atpvEntrada ausente se a
  // entrada usou CRV em papel). `tipo` é o nome exato do documento, não
  // inventamos mapeamento além do que a doc lista.
  async baixarDocumento(tipo, { placa, renavam } = {}) {
    if (!['atpve_entrada', 'atpve_saida', 'crlve'].includes(tipo)) {
      throw new Error(`Tipo de documento RENAVE desconhecido: ${tipo}.`);
    }
    if (!placa && !renavam) {
      throw new Error('baixarDocumento precisa de placa ou renavam.');
    }
    try {
      const resp = await chamarRenaveApi('baixar_documento', { tipo, placa, renavam });
      return { ok: true, url: resp?.url || null };
    } catch (e) {
      return { ok: false, erro: e.message };
    }
  },
};
