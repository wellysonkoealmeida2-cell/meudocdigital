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
async function callApi(path, method='GET', payload=null) {
  const {data:{session},error} = await supabase.auth.getSession();
  if (error || !session) throw new Error('Faça login para continuar.');
  const response = await fetch(apiRoot + path, {
    method,
    headers:{
      'apikey':publishableKey,
      'authorization':'Bearer '+session.access_token,
      'content-type':'application/json'
    },
    ...(payload === null ? {} : {body:JSON.stringify(payload)})
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

let selectedModule=null;
let selectedDraft=null;
function allowedInputType(kind) {
  return kind==='date'?'date':'text';
}
async function openForm(codigo, existing=null) {
  try {
    notice('Abrindo formulário...');
    const m=await callApi('/modules/'+encodeURIComponent(codigo));
    selectedModule=m;
    selectedDraft=existing?.id || null;
    view='catalogo';
    render();
    const area=document.getElementById('details');
    if(!area)return;
    area.innerHTML=
      '<section class="panel" id="edit-form-panel"><h2>'+escape(m.nome)+'</h2>'+
      '<p>Formulário de documento particular. Os dados ficam vinculados à sua conta; esta plataforma não emite vias oficiais.</p>'+
      '<form id="document-form">'+
      (m.campos||[]).map(f=>'<label>'+escape(f.titulo)+(f.obrigatorio?' *':'')+
        (f.tipo==='textarea'
        ? '<textarea name="'+escape(f.campo)+'" maxlength="1500" rows="4" '+(f.obrigatorio?'required':'')+'></textarea>'
        : '<input name="'+escape(f.campo)+'" type="'+allowedInputType(f.tipo)+'" maxlength="1500" '+(f.obrigatorio?'required':'')+' />')+
      '</label>').join('')+
      '<button type="submit">Salvar e visualizar</button></form><p id="document-feedback" role="status"></p></section>';
    area.scrollIntoView({behavior:'smooth',block:'start'});
    if(existing?.dados)for(const [key,val] of Object.entries(existing.dados)){
      const input=document.getElementById('document-form').elements.namedItem(key);
      if(input)input.value=String(val??'');
    }
    document.getElementById('document-form').onsubmit=async e=>{
      e.preventDefault();
      const button=e.currentTarget.querySelector('button[type=submit]');
      const payload={};
      for(const f of m.campos||[]){
        const input=e.currentTarget.elements.namedItem(f.campo);
        payload[f.campo]=input?.value?.trim()||'';
        if(f.obrigatorio && !payload[f.campo]){
          document.getElementById('document-feedback').textContent='Preencha: '+f.titulo;
          return;
        }
      }
      button.disabled=true;
      const feedback=document.getElementById('document-feedback');
      feedback.textContent='Salvando com segurança...';
      try{
        const saved=await callApi('/requests','POST',{codigo:m.codigo,dados:payload,...(selectedDraft?{id:selectedDraft}:{})});
        selectedDraft=saved.id;
        documents=await callApi('/documents');
        feedback.textContent='Rascunho salvo.';
        showDocumentPreview(m,payload,saved.id);
      }catch(err){feedback.textContent=err.message;}
      finally{button.disabled=false;}
    };
    notice('');
  }catch(err){notice(err.message);}
}
function showDocumentPreview(m,dados,id) {
  const area=document.getElementById('preview-area') || document.createElement('section');
  area.id='preview-area';
  const printRows=(m.campos||[]).map(f=>'<div class="print-row"><strong>'+escape(f.titulo)+':</strong> <span>'+escape(dados[f.campo]||'—')+'</span></div>').join('');
  area.innerHTML=
    '<section class="panel"><h2>Pré-visualização</h2>'+
    '<p>Rascunho de documento particular. Confira os dados antes de imprimir.</p>'+
    '<div id="print-sheet"><div class="print-title">DOCUMENTO PARTICULAR</div>'+
    '<h2>'+escape(m.nome)+'</h2>'+
    '<p>Registro particular preparado pelo titular das informações. Não é documento oficial, não substitui segunda via e não comprova emissão por órgão público.</p>'+
    printRows+
    '<p class="print-footer">Rascunho ID: '+escape(id)+'<br>Emitido para conferência em '+escape(new Date().toLocaleDateString('pt-BR'))+'.</p></div>'+
    '<div class="actions"><button type="button" id="print-document">Imprimir / salvar em PDF</button>'+
    '<button type="button" id="edit-document">Editar dados</button></div></section>';
  document.getElementById('details').appendChild(area);
  document.getElementById('print-document').onclick=()=>window.print();
  document.getElementById('edit-document').onclick=()=>{document.getElementById('edit-form-panel')?.scrollIntoView({behavior:'smooth'});};
  area.scrollIntoView({behavior:'smooth'});
}
async function openSavedDocument(id) {
  try {
    notice('Carregando rascunho...');
    const entry=await callApi('/requests/'+encodeURIComponent(id));
    await openForm(entry.codigo,entry);
    showDocumentPreview(selectedModule,entry.dados,entry.id);
  } catch(err){ notice(err.message);}
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
      await openForm(b.dataset.code);
    });
  }
  if(view==='documentos') {
    body.innerHTML=`<div class="panel"><h2>Minhas solicitações e rascunhos</h2><p>Abra seus registros para editar ou imprimir documentos particulares.</p>${documents.length?documents.map(d=>`<div class="saved-item"><span>${escape(d.estado)} · ${escape(new Date(d.criado_em).toLocaleDateString('pt-BR'))}</span><button data-open="${escape(d.id)}">Abrir</button></div>`).join(''):'<p>Nenhum rascunho salvo ainda.</p>'}</div>`;
    document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openSavedDocument(b.dataset.open));
  }
  if(view==='conta') body.innerHTML=`<div class="panel"><h2>Informações da conta</h2><p>Nome: ${escape(account?.nome||'Não informado')}</p><p>Status: ${escape(account?.status||'Aguardando perfil')}</p><p>Permissões: ${escape((account?.papeis||[]).join(', ')||'Usuário')}</p></div>`;
}
