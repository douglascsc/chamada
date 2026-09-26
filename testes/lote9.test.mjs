import { migrarCodigos, codigoAtual } from "./codigo-helpers.mjs";
import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, writeBatch, Timestamp } from "firebase/firestore";
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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5193);
const APP = "http://localhost:5193/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "prof.ana@ifsul.edu.br", password: PASS, returnSecureToken: true }) }).then((r) => r.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName: "Ana Souza" }) });
const uidA = r.localId;
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
const now = Date.now();
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
const LONGO1 = "Maria Eduarda Albuquerque Figueiredo dos Santos";
const LONGO2 = "Maria Eduarda Albuquerque Figueiredo Lima";
const alunosT0 = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira", LONGO1, LONGO2];
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  await setDoc(doc(db, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  const nomesT = ["INF2M 2026 - Banco de Dados", "INF3M 2026 - Web", "INF1M 2026 - Algoritmos"];
  for (let i = 0; i < 3; i++) {
    await setDoc(doc(db, `turmas/t${i}`), { nome: nomesT[i], professorUid: uidA, professorNome: "Ana Souza", ...(i === 0 ? { codigoDoDia: "482193", codigoDefinidoEm: Timestamp.fromMillis(now - 5 * 60000), codigoDuracaoMin: 60 } : {}), ...(i === 2 ? { arquivada: true } : {}) });
    const b = writeBatch(db); (i === 0 ? alunosT0 : ["Diego Alves", "Elisa Moura"]).forEach((n, k) => b.set(doc(db, `turmas/t${i}/alunos/s${k}`), { nome: n })); await b.commit();
  }
  const b2 = writeBatch(db); ["Ana Beatriz Rocha", "Bruno Henrique Alves"].forEach((n, k) => b2.set(doc(db, `turmas/t0/presencas/p${k}`), { nome: n, data: hoje, horario: "08:0" + k, maquina: "m" + k, expiraEm: Timestamp.fromMillis(now + 86400000) })); await b2.commit();
});
await migrarCodigos(env);
const presentesHoje = async (t) => (await list(`turmas/${t}/presencas`)).filter((p) => p.data === hoje);
async function login(page, remember = false) {
  await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
  await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS);
  if (remember) await page.check("#teacher-gate-remember");
  await page.click("#teacher-gate-submit");
  await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);
}
const card = (p, n) => p.locator("#teacher-turmas-list > div", { hasText: n });
const beforeUnloadBloqueia = (p) => p.evaluate(() => { const e = new Event("beforeunload", { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });

// ===== 1. Nomes longos em até 2 linhas (aluno, celular) =====
let ctx = await newCtx(true);
let page = await open(ctx, APP + "#turma=t0");
await page.waitForSelector("#view-attendance:not(.hidden)");
await page.fill("#student-daily-code", "482193");
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 5); await page.waitForTimeout(500);
const nomesInfo = await page.$$eval(".student-row:not(.is-collapsed) .student-name", (els) => els.map((e) => ({ t: e.textContent, cabe: e.scrollHeight <= e.clientHeight + 1, linhas: Math.round(e.clientHeight / parseFloat(getComputedStyle(e).lineHeight)), largura: e.clientWidth })));
const l1 = nomesInfo.find((n) => n.t === LONGO1), l2 = nomesInfo.find((n) => n.t === LONGO2);
check("Nome longo aparece inteiro (quebra linha, sem \"…\")", l1 && l1.cabe && l1.linhas >= 2 && l2.cabe, JSON.stringify([l1, l2]));
check("Nome curto continua em 1 linha", nomesInfo.find((n) => n.t === "Camila Ferreira").linhas === 1);
await page.locator(".student-row", { hasText: LONGO1 }).screenshot({ path: `${OUT}/l9-01-nome-longo-celular.png` });
check("Aluno: sem \"Ir para\" nem \"Marcar todos\"", (await page.isHidden("#chamada-switch-wrap")) && (await page.isHidden("#btn-bar-all-present")));
await ctx.close();

// ===== 2 e 3. Professor: Marcar todos presentes e Ir para =====
ctx = await newCtx(true);
page = await open(ctx, APP + "#professor");
await login(page);
await card(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 5); await page.waitForTimeout(500);
check("Marcar todos: botão com quantos faltam", (await page.isVisible("#btn-bar-all-present")) && (await page.innerText("#btn-bar-all-present")).trim() === "Marcar todos presentes (3)");
await page.click("#btn-bar-all-present");
check("Marcar todos: 1º toque só pede confirmação", /Toque de novo para marcar 3 alunos/.test(await page.innerText("#btn-bar-all-present")) && (await presentesHoje("t0")).length === 2);
await page.screenshot({ path: `${OUT}/l9-02-marcar-todos-confirmar-celular.png` });
await page.waitForTimeout(5500);
check("Marcar todos: a confirmação expira sozinha (5s)", (await page.innerText("#btn-bar-all-present")).trim() === "Marcar todos presentes (3)" && (await presentesHoje("t0")).length === 2);
await page.click("#btn-bar-all-present"); await page.click("#btn-bar-all-present");
await page.waitForFunction(() => document.getElementById("present-count").textContent === "5", null, { timeout: 8000 });
await page.waitForTimeout(800);
const todos = await presentesHoje("t0");
check("Marcar todos: 2º toque marca os 3 que faltavam (manual do professor)", todos.length === 5 && todos.filter((p) => p.maquina === "professor").length === 3);
check("Marcar todos: aviso com \"Desfazer\"", /3 alunos marcados como presentes/.test(await page.textContent("#toast-text")) && (await page.isVisible("#btn-toast-action")));
check("Marcar todos: botão some quando ninguém falta", await page.isHidden("#btn-bar-all-present"));
await page.click("#btn-toast-action");
await page.waitForFunction(() => document.getElementById("present-count").textContent === "2", null, { timeout: 8000 });
await page.waitForTimeout(600);
check("Desfazer: volta aos 2 que já tinham marcado (não mexe nos dos alunos)", (await presentesHoje("t0")).map((p) => p.nome).sort().join("|") === "Ana Beatriz Rocha|Bruno Henrique Alves");
// Ir para
check("\"Ir para\": aparece na Chamada do professor, só com turmas ativas", (await page.isVisible("#chamada-switch-turma")) && JSON.stringify(await page.$$eval("#chamada-switch-turma option", (o) => o.map((x) => x.textContent))) === JSON.stringify(["outra turma…", "INF3M 2026 - Web"]));
await page.screenshot({ path: `${OUT}/l9-03-ir-para-celular.png` });
await page.click("#btn-bar-all-present"); // deixa armado para ver se não passa para a outra turma
await page.selectOption("#chamada-switch-turma", "t1");
await page.waitForFunction(() => document.getElementById("attendance-turma-name").textContent === "INF3M 2026 - Web" && document.querySelectorAll(".student-row").length === 2, null, { timeout: 8000 });
await page.waitForTimeout(500);
check("\"Ir para\": abre a Chamada da outra turma, em modo professor", (await page.textContent("#teacher-mode-label")).includes("ativo") && (await page.isVisible("#teacher-code-bar")));
check("\"Ir para\": confirmação pela metade não passa para a outra turma", (await page.innerText("#btn-bar-all-present")).trim() === "Marcar todos presentes (2)");
check("\"Ir para\": agora oferece a turma anterior", JSON.stringify(await page.$$eval("#chamada-switch-turma option", (o) => o.map((x) => x.textContent))) === JSON.stringify(["outra turma…", "INF2M 2026 - Banco de Dados"]));
await page.click("#btn-trocar-turma"); await page.waitForTimeout(700);
check("\"Voltar às turmas\" volta ao painel", await page.isVisible("#teacher-turmas-list"));
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ===== 4. Marcações não enviadas (sem "Manter conectado") =====
ctx = await newCtx(true);
page = await open(ctx, APP + "#professor");
await login(page);
await card(page, "INF3M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 2); await page.waitForTimeout(500);
check("Com internet e nada pendente: fechar a página não pergunta nada", !(await beforeUnloadBloqueia(page)));
await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event("offline"))); await page.waitForTimeout(300);
await page.locator(".student-row", { hasText: "Diego Alves" }).locator(".mark-button").click();
await page.locator(".student-row", { hasText: "Elisa Moura" }).locator(".mark-button").click();
await page.waitForTimeout(400);
check("Sem internet: faixa conta as marcações não enviadas", /Sem internet\. 2 marcações ainda não foram enviadas — não feche a página/.test(await page.textContent("#offline-banner-text")), await page.textContent("#offline-banner-text"));
check("Sem internet: fechar a página pede confirmação", await beforeUnloadBloqueia(page));
await page.screenshot({ path: `${OUT}/l9-04-pendentes-celular.png` });
await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
let ok = false; for (let i = 0; i < 30 && !ok; i++) { await page.waitForTimeout(500); ok = (await presentesHoje("t1")).length === 2; }
await page.waitForTimeout(800);
check("Internet voltou: as 2 foram enviadas", ok);
check("Depois de enviar: fechar não pergunta mais e a faixa some", !(await beforeUnloadBloqueia(page)) && (await page.isHidden("#offline-banner")));
check("Nenhum erro de JavaScript (sem internet)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ===== 4b. Com "Manter conectado": guardadas no aparelho, sem perguntar =====
await env.withSecurityRulesDisabled(async (c) => { const { deleteDoc } = await import("firebase/firestore"); const f = c.firestore(); for (const p of (await getDocs(collection(f, "turmas/t1/presencas"))).docs) await deleteDoc(p.ref); });
ctx = await newCtx(true);
page = await open(ctx, APP + "#professor");
await login(page, true);
await page.close();
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-turmas-list > div", { timeout: 15000 }); await page.waitForTimeout(800);
await card(page, "INF3M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 2); await page.waitForTimeout(500);
await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event("offline"))); await page.waitForTimeout(300);
await page.click("#btn-bar-all-present"); await page.click("#btn-bar-all-present");
await page.waitForTimeout(500);
check("Manter conectado: \"Marcar todos\" sem internet conta 2 marcações guardadas no aparelho", /2 marcações guardadas neste aparelho/.test(await page.textContent("#offline-banner-text")), await page.textContent("#offline-banner-text"));
check("Manter conectado: fechar a página não precisa perguntar", !(await beforeUnloadBloqueia(page)));
await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online")));
ok = false; for (let i = 0; i < 30 && !ok; i++) { await page.waitForTimeout(500); ok = (await presentesHoje("t1")).length === 2; }
check("Manter conectado: ao voltar a internet, as 2 são enviadas", ok);
await ctx.close();

// ===== Computador: Marcar todos e Ir para também aparecem =====
ctx = await newCtx(false);
page = await open(ctx, APP + "#professor");
await login(page);
await card(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 5); await page.waitForTimeout(500);
check("Computador: \"Marcar todos presentes\" e \"Ir para\" visíveis", (await page.isVisible("#btn-bar-all-present")) && (await page.isVisible("#chamada-switch-turma")));
await page.screenshot({ path: `${OUT}/l9-05-chamada-computador.png` });
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
