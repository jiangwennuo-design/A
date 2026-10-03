import { availableTimeZones, isValidTimeZone } from "./chat-timezone";

export interface TimeZoneOption {
  timezone: string;
  label: string;
  search: string;
}

// Public-domain IANA tzdb zone.tab country associations. This is local metadata,
// not geolocation; the browser's Intl implementation performs all time calculations.
// https://github.com/eggert/tz/blob/main/zone.tab
const countryZones = `
AD Europe/Andorra
AE Asia/Dubai
AF Asia/Kabul
AG America/Antigua
AI America/Anguilla
AL Europe/Tirane
AM Asia/Yerevan
AO Africa/Luanda
AQ Antarctica/McMurdo
AQ Antarctica/Casey
AQ Antarctica/Davis
AQ Antarctica/DumontDUrville
AQ Antarctica/Mawson
AQ Antarctica/Palmer
AQ Antarctica/Rothera
AQ Antarctica/Syowa
AQ Antarctica/Troll
AQ Antarctica/Vostok
AR America/Argentina/Buenos_Aires
AR America/Argentina/Cordoba
AR America/Argentina/Salta
AR America/Argentina/Jujuy
AR America/Argentina/Tucuman
AR America/Argentina/Catamarca
AR America/Argentina/La_Rioja
AR America/Argentina/San_Juan
AR America/Argentina/Mendoza
AR America/Argentina/San_Luis
AR America/Argentina/Rio_Gallegos
AR America/Argentina/Ushuaia
AS Pacific/Pago_Pago
AT Europe/Vienna
AU Australia/Lord_Howe
AU Antarctica/Macquarie
AU Australia/Hobart
AU Australia/Melbourne
AU Australia/Sydney
AU Australia/Broken_Hill
AU Australia/Brisbane
AU Australia/Lindeman
AU Australia/Adelaide
AU Australia/Darwin
AU Australia/Perth
AU Australia/Eucla
AW America/Aruba
AX Europe/Mariehamn
AZ Asia/Baku
BA Europe/Sarajevo
BB America/Barbados
BD Asia/Dhaka
BE Europe/Brussels
BF Africa/Ouagadougou
BG Europe/Sofia
BH Asia/Bahrain
BI Africa/Bujumbura
BJ Africa/Porto-Novo
BL America/St_Barthelemy
BM Atlantic/Bermuda
BN Asia/Brunei
BO America/La_Paz
BQ America/Kralendijk
BR America/Noronha
BR America/Belem
BR America/Fortaleza
BR America/Recife
BR America/Araguaina
BR America/Maceio
BR America/Bahia
BR America/Sao_Paulo
BR America/Campo_Grande
BR America/Cuiaba
BR America/Santarem
BR America/Porto_Velho
BR America/Boa_Vista
BR America/Manaus
BR America/Eirunepe
BR America/Rio_Branco
BS America/Nassau
BT Asia/Thimphu
BW Africa/Gaborone
BY Europe/Minsk
BZ America/Belize
CA America/St_Johns
CA America/Halifax
CA America/Glace_Bay
CA America/Moncton
CA America/Goose_Bay
CA America/Blanc-Sablon
CA America/Toronto
CA America/Iqaluit
CA America/Atikokan
CA America/Winnipeg
CA America/Resolute
CA America/Rankin_Inlet
CA America/Regina
CA America/Swift_Current
CA America/Edmonton
CA America/Cambridge_Bay
CA America/Inuvik
CA America/Vancouver
CA America/Creston
CA America/Dawson_Creek
CA America/Fort_Nelson
CA America/Whitehorse
CA America/Dawson
CC Indian/Cocos
CD Africa/Kinshasa
CD Africa/Lubumbashi
CF Africa/Bangui
CG Africa/Brazzaville
CH Europe/Zurich
CI Africa/Abidjan
CK Pacific/Rarotonga
CL America/Santiago
CL America/Coyhaique
CL America/Punta_Arenas
CL Pacific/Easter
CM Africa/Douala
CN Asia/Shanghai
CN Asia/Urumqi
CO America/Bogota
CR America/Costa_Rica
CU America/Havana
CV Atlantic/Cape_Verde
CW America/Curacao
CX Indian/Christmas
CY Asia/Nicosia
CY Asia/Famagusta
CZ Europe/Prague
DE Europe/Berlin
DE Europe/Busingen
DJ Africa/Djibouti
DK Europe/Copenhagen
DM America/Dominica
DO America/Santo_Domingo
DZ Africa/Algiers
EC America/Guayaquil
EC Pacific/Galapagos
EE Europe/Tallinn
EG Africa/Cairo
EH Africa/El_Aaiun
ER Africa/Asmara
ES Europe/Madrid
ES Africa/Ceuta
ES Atlantic/Canary
ET Africa/Addis_Ababa
FI Europe/Helsinki
FJ Pacific/Fiji
FK Atlantic/Stanley
FM Pacific/Chuuk
FM Pacific/Pohnpei
FM Pacific/Kosrae
FO Atlantic/Faroe
FR Europe/Paris
GA Africa/Libreville
GB Europe/London
GD America/Grenada
GE Asia/Tbilisi
GF America/Cayenne
GG Europe/Guernsey
GH Africa/Accra
GI Europe/Gibraltar
GL America/Nuuk
GL America/Danmarkshavn
GL America/Scoresbysund
GL America/Thule
GM Africa/Banjul
GN Africa/Conakry
GP America/Guadeloupe
GQ Africa/Malabo
GR Europe/Athens
GS Atlantic/South_Georgia
GT America/Guatemala
GU Pacific/Guam
GW Africa/Bissau
GY America/Guyana
HK Asia/Hong_Kong
HN America/Tegucigalpa
HR Europe/Zagreb
HT America/Port-au-Prince
HU Europe/Budapest
ID Asia/Jakarta
ID Asia/Pontianak
ID Asia/Makassar
ID Asia/Jayapura
IE Europe/Dublin
IL Asia/Jerusalem
IM Europe/Isle_of_Man
IN Asia/Kolkata
IO Indian/Chagos
IQ Asia/Baghdad
IR Asia/Tehran
IS Atlantic/Reykjavik
IT Europe/Rome
JE Europe/Jersey
JM America/Jamaica
JO Asia/Amman
JP Asia/Tokyo
KE Africa/Nairobi
KG Asia/Bishkek
KH Asia/Phnom_Penh
KI Pacific/Tarawa
KI Pacific/Kanton
KI Pacific/Kiritimati
KM Indian/Comoro
KN America/St_Kitts
KP Asia/Pyongyang
KR Asia/Seoul
KW Asia/Kuwait
KY America/Cayman
KZ Asia/Almaty
KZ Asia/Qyzylorda
KZ Asia/Qostanay
KZ Asia/Aqtobe
KZ Asia/Aqtau
KZ Asia/Atyrau
KZ Asia/Oral
LA Asia/Vientiane
LB Asia/Beirut
LC America/St_Lucia
LI Europe/Vaduz
LK Asia/Colombo
LR Africa/Monrovia
LS Africa/Maseru
LT Europe/Vilnius
LU Europe/Luxembourg
LV Europe/Riga
LY Africa/Tripoli
MA Africa/Casablanca
MC Europe/Monaco
MD Europe/Chisinau
ME Europe/Podgorica
MF America/Marigot
MG Indian/Antananarivo
MH Pacific/Majuro
MH Pacific/Kwajalein
MK Europe/Skopje
ML Africa/Bamako
MM Asia/Yangon
MN Asia/Ulaanbaatar
MN Asia/Hovd
MO Asia/Macau
MP Pacific/Saipan
MQ America/Martinique
MR Africa/Nouakchott
MS America/Montserrat
MT Europe/Malta
MU Indian/Mauritius
MV Indian/Maldives
MW Africa/Blantyre
MX America/Mexico_City
MX America/Cancun
MX America/Merida
MX America/Monterrey
MX America/Matamoros
MX America/Chihuahua
MX America/Ciudad_Juarez
MX America/Ojinaga
MX America/Mazatlan
MX America/Bahia_Banderas
MX America/Hermosillo
MX America/Tijuana
MY Asia/Kuala_Lumpur
MY Asia/Kuching
MZ Africa/Maputo
NA Africa/Windhoek
NC Pacific/Noumea
NE Africa/Niamey
NF Pacific/Norfolk
NG Africa/Lagos
NI America/Managua
NL Europe/Amsterdam
NO Europe/Oslo
NP Asia/Kathmandu
NR Pacific/Nauru
NU Pacific/Niue
NZ Pacific/Auckland
NZ Pacific/Chatham
OM Asia/Muscat
PA America/Panama
PE America/Lima
PF Pacific/Tahiti
PF Pacific/Marquesas
PF Pacific/Gambier
PG Pacific/Port_Moresby
PG Pacific/Bougainville
PH Asia/Manila
PK Asia/Karachi
PL Europe/Warsaw
PM America/Miquelon
PN Pacific/Pitcairn
PR America/Puerto_Rico
PS Asia/Gaza
PS Asia/Hebron
PT Europe/Lisbon
PT Atlantic/Madeira
PT Atlantic/Azores
PW Pacific/Palau
PY America/Asuncion
QA Asia/Qatar
RE Indian/Reunion
RO Europe/Bucharest
RS Europe/Belgrade
RU Europe/Kaliningrad
RU Europe/Moscow
UA Europe/Simferopol
RU Europe/Kirov
RU Europe/Volgograd
RU Europe/Astrakhan
RU Europe/Saratov
RU Europe/Ulyanovsk
RU Europe/Samara
RU Asia/Yekaterinburg
RU Asia/Omsk
RU Asia/Novosibirsk
RU Asia/Barnaul
RU Asia/Tomsk
RU Asia/Novokuznetsk
RU Asia/Krasnoyarsk
RU Asia/Irkutsk
RU Asia/Chita
RU Asia/Yakutsk
RU Asia/Khandyga
RU Asia/Vladivostok
RU Asia/Ust-Nera
RU Asia/Magadan
RU Asia/Sakhalin
RU Asia/Srednekolymsk
RU Asia/Kamchatka
RU Asia/Anadyr
RW Africa/Kigali
SA Asia/Riyadh
SB Pacific/Guadalcanal
SC Indian/Mahe
SD Africa/Khartoum
SE Europe/Stockholm
SG Asia/Singapore
SH Atlantic/St_Helena
SI Europe/Ljubljana
SJ Arctic/Longyearbyen
SK Europe/Bratislava
SL Africa/Freetown
SM Europe/San_Marino
SN Africa/Dakar
SO Africa/Mogadishu
SR America/Paramaribo
SS Africa/Juba
ST Africa/Sao_Tome
SV America/El_Salvador
SX America/Lower_Princes
SY Asia/Damascus
SZ Africa/Mbabane
TC America/Grand_Turk
TD Africa/Ndjamena
TF Indian/Kerguelen
TG Africa/Lome
TH Asia/Bangkok
TJ Asia/Dushanbe
TK Pacific/Fakaofo
TL Asia/Dili
TM Asia/Ashgabat
TN Africa/Tunis
TO Pacific/Tongatapu
TR Europe/Istanbul
TT America/Port_of_Spain
TV Pacific/Funafuti
TW Asia/Taipei
TZ Africa/Dar_es_Salaam
UA Europe/Kyiv
UG Africa/Kampala
UM Pacific/Midway
UM Pacific/Wake
US America/New_York
US America/Detroit
US America/Kentucky/Louisville
US America/Kentucky/Monticello
US America/Indiana/Indianapolis
US America/Indiana/Vincennes
US America/Indiana/Winamac
US America/Indiana/Marengo
US America/Indiana/Petersburg
US America/Indiana/Vevay
US America/Chicago
US America/Indiana/Tell_City
US America/Indiana/Knox
US America/Menominee
US America/North_Dakota/Center
US America/North_Dakota/New_Salem
US America/North_Dakota/Beulah
US America/Denver
US America/Boise
US America/Phoenix
US America/Los_Angeles
US America/Anchorage
US America/Juneau
US America/Sitka
US America/Metlakatla
US America/Yakutat
US America/Nome
US America/Adak
US Pacific/Honolulu
UY America/Montevideo
UZ Asia/Samarkand
UZ Asia/Tashkent
VA Europe/Vatican
VC America/St_Vincent
VE America/Caracas
VG America/Tortola
VI America/St_Thomas
VN Asia/Ho_Chi_Minh
VU Pacific/Efate
WF Pacific/Wallis
WS Pacific/Apia
YE Asia/Aden
YT Indian/Mayotte
ZA Africa/Johannesburg
ZM Africa/Lusaka
ZW Africa/Harare
`;

const cities: Record<string, string> = {
  UTC: "协调世界时",
  Shanghai: "上海",
  Urumqi: "乌鲁木齐",
  Hong_Kong: "香港",
  Macau: "澳门",
  Taipei: "台北",
  Tokyo: "东京",
  Seoul: "首尔",
  Singapore: "新加坡",
  Bangkok: "曼谷",
  Dubai: "迪拜",
  Kolkata: "加尔各答",
  Calcutta: "加尔各答",
  Jakarta: "雅加达",
  Ho_Chi_Minh: "胡志明市",
  Manila: "马尼拉",
  Kuala_Lumpur: "吉隆坡",
  Kathmandu: "加德满都",
  Katmandu: "加德满都",
  New_York: "纽约",
  Los_Angeles: "洛杉矶",
  Chicago: "芝加哥",
  Denver: "丹佛",
  Phoenix: "菲尼克斯",
  Detroit: "底特律",
  Anchorage: "安克雷奇",
  Honolulu: "檀香山",
  Toronto: "多伦多",
  Vancouver: "温哥华",
  Winnipeg: "温尼伯",
  Halifax: "哈利法克斯",
  St_Johns: "圣约翰斯",
  London: "伦敦",
  Paris: "巴黎",
  Berlin: "柏林",
  Rome: "罗马",
  Madrid: "马德里",
  Moscow: "莫斯科",
  Istanbul: "伊斯坦布尔",
  Sydney: "悉尼",
  Melbourne: "墨尔本",
  Brisbane: "布里斯班",
  Perth: "珀斯",
  Adelaide: "阿德莱德",
  Darwin: "达尔文",
  Hobart: "霍巴特",
  Eucla: "尤克拉",
  Lord_Howe: "豪勋爵岛",
  Broken_Hill: "布罗肯希尔",
  Lindeman: "林德曼岛",
  Auckland: "奥克兰",
  Chatham: "查塔姆群岛",
  Fiji: "斐济",
  Tahiti: "塔希提",
  Sao_Paulo: "圣保罗",
  Buenos_Aires: "布宜诺斯艾利斯",
  Mexico_City: "墨西哥城",
  Johannesburg: "约翰内斯堡",
  Cairo: "开罗",
  Nairobi: "内罗毕",
};
const aliases: Record<string, string> = {
  "Asia/Shanghai": "中国 北京 Beijing Peking China",
  "Asia/Tokyo": "日本 Japan",
  "America/New_York": "美国 USA US America United States",
  "America/Los_Angeles": "美国 USA US America United States LA",
  "Europe/London": "英国 UK Britain",
  "Australia/Brisbane": "澳洲",
};
const zoneCountries = new Map(
  countryZones
    .trim()
    .split("\n")
    .map((line) => line.trim().split(" ") as [string, string])
    .map(([country, timezone]) => [timezone, country]),
);
let options: TimeZoneOption[] | undefined;
let chineseCountries: Intl.DisplayNames | undefined;
let englishCountries: Intl.DisplayNames | undefined;

function countryName(code: string | undefined, english = false): string {
  if (!code) return "";
  try {
    if (english) englishCountries ??= new Intl.DisplayNames(["en"], { type: "region" });
    else chineseCountries ??= new Intl.DisplayNames(["zh-CN"], { type: "region" });
    return (english ? englishCountries : chineseCountries)?.of(code) ?? code;
  } catch {
    return code;
  }
}

export function timeZoneLabel(timezone: string): string {
  if (timezone === "UTC") return "协调世界时 · UTC";
  const cityId = timezone.split("/").at(-1) ?? timezone;
  const city = cities[cityId] ?? cityId.replaceAll("_", " ");
  const country = countryName(zoneCountries.get(timezone));
  return country ? `${country} · ${city}` : `${city} · ${timezone}`;
}

// Construct only when the picker opens, never during application startup.
export function timeZoneOptions(): TimeZoneOption[] {
  if (options) return options;
  const zones = new Set(["UTC", ...zoneCountries.keys(), ...availableTimeZones()]);
  options = [...zones].filter(isValidTimeZone).map((timezone) => {
    const label = timeZoneLabel(timezone);
    const country = zoneCountries.get(timezone);
    return {
      timezone,
      label,
      search:
        `${label} ${timezone.replaceAll("_", " ")} ${timezone} ${countryName(country, true)} ${aliases[timezone] ?? ""}`.toLocaleLowerCase(),
    };
  });
  return options;
}

export function searchTimeZones(query: string): TimeZoneOption[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = timeZoneOptions().filter((option) =>
    words.every((word) => option.search.includes(word)),
  );
  // Older saved IANA aliases can still be selected, even when not in the browser's canonical list.
  const timezone = query.trim();
  if (!matches.length && isValidTimeZone(timezone)) {
    return [{ timezone, label: timeZoneLabel(timezone), search: timezone.toLowerCase() }];
  }
  return matches;
}
