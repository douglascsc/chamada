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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5208);
const APP = "http://localhost:5208/";
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
  const ctx = await browser.newContext({ ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } }), locale: "pt-BR", acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"] });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (q) => q.fulfill({ body: readFileSync(`node_modules/firebase/${path.basename(new URL(q.request().url()).pathname)}`), contentType: "text/javascript" }));
  await ctx.route("https://cdn.tailwindcss.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
async function open(ctx, url) { const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => { p.ultimoDialog = d.message(); return p.responder ? p.responder(d) : d.accept(); }); await p.goto(url); return p; }
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

// ===== Lote 23: os últimos 7 dias do aluno =====
const nomes = ["Ana", "Bruno", "Carla"];
const D = 86400000;
const dia = (n) => new Date(now - n * D).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const [d0, d1, d2] = [dia(0), dia(1), dia(2)];
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "professoresAutorizados", uidA), { email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: null });
  const b = writeBatch(f); nomes.forEach((n, k) => b.set(doc(f, `turmas/T1/alunos/s${k}`), { nome: n })); await b.commit();
  const p = (nome, data, horario, extra = {}) => ({ nome, data, horario, maquina: "professor", expiraEm: Timestamp.fromMillis(Date.now() + 5 * D), ...extra });
  // hoje: Bruno presente 08:00 e saiu às 10:15; Ana 08:00
  await setDoc(doc(f, "turmas/T1/presencas/h1"), p("Ana", d0, "08:00"));
  await setDoc(doc(f, "turmas/T1/presencas/h2"), p("Bruno", d0, "08:00", { saidaEm: Timestamp.fromMillis(Date.parse(`${d0}T10:15:00-03:00`)) }));
  // ontem: Bruno atrasado (08:40), Ana 08:00
  await setDoc(doc(f, "turmas/T1/presencas/o1"), p("Ana", d1, "08:00"));
  await setDoc(doc(f, "turmas/T1/presencas/o2"), p("Bruno", d1, "08:40"));
  // anteontem: Bruno faltou
  await setDoc(doc(f, "turmas/T1/presencas/a1"), p("Ana", d2, "08:00"));
});
const esperado = [`${d0.slice(8, 10)}/${d0.slice(5, 7)}`, `${d1.slice(8, 10)}/${d1.slice(5, 7)}`, `${d2.slice(8, 10)}/${d2.slice(5, 7)}`];

const { ctx, page } = await entrar("prof.ana@ifsul.edu.br");
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 3, null, { timeout: 10000 });
await page.waitForTimeout(800);
const nomeBruno = page.locator(".student-row", { hasText: "Bruno" }).locator(".student-name");
check("Chamada: nome do aluno é tocável pelo professor (botão acessível)", (await nomeBruno.getAttribute("role")) === "button" && (await nomeBruno.getAttribute("aria-label")) === "Ver os últimos 7 dias de Bruno");
await page.locator(".student-row", { hasText: "Bruno" }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${OUT}/l23-00-linhas.png` });
const larguras = await page.$$eval(".student-name", (ps) => ps.map((p) => [p.textContent, Math.round(p.getBoundingClientRect().width), Math.round(p.getBoundingClientRect().height)]));
check("Celular/professor: nome inteiro nas linhas de presentes (com \"Saiu antes\" e \"Desfazer\")", larguras.every(([t, w, h]) => w >= 30 && h <= 30), JSON.stringify(larguras));
await nomeBruno.click();
await page.waitForSelector("#aluno-semana-backdrop:not(.hidden)", { timeout: 5000 });
await page.waitForFunction(() => document.querySelectorAll("#aluno-semana-lista > div").length === 3, null, { timeout: 8000 })
  .then(() => check("Semana do aluno: 3 dias com chamada", true), () => check("Semana do aluno: 3 dias com chamada", false));
const linhas = await page.$$eval("#aluno-semana-lista > div", (ds) => ds.map((d) => d.innerText.replace(/\s+/g, " ").trim()));
check("Semana: hoje \"Presente · 08:00 · saiu às 10:15\"", linhas[0].includes(esperado[0]) && linhas[0].endsWith("Presente · 08:00 · saiu às 10:15"), linhas[0]);
check("Semana: ontem \"Presente · 08:40 · atrasado\"", linhas[1].includes(esperado[1]) && linhas[1].endsWith("Presente · 08:40 · atrasado"), linhas[1]);
check("Semana: anteontem \"Ausente\"", linhas[2].includes(esperado[2]) && linhas[2].endsWith("Ausente"), linhas[2]);
check("Semana: dia da semana abreviado (ex.: \"sex, 26/09\")", /^[a-zçá]{3}, \d{2}\/\d{2}/.test(linhas[0]), linhas[0]);
check("Semana: resumo \"2 presenças em 3 dias · 1 falta · 1 atraso · 1 saída antecipada\"", (await page.textContent("#aluno-semana-resumo")) === "2 presenças em 3 dias · 1 falta · 1 atraso · 1 saída antecipada", await page.textContent("#aluno-semana-resumo"));
check("Semana: título com o nome e a turma", (await page.textContent("#aluno-semana-nome")) === "Bruno" && /^INF2M 2026 - Banco de Dados · últimos 7 dias$/.test(await page.textContent("#aluno-semana-turma")));
await page.screenshot({ path: `${OUT}/l23-01-semana-do-aluno-celular.png` });
await page.keyboard.press("Escape"); await page.waitForTimeout(200);
check("Semana: fecha com Esc", await page.isHidden("#aluno-semana-backdrop"));
// teclado: Enter no nome abre
await nomeBruno.focus(); await page.keyboard.press("Enter");
await page.waitForSelector("#aluno-semana-backdrop:not(.hidden)", { timeout: 5000 }).then(() => check("Semana: abre com Enter no nome (teclado)", true), () => check("Semana: abre com Enter no nome", false));
await page.click("#btn-close-aluno-semana"); await page.waitForTimeout(200);
check("Semana: botão \"Fechar\"", await page.isHidden("#aluno-semana-backdrop"));
check("Marcar/desfazer continuam funcionando (Ana presente, Carla com \"Marcar\")", await page.locator(".student-row", { hasText: "Carla" }).locator(".mark-button").isVisible());
check("Nenhum erro de JavaScript (Chamada)", page.errs.length === 0, page.errs.join(";"));

// --- Histórico: tocar no nome
await page.click("#btn-trocar-turma"); await page.waitForTimeout(600);
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: /Gerenciar|Mais opções/ }).first().click();
if (!(await page.isVisible("#teacher-manage-panel"))) await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Gerenciar", exact: true }).locator("visible=true").first().click();
await page.waitForSelector("#history-day-panel:not(.hidden)", { timeout: 10000 }); await page.waitForTimeout(800);
await page.locator("#history-day-list > div", { hasText: "Carla" }).getByRole("button", { name: "Ver os últimos 7 dias de Carla" }).click();
await page.waitForFunction(() => /0 presenças em 3 dias · 3 faltas/.test(document.getElementById("aluno-semana-resumo").textContent), null, { timeout: 8000 })
  .then(() => check("Histórico: tocar no nome mostra a semana (Carla: 3 faltas)", true), async () => check("Histórico: tocar no nome mostra a semana", false, await page.textContent("#aluno-semana-resumo")));
await page.click("#btn-close-aluno-semana");
check("Nenhum erro de JavaScript (histórico)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// --- Aluno: nome não é tocável
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); const def = Timestamp.now();
  await updateDoc(doc(f, "turmas/T1"), { codigoDefinidoEm: def, codigoDuracaoMin: 30 });
  await setDoc(doc(f, "turmas/T1/salas/445566"), { nomes, marcados: [], definidoEm: def });
});
const ctxA = await newCtx(true); const aluno = await open(ctxA, APP + "#turma=T1");
await aluno.waitForSelector("#view-attendance:not(.hidden)"); await aluno.waitForTimeout(500);
await aluno.fill("#student-daily-code", "445566");
await aluno.waitForFunction(() => document.querySelectorAll(".student-row").length === 3, null, { timeout: 10000 });
await aluno.waitForTimeout(400);
const nomeAluno = aluno.locator(".student-row", { hasText: "Carla" }).locator(".student-name");
await nomeAluno.click(); await aluno.waitForTimeout(400);
check("Aluno: nome não abre a semana (nem tem papel de botão)", (await aluno.isHidden("#aluno-semana-backdrop")) && (await nomeAluno.getAttribute("role")) === null);
await ctxA.close();

await browser.close(); await env.cleanup(); server.close();
const falhas = results.filter((x) => !x).length;
console.log(`\n${results.length - falhas} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
