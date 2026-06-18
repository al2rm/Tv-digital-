import { useState, useEffect, useMemo, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

// ===================== CONFIGURACION SUPABASE =====================
// Reemplaza estos valores con los tuyos de supabase.com -> Settings -> API
const SUPABASE_URL = "https://lbdpwfymxwawlzoebyil.supabase.co";
const SUPABASE_KEY = "sb_publishable_3LZ995tb1PZDyX0CD4V8Yg_V_DD5Bbp";
const SUPABASE_READY = SUPABASE_URL !== "TU_URL_AQUI";

let lastSupaError = null;

async function supaFetch(path, options = {}) {
  if (!SUPABASE_READY) return null;
  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": options.prefer || "return=representation",
      },
      ...options,
    });
    if (!res.ok) {
      const errText = await res.text();
      lastSupaError = "HTTP " + res.status + ": " + errText.slice(0,200);
      throw new Error(lastSupaError);
    }
    lastSupaError = null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  } catch (e) {
    lastSupaError = e.message || String(e);
    throw e;
  }
}

const db = {
  async getClientes() {
    const data = await supaFetch("clientes?order=created_at.desc");
    return data || [];
  },
  async upsertCliente(c) {
    return supaFetch("clientes?on_conflict=id", {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify(c),
    });
  },
  async deleteCliente(id) {
    return supaFetch("clientes?id=eq." + id, { method: "DELETE", prefer: "" });
  },
  async getPagos() {
    const data = await supaFetch("pagos?order=fecha.desc");
    return data || [];
  },
  async upsertPago(p) {
    return supaFetch("pagos?on_conflict=id", {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify(p),
    });
  },
  async deletePago(id) {
    return supaFetch("pagos?id=eq." + id, { method: "DELETE", prefer: "" });
  },
  async getConfig() {
    const data = await supaFetch("config?id=eq.1");
    return data && data[0] ? data[0].data : null;
  },
  async saveConfig(data) {
    return supaFetch("config?on_conflict=id", {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify({ id: 1, data }),
    });
  },
};

// ===================== CONSTANTES =====================
const STORAGE_KEY = "tvdigital_clientes";
const PAGOS_KEY = "tvdigital_pagos";
const SESSION_KEY = "tvdigital_session";
const CONFIG_KEY = "tvdigital_config";
const CREDENCIALES_KEY = "tvdigital_credenciales";

const PLANES = [
  { id: "mensual", label: "Mensual", meses: 1 },
  { id: "trimestral", label: "Trimestral", meses: 3 },
  { id: "semestral", label: "Semestral", meses: 6 },
  { id: "anual", label: "Anual", meses: 12 },
];

const CATEGORIAS = [
  { id: "normal", label: "Normal", color: "#6B7280" },
  { id: "vip", label: "VIP", color: "#F59E0B" },
  { id: "prueba", label: "Prueba", color: "#3B82F6" },
  { id: "suspendido", label: "Suspendido", color: "#EF4444" },
];

const CONFIG_DEFAULT = {
  negocio: "TV Digital Pro",
  moneda: "$",
  diasAlerta: 5,
  mensajeCobro: "Hola {nombre}, tu servicio de TV Digital ({plan}) vence el {vencimiento}. El costo de renovacion es {moneda}{precio}. Gracias!",
};

const CRED_DEFAULT = { usuario: "admin", clave: "tv2024" };

// ===================== HELPERS =====================
function calcularEstado(vencimiento, diasAlerta = 5) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const venc = new Date(vencimiento); venc.setHours(0,0,0,0);
  const diff = Math.ceil((venc - hoy) / 86400000);
  if (diff < 0) return { label: "Vencido", color: "#EF4444", bg: "#EF444422", dias: diff };
  if (diff === 0) return { label: "Vence hoy", color: "#F59E0B", bg: "#F59E0B22", dias: 0 };
  if (diff <= diasAlerta) return { label: "Vence en " + diff + "d", color: "#F59E0B", bg: "#F59E0B22", dias: diff };
  return { label: "Activo", color: "#10B981", bg: "#10B98122", dias: diff };
}

function formatFecha(fecha) {
  if (!fecha) return "-";
  return new Date(fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function diasRestantes(vencimiento) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const venc = new Date(vencimiento); venc.setHours(0,0,0,0);
  return Math.ceil((venc - hoy) / 86400000);
}

function generarId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

function calcularVencimiento(inicio, planId) {
  const plan = PLANES.find(p => p.id === planId);
  if (!plan || !inicio) return "";
  const d = new Date(inicio);
  d.setMonth(d.getMonth() + plan.meses);
  return d.toISOString().split("T")[0];
}

function limpiarNumero(num) { return (num || "").replace(/\D/g, ""); }

function abrirWhatsApp(numero, mensaje) {
  const limpio = limpiarNumero(numero);
  const url = mensaje
    ? "https://wa.me/" + limpio + "?text=" + encodeURIComponent(mensaje)
    : "https://wa.me/" + limpio;
  window.open(url, "_blank");
}

function copiarTexto(texto) {
  try {
    const el = document.createElement("textarea");
    el.value = texto; el.style.position = "fixed"; el.style.top = "-9999px";
    document.body.appendChild(el); el.focus(); el.select();
    document.execCommand("copy"); document.body.removeChild(el);
  } catch(e) {}
}

function planLabel(id) { return PLANES.find(x => x.id === id)?.label || id; }
function catInfo(id) { return CATEGORIAS.find(x => x.id === id) || CATEGORIAS[0]; }

const COLORS_AVATAR = ["#3B82F6","#8B5CF6","#EC4899","#10B981","#F59E0B","#EF4444"];
function getColor(n) {
  let h = 0;
  for (let i = 0; i < (n||"").length; i++) h += (n||"").charCodeAt(i);
  return COLORS_AVATAR[h % COLORS_AVATAR.length];
}

function getCredenciales() {
  try { return JSON.parse(localStorage.getItem(CREDENCIALES_KEY)) || CRED_DEFAULT; }
  catch { return CRED_DEFAULT; }
}

const EMPTY_FORM = {
  nombre: "", whatsapp: "", plan: "mensual", categoria: "normal",
  inicio: new Date().toISOString().split("T")[0],
  vencimiento: "", precio: "", usuarioTv: "", claveTv: "", notas: "",
};

// ===================== LOGIN =====================
function LoginScreen({ onLogin }) {
  const [usuario, setUsuario] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [ver, setVer] = useState(false);

  function login() {
    const creds = getCredenciales();
    if (usuario === creds.usuario && clave === creds.clave) {
      sessionStorage.setItem(SESSION_KEY, "1"); onLogin();
    } else {
      setError("Usuario o contrasena incorrectos");
      setTimeout(() => setError(""), 2500);
    }
  }

  return (
    <div style={{ minHeight:"100vh", background:"#0F1117", display:"flex", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"Inter,sans-serif" }}>
      <div style={{ background:"#1A1D2E", borderRadius:24, padding:"40px 24px", width:"100%", maxWidth:380, border:"1px solid #1E2340" }}>
        <div style={{ width:68, height:68, background:"linear-gradient(135deg,#3B82F6,#8B5CF6)", borderRadius:20, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, margin:"0 auto 20px" }}>📺</div>
        <div style={{ textAlign:"center", fontSize:22, fontWeight:800, color:"#fff", marginBottom:6 }}>TV Digital Pro</div>
        <div style={{ textAlign:"center", fontSize:13, color:"#6B7280", marginBottom:28 }}>Accede a tu sistema de gestion</div>
        <div style={{ fontSize:12, color:"#7C83A8", marginBottom:5 }}>Usuario</div>
        <input style={{ width:"100%", background:"#0F1117", border:"1px solid #2A2D45", borderRadius:12, padding:"12px 14px", color:"#E8EAF0", fontSize:15, outline:"none", boxSizing:"border-box", marginBottom:14 }}
          value={usuario} onChange={e => setUsuario(e.target.value)} placeholder="admin" onKeyDown={e => e.key==="Enter" && login()} />
        <div style={{ fontSize:12, color:"#7C83A8", marginBottom:5 }}>Contrasena</div>
        <div style={{ position:"relative", marginBottom:6 }}>
          <input style={{ width:"100%", background:"#0F1117", border:"1px solid #2A2D45", borderRadius:12, padding:"12px 44px 12px 14px", color:"#E8EAF0", fontSize:15, outline:"none", boxSizing:"border-box" }}
            type={ver ? "text" : "password"} value={clave} onChange={e => setClave(e.target.value)}
            placeholder="••••••••" onKeyDown={e => e.key==="Enter" && login()} />
          <button style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#6B7280", cursor:"pointer", fontSize:18 }}
            onClick={() => setVer(!ver)}>{ver ? "🙈" : "👁️"}</button>
        </div>
        <button style={{ width:"100%", background:"linear-gradient(135deg,#3B82F6,#6366F1)", border:"none", borderRadius:12, padding:"14px 0", color:"#fff", fontSize:16, fontWeight:700, cursor:"pointer", marginTop:14 }}
          onClick={login}>Entrar</button>
        {error && <div style={{ background:"#EF444422", border:"1px solid #EF444455", borderRadius:10, padding:"10px 14px", color:"#EF4444", fontSize:13, textAlign:"center", marginTop:12 }}>⚠️ {error}</div>}
      </div>
    </div>
  );
}

// ===================== COMPONENTES REUTILIZABLES =====================
function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div style={{ position:"fixed", bottom:90, left:"50%", transform:"translateX(-50%)", background:toast.tipo==="err"?"#EF4444":"#10B981", color:"#fff", padding:"10px 20px", borderRadius:30, fontSize:13, fontWeight:600, zIndex:200, whiteSpace:"nowrap", boxShadow:"0 4px 20px rgba(0,0,0,0.4)" }}>
      {toast.msg}
    </div>
  );
}

function ModalBg({ onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.78)", zIndex:50, display:"flex", alignItems:"flex-end" }} onClick={onClose}>
      <div style={{ background:"#1A1D2E", borderRadius:"20px 20px 0 0", width:"100%", maxWidth:480, margin:"0 auto", padding:"18px 14px 36px", maxHeight:"93vh", overflowY:"auto" }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Btn({ variant, onClick, children, style }) {
  const base = { border:"none", borderRadius:12, padding:"12px 0", width:"100%", fontSize:14, fontWeight:600, cursor:"pointer", marginBottom:8 };
  const variants = {
    primary: { background:"linear-gradient(135deg,#3B82F6,#6366F1)", color:"#fff" },
    green:   { background:"linear-gradient(135deg,#10B981,#059669)", color:"#fff" },
    danger:  { background:"#EF444422", color:"#EF4444" },
    secondary: { background:"#252840", color:"#9CA3AF" },
  };
  return <button style={{ ...base, ...variants[variant||"secondary"], ...style }} onClick={onClick}>{children}</button>;
}

function Badge({ color, bg, children }) {
  return <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 7px", borderRadius:20, fontSize:10, fontWeight:600, color, background:bg }}>{children}</span>;
}

function CatBadge({ id }) {
  const cat = catInfo(id);
  return <span style={{ display:"inline-flex", alignItems:"center", padding:"2px 7px", borderRadius:20, fontSize:10, fontWeight:600, color:cat.color, background:cat.color+"22" }}>{cat.label}</span>;
}

function SyncIndicator({ syncing, synced, error, onShowError }) {
  if (!SUPABASE_READY) return <span style={{ fontSize:9, color:"#4B5563", background:"#1E2340", borderRadius:10, padding:"2px 7px" }}>💾 Local</span>;
  if (error) return (
    <span
      onClick={(e) => { e.stopPropagation(); onShowError && onShowError(); }}
      style={{ fontSize:9, color:"#EF4444", background:"#EF444422", borderRadius:10, padding:"2px 7px", cursor:"pointer" }}
    >⚠️ Sin sync (toca)</span>
  );
  if (syncing) return <span style={{ fontSize:9, color:"#F59E0B", background:"#F59E0B22", borderRadius:10, padding:"2px 7px" }}>⏳ Sync...</span>;
  if (synced) return <span style={{ fontSize:9, color:"#10B981", background:"#10B98122", borderRadius:10, padding:"2px 7px" }}>☁️ Nube</span>;
  return null;
}



// ===================== APP PRINCIPAL =====================
export default function App() {
  const [logueado, setLogueado] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [clientes, setClientes] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [config, setConfig] = useState(CONFIG_DEFAULT);
  const [vista, setVista] = useState("dashboard");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [clienteActivo, setClienteActivo] = useState(null);
  const [pagoActivo, setPagoActivo] = useState(null);
  const [pagoForm, setPagoForm] = useState({ monto:"", fecha:new Date().toISOString().split("T")[0], nota:"" });
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroPlan, setFiltroPlan] = useState("todos");
  const [ordenar, setOrdenar] = useState("nombre");
  const [toast, setToast] = useState(null);
  const [verClaveTv, setVerClaveTv] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState("");
  const [loading, setLoading] = useState(true);
  const [configCreds, setConfigCreds] = useState(getCredenciales());

  // CARGA INICIAL
  useEffect(() => {
    async function cargar() {
      if (SUPABASE_READY) {
        setSyncing(true);
        try {
          const [c, p, cf] = await Promise.all([db.getClientes(), db.getPagos(), db.getConfig()]);
          if (c.length) setClientes(c);
          else {
            const local = localStorage.getItem(STORAGE_KEY);
            if (local) setClientes(JSON.parse(local));
          }
          if (p.length) setPagos(p);
          else {
            const local = localStorage.getItem(PAGOS_KEY);
            if (local) setPagos(JSON.parse(local));
          }
          if (cf) setConfig({ ...CONFIG_DEFAULT, ...cf });
          else {
            const local = localStorage.getItem(CONFIG_KEY);
            if (local) setConfig({ ...CONFIG_DEFAULT, ...JSON.parse(local) });
          }
          setSynced(true); setSyncError(false);
        } catch (e) {
          setSyncError(true);
          setErrorDetalle(e.message || String(e));
          const c = localStorage.getItem(STORAGE_KEY);
          const p = localStorage.getItem(PAGOS_KEY);
          const cf = localStorage.getItem(CONFIG_KEY);
          if (c) setClientes(JSON.parse(c));
          if (p) setPagos(JSON.parse(p));
          if (cf) setConfig({ ...CONFIG_DEFAULT, ...JSON.parse(cf) });
        } finally { setSyncing(false); }
      } else {
        const c = localStorage.getItem(STORAGE_KEY);
        const p = localStorage.getItem(PAGOS_KEY);
        const cf = localStorage.getItem(CONFIG_KEY);
        if (c) setClientes(JSON.parse(c));
        if (p) setPagos(JSON.parse(p));
        if (cf) setConfig({ ...CONFIG_DEFAULT, ...JSON.parse(cf) });
      }
      setLoading(false);
    }
    cargar();
  }, []);


  // GUARDAR
  async function saveClientes(data) {
    setClientes(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  async function savePagos(data) {
    setPagos(data);
    localStorage.setItem(PAGOS_KEY, JSON.stringify(data));
  }
  function saveConfigLocal(data) {
    setConfig(data);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(data));
  }

  function showToast(msg, tipo) {
    setToast({ msg, tipo: tipo||"ok" });
    setTimeout(() => setToast(null), 2800);
  }

  function cerrarSesion() { sessionStorage.removeItem(SESSION_KEY); setLogueado(false); }

  // SYNC CON SUPABASE
  async function syncCliente(cliente) {
    if (!SUPABASE_READY) return;
    setSyncing(true);
    try { await db.upsertCliente(cliente); setSynced(true); setSyncError(false); }
    catch (e) { setSyncError(true); setErrorDetalle(e.message || String(e)); }
    finally { setSyncing(false); }
  }

  async function syncDeleteCliente(id) {
    if (!SUPABASE_READY) return;
    try { await db.deleteCliente(id); } catch {}
  }

  async function syncPago(pago) {
    if (!SUPABASE_READY) return;
    try { await db.upsertPago(pago); } catch {}
  }

  async function syncDeletePago(id) {
    if (!SUPABASE_READY) return;
    try { await db.deletePago(id); } catch {}
  }

  // BACKUP
  function exportarBackup() {
    const data = JSON.stringify({ clientes, pagos, config, fecha:new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "tvdigital_backup_" + new Date().toISOString().slice(0,10) + ".json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url); showToast("Backup descargado");
  }

  function importarBackup(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.clientes) await saveClientes(data.clientes);
        if (data.pagos) await savePagos(data.pagos);
        if (data.config) saveConfigLocal({ ...CONFIG_DEFAULT, ...data.config });
        showToast("Backup restaurado");
      } catch { showToast("Archivo invalido","err"); }
    };
    reader.readAsText(file); e.target.value = "";
  }

  function exportarCSV() {
    const esc = v => '"' + String(v||"").replace(/"/g,'""') + '"';
    const headers = ["Nombre","WhatsApp","Plan","Categoria","Precio","Inicio","Vencimiento","Estado","Dias","UsuarioTV","ContrasenaTV","Notas"];
    const rows = clientes.map(c => {
      const est = calcularEstado(c.vencimiento, config.diasAlerta);
      return [c.nombre,c.whatsapp,planLabel(c.plan),c.categoria||"normal",c.precio,c.inicio,c.vencimiento,est.label,est.dias,c.usuarioTv,c.claveTv,c.notas].map(esc).join(",");
    });
    const csv = [headers.join(",")].concat(rows).join("\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "clientes_" + new Date().toISOString().slice(0,10) + ".csv";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url); showToast("CSV descargado");
  }

  function enviarCobro(c) {
    const msg = (config.mensajeCobro||"")
      .replace("{nombre}", c.nombre).replace("{plan}", planLabel(c.plan))
      .replace("{precio}", c.precio||"").replace("{moneda}", config.moneda||"$")
      .replace("{vencimiento}", formatFecha(c.vencimiento));
    abrirWhatsApp(c.whatsapp, msg);
  }

  // RENOVACION INTELIGENTE
  function renovarCliente(c) {
    const hoy = new Date().toISOString().split("T")[0];
    const base = c.vencimiento > hoy ? c.vencimiento : hoy;
    const nuevoVenc = calcularVencimiento(base, c.plan);
    const updated = { ...c, inicio:base, vencimiento:nuevoVenc };
    const newList = clientes.map(x => x.id===c.id ? updated : x);
    saveClientes(newList);
    syncCliente(updated);
    showToast("Renovado: vence " + formatFecha(nuevoVenc));
    setModal(null);
  }

  // CRUD CLIENTES
  const abrirNuevo = useCallback(() => {
    setForm({ ...EMPTY_FORM, inicio:new Date().toISOString().split("T")[0] });
    setModal("nuevo");
  }, []);

  const abrirEditar = useCallback((c) => {
    setForm({ ...c }); setClienteActivo(c); setModal("editar");
  }, []);

  const abrirDetalle = useCallback((c) => {
    setClienteActivo(c); setVerClaveTv(false); setModal("detalle");
  }, []);

  const abrirPago = useCallback((c) => {
    setClienteActivo(c);
    setPagoActivo(null);
    setPagoForm({ monto:c.precio||"", fecha:new Date().toISOString().split("T")[0], nota:"" });
    setModal("pago");
  }, []);

  const abrirEditarPago = useCallback((p) => {
    setPagoActivo(p);
    setPagoForm({ monto:p.monto, fecha:p.fecha, nota:p.nota||"" });
    setModal("pago");
  }, []);

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]:value };
      if (name==="plan" || name==="inicio")
        next.vencimiento = calcularVencimiento(name==="inicio"?value:prev.inicio, name==="plan"?value:prev.plan);
      return next;
    });
  }

  async function guardarCliente() {
    if (!form.nombre.trim()) return showToast("Escribe el nombre","err");
    if (!form.whatsapp.trim()) return showToast("Escribe el WhatsApp","err");
    if (modal==="nuevo") {
      const dup = clientes.find(c => limpiarNumero(c.whatsapp)===limpiarNumero(form.whatsapp));
      if (dup) return showToast("WhatsApp ya registrado","err");
      const nuevo = { ...form, id:generarId(), vencimiento:form.vencimiento||calcularVencimiento(form.inicio,form.plan), created_at:new Date().toISOString() };
      const newList = [nuevo, ...clientes];
      await saveClientes(newList);
      syncCliente(nuevo);
      showToast("Cliente agregado");
    } else {
      const updated = { ...form };
      const newList = clientes.map(c => c.id===form.id ? updated : c);
      await saveClientes(newList);
      syncCliente(updated);
      showToast("Cliente actualizado");
    }
    setModal(null);
  }

  async function eliminarCliente(id) {
    if (!confirm("Eliminar este cliente y todos sus pagos?")) return;
    const newClientes = clientes.filter(c => c.id!==id);
    const newPagos = pagos.filter(p => p.clienteId!==id);
    await saveClientes(newClientes);
    await savePagos(newPagos);
    syncDeleteCliente(id);
    setModal(null); showToast("Eliminado");
  }

  async function guardarPago() {
    if (!pagoForm.monto) return showToast("Escribe el monto","err");
    if (pagoActivo) {
      // Editar pago existente
      const updated = { ...pagoActivo, ...pagoForm };
      const newList = pagos.map(p => p.id===pagoActivo.id ? updated : p);
      await savePagos(newList);
      syncPago(updated);
      showToast("Pago actualizado");
    } else {
      // Nuevo pago
      const nuevo = { id:generarId(), clienteId:clienteActivo.id, clienteNombre:clienteActivo.nombre, ...pagoForm, created_at:new Date().toISOString() };
      const newList = [nuevo, ...pagos];
      await savePagos(newList);
      syncPago(nuevo);
      showToast("Pago registrado");
    }
    setModal(null);
  }

  async function eliminarPago(id) {
    if (!confirm("Eliminar este pago?")) return;
    const newList = pagos.filter(p => p.id!==id);
    await savePagos(newList);
    syncDeletePago(id);
    showToast("Pago eliminado");
  }

  // STATS
  const stats = useMemo(() => {
    const hoy = new Date().toISOString().slice(0,10);
    const semana = new Date(Date.now()-7*86400000).toISOString().slice(0,10);
    const mes = new Date().toISOString().slice(0,7);
    const anio = new Date().getFullYear().toString();
    const activos = clientes.filter(c => calcularEstado(c.vencimiento,config.diasAlerta).dias>=0).length;
    const vencidos = clientes.filter(c => calcularEstado(c.vencimiento,config.diasAlerta).dias<0).length;
    const proximos = clientes.filter(c => { const e=calcularEstado(c.vencimiento,config.diasAlerta); return e.dias>=0&&e.dias<=config.diasAlerta; }).length;
    const ingresosMes = pagos.filter(p=>(p.fecha||"").slice(0,7)===mes).reduce((s,p)=>s+parseFloat(p.monto||0),0);
    const ingresosHoy = pagos.filter(p=>p.fecha===hoy).reduce((s,p)=>s+parseFloat(p.monto||0),0);
    const ingresosSemana = pagos.filter(p=>p.fecha>=semana).reduce((s,p)=>s+parseFloat(p.monto||0),0);
    const ingresosAnio = pagos.filter(p=>(p.fecha||"").startsWith(anio)).reduce((s,p)=>s+parseFloat(p.monto||0),0);
    const ticketPromedio = pagos.length > 0 ? (pagos.reduce((s,p)=>s+parseFloat(p.monto||0),0)/pagos.length) : 0;
    const porCliente = {};
    pagos.forEach(p => { porCliente[p.clienteNombre]=(porCliente[p.clienteNombre]||0)+parseFloat(p.monto||0); });
    const topCliente = Object.entries(porCliente).sort((a,b)=>b[1]-a[1])[0];
    return { total:clientes.length, activos, vencidos, proximos, ingresosMes, ingresosHoy, ingresosSemana, ingresosAnio, ticketPromedio, topCliente };
  }, [clientes, pagos, config.diasAlerta]);

  const graficaIngresos = useMemo(() => {
    const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
    const anio = new Date().getFullYear();
    return meses.map((m,i) => {
      const key = anio+"-"+(i+1<10?"0"+(i+1):(i+1));
      return { mes:m, total:pagos.filter(p=>(p.fecha||"").startsWith(key)).reduce((s,p)=>s+parseFloat(p.monto||0),0) };
    });
  }, [pagos]);

  const graficaEstados = useMemo(() => [
    { name:"Activos", value:stats.activos, color:"#10B981" },
    { name:"Proximos", value:stats.proximos, color:"#F59E0B" },
    { name:"Vencidos", value:stats.vencidos, color:"#EF4444" },
  ].filter(x=>x.value>0), [stats]);

  const graficaPlanes = useMemo(() => {
    const cols = { mensual:"#3B82F6", trimestral:"#8B5CF6", semestral:"#EC4899", anual:"#F59E0B" };
    return PLANES.map(p => ({ name:p.label, value:clientes.filter(c=>c.plan===p.id).length, color:cols[p.id] })).filter(x=>x.value>0);
  }, [clientes]);

  const clientesFiltrados = useMemo(() => {
    let lista = clientes.filter(c => {
      const q = busqueda.toLowerCase();
      const match = !q || c.nombre.toLowerCase().includes(q) || (c.whatsapp||"").includes(q) || (c.usuarioTv||"").toLowerCase().includes(q) || (c.notas||"").toLowerCase().includes(q);
      const est = calcularEstado(c.vencimiento, config.diasAlerta);
      const eOk = filtroEstado==="todos" || (filtroEstado==="activos"&&est.dias>=0) || (filtroEstado==="vencidos"&&est.dias<0) || (filtroEstado==="proximos"&&est.dias>=0&&est.dias<=config.diasAlerta);
      const pOk = filtroPlan==="todos" || c.plan===filtroPlan;
      return match && eOk && pOk;
    });
    if (ordenar==="nombre") lista = [...lista].sort((a,b)=>a.nombre.localeCompare(b.nombre));
    if (ordenar==="vencimiento") lista = [...lista].sort((a,b)=>a.vencimiento>b.vencimiento?1:-1);
    if (ordenar==="reciente") lista = [...lista].sort((a,b)=>a.created_at>b.created_at?-1:1);
    return lista;
  }, [clientes, busqueda, filtroEstado, filtroPlan, ordenar, config.diasAlerta]);

  const C = config.moneda || "$";

  // ESTILOS
  const inp = { width:"100%", background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:"11px 12px", color:"#E8EAF0", fontSize:14, outline:"none", boxSizing:"border-box", marginBottom:2 };
  const lbl = { fontSize:11, color:"#7C83A8", marginBottom:4, display:"block", fontWeight:500 };
  const chip = a => ({ padding:"6px 11px", borderRadius:20, border:a?"2px solid #3B82F6":"1px solid #2A2D45", background:a?"#1E2B6B":"transparent", color:a?"#60A5FA":"#6B7280", fontSize:11, fontWeight:a?600:400, cursor:"pointer" });
  const card = { background:"#1A1D2E", borderRadius:14, padding:12, marginBottom:10, border:"1px solid #1E2340" };
  const divRow = { display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 0", borderBottom:"1px solid #1E2340" };
  const secTitle = { fontSize:11, fontWeight:600, color:"#7C83A8", textTransform:"uppercase", letterSpacing:0.8, marginBottom:8, marginTop:14 };
  const iconBtn = (bg,color) => ({ background:bg, border:"none", color:color, borderRadius:10, padding:"8px 10px", fontSize:15, cursor:"pointer" });
  const clientCard = { background:"#1A1D2E", borderRadius:12, padding:"11px 12px", marginBottom:8, border:"1px solid #1E2340", cursor:"pointer", display:"flex", alignItems:"center", gap:10 };
  const avatar = c => ({ width:38, height:38, borderRadius:10, background:c, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:700, color:"#fff", flexShrink:0 });


  if (!logueado) return <LoginScreen onLogin={() => setLogueado(true)} />;
  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#0F1117", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Inter,sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:40, marginBottom:12 }}>📺</div>
        <div style={{ color:"#6B7280", fontSize:14 }}>Cargando{SUPABASE_READY?" desde la nube":""}...</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily:"Inter,sans-serif", background:"#0F1117", minHeight:"100vh", color:"#E8EAF0", maxWidth:480, margin:"0 auto" }}>

      {/* HEADER */}
      <div style={{ background:"linear-gradient(135deg,#1A1D2E 0%,#0D1B8E 100%)", padding:"14px 12px 10px", borderBottom:"1px solid #1E2340" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:34, height:34, background:"linear-gradient(135deg,#3B82F6,#8B5CF6)", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17 }}>📺</div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#fff", display:"flex", alignItems:"center", gap:6 }}>
                {config.negocio||"TV Digital Pro"}
                <SyncIndicator syncing={syncing} synced={synced} error={syncError} onShowError={() => setModal("errorSync")} />
              </div>
              <div style={{ fontSize:9, color:"#7C83A8" }}>GESTION DE CLIENTES</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:5 }}>
            <button style={iconBtn("linear-gradient(135deg,#3B82F6,#6366F1)","#fff")} onClick={abrirNuevo}>+ Nuevo</button>
            <button style={iconBtn("#14532D","#4ADE80")} onClick={exportarCSV} title="CSV">📥</button>
            <button style={iconBtn("#1e3a5f","#60A5FA")} onClick={exportarBackup} title="Backup">💾</button>
            <label style={{ ...iconBtn("#3b2f00","#FBBF24"), display:"inline-flex", alignItems:"center", cursor:"pointer" }}>
              📂<input type="file" accept=".json" style={{ display:"none" }} onChange={importarBackup}/>
            </label>
            <button style={iconBtn("#1E2340","#9CA3AF")} onClick={() => setModal("config")}>⚙️</button>
            <button style={iconBtn("#252840","#9CA3AF")} onClick={cerrarSesion}>🔓</button>
          </div>
        </div>
      </div>

      {/* NAV */}
      <div style={{ display:"flex", background:"#13162A", borderBottom:"1px solid #1E2340", padding:"3px 6px" }}>
        {[["dashboard","📊 Panel"],["clientes","👥 Clientes"],["pagos","💰 Pagos"],["graficas","📈 Graficas"]].map(([v,l]) => (
          <button key={v} style={{ flex:1, border:"none", background:vista===v?"#1E2B6B":"transparent", color:vista===v?"#60A5FA":"#6B7280", borderRadius:8, padding:"9px 2px", fontSize:11, fontWeight:vista===v?600:400, cursor:"pointer" }} onClick={()=>setVista(v)}>{l}</button>
        ))}
      </div>

      <div style={{ padding:12, paddingBottom:80 }}>

        {/* ===== DASHBOARD ===== */}
        {vista==="dashboard" && <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
            {[["#3B82F6",stats.total,"Total"],["#10B981",stats.activos,"Activos"],["#F59E0B",stats.proximos,"Pronto"],["#EF4444",stats.vencidos,"Vencidos"]].map(([c,n,l])=>(
              <div key={l} style={{ background:"#1A1D2E", borderRadius:12, padding:"12px 14px", border:"1px solid "+c+"22", borderLeft:"3px solid "+c }}>
                <div style={{ fontSize:26,fontWeight:800,color:c,marginBottom:2 }}>{n}</div>
                <div style={{ fontSize:10,color:"#6B7280",textTransform:"uppercase" }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
            {[[C+stats.ingresosHoy.toLocaleString("es"),"Hoy","#34D399","#0F2A1A"],[C+stats.ingresosSemana.toLocaleString("es"),"Semana","#60A5FA","#0F1E3A"],[C+stats.ingresosMes.toLocaleString("es"),"Mes","#A78BFA","#1A0F3A"],[C+stats.ingresosAnio.toLocaleString("es"),"Anio","#F472B6","#2A0F1E"]].map(([v,l,c,bg])=>(
              <div key={l} style={{ background:bg, borderRadius:12, padding:"11px 12px", border:"1px solid "+c+"33" }}>
                <div style={{ fontSize:16,fontWeight:800,color:c }}>{v}</div>
                <div style={{ fontSize:10,color:"#6B7280",marginTop:2 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10 }}>
            {stats.topCliente && (
              <div style={{ ...card, background:"linear-gradient(135deg,#1a1200,#2a1f00)", border:"1px solid #FBBF2433", marginBottom:0 }}>
                <div style={{ fontSize:9,color:"#7C83A8",marginBottom:3 }}>🏆 TOP CLIENTE</div>
                <div style={{ fontSize:13,fontWeight:700,color:"#FBBF24",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{stats.topCliente[0]}</div>
                <div style={{ fontSize:11,color:"#F59E0B" }}>{C}{stats.topCliente[1].toLocaleString("es")}</div>
              </div>
            )}
            <div style={{ ...card, background:"linear-gradient(135deg,#0F1E3A,#1e3a5f22)", border:"1px solid #3B82F633", marginBottom:0 }}>
              <div style={{ fontSize:9,color:"#7C83A8",marginBottom:3 }}>📊 TICKET PROMEDIO</div>
              <div style={{ fontSize:16,fontWeight:800,color:"#60A5FA" }}>{C}{stats.ticketPromedio.toFixed(2)}</div>
              <div style={{ fontSize:10,color:"#4B5563" }}>{pagos.length} pagos</div>
            </div>
          </div>

          {stats.proximos>0 && <>
            <div style={secTitle}>⚠️ Vencen pronto</div>
            {clientes.filter(c=>{const e=calcularEstado(c.vencimiento,config.diasAlerta);return e.dias>=0&&e.dias<=config.diasAlerta;}).map(c=>{
              const est=calcularEstado(c.vencimiento,config.diasAlerta);
              return (
                <div key={c.id} style={clientCard} onClick={()=>abrirDetalle(c)}>
                  <div style={avatar(getColor(c.nombre))}>{c.nombre[0].toUpperCase()}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600,fontSize:14 }}>{c.nombre}</div>
                    <div style={{ fontSize:10,color:"#25D366",cursor:"pointer" }} onClick={e=>{e.stopPropagation();abrirWhatsApp(c.whatsapp);}}>💬 {c.whatsapp}</div>
                  </div>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4 }}>
                    <Badge color={est.color} bg={est.bg}>{est.label}</Badge>
                    <button style={{ background:"#25D36622",border:"none",color:"#25D366",borderRadius:8,padding:"3px 8px",fontSize:10,cursor:"pointer" }} onClick={e=>{e.stopPropagation();enviarCobro(c);}}>Cobrar</button>
                  </div>
                </div>
              );
            })}
          </>}

          {stats.vencidos>0 && <>
            <div style={secTitle}>🔴 Vencidos</div>
            {clientes.filter(c=>calcularEstado(c.vencimiento,config.diasAlerta).dias<0).slice(0,5).map(c=>{
              const est=calcularEstado(c.vencimiento,config.diasAlerta);
              return (
                <div key={c.id} style={clientCard} onClick={()=>abrirDetalle(c)}>
                  <div style={avatar(getColor(c.nombre))}>{c.nombre[0].toUpperCase()}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600,fontSize:14 }}>{c.nombre}</div>
                    <div style={{ fontSize:10,color:"#6B7280" }}>Vencio: {formatFecha(c.vencimiento)}</div>
                  </div>
                  <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4 }}>
                    <Badge color={est.color} bg={est.bg}>{Math.abs(est.dias)}d</Badge>
                    <button style={{ background:"#25D36622",border:"none",color:"#25D366",borderRadius:8,padding:"3px 8px",fontSize:10,cursor:"pointer" }} onClick={e=>{e.stopPropagation();enviarCobro(c);}}>Cobrar</button>
                  </div>
                </div>
              );
            })}
          </>}

          {clientes.length===0 && <div style={{ textAlign:"center",padding:"40px 20px",color:"#4B5563" }}><div style={{ fontSize:50,marginBottom:12 }}>📺</div><div style={{ fontSize:15,fontWeight:600,color:"#6B7280" }}>Sin clientes aun</div><div style={{ fontSize:12,color:"#4B5563",marginTop:6 }}>Toca "+ Nuevo" para comenzar</div></div>}
        </>}

        {/* ===== CLIENTES ===== */}
        {vista==="clientes" && <>
          <input style={{ ...inp,marginBottom:10 }} placeholder="🔍 Nombre, WhatsApp, usuario, notas..." value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>
          <div style={{ display:"flex",gap:5,marginBottom:6,flexWrap:"wrap" }}>
            {[["todos","Todos"],["activos","Activos"],["proximos","Pronto"],["vencidos","Vencidos"]].map(([f,l])=>(
              <button key={f} style={chip(filtroEstado===f)} onClick={()=>setFiltroEstado(f)}>{l}</button>
            ))}
          </div>
          <div style={{ display:"flex",gap:5,marginBottom:6,flexWrap:"wrap" }}>
            <button style={chip(filtroPlan==="todos")} onClick={()=>setFiltroPlan("todos")}>Todos</button>
            {PLANES.map(p=><button key={p.id} style={chip(filtroPlan===p.id)} onClick={()=>setFiltroPlan(p.id)}>{p.label}</button>)}
          </div>
          <div style={{ display:"flex",gap:5,marginBottom:10,alignItems:"center" }}>
            <span style={{ fontSize:10,color:"#6B7280" }}>Orden:</span>
            {[["nombre","Nombre"],["vencimiento","Vencimiento"],["reciente","Reciente"]].map(([o,l])=>(
              <button key={o} style={chip(ordenar===o)} onClick={()=>setOrdenar(o)}>{l}</button>
            ))}
          </div>
          <div style={{ fontSize:11,color:"#6B7280",marginBottom:8 }}>{clientesFiltrados.length} cliente{clientesFiltrados.length!==1?"s":""}</div>
          {clientesFiltrados.length===0 && <div style={{ textAlign:"center",padding:"30px 20px" }}><div style={{ fontSize:40 }}>🔍</div><div style={{ color:"#6B7280",marginTop:10 }}>Sin resultados</div></div>}
          {clientesFiltrados.map(c=>{
            const est=calcularEstado(c.vencimiento,config.diasAlerta);
            const dr=diasRestantes(c.vencimiento);
            return (
              <div key={c.id} style={clientCard} onClick={()=>abrirDetalle(c)}>
                <div style={avatar(getColor(c.nombre))}>{c.nombre[0].toUpperCase()}</div>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{c.nombre}</div>
                  <div style={{ fontSize:11,color:"#6B7280" }}>{planLabel(c.plan)} · {c.precio?C+c.precio:"Sin precio"}</div>
                  <div style={{ fontSize:10,color:"#25D366",marginTop:2,cursor:"pointer" }} onClick={e=>{e.stopPropagation();abrirWhatsApp(c.whatsapp);}}>💬 {c.whatsapp}</div>
                </div>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4 }}>
                  <Badge color={est.color} bg={est.bg}>{est.label}</Badge>
                  <CatBadge id={c.categoria||"normal"}/>
                  {dr>0 && <span style={{ fontSize:9,color:"#4B5563" }}>{dr}d restantes</span>}
                </div>
              </div>
            );
          })}
        </>}

        {/* ===== PAGOS ===== */}
        {vista==="pagos" && <>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10 }}>
            <div style={{ background:"linear-gradient(135deg,#0F2A1A,#10B98122)",border:"1px solid #10B98133",borderRadius:12,padding:"12px 14px" }}>
              <div style={{ fontSize:10,color:"#7C83A8",marginBottom:4 }}>TOTAL</div>
              <div style={{ fontSize:20,fontWeight:800,color:"#34D399" }}>{C}{pagos.reduce((s,p)=>s+parseFloat(p.monto||0),0).toLocaleString("es")}</div>
              <div style={{ fontSize:10,color:"#4B5563" }}>{pagos.length} pagos</div>
            </div>
            <div style={{ background:"linear-gradient(135deg,#0F1E3A,#1e3a5f22)",border:"1px solid #3B82F633",borderRadius:12,padding:"12px 14px" }}>
              <div style={{ fontSize:10,color:"#7C83A8",marginBottom:4 }}>ESTE MES</div>
              <div style={{ fontSize:20,fontWeight:800,color:"#60A5FA" }}>{C}{stats.ingresosMes.toLocaleString("es")}</div>
            </div>
          </div>
          {pagos.length===0 && <div style={{ textAlign:"center",padding:"30px 20px" }}><div style={{ fontSize:40 }}>💰</div><div style={{ color:"#6B7280",marginTop:10 }}>Sin pagos aun</div></div>}
          {pagos.map(p=>(
            <div key={p.id} style={{ ...card,padding:"10px 12px" }}>
              <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600,fontSize:14 }}>{p.clienteNombre}</div>
                  <div style={{ fontSize:11,color:"#6B7280" }}>{formatFecha(p.fecha)}{p.nota?" · "+p.nota:""}</div>
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                  <div style={{ fontSize:16,fontWeight:700,color:"#34D399" }}>{C}{parseFloat(p.monto).toLocaleString("es")}</div>
                  <button onClick={()=>abrirEditarPago(p)} style={{ background:"#252840",border:"none",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:12,color:"#9CA3AF" }}>✏️</button>
                  <button onClick={()=>eliminarPago(p.id)} style={{ background:"#EF444422",border:"none",borderRadius:8,padding:"4px 8px",cursor:"pointer",fontSize:12,color:"#EF4444" }}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </>}

        {/* ===== GRAFICAS ===== */}
        {vista==="graficas" && <>
          <div style={secTitle}>📊 Ingresos por mes ({new Date().getFullYear()})</div>
          <div style={card}>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={graficaIngresos} margin={{ top:5,right:5,left:-20,bottom:0 }}>
                <XAxis dataKey="mes" tick={{ fill:"#6B7280",fontSize:9 }}/>
                <YAxis tick={{ fill:"#6B7280",fontSize:9 }}/>
                <Tooltip contentStyle={{ background:"#1A1D2E",border:"1px solid #2A2D45",borderRadius:8,color:"#E8EAF0",fontSize:11 }} formatter={v=>[C+v.toLocaleString("es"),"Ingresos"]}/>
                <Bar dataKey="total" fill="#3B82F6" radius={[4,4,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10 }}>
            {[["Estados",graficaEstados],["Planes",graficaPlanes]].map(([titulo,data])=>(
              <div key={titulo}>
                <div style={secTitle}>{titulo}</div>
                <div style={card}>
                  {data.length>0 ? <>
                    <ResponsiveContainer width="100%" height={120}>
                      <PieChart>
                        <Pie data={data} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value">
                          {data.map((e,i)=><Cell key={i} fill={e.color}/>)}
                        </Pie>
                        <Tooltip contentStyle={{ background:"#1A1D2E",border:"1px solid #2A2D45",borderRadius:8,color:"#E8EAF0",fontSize:10 }}/>
                      </PieChart>
                    </ResponsiveContainer>
                    {data.map(e=>(
                      <div key={e.name} style={{ display:"flex",alignItems:"center",gap:5,marginBottom:3 }}>
                        <div style={{ width:7,height:7,borderRadius:4,background:e.color }}/>
                        <span style={{ fontSize:10,color:"#9CA3AF" }}>{e.name}: {e.value}</span>
                      </div>
                    ))}
                  </> : <div style={{ textAlign:"center",color:"#4B5563",fontSize:11,padding:16 }}>Sin datos</div>}
                </div>
              </div>
            ))}
          </div>
        </>}
      </div>

      {/* ===== MODAL DETALLE ===== */}
      {modal==="detalle" && clienteActivo && (
        <ModalBg onClose={()=>setModal(null)}>
            <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:14 }}>
              <div style={{ ...avatar(getColor(clienteActivo.nombre)),width:48,height:48,fontSize:20,borderRadius:13 }}>{clienteActivo.nombre[0].toUpperCase()}</div>
              <div>
                <div style={{ fontWeight:700,fontSize:16,color:"#fff" }}>{clienteActivo.nombre}</div>
                <div style={{ display:"flex",gap:5,marginTop:3,flexWrap:"wrap" }}>
                  <Badge color={calcularEstado(clienteActivo.vencimiento,config.diasAlerta).color} bg={calcularEstado(clienteActivo.vencimiento,config.diasAlerta).bg}>{calcularEstado(clienteActivo.vencimiento,config.diasAlerta).label}</Badge>
                  <CatBadge id={clienteActivo.categoria||"normal"}/>
                  {diasRestantes(clienteActivo.vencimiento)>0 && <span style={{ fontSize:10,color:"#60A5FA",background:"#1E2B6B",padding:"2px 7px",borderRadius:10 }}>{diasRestantes(clienteActivo.vencimiento)} dias restantes</span>}
                </div>
              </div>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6,marginBottom:12 }}>
              {[["💬","WA","#25D36622","#25D366",()=>abrirWhatsApp(clienteActivo.whatsapp)],
                ["💰","Cobrar","#F59E0B22","#F59E0B",()=>enviarCobro(clienteActivo)],
                ["🔄","Renovar","#3B82F622","#3B82F6",()=>renovarCliente(clienteActivo)],
                ["✏️","Editar","#8B5CF622","#8B5CF6",()=>{setModal(null);setTimeout(()=>abrirEditar(clienteActivo),100);}]
              ].map(([icon,label,bg,color,fn])=>(
                <button key={label} onClick={fn} style={{ background:bg,border:"none",borderRadius:10,padding:"9px 4px",cursor:"pointer",textAlign:"center" }}>
                  <div style={{ fontSize:17 }}>{icon}</div>
                  <div style={{ fontSize:9,color:color,marginTop:2 }}>{label}</div>
                </button>
              ))}
            </div>
            {[["📦 Plan",planLabel(clienteActivo.plan)],["💵 Precio",clienteActivo.precio?C+clienteActivo.precio:"-"],["📅 Inicio",formatFecha(clienteActivo.inicio)],["⏳ Vencimiento",formatFecha(clienteActivo.vencimiento)],["📝 Notas",clienteActivo.notas||"-"]].map(([k,v])=>(
              <div key={k} style={divRow}>
                <span style={{ fontSize:12,color:"#6B7280" }}>{k}</span>
                <span style={{ fontSize:12,fontWeight:600,color:"#E8EAF0",maxWidth:"60%",textAlign:"right" }}>{v}</span>
              </div>
            ))}
            <div style={divRow}>
              <span style={{ fontSize:12,color:"#6B7280" }}>💬 WhatsApp</span>
              <span style={{ fontSize:12,fontWeight:700,color:"#25D366",cursor:"pointer",textDecoration:"underline" }} onClick={()=>abrirWhatsApp(clienteActivo.whatsapp)}>{clienteActivo.whatsapp||"-"}</span>
            </div>
            {[["👤 Usuario TV",clienteActivo.usuarioTv,false],["🔑 Contrasena TV",clienteActivo.claveTv,true]].map(([k,v,esPass])=>(
              <div key={k} style={divRow}>
                <span style={{ fontSize:12,color:"#6B7280" }}>{k}</span>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                  <span style={{ fontSize:12,fontWeight:600,color:"#E8EAF0" }}>{esPass?(verClaveTv?v||"-":(v?"••••••••":"-")):v||"-"}</span>
                  {v&&esPass&&<button onClick={()=>setVerClaveTv(!verClaveTv)} style={{ background:"#252840",border:"none",borderRadius:7,padding:"3px 7px",cursor:"pointer",fontSize:11,color:"#9CA3AF" }}>{verClaveTv?"🙈":"👁️"}</button>}
                  {v&&<button onClick={()=>{copiarTexto(v);showToast("Copiado");}} style={{ background:"#252840",border:"none",borderRadius:7,padding:"3px 7px",cursor:"pointer",fontSize:12 }}>📋</button>}
                </div>
              </div>
            ))}
            {pagos.filter(p=>p.clienteId===clienteActivo.id).length>0 && <>
              <div style={secTitle}>Historial de pagos</div>
              {pagos.filter(p=>p.clienteId===clienteActivo.id).map(p=>(
                <div key={p.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #1E234066" }}>
                  <div style={{ fontSize:12,color:"#6B7280" }}>{formatFecha(p.fecha)}{p.nota?" · "+p.nota:""}</div>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:"#34D399" }}>{C}{parseFloat(p.monto).toLocaleString("es")}</div>
                    <button onClick={()=>abrirEditarPago(p)} style={{ background:"#252840",border:"none",borderRadius:7,padding:"3px 6px",cursor:"pointer",fontSize:11,color:"#9CA3AF" }}>✏️</button>
                  </div>
                </div>
              ))}
            </>}
            <div style={{ marginTop:14 }}>
              <Btn variant="primary" onClick={()=>{setModal(null);setTimeout(()=>abrirPago(clienteActivo),100);}}>💰 Registrar pago</Btn>
              <Btn variant="danger" onClick={()=>eliminarCliente(clienteActivo.id)}>🗑 Eliminar cliente</Btn>
            </div>
          </ModalBg>
      )}

      {/* ===== MODAL NUEVO/EDITAR ===== */}
      {(modal==="nuevo"||modal==="editar") && (
        <ModalBg onClose={()=>setModal(null)}>
          <div style={{ fontSize:15,fontWeight:700,marginBottom:14,color:"#fff" }}>{modal==="nuevo"?"➕ Nuevo cliente":"✏️ Editar cliente"}</div>
          <label style={lbl}>Nombre *</label>
          <input style={inp} name="nombre" value={form.nombre} onChange={handleFormChange} placeholder="Ej: Maria Gonzalez"/>
          <div style={{ height:8 }}/>
          <label style={lbl}>WhatsApp *</label>
          <input style={inp} name="whatsapp" value={form.whatsapp} onChange={handleFormChange} placeholder="Ej: 584141234567" inputMode="tel"/>
          <div style={{ height:8 }}/>
          <label style={lbl}>Categoria</label>
          <div style={{ display:"flex",gap:5,flexWrap:"wrap",marginBottom:10 }}>
            {CATEGORIAS.map(cat=>(
              <button key={cat.id} onClick={()=>handleFormChange({target:{name:"categoria",value:cat.id}})}
                style={{ padding:"5px 11px",borderRadius:20,border:form.categoria===cat.id?"2px solid "+cat.color:"1px solid #2A2D45",background:form.categoria===cat.id?cat.color+"22":"transparent",color:form.categoria===cat.id?cat.color:"#6B7280",fontSize:11,cursor:"pointer" }}>{cat.label}</button>
            ))}
          </div>
          <label style={lbl}>Plan</label>
          <div style={{ display:"flex",gap:5,flexWrap:"wrap",marginBottom:10 }}>
            {PLANES.map(p=><button key={p.id} style={chip(form.plan===p.id)} onClick={()=>handleFormChange({target:{name:"plan",value:p.id}})}>{p.label}</button>)}
          </div>
          <label style={lbl}>Precio</label>
          <input style={inp} name="precio" value={form.precio} onChange={handleFormChange} placeholder="Ej: 5" inputMode="decimal"/>
          <div style={{ height:8 }}/>
          <div style={{ display:"flex",gap:8 }}>
            <div style={{ flex:1 }}><label style={lbl}>Inicio</label><input style={inp} type="date" name="inicio" value={form.inicio} onChange={handleFormChange}/></div>
            <div style={{ flex:1 }}><label style={lbl}>Vencimiento</label><input style={{ ...inp,color:"#60A5FA" }} type="date" name="vencimiento" value={form.vencimiento} onChange={handleFormChange}/></div>
          </div>
          <div style={{ height:8 }}/>
          <div style={{ display:"flex",gap:8 }}>
            <div style={{ flex:1 }}><label style={lbl}>Usuario TV</label><input style={inp} name="usuarioTv" value={form.usuarioTv||""} onChange={handleFormChange} placeholder="usuario123" autoComplete="off"/></div>
            <div style={{ flex:1 }}><label style={lbl}>Contrasena TV</label><input style={inp} name="claveTv" value={form.claveTv||""} onChange={handleFormChange} placeholder="clave456" autoComplete="off"/></div>
          </div>
          <div style={{ height:8 }}/>
          <label style={lbl}>Notas</label>
          <textarea style={{ width:"100%",background:"#0F1117",border:"1px solid #2A2D45",borderRadius:10,padding:"11px 12px",color:"#E8EAF0",fontSize:13,outline:"none",boxSizing:"border-box",resize:"vertical",minHeight:60 }}
            name="notas" value={form.notas} onChange={handleFormChange} placeholder="Ej: TV Box Samsung, piso 3, dispositivo extra..."/>
          <div style={{ height:14 }}/>
          <Btn variant="primary" onClick={guardarCliente}>{modal==="nuevo"?"Guardar cliente":"Guardar cambios"}</Btn>
          <Btn onClick={()=>setModal(null)}>Cancelar</Btn>
        </ModalBg>
      )}

      {/* ===== MODAL PAGO ===== */}
      {modal==="pago" && (
        <ModalBg onClose={()=>setModal(null)}>
          <div style={{ fontSize:15,fontWeight:700,marginBottom:12,color:"#fff" }}>{pagoActivo?"✏️ Editar pago":"💰 Registrar pago"}</div>
          {!pagoActivo && clienteActivo && <div style={{ fontSize:13,color:"#6B7280",marginBottom:12 }}>Cliente: <strong style={{ color:"#E8EAF0" }}>{clienteActivo.nombre}</strong></div>}
          <label style={lbl}>Monto *</label>
          <input style={inp} value={pagoForm.monto} onChange={e=>setPagoForm({...pagoForm,monto:e.target.value})} placeholder="Ej: 5" inputMode="decimal"/>
          <div style={{ height:8 }}/>
          <label style={lbl}>Fecha</label>
          <input style={inp} type="date" value={pagoForm.fecha} onChange={e=>setPagoForm({...pagoForm,fecha:e.target.value})}/>
          <div style={{ height:8 }}/>
          <label style={lbl}>Nota (opcional)</label>
          <input style={inp} value={pagoForm.nota} onChange={e=>setPagoForm({...pagoForm,nota:e.target.value})} placeholder="Ej: Pago julio"/>
          <div style={{ height:14 }}/>
          <Btn variant="primary" onClick={guardarPago}>{pagoActivo?"Guardar cambios":"Guardar pago"}</Btn>
          <Btn onClick={()=>setModal(null)}>Cancelar</Btn>
        </ModalBg>
      )}

      {/* ===== MODAL CONFIG ===== */}
      {modal==="config" && (
        <ModalBg onClose={()=>setModal(null)}>
          <div style={{ fontSize:15,fontWeight:700,marginBottom:14,color:"#fff" }}>⚙️ Configuracion</div>
          <label style={lbl}>Nombre del negocio</label>
          <input style={inp} value={config.negocio} onChange={e=>setConfig({...config,negocio:e.target.value})} placeholder="TV Digital Pro"/>
          <div style={{ height:8 }}/>
          <label style={lbl}>Moneda</label>
          <div style={{ display:"flex",gap:6,marginBottom:10 }}>
            {["$","Bs","Gs","R$","€"].map(m=><button key={m} style={chip(config.moneda===m)} onClick={()=>setConfig({...config,moneda:m})}>{m}</button>)}
          </div>
          <label style={lbl}>Dias de alerta antes del vencimiento</label>
          <input style={inp} type="number" value={config.diasAlerta} onChange={e=>setConfig({...config,diasAlerta:parseInt(e.target.value)||5})} min="1" max="30"/>
          <div style={{ height:8 }}/>
          <label style={lbl}>Mensaje de cobro WhatsApp</label>
          <textarea style={{ width:"100%",background:"#0F1117",border:"1px solid #2A2D45",borderRadius:10,padding:"11px 12px",color:"#E8EAF0",fontSize:13,outline:"none",boxSizing:"border-box",resize:"vertical",minHeight:80 }}
            value={config.mensajeCobro} onChange={e=>setConfig({...config,mensajeCobro:e.target.value})}/>
          <div style={{ fontSize:10,color:"#6B7280",marginBottom:10 }}>Variables: {"{nombre}"} {"{plan}"} {"{precio}"} {"{moneda}"} {"{vencimiento}"}</div>
          <div style={{ height:1,background:"#1E2340",margin:"14px 0" }}/>
          <div style={{ fontSize:12,fontWeight:600,color:"#7C83A8",marginBottom:10 }}>🔐 CAMBIAR ACCESO</div>
          <div style={{ display:"flex",gap:8 }}>
            <div style={{ flex:1 }}>
              <label style={lbl}>Nuevo usuario</label>
              <input style={inp} value={configCreds.usuario} onChange={e=>setConfigCreds({...configCreds,usuario:e.target.value})} placeholder="admin"/>
            </div>
            <div style={{ flex:1 }}>
              <label style={lbl}>Nueva contrasena</label>
              <input style={inp} type="password" value={configCreds.clave} onChange={e=>setConfigCreds({...configCreds,clave:e.target.value})} placeholder="••••••"/>
            </div>
          </div>
          <div style={{ height:14 }}/>
          <Btn variant="primary" onClick={async ()=>{
            saveConfigLocal(config);
            if (SUPABASE_READY) { setSyncing(true); await db.saveConfig(config); setSyncing(false); setSynced(true); }
            localStorage.setItem(CREDENCIALES_KEY, JSON.stringify(configCreds));
            setModal(null); showToast("Configuracion guardada");
          }}>Guardar configuracion</Btn>
          <Btn onClick={()=>setModal(null)}>Cancelar</Btn>
        </ModalBg>
      )}

      {modal==="errorSync" && (
        <ModalBg onClose={()=>setModal(null)}>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:14, color:"#EF4444" }}>⚠️ Error de sincronizacion</div>
          <div style={{ background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:12, marginBottom:14 }}>
            <div style={{ fontSize:12, color:"#9CA3AF", wordBreak:"break-word", whiteSpace:"pre-wrap" }}>{errorDetalle || "Sin detalles del error"}</div>
          </div>
          <div style={{ fontSize:11, color:"#6B7280", marginBottom:14 }}>
            Tus datos siguen guardados localmente en este dispositivo. Revisa la configuracion de Supabase (RLS, CORS, o las claves de API) y vuelve a intentar.
          </div>
          <Btn onClick={()=>setModal(null)}>Cerrar</Btn>
        </ModalBg>
      )}

      <Toast toast={toast}/>
    </div>
  );
}
