"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Users, Bell, Search, Plus, MapPin, History, Check, Clock3, LayoutDashboard, X, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dateLabel, nextDueDate, isoWeek } from "@/lib/dates";

type Client = {
  id: string; name: string; zone: "Norte" | "Sul/Ilhas"; address: string | null;
  phone: string | null; email: string | null; notes: string | null;
};
type Schedule = {
  id: string; client_id: string; user_id: string; frequency: "weekly" | "fortnightly" | "monthly";
  last_visit_date: string | null; next_due_date: string | null; notes: string | null;
};
type Visit = { id: string; client_id: string; user_id: string; visit_date: string; notes: string | null; profiles?: { display_name: string | null } | null };

const frequencyName: Record<Schedule["frequency"], string> = { weekly: "Semanal", fortnightly: "Quinzenal", monthly: "Mensal" };
const demoClients: Client[] = [
  { id: "demo-1", name: "Cliente Exemplo Norte", zone: "Norte", address: "Porto", phone: null, email: null, notes: "Cliente de demonstração" },
  { id: "demo-2", name: "Cliente Exemplo Sul", zone: "Sul/Ilhas", address: "Faro", phone: null, email: null, notes: null }
];

export default function Home() {
  const [tab, setTab] = useState<"dashboard"|"calendar"|"clients">("dashboard");
  const [clients, setClients] = useState<Client[]>(demoClients);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [message, setMessage] = useState("Modo demonstração: liga o Supabase para partilhar dados entre utilizadores.");
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState("Todas");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newClient, setNewClient] = useState({ name: "", zone: "Norte", address: "", phone: "", email: "", notes: "" });
  const [frequency, setFrequency] = useState<Schedule["frequency"]>("fortnightly");
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0,10));
  const [visitNotes, setVisitNotes] = useState("");
  const [scheduleClient, setScheduleClient] = useState("");
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0,10));

  async function loadData(uid: string) {
    if (!supabase) return;
    const [c, s, v] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("visit_schedules").select("*").eq("user_id", uid).order("next_due_date"),
      supabase.from("visits").select("*, profiles(display_name)").order("visit_date", { ascending: false })
    ]);
    if (c.data) setClients(c.data as Client[]);
    if (s.data) setSchedules(s.data as Schedule[]);
    if (v.data) setVisits(v.data as Visit[]);
    if (c.error || s.error || v.error) setMessage("Alguns dados não foram carregados. Confirma as políticas e tabelas do Supabase.");
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id;
      if (uid) { setUserId(uid); loadData(uid); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (uid) loadData(uid);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const filteredClients = useMemo(() => clients.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) &&
    (zoneFilter === "Todas" || c.zone === zoneFilter)
  ), [clients, query, zoneFilter]);

  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? "Cliente";
  const upcoming = schedules.filter(s => s.next_due_date).sort((a,b) => (a.next_due_date || "").localeCompare(b.next_due_date || "")).slice(0,8);
  const weekNow = isoWeek(new Date()).week;

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); if (!supabase) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : "Sessão iniciada.");
    setAuthBusy(false);
  }
  async function signUp() {
    if (!supabase) return;
    setAuthBusy(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setMessage(error ? error.message : "Conta criada. Se a confirmação por email estiver ativa, confirma o endereço antes de iniciar sessão.");
    setAuthBusy(false);
  }
  async function signOut() { if (supabase) await supabase.auth.signOut(); setUserId(null); setSchedules([]); setVisits([]); }

  async function addClient(e: React.FormEvent) {
    e.preventDefault();
    const item = { name: newClient.name.trim(), zone: newClient.zone, address: newClient.address || null, phone: newClient.phone || null, email: newClient.email || null, notes: newClient.notes || null };
    if (!item.name) return;
    if (!supabase || !userId) {
      const c: Client = { ...item, id: "demo-" + Date.now() } as Client;
      setClients(old => [...old, c]); setMessage("Cliente criado apenas nesta demonstração. Liga o Supabase para o partilhar com a equipa.");
    } else {
      const { data, error } = await supabase.from("clients").insert({ ...item, created_by: userId }).select().single();
      if (error) { setMessage("Erro ao criar cliente: " + error.message); return; }
      if (data) setClients(old => [...old, data as Client]);
      setMessage("Cliente adicionado à base de dados partilhada.");
    }
    setNewClient({ name: "", zone: "Norte", address: "", phone: "", email: "", notes: "" }); setShowAdd(false);
  }

  async function addSchedule(e: React.FormEvent) {
    e.preventDefault(); if (!scheduleClient) return;
    const due = nextDueDate(new Date(scheduleDate + "T12:00:00"), frequency).toISOString().slice(0,10);
    if (!supabase || !userId) {
      setMessage("Para guardar periodicidades e calendários entre sessões, configura o Supabase e inicia sessão."); return;
    }
    const { data, error } = await supabase.from("visit_schedules").upsert({
      client_id: scheduleClient, user_id: userId, frequency, last_visit_date: scheduleDate, next_due_date: due
    }, { onConflict: "client_id,user_id" }).select().single();
    if (error) { setMessage("Erro ao guardar periodicidade: " + error.message); return; }
    setSchedules(old => [...old.filter(x => x.client_id !== scheduleClient), data as Schedule]);
    setMessage("Periodicidade guardada. Próxima visita prevista para " + dateLabel(due) + ".");
  }

  async function markVisited(s: Schedule) {
    if (!supabase || !userId) { setMessage("Liga o Supabase e inicia sessão para registar visitas permanentes."); return; }
    const actual = new Date().toISOString().slice(0,10);
    const { error: visitError } = await supabase.from("visits").insert({ client_id: s.client_id, user_id: userId, visit_date: actual, notes: null });
    if (visitError) { setMessage("Erro ao registar visita: " + visitError.message); return; }
    const due = nextDueDate(new Date(actual + "T12:00:00"), s.frequency).toISOString().slice(0,10);
    const { data, error } = await supabase.from("visit_schedules").update({ last_visit_date: actual, next_due_date: due }).eq("id", s.id).select().single();
    if (error) { setMessage("Visita registada, mas não foi possível atualizar a próxima data: " + error.message); return; }
    setSchedules(old => old.map(x => x.id === s.id ? data as Schedule : x));
    const v = await supabase.from("visits").select("*, profiles(display_name)").order("visit_date", { ascending: false });
    if (v.data) setVisits(v.data as Visit[]);
    setMessage("Visita registada. Próxima visita: " + dateLabel(due) + ".");
  }

  async function addAdHocVisit(e: React.FormEvent) {
    e.preventDefault(); if (!supabase || !userId || !selectedClient) return;
    const { error } = await supabase.from("visits").insert({ client_id: selectedClient.id, user_id: userId, visit_date: visitDate, notes: visitNotes || null });
    if (error) { setMessage("Erro ao registar visita: " + error.message); return; }
    const { data } = await supabase.from("visits").select("*, profiles(display_name)").eq("client_id", selectedClient.id).order("visit_date", { ascending: false });
    if (data) setVisits(old => [...old.filter(v => v.client_id !== selectedClient.id), ...(data as Visit[])]);
    setVisitNotes(""); setMessage("Visita adicionada ao histórico.");
  }

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><CalendarDays size={22}/></div><div><strong>VisitaPro</strong><small>Gestão de visitas</small></div></div>
      <nav>
        <button className={tab==="dashboard"?"nav-item active":"nav-item"} onClick={()=>setTab("dashboard")}><LayoutDashboard size={18}/> Painel</button>
        <button className={tab==="calendar"?"nav-item active":"nav-item"} onClick={()=>setTab("calendar")}><CalendarDays size={18}/> Calendário</button>
        <button className={tab==="clients"?"nav-item active":"nav-item"} onClick={()=>setTab("clients")}><Users size={18}/> Clientes <span className="nav-count">{clients.length}</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="status-dot"/><span>{userId ? "Ligado à conta" : "Modo demonstração"}</span></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div><p className="eyebrow">GESTÃO OPERACIONAL</p><h1>{tab==="dashboard"?"O teu painel":tab==="calendar"?"Calendário de visitas":"Base de clientes"}</h1></div><div className="top-actions"><span className="today-label">{new Date().toLocaleDateString("pt-PT",{weekday:"short",day:"numeric",month:"short"})}</span>{userId ? <button className="button secondary" onClick={signOut}>Terminar sessão</button> : <button className="button secondary" onClick={()=>document.getElementById("auth-panel")?.scrollIntoView({behavior:"smooth"})}>Iniciar sessão</button>}<button className="button primary" onClick={()=>setShowAdd(true)}><Plus size={17}/> Novo cliente</button></div></header>
      <div className="notice"><span className="notice-icon"><Bell size={17}/></span><span>{message}</span><button aria-label="Fechar aviso" onClick={()=>setMessage("")}><X size={15}/></button></div>

      {!userId && <section className="auth-panel card" id="auth-panel"><div><h2>Entrar na tua equipa</h2><p>Configura o Supabase para ativar contas e sincronização real entre utilizadores.</p></div><form onSubmit={signIn} className="auth-form"><input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required/><input type="password" placeholder="Palavra-passe" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required/><div className="auth-buttons"><button className="button primary" disabled={authBusy}>Entrar</button><button type="button" className="button secondary" onClick={signUp} disabled={authBusy}>Criar conta</button></div></form></section>}

      {tab==="dashboard" && <>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-icon blue"><CalendarDays size={20}/></div><span>Clientes registados</span><strong>{clients.length}</strong><small>Na base partilhada</small></div>
          <div className="stat-card"><div className="stat-icon amber"><Clock3 size={20}/></div><span>Visitas planeadas</span><strong>{schedules.length}</strong><small>Na tua agenda</small></div>
          <div className="stat-card"><div className="stat-icon green"><Check size={20}/></div><span>Visitas registadas</span><strong>{visits.filter(v=>v.user_id===userId).length}</strong><small>Histórico pessoal</small></div>
          <div className="stat-card"><div className="stat-icon purple"><Bell size={20}/></div><span>Semana atual</span><strong>{weekNow}</strong><small>Numeração ISO</small></div>
        </div>
        <div className="content-grid">
          <section className="card"><div className="section-heading"><div><h2>Próximas visitas</h2><p>As próximas tarefas da tua agenda</p></div><button className="text-button" onClick={()=>setTab("calendar")}>Ver calendário →</button></div>
            {upcoming.length===0 ? <div className="empty-state"><CalendarDays size={28}/><strong>Ainda não tens visitas planeadas</strong><span>Escolhe um cliente e define a periodicidade no separador Calendário.</span><button className="button secondary" onClick={()=>setTab("calendar")}>Planear visita</button></div> : <div className="visit-list">{upcoming.map(s=><div className="visit-row" key={s.id}><div className="date-tile"><strong>{s.next_due_date ? new Date(s.next_due_date+"T12:00:00").getDate() : "—"}</strong><span>{s.next_due_date ? new Date(s.next_due_date+"T12:00:00").toLocaleDateString("pt-PT",{month:"short"}) : ""}</span></div><div className="visit-info"><strong>{clientName(s.client_id)}</strong><span>{frequencyName[s.frequency]} · {s.next_due_date ? dateLabel(s.next_due_date) : "Sem data"}</span></div><button className="icon-button" title="Marcar como realizada" onClick={()=>markVisited(s)}><Check size={18}/></button></div>)}</div>}
          </section>
          <section className="card"><div className="section-heading"><div><h2>Acesso rápido</h2><p>Encontra o que precisas</p></div></div><button className="quick-link" onClick={()=>setTab("clients")}><Users size={19}/><span><strong>Pesquisar clientes</strong><small>Nome, zona e dados de contacto</small></span><span>→</span></button><button className="quick-link" onClick={()=>setTab("calendar")}><CalendarDays size={19}/><span><strong>Planear periodicidade</strong><small>Semanal, quinzenal ou mensal</small></span><span>→</span></button><button className="quick-link" onClick={()=>setShowAdd(true)}><Plus size={19}/><span><strong>Adicionar cliente</strong><small>Disponível para a equipa toda</small></span><span>→</span></button><div className="tip-box"><strong>Nota</strong><p>As notificações push precisam de configuração adicional no servidor. Este MVP prepara a estrutura e a lógica das visitas.</p></div></section>
        </div>
      </>}

      {tab==="clients" && <section className="card"><div className="section-heading"><div><h2>Todos os clientes</h2><p>Base de dados partilhada da equipa</p></div><button className="button primary" onClick={()=>setShowAdd(true)}><Plus size={16}/> Adicionar cliente</button></div><div className="filters"><div className="search-box"><Search size={17}/><input placeholder="Pesquisar por nome..." value={query} onChange={e=>setQuery(e.target.value)}/></div><select value={zoneFilter} onChange={e=>setZoneFilter(e.target.value)}><option>Todas</option><option>Norte</option><option>Sul/Ilhas</option></select></div><div className="client-table"><div className="table-head"><span>Cliente</span><span>Zona</span><span>Morada</span><span>Histórico</span></div>{filteredClients.map(c=><button className="client-row" key={c.id} onClick={()=>setSelectedClient(c)}><span className="client-name"><span className="avatar">{c.name.slice(0,1).toUpperCase()}</span><strong>{c.name}</strong></span><span><i className={c.zone==="Norte"?"zone-dot north":"zone-dot south"}/>{c.zone}</span><span>{c.address||"—"}</span><span className="history-link"><History size={15}/> Ver perfil</span></button>)}{filteredClients.length===0&&<div className="empty-state">Não foram encontrados clientes.</div>}</div></section>}

      {tab==="calendar" && <div className="content-grid"><section className="card"><div className="section-heading"><div><h2>Planear visitas</h2><p>Define a periodicidade de um cliente na tua agenda</p></div><RefreshCw size={19}/></div><form className="stack-form" onSubmit={addSchedule}><label>Cliente<select required value={scheduleClient} onChange={e=>setScheduleClient(e.target.value)}><option value="">Selecionar cliente...</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Data da última visita realizada<input type="date" required value={scheduleDate} onChange={e=>setScheduleDate(e.target.value)}/></label><label>Periodicidade<select value={frequency} onChange={e=>setFrequency(e.target.value as Schedule["frequency"])}><option value="weekly">Semanal</option><option value="fortnightly">Quinzenal</option><option value="monthly">Mensal</option></select></label><button className="button primary" type="submit">Guardar na minha agenda</button></form><div className="tip-box"><strong>Como funciona</strong><p>A periodicidade semanal e quinzenal usa semanas ISO. A mensal procura o mesmo dia do mês seguinte (ou o último dia se esse dia não existir).</p></div></section><section className="card"><div className="section-heading"><div><h2>A minha agenda</h2><p>Visitas previstas por ordem de data</p></div></div>{schedules.length===0?<div className="empty-state"><CalendarDays size={28}/><strong>Sem visitas planeadas</strong><span>As visitas que definires aparecerão aqui.</span></div>:<div className="visit-list">{[...schedules].sort((a,b)=>(a.next_due_date||"").localeCompare(b.next_due_date||"")).map(s=><div className="visit-row" key={s.id}><div className="date-tile"><strong>{s.next_due_date?new Date(s.next_due_date+"T12:00:00").getDate():"—"}</strong><span>{s.next_due_date?new Date(s.next_due_date+"T12:00:00").toLocaleDateString("pt-PT",{month:"short"}):""}</span></div><div className="visit-info"><strong>{clientName(s.client_id)}</strong><span>{frequencyName[s.frequency]} · {s.next_due_date?dateLabel(s.next_due_date):"Sem data"}</span></div><button className="icon-button" title="Marcar visita realizada hoje" onClick={()=>markVisited(s)}><Check size={18}/></button></div>)}</div>}</section></div>}

      {showAdd && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowAdd(false)}}><section className="modal card"><div className="modal-heading"><div><h2>Novo cliente</h2><p>O cliente fica disponível para toda a equipa.</p></div><button className="icon-button" onClick={()=>setShowAdd(false)}><X size={19}/></button></div><form className="stack-form" onSubmit={addClient}><label>Nome do cliente *<input required value={newClient.name} onChange={e=>setNewClient({...newClient,name:e.target.value})} placeholder="Nome da empresa ou cliente"/></label><label>Zona *<select value={newClient.zone} onChange={e=>setNewClient({...newClient,zone:e.target.value})}><option>Norte</option><option>Sul/Ilhas</option></select></label><label>Morada<input value={newClient.address} onChange={e=>setNewClient({...newClient,address:e.target.value})} placeholder="Rua, código postal, localidade"/></label><div className="two-fields"><label>Telefone<input value={newClient.phone} onChange={e=>setNewClient({...newClient,phone:e.target.value})}/></label><label>Email<input type="email" value={newClient.email} onChange={e=>setNewClient({...newClient,email:e.target.value})}/></label></div><label>Notas<textarea rows={3} value={newClient.notes} onChange={e=>setNewClient({...newClient,notes:e.target.value})}/></label><div className="modal-actions"><button type="button" className="button secondary" onClick={()=>setShowAdd(false)}>Cancelar</button><button className="button primary">Guardar cliente</button></div></form></section></div>}

      {selectedClient && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedClient(null)}}><section className="modal card"><div className="modal-heading"><div><p className="eyebrow">PERFIL DO CLIENTE</p><h2>{selectedClient.name}</h2><p><MapPin size={14} style={{display:"inline",verticalAlign:"middle"}}/> {selectedClient.zone} · {selectedClient.address||"Morada não indicada"}</p></div><button className="icon-button" onClick={()=>setSelectedClient(null)}><X size={19}/></button></div><div className="profile-details"><span>Telefone<strong>{selectedClient.phone||"—"}</strong></span><span>Email<strong>{selectedClient.email||"—"}</strong></span><span>Notas<strong>{selectedClient.notes||"—"}</strong></span></div><div className="section-heading"><div><h3>Histórico de visitas</h3><p>Visitas registadas por todos os utilizadores</p></div></div><div className="history-list">{visits.filter(v=>v.client_id===selectedClient.id).map(v=><div className="history-entry" key={v.id}><div className="history-check"><Check size={15}/></div><div><strong>{dateLabel(v.visit_date)}</strong><span>{v.profiles?.display_name||"Utilizador da equipa"}</span>{v.notes&&<p>{v.notes}</p>}</div></div>)}{visits.filter(v=>v.client_id===selectedClient.id).length===0&&<p className="muted">Ainda não há visitas registadas para este cliente.</p>}</div><form className="stack-form visit-form" onSubmit={addAdHocVisit}><h3>Registar visita realizada</h3><label>Data<input type="date" required value={visitDate} onChange={e=>setVisitDate(e.target.value)}/></label><label>Notas da visita<textarea rows={2} value={visitNotes} onChange={e=>setVisitNotes(e.target.value)} placeholder="O que foi feito, problemas encontrados..."/></label><button className="button primary" type="submit" disabled={!userId}>Adicionar ao histórico</button>{!userId&&<small>Inicia sessão e configura a base de dados para registar visitas.</small>}</form></section></div>}
    </section>
  </main>;
}
