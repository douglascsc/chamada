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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5200);
const APP = "http://localhost:5200/";
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

// ===== Lote 15: integridade das bibliotecas (SRI) e liberar conta criada no Console =====
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidM), { avisosAceitosEm: Timestamp.now(), email: "douglascamargo@ifsul.edu.br", nome: "Douglas" });
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza" });
});

// --- Scripts externos: ícones embutidos (sem CDN) e Excel só quando exportar (lote19)
let ctx = await newCtx(true);
const pedidosCdn = [];
ctx.on("request", (q) => { if (/cdn\.jsdelivr\.net/.test(q.url())) pedidosCdn.push(q.url()); });
let page = await open(ctx, APP);
await page.waitForSelector(".turma-card"); await page.waitForTimeout(500);
check("Ícones embutidos: desenhados sem baixar o pacote de ícones", (await page.locator("svg.lucide").count()) > 0 && !pedidosCdn.some((u) => /lucide/.test(u)), pedidosCdn.join(","));
check("Excel NÃO é baixado ao abrir o site (aluno)", !pedidosCdn.some((u) => /exceljs/.test(u)) && (await page.evaluate(() => !window.ExcelJS)));
const tags = await page.$$eval("script[src]", (els) => els.map((e) => e.src));
check("Único script externo na abertura é o Tailwind", tags.length === 1 && /cdn\.tailwindcss\.com/.test(tags[0]), JSON.stringify(tags));
check("Nenhum erro de JavaScript (abertura)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// --- Conta criada no Console (simulada: criada direto no Authentication) e liberada pelo UID
const rC = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nova.console@ifsul.edu.br", password: PASS, returnSecureToken: true }) }).then((x) => x.json());
const uidC = rC.localId;
({ ctx, page } = await entrar("douglascamargo@ifsul.edu.br"));
await openAdmin(page);
check("Painel admin: seção \"Conta criada no Firebase Console\" com link para o Console", (await page.getAttribute("#link-console-add-user", "href")) === "https://console.firebase.google.com/project/demo-chamada/authentication/users");
await page.fill("#admin-liberar-uid", "abc"); await page.fill("#admin-liberar-nome", "Nova"); await page.fill("#admin-liberar-email", "nova.console@ifsul.edu.br");
await page.click("#btn-liberar-uid");
check("Liberar: UID inválido → pede o UID certo", /Cole o User UID/.test(await page.textContent("#liberar-uid-status")));
await page.fill("#admin-liberar-uid", uidC);
await page.fill("#admin-liberar-nome", "Nova Professora");
await page.click("#btn-liberar-uid");
await page.waitForFunction(() => /liberado\(a\) para criar turmas/.test(document.getElementById("liberar-uid-status").textContent), null, { timeout: 15000 })
  .then(() => check("Liberar pelo UID: confirma", true), () => check("Liberar pelo UID: confirma", false));
check("Liberar pelo UID: avisa o e-mail de senha enviado", /e-mail foi enviado para nova\.console@ifsul\.edu\.br/.test(await page.textContent("#liberar-uid-status")), await page.textContent("#liberar-uid-status"));
const lib = await read(`professoresAutorizados/${uidC}`);
check("Liberar pelo UID: liberação gravada", lib && lib.email === "nova.console@ifsul.edu.br" && lib.nome === "Nova Professora", JSON.stringify(lib));
await page.waitForFunction(() => [...document.querySelectorAll("#admin-professores-list > div")].some((r) => r.textContent.includes("nova.console@ifsul.edu.br") && /✓ Liberado/.test(r.textContent)), null, { timeout: 10000 })
  .then(() => check("Liberar pelo UID: aparece na lista como \"✓ Liberado\"", true), () => check("Liberar pelo UID: aparece na lista como \"✓ Liberado\"", false));
const oob = await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-chamada/oobCodes").then((x) => x.json());
check("E-mail de definir senha pedido ao Firebase", (oob.oobCodes || []).some((o) => o.email === "nova.console@ifsul.edu.br" && o.requestType === "PASSWORD_RESET"));
// cadastro público desligado: "Criar professor" explica o que fazer
await page.route("**/accounts:signUp**", (q) => q.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: { code: 400, message: "ADMIN_ONLY_OPERATION", errors: [{ message: "ADMIN_ONLY_OPERATION", domain: "global", reason: "invalid" }] } }) }));
await page.fill("#admin-new-professor-nome", "Outra Pessoa"); await page.fill("#admin-new-professor-email", "outra@ifsul.edu.br");
await page.click("#btn-create-professor");
await page.waitForFunction(() => /cadastro de contas pelo site está desligado/.test(document.getElementById("create-professor-status").textContent), null, { timeout: 10000 })
  .then(() => check("Cadastro desligado: \"Criar professor\" explica e leva para o Console", true), () => check("Cadastro desligado: \"Criar professor\" explica e leva para o Console", false));
check("Cadastro desligado: nome e e-mail já preenchidos no \"Liberar conta\"", (await page.inputValue("#admin-liberar-nome")) === "Outra Pessoa" && (await page.inputValue("#admin-liberar-email")) === "outra@ifsul.edu.br");
check("Nenhum erro de JavaScript (master)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();
// a professora liberada cria turma
const nova = env.authenticatedContext(uidC, { email: "nova.console@ifsul.edu.br" }).firestore();
await ok("Conta liberada pelo UID cria turma", setDoc(doc(nova, "turmas/DANOVA"), { nome: "INF9M 2027", professorUid: uidC, professorNome: "Nova Professora" }));

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
