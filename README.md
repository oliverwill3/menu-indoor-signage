# Mídia Indoor multi-tenant

Aplicação Next.js com player de TV por tenant, painel autenticado e playlists publicadas em tempo real no Firestore. O cliente e seus dados de demonstração ficam fora dos valores padrão da aplicação.

## Desenvolvimento

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local` e preencha as variáveis `NEXT_PUBLIC_FIREBASE_*` com a configuração do app Web do Firebase.
3. No Firebase Console, ative Firestore e os provedores E-mail/senha e Anônimo em Authentication.
4. Publique `firestore.rules` no Firestore Rules antes de usar o painel.
5. Execute `npm run dev`.

O modo de teste da TV abre em `/tv/<tenantId>`. O acesso administrativo é unificado em `/login` (com o identificador da loja) e o painel fica em `/admin/<tenantId>`. Contas marcadas com `isFirstAccess: true` são encaminhadas a `/first-access` para definir senha e nome antes de acessar os dados. O painel salva alterações em `tenant_drafts/{tenantId}` e só atualiza a TV ao publicar `playlists/{tenantId}`. A leitura do tenant exige um vínculo administrativo válido ou um dispositivo autenticado e pareado.

## Criar contas e tenants

Crie uma conta E-mail/senha no Firebase Authentication e copie seu UID. Os scripts atribuem as custom claims `role: tenantAdmin` e `tenantId` e criam o documento de vínculo; não compartilhe contas SuperAdmin e de lojista. Os scripts e as rotas de publicação usam o Firebase Admin SDK com Application Default Credentials localmente, não expostas ao navegador:

```powershell
gcloud auth application-default login
npm run create-tenant -- loja-nova --admin-uid=UID_DO_USUARIO
```

Para carregar os dados conhecidos do cliente usado como referência:

```powershell
npm run seed-tenant -- --admin-uid=UID_DO_USUARIO
```

O script cria ou atualiza `tenants/gutemberg-lounge`, seus produtos e promoções. O `--admin-uid` é opcional; sem ele, crie o vínculo de administrador com um ambiente confiável antes de abrir o painel. Os scripts precisam de `NEXT_PUBLIC_FIREBASE_PROJECT_ID` no `.env.local` e de credenciais ADC com permissão de escrita no Firestore.

Em um host serverless sem ADC (por exemplo Vercel), configure `FIREBASE_SERVICE_ACCOUNT_JSON` como variável privada contendo a credencial JSON da service account com acesso ao Firestore e Firebase Auth. Nunca use o prefixo `NEXT_PUBLIC_` para essa variável. O mesmo valor pode ser definido no `.env.local` para desenvolvimento, mas ADC é preferível localmente.

O acesso SuperAdmin usa Conta Google verificada e a allowlist privada `SUPER_ADMIN_EMAILS` (lista de e-mails separada por vírgulas). Após configurar ambas as variáveis no ambiente de produção, entre em `/login` com a Conta Google allowlisted e selecione “Entrar como SuperAdmin com Google”; para uma conta existente de e-mail/senha, entre nela primeiro e vincule a mesma Conta Google. A claim só é atribuída pelo servidor após validar provedor, verificação do e-mail e allowlist. As regras do Firestore também recusam sessões SuperAdmin autenticadas por senha.

## Estrutura Firestore

- Documento `tenants/{tenantId}`: identidade e status comercial privados, lidos somente pelo SuperAdmin ou pelo administrador daquele tenant.
- Documento `tenant_drafts/{tenantId}`: configuração, catálogo e telas em edição; nunca legíveis por dispositivos da TV.
- Documento `playlists/{tenantId}`: snapshot único publicado com moldura, catálogo, telas, promoções, eventos, avaliações e anúncios. Só o SuperAdmin, o administrador autenticado daquele tenant ou um dispositivo autenticado e vinculado podem ler; o cliente não pode escrever.
- Documento global `platform/mediaPlaylist`: mídia própria da plataforma, sem dados de tenant; qualquer sessão autenticada, inclusive uma TV anônima, pode ler. Escritas ficam no Admin SDK.
- `devices/{deviceId}`: identidade da sessão anônima da TV, código temporário de pareamento, tenant vinculado e estado. O dispositivo pode criar e ler somente seu próprio registro não vinculado; apenas o servidor altera vínculo, estado e código.
- Vínculos privados `tenant_admins/{tenantId}/users/{uid}`: o usuário lê seu vínculo; criação e gestão usam Admin SDK. Claims `role` e `tenantId` são conferidas junto ao vínculo.
- `audit_logs/{logId}`: trilha de auditoria gravada pelo servidor e legível pelo SuperAdmin.
- A conclusão do primeiro acesso requer `isFirstAccess: true`, `invitedAt` e autenticação posterior ao convite. A emissão e o envio dos convites serão ligados ao onboarding do SuperAdmin na etapa 5.

Na primeira configuração, informe nome, dois logos, dois slogans, título dos destaques e pelo menos um aviso. O primeiro salvamento do rascunho trava os campos estruturais do L; slogans e destaques continuam editáveis. As alterações do catálogo e das telas permanecem privadas até **Publicar**. A rota rejeita uma publicação que ultrapasse o tamanho seguro de um documento Firestore.

O `defaultTenant` em `lib/defaultSchema.js` é neutro. `npm run seed-tenant` cria ou atualiza o rascunho e o snapshot inicial publicado, além dos documentos legados de compatibilidade. As regras não tornam os dados do tenant públicos: sessões anônimas sem vínculo não podem ler a playlist publicada.

## Publicação na Netlify

O build é `npm run build`; o adaptador oficial atual do Next.js é detectado pela Netlify sem plugin manual. `netlify.toml` fixa Node 22, compatível com Next.js 16.

Para ativar deploy automático:

1. Na Netlify, escolha **Add new project → Import an existing project**.
2. Conecte o GitHub e selecione `oliverwill3/menu-indoor-signage`; defina `main` como production branch.
3. Confira o comando de build `npm run build`. Não defina `public` como publish directory: esta aplicação usa o adaptador Next.js.
4. Em **Project configuration → Environment variables**, adicione os valores públicos do app Web Firebase listados em `.env.example` e `FIREBASE_SERVICE_ACCOUNT_JSON` como segredo privado para as rotas server-side do Firebase Admin SDK.
5. Publique um deploy inicial. Os próximos pushes para `main` iniciam deploys automaticamente.

As variáveis do app Web são embutidas no build do cliente; habilite as regras do Firestore e Firebase Authentication antes de disponibilizar os links públicos. Nunca coloque uma chave privada de service account nas variáveis `NEXT_PUBLIC_*`. Depois do deploy, use `/admin/<tenantId>` e `/tv/<tenantId>` no domínio `*.netlify.app` atribuído ao site.

## Verificação manual

- **Tenant `gutemberg-lounge`:** depois de `npm run seed-tenant`, abra `/admin/gutemberg-lounge`, configure o segundo logo e a moldura, salve o rascunho, edite produtos/telas e publique. A TV só muda depois da publicação.
- **Tenant em branco:** depois de criar um slug com `npm run create-tenant -- loja-nova --admin-uid=UID`, complete a configuração obrigatória da moldura no painel antes de salvar o primeiro rascunho.
- **Tempo real:** deixe `/tv/<tenantId>` aberto e publique uma playlist no painel. A atualização deve chegar pelo único documento sem refresh nem leitura das subcoleções.

## Testes com os emuladores Firebase

Instale um JDK compatível e deixe o comando `java` disponível no `PATH`; o Firebase Emulator Suite precisa do Java para iniciar o Firestore Emulator. Execute `npm run test:emulators` para iniciar Auth e Firestore com o projeto isolado `demo-menu-indoor` e rodar `node --test`.

Os testes não carregam `.env.local` nem usam credenciais reais. A inicialização sem credenciais só é permitida em `NODE_ENV=test`, com `FIREBASE_ADMIN_ALLOW_EMULATOR_NO_CREDENTIALS=true` e os endpoints dos emuladores Auth e Firestore definidos. Testes de unidade sem emuladores podem ser executados com `npm test`.

## Privacidade das configurações

`.env.local` é ignorado pelo Git. Não salve credenciais privadas de service account no repositório nem em variáveis `NEXT_PUBLIC_*`; use ADC localmente e um segredo de ambiente no host de produção.
