# Retomada do projeto — Mídia Indoor

Este arquivo resume o estado do projeto para continuar o trabalho em outra ferramenta. Não contém senhas, tokens ou valores de configuração privados.

## Projeto

- Repositório: `oliverwill3/menu-indoor-signage`
- Pasta local: `C:\Users\Admin\Desktop\TRABALHOS\menu-indoor-signage`
- Aplicação publicada na Vercel: https://menu-indoor-signage-9ze4.vercel.app/
- Projeto Firebase: `month-vision-saas`
- Banco: Cloud Firestore `(default)`, região `southamerica-east1`, plano Spark

## Objetivo

Finalizar uma aplicação multi-tenant de sinalização digital/cardápio:

- Tela pública de TV em `/tv/:tenantId`
- Painel administrativo em `/admin/:tenantId`
- Dados por tenant no Firestore, com atualizações em tempo real
- Autenticação Firebase por e-mail e senha

## O que já foi feito

- Migração do app antigo para Next.js e criação das rotas acima.
- Configuração modular do Firebase, Auth, Firestore com persistência local e Storage.
- Regras do Firestore publicadas.
- `.env.local` existe localmente e está ignorado pelo Git. **Não compartilhar nem versionar esse arquivo.**
- Provedor Firebase Auth **E-mail/senha** está ativo.
- O novo usuário Auth do proprietário foi vinculado como administrador do tenant `gutemberg-lounge`. Não reproduzir nem salvar o UID neste arquivo.
- `scripts/seedTenant.js` foi executado com sucesso e gravou as configurações, três produtos e duas promoções demonstrativas.
- Login por Google Cloud CLI concluiu com sucesso. As Application Default Credentials ficaram localmente em `%APPDATA%\gcloud\application_default_credentials.json`; não copiar nem enviar esse arquivo.
- Teste local confirmou que `/tv/gutemberg-lounge` lê e exibe os dados do Firestore. `/admin/gutemberg-lounge` abre o formulário de login.
- O deploy público Vercel ainda falha porque não tem as variáveis públicas obrigatórias do Firebase configuradas.

## Pendências prioritárias

1. Fazer login na Vercel e configurar as variáveis de ambiente do projeto `menu-indoor-signage-9ze4`. São obrigatórias as seis variáveis `NEXT_PUBLIC_FIREBASE_*` mencionadas no erro da aplicação (`API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`). Obter os valores do `.env.local` localmente; não colar em chat nem em commit. `NEXT_PUBLIC_FIREBASE_DATABASE_URL` não é necessária para o app, que usa Firestore.
2. Fazer um novo deploy/redeploy Vercel após salvar as variáveis.
3. Validar em produção:
   - `https://menu-indoor-signage-9ze4.vercel.app/admin/gutemberg-lounge`
   - `https://menu-indoor-signage-9ze4.vercel.app/tv/gutemberg-lounge`
4. Fazer login no painel com o novo usuário Firebase Auth e verificar edição/gravação de um conteúdo de teste.
5. Confirmar se o repositório está conectado à Vercel e se o deploy automático está habilitado.

## Cuidados e estado do Git

- O `README.md` descreve configuração de publicação na Netlify, enquanto a URL da aplicação Next.js validada até agora é a Vercel; confirmar qual plataforma deve ser a publicação definitiva.
- `.env.local` é privado; não imprimir seus valores em logs ou mensagens.
- As Application Default Credentials são privadas e ficam fora do repositório em `%APPDATA%\gcloud\application_default_credentials.json`.
- A URL antiga da Netlify não é a versão Next.js atual; a publicação da aplicação nova é a URL da Vercel acima.

## Arquivos úteis

- `src/lib/firebase.js`: inicialização dos SDKs Firebase no cliente.
- `app/admin/[tenantId]/admin-client.js`: login e painel administrativo; o UID precisa estar autorizado para o tenant.
- `app/tv/[tenantId]/tv-client.js`: tela pública da TV.
- `firestore.rules`: regras de acesso ao Firestore.
- `scripts/firebase-admin.js`: inicialização do Firebase Admin e vínculo de UID como administrador.
- `scripts/seedTenant.js`: popular `gutemberg-lounge` com dados demonstrativos e, opcionalmente, autorizar o UID.
- `scripts/createTenant.js`: criar tenant vazio e, opcionalmente, autorizar o UID.
- `.env.example`: nomes das variáveis públicas necessárias.
- `README.md`: instruções gerais do projeto, incluindo publicação na Netlify.
