export type LegalUnitType =
  | "PART" | "BOOK" | "TITLE" | "CHAPTER" | "SECTION" | "SUBSECTION"
  | "ARTICLE" | "CAPUT" | "SOLE_PARAGRAPH" | "PARAGRAPH"
  | "ITEM_ROMAN" | "LETTER" | "ITEM_ARABIC" | "OTHER";

export interface ParsedLegalUnit {
  id: string;
  parentId: string | null;
  label: string | null;
  heading: string | null;
  body: string | null;
  logicalKey: string;
  type: LegalUnitType;
  sortOrder: number;
}

export function normalizeLegalText(input: string): string;
export function parseLegalText(input: string, options?: { actKey?: string }): ParsedLegalUnit[];
