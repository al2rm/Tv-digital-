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
  async getCuentasTV() {
    const data = await supaFetch("cuentas_tv?order=created_at.desc");
    return data || [];
  },
  async upsertCuentaTV(c) {
    return supaFetch("cuentas_tv?on_conflict=id", {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify(c),
    });
  },
  async deleteCuentaTV(id) {
    return supaFetch("cuentas_tv?id=eq." + id, { method: "DELETE", prefer: "" });
  },
  async getTareas() {
    const data = await supaFetch("tareas?order=fecha.asc");
    return data || [];
  },
  async upsertTarea(t) {
    return supaFetch("tareas?on_conflict=id", {
      method: "POST",
      prefer: "return=representation,resolution=merge-duplicates",
      body: JSON.stringify(t),
    });
  },
  async deleteTarea(id) {
    return supaFetch("tareas?id=eq." + id, { method: "DELETE", prefer: "" });
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
const CUENTASTV_KEY = "tvdigital_cuentastv";
const TAREAS_KEY = "tvdigital_tareas";
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

const TIPOS_TAREA = [
  { id: "reclamo", label: "Reclamo / Visita", icon: "🔧", color: "#EF4444" },
  { id: "promesa_pago", label: "Promesa de pago", icon: "💰", color: "#F59E0B" },
  { id: "otro", label: "Otro", icon: "📝", color: "#6B7280" },
];

const CONFIG_DEFAULT = {
  negocio: "TV Digital Pro",
  moneda: "$",
  diasAlerta: 5,
  mensajeCobro: "Hola {nombre}, tu servicio de TV Digital ({plan}) vence el {vencimiento}. El costo de renovacion es {moneda}{precio}. Gracias!",
  mensajesPorCategoria: {
    normal: "",
    vip: "Hola {nombre}! Como cliente VIP, te recordamos que tu servicio ({plan}) vence el {vencimiento}. Costo: {moneda}{precio}. Gracias por tu confianza!",
    prueba: "Hola {nombre}, tu periodo de prueba de TV Digital vence el {vencimiento}. Si deseas continuar, el costo es {moneda}{precio} por el plan {plan}. Avisame!",
    suspendido: "Hola {nombre}, tu servicio esta suspendido por falta de pago desde el {vencimiento}. Para reactivarlo, el costo es {moneda}{precio}. Quedo atento!",
  },
  diasFantasma: 30,
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

function quitarAcentos(txt) {
  return (txt||"").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function generarUsuarioAuto(nombreCliente) {
  const base = quitarAcentos(nombreCliente||"user").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0,8) || "user";
  const num = Math.floor(1000 + Math.random()*9000);
  return base + num;
}

function generarClaveAuto() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i=0; i<8; i++) out += chars[Math.floor(Math.random()*chars.length)];
  return out;
}

function generarClaveNumerica6() {
  let out = "";
  for (let i=0; i<6; i++) out += Math.floor(Math.random()*10);
  return out;
}

function siguienteNumeroUsuarioTV(cuentasTV) {
  let max = 0;
  cuentasTV.forEach(ct => {
    const m = (ct.emailTV||"").match(/^user0*(\d+)@/i);
    if (m) { const n = parseInt(m[1],10); if (n>max) max=n; }
  });
  return max+1;
}

function generarEmailAuto(cuentasTV) {
  const n = siguienteNumeroUsuarioTV(cuentasTV);
  return "user" + String(n).padStart(5,"0") + "@tv.es";
}

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

function procesarImagenLogo(file, callback) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      callback(canvas.toDataURL("image/png", 0.85));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function planLabel(id) { return PLANES.find(x => x.id === id)?.label || id; }

function getDispositivos(c) {
  const lista = Array.isArray(c.dispositivos) ? [...c.dispositivos] : [];
  // Compatibilidad con clientes antiguos que solo tenian usuarioTv/claveTv
  if (lista.length === 0 && (c.usuarioTv || c.claveTv)) {
    return [{ nombre: "Principal", usuario: c.usuarioTv || "", clave: c.claveTv || "" }];
  }
  return lista;
}
function catInfo(id) { return CATEGORIAS.find(x => x.id === id) || CATEGORIAS[0]; }
function tipoInfo(id) { return TIPOS_TAREA.find(x => x.id === id) || TIPOS_TAREA[2]; }

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
  vencimiento: "", precio: "", documento: "", usuarioTv: "", claveTv: "", dispositivos: [], maxDispositivos: 4, zona: "", referidoPor: "", notas: "",
  cuentaTvId: null, perfilNumero: null,
};

// ===================== LOGIN =====================
function LoginScreen({ onLogin, logoUrl, negocio }) {
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
        {logoUrl
          ? <img src={logoUrl} alt="logo" style={{ width:68, height:68, borderRadius:20, objectFit:"cover", margin:"0 auto 20px", display:"block" }} />
          : <div style={{ width:68, height:68, background:"linear-gradient(135deg,#3B82F6,#8B5CF6)", borderRadius:20, display:"flex", alignItems:"center", justifyContent:"center", fontSize:32, margin:"0 auto 20px" }}>📺</div>
        }
        <div style={{ textAlign:"center", fontSize:22, fontWeight:800, color:"#fff", marginBottom:6 }}>{negocio||"TV Digital Pro"}</div>
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
  const [cuentasTV, setCuentasTV] = useState([]);
  const [tareas, setTareas] = useState([]);
  const [config, setConfig] = useState(CONFIG_DEFAULT);
  const [vista, setVista] = useState("cobros");
  const [modal, setModal] = useState(null);
  const [nuevaNota, setNuevaNota] = useState("");
  const [pagoRecienGuardado, setPagoRecienGuardado] = useState(null);
  const [clienteAEliminar, setClienteAEliminar] = useState(null);
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
  const [catMsgAbierta, setCatMsgAbierta] = useState(null);
  const [mesReporte, setMesReporte] = useState(new Date().toISOString().slice(0,7));
  const [cuentaExpandida, setCuentaExpandida] = useState(null);
  const [cuentaAEliminar, setCuentaAEliminar] = useState(null);
  const EMPTY_TAREA = { clienteId:"", clienteNombre:"", tipo:"reclamo", descripcion:"", fecha:new Date().toISOString().split("T")[0], estado:"pendiente" };
  const [formTarea, setFormTarea] = useState(EMPTY_TAREA);
  const [tareaActiva, setTareaActiva] = useState(null);
  const [buscarClienteTarea, setBuscarClienteTarea] = useState("");
  const [filtroTareas, setFiltroTareas] = useState("hoy");
  const [perfilAVincular, setPerfilAVincular] = useState(null);
  const [reporteClientesFiltro, setReporteClientesFiltro] = useState("todos");
  const [reporteTareasFiltro, setReporteTareasFiltro] = useState("pendientes");
  const [reporteFechaDesde, setReporteFechaDesde] = useState(new Date(Date.now()-30*86400000).toISOString().split("T")[0]);
  const [reporteFechaHasta, setReporteFechaHasta] = useState(new Date().toISOString().split("T")[0]);
  const [buscarClienteVincular, setBuscarClienteVincular] = useState("");
  const [clienteDispositivos, setClienteDispositivos] = useState(null);
  const EMPTY_USUARIO_TV = { emailTV:"", claveTV:"", plan:"mensual" };
  const [formUsuarioTV, setFormUsuarioTV] = useState(EMPTY_USUARIO_TV);

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
        try {
          const ct = await db.getCuentasTV();
          if (ct.length) setCuentasTV(ct);
          else {
            const local = localStorage.getItem(CUENTASTV_KEY);
            if (local) setCuentasTV(JSON.parse(local));
          }
        } catch (e) {
          const local = localStorage.getItem(CUENTASTV_KEY);
          if (local) setCuentasTV(JSON.parse(local));
        }
        try {
          const t = await db.getTareas();
          if (t.length) setTareas(t);
          else {
            const local = localStorage.getItem(TAREAS_KEY);
            if (local) setTareas(JSON.parse(local));
          }
        } catch (e) {
          const local = localStorage.getItem(TAREAS_KEY);
          if (local) setTareas(JSON.parse(local));
        }
      } else {
        const c = localStorage.getItem(STORAGE_KEY);
        const p = localStorage.getItem(PAGOS_KEY);
        const cf = localStorage.getItem(CONFIG_KEY);
        const ct = localStorage.getItem(CUENTASTV_KEY);
        const t = localStorage.getItem(TAREAS_KEY);
        if (c) setClientes(JSON.parse(c));
        if (p) setPagos(JSON.parse(p));
        if (cf) setConfig({ ...CONFIG_DEFAULT, ...JSON.parse(cf) });
        if (ct) setCuentasTV(JSON.parse(ct));
        if (t) setTareas(JSON.parse(t));
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
  async function saveCuentasTV(data) {
    setCuentasTV(data);
    localStorage.setItem(CUENTASTV_KEY, JSON.stringify(data));
  }
  async function saveTareas(data) {
    setTareas(data);
    localStorage.setItem(TAREAS_KEY, JSON.stringify(data));
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

  async function syncCuentaTV(cuenta) {
    if (!SUPABASE_READY) return;
    try { await db.upsertCuentaTV(cuenta); } catch (e) { showToast("La cuenta se guardo local (falta tabla cuentas_tv en Supabase)","err"); }
  }

  async function syncDeleteCuentaTV(id) {
    if (!SUPABASE_READY) return;
    try { await db.deleteCuentaTV(id); } catch {}
  }

  async function syncTarea(tarea) {
    if (!SUPABASE_READY) return;
    try { await db.upsertTarea(tarea); } catch {}
  }

  async function syncDeleteTarea(id) {
    if (!SUPABASE_READY) return;
    try { await db.deleteTarea(id); } catch {}
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

  function generarReporteMensual(anioMes) {
    const [anio, mesNum] = anioMes.split("-");
    const nombresMes = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const nombreMes = nombresMes[parseInt(mesNum)-1];

    const pagosDelMes = pagos.filter(p => (p.fecha||"").startsWith(anioMes)).sort((a,b)=> a.fecha < b.fecha ? -1 : 1);
    const totalIngresos = pagosDelMes.reduce((s,p)=>s+parseFloat(p.monto||0),0);

    const inicioMes = anioMes + "-01";
    const clientesNuevos = clientes.filter(c => (c.created_at||"").startsWith(anioMes) || (c.inicio||"").startsWith(anioMes));

    const activosAlCierre = clientes.filter(c => calcularEstado(c.vencimiento, config.diasAlerta).dias >= 0).length;
    const vencidosAlCierre = clientes.filter(c => calcularEstado(c.vencimiento, config.diasAlerta).dias < 0).length;

    const porPlan = {};
    clientes.forEach(c => { const l = planLabel(c.plan); porPlan[l] = (porPlan[l]||0)+1; });

    const filasPagos = pagosDelMes.map(p => `
      <tr>
        <td>${formatFecha(p.fecha)}</td>
        <td>${p.clienteNombre}</td>
        <td>${p.nota||"-"}</td>
        <td style="text-align:right;font-weight:600;">${C}${parseFloat(p.monto).toLocaleString("es")}</td>
      </tr>`).join("");

    const filasPlanes = Object.entries(porPlan).map(([plan,n]) => `
      <tr><td>${plan}</td><td style="text-align:right;">${n}</td></tr>`).join("");

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Reporte ${nombreMes} ${anio} - ${config.negocio||"TV Digital Pro"}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; padding:32px; max-width:800px; margin:0 auto; }
  .header { display:flex; align-items:center; gap:14px; border-bottom:3px solid #3B82F6; padding-bottom:16px; margin-bottom:24px; }
  .header img { width:52px; height:52px; border-radius:12px; object-fit:cover; }
  .header .logo-fallback { width:52px; height:52px; border-radius:12px; background:linear-gradient(135deg,#3B82F6,#8B5CF6); display:flex; align-items:center; justify-content:center; font-size:24px; color:#fff; }
  .header h1 { font-size:20px; color:#111; }
  .header p { font-size:13px; color:#666; margin-top:2px; }
  h2 { font-size:15px; color:#3B82F6; margin:26px 0 10px; text-transform:uppercase; letter-spacing:0.5px; }
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:10px; }
  .stat-box { border:1px solid #e2e8f0; border-radius:10px; padding:12px; }
  .stat-box .val { font-size:20px; font-weight:800; color:#1a1a1a; }
  .stat-box .lbl { font-size:10px; color:#888; text-transform:uppercase; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { text-align:left; background:#f1f5f9; padding:8px 10px; font-size:11px; color:#475569; text-transform:uppercase; }
  td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
  .total-row td { font-weight:800; border-top:2px solid #3B82F6; border-bottom:none; padding-top:10px; }
  .footer { margin-top:36px; text-align:center; font-size:11px; color:#999; border-top:1px solid #eee; padding-top:14px; }
  @media print { body { padding:10px; } }
</style>
</head>
<body>
  <div class="header">
    ${config.logoUrl ? `<img src="${config.logoUrl}" />` : `<div class="logo-fallback">📺</div>`}
    <div>
      <h1>${config.negocio||"TV Digital Pro"}</h1>
      <p>Reporte mensual · ${nombreMes} ${anio}</p>
    </div>
  </div>

  <h2>Resumen del mes</h2>
  <div class="stats">
    <div class="stat-box"><div class="val">${C}${totalIngresos.toLocaleString("es")}</div><div class="lbl">Ingresos del mes</div></div>
    <div class="stat-box"><div class="val">${pagosDelMes.length}</div><div class="lbl">Pagos registrados</div></div>
    <div class="stat-box"><div class="val">${clientesNuevos.length}</div><div class="lbl">Clientes nuevos</div></div>
    <div class="stat-box"><div class="val">${clientes.length}</div><div class="lbl">Total clientes</div></div>
  </div>

  <h2>Estado actual de la cartera</h2>
  <div class="stats" style="grid-template-columns:repeat(2,1fr);">
    <div class="stat-box"><div class="val" style="color:#10B981;">${activosAlCierre}</div><div class="lbl">Clientes activos</div></div>
    <div class="stat-box"><div class="val" style="color:#EF4444;">${vencidosAlCierre}</div><div class="lbl">Clientes vencidos</div></div>
  </div>

  <h2>Distribucion por plan</h2>
  <table>
    <thead><tr><th>Plan</th><th style="text-align:right;">Clientes</th></tr></thead>
    <tbody>${filasPlanes || '<tr><td colspan="2">Sin datos</td></tr>'}</tbody>
  </table>

  <h2>Detalle de pagos del mes</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Cliente</th><th>Nota</th><th style="text-align:right;">Monto</th></tr></thead>
    <tbody>
      ${filasPagos || '<tr><td colspan="4">Sin pagos registrados este mes</td></tr>'}
      <tr class="total-row"><td colspan="3">TOTAL</td><td style="text-align:right;">${C}${totalIngresos.toLocaleString("es")}</td></tr>
    </tbody>
  </table>

  <div class="footer">Generado el ${new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})} · ${config.negocio||"TV Digital Pro"}</div>

  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body>
</html>`;

    const ventana = window.open("", "_blank");
    if (ventana) {
      ventana.document.write(html);
      ventana.document.close();
    } else {
      showToast("Habilita ventanas emergentes para ver el reporte", "err");
    }
  }

  function abrirVentanaReporte(subtitulo, cuerpoHTML) {
    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>${subtitulo} - ${config.negocio||"TV Digital Pro"}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color:#1a1a1a; padding:32px; max-width:800px; margin:0 auto; }
  .header { display:flex; align-items:center; gap:14px; border-bottom:3px solid #3B82F6; padding-bottom:16px; margin-bottom:24px; }
  .header img { width:52px; height:52px; border-radius:12px; object-fit:cover; }
  .header .logo-fallback { width:52px; height:52px; border-radius:12px; background:linear-gradient(135deg,#3B82F6,#8B5CF6); display:flex; align-items:center; justify-content:center; font-size:24px; color:#fff; }
  .header h1 { font-size:20px; color:#111; }
  .header p { font-size:13px; color:#666; margin-top:2px; }
  h2 { font-size:15px; color:#3B82F6; margin:26px 0 10px; text-transform:uppercase; letter-spacing:0.5px; }
  .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:10px; }
  .stat-box { border:1px solid #e2e8f0; border-radius:10px; padding:12px; }
  .stat-box .val { font-size:20px; font-weight:800; color:#1a1a1a; }
  .stat-box .lbl { font-size:10px; color:#888; text-transform:uppercase; margin-top:2px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th { text-align:left; background:#f1f5f9; padding:8px 10px; font-size:11px; color:#475569; text-transform:uppercase; }
  td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
  .total-row td { font-weight:800; border-top:2px solid #3B82F6; border-bottom:none; padding-top:10px; }
  .badge { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700; }
  .footer { margin-top:36px; text-align:center; font-size:11px; color:#999; border-top:1px solid #eee; padding-top:14px; }
  @media print { body { padding:10px; } }
</style>
</head>
<body>
  <div class="header">
    ${config.logoUrl ? `<img src="${config.logoUrl}" />` : `<div class="logo-fallback">📺</div>`}
    <div>
      <h1>${config.negocio||"TV Digital Pro"}</h1>
      <p>${subtitulo}</p>
    </div>
  </div>
  ${cuerpoHTML}
  <div class="footer">Generado el ${new Date().toLocaleDateString("es-ES",{day:"2-digit",month:"long",year:"numeric"})} · ${config.negocio||"TV Digital Pro"}</div>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };</script>
</body>
</html>`;
    const ventana = window.open("", "_blank");
    if (ventana) {
      ventana.document.write(html);
      ventana.document.close();
    } else {
      showToast("Habilita ventanas emergentes para ver el reporte", "err");
    }
  }

  function generarReporteClientes(filtro) {
    let lista = [...clientes];
    if (filtro==="activos") lista = lista.filter(c => calcularEstado(c.vencimiento, config.diasAlerta).dias >= 0);
    if (filtro==="vencidos") lista = lista.filter(c => calcularEstado(c.vencimiento, config.diasAlerta).dias < 0);
    lista.sort((a,b) => a.nombre.localeCompare(b.nombre));

    const filas = lista.map(c => {
      const est = calcularEstado(c.vencimiento, config.diasAlerta);
      const color = est.dias < 0 ? "#EF4444" : est.dias <= config.diasAlerta ? "#F59E0B" : "#10B981";
      return `<tr>
        <td>${c.nombre}</td>
        <td>${c.whatsapp||"-"}</td>
        <td>${planLabel(c.plan)}</td>
        <td>${c.zona||"-"}</td>
        <td>${formatFecha(c.vencimiento)}</td>
        <td><span class="badge" style="background:${color}22;color:${color};">${est.label}</span></td>
      </tr>`;
    }).join("");

    const titulo = filtro==="activos" ? "Clientes activos" : filtro==="vencidos" ? "Clientes vencidos" : "Todos los clientes";
    const cuerpo = `
      <h2>${titulo}</h2>
      <div class="stats" style="grid-template-columns:repeat(3,1fr);">
        <div class="stat-box"><div class="val">${lista.length}</div><div class="lbl">Clientes en este reporte</div></div>
        <div class="stat-box"><div class="val" style="color:#10B981;">${clientes.filter(c=>calcularEstado(c.vencimiento,config.diasAlerta).dias>=0).length}</div><div class="lbl">Activos (total)</div></div>
        <div class="stat-box"><div class="val" style="color:#EF4444;">${clientes.filter(c=>calcularEstado(c.vencimiento,config.diasAlerta).dias<0).length}</div><div class="lbl">Vencidos (total)</div></div>
      </div>
      <table>
        <thead><tr><th>Nombre</th><th>WhatsApp</th><th>Plan</th><th>Zona</th><th>Vencimiento</th><th>Estado</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="6">Sin clientes</td></tr>'}</tbody>
      </table>`;
    abrirVentanaReporte(titulo, cuerpo);
  }

  function generarReportePagos(desde, hasta) {
    const lista = pagos.filter(p => (p.fecha||"") >= desde && (p.fecha||"") <= hasta).sort((a,b)=> a.fecha < b.fecha ? -1 : 1);
    const total = lista.reduce((s,p)=>s+parseFloat(p.monto||0),0);
    const filas = lista.map(p => `<tr>
        <td>${formatFecha(p.fecha)}</td>
        <td>${p.clienteNombre}</td>
        <td>${p.nota||"-"}</td>
        <td style="text-align:right;font-weight:600;">${C}${parseFloat(p.monto).toLocaleString("es")}</td>
      </tr>`).join("");
    const cuerpo = `
      <h2>Pagos del ${formatFecha(desde)} al ${formatFecha(hasta)}</h2>
      <div class="stats" style="grid-template-columns:repeat(2,1fr);">
        <div class="stat-box"><div class="val">${C}${total.toLocaleString("es")}</div><div class="lbl">Total del periodo</div></div>
        <div class="stat-box"><div class="val">${lista.length}</div><div class="lbl">Pagos registrados</div></div>
      </div>
      <table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Nota</th><th style="text-align:right;">Monto</th></tr></thead>
        <tbody>
          ${filas || '<tr><td colspan="4">Sin pagos en este periodo</td></tr>'}
          <tr class="total-row"><td colspan="3">TOTAL</td><td style="text-align:right;">${C}${total.toLocaleString("es")}</td></tr>
        </tbody>
      </table>`;
    abrirVentanaReporte("Reporte de pagos", cuerpo);
  }

  function generarReporteVencidos() {
    const lista = clientes
      .filter(c => calcularEstado(c.vencimiento, config.diasAlerta).dias < 0)
      .sort((a,b) => a.vencimiento < b.vencimiento ? -1 : 1);
    const filas = lista.map(c => {
      const dias = Math.abs(calcularEstado(c.vencimiento, config.diasAlerta).dias);
      return `<tr>
        <td>${c.nombre}</td>
        <td>${c.whatsapp||"-"}</td>
        <td>${formatFecha(c.vencimiento)}</td>
        <td style="text-align:right;color:#EF4444;font-weight:700;">${dias} dias</td>
        <td>${c.precio ? C+c.precio : "-"}</td>
      </tr>`;
    }).join("");
    const totalAdeudado = lista.reduce((s,c)=>s+parseFloat(c.precio||0),0);
    const cuerpo = `
      <h2>Clientes vencidos</h2>
      <div class="stats" style="grid-template-columns:repeat(2,1fr);">
        <div class="stat-box"><div class="val" style="color:#EF4444;">${lista.length}</div><div class="lbl">Clientes vencidos</div></div>
        <div class="stat-box"><div class="val">${C}${totalAdeudado.toLocaleString("es")}</div><div class="lbl">Posible cobro pendiente</div></div>
      </div>
      <table>
        <thead><tr><th>Nombre</th><th>WhatsApp</th><th>Vencio</th><th style="text-align:right;">Dias atraso</th><th>Precio</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="5">Sin clientes vencidos - todo al dia!</td></tr>'}</tbody>
      </table>`;
    abrirVentanaReporte("Reporte de vencidos", cuerpo);
  }

  function generarReporteTareas(filtro) {
    let lista = [...tareas];
    if (filtro==="pendientes") lista = lista.filter(t => t.estado==="pendiente");
    if (filtro==="completadas") lista = lista.filter(t => t.estado==="completado");
    lista.sort((a,b)=> a.fecha < b.fecha ? -1 : 1);

    const filas = lista.map(t => {
      const tipo = tipoInfo(t.tipo);
      const colorEstado = t.estado==="completado" ? "#10B981" : "#F59E0B";
      return `<tr>
        <td>${formatFecha(t.fecha)}</td>
        <td>${t.clienteNombre}</td>
        <td>${tipo.icon} ${tipo.label}</td>
        <td>${t.descripcion||"-"}</td>
        <td><span class="badge" style="background:${colorEstado}22;color:${colorEstado};">${t.estado==="completado"?"Completada":"Pendiente"}</span></td>
      </tr>`;
    }).join("");

    const titulo = filtro==="pendientes" ? "Tareas pendientes" : filtro==="completadas" ? "Tareas completadas" : "Todas las tareas";
    const cuerpo = `
      <h2>${titulo}</h2>
      <div class="stats" style="grid-template-columns:repeat(3,1fr);">
        <div class="stat-box"><div class="val">${lista.length}</div><div class="lbl">En este reporte</div></div>
        <div class="stat-box"><div class="val" style="color:#F59E0B;">${tareas.filter(t=>t.estado==="pendiente").length}</div><div class="lbl">Pendientes (total)</div></div>
        <div class="stat-box"><div class="val" style="color:#10B981;">${tareas.filter(t=>t.estado==="completado").length}</div><div class="lbl">Completadas (total)</div></div>
      </div>
      <table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Tipo</th><th>Descripcion</th><th>Estado</th></tr></thead>
        <tbody>${filas || '<tr><td colspan="5">Sin tareas</td></tr>'}</tbody>
      </table>`;
    abrirVentanaReporte(titulo, cuerpo);
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
    const headers = ["Nombre","WhatsApp","Plan","Categoria","Precio","Inicio","Vencimiento","Estado","Dias","Dispositivos","Notas"];
    const rows = clientes.map(c => {
      const est = calcularEstado(c.vencimiento, config.diasAlerta);
      const dispositivosTxt = getDispositivos(c).map(d => (d.nombre||"Dispositivo")+": "+(d.usuario||"")+"/"+(d.clave||"")).join(" | ");
      return [c.nombre,c.whatsapp,planLabel(c.plan),c.categoria||"normal",c.precio,c.inicio,c.vencimiento,est.label,est.dias,dispositivosTxt,c.notas].map(esc).join(",");
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
    const cat = c.categoria || "normal";
    const plantillaCategoria = (config.mensajesPorCategoria || {})[cat];
    const plantilla = (plantillaCategoria && plantillaCategoria.trim()) ? plantillaCategoria : config.mensajeCobro;
    const msg = (plantilla||"")
      .replace("{nombre}", c.nombre).replace("{plan}", planLabel(c.plan))
      .replace("{precio}", c.precio||"").replace("{moneda}", config.moneda||"$")
      .replace("{vencimiento}", formatFecha(c.vencimiento));
    abrirWhatsApp(c.whatsapp, msg);
    const hoy = new Date().toISOString().split("T")[0];
    const updated = { ...c, ultimoCobroEnviado: hoy };
    const newList = clientes.map(x => x.id===c.id ? updated : x);
    saveClientes(newList);
    syncCliente(updated);
  }

  function yaCobradoHoy(c) {
    const hoy = new Date().toISOString().split("T")[0];
    return c.ultimoCobroEnviado === hoy;
  }

  // RENOVACION INTELIGENTE
  function renovarCliente(c) {
    const nuevoVenc = calcularVencimiento(c.vencimiento, c.plan);
    const updated = { ...c, vencimiento:nuevoVenc };
    const newList = clientes.map(x => x.id===c.id ? updated : x);
    saveClientes(newList);
    syncCliente(updated);
    showToast("Renovado: vence " + formatFecha(nuevoVenc));
    setModal(null);
  }

  function agregarNota(c, texto) {
    if (!texto.trim()) return;
    const entrada = { id:generarId(), texto:texto.trim(), fecha:new Date().toISOString() };
    const historial = [entrada, ...(c.historialNotas||[])];
    const updated = { ...c, historialNotas:historial };
    const newList = clientes.map(x => x.id===c.id ? updated : x);
    saveClientes(newList);
    syncCliente(updated);
    setClienteActivo(updated);
    setNuevaNota("");
    showToast("Nota agregada");
  }

  function eliminarNota(c, notaId) {
    const historial = (c.historialNotas||[]).filter(n => n.id !== notaId);
    const updated = { ...c, historialNotas:historial };
    const newList = clientes.map(x => x.id===c.id ? updated : x);
    saveClientes(newList);
    syncCliente(updated);
    setClienteActivo(updated);
  }

  function guardarDispositivoSlot(c, idx, cambios) {
    const lista = getDispositivos(c);
    while (lista.length <= idx) lista.push({ nombre:"", usuario:"", clave:"" });
    lista[idx] = { ...lista[idx], ...cambios };
    const updated = { ...c, dispositivos: lista };
    const newList = clientes.map(x => x.id===c.id ? updated : x);
    saveClientes(newList);
    syncCliente(updated);
    setClienteDispositivos(updated);
    if (clienteActivo && clienteActivo.id===c.id) setClienteActivo(updated);
  }

  function eliminarDispositivoSlot(c, idx) {
    const lista = getDispositivos(c).filter((_,i)=>i!==idx);
    const updated = { ...c, dispositivos: lista };
    const newList = clientes.map(x => x.id===c.id ? updated : x);
    saveClientes(newList);
    syncCliente(updated);
    setClienteDispositivos(updated);
    if (clienteActivo && clienteActivo.id===c.id) setClienteActivo(updated);
  }

  function enviarRecibo(cliente, pago) {
    const lineas = [
      "🧾 *Comprobante de pago*",
      "",
      "Cliente: " + cliente.nombre,
      "Plan: " + planLabel(cliente.plan),
      "Monto: " + (config.moneda||"$") + parseFloat(pago.monto).toLocaleString("es"),
      "Fecha: " + formatFecha(pago.fecha),
      pago.nota ? "Nota: " + pago.nota : null,
      "Proximo vencimiento: " + formatFecha(cliente.vencimiento),
      "",
      "Gracias por tu pago! - " + (config.negocio||"TV Digital Pro"),
    ].filter(Boolean);
    abrirWhatsApp(cliente.whatsapp, lineas.join("\n"));
  }


  // CRUD CLIENTES
  const abrirNuevo = useCallback(() => {
    setForm({ ...EMPTY_FORM, inicio:new Date().toISOString().split("T")[0] });
    setModal("nuevo");
  }, []);

  const abrirNuevoParaPerfil = useCallback((cuentaTvId, perfilNumero) => {
    setForm({ ...EMPTY_FORM, inicio:new Date().toISOString().split("T")[0], cuentaTvId, perfilNumero });
    setModal("nuevo");
  }, []);


  const abrirEditar = useCallback((c) => {
    setForm({ ...c, dispositivos: getDispositivos(c), maxDispositivos: c.maxDispositivos || 4 }); setClienteActivo(c); setModal("editar");
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

  async function guardarUsuarioTV() {
    const f = formUsuarioTV;
    if (!f.emailTV.trim()) return showToast("Falta el email","err");
    if (!f.claveTV.trim()) return showToast("Falta la contrasena","err");
    const dup = cuentasTV.find(ct => (ct.emailTV||"").toLowerCase()===f.emailTV.trim().toLowerCase());
    if (dup) return showToast("Ese email ya esta en uso","err");
    const nuevaCuenta = {
      id: generarId(),
      emailTV: f.emailTV.trim(),
      claveTV: f.claveTV,
      planDefault: f.plan,
      maxPerfiles: 4,
      created_at: new Date().toISOString(),
    };
    const newList = [nuevaCuenta, ...cuentasTV];
    await saveCuentasTV(newList);
    syncCuentaTV(nuevaCuenta);
    showToast("Cuenta TV creada");
    setFormUsuarioTV(EMPTY_USUARIO_TV);
    setModal(null);
    setCuentaExpandida(nuevaCuenta.id);
  }

  async function eliminarCuentaTV(id) {
    const clientesLigados = clientes.filter(c => c.cuentaTvId===id);
    if (clientesLigados.length) {
      const actualizados = clientesLigados.map(c => ({ ...c, cuentaTvId:null, perfilNumero:null }));
      const newClientes = clientes.map(c => { const u = actualizados.find(a=>a.id===c.id); return u || c; });
      await saveClientes(newClientes);
      actualizados.forEach(syncCliente);
    }
    const newCuentas = cuentasTV.filter(ct => ct.id!==id);
    await saveCuentasTV(newCuentas);
    syncDeleteCuentaTV(id);
    setModal(null); setCuentaAEliminar(null);
    showToast("Cuenta TV eliminada");
  }

  async function vincularClienteExistente(cliente) {
    if (!perfilAVincular) return;
    if (cliente.cuentaTvId) return showToast("Ese cliente ya esta vinculado a otra cuenta","err");
    const updated = { ...cliente, cuentaTvId: perfilAVincular.cuentaTvId, perfilNumero: perfilAVincular.perfilNumero };
    const newList = clientes.map(c => c.id===cliente.id ? updated : c);
    await saveClientes(newList);
    syncCliente(updated);
    setModal(null);
    setPerfilAVincular(null);
    setBuscarClienteVincular("");
    showToast("Cliente vinculado a la cuenta TV");
  }

  async function guardarTarea() {
    if (!formTarea.clienteId) return showToast("Selecciona un cliente","err");
    if (!formTarea.descripcion.trim()) return showToast("Escribe una descripcion","err");
    if (!formTarea.fecha) return showToast("Elige una fecha","err");
    if (tareaActiva) {
      const updated = { ...tareaActiva, ...formTarea };
      const newList = tareas.map(t => t.id===tareaActiva.id ? updated : t);
      await saveTareas(newList);
      syncTarea(updated);
      showToast("Tarea actualizada");
    } else {
      const nueva = { id:generarId(), ...formTarea, created_at:new Date().toISOString() };
      const newList = [nueva, ...tareas];
      await saveTareas(newList);
      syncTarea(nueva);
      showToast("Tarea agregada");
    }
    setFormTarea(EMPTY_TAREA);
    setTareaActiva(null);
    setModal(null);
  }

  async function completarTarea(t) {
    const updated = { ...t, estado: t.estado==="completado" ? "pendiente" : "completado", completado_at: t.estado==="completado" ? null : new Date().toISOString() };
    const newList = tareas.map(x => x.id===t.id ? updated : x);
    await saveTareas(newList);
    syncTarea(updated);
    showToast(updated.estado==="completado" ? "Tarea completada" : "Tarea reabierta");
  }

  async function eliminarTarea(id) {
    const newList = tareas.filter(t => t.id!==id);
    await saveTareas(newList);
    syncDeleteTarea(id);
    setModal(null);
    showToast("Tarea eliminada");
  }

  function abrirNuevaTarea(clientePreseleccionado) {
    setFormTarea({
      ...EMPTY_TAREA,
      clienteId: clientePreseleccionado?.id || "",
      clienteNombre: clientePreseleccionado?.nombre || "",
    });
    setTareaActiva(null);
    setBuscarClienteTarea("");
    setModal("tarea");
  }

  function abrirEditarTarea(t) {
    setFormTarea({ clienteId:t.clienteId, clienteNombre:t.clienteNombre, tipo:t.tipo, descripcion:t.descripcion, fecha:t.fecha, estado:t.estado });
    setTareaActiva(t);
    setBuscarClienteTarea("");
    setModal("tarea");
  }

  async function eliminarCliente(id) {
    const newClientes = clientes.filter(c => c.id!==id);
    const newPagos = pagos.filter(p => p.clienteId!==id);
    await saveClientes(newClientes);
    await savePagos(newPagos);
    syncDeleteCliente(id);
    setModal(null); showToast("Cliente eliminado");
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
      setModal(null);
    } else {
      // Nuevo pago
      const nuevo = { id:generarId(), clienteId:clienteActivo.id, clienteNombre:clienteActivo.nombre, ...pagoForm, created_at:new Date().toISOString() };
      const newList = [nuevo, ...pagos];
      await savePagos(newList);
      syncPago(nuevo);
      showToast("Pago registrado");
      setPagoRecienGuardado({ cliente: clienteActivo, pago: nuevo });
      setModal("reciboPrompt");
      return;
    }
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
    const porReferente = {};
    clientes.forEach(c => { if (c.referidoPor && c.referidoPor.trim()) porReferente[c.referidoPor.trim()] = (porReferente[c.referidoPor.trim()]||0)+1; });
    const topReferente = Object.entries(porReferente).sort((a,b)=>b[1]-a[1])[0];
    return { total:clientes.length, activos, vencidos, proximos, ingresosMes, ingresosHoy, ingresosSemana, ingresosAnio, ticketPromedio, topCliente, topReferente };
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

  const cobrosPendientes = useMemo(() => {
    return clientes
      .filter(c => calcularEstado(c.vencimiento, config.diasAlerta).dias <= 0)
      .sort((a,b) => a.vencimiento > b.vencimiento ? 1 : -1);
  }, [clientes, config.diasAlerta]);

  const tareasHoy = useMemo(() => {
    const hoy = new Date().toISOString().split("T")[0];
    return tareas.filter(t => t.estado==="pendiente" && t.fecha <= hoy).sort((a,b)=> a.fecha < b.fecha ? -1 : 1);
  }, [tareas]);

  const tareasFiltradas = useMemo(() => {
    const hoy = new Date().toISOString().split("T")[0];
    let lista = [...tareas];
    if (filtroTareas==="hoy") lista = lista.filter(t => t.estado==="pendiente" && t.fecha <= hoy);
    else if (filtroTareas==="pendientes") lista = lista.filter(t => t.estado==="pendiente");
    else if (filtroTareas==="completadas") lista = lista.filter(t => t.estado==="completado");
    return lista.sort((a,b)=> a.fecha < b.fecha ? -1 : 1);
  }, [tareas, filtroTareas]);

  const clientesFantasma = useMemo(() => {
    const limite = config.diasFantasma || 30;
    return clientes
      .filter(c => {
        const dias = calcularEstado(c.vencimiento, config.diasAlerta).dias;
        return dias < 0 && Math.abs(dias) >= limite;
      })
      .sort((a,b) => a.vencimiento > b.vencimiento ? 1 : -1);
  }, [clientes, config.diasAlerta, config.diasFantasma]);

  const clientesFiltrados = useMemo(() => {
    let lista = clientes.filter(c => {
      const q = busqueda.toLowerCase();
      const match = !q || c.nombre.toLowerCase().includes(q) || (c.whatsapp||"").includes(q) || (c.documento||"").includes(q) || (c.usuarioTv||"").toLowerCase().includes(q) || (c.notas||"").toLowerCase().includes(q) || getDispositivos(c).some(d => (d.usuario||"").toLowerCase().includes(q) || (d.nombre||"").toLowerCase().includes(q));
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


  if (!logueado) return <LoginScreen onLogin={() => setLogueado(true)} logoUrl={config.logoUrl} negocio={config.negocio} />;
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
            {config.logoUrl
              ? <img src={config.logoUrl} alt="logo" style={{ width:34, height:34, borderRadius:9, objectFit:"cover", flexShrink:0 }} />
              : <div style={{ width:34, height:34, background:"linear-gradient(135deg,#3B82F6,#8B5CF6)", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>📺</div>
            }
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
      <div style={{ display:"flex", background:"#13162A", borderBottom:"1px solid #1E2340", padding:"3px 6px", overflowX:"auto" }}>
        {[["cobros","🔔 Cobros"],["tareas","📋 Tareas"],["dashboard","📊 Panel"],["clientes","👥 Clientes"],["usuariostv","🎫 TV"],["pagos","💰 Pagos"],["graficas","📈 Graficas"]].map(([v,l]) => (
          <button key={v} style={{ flex:"1 0 auto", minWidth:64, border:"none", background:vista===v?"#1E2B6B":"transparent", color:vista===v?"#60A5FA":"#6B7280", borderRadius:8, padding:"9px 6px", fontSize:11, fontWeight:vista===v?600:400, cursor:"pointer", whiteSpace:"nowrap" }} onClick={()=>setVista(v)}>{l}</button>
        ))}
      </div>

      <div style={{ padding:12, paddingBottom:80 }}>

        {/* ===== DASHBOARD ===== */}
        {vista==="cobros" && <>
          {tareasHoy.length > 0 && (
            <div onClick={()=>setVista("tareas")}
              style={{ background:"linear-gradient(135deg,#3b2f00,#2a1f00)", border:"1px solid #FBBF2455", borderRadius:14, padding:"12px 14px", marginBottom:14, cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ fontSize:24 }}>📋</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#FBBF24" }}>{tareasHoy.length} tarea{tareasHoy.length!==1?"s":""} para hoy</div>
                <div style={{ fontSize:11, color:"#9CA3AF" }}>Reclamos, visitas y promesas de pago pendientes</div>
              </div>
              <span style={{ color:"#FBBF24", fontSize:16 }}>›</span>
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:4 }}>
            <div style={secTitle}>🔔 Para cobrar hoy</div>
            <span style={{ fontSize:11, color:"#6B7280" }}>{cobrosPendientes.length} cliente{cobrosPendientes.length!==1?"s":""}</span>
          </div>
          {cobrosPendientes.length===0 && (
            <div style={{ textAlign:"center", padding:"50px 20px", color:"#4B5563" }}>
              <div style={{ fontSize:50, marginBottom:12 }}>🎉</div>
              <div style={{ fontSize:15, fontWeight:600, color:"#6B7280" }}>Nada pendiente por cobrar</div>
              <div style={{ fontSize:12, color:"#4B5563", marginTop:6 }}>Todos tus clientes estan al dia</div>
            </div>
          )}
          {cobrosPendientes.map(c => {
            const est = calcularEstado(c.vencimiento, config.diasAlerta);
            const yaCobrado = yaCobradoHoy(c);
            const esVencido = est.dias < 0;
            return (
              <div key={c.id} style={{ ...clientCard, cursor:"default", border:esVencido?"1px solid #EF444444":"1px solid #F59E0B44", alignItems:"flex-start" }}>
                <div style={avatar(getColor(c.nombre))} onClick={()=>abrirDetalle(c)}>{c.nombre[0].toUpperCase()}</div>
                <div style={{ flex:1, minWidth:0 }} onClick={()=>abrirDetalle(c)}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{c.nombre}</div>
                  <div style={{ fontSize:11, color:"#6B7280" }}>{planLabel(c.plan)} · {c.precio?C+c.precio:"Sin precio"}</div>
                  <div style={{ fontSize:11, marginTop:2, color:esVencido?"#EF4444":"#F59E0B", fontWeight:600 }}>
                    {esVencido ? "Vencio hace " + Math.abs(est.dias) + " dia" + (Math.abs(est.dias)!==1?"s":"") : "Vence hoy"}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                  {yaCobrado && <span style={{ fontSize:9, color:"#10B981", background:"#10B98122", padding:"2px 7px", borderRadius:10 }}>✓ Enviado hoy</span>}
                  <button
                    onClick={(e)=>{e.stopPropagation();enviarCobro(c);}}
                    style={{ background:yaCobrado?"#25284088":"linear-gradient(135deg,#25D366,#1DA851)", border:"none", color:"#fff", borderRadius:10, padding:"7px 12px", fontSize:11, fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}
                  >💬 {yaCobrado ? "Reenviar" : "Cobrar"}</button>
                </div>
              </div>
            );
          })}
        </>}

        {vista==="usuariostv" && <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, color:"#fff" }}>Usuarios TV</div>
              <div style={{ fontSize:11, color:"#6B7280" }}>{config.negocio||"TV Digital Pro"}</div>
            </div>
            <button onClick={()=>{ setFormUsuarioTV({ emailTV: generarEmailAuto(cuentasTV), claveTV: generarClaveNumerica6(), plan:"mensual" }); setModal("nuevoUsuarioTV"); }}
              style={{ background:"linear-gradient(135deg,#8B5CF6,#7C3AED)", border:"none", color:"#fff", borderRadius:12, padding:"10px 16px", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}
            >+ Nuevo</button>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:14 }}>
            {[["#8B5CF6",cuentasTV.length,"Cuentas"],["#10B981",clientes.filter(c=>c.cuentaTvId).length,"Perfiles usados"],["#F59E0B",cuentasTV.length*4 - clientes.filter(c=>c.cuentaTvId).length,"Perfiles libres"]].map(([c,n,l])=>(
              <div key={l} style={{ textAlign:"center" }}>
                <div style={{ fontSize:20, fontWeight:800, color:c }}>{n}</div>
                <div style={{ fontSize:9, color:"#6B7280" }}>{l}</div>
              </div>
            ))}
          </div>

          <input style={{ ...inp, marginBottom:14 }} placeholder="🔍 Buscar cuenta por email..." value={busqueda} onChange={e=>setBusqueda(e.target.value)} />

          {cuentasTV.length===0 && <div style={{ textAlign:"center",padding:"30px 20px" }}><div style={{ fontSize:40 }}>🎫</div><div style={{ color:"#6B7280", marginTop:10 }}>Sin cuentas TV aun</div><div style={{ fontSize:11, color:"#4B5563", marginTop:6 }}>Toca "+ Nuevo" para crear tu primera cuenta compartida</div></div>}

          {cuentasTV.filter(ct => !busqueda || (ct.emailTV||"").toLowerCase().includes(busqueda.toLowerCase())).map(cuenta => {
            const perfilesClientes = [1,2,3,4].map(n => clientes.find(c => c.cuentaTvId===cuenta.id && c.perfilNumero===n) || null);
            const ocupados = perfilesClientes.filter(Boolean).length;
            const expandida = cuentaExpandida === cuenta.id;
            return (
              <div key={cuenta.id} style={{ background:"#1A1D2E", borderRadius:14, marginBottom:8, border:"1px solid #1E2340", overflow:"hidden" }}>
                <div onClick={()=>setCuentaExpandida(expandida ? null : cuenta.id)}
                  style={{ display:"flex", alignItems:"center", gap:10, padding:"13px 14px", cursor:"pointer" }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#8B5CF6,#7C3AED)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>🎫</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:"#E8EAF0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cuenta.emailTV}</div>
                    <div style={{ fontSize:10, color:"#6B7280", marginTop:2 }}>{ocupados}/4 perfiles usados</div>
                  </div>
                  <Badge color={ocupados>=4?"#F59E0B":"#10B981"} bg={ocupados>=4?"#F59E0B22":"#10B98122"}>{ocupados}/4</Badge>
                  <button onClick={e=>{e.stopPropagation();copiarTexto(cuenta.emailTV);showToast("Copiado");}} style={{ background:"#252840", border:"none", borderRadius:8, padding:"5px 7px", cursor:"pointer", fontSize:12 }}>📋</button>
                  <span style={{ color:"#6B7280", fontSize:12 }}>{expandida?"▲":"▼"}</span>
                </div>
                {expandida && (
                  <div style={{ padding:"0 14px 14px" }}>
                    <div style={{ height:1, background:"#1E2340", marginBottom:12 }} />
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 0" }}>
                      <span style={{ fontSize:11, color:"#6B7280" }}>Contrasena</span>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:12, fontWeight:700, color:"#E8EAF0" }}>{cuenta.claveTV}</span>
                        <button onClick={()=>{copiarTexto(cuenta.claveTV);showToast("Copiado");}} style={{ background:"#252840", border:"none", borderRadius:6, padding:"2px 6px", cursor:"pointer", fontSize:11 }}>📋</button>
                      </div>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", padding:"4px 0", marginBottom:12 }}>
                      <span style={{ fontSize:11, color:"#6B7280" }}>Revendedor</span>
                      <span style={{ fontSize:11, fontWeight:600, color:"#E8EAF0" }}>{config.negocio||"TV Digital Pro"}</span>
                    </div>

                    <div style={{ fontSize:10, fontWeight:600, color:"#7C83A8", textTransform:"uppercase", marginBottom:8 }}>Perfiles (clientes)</div>
                    {perfilesClientes.map((cliente, idx) => {
                      const numPerfil = idx+1;
                      if (!cliente) {
                        return (
                          <div key={numPerfil} style={{ marginBottom:7 }}>
                            <div style={{ fontSize:9, color:"#4B5563", marginBottom:3 }}>Perfil {numPerfil}</div>
                            <div style={{ display:"flex", gap:6 }}>
                              <button onClick={()=>abrirNuevoParaPerfil(cuenta.id, numPerfil)}
                                style={{ flex:1, background:"#0F1117", border:"1px dashed #2A2D45", borderRadius:10, padding:"11px 10px", cursor:"pointer", color:"#4B5563", fontSize:11, textAlign:"center" }}
                              ><div style={{ fontSize:16 }}>➕</div>Nuevo cliente</button>
                              <button onClick={()=>{ setPerfilAVincular({ cuentaTvId:cuenta.id, perfilNumero:numPerfil }); setBuscarClienteVincular(""); setModal("vincularCliente"); }}
                                style={{ flex:1, background:"#0F1117", border:"1px dashed #2A2D45", borderRadius:10, padding:"11px 10px", cursor:"pointer", color:"#60A5FA", fontSize:11, textAlign:"center" }}
                              ><div style={{ fontSize:16 }}>🔗</div>Cliente existente</button>
                            </div>
                          </div>
                        );
                      }
                      const est = calcularEstado(cliente.vencimiento, config.diasAlerta);
                      return (
                        <div key={numPerfil} onClick={()=>abrirDetalle(cliente)}
                          style={{ display:"flex", alignItems:"center", gap:10, background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:"10px 12px", marginBottom:7, cursor:"pointer" }}>
                          <div style={avatar(getColor(cliente.nombre))}>{cliente.nombre[0].toUpperCase()}</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:"#E8EAF0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cliente.nombre}</div>
                            <div style={{ fontSize:10, color:"#6B7280" }}>Perfil {numPerfil} · Vence {formatFecha(cliente.vencimiento)}</div>
                          </div>
                          <Badge color={est.color} bg={est.bg}>{est.label}</Badge>
                        </div>
                      );
                    })}

                    <div style={{ height:6 }} />
                    <button onClick={()=>{ setCuentaAEliminar(cuenta); setModal("confirmarEliminarCuenta"); }}
                      style={{ width:"100%", background:"#EF444422", border:"none", color:"#EF4444", borderRadius:10, padding:"9px 0", fontSize:12, fontWeight:600, cursor:"pointer" }}
                    >🗑 Eliminar cuenta TV</button>
                  </div>
                )}
              </div>
            );
          })}
        </>}


        {vista==="tareas" && <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:16, fontWeight:700, color:"#fff" }}>📋 Tareas y reclamos</div>
            <button onClick={()=>abrirNuevaTarea(null)}
              style={{ background:"linear-gradient(135deg,#3B82F6,#6366F1)", border:"none", color:"#fff", borderRadius:12, padding:"9px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}
            >+ Nueva</button>
          </div>

          <div style={{ display:"flex", gap:5, marginBottom:14, flexWrap:"wrap" }}>
            {[["hoy","Hoy"],["pendientes","Pendientes"],["completadas","Completadas"],["todas","Todas"]].map(([f,l])=>(
              <button key={f} style={chip(filtroTareas===f)} onClick={()=>setFiltroTareas(f)}>{l}</button>
            ))}
          </div>

          {tareasFiltradas.length===0 && (
            <div style={{ textAlign:"center", padding:"40px 20px", color:"#4B5563" }}>
              <div style={{ fontSize:46, marginBottom:10 }}>📋</div>
              <div style={{ fontSize:14, fontWeight:600, color:"#6B7280" }}>Sin tareas {filtroTareas==="hoy"?"para hoy":filtroTareas==="completadas"?"completadas":"pendientes"}</div>
            </div>
          )}

          {tareasFiltradas.map(t => {
            const tipo = tipoInfo(t.tipo);
            const hoy = new Date().toISOString().split("T")[0];
            const vencida = t.estado==="pendiente" && t.fecha < hoy;
            const cliente = clientes.find(c => c.id===t.clienteId);
            return (
              <div key={t.id} style={{ background:"#1A1D2E", borderRadius:14, padding:"12px 14px", marginBottom:9, border: vencida ? "1px solid #EF444455" : "1px solid #1E2340", opacity: t.estado==="completado" ? 0.6 : 1 }}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <button onClick={()=>completarTarea(t)}
                    style={{ width:24, height:24, borderRadius:7, border: t.estado==="completado" ? "none" : "2px solid #3B82F6", background: t.estado==="completado" ? "#10B981" : "transparent", color:"#fff", fontSize:13, cursor:"pointer", flexShrink:0, marginTop:1 }}
                  >{t.estado==="completado" ? "✓" : ""}</button>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap", marginBottom:3 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:tipo.color }}>{tipo.icon} {tipo.label}</span>
                      {vencida && <Badge color="#EF4444" bg="#EF444422">Atrasada</Badge>}
                    </div>
                    <div onClick={()=>cliente && abrirDetalle(cliente)} style={{ fontSize:13, fontWeight:700, color:"#60A5FA", cursor: cliente ? "pointer" : "default", textDecoration: cliente ? "underline" : "none" }}>{t.clienteNombre}</div>
                    <div style={{ fontSize:12, color:"#E8EAF0", marginTop:3 }}>{t.descripcion}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
                      <span style={{ fontSize:10, color: vencida ? "#EF4444" : "#6B7280" }}>📅 {formatFecha(t.fecha)}</span>
                      <div style={{ display:"flex", gap:6 }}>
                        {t.tipo==="promesa_pago" && cliente && (
                          <button onClick={()=>abrirPago(cliente)} style={{ background:"#10B98122", border:"none", color:"#10B981", borderRadius:7, padding:"3px 8px", fontSize:10, cursor:"pointer" }}>💰 Pago</button>
                        )}
                        <button onClick={()=>abrirEditarTarea(t)} style={{ background:"#252840", border:"none", color:"#9CA3AF", borderRadius:7, padding:"3px 8px", fontSize:10, cursor:"pointer" }}>✏️</button>
                        <button onClick={()=>eliminarTarea(t.id)} style={{ background:"#EF444422", border:"none", color:"#EF4444", borderRadius:7, padding:"3px 8px", fontSize:10, cursor:"pointer" }}>🗑</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </>}


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

          {stats.topReferente && (
            <div style={{ ...card, background:"linear-gradient(135deg,#0F2A1A,#10B98122)", border:"1px solid #10B98133" }}>
              <div style={{ fontSize:9,color:"#7C83A8",marginBottom:3 }}>🤝 TOP REFERENTE</div>
              <div style={{ fontSize:14,fontWeight:700,color:"#34D399" }}>{stats.topReferente[0]}</div>
              <div style={{ fontSize:11,color:"#10B981" }}>{stats.topReferente[1]} cliente{stats.topReferente[1]!==1?"s":""} traido{stats.topReferente[1]!==1?"s":""}</div>
            </div>
          )}

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

          {clientesFantasma.length>0 && <>
            <div style={secTitle}>👻 Clientes fantasma (sin pagar +{config.diasFantasma||30}d)</div>
            <div style={{ fontSize:11, color:"#6B7280", marginBottom:8, marginTop:-4 }}>Candidatos a contactar distinto o dar de baja</div>
            {clientesFantasma.slice(0,5).map(c=>{
              const est=calcularEstado(c.vencimiento,config.diasAlerta);
              return (
                <div key={c.id} style={{ ...clientCard, border:"1px solid #6B728044", opacity:0.85 }} onClick={()=>abrirDetalle(c)}>
                  <div style={{ ...avatar("#374151") }}>{c.nombre[0].toUpperCase()}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:600,fontSize:14 }}>{c.nombre}</div>
                    <div style={{ fontSize:10,color:"#6B7280" }}>Vencio: {formatFecha(c.vencimiento)} · {Math.abs(est.dias)} dias atras</div>
                  </div>
                  <button style={{ background:"#37415144",border:"none",color:"#9CA3AF",borderRadius:8,padding:"4px 9px",fontSize:10,cursor:"pointer" }}
                    onClick={e=>{e.stopPropagation();abrirEditar(c);}}>Revisar</button>
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
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:2 }}>
                    <span style={{ fontSize:10,color:"#25D366",cursor:"pointer" }} onClick={e=>{e.stopPropagation();abrirWhatsApp(c.whatsapp);}}>💬 {c.whatsapp}</span>
                    {getDispositivos(c).length > 0 && <span style={{ fontSize:9, color:"#6B7280" }}>📺 {getDispositivos(c).length}/{c.maxDispositivos||4}</span>}
                  </div>
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
          <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:10 }}>📄 Centro de reportes</div>

          <div style={{ ...card, background:"linear-gradient(135deg,#1a1200,#2a1f0022)", border:"1px solid #FBBF2433" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#FBBF24", marginBottom:8, textTransform:"uppercase" }}>📄 Reporte mensual (ingresos)</div>
            <div style={{ display:"flex", gap:8 }}>
              <input type="month" style={{ ...inp, flex:1, marginBottom:0 }} value={mesReporte} onChange={e=>setMesReporte(e.target.value)} />
              <button onClick={()=>generarReporteMensual(mesReporte)}
                style={{ background:"linear-gradient(135deg,#F59E0B,#D97706)", border:"none", color:"#fff", borderRadius:10, padding:"0 16px", fontSize:12, fontWeight:600, cursor:"pointer" }}>Generar</button>
            </div>
          </div>

          <div style={{ ...card, background:"linear-gradient(135deg,#0F1E3A,#1e3a5f22)", border:"1px solid #3B82F633" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#60A5FA", marginBottom:8, textTransform:"uppercase" }}>👥 Reporte de clientes</div>
            <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
              {[["todos","Todos"],["activos","Activos"],["vencidos","Vencidos"]].map(([f,l])=>(
                <button key={f} style={chip(reporteClientesFiltro===f)} onClick={()=>setReporteClientesFiltro(f)}>{l}</button>
              ))}
            </div>
            <button onClick={()=>generarReporteClientes(reporteClientesFiltro)}
              style={{ width:"100%", background:"linear-gradient(135deg,#3B82F6,#6366F1)", border:"none", color:"#fff", borderRadius:10, padding:"9px 0", fontSize:12, fontWeight:600, cursor:"pointer" }}>Generar</button>
          </div>

          <div style={{ ...card, background:"linear-gradient(135deg,#0F2A1A,#10B98122)", border:"1px solid #10B98133" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#34D399", marginBottom:8, textTransform:"uppercase" }}>💰 Reporte de pagos (rango de fechas)</div>
            <div style={{ display:"flex", gap:6, marginBottom:8 }}>
              <input type="date" style={{ ...inp, flex:1, marginBottom:0 }} value={reporteFechaDesde} onChange={e=>setReporteFechaDesde(e.target.value)} />
              <input type="date" style={{ ...inp, flex:1, marginBottom:0 }} value={reporteFechaHasta} onChange={e=>setReporteFechaHasta(e.target.value)} />
            </div>
            <button onClick={()=>generarReportePagos(reporteFechaDesde, reporteFechaHasta)}
              style={{ width:"100%", background:"linear-gradient(135deg,#10B981,#059669)", border:"none", color:"#fff", borderRadius:10, padding:"9px 0", fontSize:12, fontWeight:600, cursor:"pointer" }}>Generar</button>
          </div>

          <div style={{ ...card, background:"linear-gradient(135deg,#2a0f0f,#3a1f1f22)", border:"1px solid #EF444433" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#EF4444", marginBottom:8, textTransform:"uppercase" }}>🔴 Reporte de vencidos</div>
            <div style={{ fontSize:10, color:"#6B7280", marginBottom:8 }}>Lista completa de clientes atrasados, con dias de atraso y posible cobro pendiente</div>
            <button onClick={generarReporteVencidos}
              style={{ width:"100%", background:"linear-gradient(135deg,#EF4444,#DC2626)", border:"none", color:"#fff", borderRadius:10, padding:"9px 0", fontSize:12, fontWeight:600, cursor:"pointer" }}>Generar</button>
          </div>

          <div style={{ ...card, background:"linear-gradient(135deg,#2E1065,#7C3AED22)", border:"1px solid #7C3AED33" }}>
            <div style={{ fontSize:11, fontWeight:600, color:"#A78BFA", marginBottom:8, textTransform:"uppercase" }}>📋 Reporte de tareas / reclamos</div>
            <div style={{ display:"flex", gap:6, marginBottom:8, flexWrap:"wrap" }}>
              {[["pendientes","Pendientes"],["completadas","Completadas"],["todas","Todas"]].map(([f,l])=>(
                <button key={f} style={chip(reporteTareasFiltro===f)} onClick={()=>setReporteTareasFiltro(f)}>{l}</button>
              ))}
            </div>
            <button onClick={()=>generarReporteTareas(reporteTareasFiltro)}
              style={{ width:"100%", background:"linear-gradient(135deg,#8B5CF6,#7C3AED)", border:"none", color:"#fff", borderRadius:10, padding:"9px 0", fontSize:12, fontWeight:600, cursor:"pointer" }}>Generar</button>
          </div>

          <div style={{ fontSize:10, color:"#6B7280", textAlign:"center", marginBottom:16 }}>Cada reporte se abre en una ventana nueva, lista para guardar como PDF</div>

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
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr",gap:5,marginBottom:12 }}>
              {[["💬","WA","#25D36622","#25D366",()=>abrirWhatsApp(clienteActivo.whatsapp)],
                ["💰","Cobrar","#F59E0B22","#F59E0B",()=>enviarCobro(clienteActivo)],
                ["🔄","Renovar","#3B82F622","#3B82F6",()=>renovarCliente(clienteActivo)],
                ["📋","Tarea","#EF444422","#EF4444",()=>{setModal(null);setTimeout(()=>abrirNuevaTarea(clienteActivo),100);}],
                ["✏️","Editar","#8B5CF622","#8B5CF6",()=>{setModal(null);setTimeout(()=>abrirEditar(clienteActivo),100);}]
              ].map(([icon,label,bg,color,fn])=>(
                <button key={label} onClick={fn} style={{ background:bg,border:"none",borderRadius:10,padding:"9px 2px",cursor:"pointer",textAlign:"center" }}>
                  <div style={{ fontSize:16 }}>{icon}</div>
                  <div style={{ fontSize:9,color:color,marginTop:2 }}>{label}</div>
                </button>
              ))}
            </div>
            {[["🪪 Documento",clienteActivo.documento||"-"],["📦 Plan",planLabel(clienteActivo.plan)],["💵 Precio",clienteActivo.precio?C+clienteActivo.precio:"-"],["📅 Inicio",formatFecha(clienteActivo.inicio)],["⏳ Vencimiento",formatFecha(clienteActivo.vencimiento)],["📍 Zona",clienteActivo.zona||"-"],["🤝 Referido por",clienteActivo.referidoPor||"-"]].map(([k,v])=>(
              <div key={k} style={divRow}>
                <span style={{ fontSize:12,color:"#6B7280" }}>{k}</span>
                <span style={{ fontSize:12,fontWeight:600,color:"#E8EAF0",maxWidth:"60%",textAlign:"right" }}>{v}</span>
              </div>
            ))}
            <div style={divRow}>
              <span style={{ fontSize:12,color:"#6B7280" }}>💬 WhatsApp</span>
              <span style={{ fontSize:12,fontWeight:700,color:"#25D366",cursor:"pointer",textDecoration:"underline" }} onClick={()=>abrirWhatsApp(clienteActivo.whatsapp)}>{clienteActivo.whatsapp||"-"}</span>
            </div>
            {clienteActivo.cuentaTvId && (() => {
              const cuenta = cuentasTV.find(ct => ct.id === clienteActivo.cuentaTvId);
              return (
                <div style={{ background:"#2E1065", border:"1px solid #7C3AED55", borderRadius:12, padding:"12px 14px", margin:"10px 0" }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#A78BFA", marginBottom:6 }}>🔗 CUENTA TV COMPARTIDA — Perfil {clienteActivo.perfilNumero}</div>
                  {cuenta ? <>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                      <span style={{ fontSize:12, color:"#E8EAF0", fontWeight:600 }}>{cuenta.emailTV}</span>
                      <button onClick={()=>{copiarTexto(cuenta.emailTV);showToast("Copiado");}} style={{ background:"#ffffff22", border:"none", borderRadius:6, padding:"2px 6px", cursor:"pointer", fontSize:11 }}>📋</button>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:12, color:"#9CA3AF" }}>{cuenta.claveTV}</span>
                      <button onClick={()=>{copiarTexto(cuenta.claveTV);showToast("Copiado");}} style={{ background:"#ffffff22", border:"none", borderRadius:6, padding:"2px 6px", cursor:"pointer", fontSize:11 }}>📋</button>
                    </div>
                  </> : <div style={{ fontSize:11, color:"#9CA3AF" }}>Cuenta no encontrada</div>}
                </div>
              );
            })()}
            {!clienteActivo.cuentaTvId && getDispositivos(clienteActivo).length > 0 && (
              <>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                  <div style={secTitle}>📺 Dispositivos / Perfiles</div>
                  <span style={{ fontSize:11, fontWeight:700, color: getDispositivos(clienteActivo).length >= (clienteActivo.maxDispositivos||4) ? "#F59E0B" : "#6B7280" }}>
                    {getDispositivos(clienteActivo).length}/{clienteActivo.maxDispositivos||4}
                  </span>
                </div>
                {getDispositivos(clienteActivo).map((d, idx) => (
                  <div key={idx} style={{ background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:"9px 12px", marginBottom:7 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#60A5FA", marginBottom:5 }}>{d.nombre || "Dispositivo " + (idx+1)}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                      <span style={{ fontSize:11, color:"#6B7280" }}>👤 Usuario</span>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ fontSize:12, fontWeight:600, color:"#E8EAF0" }}>{d.usuario || "-"}</span>
                        {d.usuario && <button onClick={()=>{copiarTexto(d.usuario);showToast("Copiado");}} style={{ background:"#252840", border:"none", borderRadius:6, padding:"2px 6px", cursor:"pointer", fontSize:11 }}>📋</button>}
                      </div>
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:11, color:"#6B7280" }}>🔑 Clave</span>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <span style={{ fontSize:12, fontWeight:600, color:"#E8EAF0" }}>{verClaveTv ? (d.clave||"-") : (d.clave?"••••••••":"-")}</span>
                        {d.clave && <button onClick={()=>setVerClaveTv(!verClaveTv)} style={{ background:"#252840", border:"none", borderRadius:6, padding:"2px 6px", cursor:"pointer", fontSize:11, color:"#9CA3AF" }}>{verClaveTv?"🙈":"👁️"}</button>}
                        {d.clave && <button onClick={()=>{copiarTexto(d.clave);showToast("Copiado");}} style={{ background:"#252840", border:"none", borderRadius:6, padding:"2px 6px", cursor:"pointer", fontSize:11 }}>📋</button>}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            <div style={secTitle}>📝 Notas</div>
            <div style={{ display:"flex", gap:6, marginBottom:8 }}>
              <input style={{ ...inp, flex:1, marginBottom:0 }} value={nuevaNota} placeholder="Escribe una nota..."
                onKeyDown={e=>{ if(e.key==="Enter") agregarNota(clienteActivo, nuevaNota); }}
                onChange={e=>setNuevaNota(e.target.value)} />
              <button onClick={()=>agregarNota(clienteActivo, nuevaNota)}
                style={{ background:"#1E2B6B", border:"none", color:"#60A5FA", borderRadius:10, padding:"0 14px", cursor:"pointer", fontSize:13, fontWeight:600 }}>+</button>
            </div>
            {(clienteActivo.historialNotas||[]).length===0 && clienteActivo.notas && (
              <div style={{ background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:"9px 12px", marginBottom:7 }}>
                <div style={{ fontSize:12, color:"#E8EAF0" }}>{clienteActivo.notas}</div>
                <div style={{ fontSize:9, color:"#4B5563", marginTop:3 }}>Nota anterior</div>
              </div>
            )}
            {(clienteActivo.historialNotas||[]).length===0 && !clienteActivo.notas && (
              <div style={{ fontSize:11, color:"#4B5563", textAlign:"center", padding:"6px 0 10px" }}>Sin notas aun</div>
            )}
            {(clienteActivo.historialNotas||[]).map(n => (
              <div key={n.id} style={{ background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:"9px 12px", marginBottom:7 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                  <div style={{ fontSize:12, color:"#E8EAF0", flex:1 }}>{n.texto}</div>
                  <button onClick={()=>eliminarNota(clienteActivo, n.id)} style={{ background:"none", border:"none", color:"#4B5563", cursor:"pointer", fontSize:12, padding:0 }}>✕</button>
                </div>
                <div style={{ fontSize:9, color:"#4B5563", marginTop:3 }}>{new Date(n.fecha).toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}</div>
              </div>
            ))}
            {pagos.filter(p=>p.clienteId===clienteActivo.id).length>0 && <>
              <div style={secTitle}>Historial de pagos</div>
              {pagos.filter(p=>p.clienteId===clienteActivo.id).map(p=>(
                <div key={p.id} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #1E234066" }}>
                  <div style={{ fontSize:12,color:"#6B7280" }}>{formatFecha(p.fecha)}{p.nota?" · "+p.nota:""}</div>
                  <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                    <div style={{ fontSize:13,fontWeight:700,color:"#34D399" }}>{C}{parseFloat(p.monto).toLocaleString("es")}</div>
                    <button onClick={()=>enviarRecibo(clienteActivo,p)} style={{ background:"#25D36622",border:"none",borderRadius:7,padding:"3px 6px",cursor:"pointer",fontSize:11,color:"#25D366" }}>🧾</button>
                    <button onClick={()=>abrirEditarPago(p)} style={{ background:"#252840",border:"none",borderRadius:7,padding:"3px 6px",cursor:"pointer",fontSize:11,color:"#9CA3AF" }}>✏️</button>
                  </div>
                </div>
              ))}
            </>}
            <div style={{ marginTop:14 }}>
              <Btn variant="primary" onClick={()=>{setModal(null);setTimeout(()=>abrirPago(clienteActivo),100);}}>💰 Registrar pago</Btn>
              <Btn variant="danger" onClick={()=>{ setClienteAEliminar(clienteActivo); setModal("confirmarEliminar"); }}>🗑 Eliminar cliente</Btn>
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
          <label style={lbl}>🪪 Nro. Documento (CI/RUC/Pasaporte)</label>
          <input style={inp} name="documento" value={form.documento||""} onChange={handleFormChange} placeholder="Ej: 12345678" inputMode="numeric"/>
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
          {form.cuentaTvId ? (() => {
            const cuenta = cuentasTV.find(ct => ct.id === form.cuentaTvId);
            return (
              <div style={{ background:"#2E1065", border:"1px solid #7C3AED55", borderRadius:12, padding:"12px 14px", marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#A78BFA", marginBottom:6 }}>🔗 CUENTA TV COMPARTIDA — Perfil {form.perfilNumero}</div>
                {cuenta ? <>
                  <div style={{ fontSize:13, fontWeight:700, color:"#E8EAF0" }}>{cuenta.emailTV}</div>
                  <div style={{ fontSize:11, color:"#9CA3AF", marginTop:2 }}>Contrasena: {cuenta.claveTV}</div>
                </> : <div style={{ fontSize:11, color:"#9CA3AF" }}>Cuenta no encontrada</div>}
                <div style={{ fontSize:10, color:"#6B7280", marginTop:6 }}>Este cliente comparte este usuario y contrasena con hasta 4 perfiles distintos.</div>
              </div>
            );
          })() : (
            <>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <label style={{ ...lbl, marginBottom:0 }}>🎚️ Maximo de dispositivos</label>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <button onClick={()=>setForm(prev=>({ ...prev, maxDispositivos: Math.max(1,(prev.maxDispositivos||4)-1) }))}
                    style={{ width:28, height:28, borderRadius:8, background:"#252840", border:"none", color:"#E8EAF0", fontSize:16, cursor:"pointer" }}>−</button>
              <span style={{ fontSize:15, fontWeight:700, color:"#E8EAF0", minWidth:16, textAlign:"center" }}>{form.maxDispositivos||4}</span>
              <button onClick={()=>setForm(prev=>({ ...prev, maxDispositivos: Math.min(20,(prev.maxDispositivos||4)+1) }))}
                style={{ width:28, height:28, borderRadius:8, background:"#252840", border:"none", color:"#E8EAF0", fontSize:16, cursor:"pointer" }}>+</button>
            </div>
          </div>
          {(() => {
            const listaActual = form.dispositivos && form.dispositivos.length > 0 ? form.dispositivos : getDispositivos(form);
            const max = form.maxDispositivos || 4;
            const alTope = listaActual.length >= max;
            return (
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                <label style={{ ...lbl, marginBottom:0 }}>📺 Dispositivos <span style={{ color: alTope ? "#F59E0B" : "#4B5563" }}>({listaActual.length}/{max})</span></label>
                <div style={{ display:"flex", gap:6 }}>
                  <button
                    disabled={alTope}
                    onClick={()=>{
                      const base = listaActual;
                      const nuevoNum = base.length + 1;
                      const nuevo = { nombre:"Dispositivo "+nuevoNum, usuario:generarUsuarioAuto(form.nombre), clave:generarClaveAuto() };
                      setForm(prev=>({ ...prev, dispositivos:[...base, nuevo] }));
                    }}
                    style={{ background: alTope ? "#252840" : "linear-gradient(135deg,#8B5CF6,#7C3AED)", border:"none", color: alTope ? "#4B5563" : "#fff", borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:600, cursor: alTope ? "default" : "pointer" }}
                  >✨ Auto</button>
                  <button
                    disabled={alTope}
                    onClick={()=>setForm(prev=>({ ...prev, dispositivos:[...listaActual, { nombre:"", usuario:"", clave:"" }] }))}
                    style={{ background: alTope ? "#252840" : "#1E2B6B", border:"none", color: alTope ? "#4B5563" : "#60A5FA", borderRadius:8, padding:"4px 10px", fontSize:11, fontWeight:600, cursor: alTope ? "default" : "pointer" }}
                  >+ Agregar</button>
                </div>
              </div>
            );
          })()}
          {(form.dispositivos && form.dispositivos.length > 0 ? form.dispositivos : getDispositivos(form)).map((d, idx) => (
            <div key={idx} style={{ background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:10, marginBottom:8 }}>
              <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                <input style={{ ...inp, marginBottom:0 }} value={d.nombre} placeholder="Ej: TV Sala, TV Cuarto..."
                  onChange={e=>{
                    const base = form.dispositivos && form.dispositivos.length>0 ? form.dispositivos : getDispositivos(form);
                    const lista = [...base]; lista[idx] = { ...lista[idx], nombre:e.target.value };
                    setForm(prev=>({ ...prev, dispositivos:lista }));
                  }} />
                <button
                  onClick={()=>{
                    const base = form.dispositivos && form.dispositivos.length>0 ? form.dispositivos : getDispositivos(form);
                    const lista = [...base]; lista[idx] = { ...lista[idx], usuario:generarUsuarioAuto(form.nombre), clave:generarClaveAuto() };
                    setForm(prev=>({ ...prev, dispositivos:lista }));
                  }}
                  title="Generar usuario y clave"
                  style={{ background:"#8B5CF622", border:"none", color:"#A78BFA", borderRadius:8, padding:"0 10px", cursor:"pointer", fontSize:13 }}
                >✨</button>
                <button
                  onClick={()=>{
                    const base = form.dispositivos && form.dispositivos.length>0 ? form.dispositivos : getDispositivos(form);
                    const lista = base.filter((_,i)=>i!==idx);
                    setForm(prev=>({ ...prev, dispositivos:lista }));
                  }}
                  style={{ background:"#EF444422", border:"none", color:"#EF4444", borderRadius:8, padding:"0 10px", cursor:"pointer", fontSize:14 }}
                >🗑</button>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <input style={{ ...inp, marginBottom:0, flex:1 }} value={d.usuario} placeholder="Usuario"
                  onChange={e=>{
                    const base = form.dispositivos && form.dispositivos.length>0 ? form.dispositivos : getDispositivos(form);
                    const lista = [...base]; lista[idx] = { ...lista[idx], usuario:e.target.value };
                    setForm(prev=>({ ...prev, dispositivos:lista }));
                  }} />
                <input style={{ ...inp, marginBottom:0, flex:1 }} value={d.clave} placeholder="Contrasena"
                  onChange={e=>{
                    const base = form.dispositivos && form.dispositivos.length>0 ? form.dispositivos : getDispositivos(form);
                    const lista = [...base]; lista[idx] = { ...lista[idx], clave:e.target.value };
                    setForm(prev=>({ ...prev, dispositivos:lista }));
                  }} />
              </div>
            </div>
          ))}
          {(!form.dispositivos || form.dispositivos.length===0) && getDispositivos(form).length===0 && (
            <div style={{ fontSize:11, color:"#4B5563", textAlign:"center", padding:"8px 0 12px" }}>Sin dispositivos. Toca "✨ Auto" o "+ Agregar" para anadir uno.</div>
          )}
            </>
          )}
          <div style={{ height:8 }}/>
          <div style={{ display:"flex",gap:8 }}>
            <div style={{ flex:1 }}><label style={lbl}>📍 Zona / Sector</label><input style={inp} name="zona" value={form.zona||""} onChange={handleFormChange} placeholder="Ej: Centro, Norte..."/></div>
            <div style={{ flex:1 }}><label style={lbl}>🤝 Referido por</label><input style={inp} name="referidoPor" value={form.referidoPor||""} onChange={handleFormChange} placeholder="Nombre del referente"/></div>
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
          <label style={lbl}>🖼️ Logo del negocio</label>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
            {config.logoUrl
              ? <img src={config.logoUrl} alt="logo" style={{ width:56, height:56, borderRadius:14, objectFit:"cover", border:"1px solid #2A2D45" }} />
              : <div style={{ width:56, height:56, background:"linear-gradient(135deg,#3B82F6,#8B5CF6)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>📺</div>
            }
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              <label style={{ background:"#1E2B6B", border:"none", color:"#60A5FA", borderRadius:9, padding:"7px 14px", fontSize:12, fontWeight:600, cursor:"pointer", textAlign:"center" }}>
                📷 {config.logoUrl ? "Cambiar" : "Subir logo"}
                <input type="file" accept="image/*" style={{ display:"none" }}
                  onChange={e=>{ const f=e.target.files[0]; if(f) procesarImagenLogo(f, url=>setConfig({...config, logoUrl:url})); e.target.value=""; }} />
              </label>
              {config.logoUrl && (
                <button onClick={()=>setConfig({...config, logoUrl:null})}
                  style={{ background:"#EF444422", border:"none", color:"#EF4444", borderRadius:9, padding:"6px 14px", fontSize:11, cursor:"pointer" }}>Quitar logo</button>
              )}
            </div>
          </div>
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
          <label style={lbl}>👻 Dias vencido para considerar "fantasma"</label>
          <input style={inp} type="number" value={config.diasFantasma||30} onChange={e=>setConfig({...config,diasFantasma:parseInt(e.target.value)||30})} min="7" max="180"/>
          <div style={{ height:8 }}/>
          <label style={lbl}>Mensaje de cobro WhatsApp (general)</label>
          <textarea style={{ width:"100%",background:"#0F1117",border:"1px solid #2A2D45",borderRadius:10,padding:"11px 12px",color:"#E8EAF0",fontSize:13,outline:"none",boxSizing:"border-box",resize:"vertical",minHeight:80 }}
            value={config.mensajeCobro} onChange={e=>setConfig({...config,mensajeCobro:e.target.value})}/>
          <div style={{ fontSize:10,color:"#6B7280",marginBottom:10 }}>Variables: {"{nombre}"} {"{plan}"} {"{precio}"} {"{moneda}"} {"{vencimiento}"}</div>
          <div style={{ height:1,background:"#1E2340",margin:"14px 0" }}/>
          <div style={{ fontSize:12,fontWeight:600,color:"#7C83A8",marginBottom:8 }}>💬 MENSAJES PERSONALIZADOS POR CATEGORIA</div>
          <div style={{ fontSize:10,color:"#6B7280",marginBottom:10 }}>Si dejas uno vacio, se usa el mensaje general de arriba.</div>
          {CATEGORIAS.map(cat=>(
            <div key={cat.id} style={{ marginBottom:8 }}>
              <button onClick={()=>setCatMsgAbierta(catMsgAbierta===cat.id?null:cat.id)}
                style={{ width:"100%", display:"flex", justifyContent:"space-between", alignItems:"center", background:"#1A1D2E", border:"1px solid #2A2D45", borderRadius:10, padding:"9px 12px", cursor:"pointer" }}>
                <span style={{ fontSize:12, fontWeight:600, color:cat.color }}>{cat.label}</span>
                <span style={{ fontSize:11, color:"#6B7280" }}>{catMsgAbierta===cat.id?"▲":"▼"}</span>
              </button>
              {catMsgAbierta===cat.id && (
                <textarea style={{ width:"100%",background:"#0F1117",border:"1px solid #2A2D45",borderRadius:10,padding:"11px 12px",color:"#E8EAF0",fontSize:12,outline:"none",boxSizing:"border-box",resize:"vertical",minHeight:70,marginTop:6 }}
                  value={(config.mensajesPorCategoria||{})[cat.id]||""}
                  placeholder="Vacio = usar mensaje general"
                  onChange={e=>setConfig({...config, mensajesPorCategoria:{...(config.mensajesPorCategoria||{}), [cat.id]:e.target.value}})}/>
              )}
            </div>
          ))}
          <div style={{ height:6 }}/>
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

      {modal==="confirmarEliminar" && clienteAEliminar && (
        <ModalBg onClose={()=>{ setModal(null); setClienteAEliminar(null); }}>
          <div style={{ textAlign:"center", padding:"8px 0 4px" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>⚠️</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#fff", marginBottom:8 }}>Eliminar cliente</div>
            <div style={{ fontSize:13, color:"#9CA3AF", marginBottom:6 }}>
              ¿Eliminar a <strong style={{ color:"#E8EAF0" }}>{clienteAEliminar.nombre}</strong>?
            </div>
            <div style={{ fontSize:11, color:"#6B7280", marginBottom:20 }}>
              Tambien se eliminaran todos sus pagos. Esta accion no se puede deshacer.
            </div>
          </div>
          <Btn variant="danger" onClick={()=>{ eliminarCliente(clienteAEliminar.id); setClienteAEliminar(null); }}>Sí, eliminar</Btn>
          <Btn onClick={()=>{ setModal(null); setClienteAEliminar(null); }}>Cancelar</Btn>
        </ModalBg>
      )}

      {modal==="reciboPrompt" && pagoRecienGuardado && (
        <ModalBg onClose={()=>{setModal(null);setPagoRecienGuardado(null);}}>
          <div style={{ textAlign:"center", padding:"8px 0 4px" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>✅</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#fff", marginBottom:6 }}>Pago registrado</div>
            <div style={{ fontSize:12, color:"#6B7280", marginBottom:18 }}>¿Quieres enviarle el comprobante por WhatsApp a {pagoRecienGuardado.cliente.nombre}?</div>
          </div>
          <Btn variant="green" onClick={()=>{ enviarRecibo(pagoRecienGuardado.cliente, pagoRecienGuardado.pago); setModal(null); setPagoRecienGuardado(null); }}>💬 Enviar comprobante</Btn>
          <Btn onClick={()=>{ setModal(null); setPagoRecienGuardado(null); }}>No, gracias</Btn>
        </ModalBg>
      )}

      {modal==="nuevoUsuarioTV" && (
        <ModalBg onClose={()=>setModal(null)}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div style={{ fontSize:17, fontWeight:800, color:"#fff" }}>Nuevo usuario</div>
            <button onClick={()=>{
                setFormUsuarioTV(prev => ({
                  ...prev,
                  emailTV: generarEmailAuto(cuentasTV),
                  claveTV: generarClaveNumerica6(),
                }));
              }}
              style={{ background:"linear-gradient(135deg,#8B5CF6,#7C3AED)", border:"none", color:"#fff", borderRadius:20, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}
            >🔄 Regenerar</button>
          </div>

          <label style={lbl}>Email *</label>
          <input style={inp} value={formUsuarioTV.emailTV} onChange={e=>setFormUsuarioTV({...formUsuarioTV, emailTV:e.target.value})} placeholder="user00001@tv.es" autoComplete="off" />
          <div style={{ height:8 }}/>
          <label style={lbl}>Contrasena *</label>
          <input style={inp} value={formUsuarioTV.claveTV} onChange={e=>setFormUsuarioTV({...formUsuarioTV, claveTV:e.target.value})} placeholder="123456" inputMode="numeric" autoComplete="off" />
          <div style={{ height:8 }}/>
          <label style={lbl}>Meses de suscripcion</label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:14 }}>
            {PLANES.map(p=><button key={p.id} style={chip(formUsuarioTV.plan===p.id)} onClick={()=>setFormUsuarioTV({...formUsuarioTV, plan:p.id})}>{p.label}</button>)}
          </div>

          <label style={lbl}>4 perfiles (se crean automaticamente)</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
            {[1,2,3,4].map(n => (
              <div key={n} style={{ background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:"10px 12px", textAlign:"center" }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#A78BFA" }}>Perfil {n}</div>
                <div style={{ fontSize:9, color:"#4B5563", marginTop:2 }}>Usuario y clave propios</div>
              </div>
            ))}
          </div>

          <Btn variant="primary" onClick={guardarUsuarioTV}>Crear</Btn>
          <Btn onClick={()=>setModal(null)}>Cancelar</Btn>
        </ModalBg>
      )}

      {clienteDispositivos && (
        <ModalBg onClose={()=>setClienteDispositivos(null)}>
          <div style={{ fontSize:16, fontWeight:700, color:"#fff", marginBottom:4 }}>📺 Perfiles / Dispositivos</div>
          <div style={{ fontSize:12, color:"#6B7280", marginBottom:16 }}>{clienteDispositivos.nombre}</div>
          {Array.from({ length: clienteDispositivos.maxDispositivos||4 }).map((_, idx) => {
            const lista = getDispositivos(clienteDispositivos);
            const d = lista[idx];
            if (!d) {
              return (
                <button key={idx} onClick={()=>guardarDispositivoSlot(clienteDispositivos, idx, { nombre:"Perfil "+(idx+1), usuario:generarUsuarioAuto(clienteDispositivos.nombre), clave:generarClaveAuto() })}
                  style={{ width:"100%", background:"#0F1117", border:"1px dashed #2A2D45", borderRadius:10, padding:"14px 12px", marginBottom:8, cursor:"pointer", color:"#4B5563", fontSize:12, textAlign:"center" }}
                >+ Crear usuario para Perfil {idx+1}</button>
              );
            }
            return (
              <div key={idx} style={{ background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:10, marginBottom:8 }}>
                <div style={{ display:"flex", gap:6, marginBottom:6 }}>
                  <input style={{ ...inp, marginBottom:0 }} value={d.nombre} placeholder={"Perfil "+(idx+1)}
                    onChange={e=>guardarDispositivoSlot(clienteDispositivos, idx, { nombre:e.target.value })} />
                  <button onClick={()=>guardarDispositivoSlot(clienteDispositivos, idx, { usuario:generarUsuarioAuto(clienteDispositivos.nombre), clave:generarClaveAuto() })}
                    title="Regenerar credenciales" style={{ background:"#8B5CF622", border:"none", color:"#A78BFA", borderRadius:8, padding:"0 10px", cursor:"pointer", fontSize:13 }}>✨</button>
                  <button onClick={()=>eliminarDispositivoSlot(clienteDispositivos, idx)}
                    style={{ background:"#EF444422", border:"none", color:"#EF4444", borderRadius:8, padding:"0 10px", cursor:"pointer", fontSize:14 }}>🗑</button>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <input style={{ ...inp, marginBottom:0, flex:1 }} value={d.usuario} placeholder="Usuario"
                    onChange={e=>guardarDispositivoSlot(clienteDispositivos, idx, { usuario:e.target.value })} />
                  <input style={{ ...inp, marginBottom:0, flex:1 }} value={d.clave} placeholder="Contrasena"
                    onChange={e=>guardarDispositivoSlot(clienteDispositivos, idx, { clave:e.target.value })} />
                </div>
              </div>
            );
          })}
          <div style={{ height:8 }}/>
          <Btn onClick={()=>setClienteDispositivos(null)}>Cerrar</Btn>
        </ModalBg>
      )}

      {modal==="confirmarEliminarCuenta" && cuentaAEliminar && (
        <ModalBg onClose={()=>{ setModal(null); setCuentaAEliminar(null); }}>
          <div style={{ textAlign:"center", padding:"8px 0 4px" }}>
            <div style={{ fontSize:40, marginBottom:10 }}>⚠️</div>
            <div style={{ fontSize:15, fontWeight:700, color:"#fff", marginBottom:8 }}>Eliminar cuenta TV</div>
            <div style={{ fontSize:13, color:"#9CA3AF", marginBottom:6 }}>
              ¿Eliminar <strong style={{ color:"#E8EAF0" }}>{cuentaAEliminar.emailTV}</strong>?
            </div>
            <div style={{ fontSize:11, color:"#6B7280", marginBottom:20 }}>
              Los clientes que usan esta cuenta NO se eliminaran, solo quedaran sin cuenta TV asignada. Podras asignarles otra despues.
            </div>
          </div>
          <Btn variant="danger" onClick={()=>eliminarCuentaTV(cuentaAEliminar.id)}>Sí, eliminar cuenta</Btn>
          <Btn onClick={()=>{ setModal(null); setCuentaAEliminar(null); }}>Cancelar</Btn>
        </ModalBg>
      )}

      {modal==="tarea" && (
        <ModalBg onClose={()=>{ setModal(null); setTareaActiva(null); }}>
          <div style={{ fontSize:16, fontWeight:700, color:"#fff", marginBottom:14 }}>{tareaActiva ? "✏️ Editar tarea" : "📋 Nueva tarea"}</div>

          <label style={lbl}>Cliente *</label>
          {formTarea.clienteId ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:"10px 12px", marginBottom:10 }}>
              <span style={{ fontSize:13, fontWeight:600, color:"#E8EAF0" }}>{formTarea.clienteNombre}</span>
              <button onClick={()=>setFormTarea({...formTarea, clienteId:"", clienteNombre:""})} style={{ background:"none", border:"none", color:"#6B7280", cursor:"pointer", fontSize:12 }}>Cambiar</button>
            </div>
          ) : (
            <>
              <input style={inp} value={buscarClienteTarea} onChange={e=>setBuscarClienteTarea(e.target.value)} placeholder="Buscar cliente por nombre..." />
              <div style={{ maxHeight:160, overflowY:"auto", marginTop:6, marginBottom:10 }}>
                {buscarClienteTarea.trim() && clientes.filter(c=>c.nombre.toLowerCase().includes(buscarClienteTarea.toLowerCase())).slice(0,8).map(c=>(
                  <div key={c.id} onClick={()=>{setFormTarea({...formTarea, clienteId:c.id, clienteNombre:c.nombre}); setBuscarClienteTarea("");}}
                    style={{ padding:"9px 12px", background:"#0F1117", border:"1px solid #2A2D45", borderRadius:8, marginBottom:5, cursor:"pointer", fontSize:12, color:"#E8EAF0" }}
                  >{c.nombre}</div>
                ))}
              </div>
            </>
          )}

          <label style={lbl}>Tipo</label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
            {TIPOS_TAREA.map(tp=>(
              <button key={tp.id} onClick={()=>setFormTarea({...formTarea, tipo:tp.id})}
                style={{ padding:"6px 12px", borderRadius:20, border:formTarea.tipo===tp.id?"2px solid "+tp.color:"1px solid #2A2D45", background:formTarea.tipo===tp.id?tp.color+"22":"transparent", color:formTarea.tipo===tp.id?tp.color:"#6B7280", fontSize:12, cursor:"pointer" }}
              >{tp.icon} {tp.label}</button>
            ))}
          </div>

          <label style={lbl}>Descripcion *</label>
          <textarea style={{ width:"100%",background:"#0F1117",border:"1px solid #2A2D45",borderRadius:10,padding:"11px 12px",color:"#E8EAF0",fontSize:13,outline:"none",boxSizing:"border-box",resize:"vertical",minHeight:70 }}
            value={formTarea.descripcion} onChange={e=>setFormTarea({...formTarea, descripcion:e.target.value})}
            placeholder={formTarea.tipo==="reclamo" ? "Ej: Dice que no le funciona, pasar a verificar" : formTarea.tipo==="promesa_pago" ? "Ej: Dijo que paga el viernes" : "Detalle..."} />
          <div style={{ height:8 }}/>

          <label style={lbl}>Fecha *</label>
          <input style={inp} type="date" value={formTarea.fecha} onChange={e=>setFormTarea({...formTarea, fecha:e.target.value})} />
          <div style={{ height:16 }}/>

          <Btn variant="primary" onClick={guardarTarea}>{tareaActiva ? "Guardar cambios" : "Crear tarea"}</Btn>
          <Btn onClick={()=>{ setModal(null); setTareaActiva(null); }}>Cancelar</Btn>
        </ModalBg>
      )}

      {modal==="vincularCliente" && perfilAVincular && (
        <ModalBg onClose={()=>{ setModal(null); setPerfilAVincular(null); setBuscarClienteVincular(""); }}>
          <div style={{ fontSize:16, fontWeight:700, color:"#fff", marginBottom:4 }}>🔗 Vincular cliente existente</div>
          <div style={{ fontSize:12, color:"#6B7280", marginBottom:14 }}>Al Perfil {perfilAVincular.perfilNumero} de esta cuenta TV</div>

          <input style={inp} value={buscarClienteVincular} onChange={e=>setBuscarClienteVincular(e.target.value)} placeholder="Buscar cliente por nombre o WhatsApp..." autoFocus />
          <div style={{ height:10 }}/>

          {!buscarClienteVincular.trim() && (
            <div style={{ fontSize:11, color:"#4B5563", textAlign:"center", padding:"20px 0" }}>Escribe para buscar entre tus clientes existentes</div>
          )}

          {buscarClienteVincular.trim() && (() => {
            const q = buscarClienteVincular.toLowerCase();
            const resultados = clientes.filter(c => (c.nombre.toLowerCase().includes(q) || (c.whatsapp||"").includes(q))).slice(0,10);
            if (resultados.length===0) return <div style={{ fontSize:11, color:"#4B5563", textAlign:"center", padding:"20px 0" }}>Sin resultados</div>;
            return resultados.map(c => {
              const yaVinculado = !!c.cuentaTvId;
              return (
                <div key={c.id} onClick={()=>!yaVinculado && vincularClienteExistente(c)}
                  style={{ display:"flex", alignItems:"center", gap:10, background:"#0F1117", border:"1px solid #2A2D45", borderRadius:10, padding:"10px 12px", marginBottom:7, cursor: yaVinculado ? "default" : "pointer", opacity: yaVinculado ? 0.5 : 1 }}>
                  <div style={avatar(getColor(c.nombre))}>{c.nombre[0].toUpperCase()}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"#E8EAF0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.nombre}</div>
                    <div style={{ fontSize:10, color:"#6B7280" }}>{c.whatsapp||"Sin telefono"}</div>
                  </div>
                  {yaVinculado && <span style={{ fontSize:9, color:"#F59E0B", background:"#F59E0B22", padding:"2px 7px", borderRadius:10 }}>Ya vinculado</span>}
                </div>
              );
            });
          })()}

          <div style={{ height:10 }}/>
          <Btn onClick={()=>{ setModal(null); setPerfilAVincular(null); setBuscarClienteVincular(""); }}>Cancelar</Btn>
        </ModalBg>
      )}

      <Toast toast={toast}/>
    </div>
  );
}
