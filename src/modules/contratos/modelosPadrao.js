// Conteúdo PADRÃO FINANCIA+ dos modelos de documento (texto com {{placeholders}}).
// O lojista pode editar (vira "Seu modelo") ou enviar o próprio arquivo.
// Os placeholders são substituídos pelos dados do cliente/veículo na geração.

export const PLACEHOLDERS = [
  '{{loja_nome}}', '{{loja_cnpj}}', '{{data}}',
  '{{cliente_nome}}', '{{cliente_cpf}}', '{{cliente_nascimento}}', '{{cliente_endereco}}', '{{cliente_telefone}}',
  '{{veiculo_modelo}}', '{{veiculo_ano}}', '{{veiculo_placa}}', '{{veiculo_renavam}}', '{{veiculo_chassi}}', '{{veiculo_km}}', '{{veiculo_cor}}',
  '{{valor}}',
];

export const MODELOS_PADRAO = {
  compra_venda: `CONTRATO DE COMPRA E VENDA DE VEÍCULO USADO

VENDEDORA: {{loja_nome}}, inscrita no CNPJ {{loja_cnpj}}.
COMPRADOR(A): {{cliente_nome}}, CPF {{cliente_cpf}}, nascido(a) em {{cliente_nascimento}}, residente em {{cliente_endereco}}.

VEÍCULO: {{veiculo_modelo}}, ano/modelo {{veiculo_ano}}, cor {{veiculo_cor}}, placa {{veiculo_placa}}, RENAVAM {{veiculo_renavam}}, chassi {{veiculo_chassi}}, {{veiculo_km}} km.

1. A VENDEDORA vende ao(à) COMPRADOR(A) o veículo acima descrito, pelo valor de {{valor}}.
2. O(A) COMPRADOR(A) declara que vistoriou o veículo, ciente de tratar-se de bem USADO, adquirindo-o no estado em que se encontra.
3. A transferência junto ao Detran é de responsabilidade do(a) COMPRADOR(A), no prazo legal.
4. Eventual garantia segue o pactuado entre as partes e o Código de Defesa do Consumidor.

{{data}}

____________________________________
{{loja_nome}} (Vendedora)

____________________________________
{{cliente_nome}} (Comprador(a))`,

  recibo_sinal: `RECIBO DE SINAL (ARRAS)

Recebemos de {{cliente_nome}}, CPF {{cliente_cpf}}, a quantia correspondente ao SINAL para reserva do veículo {{veiculo_modelo}}, placa {{veiculo_placa}}, no valor total de {{valor}}.

O sinal é regido pelos arts. 417 a 420 do Código Civil: se o(a) comprador(a) desistir, perde o sinal; se a loja desistir, devolve-o em dobro. O valor do sinal será abatido do preço final no ato da compra.

{{data}}

____________________________________
{{loja_nome}}`,

  consignacao: `CONTRATO DE CONSIGNAÇÃO DE VEÍCULO

CONSIGNATÁRIA: {{loja_nome}}, CNPJ {{loja_cnpj}}.
CONSIGNANTE: {{cliente_nome}}, CPF {{cliente_cpf}}, nascido(a) em {{cliente_nascimento}}.

O(A) CONSIGNANTE entrega à loja, em consignação para venda, o veículo {{veiculo_modelo}}, placa {{veiculo_placa}}, RENAVAM {{veiculo_renavam}}, autorizando o anúncio e a negociação.

1. Valor de venda pretendido: {{valor}}.
2. A loja fica responsável pela intermediação; IPVA, multas e manutenção seguem o pactuado.
3. O repasse ao(à) consignante e a comissão da loja são os definidos entre as partes.

{{data}}

____________________________________
{{loja_nome}} (Consignatária)

____________________________________
{{cliente_nome}} (Consignante)`,

  test_drive: `TERMO DE RESPONSABILIDADE — TEST DRIVE

CONDUTOR(A): {{cliente_nome}}, CPF {{cliente_cpf}}, nascido(a) em {{cliente_nascimento}}.
VEÍCULO: {{veiculo_modelo}}, placa {{veiculo_placa}}.

O(A) condutor(a) declara possuir CNH válida e assume total responsabilidade por danos, multas e ocorrências durante o test drive do veículo acima, isentando a loja {{loja_nome}} de responsabilidade por infrações cometidas no período.

{{data}}

____________________________________
{{cliente_nome}} (Condutor(a))`,

  procuracao: `PROCURAÇÃO

OUTORGANTE: {{cliente_nome}}, CPF {{cliente_cpf}}, nascido(a) em {{cliente_nascimento}}, residente em {{cliente_endereco}}.

Pelo presente, o(a) OUTORGANTE nomeia e constitui seu bastante procurador para representá-lo(a) junto ao Detran e demais órgãos, com poderes para assinar a ATPV-e/CRV e praticar os atos necessários à transferência do veículo {{veiculo_modelo}}, placa {{veiculo_placa}}, RENAVAM {{veiculo_renavam}}, chassi {{veiculo_chassi}}.

{{data}}

____________________________________
{{cliente_nome}} (Outorgante)`,
};
