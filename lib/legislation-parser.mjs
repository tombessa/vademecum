const HEADING_RANK = new Map([
  ["PART", 1],
  ["BOOK", 2],
  ["TITLE", 3],
  ["CHAPTER", 4],
  ["SECTION", 5],
  ["SUBSECTION", 6],
]);

const HEADING_TYPES = new Map([
  ["PARTE", "PART"],
  ["LIVRO", "BOOK"],
  ["TÍTULO", "TITLE"],
  ["CAPÍTULO", "CHAPTER"],
  ["SEÇÃO", "SECTION"],
  ["SUBSEÇÃO", "SUBSECTION"],
]);

export function normalizeLegalText(input) {
  return input
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/([a-záàâãéêíóôõúç])-[ \t]*\n[ \t]*([a-záàâãéêíóôõúç])/giu, "$1$2")
    .replace(/(Art\.\s*\d+(?:\.\d+)*)o\b/giu, "$1º")
    .replace(/(§\s*\d+)o\b/giu, "$1º")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseLegalText(input, options = {}) {
  const actKey = options.actKey ?? "BR/ATO/DESCONHECIDO";
  const lines = normalizeLegalText(input)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const units = [];
  const headingStack = [];
  let sequence = 0;
  let currentArticle = null;
  let currentCaput = null;
  let currentParagraph = null;
  let currentRoman = null;
  let currentLetter = null;
  let lastLeaf = null;

  const append = (unit) => {
    const complete = {
      id: `unit-${++sequence}`,
      parentId: unit.parentId ?? null,
      label: unit.label ?? null,
      heading: unit.heading ?? null,
      body: unit.body ?? null,
      logicalKey: unit.logicalKey,
      type: unit.type,
      sortOrder: sequence,
    };
    units.push(complete);
    return complete;
  };

  const structuralParent = () => headingStack.at(-1)?.id ?? null;

  for (const line of lines) {
    const headingMatch = line.match(/^(PARTE|LIVRO|TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO)\s+([^—–-]+?)(?:\s*[—–-]\s*(.+))?$/iu);
    if (headingMatch) {
      const type = HEADING_TYPES.get(headingMatch[1].toLocaleUpperCase("pt-BR"));
      const rank = HEADING_RANK.get(type);
      while (headingStack.length && headingStack.at(-1).rank >= rank) headingStack.pop();
      const parentId = structuralParent();
      const unit = append({
        type,
        parentId,
        label: `${headingMatch[1]} ${headingMatch[2]}`,
        heading: headingMatch[3] ?? null,
        logicalKey: `${actKey}/STRUCT/${sequence + 1}`,
      });
      headingStack.push({ id: unit.id, rank });
      currentArticle = currentCaput = currentParagraph = currentRoman = currentLetter = null;
      lastLeaf = unit;
      continue;
    }

    const articleMatch = line.match(/^Art\.\s*(\d+(?:\.\d+)*(?:-[A-Z])?)(?:[ºo]|\.)?\s*(.*)$/u);
    if (articleMatch) {
      const number = articleMatch[1].toLocaleUpperCase("pt-BR");
      currentArticle = append({
        type: "ARTICLE",
        parentId: structuralParent(),
        label: `Art. ${number}`,
        logicalKey: `${actKey}/ART/${number}`,
      });
      currentCaput = articleMatch[2]
        ? append({
            type: "CAPUT",
            parentId: currentArticle.id,
            label: "Caput",
            body: articleMatch[2],
            logicalKey: `${currentArticle.logicalKey}/CAPUT`,
          })
        : null;
      currentParagraph = currentRoman = currentLetter = null;
      lastLeaf = currentCaput ?? currentArticle;
      continue;
    }

    const soleParagraphMatch = line.match(/^Parágrafo\s+único\.?\s*(.*)$/iu);
    if (soleParagraphMatch && currentArticle) {
      currentParagraph = append({
        type: "SOLE_PARAGRAPH",
        parentId: currentArticle.id,
        label: "Parágrafo único",
        body: soleParagraphMatch[1] || null,
        logicalKey: `${currentArticle.logicalKey}/PAR/UNICO`,
      });
      currentRoman = currentLetter = null;
      lastLeaf = currentParagraph;
      continue;
    }

    const paragraphMatch = line.match(/^§\s*(\d+)(?:[ºo]|\.)?\s*(.*)$/iu);
    if (paragraphMatch && currentArticle) {
      currentParagraph = append({
        type: "PARAGRAPH",
        parentId: currentArticle.id,
        label: `§ ${paragraphMatch[1]}º`,
        body: paragraphMatch[2] || null,
        logicalKey: `${currentArticle.logicalKey}/PAR/${paragraphMatch[1]}`,
      });
      currentRoman = currentLetter = null;
      lastLeaf = currentParagraph;
      continue;
    }

    const romanMatch = line.match(/^([IVXLCDM]+)\s*[—–-]\s*(.*)$/u);
    if (romanMatch && currentArticle) {
      const parent = currentParagraph ?? currentCaput ?? currentArticle;
      currentRoman = append({
        type: "ITEM_ROMAN",
        parentId: parent.id,
        label: romanMatch[1],
        body: romanMatch[2] || null,
        logicalKey: `${parent.logicalKey}/INC/${romanMatch[1]}`,
      });
      currentLetter = null;
      lastLeaf = currentRoman;
      continue;
    }

    const letterMatch = line.match(/^([a-z])\)\s*(.*)$/iu);
    if (letterMatch && (currentRoman || currentParagraph || currentCaput)) {
      const parent = currentRoman ?? currentParagraph ?? currentCaput;
      const letter = letterMatch[1].toLocaleLowerCase("pt-BR");
      currentLetter = append({
        type: "LETTER",
        parentId: parent.id,
        label: `${letter})`,
        body: letterMatch[2] || null,
        logicalKey: `${parent.logicalKey}/AL/${letter}`,
      });
      lastLeaf = currentLetter;
      continue;
    }

    const arabicMatch = line.match(/^(\d+)\s*[.)-]\s*(.*)$/u);
    if (arabicMatch && (currentLetter || currentRoman)) {
      const parent = currentLetter ?? currentRoman;
      lastLeaf = append({
        type: "ITEM_ARABIC",
        parentId: parent.id,
        label: arabicMatch[1],
        body: arabicMatch[2] || null,
        logicalKey: `${parent.logicalKey}/ITEM/${arabicMatch[1]}`,
      });
      continue;
    }

    if (lastLeaf) {
      lastLeaf.body = [lastLeaf.body, line].filter(Boolean).join(" ");
    } else {
      lastLeaf = append({
        type: "OTHER",
        logicalKey: `${actKey}/OTHER/${sequence + 1}`,
        body: line,
      });
    }
  }

  return units;
}
