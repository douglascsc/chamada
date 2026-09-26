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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5202);
const APP = "http://localhost:5202/";
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

// ===== Lote 17: aluno vê quem o professor marcou antes do código; registro repetido =====
const nomesT = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira", "Daniel Souza Lima"];
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: null });
  const b = writeBatch(f); nomesT.forEach((n, k) => b.set(doc(f, `turmas/T1/alunos/s${k}`), { nome: n })); await b.commit();
});
let { ctx, page } = await entrar("prof.ana@ifsul.edu.br");
await page.waitForSelector("#teacher-turmas-list > div");
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 4, null, { timeout: 10000 });
// professora marca 2 ANTES de gerar o código
for (const n of nomesT.slice(0, 2)) { await page.locator(".student-row", { hasText: n }).locator(".mark-button").click(); await page.waitForTimeout(300); }
await page.waitForFunction(() => document.getElementById("present-count").textContent === "2", null, { timeout: 8000 });
await page.waitForTimeout(800);
await page.click("#btn-bar-new-code");
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
const codigo = (await page.textContent("#code-display-value")).trim();
await page.click("#btn-close-code-display");
await page.waitForTimeout(800);
const sala = (await list("turmas/T1/salas"))[0];
check("Gerar código: a sala leva quem já estava marcado sem código", sala && JSON.stringify(sala.marcados) === JSON.stringify(nomesT.slice(0, 2).sort()), JSON.stringify(sala && sala.marcados));

// aluno
const ctxA = await newCtx(true);
const aluno = await open(ctxA, APP + "#turma=T1");
await aluno.waitForSelector("#view-attendance:not(.hidden)"); await aluno.waitForTimeout(600);
await aluno.fill("#student-daily-code", codigo);
await aluno.waitForFunction(() => document.querySelectorAll(".student-row").length === 4, null, { timeout: 10000 });
await aluno.waitForTimeout(500);
check("Aluno: vê os 2 marcados pela professora antes do código (2/4)", (await aluno.textContent("#present-count")) === "2", await aluno.textContent("#present-count"));
check("Aluno: o marcado pela professora aparece como \"Presente\" (sem botão de marcar)", await aluno.locator(".student-row", { hasText: nomesT[0] }).locator(".mark-button").isHidden());
// aluno marca outro
await aluno.locator(".student-row", { hasText: nomesT[2] }).locator(".mark-button").click();
await aluno.locator(".student-row", { hasText: nomesT[2] }).locator(".confirm-attendance").click();
await page.waitForFunction(() => document.getElementById("present-count").textContent === "3", null, { timeout: 10000 })
  .then(() => check("Professora vê a marcação do aluno (3/4)", true), () => check("Professora vê a marcação do aluno (3/4)", false));
// professora desfaz um que marcou antes do código → aluno vê desmarcado
await page.locator(".student-row", { hasText: nomesT[0] }).getByRole("button", { name: /Desfazer/ }).first().click();
await page.waitForSelector("#reauth-backdrop:not(.hidden), #teacher-gate-modal-backdrop:not(.hidden)", { timeout: 5000 }).catch(() => {});
if (await page.isVisible("#reauth-backdrop")) { await page.fill("#reauth-input", PASS); await page.click("#btn-submit-reauth"); }
else if (await page.isVisible("#teacher-gate-modal-backdrop")) { await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit"); }
await aluno.waitForFunction((n) => { const r = [...document.querySelectorAll(".student-row")].find((x) => x.dataset.studentName === n); return r && !r.querySelector(".mark-button").classList.contains("hidden"); }, nomesT[0], { timeout: 10000 })
  .then(() => check("Professora desfaz → o aluno vê de novo como não marcado", true), () => check("Professora desfaz → o aluno vê de novo como não marcado", false));
check("Nenhum erro de JavaScript (professora e aluno)", page.errs.length === 0 && aluno.errs.length === 0, [...page.errs, ...aluno.errs].join(";"));
await ctxA.close(); await ctx.close();

// ===== Registro repetido: vale o horário mais cedo; desfazer apaga os dois =====
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "turmas/T1/presencas/dupA"), { nome: nomesT[3], data: hoje, horario: "07:30", maquina: "professor", expiraEm: Timestamp.fromMillis(Date.now() + 86400000) });
  await setDoc(doc(f, "turmas/T1/presencas/dupB"), { nome: nomesT[3], data: hoje, horario: "09:00", maquina: "celular", codigoUsado: "x", expiraEm: Timestamp.fromMillis(Date.now() + 86400000) });
});
({ ctx, page } = await entrar("prof.ana@ifsul.edu.br"));
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 4, null, { timeout: 10000 });
await page.waitForTimeout(800);
const rotulo = await page.locator(".student-row", { hasText: nomesT[3] }).locator(".present-status-label").textContent();
check("Registro repetido: mostra o horário mais cedo e sem \"atrasado\"", /07:30/.test(rotulo) && !/atrasado/.test(rotulo), rotulo);
check("Registro repetido: conta uma vez só", (await page.textContent("#present-count")) === "3", await page.textContent("#present-count"));
await page.locator(".student-row", { hasText: nomesT[3] }).getByRole("button", { name: /Desfazer/ }).first().click();
await page.waitForSelector("#reauth-backdrop:not(.hidden), #teacher-gate-modal-backdrop:not(.hidden)", { timeout: 5000 }).catch(() => {});
if (await page.isVisible("#reauth-backdrop")) { await page.fill("#reauth-input", PASS); await page.click("#btn-submit-reauth"); }
else if (await page.isVisible("#teacher-gate-modal-backdrop")) { await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit"); }
await page.waitForTimeout(1500);
check("Desfazer apaga os dois registros do aluno", !(await list("turmas/T1/presencas")).some((p) => p.nome === nomesT[3]));
check("Nenhum erro de JavaScript", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
