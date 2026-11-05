# Meu Sistema — site web

Frontend Vite para Cloudflare Pages, conectado ao projeto Supabase **Consultoria CDN** em esquema isolado.

## Publicação no Cloudflare Pages

1. Workers & Pages → Create → Pages → Connect to Git → selecione `wellysonkoealmeida2-cell/meudocdigital`.
2. Framework: Vite; Build command: `npm run build`; Build output directory: `dist`.
3. Variáveis de ambiente do build: `VITE_SUPABASE_URL=https://cwmvtbbikrccnpgoouoh.supabase.co` e `VITE_SUPABASE_PUBLISHABLE_KEY` com sua chave **publicável** Supabase.
4. Faça a implantação; cadastre o endereço Pages em Supabase Auth → URL Configuration → Redirect URLs.

**Não publique** `.env`, `service_role` ou chaves secretas. O código-fonte `src/main.js` contém imports npm que só funcionam no navegador após o `npm run build`.

Nesta fase a plataforma inclui cadastro/login, painel, catálogo, saldo e histórico; PDF e pagamentos ainda não estão implementados.
