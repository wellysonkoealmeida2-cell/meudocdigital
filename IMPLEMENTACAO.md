# Meu Sistema — estado da implementação

## Funcionalidades instaladas
- Autenticação Supabase Auth e recuperação de senha.
- Catálogo com 10 serviços ativos, categorias e busca.
- Formulários configurados no banco, com salvamento de rascunhos.
- Envio de solicitações para atendimento, com bloqueio de edição após envio.
- Acompanhamento de status pelo cliente e atualização pelo administrador.
- Pré-visualização e impressão de documentos particulares / fichas de atendimento não oficiais em PDF usando o navegador.
- Painel administrativo: indicadores, cadastro/edição/ativação de modelos, listagem de clientes, controle de acesso **restrito ao Meu Sistema**, andamento das solicitações e ajustes manuais de créditos auditados.
- API `meu-sistema-api` no Supabase compartilhado com Consultoria CDN; tabelas separadas no esquema `meu_sistema`.
- Cloudflare Pages configurado para build Vite a partir da branch `main`.

## Limitações que ainda impedem liberação comercial plena
- **Pix e pagamento real não estão ativos.** Requerem integração com provedor autorizado, webhooks autenticados e conciliação de pagamento.
- Créditos manuais não são uma confirmação de pagamento. Ainda não há débito automático de créditos pela impressão ou envio de solicitações.
- PDFs são gerados por impressão do navegador; ainda não há serviço servidor de renderização e armazenamento privado de PDFs finais.
- Documentos oficiais (CIN, CNH, CPF e certidões) são **orientação e atendimento**, não emissão de segundas vias. Emissão oficial permanece com órgão responsável.
- O sistema compartilha Supabase Auth com Consultoria CDN: mudanças globais como confirmação por e-mail afetam ambos.
- Revisar avisos de segurança Supabase (funções SECURITY DEFINER expostas para usuários autenticados; proteção de senhas vazadas desativada), testar autenticação HTTP e RLS com usuários reais distintos e implantações em navegadores antes de comercializar.
- Painel visual e experiência ainda podem ser refinados; não é cópia do site de referência.

## Operação
Cloudflare Pages: https://meudocdigital.pages.dev

GitHub: https://github.com/wellysonkoealmeida2-cell/meudocdigital

Supabase: `cwmvtbbikrccnpgoouoh`

Para ver a última versão, confira a implantação de produção no Cloudflare e recarregue o site.

## Segurança
Nunca adicionar chaves secretas, service_role, senhas ou dados pessoais ao repositório público. Apenas VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são para o frontend. A chave publicável não concede permissões sem a validação do token e das regras no servidor.
