import assert from "node:assert/strict";
import test from "node:test";

import { normalizeLegalText, parseLegalText } from "../lib/legislation-parser.mjs";
import { assertOfficialPlanaltoUrl, buildReflegisQuery, parseActReference } from "../lib/planalto-reference.mjs";

test("normaliza ordinais e palavras hifenizadas", () => {
  const input = "Art. 1o A adminis-\ntração observará a lei.\n§ 1o Regra.";
  assert.equal(normalizeLegalText(input), "Art. 1º A administração observará a lei.\n§ 1º Regra.");
});

test("reconstrói a hierarquia básica de um ato", () => {
  const input = `
TÍTULO I – Disposições Gerais
CAPÍTULO I – Da Finalidade
Art. 1º Esta Lei disciplina a matéria.
Parágrafo único. Aplica-se a todo o território nacional.
Art. 2º São objetivos:
I – garantir a publicidade;
a) por meio eletrônico;
1. com acesso público;
§ 1º O regulamento definirá os detalhes.
`;
  const units = parseLegalText(input, { actKey: "BR/LEI/9999/2025" });
  assert.deepEqual(
    units.map(({ type, label }) => [type, label]),
    [
      ["TITLE", "TÍTULO I"],
      ["CHAPTER", "CAPÍTULO I"],
      ["ARTICLE", "Art. 1"],
      ["CAPUT", "Caput"],
      ["SOLE_PARAGRAPH", "Parágrafo único"],
      ["ARTICLE", "Art. 2"],
      ["CAPUT", "Caput"],
      ["ITEM_ROMAN", "I"],
      ["LETTER", "a)"],
      ["ITEM_ARABIC", "1"],
      ["PARAGRAPH", "§ 1º"],
    ],
  );
  const chapter = units.find((unit) => unit.type === "CHAPTER");
  const firstArticle = units.find((unit) => unit.logicalKey.endsWith("/ART/1"));
  assert.equal(firstArticle.parentId, chapter.id);
});

test("não confunde remissão em linha com início de artigo", () => {
  const units = parseLegalText("Art. 1º Aplica-se o art. 3º da Constituição.\nart. 61 do Código Penal.");
  assert.equal(units.filter((unit) => unit.type === "ARTICLE").length, 1);
  assert.match(units.find((unit) => unit.type === "CAPUT").body, /art\. 61/);
});

test("interpreta referência informada pelo usuário", () => {
  const reference = parseActReference("Lei 8.429/1992");
  assert.deepEqual(reference, {
    actType: "LEI",
    actNumber: "8429",
    actYear: 1992,
    displayReference: "Lei 8.429/1992",
  });
  assert.equal(buildReflegisQuery(reference), "LEI 8429/1992");
  assert.equal(parseActReference("Decreto-Lei 4.657/1942").actType, "DECRETO_LEI");
});

test("aceita apenas fonte HTTPS oficial do Planalto", () => {
  assert.equal(assertOfficialPlanaltoUrl("https://www.planalto.gov.br/ccivil_03/leis/l8429.htm").hostname, "www.planalto.gov.br");
  assert.throws(() => assertOfficialPlanaltoUrl("http://www.planalto.gov.br/lei"), /HTTPS/);
  assert.throws(() => assertOfficialPlanaltoUrl("https://example.com/lei"), /domínio permitido/);
});
