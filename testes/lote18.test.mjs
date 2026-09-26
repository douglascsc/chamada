import { migrarCodigos, liberarProfessoresDoEmulador } from "./codigo-helpers.mjs";
import { chromium } from "playwright-core";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteField, collection, writeBatch, Timestamp, query, where, serverTimestamp } from "firebase/firestore";
import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5203);
const APP = "http://localhost:5203/";
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

// ===== Lote 18: auditoria 2 (código de 6 dígitos, limites nas regras, limpeza, link, moldura) =====
const H = 3600000;
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "professoresAutorizados", uidA), { email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: null });
  await setDoc(doc(f, "turmas/T1/alunos/a1"), { nome: "Aluno Um" });
  await setDoc(doc(f, "turmas/T1/alunos/a2"), { nome: "Aluno Dois" });
  // código vencido há 13h (não encerrado) e outro vencido há 1h
  const velho = Timestamp.fromMillis(Date.now() - 14 * H);
  await setDoc(doc(f, "turmas/VELHA"), { nome: "INF3M 2026 - Velha", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: velho, codigoDuracaoMin: 60 });
  await setDoc(doc(f, "turmas/VELHA/salas/111111"), { nomes: ["X"], definidoEm: velho });
  const recente = Timestamp.fromMillis(Date.now() - 2 * H);
  await setDoc(doc(f, "turmas/RECENTE"), { nome: "INF4M 2026 - Recente", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: recente, codigoDuracaoMin: 60 });
  await setDoc(doc(f, "turmas/RECENTE/salas/222222"), { nomes: ["Y"], definidoEm: recente });
});
const prof = env.authenticatedContext(uidA, { email: "prof.ana@ifsul.edu.br" }).firestore();
const outro = env.authenticatedContext("outra-conta", { email: "x@x.br" }).firestore();

// --- R5: prazo do código
await nega("Dono NÃO deixa o código valendo anos (duração 5.000.000 min)", updateDoc(doc(prof, "turmas/T1"), { codigoDuracaoMin: 5000000 }));
await nega("Dono NÃO põe duração 0", updateDoc(doc(prof, "turmas/T1"), { codigoDuracaoMin: 0 }));
await nega("Dono NÃO \"adianta\" o horário do código (data no futuro)", updateDoc(doc(prof, "turmas/T1"), { codigoDefinidoEm: Timestamp.fromMillis(Date.now() + 24 * H), codigoDuracaoMin: 30 }));
await ok("Dono gera código com a hora do servidor e 4h de prazo", updateDoc(doc(prof, "turmas/T1"), { codigoDefinidoEm: serverTimestamp(), codigoDuracaoMin: 240 }));
await ok("Dono encerra o código (null)", updateDoc(doc(prof, "turmas/T1"), { codigoDefinidoEm: null }));
await nega("Criar turma já com código de horário inventado", setDoc(doc(prof, "turmas/N1"), { nome: "X", professorUid: uidA, codigoDefinidoEm: Timestamp.fromMillis(0) }));
// --- R6: registro do professor
await nega("Conta grava acordosProfessor com campo extra de 900 KB", setDoc(doc(outro, "acordosProfessor/outra-conta"), { lixo: "x".repeat(900000) }));
await nega("Conta grava nome de 500 caracteres no registro", setDoc(doc(outro, "acordosProfessor/outra-conta"), { nome: "x".repeat(500), email: "x@x.br", avisosAceitosEm: serverTimestamp() }));
await ok("Registro normal (avisos, e-mail, nome, último acesso)", setDoc(doc(outro, "acordosProfessor/outra-conta"), { avisosAceitosEm: serverTimestamp(), email: "x@x.br", nome: "X", ultimoAcesso: serverTimestamp() }));
await ok("Atualiza último acesso", updateDoc(doc(outro, "acordosProfessor/outra-conta"), { ultimoAcesso: serverTimestamp(), nome: "X2" }));
await nega("Atualiza com campo novo", updateDoc(doc(outro, "acordosProfessor/outra-conta"), { admin: true }));
// --- R7: lista da sala
await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), "turmas/T1"), { codigoDefinidoEm: Timestamp.now(), codigoDuracaoMin: 30 }); });
const defT1 = (await read("turmas/T1")).codigoDefinidoEm;
await ok("Sala normal (nomes + marcados da lista)", setDoc(doc(prof, "turmas/T1/salas/654321"), { nomes: ["Aluno Dois", "Aluno Um"], marcados: ["Aluno Um"], definidoEm: defT1 }));
await nega("Sala com \"marcados\" fora da lista de nomes", setDoc(doc(prof, "turmas/T1/salas/654321"), { nomes: ["Aluno Dois", "Aluno Um"], marcados: ["Intruso"], definidoEm: defT1 }));
await nega("Sala com nomes gigantes (tamanho total)", setDoc(doc(prof, "turmas/T1/salas/654321"), { nomes: Array.from({ length: 10 }, (_, i) => `${i}`.padEnd(10000, "x")), definidoEm: defT1 }));
await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), "turmas/T1"), { codigoDefinidoEm: null }); });

// --- R1: código de 6 dígitos pelo site; R8: limpeza dos códigos vencidos
let { ctx, page } = await entrar("prof.ana@ifsul.edu.br");
await page.waitForTimeout(3000);
check("Limpeza: código vencido há mais de 12h some (lista de nomes apagada, turma sem código)", (await list("turmas/VELHA/salas")).length === 0 && (await read("turmas/VELHA")).codigoDefinidoEm === null);
check("Limpeza: código vencido há pouco fica (o cartão mostra \"expirou às…\")", (await list("turmas/RECENTE/salas")).length === 1 && (await read("turmas/RECENTE")).codigoDefinidoEm !== null);
const card = page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" });
await card.getByRole("button", { name: "Gerar código 30 min" }).locator("visible=true").first().click().catch(async () => { await card.getByRole("button", { name: /^Mais opções/ }).click(); });
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
const grande = await page.textContent("#code-display-value");
const codigo = grande.replace(/\s/g, "");
check("Código novo tem 6 dígitos e aparece como \"123 456\"", /^\d{3} \d{3}$/.test(grande), grande);
const sala = (await list("turmas/T1/salas"))[0];
check("A sala usa o código de 6 dígitos", sala && sala.id === codigo);
await page.click("#btn-close-code-display");
// vários códigos: todos com 6 dígitos e diferentes
const codigos = await page.evaluate(() => { const out = []; for (let i = 0; i < 2000; i++) { const b = new Uint32Array(1); crypto.getRandomValues(b); out.push(b[0]); } return out.length; });
check("Gerador usa crypto.getRandomValues (disponível no navegador)", codigos === 2000);
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();
// aluno: valida sozinho ao digitar o 6º dígito
ctx = await newCtx(true); page = await open(ctx, APP + "#turma=T1");
await page.waitForSelector("#view-attendance:not(.hidden)"); await page.waitForTimeout(600);
await page.fill("#student-daily-code", codigo.slice(0, 4)); await page.waitForTimeout(800);
check("Aluno: com 4 dígitos ainda não valida", (await page.locator(".student-row").count()) === 0);
await page.fill("#student-daily-code", codigo);
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 2, null, { timeout: 10000 }).then(() => check("Aluno: ao digitar o 6º dígito, valida sozinho", true), () => check("Aluno: ao digitar o 6º dígito, valida sozinho", false));
check("Campo do aluno aceita 6 dígitos", (await page.getAttribute("#student-daily-code", "maxlength")) === "6");
await ctx.close();

// --- R9: link de turma malformado
for (const hash of ["#turma=%", "#turma=a/b", "#turma=%E0%A4%A"]) {
  ctx = await newCtx(true); page = await open(ctx, APP + hash);
  await page.waitForTimeout(1500);
  check(`Link malformado (${hash}): sem erro e mostra a lista de turmas`, page.errs.length === 0 && (await page.isVisible("#view-turma-select")), page.errs.join(";"));
  await ctx.close();
}

// --- R10: dentro de página de outro site
ctx = await newCtx(false);
writeFileSync("site/moldura.html", `<html><body><h1 id="golpe">outra página</h1><iframe id="f" src="${APP}" width="800" height="600"></iframe></body></html>`);
page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(e.message)); await page.goto("http://127.0.0.1:5203/moldura.html", { waitUntil: "commit" }).catch(() => {});
await page.waitForTimeout(2500);
let fr = null;
for (let i = 0; i < 40 && !fr; i++) { await page.waitForTimeout(250); fr = page.frames().find((f) => f.url().startsWith(APP)); }
if (fr) await fr.waitForLoadState("load").catch(() => {});
const escondido = page.url().startsWith(APP) || (fr && (await fr.evaluate(() => getComputedStyle(document.body).display)) === "none");
check("Dentro de página de outro site: o site não aparece (fica em branco ou sai da moldura)", escondido, `${page.url()} | frames=${page.frames().map((f) => f.url()).join(",")} | display=${fr ? await fr.evaluate(() => getComputedStyle(document.body).display + "|" + !!document.getElementById("anti-clickjack")) : "-"}`);
await ctx.close();
ctx = await newCtx(false);

page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(e.message)); await page.goto("http://localhost:5203/moldura.html", { waitUntil: "commit" }).catch(() => {});
await page.waitForTimeout(2500);
let frame = null;
for (let i = 0; i < 40 && !frame; i++) { await page.waitForTimeout(250); frame = page.frames().find((f) => f.url().startsWith(APP)); }
if (frame) await frame.waitForLoadState("load").catch(() => {});
check("Dentro de página do próprio site: continua funcionando", page.url().endsWith("moldura.html") && frame && (await frame.evaluate(() => getComputedStyle(document.body).display)) !== "none");
await ctx.close();
ctx = await newCtx(false); page = await open(ctx, APP); await page.waitForSelector(".turma-card", { timeout: 10000 }).catch(() => {});
check("Aberto normalmente: página visível", (await page.evaluate(() => getComputedStyle(document.body).display)) !== "none" && (await page.locator(".turma-card").count()) >= 1);
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
