"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  BookOpenText,
  Bookmark,
  ChevronRight,
  Clock3,
  FilePlus2,
  Gavel,
  Highlighter,
  LibraryBig,
  Link2,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const articles = [
  {
    id: "art-37",
    label: "Art. 37",
    title: "Administração Pública",
    text: "A administração pública direta e indireta de qualquer dos Poderes da União, dos Estados, do Distrito Federal e dos Municípios obedecerá aos princípios de legalidade, impessoalidade, moralidade, publicidade e eficiência.",
  },
  {
    id: "art-38",
    label: "Art. 38",
    title: "Servidor público em mandato eletivo",
    text: "Ao servidor público da administração direta, autárquica e fundacional, no exercício de mandato eletivo, aplicam-se as disposições constitucionais próprias.",
  },
  {
    id: "art-39",
    label: "Art. 39",
    title: "Regime jurídico",
    text: "A União, os Estados, o Distrito Federal e os Municípios instituirão conselho de política de administração e remuneração de pessoal.",
  },
];

const laws = [
  { label: "Constituição Federal", count: 250, active: true },
  { label: "Código Civil", count: 2046 },
  { label: "Código de Processo Civil", count: 1072 },
  { label: "Código Penal", count: 361 },
  { label: "CLT", count: 922 },
];

type ImportRequest = {
  id: number;
  reference: string;
  status: string;
  failed?: boolean;
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [selectedArticle, setSelectedArticle] = useState("art-37");
  const [highlighted, setHighlighted] = useState<string[]>(["art-37"]);
  const [highlightColor, setHighlightColor] = useState("yellow");
  const [importOpen, setImportOpen] = useState(false);
  const [requests, setRequests] = useState<ImportRequest[]>([]);

  const filteredArticles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized) return articles;
    return articles.filter((article) =>
      `${article.label} ${article.title} ${article.text}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalized),
    );
  }, [query]);

  function toggleHighlight(articleId: string) {
    setHighlighted((current) =>
      current.includes(articleId)
        ? current.filter((id) => id !== articleId)
        : [...current, articleId],
    );
  }

  async function submitImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const reference = String(data.get("reference") ?? "").trim();
    const sourceUrl = String(data.get("sourceUrl") ?? "").trim();
    if (!reference) return;
    const id = Date.now();
    setRequests((current) => [{ id, reference, status: "Validando referência" }, ...current]);
    event.currentTarget.reset();
    try {
      const response = await fetch("/api/import-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference, sourceUrl: sourceUrl || null }),
      });
      const result = await response.json();
      setRequests((current) =>
        current.map((request) =>
          request.id === id
            ? {
                ...request,
                status: response.ok
                  ? `Referência validada: ${result.planaltoQuery}`
                  : result.error ?? "Não foi possível validar a solicitação",
                failed: !response.ok,
              }
            : request,
        ),
      );
    } catch {
      setRequests((current) =>
        current.map((request) =>
          request.id === id
            ? { ...request, status: "Falha temporária ao validar a solicitação", failed: true }
            : request,
        ),
      );
    }
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="offcanvas" className="border-r border-stone-200">
        <SidebarHeader className="px-4 pb-4 pt-5">
          <div className="brand-mark"><span>VM</span></div>
          <div className="mt-3">
            <p className="text-sm font-semibold text-stone-950">Vade Mecum</p>
            <p className="text-xs text-stone-500">Biblioteca pessoal</p>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Estudo</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive tooltip="Leitor">
                    <BookOpenText /><span>Leitor</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Minha biblioteca">
                    <LibraryBig /><span>Minha biblioteca</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Favoritos">
                    <Bookmark /><span>Favoritos</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupLabel>Legislação</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {laws.map((law) => (
                  <SidebarMenuItem key={law.label}>
                    <SidebarMenuButton isActive={law.active}>
                      <Gavel /><span>{law.label}</span>
                      <span className="ml-auto text-[10px] tabular-nums text-stone-400">{law.count}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={() => setImportOpen(true)}>
                <FilePlus2 /><span>Incluir legislação</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton><Settings /><span>Configurações</span></SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="mt-2 flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-2.5">
            <div className="grid size-8 place-items-center rounded-full bg-emerald-900 text-xs font-semibold text-white">AS</div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">Antonyonne</p>
              <p className="truncate text-[11px] text-stone-500">Administrador</p>
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-[#f7f6f1]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-stone-200 bg-[#f7f6f1]/95 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="text-stone-600" />
          <div className="relative max-w-xl flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-10 border-stone-200 bg-white pl-9 shadow-none"
              placeholder="Buscar lei, artigo ou expressão"
              aria-label="Buscar no texto legal"
            />
          </div>
          <Badge variant="outline" className="hidden border-amber-300 bg-amber-50 text-amber-800 sm:inline-flex">Protótipo funcional</Badge>
          <Button onClick={() => setImportOpen(true)} className="bg-emerald-900 hover:bg-emerald-800">
            <Plus /><span className="hidden sm:inline">Incluir lei</span>
          </Button>
        </header>

        <main className="mx-auto grid w-full max-w-[1500px] flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 border-stone-200 lg:border-r">
            <div className="border-b border-stone-200 px-5 py-5 md:px-10">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-xs text-stone-500">
                    <span>Constituição Federal</span><ChevronRight className="size-3" /><span>Título III</span><ChevronRight className="size-3" /><span>Capítulo VII</span>
                  </div>
                  <h1 className="font-legal text-2xl text-stone-950 md:text-3xl">Da Administração Pública</h1>
                  <p className="mt-1 text-sm text-stone-500">Seção I — Disposições Gerais</p>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-1.5">
                  <Highlighter className="ml-1 size-4 text-stone-500" />
                  {[
                    ["yellow", "bg-amber-300"],
                    ["green", "bg-emerald-300"],
                    ["blue", "bg-sky-300"],
                    ["pink", "bg-rose-300"],
                  ].map(([color, className]) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setHighlightColor(color)}
                      className={`size-6 rounded-full ${className} ${highlightColor === color ? "ring-2 ring-stone-700 ring-offset-2" : ""}`}
                      aria-label={`Selecionar marcação ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="mx-auto max-w-4xl px-5 py-8 md:px-10 md:py-12">
              {filteredArticles.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center">
                  <Search className="mx-auto size-6 text-stone-400" />
                  <p className="mt-3 font-medium">Nenhum dispositivo encontrado</p>
                  <p className="mt-1 text-sm text-stone-500">Tente outra expressão ou número de artigo.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {filteredArticles.map((article) => {
                    const isHighlighted = highlighted.includes(article.id);
                    const isSelected = selectedArticle === article.id;
                    return (
                      <article
                        key={article.id}
                        className={`legal-article ${isSelected ? "legal-article-selected" : ""}`}
                        onClick={() => setSelectedArticle(article.id)}
                      >
                        <div className="article-rail">
                          <button
                            type="button"
                            onClick={(event) => { event.stopPropagation(); toggleHighlight(article.id); }}
                            aria-label={`${isHighlighted ? "Remover" : "Adicionar"} destaque em ${article.label}`}
                            className="article-number"
                          >
                            {article.label}
                          </button>
                        </div>
                        <div>
                          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">{article.title}</p>
                          <p className={`article-copy ${isHighlighted ? `highlight-${highlightColor}` : ""}`}>{article.text}</p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="hidden bg-[#f1efe7] p-6 lg:block">
            <div className="sticky top-22 space-y-6">
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">Neste dispositivo</h2>
                  <Badge variant="secondary">3 vínculos</Badge>
                </div>
                <div className="space-y-2">
                  <ContextCard icon={Link2} eyebrow="Remissão legal" title="Lei nº 8.112/1990" detail="Regime dos servidores públicos" />
                  <ContextCard icon={Gavel} eyebrow="Jurisprudência" title="Tema 1.010 — STF" detail="Princípio da legalidade administrativa" />
                  <ContextCard icon={MessageSquareText} eyebrow="Minha nota" title="Revisar para PGE" detail="Relacionar com controle da administração." />
                </div>
              </section>

              <section className="rounded-xl border border-emerald-900/10 bg-emerald-950 p-5 text-white shadow-sm">
                <div className="flex items-center gap-2 text-emerald-200"><Sparkles className="size-4" /><span className="text-xs font-semibold uppercase tracking-[0.14em]">Atualização</span></div>
                <p className="mt-3 text-sm font-medium">Fonte verificada no Planalto</p>
                <p className="mt-1 text-xs leading-5 text-emerald-100/70">A versão semanal será comparada sem substituir seu histórico de leitura.</p>
                <div className="mt-4 flex items-center gap-2 text-[11px] text-emerald-100/60"><Clock3 className="size-3" />Próxima verificação: domingo</div>
              </section>
            </div>
          </aside>
        </main>
      </SidebarInset>

      <Sheet open={importOpen} onOpenChange={setImportOpen}>
        <SheetContent className="w-full overflow-y-auto border-stone-200 bg-[#f8f7f2] sm:max-w-lg">
          <SheetHeader className="border-b border-stone-200 px-6 py-6">
            <SheetTitle className="font-legal text-2xl">Incluir legislação</SheetTitle>
            <SheetDescription>Informe a referência da norma. O sistema verificará duplicidade e localizará a fonte oficial.</SheetDescription>
          </SheetHeader>
          <div className="space-y-8 px-6 py-6">
            <form onSubmit={submitImport} className="space-y-4">
              <div>
                <label htmlFor="reference" className="mb-1.5 block text-sm font-medium text-stone-800">Espécie, número e ano</label>
                <Input id="reference" name="reference" required placeholder="Ex.: Lei 8.429/1992" className="h-11 bg-white" />
              </div>
              <div>
                <label htmlFor="sourceUrl" className="mb-1.5 block text-sm font-medium text-stone-800">URL oficial, se disponível</label>
                <Input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://www.planalto.gov.br/..." className="h-11 bg-white" />
              </div>
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
                A busca automática será feita na REFLEGIS e nas páginas oficiais do Planalto. Resultados ambíguos irão para confirmação.
              </div>
              <Button type="submit" className="h-11 w-full bg-emerald-900 hover:bg-emerald-800"><Search />Solicitar busca oficial</Button>
            </form>

            <section>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">Fila desta sessão</h3>
              {requests.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">Nenhuma solicitação registrada.</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {requests.map((request) => (
                    <div key={request.id} className="rounded-xl border border-stone-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3"><p className="font-medium text-stone-900">{request.reference}</p><Badge variant={request.failed ? "destructive" : "secondary"}>{request.failed ? "Revisar" : "Solicitado"}</Badge></div>
                      <p className="mt-1 text-xs text-stone-500">{request.status}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>
    </SidebarProvider>
  );
}

function ContextCard({ icon: Icon, eyebrow, title, detail }: { icon: typeof Link2; eyebrow: string; title: string; detail: string }) {
  return (
    <button type="button" className="w-full rounded-xl border border-stone-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-800/30 hover:shadow-sm">
      <div className="flex gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><Icon className="size-4" /></div>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-400">{eyebrow}</p>
          <p className="mt-1 text-sm font-semibold text-stone-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-stone-500">{detail}</p>
        </div>
      </div>
    </button>
  );
}
