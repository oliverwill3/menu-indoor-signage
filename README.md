# Mídia Indoor multi-tenant

Aplicação Next.js com player de TV por tenant, painel autenticado e playlists publicadas em tempo real no Firestore. O cliente e seus dados de demonstração ficam fora dos valores padrão da aplicação.

## Desenvolvimento

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local` e preencha as variáveis `NEXT_PUBLIC_FIREBASE_*` com a configuração do app Web do Firebase.
3. No Firebase Console, ative Firestore e o provedor E-mail/senha em Authentication.
4. Publique `firestore.rules` no Firestore Rules antes de usar o painel.
5. Execute `npm run dev`.

A TV abre em `/tv/<tenantId>`. O acesso administrativo é unificado em `/login` (com o identificador da loja) e o painel fica em `/admin/<tenantId>`. Contas marcadas com `isFirstAccess: true` são encaminhadas a `/first-access` para definir senha e nome antes de acessar os dados. O painel salva alterações em `tenant_drafts/{tenantId}` e só atualiza a TV ao publicar `playlists/{tenantId}`.

## Criar contas e tenants

Crie uma conta E-mail/senha no Firebase Authentication e copie seu UID. Os scripts e as rotas de publicação usam o Firebase Admin SDK com Application Default Credentials localmente, não expostas ao navegador:

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

## Estrutura Firestore

- Documento `tenants/{tenantId}`: identidade e status comercial administrados pelo servidor.
- Documento `tenant_drafts/{tenantId}`: configuração, catálogo e telas em edição; somente rotas autenticadas com papel editor ou superior acessam o conteúdo.
- Documento `playlists/{tenantId}`: snapshot único publicado com moldura, catálogo, telas, promoções, eventos, avaliações e anúncios. O player faz uma única inscrição `onSnapshot` neste documento; clientes podem apenas lê-lo quando o tenant está ativo. Toda escrita passa pela rota autenticada do Firebase Admin SDK.
- Subcoleções legadas de conteúdo em `tenants/{tenantId}` são lidas no servidor somente para inicializar o primeiro rascunho de tenants já existentes; as regras negam acesso direto do cliente.
- Vínculos privados `tenant_admins/{tenantId}/users/{uid}`; as regras permitem ao usuário ler somente o próprio vínculo e aceitam os papéis `owner`, `admin`, `editor` e `viewer`. O provisioning dos vínculos é feito pelo script com Admin SDK.
- A conclusão do primeiro acesso requer `isFirstAccess: true`, `invitedAt` e autenticação posterior ao convite. A emissão e o envio dos convites serão ligados ao onboarding do SuperAdmin na etapa 5.

Na primeira configuração, informe nome, dois logos, dois slogans, título dos destaques e pelo menos um aviso. O primeiro salvamento do rascunho trava os campos estruturais do L; slogans e destaques continuam editáveis. As alterações do catálogo e das telas permanecem privadas até **Publicar**. A rota rejeita uma publicação que ultrapasse o tamanho seguro de um documento Firestore.

O `defaultTenant` em `lib/defaultSchema.js` é neutro. A TV escuta somente a playlist publicada e limpa a inscrição e o temporizador ao sair. A persistência local do Firestore mantém a última playlist lida disponível durante uma interrupção de rede.

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

## Privacidade das configurações

`.env.local` é ignorado pelo Git. Não salve credenciais privadas de service account no repositório nem em variáveis `NEXT_PUBLIC_*`; use ADC localmente e um segredo de ambiente no host de produção.
