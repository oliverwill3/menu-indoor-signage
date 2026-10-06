# Mídia Indoor multi-tenant

Aplicação Next.js com player de TV por tenant, painel mobile autenticado e conteúdo em tempo real no Firestore. O cliente e seus dados de demonstração ficam fora dos valores padrão da aplicação.

## Desenvolvimento

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local` e preencha as variáveis `NEXT_PUBLIC_FIREBASE_*` com a configuração do app Web do Firebase.
3. No Firebase Console, ative Firestore e o provedor E-mail/senha em Authentication.
4. Publique `firestore.rules` no Firestore Rules antes de usar o painel.
5. Execute `npm run dev`.

A TV abre em `/tv/<tenantId>` e o painel mobile em `/admin/<tenantId>`. A página inicial permite informar o identificador. O player só lê tenants ativos; as alterações exigem login e um vínculo de administrador.

## Criar contas e tenants

Crie uma conta E-mail/senha no Firebase Authentication e copie seu UID. Os scripts usam o Firebase Admin SDK com Application Default Credentials, não expostas ao navegador:

```powershell
gcloud auth application-default login
npm run create-tenant -- loja-nova --admin-uid=UID_DO_USUARIO
```

Para carregar os dados conhecidos do cliente usado como referência:

```powershell
npm run seed-tenant -- --admin-uid=UID_DO_USUARIO
```

O script cria ou atualiza `tenants/gutemberg-lounge`, seus produtos e promoções. O `--admin-uid` é opcional; sem ele, crie o vínculo de administrador com um ambiente confiável antes de abrir o painel. Os scripts precisam de `NEXT_PUBLIC_FIREBASE_PROJECT_ID` no `.env.local` e de credenciais ADC com permissão de escrita no Firestore.

## Estrutura Firestore

- Documento `tenants/{tenantId}`: configurações da identidade, cor, rodapé e nota geral do Google.
- Subcoleções `produtos`, `promocoes`, `eventos`, `avaliacoes` e `anuncios_terceiros`.
- Vínculos privados `tenant_admins/{tenantId}/users/{uid}`; as regras permitem ao usuário ler somente o próprio vínculo. O provisioning dos vínculos é feito pelo script com Admin SDK.

O `defaultTenant` em `lib/defaultSchema.js` é neutro e sem produtos, eventos ou avaliações. A página da TV escuta o documento e as subcoleções com `onSnapshot`; assinaturas e temporizadores são limpos ao sair. A persistência local do Firestore mantém os últimos dados sincronizados disponíveis durante uma interrupção de rede.

## Publicação na Netlify

O build é `npm run build`; o adaptador oficial atual do Next.js é detectado pela Netlify sem plugin manual. `netlify.toml` fixa Node 22, compatível com Next.js 16.

Para ativar deploy automático:

1. Na Netlify, escolha **Add new project → Import an existing project**.
2. Conecte o GitHub e selecione `oliverwill3/menu-indoor-signage`; defina `main` como production branch.
3. Confira o comando de build `npm run build`. Não defina `public` como publish directory: esta aplicação usa o adaptador Next.js.
4. Em **Project configuration → Environment variables**, adicione os sete valores do app Web Firebase listados em `.env.example`, incluindo `NEXT_PUBLIC_FIREBASE_DATABASE_URL`.
5. Publique um deploy inicial. Os próximos pushes para `main` iniciam deploys automaticamente.

As variáveis do app Web são embutidas no build do cliente; habilite as regras do Firestore e Firebase Authentication antes de disponibilizar os links públicos. Nunca coloque uma chave privada de service account nas variáveis `NEXT_PUBLIC_*`. Depois do deploy, use `/admin/<tenantId>` e `/tv/<tenantId>` no domínio `*.netlify.app` atribuído ao site.

## Verificação manual

- **Tenant `gutemberg-lounge`:** depois de `npm run seed-tenant`, `/tv/gutemberg-lounge` exibe os três produtos, promoções laterais, cores, slogans e letreiro do conjunto migrado. A configuração conhecida não continha logo, eventos, anúncios ou avaliações individuais; esses campos permanecem vazios.
- **Tenant em branco:** depois de criar um slug com `npm run create-tenant -- loja-nova --admin-uid=UID`, `/tv/loja-nova` exibe placeholders neutros sem erro.
- **Tempo real:** com a TV aberta, edite um produto no Firestore Console ou no painel `/admin/loja-nova`; a atualização deve aparecer sem refresh.

## Privacidade das configurações

`.env.local` contém apenas a configuração pública do Firebase Web e é ignorado pelo Git. Os scripts usam ADC local; não salve chaves privadas ou contas de serviço no repositório.
