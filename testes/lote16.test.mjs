import { migrarCodigos, liberarProfessoresDoEmulador } from "./codigo-helpers.mjs";
import { chromium } from "playwright-core";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteField, collection, writeBatch, Timestamp, query, where, serverTimestamp } from "firebase/firestore";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";

// Cartão da turma: no celular, "Gerenciar" e "Gerar código 1h" ficam no "⋯"
// Gerenciar: "Alunos" e "Configurações da turma" começam recolhidos; abre como o professor faria (tocando no título)
async function abrirGerenciar(p) {
  await p.waitForSelector("#teacher-manage-panel:not(.hidden)");
  // (o site pode abrir "Alunos" sozinho numa turma vazia no mesmo instante; confere e repete)
  for (const id of ["manage-alunos-details", "manage-config-details"]) {
    for (let i = 0; i < 4 && !(await p.$eval(`#${id}`, (d) => d.open)); i++) {
      await p.click(`#${id} > summary`);
      await p.waitForTimeout(250);
    }
  }
}
async function cardClick(card, name) {
  const visivel = card.getByRole("button", { name, exact: true }).locator("visible=true");
  if (!(await visivel.count())) await card.getByRole("button", { name: /^Mais opções/ }).click();
  await card.getByRole("button", { name, exact: true }).locator("visible=true").first().click();
}

const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = "") => { results.push(Boolean(ok)); console.log(ok ? "✅" : "❌", name, detail ? `— ${detail}` : ""); };
const types = { ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5201);
const APP = "http://localhost:5201/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "prof.ana@ifsul.edu.br", password: PASS, returnSecureToken: true }) }).then((r) => r.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName: "Ana Souza" }) });
const uidA = r.localId;
// conta master (UID fixo no lugar do UID real das regras)
const rM = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "douglascamargo@ifsul.edu.br", password: PASS, returnSecureToken: true }) }).then((x) => x.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: rM.idToken, displayName: "Douglas" }) });
const uidM = rM.localId;
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8").replace("COLE_AQUI_O_UID_DA_CONTA_MASTER", uidM) } });
const now = Date.now();
const ontem = new Date(now - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const read = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), p))).data(); }); return out; };
const list = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDocs(collection(ctx.firestore(), p))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
async function newCtx(mobile = true) {
  const ctx = await browser.newContext({ ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } }), locale: "pt-BR" });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (q) => q.fulfill({ body: readFileSync(`node_modules/firebase/${path.basename(new URL(q.request().url()).pathname)}`), contentType: "text/javascript" }));
  await ctx.route("https://cdn.tailwindcss.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
async function open(ctx, url) { const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); await p.goto(url); return p; }
const hoje = new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const ok = (label, p) => p.then(() => check(label, true), (e) => check(label, false, e.message.slice(0, 120)));
const nega = (label, p) => p.then(() => check(label, false, "foi PERMITIDO"), () => check(label, true));
const row = (page, nome) => page.locator("#teacher-turmas-list > div", { hasText: nome });
async function entrar(email) {
  const ctx = await newCtx(true);
  const page = await open(ctx, APP + "#professor");
  await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
  await page.fill("#teacher-gate-email", email); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
  await page.waitForSelector("#teacher-dashboard-content:not(.hidden), #terms-modal-backdrop:not(.hidden), #teacher-name-gate:not(.hidden)", { timeout: 15000 });
  return { ctx, page };
}
async function openAdmin(page) {
  await page.click("#btn-open-more-options");
  if (!(await page.evaluate(() => document.getElementById("admin-panel-section").open))) await page.click("#admin-panel-section summary");
  await page.waitForFunction(() => document.querySelectorAll("#admin-professores-list > div").length > 0 && !/Carregando/.test(document.getElementById("admin-professores-status").textContent), null, { timeout: 15000 });
}
async function criarTurmaPeloSite(page, turma) {
  await page.click("#btn-open-more-options");
  if (!(await page.evaluate(() => document.getElementById("new-turma-details").open))) await page.click("#new-turma-details summary");
  await page.fill("#new-turma-turma", turma); await page.fill("#new-turma-ano", "2027");
  await page.click("#btn-create-turma");
}

// ===== Lote 16: limpeza das presenças vencidas (master limpa todas as turmas) =====
const dia = (d) => new Date(Date.now() + d * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const ts = (ms) => Timestamp.fromMillis(Date.now() + ms);
const H = 3600000, D = 86400000;
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  for (const [u, e, nm] of [[uidA, "prof.ana@ifsul.edu.br", "Ana Souza"], [uidM, "douglascamargo@ifsul.edu.br", "Douglas"]]) await setDoc(doc(f, "acordosProfessor", u), { avisosAceitosEm: Timestamp.now(), email: e, nome: nm });
  await setDoc(doc(f, "turmas/TA"), { nome: "INF2M 2026 - Da Ana", professorUid: uidA, professorNome: "Ana Souza" });
  await setDoc(doc(f, "turmas/TB"), { nome: "INF3M 2026 - De outro", professorUid: "profB", professorNome: "Prof B" });
  const p = (nome, data, expiraEm) => ({ nome, data, horario: "08:00", maquina: "m", ...(expiraEm ? { expiraEm } : {}) });
  // turma da Ana: uma vencida há 1 dia (a Ana limpa ao entrar)
  await setDoc(doc(f, "turmas/TA/presencas/vencida1d"), p("A", dia(-8), ts(-1 * D)));
  await setDoc(doc(f, "turmas/TA/presencas/ok"), p("B", dia(-2), ts(5 * D)));
  // turma de outro professor, que não entra há dias: só a master limpa
  await setDoc(doc(f, "turmas/TB/presencas/vencida5d"), p("C", dia(-12), ts(-5 * D)));
  await setDoc(doc(f, "turmas/TB/presencas/semPrazo"), p("D", dia(-20), null));
  await setDoc(doc(f, "turmas/TB/presencas/vencidaAgora"), p("E", dia(-7), ts(-1 * H)));
  await setDoc(doc(f, "turmas/TB/presencas/ok"), p("F", dia(-1), ts(6 * D)));
});
const ids = async (t) => (await list(`turmas/${t}/presencas`)).map((d) => d.id).sort().join(",");

let { ctx, page } = await entrar("prof.ana@ifsul.edu.br");
await page.waitForTimeout(3000);
check("Professora: limpa as vencidas da própria turma", (await ids("TA")) === "ok", await ids("TA"));
check("Professora: não mexe na turma de outro professor", (await ids("TB")) === "ok,semPrazo,vencida5d,vencidaAgora", await ids("TB"));
check("Professora: sem aviso de limpeza", !/Limpeza:/.test(await page.textContent("#toast-text")));
await ctx.close();

({ ctx, page } = await entrar("douglascamargo@ifsul.edu.br"));
await page.waitForFunction(() => /Limpeza:/.test(document.getElementById("toast-text").textContent), null, { timeout: 15000 }).catch(() => {});
const aviso = await page.textContent("#toast-text");
check("Master: limpa as vencidas das turmas de TODOS os professores", (await ids("TB")) === "ok", await ids("TB"));
check("Master: apaga presença antiga sem prazo (pela data)", !(await ids("TB")).includes("semPrazo"));
check("Master: avisa quantas passaram do prazo (2: 5 dias e sem prazo) e o maior atraso", /Limpeza: 2 presenças já tinham passado do prazo de 7 dias \(até 5 dias a mais\)/.test(aviso), aviso);
check("Nenhum erro de JavaScript (master)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
