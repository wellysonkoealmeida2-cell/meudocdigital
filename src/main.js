import { createClient } from '@supabase/supabase-js';
import './style.css';

const root = document.getElementById('app');
const endpoint = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const apiRoot = endpoint + '/functions/v1/meu-sistema-api';
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let supabase, view = 'inicio', catalog = [], account = null, balance = {creditos:0}, documents = [];

if (!endpoint || !publishableKey || publishableKey.startsWith('COLE_')) {
  root.innerHTML = '<main class="auth"><h1>Meu Sistema</h1><p>Configuração pendente: configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY nas variáveis do build do Cloudflare Pages.</p></main>';
} else {
  supabase = createClient(endpoint, publishableKey);
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      setTimeout(() => passwordRecoveryPage(), 0);
      return;
    }
    if (!session) loginPage();
    else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')
      setTimeout(() => { showDashboard().catch(displayFailure); }, 0);
  });
  supabase.auth.getSession().then(({data}) => {
    if (!data.session) loginPage();
  }).catch(displayFailure);
}

function displayFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  const el = document.querySelector('#notice');
  if (el) el.textContent = message;
  else root.innerHTML = '<main class="auth"><h1>Não foi possível carregar</h1><p>' + escape(message) + '</p></main>';
}
function notice(message) {
  const el = document.querySelector('#notice');
  if (el) el.textContent = message;
}
function readableAuthError(error) {
  const message = String(error?.message || '');
  const status = error?.status;
  const code = error?.code;
  if (code === 'invalid_credentials' || /Invalid login credentials/i.test(message))
    return 'E-mail ou senha não reconhecidos neste Supabase. Se este e-mail já foi usado em outro site, a senha pode ser diferente. Utilize "Esqueci minha senha" para recuperar o acesso.';
  if (status === 429 || /rate limit|too many requests|over_email_send_rate_limit/i.test(message))
    return 'Muitas tentativas em pouco tempo. Aguarde antes de tentar novamente. Não repita o cadastro várias vezes.';
  if (/already registered|already exists/i.test(message))
    return 'Este e-mail já possui uma conta. Use Entrar ou Esqueci minha senha.';
  if (/email not confirmed/i.test(message))
    return 'Seu e-mail ainda não foi confirmado. A confirmação é configurada no Supabase.';
  if (/password/i.test(message))
    return 'Verifique os requisitos da senha: ' + message;
  return message || 'Não foi possível concluir a operação. Tente novamente.';
}
function passwordRecoveryPage() {
  root.innerHTML = `<main class="auth"><div class="eyebrow">RECUPERAÇÃO DE ACESSO</div>
    <h1>Criar nova senha</h1><p>Escolha uma nova senha para sua conta.</p>
    <form id="password-form"><label>Nova senha <input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
    <button type="submit">Salvar nova senha</button></form><p id="notice" role="status"></p></main>`;
  document.getElementById('password-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    notice('Salvando...');
    try {
      const {error} = await supabase.auth.updateUser({password:event.currentTarget.elements.password.value});
      if (error) throw error;
      notice('Senha alterada. Sua sessão está ativa e o painel será carregado.');
      setTimeout(() => { showDashboard().catch(displayFailure); }, 0);
    } catch (e) { notice(readableAuthError(e)); button.disabled = false; }
  };
}
function loginPage(mode='login') {
  const title = mode === 'signup' ? 'Criar conta' : 'Entrar';
  root.innerHTML = `<main class="auth">
    <div class="eyebrow">CENTRAL DE DOCUMENTOS</div><h1>Meu <em>Sistema</em></h1>
    <p>${mode==='signup'?'Cadastre um novo e-mail e uma senha exclusiva para esta conta.':'Entre para consultar seus documentos particulares, créditos e modelos.'}</p>
    <form id="login-form">
      <label>E-mail <input name="email" type="email" autocomplete="email" required></label>
      <label>Senha <input name="password" type="password" minlength="8" autocomplete="${mode==='signup'?'new-password':'current-password'}" required></label>
      <button type="submit">${title}</button>
    </form>
    <div class="switch"><button id="login-choice" type="button">Entrar</button><button id="signup-choice" type="button">Criar conta</button><button id="recover" type="button">Esqueci minha senha</button></div>
    <p id="notice" role="status"></p>
  </main>`;
  document.getElementById('login-choice').onclick = () => loginPage('login');
  document.getElementById('signup-choice').onclick = () => loginPage('signup');
  document.getElementById('recover').onclick = async () => {
    const email = document.querySelector('[name=email]').value.trim();
    if (!email) return notice('Informe seu e-mail primeiro.');
    notice('Solicitando recuperação...');
    try {
      const {error} = await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin});
      if(error) throw error;
      notice('Se a conta existir, você receberá um link para criar outra senha. Confira a caixa de entrada e o spam.');
    } catch (e) { notice(readableAuthError(e)); }
  };
  document.getElementById('login-form').onsubmit = async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    notice('Aguarde...');
    try {
      const {data,error} = mode === 'signup'
        ? await supabase.auth.signUp({email,password})
        : await supabase.auth.signInWithPassword({email,password});
      if(error) throw error;
      if (mode === 'signup' && !data.session) return notice('Cadastro recebido. Se a confirmação de e-mail estiver ativa, confira sua caixa de entrada. Se esta conta já existir, utilize Entrar ou recuperação de senha.');
      await showDashboard();
    } catch (e) { notice(readableAuthError(e)); }
    finally { if (button.isConnected) button.disabled = false; }
  };
}
async function callApi(path, method='GET') {
  const {data:{session},error} = await supabase.auth.getSession();
  if (error || !session) throw new Error('Faça login para continuar.');
  const response = await fetch(apiRoot + path, {
    method,
    headers:{
      'apikey':publishableKey,
      'authorization':'Bearer '+session.access_token,
      'content-type':'application/json'
    }
  });
  const json = await response.json().catch(()=>({error:'Resposta inesperada da API'}));
  if(!response.ok || json.ok===false) throw new Error(json.error || 'Falha na API');
  return json.data;
}
async function showDashboard() {
  root.innerHTML='<main class="auth"><h2>Carregando painel...</h2></main>';
  try {
    await callApi('/me/iniciar','POST');
    [account,catalog,balance,documents]=await Promise.all([
      callApi('/me'), callApi('/modules'), callApi('/credits'), callApi('/documents')
    ]);
    render();
  } catch (e) {displayFailure(e);}
}
const tabs=[['inicio','Visão geral'],['catalogo','Catálogo'],['documentos','Documentos'],['conta','Minha conta']];
function render() {
  root.innerHTML=`<div class="layout">
    <aside class="sidebar"><div class="logo">MEU <span>SISTEMA</span></div><div class="eyebrow">CENTRAL DE DOCUMENTOS</div>
      <nav>${tabs.map(([id,name])=>`<button data-tab="${id}" class="${view===id?'current':''}">${name}</button>`).join('')}</nav>
      <button id="logout" class="logout">Sair</button>
    </aside>
    <main class="content"><header><div class="eyebrow">PAINEL DO CLIENTE</div><h1>${tabs.find(t=>t[0]===view)[1]}</h1></header><section id="body"></section><p id="notice" role="status"></p></main>
  </div>`;
  document.getElementById('logout').onclick=()=>supabase.auth.signOut();
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{view=b.dataset.tab;render();});
  const body=document.getElementById('body');
  if(view==='inicio') body.innerHTML=`<div class="stats"><article><p>Créditos</p><strong>${Number(balance?.creditos)||0}</strong></article><article><p>Modelos disponíveis</p><strong>${catalog.length}</strong></article><article><p>Registros recentes</p><strong>${documents.length}</strong></article></div><div class="panel"><h2>Bem-vindo ao Meu Sistema</h2><p>Explore o catálogo de contratos e declarações particulares. Emissão de PDFs e pagamentos ainda não estão ativados.</p></div>`;
  if(view==='catalogo') {
    body.innerHTML=`<div class="grid">${catalog.map(m=>`<article class="panel"><div class="file-icon">▤</div><h2>${escape(m.nome)}</h2><p>${escape(m.descricao)}</p><p><b>${Number(m.preco_creditos)||0} créditos</b></p><button data-code="${escape(m.codigo)}">Ver campos</button></article>`).join('') || '<p>Não há modelos publicados.</p>'}</div><div id="details"></div>`;
    document.querySelectorAll('[data-code]').forEach(b=>b.onclick=async()=>{
      try{
        const m=await callApi('/modules/'+encodeURIComponent(b.dataset.code));
        document.getElementById('details').innerHTML=`<div class="panel"><h2>${escape(m.nome)}</h2><p>Campos informativos — geração ainda indisponível.</p>${(m.campos||[]).map(f=>`<p>${escape(f.titulo)}${f.obrigatorio?' *':''}</p>`).join('')}</div>`;
      } catch(e){notice(e.message);}
    });
  }
  if(view==='documentos') body.innerHTML=`<div class="panel"><h2>Meus documentos</h2>${documents.length?documents.map(d=>`<p>${escape(d.estado)} — ${escape(d.criado_em)}</p>`).join(''):'<p>Nenhum documento gerado até agora.</p>'}</div>`;
  if(view==='conta') body.innerHTML=`<div class="panel"><h2>Informações da conta</h2><p>Nome: ${escape(account?.nome||'Não informado')}</p><p>Status: ${escape(account?.status||'Aguardando perfil')}</p><p>Permissões: ${escape((account?.papeis||[]).join(', ')||'Usuário')}</p></div>`;
}
