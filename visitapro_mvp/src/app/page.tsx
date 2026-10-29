"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  CalendarDays, Users, Bell, Search, Plus, MapPin, History, Check,
  Clock3, LayoutDashboard, X, RefreshCw, Bot, Pencil, Database,
  Save, ChevronRight, PauseCircle, PlayCircle, LoaderCircle
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { dateLabel, nextDueDate, isoWeek } from "@/lib/dates";
import preparedInventoryRaw from "@/data/prepared-inventory.json";

type Robot = {
  id: string;
  name: string;
  brand: string;
  model: string;
  serialNumber: string;
  assetNumber?: string;
  active: boolean;
  notes: string;
};
type ClientMeta = {
  notes: string;
  robots: Robot[];
  archived?: boolean;
  archivedReason?: string;
  importVersion?: string;
};
type Client = {
  id: string; name: string; zone: "Norte" | "Sul/Ilhas"; address: string | null;
  phone: string | null; email: string | null; notes: string | null;
  created_by?: string; created_at?: string;
};
type Schedule = {
  id: string; client_id: string; user_id: string; frequency: "weekly" | "fortnightly" | "monthly";
  last_visit_date: string | null; next_due_date: string | null; notes: string | null;
};
type Visit = { id: string; client_id: string; user_id: string; visit_date: string; notes: string | null; profiles?: { display_name: string | null } | null };
type PreparedClient = {
  name: string; aliases: string[]; zone: "Norte" | "Sul/Ilhas"; address: string;
  phone: string; email: string; notes: string; robots: Robot[];
};

type ClientForm = { name: string; zone: "Norte" | "Sul/Ilhas"; address: string; phone: string; email: string; notes: string };
type RobotForm = { name: string; brand: string; model: string; serialNumber: string; assetNumber: string; active: boolean; notes: string };

const META_PREFIX = "[[VISITAPRO_META_V1]]";
const INVENTORY_VERSION = "norte-2026-v1";
const preparedInventory = preparedInventoryRaw as PreparedClient[];
const frequencyName: Record<Schedule["frequency"], string> = { weekly: "Semanal", fortnightly: "Quinzenal", monthly: "Mensal" };
const demoClients: Client[] = [
  { id: "demo-1", name: "Cliente Exemplo Norte", zone: "Norte", address: "Porto", phone: null, email: null, notes: "Cliente de demonstração" },
  { id: "demo-2", name: "Cliente Exemplo Sul", zone: "Sul/Ilhas", address: "Faro", phone: null, email: null, notes: null }
];
const emptyClientForm: ClientForm = { name: "", zone: "Norte", address: "", phone: "", email: "", notes: "" };
const emptyRobotForm: RobotForm = { name: "", brand: "", model: "", serialNumber: "", assetNumber: "", active: true, notes: "" };

function decodeClientMeta(value: string | null | undefined): ClientMeta {
  if (value?.startsWith(META_PREFIX)) {
    try {
      const parsed = JSON.parse(value.slice(META_PREFIX.length)) as Partial<ClientMeta>;
      return {
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        robots: Array.isArray(parsed.robots) ? parsed.robots as Robot[] : [],
        archived: parsed.archived === true,
        archivedReason: typeof parsed.archivedReason === "string" ? parsed.archivedReason : undefined,
        importVersion: typeof parsed.importVersion === "string" ? parsed.importVersion : undefined
      };
    } catch { /* records created before this feature remain ordinary notes */ }
  }
  return { notes: value || "", robots: [], archived: false };
}
function encodeClientMeta(meta: ClientMeta): string {
  return META_PREFIX + JSON.stringify({
    notes: meta.notes || "", robots: meta.robots || [], archived: meta.archived === true,
    ...(meta.archivedReason ? { archivedReason: meta.archivedReason } : {}),
    ...(meta.importVersion ? { importVersion: meta.importVersion } : {})
  });
}
function normalizedName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT").replace(/[^a-z0-9]+/g, " ").trim();
}
function robotCount(clients: Client[]): number {
  return clients.reduce((total, client) => total + decodeClientMeta(client.notes).robots.length, 0);
}
function errorText(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

export default function Home() {
  const [tab, setTab] = useState<"dashboard" | "calendar" | "clients" | "robots">("dashboard");
  const [clients, setClients] = useState<Client[]>(demoClients);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [message, setMessage] = useState("Modo demonstração: liga o Supabase para partilhar dados entre utilizadores.");
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState("Todas");
  const [showAdd, setShowAdd] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [newClient, setNewClient] = useState<ClientForm>(emptyClientForm);
  const [showClientEditor, setShowClientEditor] = useState(false);
  const [clientEditorForm, setClientEditorForm] = useState<ClientForm>(emptyClientForm);
  const [showRobotEditor, setShowRobotEditor] = useState(false);
  const [editingRobotId, setEditingRobotId] = useState<string | null>(null);
  const [robotEditorForm, setRobotEditorForm] = useState<RobotForm>(emptyRobotForm);
  const [frequency, setFrequency] = useState<Schedule["frequency"]>("fortnightly");
  const [visitDate, setVisitDate] = useState(new Date().toISOString().slice(0, 10));
  const [visitNotes, setVisitNotes] = useState("");
  const [scheduleClient, setScheduleClient] = useState("");
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10));

  async function loadData(uid: string) {
    if (!supabase) return;
    const [c, s, v] = await Promise.all([
      supabase.from("clients").select("*").order("name"),
      supabase.from("visit_schedules").select("*").eq("user_id", uid).order("next_due_date"),
      supabase.from("visits").select("*, profiles(display_name)").order("visit_date", { ascending: false })
    ]);
    if (c.data) setClients((c.data as Client[]).filter(client => !decodeClientMeta(client.notes).archived));
    if (s.data) setSchedules(s.data as Schedule[]);
    if (v.data) setVisits(v.data as Visit[]);
    if (c.error || s.error || v.error) setMessage("Alguns dados não foram carregados. Confirma as políticas e tabelas do Supabase.");
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user.id;
      if (uid) { setUserId(uid); void loadData(uid); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      setUserId(uid);
      if (uid) void loadData(uid);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const filteredClients = useMemo(() => clients.filter(c =>
    c.name.toLowerCase().includes(query.toLowerCase()) &&
    (zoneFilter === "Todas" || c.zone === zoneFilter)
  ), [clients, query, zoneFilter]);

  const allRobots = useMemo(() => clients.flatMap(client =>
    decodeClientMeta(client.notes).robots.map(robot => ({ ...robot, clientId: client.id, clientName: client.name }))
  ).filter(robot => {
    const q = query.toLowerCase();
    return !q || [robot.clientName, robot.name, robot.brand, robot.model, robot.serialNumber].some(value => value?.toLowerCase().includes(q));
  }), [clients, query]);

  const clientName = (id: string) => clients.find(c => c.id === id)?.name ?? "Cliente";
  const upcoming = schedules.filter(s => s.next_due_date).sort((a, b) => (a.next_due_date || "").localeCompare(b.next_due_date || "")).slice(0, 8);
  const weekNow = isoWeek(new Date()).week;
  const totalRobots = robotCount(clients);
  const inventoryImported = clients.filter(client => decodeClientMeta(client.notes).importVersion === INVENTORY_VERSION).length >= preparedInventory.length;

  async function signIn(e: FormEvent) {
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
  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setUserId(null); setSchedules([]); setVisits([]); setClients(demoClients);
  }

  async function addClient(e: FormEvent) {
    e.preventDefault();
    const name = newClient.name.trim();
    if (!name) return;
    const meta = encodeClientMeta({ notes: newClient.notes, robots: [] });
    const item = {
      name, zone: newClient.zone, address: newClient.address.trim() || null,
      phone: newClient.phone.trim() || null, email: newClient.email.trim() || null, notes: meta
    };
    if (!supabase || !userId) {
      const c: Client = { ...item, id: "demo-" + Date.now() } as Client;
      setClients(old => [...old, c]); setMessage("Cliente criado apenas nesta demonstração. Inicia sessão para o guardar na base partilhada.");
    } else {
      const { data, error } = await supabase.from("clients").insert({ ...item, created_by: userId }).select().single();
      if (error) { setMessage("Erro ao criar cliente: " + error.message); return; }
      if (data) setClients(old => [...old, data as Client]);
      setMessage("Cliente adicionado à base de dados partilhada.");
    }
    setNewClient(emptyClientForm); setShowAdd(false);
  }

  function openClientEditor(client: Client) {
    const meta = decodeClientMeta(client.notes);
    setClientEditorForm({
      name: client.name, zone: client.zone, address: client.address || "", phone: client.phone || "",
      email: client.email || "", notes: meta.notes
    });
    setShowClientEditor(true);
  }

  async function saveClientEdit(e: FormEvent) {
    e.preventDefault();
    if (!selectedClient || !clientEditorForm.name.trim()) return;
    const previousMeta = decodeClientMeta(selectedClient.notes);
    const updated: Client = {
      ...selectedClient,
      name: clientEditorForm.name.trim(), zone: clientEditorForm.zone,
      address: clientEditorForm.address.trim() || null,
      phone: clientEditorForm.phone.trim() || null,
      email: clientEditorForm.email.trim() || null,
      notes: encodeClientMeta({ ...previousMeta, notes: clientEditorForm.notes, robots: previousMeta.robots })
    };
    if (supabase && userId && !selectedClient.id.startsWith("demo-")) {
      const { error } = await supabase.from("clients").update({
        name: updated.name, zone: updated.zone, address: updated.address, phone: updated.phone,
        email: updated.email, notes: updated.notes
      }).eq("id", selectedClient.id);
      if (error) { setMessage("Erro ao guardar cliente: " + error.message); return; }
      setMessage("Dados do cliente guardados.");
    } else {
      setMessage("Alterações aplicadas apenas nesta demonstração; não ficam guardadas após fechar a página.");
    }
    setClients(old => old.map(client => client.id === updated.id ? updated : client));
    setSelectedClient(updated); setShowClientEditor(false);
  }

  async function persistClientMeta(client: Client, meta: ClientMeta, successMessage: string) {
    const updated: Client = { ...client, notes: encodeClientMeta(meta) };
    if (supabase && userId && !client.id.startsWith("demo-")) {
      const { error } = await supabase.from("clients").update({ notes: updated.notes }).eq("id", client.id);
      if (error) { setMessage("Erro ao guardar dados: " + error.message); return false; }
    } else {
      setMessage("Dados alterados em modo de demonstração. Inicia sessão no Supabase para os guardar permanentemente.");
    }
    setClients(old => old.map(item => item.id === updated.id ? updated : item));
    setSelectedClient(updated);
    setMessage(successMessage);
    return true;
  }

  function openRobotEditor(robot?: Robot) {
    setEditingRobotId(robot?.id ?? null);
    setRobotEditorForm(robot ? {
      name: robot.name || "", brand: robot.brand || "", model: robot.model || "",
      serialNumber: robot.serialNumber || "", assetNumber: robot.assetNumber || "",
      active: robot.active !== false, notes: robot.notes || ""
    } : emptyRobotForm);
    setShowRobotEditor(true);
  }

  async function saveRobot(e: FormEvent) {
    e.preventDefault();
    if (!selectedClient || (!robotEditorForm.name.trim() && !robotEditorForm.model.trim())) return;
    const meta = decodeClientMeta(selectedClient.notes);
    const robot: Robot = {
      id: editingRobotId || `robot-${Date.now()}`,
      name: robotEditorForm.name.trim() || robotEditorForm.model.trim(),
      brand: robotEditorForm.brand.trim(), model: robotEditorForm.model.trim(),
      serialNumber: robotEditorForm.serialNumber.trim(), assetNumber: robotEditorForm.assetNumber.trim(),
      active: robotEditorForm.active, notes: robotEditorForm.notes.trim()
    };
    const robots = editingRobotId ? meta.robots.map(item => item.id === editingRobotId ? robot : item) : [...meta.robots, robot];
    const saved = await persistClientMeta(selectedClient, { ...meta, robots }, editingRobotId ? "Robô atualizado." : "Robô adicionado ao cliente.");
    if (saved) setShowRobotEditor(false);
  }

  async function toggleRobotActive(client: Client, robot: Robot) {
    const meta = decodeClientMeta(client.notes);
    const robots = meta.robots.map(item => item.id === robot.id ? { ...item, active: !item.active } : item);
    await persistClientMeta(client, { ...meta, robots }, robot.active ? "Robô marcado como inativo, sem apagar o registo." : "Robô marcado como ativo.");
  }

  async function importPreparedData() {
    if (importBusy || inventoryImported) return;
    setImportBusy(true);
    try {
      if (!supabase || !userId) {
        const demoSeeded = preparedInventory.map((seed, index) => ({
          id: `demo-seed-${index}-${normalizedName(seed.name).replace(/\s/g, "-")}`,
          name: seed.name, zone: seed.zone, address: seed.address || null,
          phone: seed.phone || null, email: seed.email || null,
          notes: encodeClientMeta({ notes: seed.notes, robots: seed.robots, importVersion: INVENTORY_VERSION })
        } as Client));
        setClients(demoSeeded);
        setMessage(`Carreguei ${demoSeeded.length} clientes e ${robotCount(demoSeeded)} robôs em modo de demonstração. Para guardar permanentemente, inicia sessão no Supabase.`);
        setTab("clients"); setImportBusy(false); return;
      }

      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error || !data) throw new Error(error?.message || "Não foi possível ler os clientes existentes.");
      const existing = data as Client[];
      const activeExisting = existing.filter(client => !decodeClientMeta(client.notes).archived);
      const completed = preparedInventory.every(seed => activeExisting.some(client =>
        normalizedName(client.name) === normalizedName(seed.name) && decodeClientMeta(client.notes).importVersion === INVENTORY_VERSION
      ));
      if (completed) {
        await loadData(userId);
        setMessage("O cadastro preparado já foi importado. Agora podes editar clientes e robôs diretamente nos respetivos perfis.");
        return;
      }

      const consumedIds = new Set<string>();
      const operations: Array<() => Promise<{ ok: boolean; error?: string }>> = [];
      for (const seed of preparedInventory) {
        const aliasNames = new Set([seed.name, ...seed.aliases].map(normalizedName));
        const candidates = activeExisting.filter(client => aliasNames.has(normalizedName(client.name)) && !consumedIds.has(client.id));
        const chosen = candidates.find(client => normalizedName(client.name) === normalizedName(seed.name)) || candidates[0];
        if (chosen) consumedIds.add(chosen.id);
        const meta: ClientMeta = { notes: seed.notes || (chosen ? decodeClientMeta(chosen.notes).notes : ""), robots: seed.robots, importVersion: INVENTORY_VERSION };
        const payload = {
          name: seed.name, zone: seed.zone,
          address: seed.address || chosen?.address || null,
          phone: seed.phone || chosen?.phone || null,
          email: seed.email || chosen?.email || null,
          notes: encodeClientMeta(meta)
        };
        if (chosen) {
  operations.push(async () => {
    if (!supabase) {
      return { ok: false, error: "Supabase não está configurado." };
    }

    const { error: updateError } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", chosen.id);

    return updateError
      ? { ok: false, error: `${seed.name}: ${updateError.message}` }
      : { ok: true };
  });
          for (const duplicate of candidates.filter(client => client.id !== chosen.id)) {
            consumedIds.add(duplicate.id);
            const oldMeta = decodeClientMeta(duplicate.notes);
            const archivedMeta: ClientMeta = {
              ...oldMeta, archived: true, archivedReason: `Registo consolidado em ${seed.name}`,
              notes: oldMeta.notes || `Registo anterior consolidado em ${seed.name}`
            };
            
operations.push(async () => {
  if (!supabase) {
    return { ok: false, error: "Supabase não está configurado." };
  }

  const { error: archiveError } = await supabase
    .from("clients")
    .update({ notes: encodeClientMeta(archivedMeta) })
    .eq("id", duplicate.id);

  return archiveError
    ? { ok: false, error: `Consolidação de ${duplicate.name}: ${archiveError.message}` }
    : { ok: true };
});

          }
        } else {
          operations.push(async () => {
            const { error: insertError } = await supabase.from("clients").insert({ ...payload, created_by: userId });
            return insertError ? { ok: false, error: `${seed.name}: ${insertError.message}` } : { ok: true };
          });
        }
      }

      let nextTask = 0;
      let completedCount = 0;
      const errors: string[] = [];
      const worker = async () => {
        while (nextTask < operations.length) {
          const taskIndex = nextTask++;
          const result = await operations[taskIndex]();
          if (result.ok) completedCount++;
          else if (result.error) errors.push(result.error);
        }
      };
      await Promise.all(Array.from({ length: Math.min(8, operations.length) }, () => worker()));
      await loadData(userId);
      if (errors.length) {
        setMessage(`Importação parcialmente concluída: ${completedCount} operações feitas e ${errors.length} com erro. Primeiro erro: ${errors[0]}`);
      } else {
        setMessage(`Cadastro importado: ${preparedInventory.length} clientes preparados e ${preparedInventory.reduce((n, c) => n + c.robots.length, 0)} robôs. Foram consolidados os nomes duplicados conhecidos; podes corrigir o resto na própria aplicação.`);
      }
      setTab("clients");
    } catch (error) {
      setMessage("Não consegui concluir a importação: " + errorText(error));
    } finally {
      setImportBusy(false);
    }
  }

  async function addSchedule(e: FormEvent) {
    e.preventDefault(); if (!scheduleClient) return;
    const due = nextDueDate(new Date(scheduleDate + "T12:00:00"), frequency).toISOString().slice(0, 10);
    if (!supabase || !userId) { setMessage("Para guardar periodicidades e calendários entre sessões, configura o Supabase e inicia sessão."); return; }
    const { data, error } = await supabase.from("visit_schedules").upsert({
      client_id: scheduleClient, user_id: userId, frequency, last_visit_date: scheduleDate, next_due_date: due
    }, { onConflict: "client_id,user_id" }).select().single();
    if (error) { setMessage("Erro ao guardar periodicidade: " + error.message); return; }
    if (data) setSchedules(old => [...old.filter(x => x.client_id !== scheduleClient), data as Schedule]);
    setMessage("Periodicidade guardada. Próxima visita prevista para " + dateLabel(due) + ".");
  }

  async function markVisited(s: Schedule) {
    if (!supabase || !userId) { setMessage("Liga o Supabase e inicia sessão para registar visitas permanentes."); return; }
    const actual = new Date().toISOString().slice(0, 10);
    const { error: visitError } = await supabase.from("visits").insert({ client_id: s.client_id, user_id: userId, visit_date: actual, notes: null });
    if (visitError) { setMessage("Erro ao registar visita: " + visitError.message); return; }
    const due = nextDueDate(new Date(actual + "T12:00:00"), s.frequency).toISOString().slice(0, 10);
    const { data, error } = await supabase.from("visit_schedules").update({ last_visit_date: actual, next_due_date: due }).eq("id", s.id).select().single();
    if (error) { setMessage("Visita registada, mas não foi possível atualizar a próxima data: " + error.message); return; }
    setSchedules(old => old.map(x => x.id === s.id ? data as Schedule : x));
    const v = await supabase.from("visits").select("*, profiles(display_name)").order("visit_date", { ascending: false });
    if (v.data) setVisits(v.data as Visit[]);
    setMessage("Visita registada. Próxima visita: " + dateLabel(due) + ".");
  }

  async function addAdHocVisit(e: FormEvent) {
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
        <button className={tab === "dashboard" ? "nav-item active" : "nav-item"} onClick={() => setTab("dashboard")}><LayoutDashboard size={18}/> Painel</button>
        <button className={tab === "calendar" ? "nav-item active" : "nav-item"} onClick={() => setTab("calendar")}><CalendarDays size={18}/> Calendário</button>
        <button className={tab === "clients" ? "nav-item active" : "nav-item"} onClick={() => setTab("clients")}><Users size={18}/> Clientes <span className="nav-count">{clients.length}</span></button>
        <button className={tab === "robots" ? "nav-item active" : "nav-item"} onClick={() => setTab("robots")}><Bot size={18}/> Robôs <span className="nav-count">{totalRobots}</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="status-dot"/><span>{userId ? "Ligado à conta" : "Modo demonstração"}</span></div>
    </aside>
    <section className="main-area">
      <header className="topbar"><div><p className="eyebrow">GESTÃO OPERACIONAL</p><h1>{tab === "dashboard" ? "O teu painel" : tab === "calendar" ? "Calendário de visitas" : tab === "clients" ? "Base de clientes" : "Inventário de robôs"}</h1></div><div className="top-actions"><span className="today-label">{new Date().toLocaleDateString("pt-PT", { weekday: "short", day: "numeric", month: "short" })}</span>{userId ? <button className="button secondary" onClick={signOut}>Terminar sessão</button> : <button className="button secondary" onClick={() => document.getElementById("auth-panel")?.scrollIntoView({ behavior: "smooth" })}>Iniciar sessão</button>}<button className="button primary" onClick={() => setShowAdd(true)}><Plus size={17}/> Novo cliente</button></div></header>
      {message && <div className="notice"><span className="notice-icon"><Bell size={17}/></span><span>{message}</span><button aria-label="Fechar aviso" onClick={() => setMessage("")}><X size={15}/></button></div>}

      {!userId && <section className="auth-panel card" id="auth-panel"><div><h2>Entrar na tua equipa</h2><p>Configura o Supabase para ativar contas e sincronização real entre utilizadores.</p></div><form onSubmit={signIn} className="auth-form"><input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required/><input type="password" placeholder="Palavra-passe" value={password} onChange={e => setPassword(e.target.value)} minLength={6} required/><div className="auth-buttons"><button className="button primary" disabled={authBusy}>{authBusy ? "A entrar…" : "Entrar"}</button><button type="button" className="button secondary" onClick={signUp} disabled={authBusy}>Criar conta</button></div></form></section>}

      {tab === "dashboard" && <>
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-icon blue"><Users size={20}/></div><span>Clientes registados</span><strong>{clients.length}</strong><small>Na base de dados</small></div>
          <div className="stat-card"><div className="stat-icon purple"><Bot size={20}/></div><span>Robôs registados</span><strong>{totalRobots}</strong><small>Inclui equipamentos inativos</small></div>
          <div className="stat-card"><div className="stat-icon amber"><Clock3 size={20}/></div><span>Visitas planeadas</span><strong>{schedules.length}</strong><small>Na tua agenda</small></div>
          <div className="stat-card"><div className="stat-icon green"><Check size={20}/></div><span>Visitas registadas</span><strong>{visits.filter(v => v.user_id === userId).length}</strong><small>Histórico pessoal</small></div>
        </div>
        <div className="content-grid">
          <section className="card"><div className="section-heading"><div><h2>Próximas visitas</h2><p>As próximas tarefas da tua agenda</p></div><button className="text-button" onClick={() => setTab("calendar")}>Ver calendário →</button></div>
            {upcoming.length === 0 ? <div className="empty-state"><CalendarDays size={28}/><strong>Ainda não tens visitas planeadas</strong><span>Escolhe um cliente e define a periodicidade no separador Calendário.</span><button className="button secondary" onClick={() => setTab("calendar")}>Planear visita</button></div> : <div className="visit-list">{upcoming.map(s => <div className="visit-row" key={s.id}><div className="date-tile"><strong>{s.next_due_date ? new Date(s.next_due_date + "T12:00:00").getDate() : "—"}</strong><span>{s.next_due_date ? new Date(s.next_due_date + "T12:00:00").toLocaleDateString("pt-PT", { month: "short" }) : ""}</span></div><div className="visit-info"><strong>{clientName(s.client_id)}</strong><span>{frequencyName[s.frequency]} · {s.next_due_date ? dateLabel(s.next_due_date) : "Sem data"}</span></div><button className="icon-button" title="Marcar como realizada" onClick={() => void markVisited(s)}><Check size={18}/></button></div>)}</div>}
          </section>
          <section className="card"><div className="section-heading"><div><h2>Acesso rápido</h2><p>Encontra o que precisas</p></div></div><button className="quick-link" onClick={() => setTab("clients")}><Users size={19}/><span><strong>Pesquisar clientes</strong><small>Nome, zona e dados de contacto</small></span><ChevronRight size={17}/></button><button className="quick-link" onClick={() => setTab("robots")}><Bot size={19}/><span><strong>Ver inventário de robôs</strong><small>Modelo, número de série e estado</small></span><ChevronRight size={17}/></button><button className="quick-link" onClick={() => setTab("calendar")}><CalendarDays size={19}/><span><strong>Planear periodicidade</strong><small>Semanal, quinzenal ou mensal</small></span><ChevronRight size={17}/></button><div className="tip-box"><strong>Importação inicial</strong><p>Na área Clientes podes importar o cadastro preparado de 2026. Depois, os dados dos clientes e robôs podem ser corrigidos nos perfis, sem abrir o SQL Editor.</p></div></section>
        </div>
      </>}

      {tab === "clients" && <section className="card"><div className="section-heading"><div><h2>Todos os clientes</h2><p>Editar os dados e os robôs no perfil de cada cliente</p></div><div className="heading-actions"><button className="button secondary" onClick={() => void importPreparedData()} disabled={importBusy || inventoryImported}><Database size={16}/>{importBusy ? <><LoaderCircle size={15} className="spin"/> A importar…</> : inventoryImported ? "Cadastro importado" : "Importar cadastro 2026"}</button><button className="button primary" onClick={() => setShowAdd(true)}><Plus size={16}/> Adicionar cliente</button></div></div>
        <div className="filters"><div className="search-box"><Search size={17}/><input placeholder="Pesquisar por nome…" value={query} onChange={e => setQuery(e.target.value)}/></div><select value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}><option>Todas</option><option>Norte</option><option>Sul/Ilhas</option></select></div>
        <div className="client-table"><div className="table-head"><span>Cliente / local</span><span>Zona</span><span>Morada</span><span>Robôs</span></div>{filteredClients.map(c => <button className="client-row" key={c.id} onClick={() => setSelectedClient(c)}><span className="client-name"><span className="avatar">{c.name.slice(0, 1).toUpperCase()}</span><strong>{c.name}</strong></span><span><i className={c.zone === "Norte" ? "zone-dot north" : "zone-dot south"}/>{c.zone}</span><span>{c.address || "—"}</span><span className="history-link"><Bot size={15}/> {decodeClientMeta(c.notes).robots.length} robôs · Ver perfil</span></button>)}{filteredClients.length === 0 && <div className="empty-state">Não foram encontrados clientes.</div>}</div>
      </section>}

      {tab === "robots" && <section className="card"><div className="section-heading"><div><h2>Todos os robôs</h2><p>{allRobots.length} equipamentos associados a clientes, incluindo os inativos</p></div><button className="button secondary" onClick={() => setTab("clients")}><Users size={16}/> Ver clientes</button></div><div className="filters"><div className="search-box"><Search size={17}/><input placeholder="Pesquisar cliente, modelo ou número de série…" value={query} onChange={e => setQuery(e.target.value)}/></div></div><div className="client-table"><div className="robot-table-head"><span>Cliente / local</span><span>Robô</span><span>N.º de série</span><span>Estado</span></div>{allRobots.map(robot => <button className="robot-table-row" key={`${robot.clientId}-${robot.id}`} onClick={() => { const match = clients.find(c => c.id === robot.clientId); if (match) setSelectedClient(match); }}><span><strong>{robot.clientName}</strong><small>{robot.name}</small></span><span>{[robot.brand, robot.model].filter(Boolean).join(" · ") || "Modelo por preencher"}</span><span className="serial-cell">{robot.serialNumber || "Por confirmar"}</span><span><i className={robot.active ? "state-dot active" : "state-dot inactive"}/>{robot.active ? "Ativo" : "Inativo"}</span></button>)}{allRobots.length === 0 && <div className="empty-state"><Bot size={28}/><strong>Ainda não existem robôs</strong><span>Importa o cadastro preparado ou abre um cliente e adiciona o equipamento no respetivo perfil.</span><button className="button secondary" onClick={() => setTab("clients")}>Abrir clientes</button></div>}</div></section>}

      {tab === "calendar" && <div className="content-grid"><section className="card"><div className="section-heading"><div><h2>Planear visitas</h2><p>Define a periodicidade de um cliente na tua agenda</p></div><RefreshCw size={19}/></div><form className="stack-form" onSubmit={addSchedule}><label>Cliente<select required value={scheduleClient} onChange={e => setScheduleClient(e.target.value)}><option value="">Selecionar cliente…</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Data da última visita realizada<input type="date" required value={scheduleDate} onChange={e => setScheduleDate(e.target.value)}/></label><label>Periodicidade<select value={frequency} onChange={e => setFrequency(e.target.value as Schedule["frequency"])}><option value="weekly">Semanal</option><option value="fortnightly">Quinzenal</option><option value="monthly">Mensal</option></select></label><button className="button primary" type="submit">Guardar na minha agenda</button></form><div className="tip-box"><strong>Como funciona</strong><p>A periodicidade semanal e quinzenal usa semanas ISO. A mensal procura o mesmo dia do mês seguinte (ou o último dia se esse dia não existir).</p></div></section><section className="card"><div className="section-heading"><div><h2>A minha agenda</h2><p>Visitas previstas por ordem de data</p></div></div>{schedules.length === 0 ? <div className="empty-state"><CalendarDays size={28}/><strong>Sem visitas planeadas</strong><span>As visitas que definires aparecerão aqui.</span></div> : <div className="visit-list">{[...schedules].sort((a, b) => (a.next_due_date || "").localeCompare(b.next_due_date || "")).map(s => <div className="visit-row" key={s.id}><div className="date-tile"><strong>{s.next_due_date ? new Date(s.next_due_date + "T12:00:00").getDate() : "—"}</strong><span>{s.next_due_date ? new Date(s.next_due_date + "T12:00:00").toLocaleDateString("pt-PT", { month: "short" }) : ""}</span></div><div className="visit-info"><strong>{clientName(s.client_id)}</strong><span>{frequencyName[s.frequency]} · {s.next_due_date ? dateLabel(s.next_due_date) : "Sem data"}</span></div><button className="icon-button" title="Marcar visita realizada hoje" onClick={() => void markVisited(s)}><Check size={18}/></button></div>)}</div>}</section></div>}

      {showAdd && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowAdd(false); }}><section className="modal card"><div className="modal-heading"><div><h2>Novo cliente</h2><p>O cliente fica disponível para toda a equipa.</p></div><button className="icon-button" onClick={() => setShowAdd(false)} aria-label="Fechar"><X size={19}/></button></div><form className="stack-form" onSubmit={addClient}><label>Nome do cliente ou local *<input required value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} placeholder="Nome da empresa ou local"/></label><label>Zona *<select value={newClient.zone} onChange={e => setNewClient({ ...newClient, zone: e.target.value as ClientForm["zone"] })}><option>Norte</option><option>Sul/Ilhas</option></select></label><label>Morada<input value={newClient.address} onChange={e => setNewClient({ ...newClient, address: e.target.value })} placeholder="Rua, código postal, localidade"/></label><div className="two-fields"><label>Telefone<input value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })}/></label><label>Email<input type="email" value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })}/></label></div><label>Notas / dados da empresa<textarea rows={3} value={newClient.notes} onChange={e => setNewClient({ ...newClient, notes: e.target.value })} placeholder="Empresa, código CC, número de cliente ou outras notas"/></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowAdd(false)}>Cancelar</button><button className="button primary"><Save size={16}/> Guardar cliente</button></div></form></section></div>}

      {showClientEditor && selectedClient && <div className="modal-backdrop editor-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowClientEditor(false); }}><section className="modal card"><div className="modal-heading"><div><p className="eyebrow">EDITAR REGISTO</p><h2>Dados do cliente</h2><p>As alterações são guardadas na base de dados existente.</p></div><button className="icon-button" onClick={() => setShowClientEditor(false)} aria-label="Fechar"><X size={19}/></button></div><form className="stack-form" onSubmit={saveClientEdit}><label>Nome do cliente ou local *<input required value={clientEditorForm.name} onChange={e => setClientEditorForm({ ...clientEditorForm, name: e.target.value })}/></label><label>Zona *<select value={clientEditorForm.zone} onChange={e => setClientEditorForm({ ...clientEditorForm, zone: e.target.value as ClientForm["zone"] })}><option>Norte</option><option>Sul/Ilhas</option></select></label><label>Morada<input value={clientEditorForm.address} onChange={e => setClientEditorForm({ ...clientEditorForm, address: e.target.value })}/></label><div className="two-fields"><label>Telefone<input value={clientEditorForm.phone} onChange={e => setClientEditorForm({ ...clientEditorForm, phone: e.target.value })}/></label><label>Email<input type="email" value={clientEditorForm.email} onChange={e => setClientEditorForm({ ...clientEditorForm, email: e.target.value })}/></label></div><label>Notas / dados da empresa<textarea rows={4} value={clientEditorForm.notes} onChange={e => setClientEditorForm({ ...clientEditorForm, notes: e.target.value })}/></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowClientEditor(false)}>Cancelar</button><button className="button primary"><Save size={16}/> Guardar alterações</button></div></form></section></div>}

      {showRobotEditor && selectedClient && <div className="modal-backdrop editor-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowRobotEditor(false); }}><section className="modal card"><div className="modal-heading"><div><p className="eyebrow">INVENTÁRIO DO CLIENTE</p><h2>{editingRobotId ? "Editar robô" : "Adicionar robô"}</h2><p>{selectedClient.name}</p></div><button className="icon-button" onClick={() => setShowRobotEditor(false)} aria-label="Fechar"><X size={19}/></button></div><form className="stack-form" onSubmit={saveRobot}><div className="two-fields"><label>Nome / identificação<input value={robotEditorForm.name} onChange={e => setRobotEditorForm({ ...robotEditorForm, name: e.target.value })} placeholder="Ex.: Polo 2, Piso 1"/></label><label>Marca<input value={robotEditorForm.brand} onChange={e => setRobotEditorForm({ ...robotEditorForm, brand: e.target.value })} placeholder="Gausium, Tennant, Pudu…"/></label></div><div className="two-fields"><label>Modelo *<input required value={robotEditorForm.model} onChange={e => setRobotEditorForm({ ...robotEditorForm, model: e.target.value })} placeholder="Phantas, SC50, X1000…"/></label><label>Número de série<input value={robotEditorForm.serialNumber} onChange={e => setRobotEditorForm({ ...robotEditorForm, serialNumber: e.target.value })} placeholder="Número de série"/></label></div><label>N.º de ativo<input value={robotEditorForm.assetNumber} onChange={e => setRobotEditorForm({ ...robotEditorForm, assetNumber: e.target.value })}/></label><label className="check-line"><input type="checkbox" checked={robotEditorForm.active} onChange={e => setRobotEditorForm({ ...robotEditorForm, active: e.target.checked })}/> Equipamento ativo</label><label>Notas<textarea rows={3} value={robotEditorForm.notes} onChange={e => setRobotEditorForm({ ...robotEditorForm, notes: e.target.value })} placeholder="Polo, localização, substituição, dados por confirmar…"/></label><div className="modal-actions"><button type="button" className="button secondary" onClick={() => setShowRobotEditor(false)}>Cancelar</button><button className="button primary"><Save size={16}/> Guardar robô</button></div></form></section></div>}

      {selectedClient && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedClient(null); }}><section className="modal profile-modal card"><div className="modal-heading"><div><p className="eyebrow">PERFIL DO CLIENTE</p><h2>{selectedClient.name}</h2><p><MapPin size={14} style={{ display: "inline", verticalAlign: "middle" }}/> {selectedClient.zone} · {selectedClient.address || "Morada não indicada"}</p></div><div className="profile-heading-actions"><button className="icon-button" onClick={() => openClientEditor(selectedClient)} title="Editar dados do cliente" aria-label="Editar cliente"><Pencil size={17}/></button><button className="icon-button" onClick={() => setSelectedClient(null)} title="Fechar" aria-label="Fechar perfil"><X size={19}/></button></div></div>
        <div className="profile-details"><span>Telefone<strong>{selectedClient.phone || "—"}</strong></span><span>Email<strong>{selectedClient.email || "—"}</strong></span><span className="notes-field">Notas / dados da empresa<strong>{decodeClientMeta(selectedClient.notes).notes || "—"}</strong></span></div>
        <div className="section-heading"><div><h3>Robôs associados</h3><p>Os números de série e o estado podem ser corrigidos aqui.</p></div><button className="button primary" onClick={() => openRobotEditor()}><Plus size={15}/> Adicionar robô</button></div>
        <div className="robots-list">{decodeClientMeta(selectedClient.notes).robots.map(robot => <article className="robot-card" key={robot.id}><div className="robot-icon"><Bot size={20}/></div><div className="robot-card-body"><div className="robot-title-row"><strong>{robot.name || robot.model || "Robô"}</strong><span className={robot.active ? "status-pill active" : "status-pill inactive"}>{robot.active ? "Ativo" : "Inativo"}</span></div><p>{[robot.brand, robot.model].filter(Boolean).join(" · ") || "Modelo por preencher"}</p><div className="robot-metadata"><span><small>N.º série</small><strong>{robot.serialNumber || "Por confirmar"}</strong></span>{robot.assetNumber && <span><small>N.º ativo</small><strong>{robot.assetNumber}</strong></span>}</div>{robot.notes && <p className="robot-notes">{robot.notes}</p>}</div><div className="robot-actions"><button className="icon-button" title="Editar robô" onClick={() => openRobotEditor(robot)}><Pencil size={16}/></button><button className="icon-button" title={robot.active ? "Marcar inativo" : "Marcar ativo"} onClick={() => void toggleRobotActive(selectedClient, robot)}>{robot.active ? <PauseCircle size={16}/> : <PlayCircle size={16}/>}</button></div></article>)}{decodeClientMeta(selectedClient.notes).robots.length === 0 && <div className="empty-state compact"><Bot size={24}/><strong>Sem robôs associados</strong><span>Adiciona aqui o primeiro equipamento deste cliente.</span></div>}</div>
        <div className="section-heading history-heading"><div><h3>Histórico de visitas</h3><p>Visitas registadas por todos os utilizadores</p></div></div><div className="history-list">{visits.filter(v => v.client_id === selectedClient.id).map(v => <div className="history-entry" key={v.id}><div className="history-check"><Check size={15}/></div><div><strong>{dateLabel(v.visit_date)}</strong><span>{v.profiles?.display_name || "Utilizador da equipa"}</span>{v.notes && <p>{v.notes}</p>}</div></div>)}{visits.filter(v => v.client_id === selectedClient.id).length === 0 && <p className="muted">Ainda não há visitas registadas para este cliente.</p>}</div>
        <form className="stack-form visit-form" onSubmit={addAdHocVisit}><h3>Registar visita realizada</h3><label>Data<input type="date" required value={visitDate} onChange={e => setVisitDate(e.target.value)}/></label><label>Notas da visita<textarea rows={2} value={visitNotes} onChange={e => setVisitNotes(e.target.value)} placeholder="O que foi feito, problemas encontrados…"/></label><button className="button primary" type="submit" disabled={!userId}>Adicionar ao histórico</button>{!userId && <small>Inicia sessão e configura a base de dados para registar visitas.</small>}</form>
      </section></div>}
    </section>
  </main>;
}
