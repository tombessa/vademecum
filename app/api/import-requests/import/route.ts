import { createHash } from "node:crypto";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { withDatabaseClient } from "@/lib/postgres";

const ARTICLE_PATTERN = /(Art\.\s*\d+[ºo]?(?:-[A-Z])?)\s*([\s\S]*?)(?=Art\.\s*\d+[ºo]?(?:-[A-Z])?|$)/giu;
const WINDOWS_1252_SPECIAL = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";

function decodeHtmlText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<(?:strike|s)\b[^>]*>[\s\S]*?<\/(?:strike|s)>/giu, " ")
    .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;|&#160;/giu, " ")
    .replace(/&ordm;/giu, "º")
    .replace(/&sect;/giu, "§")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/gu, (_, value) => String.fromCodePoint(Number(value)))
    .replace(/[ \t]+/gu, " ")
    .replace(/\n\s*\n+/gu, "\n")
    .trim();
}

function decodeWindows1252(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => {
    if (byte < 0x80 || byte >= 0xa0) return String.fromCharCode(byte);
    return WINDOWS_1252_SPECIAL[byte - 0x80] ?? "�";
  }).join("");
}

function decodeResponse(bytes: ArrayBuffer, contentType: string) {
  const headerCharset = contentType.match(/charset=([^;\s]+)/iu)?.[1]?.replace(/["']/gu, "");
  const headerText = Array.from(new Uint8Array(bytes.slice(0, 4096)), (byte) => String.fromCharCode(byte)).join("");
  const documentCharset = headerText.match(/charset\s*=\s*["']?([^\s"'/>;]+)/iu)?.[1];
  const charset = (headerCharset || documentCharset || "utf-8").toLocaleLowerCase("en-US");
  return /^(?:windows-1252|iso-8859-1|latin1)$/u.test(charset)
    ? decodeWindows1252(bytes)
    : new TextDecoder().decode(bytes);
}

export async function POST() {
  const auth = await getChatGPTUser();
  if (!auth) return Response.json({ error: "Autenticação necessária." }, { status: 401 });
  let phase = "conexão com o banco";
  try {
    const result = await withDatabaseClient(async (client) => {
      await client.query("BEGIN");
      try {
        phase = "identificação do usuário";
        const u = await client.query<{id:string;role:string}>(
          "SELECT user_id AS id, user_role AS role FROM ensure_chatgpt_user($1::citext, $2)",
          [auth.email,auth.displayName],
        );
        const user=u.rows[0]; if(!user) throw new Error("Usuário ausente");
        await client.query("SELECT set_config('app.current_user_id',$1,true),set_config('app.current_user_role',$2,true)",[user.id,user.role]);
        phase = "leitura da fila";
        const q=await client.query<{id:string;act_type:string;act_number:string;act_year:number;raw_query:string;source_url:string}>(`SELECT r.id,r.requested_act_type act_type,r.requested_act_number act_number,r.requested_act_year act_year,r.raw_query,c.source_url
          FROM legislation_import_request r JOIN legislation_import_candidate c ON c.request_id=r.id AND c.is_selected
          WHERE r.requested_by=$1 AND r.status='FOUND' ORDER BY r.created_at LIMIT 1 FOR UPDATE`,[user.id]);
        const request=q.rows[0]; if(!request){await client.query("COMMIT");return null;}
        phase = "download do Planalto";
        const response=await fetch(request.source_url,{headers:{"user-agent":"Mozilla/5.0 (compatible; VadeMecumPessoal/0.1; +https://chatgpt.com)","accept":"text/html,application/xhtml+xml"},signal:AbortSignal.timeout(15000)});
        if(!response.ok) throw new Error("Fonte oficial indisponível");
        phase = "leitura do texto oficial";
        const contentType=response.headers.get("content-type")??"text/html";
        const bytes=await response.arrayBuffer();
        const html=decodeResponse(bytes,contentType); const text=decodeHtmlText(html); const sha=createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
        phase = "gravação da norma";
        const snapshot=await client.query<{id:string}>(`INSERT INTO source_snapshot(source_type,source_url,content_type,sha256) VALUES('PLANALTO_HTML',$1,$2,$3) ON CONFLICT(source_type,sha256) DO UPDATE SET source_url=EXCLUDED.source_url RETURNING id`,[request.source_url,contentType,sha]);
        const act=await client.query<{id:string}>(`INSERT INTO normative_act(act_type,act_number,act_year,title,official_url,status) VALUES($1,$2,$3,$4,$5,'ACTIVE') ON CONFLICT(jurisdiction,act_type,act_number,act_year) DO UPDATE SET title=EXCLUDED.title,official_url=EXCLUDED.official_url RETURNING id`,[request.act_type,request.act_number,request.act_year,request.raw_query,request.source_url]);
        const version=await client.query<{id:string}>(`INSERT INTO act_version(act_id,source_snapshot_id,version_label,content_sha256,is_current) VALUES($1,$2,'Fonte oficial importada',$3,true) ON CONFLICT(act_id,content_sha256) DO UPDATE SET is_current=true RETURNING id`,[act.rows[0].id,snapshot.rows[0].id,sha]);
        const articles=[...text.matchAll(ARTICLE_PATTERN)].slice(0,500);
        if (articles.length === 0) throw new Error("Nenhum artigo reconhecido na fonte oficial");
        for(let i=0;i<articles.length;i++) await client.query(`INSERT INTO legal_unit(version_id,logical_key,unit_type,label,body,order_path,sort_order) VALUES($1,$2,'ARTICLE',$3,$4,$5::ltree,$6) ON CONFLICT(version_id,logical_key) DO UPDATE SET body=EXCLUDED.body`,[version.rows[0].id,`art-${i+1}`,articles[i][1],`${articles[i][1]} ${articles[i][2]}`.trim(),`a.${i+1}`,i]);
        await client.query("UPDATE legislation_import_request SET status='AWAITING_REVIEW', published_act_id=$2 WHERE id=$1",[request.id,act.rows[0].id]);
        await client.query("COMMIT"); return {reference:request.raw_query,articles:articles.length};
      }catch(e){await client.query("ROLLBACK");throw e;}
    });
    return Response.json({imported:result});
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
    console.error("Falha na importação legal", { phase, code, message: error instanceof Error ? error.message : "erro desconhecido" });
    return Response.json({error:`Não foi possível concluir a etapa: ${phase}.`,code:code ? `DB_${code}` : "IMPORT_FAILED"},{status:503});
  }
}
