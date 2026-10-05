import type { Config } from "@netlify/functions";
import { checkCredentials, createToken } from "../../lib/auth.js";

export default async (req: Request) => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Pedido inválido." }, { status: 400 });
  }

  if (!checkCredentials(body?.username, body?.password)) {
    // Pequeno atraso para dificultar tentativas em massa
    await new Promise((resolve) => setTimeout(resolve, 600));
    return Response.json({ error: "Usuário ou senha incorretos." }, { status: 401 });
  }

  return Response.json(createToken(String(body.username).trim(), Boolean(body.remember)));
};

export const config: Config = {
  path: "/api/login",
  method: "POST",
};
