export interface ActReference {
  actType: "LEI" | "LEI_COMPLEMENTAR" | "DECRETO" | "DECRETO_LEI" | "EMENDA_CONSTITUCIONAL" | "MEDIDA_PROVISORIA";
  actNumber: string;
  actYear: number;
  displayReference: string;
}

export function parseActReference(raw: string): ActReference | null;
export function buildReflegisQuery(reference: ActReference): string;
export function assertOfficialPlanaltoUrl(raw: string, allowedHosts?: string[]): URL;
