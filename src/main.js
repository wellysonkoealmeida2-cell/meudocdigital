import { createClient } from '@supabase/supabase-js';
import './style.css';

const root = document.getElementById('app');
const endpoint = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const apiRoot = endpoint + '/functions/v1/meu-sistema-api';
const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let supabase, view = 'inicio', catalog = [], account = null, balance = {creditos:0}, documents = [], adminPage='overview', adminData=null, searchTerm='', currentCategory='Todas';

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
      callApi('/me'), callApi('/modules'), callApi('/credits'), callApi('/my-status')
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
    if(existing?.andamento && existing.andamento!=='rascunho'){
      document.querySelectorAll('#document-form input,#document-form textarea,#document-form button').forEach(el=>el.disabled=true);
      const f=document.getElementById('document-feedback');
      if(f)f.textContent='Atendimento '+decorateStatus(existing.andamento)+'. Os dados ficam bloqueados após o envio.';
    }
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
        documents=await callApi('/my-status');
        feedback.textContent='Rascunho salvo.';
        showDocumentPreview(m,payload,saved.id);
      }catch(err){feedback.textContent=err.message;}
      finally{button.disabled=false;}
    };
    notice('');
  }catch(err){notice(err.message);}
}
function showDocumentPreview(m,dados,id,andamento='rascunho') {
  const area=document.getElementById('preview-area') || document.createElement('section');
  area.id='preview-area';
  const printRows=(m.campos||[]).map(f=>'<div class="print-row"><strong>'+escape(f.titulo)+':</strong> <span>'+escape(dados[f.campo]||'—')+'</span></div>').join('');
  area.innerHTML=
    '<section class="panel"><h2>Pré-visualização</h2>'+
    '<p>Confira os dados antes de imprimir. O arquivo é particular e não substitui documentos emitidos pelos órgãos competentes.</p>'+
    '<div id="print-sheet"><div class="print-title">'+(m.finalidade==='orientacao'?'FICHA PARTICULAR DE ATENDIMENTO':'DOCUMENTO PARTICULAR')+'</div>'+
    '<h2>'+escape(m.nome)+'</h2>'+
    '<p>'+(m.finalidade==='orientacao'?'Resumo de atendimento particular sobre recuperação de documento perdido. Não é solicitação protocolada, nem substitui o procedimento junto ao órgão responsável.':'Registro particular preparado pelo declarante. Não é documento oficial, não substitui segunda via e não comprova emissão por órgão público.')+'</p>'+
    printRows+
    '<p class="print-footer">Registro interno: '+escape(id)+'<br>Emitido para conferência em '+escape(new Date().toLocaleDateString('pt-BR'))+'.</p></div>'+
    '<div class="actions"><button type="button" id="print-document">Imprimir / salvar em PDF</button>'+ 
    (andamento==='rascunho'?'<button type="button" id="send-request">Enviar à consultoria</button>':'<span class="subtle">Andamento: '+escape(decorateStatus(andamento))+'</span>')+
    '<button type="button" id="edit-document">Editar dados</button></div></section>';
  document.getElementById('details').appendChild(area);
  document.getElementById('print-document').onclick=()=>window.print();
  const send=document.getElementById('send-request');
  if(send)send.onclick=async()=>{
    if(!confirm('Enviar esta solicitação à consultoria? Após o envio, o rascunho ficará bloqueado para edição.'))return;
    send.disabled=true;send.textContent='Enviando...';
    try{
      await callApi('/requests/'+encodeURIComponent(id)+'/submit','POST',{});
      documents=await callApi('/my-status');
      notice('Solicitação recebida pela consultoria. Acompanhe em Solicitações.');
      send.replaceWith(Object.assign(document.createElement('span'),{textContent:'Enviado para análise'}));
    }catch(err){notice(err.message);send.disabled=false;send.textContent='Enviar à consultoria';}
  };
  document.getElementById('edit-document').onclick=()=>{document.getElementById('edit-form-panel')?.scrollIntoView({behavior:'smooth'});};
  area.scrollIntoView({behavior:'smooth'});
}
async function openSavedDocument(id) {
  try {
    notice('Carregando rascunho...');
    const entry=await callApi('/requests/'+encodeURIComponent(id));
    await openForm(entry.codigo,entry);
    showDocumentPreview(selectedModule,entry.dados,entry.id,entry.andamento||'rascunho');
  } catch(err){ notice(err.message);}
}


const isAdmin=()=>Boolean(account?.papeis?.includes('admin'));
function formatDate(value){try{return new Date(value).toLocaleDateString('pt-BR')}catch{return '—'}}
function decorateStatus(status){
 const map={rascunho:'Rascunho',recebido:'Recebido',em_analise:'Em análise',aguardando_cliente:'Aguardando cliente',orientado:'Orientação enviada',concluido:'Concluído',cancelado:'Cancelado'};
 return map[status]||status||'Rascunho';
}
async function loadAdmin(page='overview'){
 if(!isAdmin())return notice('Acesso restrito ao administrador');
 adminPage=page;view='admin';render();
 const el=document.getElementById('admin-body');
 if(el)el.innerHTML='<div class="panel">Carregando administração...</div>';
 try{
  const route={overview:'/admin/summary',models:'/admin/catalog',requests:'/admin/requests',users:'/admin/clients'}[page];
  adminData=await callApi(route);
  renderAdmin();
 }catch(e){notice(e.message);}
}
function renderAdmin(){
 const area=document.getElementById('admin-body');if(!area)return;
 const names={overview:'Indicadores',models:'Modelos e serviços',requests:'Solicitações',users:'Clientes'};
 if(adminPage==='overview'){
  const d=adminData||{};
  area.innerHTML='<div class="stats">'+[
    ['Clientes',d.usuarios],['Serviços ativos',d.modelos_ativos],['Solicitações',d.solicitacoes],['Em análise',d.em_analise]
  ].map(([name,value])=>'<article><p>'+escape(name)+'</p><strong>'+Number(value||0)+'</strong></article>').join('')+'</div>'+
  '<div class="panel"><h2>Gestão da consultoria</h2><p>Use as abas acima para cadastrar serviços, acompanhar pedidos e consultar clientes. Documentos oficiais são solicitados junto aos órgãos competentes.</p></div>';
 }
 if(adminPage==='models'){
  const items=Array.isArray(adminData)?adminData:[];
  area.innerHTML='<div class="panel"><h2>Cadastrar serviço ou modelo</h2><p>Campos: uma linha por campo, no formato codigo|Título|text,textarea,date ou currency|sim ou nao. Por segurança, novos serviços começam desativados até sua revisão.</p>'+
  '<form id="module-form" class="admin-form"><div class="two-cols">'+
  '<label>Código único<input name="codigo" required pattern="[a-z0-9_-]{2,64}" placeholder="solicitacao-nova"></label>'+
  '<label>Nome do serviço<input name="nome" required maxlength="100"></label>'+
  '<label>Categoria<input name="categoria" required value="Serviços de consultoria"></label>'+
  '<label>Finalidade<select name="finalidade"><option value="orientacao">Orientação de segunda via</option><option value="particular">Documento particular</option></select></label>'+
  '<label>Créditos (sem cobrança automática)<input name="preco_creditos" type="number" min="0" max="5000" value="0"></label></div>'+
  '<label>Descrição<textarea name="descricao" maxlength="800" rows="3"></textarea></label>'+
  '<label>Campos (um por linha)<textarea name="campos" rows="5" placeholder="nome|Nome completo|text|sim&#10;contato|Telefone|text|sim&#10;relato|Descrição da solicitação|textarea|sim"></textarea></label>'+
  '<button type="submit">Salvar modelo</button><p id="module-feedback" role="status"></p></form></div>'+
  '<div class="panel"><h2>Serviços cadastrados ('+items.length+')</h2>'+
  items.map(m=>'<div class="saved-item"><div><strong>'+escape(m.nome)+'</strong><div class="subtle">'+escape(m.categoria)+' · '+escape(m.finalidade)+' · '+Number(m.preco_creditos||0)+' créditos</div></div><div class="actions"><button class="small-btn" data-edit="'+escape(m.codigo)+'">Editar</button><button class="small-btn" data-toggle="'+escape(m.codigo)+'" data-active="'+Boolean(m.ativo)+'">'+(m.ativo?'Desativar':'Ativar')+'</button></div></div>').join('')+'</div>';
  const form=document.getElementById('module-form');
  form.onsubmit=async e=>{
   e.preventDefault();
   const fd=new FormData(form);
   const fields=String(fd.get('campos')||'').split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{
    const [campo,titulo,tipo,obrigatorio]=line.split('|').map(x=>x?.trim());
    return {campo,titulo,tipo:tipo||'text',obrigatorio:(obrigatorio||'').toLowerCase()==='sim'};
   });
   if(!fields.length)return document.getElementById('module-feedback').textContent='Adicione pelo menos um campo.';
   try{
    await callApi('/admin/save-module','POST',{
     codigo:String(fd.get('codigo')||''),nome:String(fd.get('nome')||''),categoria:String(fd.get('categoria')||''),
     descricao:String(fd.get('descricao')||''),finalidade:String(fd.get('finalidade')||'orientacao'),
     preco_creditos:Number(fd.get('preco_creditos')||0),campos:fields
    });
    notice('Serviço salvo. Se for novo, ficará desativado até sua revisão.');
    catalog=await callApi('/modules');await loadAdmin('models');
   }catch(err){document.getElementById('module-feedback').textContent=err.message;}
  };
  document.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>{
   const item=items.find(x=>x.codigo===btn.dataset.edit);if(!item)return;
   for(const field of ['codigo','nome','categoria','descricao','finalidade','preco_creditos'])form.elements.namedItem(field).value=item[field]??'';
   form.elements.namedItem('campos').value=(item.esquema_campos||[]).map(f=>[f.campo,f.titulo,f.tipo,f.obrigatorio?'sim':'nao'].join('|')).join('\n');
   form.scrollIntoView({behavior:'smooth'});
  });
  document.querySelectorAll('[data-toggle]').forEach(btn=>btn.onclick=async()=>{
   try{
    await callApi('/admin/toggle-module','POST',{codigo:btn.dataset.toggle,ativo:btn.dataset.active!=='true'});
    catalog=await callApi('/modules');await loadAdmin('models');
   }catch(e){notice(e.message);}
  });
 }
 if(adminPage==='requests'){
  const items=Array.isArray(adminData)?adminData:[];
  const choices=['recebido','em_analise','aguardando_cliente','orientado','concluido','cancelado'];
  area.innerHTML='<div class="panel"><h2>Atendimentos ('+items.length+')</h2><p>Atualize o andamento de cada solicitação. Dados completos do cliente não são exibidos nessa listagem.</p>'+
  (items.map(d=>'<div class="saved-item"><div><strong>'+escape(d.servico||'Solicitação')+'</strong><div class="subtle">'+escape(d.cliente||'Cliente')+' · '+formatDate(d.criado_em)+'</div></div><div><select data-status="'+escape(d.id)+'">'+choices.map(s=>'<option value="'+s+'" '+(s===d.andamento?'selected':'')+'>'+decorateStatus(s)+'</option>').join('')+'</select></div></div>').join('')||'<p>Nenhum atendimento.</p>')+'</div>';
  document.querySelectorAll('[data-status]').forEach(sel=>sel.onchange=async()=>{
   try{await callApi('/admin/request-status','POST',{id:sel.dataset.status,andamento:sel.value});notice('Andamento atualizado');}
   catch(e){notice(e.message);await loadAdmin('requests');}
  });
 }
 if(adminPage==='users'){
  const items=Array.isArray(adminData)?adminData:[];
  area.innerHTML='<div class="panel"><h2>Clientes cadastrados ('+items.length+')</h2><p>Ajustes de créditos são manuais e auditáveis. Eles não representam pagamentos Pix confirmados.</p>'+
  items.map(p=>'<div class="saved-item"><div><strong>'+escape(p.nome||'Conta cadastrada')+'</strong><div class="subtle">ID: '+escape(p.user_id)+' · '+escape(p.status)+' · '+Number(p.creditos||0)+' créditos</div></div><div class="actions"><button class="small-btn" data-credit="'+escape(p.user_id)+'">Ajustar créditos</button><button class="small-btn" data-client="'+escape(p.user_id)+'" data-status="'+escape(p.status)+'">'+(p.status==='bloqueado'?'Ativar':'Bloquear')+'</button></div></div>').join('')+'</div>';
  document.querySelectorAll('[data-client]').forEach(btn=>btn.onclick=async()=>{
   const status=btn.dataset.status==='bloqueado'?'ativo':'bloqueado';
   if(!confirm('Alterar o acesso deste cliente no Meu Sistema para '+status+'?'))return;
   try{
    await callApi('/admin/set-client','POST',{user_id:btn.dataset.client,status});
    notice('Acesso atualizado no Meu Sistema');await loadAdmin('users');
   }catch(e){notice(e.message);}
  });
  document.querySelectorAll('[data-credit]').forEach(btn=>btn.onclick=async()=>{
   const answer=prompt('Quantidade a adicionar (negativa para retirar). Limite de 10.000 por ajuste:');
   if(answer===null)return;
   const delta=Number(answer);
   if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>10000)return notice('Valor inválido');
   const reference='manual-'+crypto.randomUUID();
   try{await callApi('/admin/adjust-credits','POST',{user_id:btn.dataset.credit,delta,referencia:reference});notice('Ajuste registrado em histórico');await loadAdmin('users');}
   catch(e){notice(e.message);}
  });
 }
}

const tabs=[['inicio','Visão geral'],['catalogo','Catálogo'],['documentos','Solicitações'],['conta','Minha conta'], ...(isAdmin()?[['admin','Administração']]:[])];
function render() {
  root.innerHTML=`<div class="layout">
    <aside class="sidebar"><div class="logo">MEU <span>SISTEMA</span></div><div class="eyebrow">CENTRAL DE DOCUMENTOS</div>
      <nav>${tabs.map(([id,name])=>`<button data-tab="${id}" class="${view===id?'current':''}">${name}</button>`).join('')}</nav>
      <button id="logout" class="logout">Sair</button>
    </aside>
    <main class="content"><header><div class="eyebrow">PAINEL DO CLIENTE</div><h1>${tabs.find(t=>t[0]===view)[1]}</h1></header><section id="body"></section><p id="notice" role="status"></p></main>
  </div>`;
  document.getElementById('logout').onclick=()=>supabase.auth.signOut();
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{view=b.dataset.tab;if(view==='admin')loadAdmin(adminPage);else render();});
  const body=document.getElementById('body');
  if(view==='admin'){
    body.innerHTML='<div class="admin-tabs">'+[['overview','Indicadores'],['models','Serviços'],['requests','Atendimentos'],['users','Clientes']].map(([id,name])=>'<button type="button" data-admin="'+id+'" class="small-btn '+(adminPage===id?'current':'')+'">'+name+'</button>').join('')+'</div><section id="admin-body"></section>';
    document.querySelectorAll('[data-admin]').forEach(b=>b.onclick=()=>loadAdmin(b.dataset.admin));
    return;
  }
  if(view==='inicio') body.innerHTML=`<div class="stats"><article><p>Créditos</p><strong>${Number(balance?.creditos)||0}</strong></article><article><p>Modelos disponíveis</p><strong>${catalog.length}</strong></article><article><p>Registros recentes</p><strong>${documents.length}</strong></article></div><div class="panel"><h2>Bem-vindo ao Meu Sistema</h2><p>Explore o catálogo de contratos e declarações particulares. Você já pode salvar rascunhos e usar Imprimir para salvar documentos particulares em PDF. Emissão oficial e pagamentos não estão ativados.</p></div>`;
  if(view==='catalogo') {
    const cats=['Todas',...new Set(catalog.map(m=>m.categoria||'Outros'))];
    const visible=catalog.filter(m=>(currentCategory==='Todas'||(m.categoria||'Outros')===currentCategory)&&
       (m.nome+' '+m.descricao+' '+m.categoria).toLowerCase().includes(searchTerm.toLowerCase()));
    body.innerHTML=`<div class="panel"><h2>Buscar serviços</h2><input id="catalog-search" placeholder="Pesquisar segunda via, certidão, declaração..." value="${escape(searchTerm)}"><div class="category-pills">${cats.map(cat=>`<button class="small-btn ${currentCategory===cat?'current':''}" data-cat="${escape(cat)}">${escape(cat)}</button>`).join('')}</div></div><div class="grid">${visible.map(m=>`<article class="panel"><div class="file-icon">▤</div><h2>${escape(m.nome)}</h2><p>${escape(m.descricao)}</p><p><b>${Number(m.preco_creditos)||0} créditos</b></p><button data-code="${escape(m.codigo)}">Ver campos</button></article>`).join('') || '<p>Não há modelos publicados.</p>'}</div><div id="details"></div>`;
    document.getElementById('catalog-search').oninput=e=>{const pos=e.target.selectionStart;searchTerm=e.target.value;render();const input=document.getElementById('catalog-search');input.focus();input.setSelectionRange(pos,pos);};
    document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{currentCategory=b.dataset.cat;render();});
    document.querySelectorAll('[data-code]').forEach(b=>b.onclick=async()=>{
      await openForm(b.dataset.code);
    });
  }
  if(view==='documentos') {
    body.innerHTML=`<div class="panel"><h2>Minhas solicitações e rascunhos</h2><p>Abra seus registros para editar ou imprimir documentos particulares.</p>${documents.length?documents.map(d=>`<div class="saved-item"><span><strong>${escape(d.nome||'Solicitação')}</strong><span class="subtle">${escape(decorateStatus(d.andamento||d.estado))} · ${escape(new Date(d.criado_em).toLocaleDateString('pt-BR'))}</span></span><button data-open="${escape(d.id)}">Abrir</button></div>`).join(''):'<p>Nenhum rascunho salvo ainda.</p>'}</div>`;
    document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openSavedDocument(b.dataset.open));
  }
  if(view==='conta') {
    body.innerHTML=`<div class="panel"><h2>Informações da conta</h2><p>Nome: ${escape(account?.nome||'Não informado')}</p><p>Status: ${escape(account?.status||'Aguardando perfil')}</p><p>Permissões: ${escape((account?.papeis||[]).join(', ')||'Usuário')}</p><h2>Histórico de créditos</h2><div id="credit-history">Carregando histórico...</div></div>`;
    callApi('/credit-history').then(items=>{
      const area=document.getElementById('credit-history');if(!area)return;
      area.innerHTML=items.length?items.map(x=>`<div class="saved-item"><span>${escape(x.origem)} · ${formatDate(x.criado_em)}</span><strong>${Number(x.delta)>0?'+':''}${Number(x.delta)}</strong></div>`).join(''):'<p>Sem movimentações de créditos.</p>';
    }).catch(err=>{const area=document.getElementById('credit-history');if(area)area.textContent=err.message;});
  }
}
