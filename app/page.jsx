"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import * as QRCode from "qrcode";
import JsBarcode from "jsbarcode";
import toast, { Toaster } from "react-hot-toast";
import {
  IconListDetails, IconBell, IconUsers, IconSettings, IconLogout,
  IconQrcode, IconPrinter, IconSearch, IconExternalLink, IconPlus, IconCheck,
} from "@tabler/icons-react";

/* ===================== Firebase (inline, no envs) ===================== */
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore, collection, doc, getDoc, setDoc, addDoc, onSnapshot,
  query, orderBy, serverTimestamp, where, getDocs, updateDoc,
} from "firebase/firestore";

// ⬇️ REPLACE with your Firebase Web config (Project Settings → Web app)
const firebaseConfig = {
  apiKey: "AIzaSyBUHK9WKBCxBrSCg2E8pujQSf3Ma5anpUU",
  authDomain: "asw-dashboard-b487f.firebaseapp.com",
  projectId: "asw-dashboard-b487f",
  storageBucket: "asw-dashboard-b487f.firebasestorage.app",
  messagingSenderId: "687619934997",
  appId: "1:687619934997:web:d915f92fc6824e4d25b71c",
  measurementId: "G-D7FHY8NT40"
};

const app = getApps().length ? getApp() : initializeApp(FIREBASE_CONFIG);
const db = getFirestore(app);
/* ===================================================================== */

/* =============================== Types (JSDoc) ======================== */
/** @typedef {"admin"|"staff"|"viewer"} Role */
/** @typedef {("new"|"paid"|"production"|"ready"|"collected")} OrderStatus */

/* ===================================================================== */

export default function Page() {
  const [view, setView] = useState("login"); // login | verify | orders | announce | users | settings
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [generatedCode, setGeneratedCode] = useState(""); // show on screen so single-file works

  const [me, setMe] = useState(null); // { email, role }
  const [orders, setOrders] = useState([]);
  const [search, setSearch] = useState("");

  const [announcementText, setAnnouncementText] = useState("");
  const [announcementMode, setAnnouncementMode] = useState("group"); // group | custom | say
  const [currentCallout, setCurrentCallout] = useState("");

  // seed admin + live listeners
  useEffect(() => {
    (async () => {
      const uRef = doc(db, "users", "admin@asw.com");
      if (!(await getDoc(uRef)).exists()) {
        await setDoc(uRef, { email: "admin@asw.com", role: "admin", password: "admin" });
      }
    })().catch(() => {});

    const unsubOrders = onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
      const arr = []; snap.forEach((d) => arr.push(d.data())); setOrders(arr);
    });

    const unsubAnn = onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc")), (snap) => {
      const first = snap.docs[0]; setCurrentCallout(first ? first.data().text : "");
    });

    return () => { unsubOrders(); unsubAnn(); };
  }, []);

  /* ============================== Auth + 2FA ============================== */
  const handleLogin = async () => {
    if (!loginEmail || !loginPass) return toast.error("Enter email & password");
    const userDoc = await getDoc(doc(db, "users", loginEmail));
    if (!userDoc.exists()) return toast.error("No such user");
    const u = userDoc.data();
    if ((u.password || "") !== loginPass) return toast.error("Wrong password");

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await setDoc(doc(db, "authCodes", loginEmail), { email: loginEmail, code, exp: Date.now() + 5*60*1000 });
    setGeneratedCode(code); // shows onscreen so you can proceed without a mailer

    // If you add a mailer route later, you can uncomment this:
    // fetch("/api/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({to:loginEmail,subject:"Your ASW code",html:`<h2>${code}</h2>`})}).catch(()=>{});
    toast.success("Verification code generated");
    setView("verify");
  };

  const handleVerify = async () => {
    const snap = await getDoc(doc(db, "authCodes", loginEmail));
    if (!snap.exists()) return toast.error("No verification in progress");
    const { code, exp } = snap.data();
    if (Date.now() > exp) return toast.error("Code expired");
    if (String(verifyCode).trim() !== String(code)) return toast.error("Wrong code");
    const u = (await getDoc(doc(db, "users", loginEmail))).data();
    setMe({ email: loginEmail, role: u.role || "viewer" });
    setView("orders"); toast.success("Logged in");
  };

  const can = (perm) => {
    if (perm === "any") return !!me; if (!me) return false;
    if (me.role === "admin") return true; if (me.role === "staff") return perm !== "admin"; return me.role === perm;
  };
  /* ======================================================================= */

  /* ============================== Orders ============================== */
  const filteredOrders = useMemo(() => {
    if (!search) return orders;
    const s = search.toLowerCase();
    return orders.filter(
      (o) =>
        (o.id || "").toLowerCase().includes(s) ||
        (o.product || "").toLowerCase().includes(s) ||
        (o.email || "").toLowerCase().includes(s) ||
        (o.message || "").toLowerCase().includes(s) ||
        (o.variant || "").toLowerCase().includes(s)
    );
  }, [orders, search]);

  const updateOrderStatus = async (id, status) => {
    const r = await getDocs(query(collection(db, "orders"), where("id", "==", id)));
    const d = r.docs[0]; if (!d) return toast.error("Order not found");
    await updateDoc(doc(db, "orders", d.id), { status });
    toast.success(`Order ${id} → ${status}`);
  };

  const addOrder = async (o) => {
    await addDoc(collection(db, "orders"), { ...o, createdAt: serverTimestamp() });
    toast.success(`Order ${o.id} added`);
  };
  /* ==================================================================== */

  /* ============================== Printing ============================== */
  const printSlip = async (order) => {
    const w = window.open("", "_blank", "width=600,height=800"); if (!w) return;

    const barcodeCanvas = document.createElement("canvas");
    JsBarcode(barcodeCanvas, order.id, { format: "CODE128", displayValue: true });

    const qrCanvas = document.createElement("canvas");
    await QRCode.toCanvas(qrCanvas, order.id, { margin: 1, scale: 6 });

    const css = `
      <style>
        @page { size: 4in 6in; margin: 8mm; }
        body { font-family: ui-sans-serif, system-ui, -apple-system, Arial; }
        .title { font-size: 20px; font-weight: 700; color: #b00020; margin: 0 0 6px; }
        .row { margin: 4px 0; font-size: 14px; }
        .box { border: 1px solid #ddd; padding: 8px; border-radius: 8px; }
        .grid { display: grid; grid-template-columns: 1fr 120px; gap: 12px; align-items: start; }
        .muted { color: #555; }
        .footer { margin-top: 10px; font-size: 12px; color: #333; }
        img { max-width: 100%; }
      </style>
    `;

    w.document.write(`
      <html><head><title>${order.id}</title>${css}</head>
      <body>
        <div class="box">
          <div class="title">ASW Order Slip</div>
          <div class="row"><strong>Request ID:</strong> ${order.id}</div>
          <div class="grid">
            <div>
              <div class="row"><strong>Product:</strong> ${order.product}</div>
              <div class="row"><strong>Variant:</strong> ${order.variant}</div>
              <div class="row"><strong>Price:</strong> $${Number(order.price||0).toFixed(2)}</div>
              <div class="row"><strong>Email:</strong> ${order.email || "-"}</div>
              ${order.message ? `<div class="row"><strong>Message:</strong> <span class="muted">${order.message}</span></div>` : ""}
              <div class="footer">Status: ${order.status}</div>
            </div>
            <div>
              <img src="${barcodeCanvas.toDataURL()}" />
              <img src="${qrCanvas.toDataURL()}" />
            </div>
          </div>
        </div>
        <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    w.document.close();
  };
  /* ====================================================================== */

  /* ============ Pop-out tabs: Customer Form & Live Display (TV) =========== */
  const openCustomerFormTab = () => {
    const html = buildCustomerFormHTML(FIREBASE_CONFIG);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank");
  };
  const openLiveDisplayTab = () => {
    const html = buildLiveDisplayHTML(FIREBASE_CONFIG);
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank");
  };
  /* ======================================================================== */

  /* ============================= Announcements ============================ */
  const sendAnnouncement = async () => {
    let text = "";
    if (announcementMode === "group") text = `Group ${announcementText} — please collect your order.`;
    if (announcementMode === "custom") text = announcementText;
    if (announcementMode === "say") text = announcementText;
    if (!text.trim()) return toast.error("Enter announcement text");

    await addDoc(collection(db, "announcements"), { text, createdAt: serverTimestamp() });
    chime(); tts(text); toast.success("Announcement sent");
  };

  const chime = () => {
    const ctx = new AudioContext(); const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    o.start(); o.stop(ctx.currentTime + 0.26);
  };

  const tts = (text) => {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-AU"; u.rate = 1; window.speechSynthesis.speak(u);
  };
  /* ======================================================================== */

  /* ================================= UI =================================== */
  if (view === "login") {
    return (
      <AuthScreen
        title="ASW Dashboard"
        subtitle="Sign in to continue"
        email={loginEmail} setEmail={setLoginEmail}
        pass={loginPass}   setPass={setLoginPass}
        onSubmit={handleLogin}
      />
    );
  }

  if (view === "verify") {
    return (
      <VerifyScreen
        onBack={() => setView("login")}
        code={verifyCode} setCode={setVerifyCode}
        onSubmit={handleVerify}
        hintCode={generatedCode}
      />
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#f6f7f9" }}>
      <Toaster />
      {/* Sidebar */}
      <div style={{ width: 240, background: "#b00020", color: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 16, fontWeight: 800, fontSize: 18 }}>ASW Dashboard</div>
        <SideBtn label="Orders"   onClick={() => setView("orders")}  />
        <SideBtn label="Announce" onClick={() => setView("announce")} />
        <SideBtn label="Users"    onClick={() => setView("users")}    disabled={!can("staff")} />
        <SideBtn label="Settings" onClick={() => setView("settings")} disabled={!can("staff")} />
        <div style={{ flex: 1 }} />
        <SideBtn label="Logout"   onClick={() => { setMe(null); setView("login"); }} />
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Topbar */}
        <div style={{ height: 56, background: "#fff", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 12, padding: "0 16px" }}>
          <IconSearch size={18} />
          <input
            placeholder="Search orders, emails, message, variants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, border: "none", outline: "none", height: 28, background: "transparent" }}
          />
          <div style={{ fontSize: 12, color: "#666" }}>{me?.email} ({me?.role})</div>
        </div>

        {/* Content */}
        <div style={{ padding: 16, overflow: "auto" }}>
          {view === "orders" && (
            <OrdersPanel
              orders={filteredOrders}
              onUpdateStatus={updateOrderStatus}
              onPrint={printSlip}
              onOpenFormTab={openCustomerFormTab}
              onOpenLiveTab={openLiveDisplayTab}
              onAddOrder={addOrder}
            />
          )}
          {view === "announce" && (
            <AnnouncePanel
              mode={announcementMode} setMode={setAnnouncementMode}
              text={announcementText} setText={setAnnouncementText}
              onSend={sendAnnouncement}
              onOpenLiveTab={openLiveDisplayTab}
              current={currentCallout}
            />
          )}
          {view === "users" && <UsersPanel />}
          {view === "settings" && <SettingsPanel />}
        </div>
      </div>
    </div>
  );
}

/* ============================= Small Components ============================ */
function SideBtn({ label, onClick, disabled }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8, padding: "10px 14px",
        width: "100%", background: "transparent",
        color: disabled ? "#ffd6dd" : "#fff", border: "none", cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );
}

function AuthScreen({ title, subtitle, email, setEmail, pass, setPass, onSubmit }) {
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#b00020" }}>
      <div style={{ width: 360, background: "#fff", padding: 24, borderRadius: 12, boxShadow: "0 10px 40px rgba(0,0,0,.2)" }}>
        <div style={{ fontWeight: 800, fontSize: 22, color: "#b00020", marginBottom: 6 }}>{title}</div>
        <div style={{ color: "#666", marginBottom: 16 }}>{subtitle}</div>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
        <input placeholder="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} style={field} />
        <button style={primaryBtn} onClick={onSubmit}>Sign in</button>
      </div>
      <Toaster />
    </div>
  );
}

function VerifyScreen({ onBack, code, setCode, onSubmit, hintCode }) {
  return (
    <div style={{ height: "100vh", display: "grid", placeItems: "center", background: "#b00020" }}>
    <div style={{ width: 360, background: "#fff", padding: 24, borderRadius: 12, boxShadow: "0 10px 40px rgba(0,0,0,.2)" }}>
      <div style={{ fontWeight: 800, fontSize: 20, marginBottom: 8 }}>Enter 6-digit code</div>
      <input placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} style={field} />
      <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
        Hint (dev/demo): <strong>{hintCode || "—"}</strong>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={secondaryBtn} onClick={onBack}>Back</button>
        <button style={primaryBtn} onClick={onSubmit}>Verify</button>
      </div>
    </div>
    <Toaster />
    </div>
  );
}

function OrdersPanel({ orders, onUpdateStatus, onPrint, onOpenFormTab, onOpenLiveTab, onAddOrder }) {
  const [newId, setNewId] = useState("XX-XX-XXXX");
  const [newProduct, setNewProduct] = useState("Acrylic Keychain");
  const [newVariant, setNewVariant]   = useState("Classic");
  const [newPrice, setNewPrice]       = useState(2);
  const [newEmail, setNewEmail]       = useState("");
  const [newMsg, setNewMsg]           = useState("");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <button style={ghostBtn} onClick={onOpenFormTab}><IconExternalLink size={16}/> Open Customer Form in new tab</button>
        <button style={ghostBtn} onClick={onOpenLiveTab}><IconExternalLink size={16}/> Open Live Display in new tab</button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Quick Add Order</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
          <input placeholder="Request ID (REQ-##### or XX-XX-XXXX)" value={newId} onChange={(e) => setNewId(e.target.value)} style={field} />
          <input placeholder="Product" value={newProduct} onChange={(e) => setNewProduct(e.target.value)} style={field} />
          <input placeholder="Variant" value={newVariant} onChange={(e) => setNewVariant(e.target.value)} style={field} />
          <input placeholder="Price" type="number" value={newPrice} onChange={(e) => setNewPrice(Number(e.target.value))} style={field} />
          <input placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={field} />
          <input placeholder="Message (optional)" value={newMsg} onChange={(e) => setNewMsg(e.target.value)} style={field} />
        </div>
        <div style={{ marginTop: 8 }}>
          <button
            style={primarySm}
            onClick={() =>
              onAddOrder({
                id: newId || `REQ-${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`,
                product: newProduct, variant: newVariant, price: Number(newPrice) || 0,
                email: newEmail || undefined, message: newMsg || undefined, status: "new",
              })
            }
          >
            <IconPlus size={16}/> Add
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {orders.map((o) => (
          <motion.div key={o.id} layout style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }} whileHover={{ scale: 1.01 }}>
            <div style={{ fontWeight: 800, color: "#b00020", marginBottom: 4 }}>{o.id}</div>
            <div style={{ fontSize: 14, marginBottom: 2 }}><strong>Product:</strong> {o.product} — {o.variant}</div>
            <div style={{ fontSize: 14, marginBottom: 2 }}><strong>Price:</strong> ${Number(o.price||0).toFixed(2)}</div>
            <div style={{ fontSize: 14, marginBottom: 2 }}><strong>Email:</strong> {o.email || "-"}</div>
            {o.message && <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}><strong>Message:</strong> {o.message}</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <Badge label={o.status} />
              <button style={miniBtn} onClick={() => onUpdateStatus(o.id, "paid")}>Paid</button>
              <button style={miniBtn} onClick={() => onUpdateStatus(o.id, "production")}>Production</button>
              <button style={miniBtn} onClick={() => onUpdateStatus(o.id, "ready")}>Ready</button>
              <button style={miniBtn} onClick={() => onUpdateStatus(o.id, "collected")}>Collected</button>
              <button style={miniBtn} onClick={() => onPrint(o)}><IconPrinter size={14}/> Slip</button>
              <button
                style={miniBtn}
                onClick={async () => {
                  const c = document.createElement("canvas");
                  await QRCode.toCanvas(c, o.id, { margin: 1, scale: 10 });
                  const w = window.open("", "_blank", "width=600,height=600");
                  if (!w) return; w.document.write(`<img src="${c.toDataURL()}" style="width:100%;height:auto" />`); w.document.close();
                }}
              >
                <IconQrcode size={14}/> QR
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Badge({ label }) {
  const map = { new: "#334155", paid: "#2563eb", production: "#a16207", ready: "#16a34a", collected: "#64748b" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 999, padding: "4px 10px", fontSize: 12, color: "#fff", background: map[label] || "#475569" }}>
      <IconCheck size={14}/> {label}
    </span>
  );
}

function AnnouncePanel({ mode, setMode, text, setText, onSend, onOpenLiveTab, current }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={ghostBtn} onClick={onOpenLiveTab}><IconExternalLink size={16}/> Open Live Display in new tab</button>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Announcement</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <select value={mode} onChange={(e) => setMode(e.target.value)} style={selectField}>
            <option value="group">Group</option>
            <option value="custom">Custom</option>
            <option value="say">Say anything (TTS)</option>
          </select>
          <input placeholder={mode === "group" ? "e.g. 1, 2, 3…" : "Write announcement…"} value={text} onChange={(e) => setText(e.target.value)} style={field} />
          <button style={primarySm} onClick={onSend}>Send</button>
        </div>
        <div style={{ fontSize: 13, color: "#555" }}>
          <strong>Current (preview):</strong> {current || "—"}
        </div>
      </div>
    </div>
  );
}

function UsersPanel() {
  const [email, setEmail] = useState("");
  const [role, setRole]   = useState("staff");
  const [password, setPassword] = useState("");
  const [users, setUsers] = useState([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(getFirestore(), "users"), (snap) => {
      const arr = []; snap.forEach((d) => arr.push(d.data())); setUsers(arr);
    });
    return () => unsub();
  }, []);

  const addUser = async () => {
    if (!email || !password) return toast.error("Email & password required");
    await setDoc(doc(db, "users", email), { email, role, password });
    toast.success("User added"); setEmail(""); setPassword("");
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Add User</div>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8 }}>
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={field} />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={selectField}>
            <option value="admin">admin</option>
            <option value="staff">staff</option>
            <option value="viewer">viewer</option>
          </select>
          <input placeholder="Temp password" value={password} onChange={(e) => setPassword(e.target.value)} style={field} />
          <button style={primarySm} onClick={addUser}><IconPlus size={16}/> Add</button>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>All Users</div>
        <div style={{ display: "grid", gap: 8 }}>
          {users.map((u) => (
            <div key={u.email} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, alignItems: "center" }}>
              <div>{u.email}</div>
              <div>{u.role}</div>
              <button
                style={miniBtn}
                onClick={async () => {
                  const next = u.role === "admin" ? "staff" : u.role === "staff" ? "viewer" : "admin";
                  await setDoc(doc(db, "users", u.email), { ...u, role: next });
                  toast.success(`Role → ${next}`);
                }}
              >
                Cycle Role
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Branding & Theme</div>
        <div style={{ color: "#555", fontSize: 14 }}>Red/Light theme preset. Add logo/theme toggles here.</div>
      </div>
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Data</div>
        <div style={{ color: "#555", fontSize: 14 }}>Firestore stores everything in real time globally.</div>
      </div>
    </div>
  );
}

/* ====================== Pop-out HTML builders (inline) ===================== */
function buildCustomerFormHTML(cfg) {
  const json = JSON.stringify(cfg);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>ASW Customer Form</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-compat.js"></script>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, Arial; background:#f6f7f9; margin:0; }
  .wrap { max-width: 720px; margin: 24px auto; background:#fff; padding:16px; border-radius:12px; box-shadow: 0 8px 30px rgba(0,0,0,.06); }
  .title { font-size: 22px; font-weight:800; color:#b00020; }
  .row { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px; }
  .full { grid-column: 1 / -1; }
  input, select, textarea { width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:8px; outline:none; font-size:14px; }
  button { background:#b00020; color:#fff; border:none; padding:10px 14px; border-radius:8px; cursor:pointer; font-weight:700; }
  .muted { color:#666; font-size:13px; margin-top:6px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="title">ASW Customer Form</div>
    <div class="muted">Submissions sync globally in real time.</div>
    <form id="f" class="row">
      <input class="full" name="id" placeholder="Request ID (REQ-##### or XX-XX-XXXX)" required />
      <input name="name" placeholder="Your name" required />
      <input name="email" placeholder="Email" type="email" required />
      <input name="product" placeholder="Product name (e.g., Acrylic Keychain)" required />
      <input name="variant" placeholder="Variant (e.g., Classic / Red / Large)" />
      <input name="price" placeholder="Price (number)" type="number" step="0.01" />
      <textarea class="full" name="message" placeholder="Custom message (engraving)"></textarea>
      <button class="full" type="submit">Submit</button>
    </form>
    <div id="ok" class="muted"></div>
  </div>
<script>
  const config = ${json};
  const app = firebase.initializeApp(config);
  const db = firebase.firestore(app);

  document.getElementById('f').addEventListener('submit', async function(e){
    e.preventDefault();
    const fd = new FormData(e.target);
    const order = {
      id: String(fd.get('id')||'').trim(),
      product: String(fd.get('product')||'').trim(),
      variant: String(fd.get('variant')||'').trim() || 'Default',
      price: Number(fd.get('price')||0),
      message: String(fd.get('message')||'').trim() || undefined,
      email: String(fd.get('email')||'').trim(),
      status: 'new',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if(!order.id || !order.product){ alert('Need Request ID & Product'); return; }
    try {
      await db.collection('orders').add(order);
      document.getElementById('ok').innerText = 'Submitted! You can close this tab.';
      e.target.reset();
    } catch (err) {
      alert('Failed to submit: ' + (err?.message || err));
    }
  });
</script>
</body>
</html>`;
}

function buildLiveDisplayHTML(cfg) {
  const json = JSON.stringify(cfg);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>ASW Live Display</title>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="https://www.gstatic.com/firebasejs/10.11.0/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore-compat.js"></script>
<style>
  :root { --red:#b00020; }
  html, body { height:100%; margin:0; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, Arial; background:#111; color:#fff; display:flex; flex-direction:column; }
  .bar { height:64px; background:var(--red); display:flex; align-items:center; padding:0 16px; font-weight:800; font-size:22px; }
  .grid { display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; padding:16px; }
  .card { background:#1b1b1b; border:1px solid #2a2a2a; border-radius:12px; padding:12px; }
  .id { color: #fff; font-weight:900; font-size:18px; }
  .small { color:#bbb; font-size:13px; margin-top:6px; }
  .callout { background: #fff; color:#111; padding:8px 12px; border-radius:8px; display:inline-block; margin-left:12px; font-weight:800; }
</style>
</head>
<body>
  <div class="bar">ASW Live Display <span id="callout" class="callout" style="display:none;"></span></div>
  <div class="grid" id="grid"></div>

<script>
  const config = ${json};
  const app = firebase.initializeApp(config);
  const db = firebase.firestore(app);

  const grid = document.getElementById('grid');
  const call = document.getElementById('callout');

  function render(orders){
    grid.innerHTML = orders
      .filter(o => o.status === 'ready')
      .slice(0, 24)
      .map(o => '<div class="card"><div class="id">'+o.id+'</div><div class="small">'+(o.product||'')+' — '+(o.variant||'')+'</div></div>')
      .join('');
  }

  db.collection('orders').orderBy('createdAt', 'desc').onSnapshot(snap => {
    const arr = []; snap.forEach(d => arr.push(d.data())); render(arr);
  });

  db.collection('announcements').orderBy('createdAt', 'desc').limit(1).onSnapshot(snap => {
    const d = snap.docs[0];
    if (d) { call.style.display = 'inline-block'; call.textContent = d.data().text; }
  });
</script>
</body>
</html>`;
}

/* ============================== Shared styles ============================== */
const field = { width: "100%", padding: "10px 12px", border: "1px solid #e5e7eb", borderRadius: 8, outline: "none", marginBottom: 8, fontSize: 14, background: "#fff" };
const selectField = { ...field, marginBottom: 0 };
const primaryBtn = { width: "100%", background: "#b00020", color: "#fff", border: "none", padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 800 };
const secondaryBtn = { flex: 1, background: "#e5e7eb", color: "#111", border: "none", padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontWeight: 700 };
const ghostBtn = { background: "#fff", color: "#b00020", border: "1px solid #f2b4be", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 };
const primarySm = { background: "#b00020", color: "#fff", border: "none", padding: "8px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 8 };
const miniBtn = { background: "#fff", color: "#111", border: "1px solid #e5e7eb", padding: "6px 8px", borderRadius: 8, cursor: "pointer", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 };
