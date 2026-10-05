import type { Config, Context } from "@netlify/functions";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { tenantState } from "../../db/schema.js";
import { verifyRequest } from "../../lib/auth.js";
import { TENANT_ID_PATTERN, defaultContent, normalizeContent } from "../../lib/content.js";

const MAX_BODY_BYTES = 200_000;
const noStore = { "Cache-Control": "no-store" };

export default async (req: Request, context: Context) => {
  const tenantId = (context.params.tenant || "").toLowerCase();
  if (!TENANT_ID_PATTERN.test(tenantId)) {
    return Response.json({ error: "Tenant inválido." }, { status: 400 });
  }

  if (req.method === "GET") {
    const [row] = await db.select().from(tenantState).where(eq(tenantState.tenantId, tenantId));
    const version = row?.version ?? 0;

    // A TV envia a versão que já tem; se nada mudou, responde sem corpo
    const known = new URL(req.url).searchParams.get("v");
    if (known !== null && Number(known) === version) {
      return new Response(null, { status: 204, headers: noStore });
    }

    return Response.json(
      {
        data: row ? normalizeContent(row.data) : defaultContent(),
        version,
        updatedAt: row?.updatedAt ?? null,
      },
      { headers: noStore },
    );
  }

  if (req.method === "PUT") {
    if (!verifyRequest(req)) {
      return Response.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) {
      return Response.json({ error: "Conteúdo demasiado grande." }, { status: 413 });
    }

    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const data = normalizeContent(body?.data);
    const [row] = await db
      .insert(tenantState)
      .values({ tenantId, data, version: 1 })
      .onConflictDoUpdate({
        target: tenantState.tenantId,
        set: { data, version: sql`${tenantState.version} + 1`, updatedAt: new Date() },
      })
      .returning();

    return Response.json({ data, version: row.version, updatedAt: row.updatedAt }, { headers: noStore });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/state/:tenant",
  method: ["GET", "PUT"],
};
