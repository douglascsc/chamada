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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5205);
const APP = "http://localhost:5205/";
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
  const ctx = await browser.newContext({ ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36" } : { viewport: { width: 1280, height: 900 } }), locale: "pt-BR" });
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

// ===== Lote 20: origem da presença — celular, computador ou professor =====
const nomesT = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira", "Daniel Souza Lima"];
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  const def = Timestamp.now();
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: def, codigoDuracaoMin: 60 });
  await setDoc(doc(f, "turmas/T1/salas/246810"), { nomes: [...nomesT].sort(), marcados: [], definidoEm: def });
  const b = writeBatch(f); nomesT.forEach((n, k) => b.set(doc(f, `turmas/T1/alunos/s${k}`), { nome: n })); await b.commit();
  await setDoc(doc(f, "turmas/T1/presencas/prof1"), { nome: nomesT[3], data: hoje, horario: "08:00", maquina: "professor", expiraEm: Timestamp.fromMillis(Date.now() + 86400000) });
});
const anon = env.unauthenticatedContext().firestore();
const pres = (maq, extra) => ({ nome: nomesT[0], data: hoje, horario: "", maquina: maq, codigoUsado: "246810", expiraEm: Timestamp.fromMillis(Date.now() + 86400000), criadoEm: serverTimestamp(), ...extra });
await nega("Regras: aparelho com valor inventado é recusado", setDoc(doc(anon, `turmas/T1/presencas/${hoje}_x1`), pres("x1", { aparelho: "tablet-hacker" })));

async function alunoMarca(mobile, nome) {
  const ctx = await newCtx(mobile);
  const p = await open(ctx, APP + "#turma=T1");
  await p.waitForSelector("#view-attendance:not(.hidden)"); await p.waitForTimeout(500);
  await p.fill("#student-daily-code", "246810");
  await p.waitForFunction(() => document.querySelectorAll(".student-row").length === 4, null, { timeout: 10000 });
  await p.locator(".student-row", { hasText: nome }).locator(".mark-button").click();
  await p.locator(".student-row", { hasText: nome }).locator(".confirm-attendance").click();
  let r = null;
  for (let i = 0; i < 30 && !r; i++) { await p.waitForTimeout(400); r = (await list("turmas/T1/presencas")).find((x) => x.nome === nome); }
  check(`${mobile ? "Celular" : "Computador"}: nenhum erro de JavaScript`, p.errs.length === 0, p.errs.join(";"));
  await ctx.close();
  return r;
}
const pCel = await alunoMarca(true, nomesT[0]);
check("Aluno pelo celular: presença gravada como \"celular\"", pCel && pCel.aparelho === "celular", JSON.stringify(pCel && pCel.aparelho));
const pPc = await alunoMarca(false, nomesT[1]);
check("Aluno pelo computador: presença gravada como \"computador\"", pPc && pPc.aparelho === "computador", JSON.stringify(pPc && pPc.aparelho));
// presença antiga (sem o campo): conta como celular
await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), `turmas/T1/presencas/${hoje}_antiga`), { nome: nomesT[2], data: hoje, horario: "08:05", maquina: "antiga", codigoUsado: "246810", expiraEm: Timestamp.fromMillis(Date.now() + 86400000) }); });

const { ctx, page } = await entrar("prof.ana@ifsul.edu.br");
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 4, null, { timeout: 10000 });
await page.waitForTimeout(800);
const rotulo = async (nome) => page.locator(".student-row", { hasText: nome }).locator(".origem-presenca").getAttribute("aria-label");
check("Chamada: ícone de celular", (await rotulo(nomesT[0])) === "Marcado pelo celular do aluno");
check("Chamada: ícone de computador", (await rotulo(nomesT[1])) === "Marcado pelo computador do aluno" && (await page.locator(".student-row", { hasText: nomesT[1] }).locator(".origem-presenca svg.lucide-monitor").count()) === 1);
check("Chamada: presença antiga (sem o tipo) aparece como celular", (await rotulo(nomesT[2])) === "Marcado pelo celular do aluno");
check("Chamada: ícone do professor", (await rotulo(nomesT[3])) === "Marcado pelo professor");
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await page.screenshot({ path: `${OUT}/l20-origem.png` });
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
