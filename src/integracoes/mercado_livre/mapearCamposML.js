// Converte o anúncio canônico para o body de item do Mercado Livre.
// Ref: https://developers.mercadolivre.com.br/pt_br/publicacao-de-veiculos
//
// Veículos no ML são "classificados" (buying_mode: classified) na categoria
// MLB1744 (Carros e Caminhonetes). BRAND/MODEL aceitam value_name em texto —
// o ML resolve contra o catálogo; se não resolver, a API devolve erro de
// validação que o conector repassa à UI.

const CATEGORIA_CARROS_ML = 'MLB1744';
const MAX_FOTOS = 12;
const MAX_TITULO = 60;

// O cadastro guarda só "modelo" (ex: "Corolla GLI Flex") sem marca separada.
// Lookup dos modelos mais comuns do mercado BR; fallback = 1ª palavra do título
// (cobre cadastros no formato "Fiat Argo").
const MARCA_POR_MODELO = {
  corolla: 'Toyota', hilux: 'Toyota', etios: 'Toyota', yaris: 'Toyota', sw4: 'Toyota',
  civic: 'Honda', fit: 'Honda', hrv: 'Honda', 'hr-v': 'Honda', city: 'Honda', wrv: 'Honda',
  hb20: 'Hyundai', hb20s: 'Hyundai', creta: 'Hyundai', tucson: 'Hyundai', ix35: 'Hyundai',
  onix: 'Chevrolet', prisma: 'Chevrolet', cruze: 'Chevrolet', s10: 'Chevrolet', tracker: 'Chevrolet', spin: 'Chevrolet', montana: 'Chevrolet', celta: 'Chevrolet', corsa: 'Chevrolet',
  gol: 'Volkswagen', polo: 'Volkswagen', virtus: 'Volkswagen', tcross: 'Volkswagen', 't-cross': 'Volkswagen', nivus: 'Volkswagen', amarok: 'Volkswagen', saveiro: 'Volkswagen', voyage: 'Volkswagen', fox: 'Volkswagen', up: 'Volkswagen', jetta: 'Volkswagen', golf: 'Volkswagen',
  uno: 'Fiat', argo: 'Fiat', mobi: 'Fiat', cronos: 'Fiat', toro: 'Fiat', strada: 'Fiat', pulse: 'Fiat', fastback: 'Fiat', palio: 'Fiat', siena: 'Fiat', punto: 'Fiat',
  ka: 'Ford', ecosport: 'Ford', ranger: 'Ford', fiesta: 'Ford', focus: 'Ford', fusion: 'Ford',
  kwid: 'Renault', sandero: 'Renault', logan: 'Renault', duster: 'Renault', captur: 'Renault', oroch: 'Renault', kardian: 'Renault',
  compass: 'Jeep', renegade: 'Jeep', commander: 'Jeep',
  kicks: 'Nissan', versa: 'Nissan', frontier: 'Nissan', sentra: 'Nissan', march: 'Nissan',
  '208': 'Peugeot', '2008': 'Peugeot', '3008': 'Peugeot', 'c3': 'Citroën', 'c4': 'Citroën',
  fazer: 'Yamaha', cb: 'Honda', cg: 'Honda', biz: 'Honda', xre: 'Honda',
};

// Valores EXATOS aceitos pelo ML na categoria MLB1744, conferidos em 27/08/2026
// via GET /categories/MLB1744/attributes (atributo FUEL_TYPE, 15 opções).
//
// Atenção ao 'flex': o ML NÃO tem valor "Flex". O equivalente na taxonomia
// dele é "Gasolina e álcool". O mapa antigo mandava "Flex" — que seria
// recusado justamente no combustível mais comum do usado brasileiro.
const COMBUSTIVEL_ML = {
  gasolina: 'Gasolina',
  alcool: 'Álcool',
  álcool: 'Álcool',
  etanol: 'Etanol',
  flex: 'Gasolina e álcool',
  'gasolina e alcool': 'Gasolina e álcool',
  'gasolina e álcool': 'Gasolina e álcool',
  diesel: 'Diesel',
  hibrido: 'Híbrido',
  híbrido: 'Híbrido',
  'hibrido/flex': 'Híbrido/Flex',
  'híbrido/flex': 'Híbrido/Flex',
  'hibrido/gasolina': 'Híbrido/Gasolina',
  'híbrido/gasolina': 'Híbrido/Gasolina',
  'hibrido/diesel': 'Híbrido/Diesel',
  'híbrido/diesel': 'Híbrido/Diesel',
  eletrico: 'Elétrico',
  elétrico: 'Elétrico',
  gnv: 'Gasolina e gás natural',
};

// Único valor aceito pelo ML neste atributo na MLB1744 (id 398351). Não é
// escolha nossa nem muda o anúncio: é a própria categoria se identificando.
const VEHICLE_TYPE_ML = 'Carros e caminhonetes';

const capitalizar = (s) =>
  s ? s.trim().charAt(0).toUpperCase() + s.trim().slice(1).toLowerCase() : '';

// Separa marca e modelo a partir do título do anúncio.
export function inferirMarcaModelo(titulo) {
  const palavras = (titulo || '').trim().split(/\s+/);
  const primeira = (palavras[0] || '').toLowerCase();
  const marcaConhecida = MARCA_POR_MODELO[primeira];
  if (marcaConhecida) return { marca: marcaConhecida, modelo: titulo.trim() };
  // fallback: usuário cadastrou "Fiat Argo Drive" → marca = Fiat, modelo = resto
  if (palavras.length > 1) return { marca: capitalizar(palavras[0]), modelo: palavras.slice(1).join(' ') };
  return { marca: '', modelo: titulo?.trim() || '' };
}

export function anoModeloDe(anuncio) {
  // fab_mod "2021/2022" → ano-modelo (2ª parte); só fabricação se não houver
  const partes = String(anuncio.ano || '').split('/');
  return (partes[1] || partes[0] || '').trim();
}

export function montarAttributes(anuncio) {
  const attrs = [];
  const { marca, modelo } = inferirMarcaModelo(anuncio.titulo);

  if (marca) attrs.push({ id: 'BRAND', value_name: marca });
  if (modelo) attrs.push({ id: 'MODEL', value_name: modelo });

  // Obrigatório na MLB1744, valor único — ver VEHICLE_TYPE_ML.
  attrs.push({ id: 'VEHICLE_TYPE', value_name: VEHICLE_TYPE_ML });

  const anoModelo = anoModeloDe(anuncio);
  if (anoModelo) attrs.push({ id: 'VEHICLE_YEAR', value_name: anoModelo });

  if (anuncio.km >= 0) attrs.push({ id: 'KILOMETERS', value_name: `${anuncio.km || 0} km` });

  const fuel = COMBUSTIVEL_ML[String(anuncio.combustivel || '').toLowerCase().trim()];
  if (fuel) attrs.push({ id: 'FUEL_TYPE', value_name: fuel });

  // Obrigatórios que ainda não existem no cadastro do veículo. Nada é
  // inventado aqui: sem o dado, o atributo não vai — e a validação abaixo
  // bloqueia a publicação antes da chamada.
  if (anuncio.versao) attrs.push({ id: 'TRIM', value_name: String(anuncio.versao).trim() });
  if (anuncio.portas) attrs.push({ id: 'DOORS', value_name: String(anuncio.portas).trim() });

  if (anuncio.cor) attrs.push({ id: 'COLOR', value_name: capitalizar(anuncio.cor) });

  return attrs;
}

// Validação ANTES da chamada, no mesmo espírito do conectorOlx: o ML devolve
// erro genérico de validação de atributo, sem dizer QUAL nem onde corrigir.
// Aqui o lojista recebe a lista completa do que falta, de uma vez, apontando
// o campo do cadastro — em vez de descobrir um problema por tentativa.
//
// Obrigatórios da MLB1744 conferidos em 27/08/2026 via
// GET /categories/MLB1744/attributes: BRAND, MODEL, TRIM, VEHICLE_TYPE,
// VEHICLE_YEAR, FUEL_TYPE, DOORS, KILOMETERS.
export function validarAnuncioML(anuncio, loja = {}) {
  const faltas = [];

  if (!String(anuncio.titulo || '').trim()) {
    faltas.push('Modelo do veículo (vira o título do anúncio).');
  }
  if (Math.round(anuncio.preco || 0) <= 0) {
    faltas.push('Valor pedido — informe o preço do veículo.');
  }

  const fotos = (anuncio.fotos || []).map((f) => f.url || f).filter((u) => u && !String(u).startsWith('blob:'));
  if (!fotos.length) {
    faltas.push('Pelo menos 1 foto do veículo.');
  }

  const { marca } = inferirMarcaModelo(anuncio.titulo);
  if (!marca) {
    faltas.push('Marca — não foi possível deduzir do modelo cadastrado. Cadastre como "Marca Modelo" (ex.: "Fiat Argo Drive").');
  }

  if (!anoModeloDe(anuncio)) {
    faltas.push('Ano — preencha Fab/Mod no cadastro do veículo (ex.: 2021/2022).');
  }

  const combustivel = String(anuncio.combustivel || '').toLowerCase().trim();
  if (!combustivel) {
    faltas.push('Combustível — obrigatório no anúncio do Mercado Livre.');
  } else if (!COMBUSTIVEL_ML[combustivel]) {
    faltas.push(
      `Combustível "${anuncio.combustivel}" não corresponde a nenhuma opção do Mercado Livre. ` +
        'Use: gasolina, álcool, etanol, flex, diesel, híbrido, elétrico ou GNV.',
    );
  }

  if (anuncio.km == null || Number(anuncio.km) < 0) {
    faltas.push('Quilometragem — preencha a KM no cadastro do veículo.');
  }

  // Sem equivalente no cadastro hoje. Não há como derivar sem inventar, e
  // ambos mudam o anúncio (versão e nº de portas), então bloqueiam.
  if (!anuncio.versao) {
    faltas.push('Versão do veículo (ex.: "GLI", "XEI 2.0") — o Mercado Livre exige, e ainda não existe esse campo no cadastro.');
  }
  if (!anuncio.portas) {
    faltas.push('Número de portas — o Mercado Livre exige, e ainda não existe esse campo no cadastro.');
  }

  if (!/^\d{8}$/.test(String(loja.cep || '').replace(/\D/g, ''))) {
    faltas.push('CEP da loja — cadastre em Configurações, o Mercado Livre usa para posicionar o anúncio.');
  }

  if (faltas.length) {
    throw new Error(
      `Não é possível publicar no Mercado Livre. Falta:\n• ${faltas.join('\n• ')}`,
    );
  }
}

// Body completo para POST /items. loja = { cep, telefone, nome } (dados da tabela lojas).
export function montarItemML(anuncio, loja = {}) {
  validarAnuncioML(anuncio, loja);

  const fotos = (anuncio.fotos || [])
    .map((f) => f.url || f)
    .filter((u) => u && !String(u).startsWith('blob:'))
    .slice(0, MAX_FOTOS);

  const item = {
    title: (anuncio.titulo || '').slice(0, MAX_TITULO),
    category_id: CATEGORIA_CARROS_ML,
    price: Math.round(anuncio.preco || 0),
    currency_id: 'BRL',
    available_quantity: 1,
    buying_mode: 'classified',
    // TODO(27/08/2026) — listing_type_id NÃO CONFIRMADO.
    // Classificado de veículo não usa os tipos do varejo, e os endpoints que
    // dizem quais valem (/sites/MLB/listing_types e /sites/MLB/listing_prices)
    // devolvem 403 sem autenticação. Com a conta ML conectada, confirmar por:
    //   supabase.functions.invoke('ml-api', { body: { path: '/sites/MLB/listing_types' } })
    // (a allowlist da ml-api já permite /sites/MLB).
    // 'free' está aqui desde a primeira versão e nunca foi verificado.
    listing_type_id: 'free',
    condition: 'used',
    pictures: fotos.map((source) => ({ source })),
    attributes: montarAttributes(anuncio),
  };

  if (loja.cep) {
    item.location = { zip_code: String(loja.cep).replace(/\D/g, '') };
  }
  if (loja.nome || loja.telefone) {
    item.seller_contact = {
      contact: loja.nome || '',
      phone: String(loja.telefone || '').replace(/\D/g, ''),
    };
  }

  return item;
}
