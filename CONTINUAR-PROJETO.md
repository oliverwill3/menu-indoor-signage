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
- O usuário criou uma nova conta no Firebase Authentication com um e-mail funcional e já forneceu seu UID nesta conversa. Não reproduzir nem salvar o UID neste arquivo; falta vinculá-lo ao tenant.
- Existe script para popular o tenant `gutemberg-lounge` com conteúdo demonstrativo.
- A página inicial pública da Vercel abriu anteriormente; ainda falta validar o painel e a TV ligados ao Firestore em produção.

## Pendências prioritárias

1. Configurar credenciais locais de Firebase Admin para escrever no Firestore. Verificação recente: Firebase Admin SDK está instalado, mas `gcloud` CLI e Application Default Credentials não estão disponíveis. Instalar Google Cloud CLI, autenticar e executar:
   ```powershell
   gcloud auth application-default login
   ```
2. No terminal, na raiz do repositório, popular o tenant e autorizar o UID já fornecido pelo usuário:
   ```powershell
   npm run seed-tenant -- --admin-uid=UID_COPIADO
   ```
   O script usa o project ID de `.env.local`. Se a intenção for iniciar sem dados demonstrativos, em vez disso usar:
   ```powershell
   npm run create-tenant -- gutemberg-lounge --admin-uid=UID_COPIADO
   ```
   **Escolher apenas um comando**: o seed já cria/atualiza os dados do tenant; `create-tenant` cria um tenant vazio e falha se ele já existir.
3. Validar no navegador:
   - `https://menu-indoor-signage-9ze4.vercel.app/admin/gutemberg-lounge`
   - `https://menu-indoor-signage-9ze4.vercel.app/tv/gutemberg-lounge`
4. Se a aplicação publicada não conectar ao Firebase, cadastrar na Vercel as variáveis `NEXT_PUBLIC_FIREBASE_*` listadas em `.env.example` usando os valores do app Web Firebase e fazer redeploy. Nunca colocar valores secretos em commit ou neste arquivo.
5. Confirmar se o repositório está conectado à Vercel e se o deploy automático está habilitado.

## Cuidados e estado do Git

- O `README.md` descreve configuração de publicação na Netlify, enquanto a URL da aplicação Next.js validada até agora é a Vercel; confirmar qual plataforma deve ser a publicação definitiva.
- `.env.local` é privado; não imprimir seus valores em logs ou mensagens.
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
