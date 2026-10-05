# menu-indoor-signage
Plataforma SaaS White-Label de Digital Signage e Cardápio Dinâmico com gestão mobile em tempo real e exibição responsiva para TVs (16:9).
# 📺 Menu & Indoor Signage System (White-Label)

Sistema completo de Mídia Indoor e Cardápio Digital Dinâmico focado em estabelecimentos comerciais. Permite a gestão em tempo real de produtos, preços, destaques, conteúdos promocionais, informativos e avaliações do Google diretamente pelo telemóvel, com sincronização instantânea num Player de TV (16:9).

## 🚀 Principais Funcionalidades

- **📱 Painel de Controlo Mobile (`?admin=1`):**
  - Login obrigatório com usuário e senha, opção para manter a sessão neste dispositivo e botão para sair.
  - Edição do nome, logo, slogans e letreiro do rodapé.
  - Inclusão, remoção e ordenação de produtos da vitrine, com descrição, preço e URL da imagem.
  - Inclusão, remoção e ordenação das promoções exibidas na lateral da TV.
  - Interface responsiva, adequada a telas de celular e controles touch.

- **📺 Player TV (Exibição 16:9):**
  - Layout dinâmico otimizado para ecrãs de alta resolução.
  - Transições suaves e animações de zoom (*Ken Burns Effect*).
  - Letreiro rotativo inferior (*Marquee*) para avisos, ofertas e dados de pagamento.
  - Sincronização em tempo real (zero-refresh) entre o telemóvel e a TV.

- **🏢 Arquitetura Multi-Tenant:**
  - Código agnóstico preparado para revenda e personalização por cliente via `tenant_id`.

## Executar e publicar

O player estático e o painel estão em `public/`. A aplicação usa também duas Netlify Functions:

- `POST /api/login`: valida as credenciais e emite um token assinado.
- `GET/PUT /api/state/:tenant`: lê e grava o conteúdo do tenant no banco Netlify.

Para que o login seguro e a sincronização entre dispositivos funcionem, publique o projeto na Netlify e habilite o Netlify DB no site. A sincronização em nuvem usa essa API; `localStorage` e `BroadcastChannel` complementam a persistência local e a atualização instantânea entre abas do mesmo navegador. Ao executar somente um servidor de arquivos estáticos, as funções não estarão disponíveis e o login/atualização em nuvem não funcionarão.

Configure as variáveis de ambiente da Netlify:

| Variável | Uso | Padrão |
| --- | --- | --- |
| `ADMIN_USER` | Usuário do painel | `admin` |
| `ADMIN_PASSWORD` | Senha do painel | `1234` |
| `ADMIN_SESSION_SECRET` | Segredo aleatório para assinar sessões | Derivado do usuário e senha |

Defina uma senha forte e um `ADMIN_SESSION_SECRET` próprio antes de publicar em produção. O QR code exibido na TV abre a URL do painel; ele não contém nem revela as credenciais.

Abra o player no endereço publicado para exibir na TV. Para acessar o painel, use o QR code da lateral ou abra `/?admin=1` no celular e entre com as credenciais configuradas. O painel grava os dados na nuvem, e o player consulta atualizações automaticamente sem recarregar a página.
