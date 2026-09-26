import { migrarCodigos, codigoAtual } from "./codigo-helpers.mjs";
import { chromium } from "playwright-core";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, addDoc, deleteField, collection, writeBatch, Timestamp, query, where } from "firebase/firestore";
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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5198);
const APP = "http://localhost:5198/";
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
const alunosT = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira", "Daniel Souza Lima"];

// ===== Lote 13: código do dia secreto (não fica mais na turma pública) =====
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza" });
  const b = writeBatch(f); alunosT.forEach((n, k) => b.set(doc(f, `turmas/T1/alunos/s${k}`), { nome: n })); await b.commit();
  // turma antiga: código gravado na própria turma (formato de antes)
  await setDoc(doc(f, "turmas/ANTIGA"), { nome: "INF1M 2026 - Antiga", professorUid: uidA, professorNome: "Ana Souza", codigoDoDia: "1234", codigoDefinidoEm: Timestamp.now(), codigoDuracaoMin: 60 });
  await setDoc(doc(f, "turmas/ANTIGA/alunos/x"), { nome: "Zé Antigo" });
});
const anon = env.unauthenticatedContext().firestore();

// --- Professora gera o código pelo site
let ctx = await newCtx(true);
let page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(1500);
const antiga = await read("turmas/ANTIGA");
check("Turma antiga: código velho apagado da turma ao entrar", !("codigoDoDia" in antiga) && antiga.codigoDefinidoEm === null, JSON.stringify(antiga));
check("Turma antiga: cartão mostra \"Nenhum código ativo\"", /Nenhum código ativo/.test(await row(page, "INF1M 2026").textContent()));
await cardClick(row(page, "INF2M 2026"), "Gerar código 30 min");
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
const codigo = (await page.textContent("#code-display-value")).replace(/\s/g, "");
check("Gerar: janela mostra o código de 6 dígitos", /^\d{6}$/.test(codigo), codigo);
const t1 = await read("turmas/T1");
check("Gerar: o código NÃO fica na turma (pública)", !("codigoDoDia" in t1) && !JSON.stringify(t1).includes(codigo), JSON.stringify(t1));
const salas = await list("turmas/T1/salas");
check("Gerar: lista de nomes guardada com o código como ID", salas.length === 1 && salas[0].id === codigo && JSON.stringify(salas[0].nomes) === JSON.stringify([...alunosT].sort()), JSON.stringify(salas));
check("Gerar: sala e turma com o mesmo horário", salas[0].definidoEm.toMillis() === t1.codigoDefinidoEm.toMillis());
await page.click("#btn-close-code-display"); await page.waitForTimeout(800);
check("Cartão: mostra o número do código para a professora", (await row(page, "INF2M 2026").textContent()).includes(`Código ${codigo}`));

// --- Ataques (sem login), com o código ativo
await nega("Sem login: NÃO lê a coleção de alunos", getDocs(collection(anon, "turmas/T1/alunos")));
await nega("Sem login: NÃO lista as salas (descobrir o código)", getDocs(collection(anon, "turmas/T1/salas")));
const errado = codigo === "0000" ? "0001" : "0000";
await nega("Código errado: NÃO lê a lista de nomes", getDoc(doc(anon, `turmas/T1/salas/${errado}`)));
await nega("Sem filtro do código: NÃO lê as presenças", getDocs(query(collection(anon, "turmas/T1/presencas"), where("data", "==", hoje))));
await nega("Código errado: NÃO lê as presenças", getDocs(query(collection(anon, "turmas/T1/presencas"), where("data", "==", hoje), where("codigoUsado", "==", errado))));
const pres = (extra = {}) => ({ nome: alunosT[3], data: hoje, horario: "08:01", maquina: "atacante", codigoUsado: codigo, expiraEm: Timestamp.fromMillis(Date.now() + 86400000), ...extra });
await nega("Código errado: NÃO marca presença", setDoc(doc(anon, `turmas/T1/presencas/${hoje}_atacante`), pres({ codigoUsado: errado })));
await nega("Nome fora da lista da turma: NÃO marca", setDoc(doc(anon, `turmas/T1/presencas/${hoje}_atacante`), pres({ nome: "Fulano Inventado" })));
await nega("ID que não é data_aparelho: NÃO marca", setDoc(doc(anon, "turmas/T1/presencas/qualquer"), pres()));
await nega("Sem login: NÃO grava a lista de nomes", setDoc(doc(anon, `turmas/T1/salas/${codigo}`), { nomes: ["Hacker"], definidoEm: Timestamp.now() }));
await nega("Sem login: NÃO cria sala com outro código", setDoc(doc(anon, "turmas/T1/salas/9999"), { nomes: ["Hacker"], definidoEm: Timestamp.now() }));
await nega("Outro professor: NÃO lista as salas", getDocs(collection(env.authenticatedContext("profB").firestore(), "turmas/T1/salas")));

// --- Aluno pelo site
const ctxA = await newCtx(true);
const aluno = await open(ctxA, APP + "#turma=T1");
await aluno.waitForSelector("#view-attendance:not(.hidden)"); await aluno.waitForTimeout(800);
await aluno.fill("#student-daily-code", errado);
await aluno.waitForFunction(() => /incorreto/.test(document.getElementById("message-box")?.textContent || document.body.textContent), null, { timeout: 8000 });
check("Aluno: código errado → \"incorreto\" e lista escondida", (await aluno.locator(".student-row").count()) === 0);
await aluno.fill("#student-daily-code", codigo);
await aluno.waitForFunction(() => document.querySelectorAll(".student-row").length === 4, null, { timeout: 8000 });
check("Aluno: código certo → vê os 4 nomes", true);
await aluno.locator(".student-row", { hasText: alunosT[0] }).locator(".mark-button").click();
await aluno.waitForTimeout(300);
const confirmar = aluno.locator(".student-row", { hasText: alunosT[0] }).locator(".confirm-attendance");
if (await confirmar.isVisible()) await confirmar.click();
let presencas = [];
for (let i = 0; i < 30 && !presencas.length; i++) { await aluno.waitForTimeout(500); presencas = await list("turmas/T1/presencas"); }
const minha = presencas.find((p) => p.nome === alunosT[0]);
check("Aluno marca: presença salva com o código e ID data_aparelho", minha && minha.codigoUsado === codigo && minha.id === `${hoje}_${minha.maquina}`, JSON.stringify(minha));

// --- Professora inclui aluno com o código ativo → aparece para o aluno
await cardClick(row(page, "INF2M 2026"), "Gerenciar"); await abrirGerenciar(page);
check("Gerenciar: campo do código mostra o código atual", (await page.inputValue("#manage-code-input")) === codigo);
await page.fill("#manage-add-aluno-nome", "Eva Nova"); await page.click("#btn-add-aluno");
await aluno.waitForFunction(() => [...document.querySelectorAll(".student-row")].some((r) => r.dataset.studentName === "Eva Nova"), null, { timeout: 10000 }).then(() => check("Aluno incluído com código ativo aparece na hora para o aluno", true), () => check("Aluno incluído com código ativo aparece na hora para o aluno", false));
check("Lista de nomes atualizada no banco", (await list("turmas/T1/salas"))[0].nomes.includes("Eva Nova"));
await page.click("#btn-manage-back"); await page.waitForTimeout(600);

// --- Professora marca pela Chamada → o aluno vê como marcado
await row(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 5, null, { timeout: 8000 });
check("Barra da Chamada mostra o código", (await page.textContent("#teacher-code-bar-text")).includes(`Código ${codigo}`));
await page.locator(".student-row", { hasText: alunosT[1] }).locator(".mark-button").click();
await aluno.waitForFunction((n) => document.querySelector(`.student-row[data-student-name="${n}"] .present-status`) && !document.querySelector(`.student-row[data-student-name="${n}"] .present-status`).classList.contains("hidden"), alunosT[1], { timeout: 10000 })
  .then(() => check("Marcado pela professora (com código ativo) aparece marcado para o aluno", true), () => check("Marcado pela professora (com código ativo) aparece marcado para o aluno", false));
check("Presença da professora leva o código", (await list("turmas/T1/presencas")).find((p) => p.nome === alunosT[1])?.codigoUsado === codigo);

// --- Encerrar: código antigo para de valer
await page.click("#btn-bar-end-code");
await page.waitForFunction(() => /Nenhum código ativo/.test(document.getElementById("teacher-code-bar-text").textContent), null, { timeout: 8000 });
check("Encerrar: lista de nomes apagada", (await list("turmas/T1/salas")).length === 0);
await nega("Depois de encerrar: NÃO lê a lista com o código antigo", getDoc(doc(anon, `turmas/T1/salas/${codigo}`)));
await nega("Depois de encerrar: NÃO marca com o código antigo", setDoc(doc(anon, `turmas/T1/presencas/${hoje}_depois`), pres({ maquina: "depois" })));
// aluno que já tinha a tela aberta tenta marcar
const aluno2 = await open(ctxA, APP + "#turma=T1"); // (mesmo aparelho, outra aba: só para ver a mensagem)
await aluno2.waitForSelector("#view-attendance:not(.hidden)"); await aluno2.waitForTimeout(600);
await aluno2.fill("#student-daily-code", codigo);
await aluno2.waitForFunction(() => /expirou ou ainda não foi definido/.test(document.body.textContent), null, { timeout: 8000 })
  .then(() => check("Aluno com código encerrado: aviso de código expirado", true), () => check("Aluno com código encerrado: aviso de código expirado", false));

// --- Gerar de novo: o código anterior não vale mais (mesmo se sobrar a sala)
await page.click("#btn-bar-new-code");
await page.waitForFunction(() => /Código \d{6}/.test(document.getElementById("teacher-code-bar-text").textContent), null, { timeout: 8000 });
const novo = (await page.textContent("#teacher-code-bar-text")).match(/Código (\d{6})/)[1];
await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), "turmas/T1/salas/4444"), { nomes: alunosT, definidoEm: Timestamp.fromMillis(Date.now() - 3600000) }); });
if (novo !== "4444") await nega("Sala velha (de outro horário) NÃO vale", getDoc(doc(anon, "turmas/T1/salas/4444")));
await ok("Código novo vale", getDoc(doc(anon, `turmas/T1/salas/${novo}`)));
// código vencido
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); const velho = Timestamp.fromMillis(Date.now() - 31 * 60000); await updateDoc(doc(f, "turmas/T1"), { codigoDefinidoEm: velho, codigoDuracaoMin: 30 }); await setDoc(doc(f, `turmas/T1/salas/${novo}`), { nomes: alunosT, definidoEm: velho }); });
await nega("Código vencido (31 min de 30): NÃO lê a lista", getDoc(doc(anon, `turmas/T1/salas/${novo}`)));
await nega("Código vencido: NÃO marca", setDoc(doc(anon, `turmas/T1/presencas/${hoje}_vencido`), pres({ maquina: "vencido", codigoUsado: novo })));
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
check("Nenhum erro de JavaScript (aluno)", aluno.errs.length === 0 && aluno2.errs.length === 0, [...aluno.errs, ...aluno2.errs].join(";"));
await aluno.screenshot({ path: `${OUT}/l13-01-aluno.png` });
await ctxA.close(); await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
