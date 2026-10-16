# Cardápio em Vídeo

Cardápio de restaurante no formato de rede social: cada prato em vídeo, pedido direto pelo celular, painel do restaurante recebendo pedidos ao vivo e painel da plataforma para cadastrar restaurantes.

Tecnologia: Next.js 16 + Supabase (banco Postgres, login e tempo real).

## O que já funciona (etapa 1)

| Parte | Endereço | O que faz |
| --- | --- | --- |
| Cardápio do cliente | `/<endereco-do-restaurante>` | Feed com vídeo de cada item, categorias, tamanho, tirar ingrediente, adicionais, carrinho e envio do pedido. `?mesa=12` no link abre já no modo mesa (para o QR code). |
| Acompanhar pedido | `/<endereco>/pedido/<id>?t=<código>` | O cliente vê cada etapa. Atualiza sozinha. Só abre com o código secreto do link. |
| Painel do restaurante | `/painel` | Login, pedidos chegando ao vivo com aviso sonoro, aceitar, recusar, mudar etapa, abrir e fechar a loja, trocar senha. |
| Admin da plataforma | `/admin` | Cadastrar restaurante com o dono, suspender e reativar. |

## Ainda falta (próximas etapas)

- [ ] Editor de cardápio no painel (hoje os itens entram pelo banco)
- [ ] Envio de vídeos e fotos pelo painel
- [ ] Aviso de pedido novo por WhatsApp
- [ ] Verificação em duas etapas no login do painel e do admin
- [ ] Páginas de termos de uso e política de privacidade
- [ ] Avaliações dos clientes
- [ ] Cloudflare na frente do site e limite de acessos por IP
- [ ] Trocar `'unsafe-inline'` do CSP por nonce

## Como colocar no ar

### 1. Supabase (banco de dados)

1. Crie uma conta em supabase.com e um projeto novo. Região: **South America (São Paulo)**.
2. Guarde a senha do banco num gerenciador de senhas.
3. Vá em **SQL Editor > New query**, cole o conteúdo de `supabase/migrations/0001_inicial.sql` e clique em **Run**.
4. Para ter o restaurante de exemplo, faça o mesmo com `supabase/seed.sql`.
5. Em **Authentication > Sign In / Providers**, desligue **Allow new users to sign up**. Só o admin cria contas.
6. Em **Authentication > Users > Add user**, crie a sua conta (e-mail e senha forte).
7. No SQL Editor, torne a sua conta administradora da plataforma:

   ```sql
   insert into public.platform_admins (user_id)
   select id from auth.users where email = 'SEU-EMAIL-AQUI';
   ```

8. Em **Project Settings > API**, copie a URL, a chave `anon` e a chave `service_role`.

### 2. Rodar no computador

```bash
cp .env.example .env.local   # e preencha com as chaves do passo 1.8
npm install
npm run dev                  # abre em http://localhost:3000
```

### 3. Vercel (site no ar)

1. Crie uma conta em vercel.com com o seu GitHub.
2. **Add New > Project**, escolha este repositório e, em **Root Directory**, a pasta `cardapio-em-video`.
3. Em **Environment Variables**, cole as mesmas 4 variáveis do `.env.local`. A `NEXT_PUBLIC_SITE_URL` passa a ser o endereço do site.
4. **Deploy**.

## Segurança

- **Cada restaurante só vê os próprios dados.** A segurança por linha (RLS) está ligada em todas as tabelas.
- **O preço é sempre recalculado no servidor.** O valor que vem do celular é ignorado.
- **Ninguém cria pedido direto no banco.** O pedido entra só pela rota `/api/pedidos`, que valida tudo.
- **O atendente não muda preço nem abre e fecha a loja.** Só dono e gerente.
- **Proteções contra robôs:** limite de 3 pedidos por número a cada 10 minutos, campo-isca contra robôs e tamanho máximo do pedido.
- **Proteções do site:** cabeçalhos de segurança (CSP, HSTS, proibição de abrir o site dentro de outro site) e o link de acompanhamento com código secreto.
- **A chave `service_role` só é usada no servidor.** Nunca vai para o navegador.

### Teste automático de isolamento

`supabase/tests/isolamento.sql` tenta, como restaurante A, ler e mudar dados do restaurante B, e como visitante, criar pedidos e mudar preços. Se qualquer tentativa funcionar, o teste para com `FALHOU`.

Para rodar num Postgres local (não no Supabase de verdade):

```bash
bash scripts/testar-banco.sh
```

Rode sempre que mudar o banco.
