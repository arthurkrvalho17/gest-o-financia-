// Converte valores do sistema interno para os códigos aceitos pela API OLX.
// Ref: https://developers.olx.com.br/anuncio/api/autos/sub_auto.html
//
// Formato da doc: `params` é um OBJETO { chave: valor } (não array) e os
// valores são os CÓDIGOS em string do domínio de cada campo (ex.: carcolor
// "1" = Preto). Exceção: mileage é inteiro.

// fuel — não existe código 4 (descontinuado; a OLX devolve ERROR_FUEL_4_DEPRECATED)
const COMBUSTIVEL_OLX = {
  gasolina: '1',
  alcool: '2',
  álcool: '2',
  etanol: '2',
  flex: '3',
  diesel: '5',
  hibrido: '6',
  híbrido: '6',
  eletrico: '7',
  elétrico: '7',
};

const COR_OLX = {
  preto: '1',
  branco: '2',
  prata: '3',
  vermelho: '4',
  cinza: '5',
  azul: '6',
  amarelo: '7',
  verde: '8',
  laranja: '9',
};
const COR_OUTRA = '10';

export function mapearParams(anuncio) {
  const params = {};

  // regdate (ano de fabricação, string) e mileage (inteiro) são obrigatórios
  // para a categoria 2020 segundo a doc de params de autos.
  const regdate = anuncio.ano ? anuncio.ano.split('/')[0].trim() : '';
  if (regdate) params.regdate = regdate;

  params.mileage = Math.max(0, Math.round(anuncio.km || 0));

  // vehicle_tag (placa, maiúscula) — obrigatório; validado no conector
  if (anuncio.placa) params.vehicle_tag = anuncio.placa.replace(/\s|-/g, '').toUpperCase();

  const fuel = COMBUSTIVEL_OLX[anuncio.combustivel?.toLowerCase().trim()];
  if (fuel) params.fuel = fuel;

  const corKey = anuncio.cor?.toLowerCase().trim();
  if (corKey) params.carcolor = COR_OLX[corKey] || COR_OUTRA;

  return params;
}
