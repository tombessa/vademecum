const ACT_TYPES = [
  [/^(?:LEI\s+COMPLEMENTAR|LC)\b/iu, "LEI_COMPLEMENTAR"],
  [/^(?:DECRETO[ -]LEI|DL)\b/iu, "DECRETO_LEI"],
  [/^(?:EMENDA\s+CONSTITUCIONAL|EC)\b/iu, "EMENDA_CONSTITUCIONAL"],
  [/^(?:MEDIDA\s+PROVISÓRIA|MP)\b/iu, "MEDIDA_PROVISORIA"],
  [/^DECRETO\b/iu, "DECRETO"],
  [/^LEI\b/iu, "LEI"],
];

export function parseActReference(raw) {
  const normalized = raw.normalize("NFC").trim().replace(/\s+/g, " ");
  const typeEntry = ACT_TYPES.find(([pattern]) => pattern.test(normalized));
  const numberYear = normalized.match(/(\d{1,3}(?:\.\d{3})*|\d+)\s*[/.-]\s*(\d{4})/u);
  if (!typeEntry || !numberYear) return null;
  const year = Number(numberYear[2]);
  if (year < 1800 || year > 2200) return null;
  return {
    actType: typeEntry[1],
    actNumber: numberYear[1].replaceAll(".", ""),
    actYear: year,
    displayReference: normalized,
  };
}

export function buildReflegisQuery(reference) {
  const typeLabel = {
    LEI: "LEI",
    LEI_COMPLEMENTAR: "LEI COMPLEMENTAR",
    DECRETO: "DECRETO",
    DECRETO_LEI: "DECRETO-LEI",
    EMENDA_CONSTITUCIONAL: "EMENDA CONSTITUCIONAL",
    MEDIDA_PROVISORIA: "MEDIDA PROVISÓRIA",
  }[reference.actType];
  return `${typeLabel} ${reference.actNumber}/${reference.actYear}`;
}

export function assertOfficialPlanaltoUrl(raw, allowedHosts = ["www.planalto.gov.br", "www4.planalto.gov.br"]) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("A fonte oficial deve usar HTTPS.");
  if (url.username || url.password) throw new Error("A URL não pode conter credenciais.");
  if (!allowedHosts.includes(url.hostname.toLocaleLowerCase("en-US"))) {
    throw new Error("A URL não pertence a um domínio permitido do Planalto.");
  }
  return url;
}
