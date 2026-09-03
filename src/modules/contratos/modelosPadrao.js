// Conteúdo PADRÃO FINANCIA+ dos modelos de documento (texto com {{placeholders}}).
// O lojista pode editar (vira "Seu modelo") ou enviar o próprio arquivo.
// Os placeholders são substituídos pelos dados do cliente/veículo na geração.
// compra_venda e procuracao são os MODELOS REAIS digitalizados da loja (parte 13) —
// reproduzidos fielmente; só os dados específicos viram campos {{...}}.

export const PLACEHOLDERS = [
  '{{loja_razao_social}}', '{{loja_cnpj}}', '{{loja_endereco}}', '{{loja_cidade_uf}}', '{{data}}',
  '{{cliente_nome}}', '{{cliente_cpf}}', '{{cliente_nascimento}}', '{{cliente_endereco}}', '{{cliente_telefone}}', '{{cliente_email}}', '{{cliente_estado_civil}}',
  '{{outorgante_nome}}', '{{outorgante_cpf}}', '{{outorgante_endereco}}', '{{outorgante_nacionalidade}}', '{{outorgante_estado_civil}}',
  '{{outorgado_nome}}', '{{outorgado_cpf}}', '{{outorgado_endereco}}', '{{outorgado_nacionalidade}}', '{{outorgado_estado_civil}}',
  '{{veiculo_marca}}', '{{veiculo_modelo}}', '{{veiculo_cor}}', '{{veiculo_combustivel}}', '{{veiculo_ano_fab_mod}}', '{{veiculo_km}}', '{{veiculo_placa}}', '{{veiculo_renavam}}', '{{veiculo_chassi}}',
  '{{vendedor_nome}}', '{{data_venda}}', '{{hora_venda}}', '{{valor_venda}}', '{{forma_pagamento}}', '{{observacoes}}',
  '{{data_procuracao}}', '{{cidade_procuracao}}',
  '{{tributos}}', '{{furto}}', '{{multas_abertas}}', '{{alienacao}}', '{{registros_impeditivos}}', '{{troca_valor}}',
];

export const MODELOS_PADRAO = {
  compra_venda: `CONTRATO DE COMPRA E VENDA

VENDEDOR:
{{loja_razao_social}}, pessoa jurídica de direito privado, inscrita no CNPJ {{loja_cnpj}}, com sede em {{loja_endereco}}

COMPRADOR:
{{cliente_nome}} inscrito no CPF/CNPJ sob o nº {{cliente_cpf}}, com endereço em {{cliente_endereco}}, telefone {{cliente_telefone}}

As partes acima referidas e qualificadas resolvem entabular a presente compra e venda na forma e termos a seguir expostos:

CLÁUSULA PRIMEIRA – DO OBJETO
Marca: {{veiculo_marca}}
Modelo: {{veiculo_modelo}}
Cor: {{veiculo_cor}}
Combustível: {{veiculo_combustivel}}
Vendedor: {{vendedor_nome}}
Data da venda: {{data_venda}}
Ano Fab/Mod: {{veiculo_ano_fab_mod}}
Km: {{veiculo_km}}
Placa: {{veiculo_placa}}
Renavam: {{veiculo_renavam}}
Chassi: {{veiculo_chassi}}

CLÁUSULA SEGUNDA - DO PREÇO E FORMA DE PAGAMENTO
{{valor_venda}} valor da venda
O pagamento se dará da seguinte forma:
{{forma_pagamento}}

OBSERVAÇÕES: {{observacoes}}

CLÁUSULA TERCEIRA - DA VISTORIA E AVALIAÇÃO DO VEÍCULO
O COMPRADOR declara ter vistoriado e avaliado o estado em que se encontra o veículo ora negociado, estando o mesmo em perfeitas condições de funcionamento e estado de conservação.

CLÁUSULA QUARTA - DA RESPONSABILIDADE CIVIL E CRIMINAL
A partir desta data {{data_venda}} e hora {{hora_venda}}, o COMPRADOR se responsabiliza por quaisquer danos, seja no âmbito civil ou criminal, decorrente da utilização do veículo ora adquirido, inclusive multas e pontuações na CNH decorrentes de tais infrações, sejam elas de âmbito Municipal, Estadual e ou Federal, bem como, fica responsável também, nos mesmos termos acima, até a presente data e hora, por eventual veículo dado na compra do objeto do presente, respondendo ainda o comprador, pela evicção e eventuais vícios redibitórios do mesmo. O VENDEDOR, acaso tenha recebido algum veículo do COMPRADOR, como forma de pagamento do bem objeto do presente, fica responsável, por quaisquer danos, seja no âmbito civil ou penal, decorrente da utilização do veículo ora recebido, inclusive multas e pontuações na CNH decorrentes de tais infrações, sejam elas de âmbito Municipal, Estadual e ou Federal; Deste modo, o presente instrumento é firmado nos termos do artigo 784, III do CPC, razão pela qual é um título executivo extrajudicial, mesmo porque, o "quantum debeatur" depende de simples cálculo aritmético, à partir de dados consignados em documentos comprobatórios do débito (multas de trânsito, IPVA, licenciamento e outros). Nesta Seara, a VENDEDORA poderá executar o presente para cobrança de eventuais valores encontrados e de responsabilidade do COMPRADOR.

CLÁUSULA QUINTA – DA GARANTIA
Para os veículos usados a VENDEDORA fornece a garantia pelo tempo exigido por lei, e somente para os componente internos de motor e caixa de câmbio, contudo, a mesma estará automaticamente cancelada, no caso de mau uso do veículo em questão, em caso deste último ter suas características originais (as quais são especificadas pelo fabricante do manual do veículo), alteradas, bem como, quando o mesmo for utilizado fora dos padrões e ou limites de carga e/ou de rotação especificados pelo fabricantes ou ainda, se for utilizado em competições de qualquer espécie ou natureza, além do que, se tiver sua manutenção negligenciada. Todo e qualquer serviço e ou conserto coberto por esta garantia deverá ser executado por assistência técnica ou oficina mecânica indicada por esta VENDEDORA e somente após orçamento aprovado pela VENDEDORA; Qualquer manutenção feita pelo COMPRADOR em oficina própria do mesmo, não será ressarcido pelo VENDEDOR; Para os veículos novos, isto é, 0 KM, a garantia é a de fábrica; Ficam de fora da presente garantia, os componentes eletroeletrônicos e do sistema de arrefecimento do veículo, como por exemplo: sensores, módulos em geral, centrais, mangueiras, bomba d'água, fiações, etc. Do mesmo modo, também não são cobertos eventuais vazamentos de óleo advindos de falhas ou danos em juntas, vedações e retentores, bem como quebras de correntes da falta de lubrificantes ou por uso indevido do veículo, bem como eventuais danos gerados pelo superaquecimento do motor, seja por falha da bomba d'água, falta de refrigeração ou ainda em decorrência da alteração do tipo de combustível utilizado pelo veículo, além do que, utilização de combustível adulterado. Estão fora da presente garantia, itens de desgaste natural e vida úteis pré-determinados, tais como: discos e platô de embreagem, discos, tambores, pastilhas e lonas de freio, cabos de vela, correias em geral, bateria, amortecedores e molas, entre outros, incluindo-se ainda os itens considerados de manutenção normal, como limpeza de bicos injetores, fluídos e óleos em geral. A garantia das peças eventualmente substituídas na vigência deste, finda-se com o término do mesmo. Todo e qualquer custo não relacionado diretamente com a garantia do veículo, tais como despesas com táxi, guincho, alimentação, hospedagem, etc, não é de responsabilidade da VENDEDORA;

CLÁUSULA SEXTA - DA TRANSFERÊNCIA DO BEM
A transferência do bem objeto do presente instrumento para o nome do comprador ou de alguém por ele determinado, só se dará após a total quitação do bem descrito na cláusula primeira deste, sendo que na hipótese de pagamento em cheque(s) ou qualquer outro título de crédito, após a compensação ou quitação do(s) mesmo(s);

CLÁUSULA SÉTIMA - DA CLÁUSULA RESOLUTIVA
As partes VENDEDOR(A) e COMPRADOR(A), estabelecem desde já, que no caso de não cumprimento do presente, quanto aos pagamentos devidos pelo COMPRADOR ao VENDEDOR, na forma e prazos estabelecidos no bojo deste instrumento particular de contrato, os quais foram avençados de comum acordo entre partes, permitirá ao VENDEDOR, como melhor lhe aprouver, pedir a resolução do contrato ou, se preferir, exigir o cumprimento do mesmo, independentemente de notificação ou interpelação, nos termos do que reza o artigo 475 do Código Civil. Fica desde já avençado entre estas partes, que na hipótese de resolução do contrato, em se tratando de veículo usado, o COMPRADOR deverá pagar ao VENDEDOR, até a devolução do bem objeto deste instrumento, o valor diário pelo uso do veículo, na base de 0,5% (meio por cento) sobre o valor do mesmo, em se tratando de veículo novo (0 Km), o COMPRADOR deverá pagar ao VENDEDOR, até a devolução do bem objeto deste instrumento, o valor diário pelo uso do veículo, na base de 0,5% (meio por cento) sobre o valor do bem, mais o valor decorrente da depreciação sofrida pelo veículo em razão de não ser mais o mesmo um bem 0Km, servindo-se para tal verificação (depreciação), a tabela FIPE atualizada;

CLÁUSULA OITAVA
Nos termos do que estabelece o artigo 629 do Código Civil, o COMPRADOR assume, de forma gratuita, a condição de depositário do bem objeto do presente, obrigando-se pela guarda e conservação do mesmo, até o integral pagamento do preço;

CLÁUSULA NONA - SITUAÇÃO DE REGULARIDADE
- valor aproximado dos tributos: {{tributos}}
- furto: {{furto}}
- multas e taxas anuais em aberto: {{multas_abertas}}
- alienação fiduciária: {{alienacao}}
- outros registros impeditivos a circulação do veículo: {{registros_impeditivos}}

CLÁUSULA DÉCIMA - LEI GERAL DE PROTEÇÃO DE DADOS
A empresa VENDEDORA em questão, está em conformidade com a Lei 13.709/2018 – LGPD, protegendo os direitos fundamentais de liberdade e de privacidade e o livre desenvolvimento da personalidade da pessoa natural no que diz respeito às operações realizadas com os dados pessoais armazenados de forma física ou digital ora fornecidos para o fim de elaborar este documento e realizar os trâmites necessários para a perfeita prestação de serviços contratada em questão. Em respeito ao artigo 7º, inciso I e artigo 8º, § 1º da aludida Lei, tais dados serão utilizados somente, e tão somente, com a finalidade de manutenção necessária para este contrato, estando o titular autorizando e dando sua ciência de fornecimento para este fim específico;

CLÁUSULA DÉCIMA PRIMEIRA - FORO DE ELEIÇÃO
Para dirimir quaisquer dúvidas decorrentes do presente, as partes estabelecem desde já, com exclusividade, o foro da Comarca da VENDEDORA, por mais privilegiado que outro possa ser. O COMPRADOR, de livre e espontânea vontade, RENÚNCIA ao foro previsto no artigo 101, I do Código de Defesa do Consumidor;

CLÁUSULA DÉCIMA SEGUNDA – DO VEÍCULO DADO EM TROCA
O COMPRADOR declara que o veículo entregue como parte do pagamento foi de sua legítima propriedade e encontra-se livre e desembaraçado de quaisquer débitos, multas, alienações fiduciárias, bloqueios judiciais ou administrativos, restrições financeiras, ou quaisquer ônus que impeçam sua livre circulação e comercialização. O COMPRADOR responsabiliza-se integralmente por quaisquer débitos ou pendências anteriores à data da presente negociação, comprometendo-se a quitá-los imediatamente caso venham a ser identificados posteriormente. Caso seja constatado posteriormente que o veículo entregue em troca possua restrições administrativas, financeiras, histórico de leilão não informado, sinistro estrutural, adulteração de chassi, motor ou qualquer vício oculto que comprometa sua comercialização, o COMPRADOR obriga-se a ressarcir integralmente a VENDEDORA pelo valor atribuído ao veículo na presente negociação, no montante de {{troca_valor}}.

CLÁUSULA DÉCIMA TERCEIRA – DA IRREVOGABILIDADE DO NEGÓCIO
O presente contrato é celebrado em caráter irrevogável e irretratável, obrigando as partes por si, seus herdeiros e sucessores, ao fiel cumprimento de todas as cláusulas aqui estabelecidas.

CLÁUSULA DÉCIMA QUARTA – DA MULTA CONTRATUAL
No caso de descumprimento de qualquer das obrigações previstas neste contrato por parte do COMPRADOR, ficará o mesmo obrigado ao pagamento de multa equivalente a 10% (dez por cento) do valor total do negócio, sem prejuízo de eventuais perdas e danos.

CLÁUSULA DÉCIMA QUINTA – DO ESTADO DO VEÍCULO
O COMPRADOR declara que realizou vistoria prévia e detalhada no veículo objeto da presente compra, estando ciente de seu estado geral de conservação, quilometragem, funcionamento mecânico e características, não podendo posteriormente alegar desconhecimento ou vícios aparentes.

E, para que produza seus legais efeitos, firmo o presente termo, na presença de 2 (duas) testemunhas.

{{loja_cidade_uf}}, {{data_venda}}.

____________________________
{{cliente_nome}}
{{cliente_cpf}}

____________________________
{{loja_razao_social}}
{{loja_cnpj}}`,

  recibo_sinal: `RECIBO DE SINAL (ARRAS)

Recebemos de {{cliente_nome}}, CPF {{cliente_cpf}}, nascido(a) em {{cliente_nascimento}}, telefone {{cliente_telefone}}, residente em {{cliente_endereco}}, a quantia de {{valor_sinal}} a título de SINAL para reserva do veículo {{veiculo_modelo}}, placa {{veiculo_placa}}.

Observações: {{observacoes}}

O sinal é regido pelos arts. 417 a 420 do Código Civil: se o(a) comprador(a) desistir, perde o sinal; se a loja desistir, devolve-o em dobro. O valor do sinal será abatido do preço final no ato da compra.

{{data}}

____________________________________
{{loja_razao_social}}`,

  consignacao: `CONTRATO DE CONSIGNAÇÃO DE VEÍCULO

CONSIGNATÁRIA: {{loja_razao_social}}, CNPJ {{loja_cnpj}}.
CONSIGNANTE (empresa): {{consignante_nome}}, CNPJ {{consignante_cnpj}}, telefone {{consignante_tel}}, com endereço em {{consignante_endereco}}.

A CONSIGNANTE entrega à loja, em consignação para venda, o veículo {{veiculo_modelo}}, placa {{veiculo_placa}}, RENAVAM {{veiculo_renavam}}, autorizando o anúncio e a negociação.

1. Valor de venda pretendido: {{valor_pretendido}}.
2. Repasse à consignante: {{valor_repasse}} · comissão da loja: {{comissao}}.
3. A loja fica responsável pela intermediação; IPVA, multas e manutenção seguem o pactuado.

{{data}}

____________________________________
{{loja_razao_social}} (Consignatária)

____________________________________
{{consignante_nome}} (Consignante)`,

  test_drive: `TERMO DE RESPONSABILIDADE — TEST DRIVE

CONDUTOR(A): {{cliente_nome}}, CPF {{cliente_cpf}}, nascido(a) em {{cliente_nascimento}}, telefone {{cliente_telefone}}, residente em {{cliente_endereco}}.
VEÍCULO: {{veiculo_modelo}}, placa {{veiculo_placa}}.

O(A) condutor(a) declara possuir CNH válida e assume total responsabilidade por danos, multas e ocorrências durante o test drive do veículo acima, isentando a loja {{loja_razao_social}} de responsabilidade por infrações cometidas no período.

{{data}}

____________________________________
{{cliente_nome}} (Condutor(a))`,

  procuracao: `INSTRUMENTO DE PROCURAÇÃO
PROCURAÇÃO bastante que faz: {{outorgante_nome}}

SAIBAM, os que este instrumento de procuração bastante virem que, no dia {{data_procuracao}}, nesta cidade de {{cidade_procuracao}}, compareceu como OUTORGANTE: {{outorgante_nome}}, maior, {{outorgante_nacionalidade}}, {{outorgante_estado_civil}}, profissão não informada, residente e domiciliado(a) à {{outorgante_endereco}}, portador(a) do CPF nº {{outorgante_cpf}} e RG. O outorgante nomeia e constitui seu bastante procurador {{outorgado_nome}}, maior, {{outorgado_nacionalidade}}, {{outorgado_estado_civil}}, profissão não informada, residente e domiciliado(a) à {{outorgado_endereco}}, portador(a) do CPF nº {{outorgado_cpf}}, a quem confere específicos poderes para tratar de todos e quaisquer assuntos relacionados com o veículo: {{veiculo_marca}}/{{veiculo_modelo}}, ANO FABRICAÇÃO/ MODELO: {{veiculo_ano_fab_mod}} COR: {{veiculo_cor}}, COMBUSTÍVEL: {{veiculo_combustivel}}, PLACA: {{veiculo_placa}}, RENAVAM: {{veiculo_renavam}}, CHASSI: {{veiculo_chassi}}, podendo, para tanto, representá-lo perante Órgãos Públicos, Federais Estaduais, Municipais, Autarquias, Empresas Privadas, Cartórios em geral, Seguradoras em geral, DNER/DNIT, DER, especialmente junto ao DETRAN, CONTRAN, DPE, Delegacias em geral, DETRAN, Delegacia de Roubos e Furtos de Veículos- DRFV, Polícia Rodoviária Federal, DVA-Depósito de Veículos Apreendidos, Inspetorias de Trânsito, Secretaria da Fazenda, Instância, Foro ou Tribunal, em Juízo ou fora dele, e onde com esta se apresentar e necessário for, assinando e requerendo o que for preciso, preencher e assinar guias, formulários, requerimentos, regularizar o veículo, se for necessário, registrar a propriedade ou transferir o referido veículo para nome do outorgante, e ainda, VENDER, CEDER, TRANSFERIR OU DE QUALQUER FORMA ALIENAR A QUEM QUISER, INCLUSIVE PARA O SEU PRÓPRIO NOME, receber o produto da venda, passar recibos, dar quitação, transmitir domínio, direito, ação e posse, fazer vistorias, requerer emplacamentos, licenciamentos, liberações, Certidões, nada consta, requerer baixa de roubos e furtos, retirar o veículo do depósito de Veículos Apreendidos, requerer e recebê-la ou 2a Via do CRV (DUT)/ATPV-e, CRLV (IPVA)/CRLV-e, carnê de IPVA, comunicar acidentes, promover registros de ocorrências periciais, tomar ciência de laudos periciais, receber seguros em caso de sinistro, dirigir o veículo em todo o território nacional e autorizar a terceiros a dirigi-lo, requerer parcelamento de multas e/ou IPVA, efetuar pagamentos, recorrer de multas em geral, emitir multas sub Júdice ressarcir quantias pagas indevidamente, efetuar e/ou dar baixa em restrições administrativas, requerer bloqueios e desbloqueios de veículo e/ou documentos, solicitar mudança de endereço, mudança de UF, categoria, juntar e retirar documentos, prestar declarações, apresentar provas, cumprir exigências, requerer e/ou quitar saldo devedor, mesmo por antecipação, promover e efetuar a baixa de alienação fiduciária e/ou gravame, requerer e receber carta de quitação, requerer, efetuar, retirar, baixar e assinar autorização para comunicado de venda, retirar comunicado de venda e assinar os competentes termos de transferência - CRV (DUT)/ATPV-e, constituir advogados com os poderes da cláusula AD-JUDITIA, enfim, praticar todos os demais atos necessários aos fins deste mandato. Que pelo outorgante me foi dito que os outorgados ao aceitar o presente instrumento, assumem total responsabilidade civil, criminal e administrativa, por todos os atos que por ele ou por terceiros por ele autorizado praticar na condução do referido veículo a partir desta data, inclusive multas. O presente mandato é outorgado em caráter irrevogável, irretratável, com 180 DIAS DE VALIDADE a contar da data da assinatura deste, e isento de prestação de contas. A parte outorgante declara ter fornecido todos os elementos necessários para a elaboração do presente instrumento particular de procuração, conferindo-lhes veracidade, tendo lido todo o conteúdo e assumindo inteira responsabilidade, civil e criminal, por eventuais erros ou inexatidões. Dessa forma, declara-se de acordo e assina abaixo.

{{cidade_procuracao}}, {{data_procuracao}}.

_______________________________________________
{{outorgante_nome}}
CPF nº {{outorgante_cpf}}
OUTORGANTE`,
};
