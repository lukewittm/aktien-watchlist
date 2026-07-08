// Kuratierte Ergänzungen für build-universe.mjs:
//  - Regionen, die pytickersymbols nicht abdeckt (Japan-Auswahl, MSCI-EM-Kernländer)
//  - europäische Länder außerhalb der genutzten pytickersymbols-Indizes
//    (Italien, Dänemark, Norwegen, Österreich, Schweiz-Fix für Roche)
//  - MUST_HAVE: Titel aus dem Screener-Screenshot, die garantiert drin sein sollen
// Alle Ticker sind gegen Yahoo geprüft. Doppelte (auch mit pytickersymbols) fallen
// im Builder per Ticker-Dedup wieder raus.

// Notierungswährung aus dem Yahoo-Suffix ableiten (für die Primärlisting-Auswahl)
const CCY_BY_SUFFIX = {
  '.DE': 'EUR', '.PA': 'EUR', '.AS': 'EUR', '.MI': 'EUR', '.MC': 'EUR', '.BR': 'EUR',
  '.HE': 'EUR', '.VI': 'EUR', '.LS': 'EUR', '.IR': 'EUR',
  '.L': 'GBP', '.SW': 'CHF', '.ST': 'SEK', '.CO': 'DKK', '.OL': 'NOK',
  '.T': 'JPY', '.KS': 'KRW', '.TW': 'TWD', '.HK': 'HKD', '.NS': 'INR', '.SA': 'BRL',
}
function ccy(ticker) {
  const m = ticker.match(/\.[A-Z]+$/)
  if (m && CCY_BY_SUFFIX[m[0]]) return CCY_BY_SUFFIX[m[0]]
  return 'USD' // US-Ticker ohne Suffix
}
// de = geprüfter deutscher Handelsplatz-Ticker (Xetra/Frankfurt/regional), optional
const mk = (ticker, name, region, sector, de) => ({ ticker, name, region, sector, ccy: ccy(ticker), ...(de ? { de } : {}) })

// GICS-Sektor (S&P-500-CSV) -> deutsches Label
export const SECTOR_MAP = {
  'Information Technology': 'Technologie',
  Financials: 'Finanzen',
  'Health Care': 'Gesundheit',
  'Consumer Discretionary': 'Konsum',
  'Consumer Staples': 'Konsum',
  'Communication Services': 'Kommunikation',
  Industrials: 'Industrie',
  Energy: 'Energie',
  Materials: 'Rohstoffe',
  Utilities: 'Versorger',
  'Real Estate': 'Immobilien',
}

// pytickersymbols-Branchen (Keyword, erster Treffer gewinnt) -> deutsches Label
export const INDUSTRY_TO_SECTOR = {
  semiconductor: 'Technologie',
  software: 'Technologie',
  'it services': 'Technologie',
  computer: 'Technologie',
  electronic: 'Technologie',
  technology: 'Technologie',
  bank: 'Finanzen',
  insurance: 'Finanzen',
  financ: 'Finanzen',
  investment: 'Finanzen',
  pharmaceutical: 'Gesundheit',
  biotech: 'Gesundheit',
  healthcare: 'Gesundheit',
  'health care': 'Gesundheit',
  medical: 'Gesundheit',
  telecom: 'Kommunikation',
  media: 'Medien',
  oil: 'Energie',
  'gas ': 'Energie',
  energy: 'Energie',
  chemical: 'Chemie',
  utilit: 'Versorger',
  'real estate': 'Immobilien',
  metal: 'Rohstoffe',
  mining: 'Rohstoffe',
  material: 'Rohstoffe',
  automobile: 'Auto',
  'auto ': 'Auto',
  aerospace: 'Industrie',
  machinery: 'Industrie',
  industrial: 'Industrie',
  construction: 'Industrie',
  transport: 'Logistik',
  food: 'Konsum',
  beverage: 'Konsum',
  retail: 'Konsum',
  apparel: 'Konsum',
  footwear: 'Konsum',
  household: 'Konsum',
  consumer: 'Konsum',
}

// Europa-Ergänzungen (Länder/Titel außerhalb der genutzten pytickersymbols-Indizes)
const EU = [
  // Schweiz (inkl. Roche-Fix RO.SW; ROG.SW liefert bei Yahoo keine Daten)
  mk('NESN.SW', 'Nestlé', 'EU', 'Konsum'),
  mk('RO.SW', 'Roche (Inhaber)', 'EU', 'Gesundheit'),
  mk('NOVN.SW', 'Novartis', 'EU', 'Gesundheit'),
  mk('UBSG.SW', 'UBS', 'EU', 'Finanzen'),
  mk('ZURN.SW', 'Zurich Insurance', 'EU', 'Finanzen'),
  mk('ABBN.SW', 'ABB', 'EU', 'Industrie'),
  mk('CFR.SW', 'Richemont', 'EU', 'Konsum'),
  mk('SIKA.SW', 'Sika', 'EU', 'Chemie'),
  mk('SREN.SW', 'Swiss Re', 'EU', 'Finanzen'),
  mk('LONN.SW', 'Lonza', 'EU', 'Gesundheit'),
  mk('GIVN.SW', 'Givaudan', 'EU', 'Chemie'),
  // Italien
  mk('ENEL.MI', 'Enel', 'EU', 'Versorger'),
  mk('ENI.MI', 'Eni', 'EU', 'Energie'),
  mk('ISP.MI', 'Intesa Sanpaolo', 'EU', 'Finanzen'),
  mk('UCG.MI', 'UniCredit', 'EU', 'Finanzen'),
  mk('RACE.MI', 'Ferrari', 'EU', 'Auto'),
  mk('G.MI', 'Generali', 'EU', 'Finanzen'),
  mk('STLAM.MI', 'Stellantis', 'EU', 'Auto'),
  mk('PRY.MI', 'Prysmian', 'EU', 'Industrie'),
  mk('MONC.MI', 'Moncler', 'EU', 'Konsum'),
  // Dänemark
  mk('NOVO-B.CO', 'Novo Nordisk', 'EU', 'Gesundheit'),
  mk('DSV.CO', 'DSV', 'EU', 'Logistik'),
  mk('MAERSK-B.CO', 'Maersk', 'EU', 'Logistik'),
  mk('ORSTED.CO', 'Ørsted', 'EU', 'Versorger'),
  mk('CARL-B.CO', 'Carlsberg', 'EU', 'Konsum'),
  mk('GMAB.CO', 'Genmab', 'EU', 'Gesundheit'),
  // Norwegen
  mk('EQNR.OL', 'Equinor', 'EU', 'Energie'),
  mk('DNB.OL', 'DNB Bank', 'EU', 'Finanzen'),
  mk('NHY.OL', 'Norsk Hydro', 'EU', 'Rohstoffe'),
  mk('TEL.OL', 'Telenor', 'EU', 'Kommunikation'),
  // Österreich
  mk('EBS.VI', 'Erste Group', 'EU', 'Finanzen'),
  mk('OMV.VI', 'OMV', 'EU', 'Energie'),
  mk('VER.VI', 'Verbund', 'EU', 'Versorger'),
  // Schweden – Werte, die durch die pytickersymbols-Listen fielen
  mk('VOLV-B.ST', 'Volvo', 'EU', 'Industrie'),
  mk('HM-B.ST', 'H&M Hennes & Mauritz', 'EU', 'Konsum'),
  mk('SEB-A.ST', 'SEB', 'EU', 'Finanzen'),
  mk('SHB-A.ST', 'Handelsbanken', 'EU', 'Finanzen'),
  mk('ERIC-B.ST', 'Ericsson', 'EU', 'Technologie'),
  mk('EVO.ST', 'Evolution', 'EU', 'Medien'),
]

// Japan – bewusst nur eine Auswahl der größten Werte (Industrieland, nicht EM/US/EU)
const JP = [
  mk('7203.T', 'Toyota', 'JP', 'Auto'),
  mk('6758.T', 'Sony', 'JP', 'Technologie'),
  mk('8306.T', 'Mitsubishi UFJ', 'JP', 'Finanzen'),
  mk('6861.T', 'Keyence', 'JP', 'Technologie'),
  mk('9983.T', 'Fast Retailing', 'JP', 'Konsum'),
  mk('8035.T', 'Tokyo Electron', 'JP', 'Technologie'),
  mk('6501.T', 'Hitachi', 'JP', 'Industrie'),
  mk('9984.T', 'SoftBank Group', 'JP', 'Technologie'),
  mk('7974.T', 'Nintendo', 'JP', 'Medien'),
  mk('4063.T', 'Shin-Etsu Chemical', 'JP', 'Chemie'),
  mk('6098.T', 'Recruit Holdings', 'JP', 'Technologie'),
  mk('8058.T', 'Mitsubishi Corp', 'JP', 'Handel'),
  mk('7011.T', 'Mitsubishi Heavy', 'JP', 'Industrie'),
  mk('6367.T', 'Daikin', 'JP', 'Industrie'),
  mk('6981.T', 'Murata', 'JP', 'Technologie'),
  mk('9433.T', 'KDDI', 'JP', 'Kommunikation'),
  mk('4519.T', 'Chugai Pharma', 'JP', 'Gesundheit'),
]

// MSCI-EM-Kernländer, aber NUR in Deutschland handelbare Werte (geprüfter dt. Ticker).
// Exotische (Korea/Taiwan/Indien-Lokaltitel ohne liquide dt. Notiz) bewusst weggelassen:
// Hyundai, LG Chem, NAVER, Hon Hai, MediaTek, Bharti Airtel, TCS, China Mobile, WEG, Delta(TW).
const EM = [
  // Südkorea (nur Werte mit deutscher Notiz; Hyundai/Kia/LG/NAVER/Kakao ohne dt. Handel)
  mk('005930.KS', 'Samsung Electronics', 'EM', 'Technologie', 'SSUN.F'),
  mk('000660.KS', 'SK Hynix', 'EM', 'Technologie', 'HY9H.F'),
  mk('006400.KS', 'Samsung SDI', 'EM', 'Technologie', 'XSDG.MU'),
  mk('005490.KS', 'POSCO Holdings', 'EM', 'Rohstoffe', 'PKX.F'),
  mk('105560.KS', 'KB Financial', 'EM', 'Finanzen', 'KBIA.F'),
  mk('055550.KS', 'Shinhan Financial', 'EM', 'Finanzen', 'KSF1.F'),
  // Taiwan
  mk('2330.TW', 'TSMC', 'EM', 'Technologie', 'TSFA.F'),
  mk('2412.TW', 'Chunghwa Telecom', 'EM', 'Kommunikation', 'CHWD.F'),
  // China / Hongkong
  mk('0700.HK', 'Tencent', 'EM', 'Technologie', 'NNN1.F'),
  mk('9988.HK', 'Alibaba', 'EM', 'Konsum', 'AHL1.F'),
  mk('3690.HK', 'Meituan', 'EM', 'Konsum', '9MD2.F'),
  mk('1810.HK', 'Xiaomi', 'EM', 'Technologie', '3CP2.F'),
  mk('9618.HK', 'JD.com', 'EM', 'Konsum', '013A.F'),
  mk('1211.HK', 'BYD', 'EM', 'Auto', '4BY1.F'),
  mk('2318.HK', 'Ping An', 'EM', 'Finanzen', 'PZX.F'),
  // Indien
  mk('RELIANCE.NS', 'Reliance Industries', 'EM', 'Energie', 'RLI.F'),
  mk('HDFCBANK.NS', 'HDFC Bank', 'EM', 'Finanzen', 'HDFA.F'),
  mk('INFY.NS', 'Infosys', 'EM', 'Technologie', 'IOY.F'),
  mk('ICICIBANK.NS', 'ICICI Bank', 'EM', 'Finanzen', 'ICBA.F'),
  mk('LT.NS', 'Larsen & Toubro', 'EM', 'Industrie', 'LTO.F'),
  // Brasilien
  mk('VALE3.SA', 'Vale', 'EM', 'Rohstoffe', 'CVLC.SG'),
  mk('PETR4.SA', 'Petrobras', 'EM', 'Energie', 'PJXB.F'),
  mk('ITUB4.SA', 'Itaú Unibanco', 'EM', 'Finanzen', 'BVXB.SG'),
  mk('BBAS3.SA', 'Banco do Brasil', 'EM', 'Finanzen', 'BZLA.MU'),
]

export const CURATED = [...EU, ...JP, ...EM]

// Titel aus dem Screener-Screenshot – müssen garantiert enthalten sein
export const MUST_HAVE = [
  mk('285A.T', 'Kioxia Holdings', 'JP', 'Technologie'),
  mk('ATS.VI', 'AT&S', 'EU', 'Technologie'),
  mk('SNDK', 'SanDisk', 'US', 'Technologie'),
  mk('STX', 'Seagate Technology', 'US', 'Technologie'),
  mk('000660.KS', 'SK Hynix', 'EM', 'Technologie'),
  mk('WDC', 'Western Digital', 'US', 'Technologie'),
  mk('MU', 'Micron Technology', 'US', 'Technologie'),
  mk('AIXA.DE', 'AIXTRON', 'EU', 'Technologie'),
  mk('3711.TW', 'ASE Technology', 'EM', 'Technologie'),
  mk('LRCX', 'Lam Research', 'US', 'Technologie'),
  mk('6376.T', 'Nikkiso', 'JP', 'Industrie'),
  mk('NOKIA.HE', 'Nokia', 'EU', 'Technologie'),
  mk('COHR', 'Coherent', 'US', 'Technologie'),
  mk('AG1.DE', 'AUTO1 Group', 'EU', 'Konsum'),
  mk('S92.DE', 'SMA Solar Technology', 'EU', 'Industrie'),
  mk('TER', 'Teradyne', 'US', 'Technologie'),
  mk('CAT', 'Caterpillar', 'US', 'Industrie'),
  mk('ASML.AS', 'ASML', 'EU', 'Technologie'),
]
