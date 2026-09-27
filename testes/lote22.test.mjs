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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5207);
const APP = "http://localhost:5207/";
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

// ===== Lote 22: filtro da Chamada, saída no histórico, resumo do Excel, aviso do aluno =====
const nomes = ["Ana", "Bruno", "Carla", "Davi", "Eva"];
const D = 86400000;
const hm = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "professoresAutorizados", uidA), { email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: null });
  // código desta aula expirado há 10 min / sem código
  await setDoc(doc(f, "turmas/T2"), { nome: "INF3M 2026 - Redes", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: Timestamp.fromMillis(now - 40 * 60000), codigoDuracaoMin: 30 });
  await setDoc(doc(f, "turmas/T3"), { nome: "INF4M 2026 - Web", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: null });
  const b = writeBatch(f); nomes.forEach((n, k) => b.set(doc(f, `turmas/T1/alunos/s${k}`), { nome: n })); await b.commit();
  const p = (nome, extra = {}) => ({ nome, data: hoje, horario: "08:00", maquina: "professor", expiraEm: Timestamp.fromMillis(Date.now() + D), ...extra });
  await setDoc(doc(f, "turmas/T1/presencas/a1"), p("Ana"));
  await setDoc(doc(f, "turmas/T1/presencas/b1"), p("Bruno", { horario: "08:40" }));
  await setDoc(doc(f, "turmas/T1/presencas/c1"), p("Carla", { horario: "08:05", saidaEm: Timestamp.fromMillis(Date.parse(`${hoje}T09:30:00-03:00`)) }));
  await setDoc(doc(f, "turmas/T1/presencas/a0"), p("Ana", { data: ontem }));
  await setDoc(doc(f, "turmas/T1/presencas/b0"), p("Bruno", { data: ontem, horario: "08:10" }));
});

// --- Chamada: filtro
const { ctx, page } = await entrar("prof.ana@ifsul.edu.br");
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 5, null, { timeout: 10000 });
await page.waitForTimeout(800);
const chip = (f) => page.locator(`#chamada-filtro [data-filtro="${f}"]`);
const txt = async (f) => (await chip(f).textContent()).replace(/\s+/g, " ").trim();
const visiveis = () => page.$$eval(".student-row", (rs) => rs.filter((r) => r.offsetParent !== null).map((r) => r.dataset.studentName).sort());
check("Filtro: aparece para o professor, com as contagens", (await page.isVisible("#chamada-filtro")) && (await txt("todos")) === "Todos (5)" && (await txt("ausentes")) === "Ausentes (2)" && (await txt("ocorrencias")) === "Ocorrências (4)",
  [await txt("todos"), await txt("ausentes"), await txt("ocorrencias")].join(" | "));
const b1 = await chip("todos").boundingBox();
check("Filtro: botões com 44px de altura no celular", b1 && b1.height >= 43.5, JSON.stringify(b1));
await chip("ausentes").click(); await page.waitForTimeout(200);
check("Filtro \"Ausentes\": só Davi e Eva", JSON.stringify(await visiveis()) === JSON.stringify(["Davi", "Eva"]), JSON.stringify(await visiveis()));
check("Filtro: botão escolhido fica marcado (aria-pressed)", (await chip("ausentes").getAttribute("aria-pressed")) === "true" && (await chip("todos").getAttribute("aria-pressed")) === "false");
await page.screenshot({ path: `${OUT}/l22-01-filtro-ausentes-celular.png` });
await chip("ocorrencias").click(); await page.waitForTimeout(200);
check("Filtro \"Ocorrências\": ausentes, atrasado e saída antecipada", JSON.stringify(await visiveis()) === JSON.stringify(["Bruno", "Carla", "Davi", "Eva"]), JSON.stringify(await visiveis()));
await page.fill("#student-search", "Ana"); await page.waitForTimeout(200);
check("Filtro + busca: \"Ana\" não tem ocorrência → \"Nenhum aluno encontrado\"", (await visiveis()).length === 0 && (await page.isVisible("#no-results")) && (await page.textContent("#no-results-title")) === "Nenhum aluno encontrado");
await page.fill("#student-search", ""); await page.waitForTimeout(200);
// --- Excel do dia: resumo no topo
const ExcelJS = (await import("exceljs")).default;
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#btn-export-csv")]);
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
const lin = []; wb.worksheets[0].eachRow((r) => lin.push(r.values.slice(1)));
check("Excel do dia: resumo no topo", lin[0][0] === "Presentes: 3 de 5 · Ausentes: 2 · Atrasos: 1 · Saídas antecipadas: 1", JSON.stringify(lin[0]));
check("Excel do dia: tabela continua completa depois do resumo", lin[1][0] === "Turma" && lin.length === 7, JSON.stringify(lin.map((l) => l[1])));
// marcar Davi com o filtro "Ausentes"
await chip("ausentes").click(); await page.waitForTimeout(200);
await page.locator(".student-row", { hasText: "Davi" }).locator(".mark-button").click();
await page.waitForFunction(() => /Ausentes\s*\(1\)/.test(document.querySelector('#chamada-filtro [data-filtro="ausentes"]').textContent), null, { timeout: 8000 })
  .then(() => check("Filtro \"Ausentes\": quem é marcado sai da lista e a contagem cai", true), () => check("Filtro \"Ausentes\": quem é marcado sai da lista", false));
check("Filtro \"Ausentes\": sobra só Eva", JSON.stringify(await visiveis()) === JSON.stringify(["Eva"]), JSON.stringify(await visiveis()));
check("Nenhum erro de JavaScript (Chamada)", page.errs.length === 0, page.errs.join(";"));

// --- Histórico: saída antecipada lançada depois
await page.click("#btn-trocar-turma"); await page.waitForTimeout(600);
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: /Gerenciar|Mais opções/ }).first().click();
if (!(await page.isVisible("#teacher-manage-panel"))) await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Gerenciar", exact: true }).locator("visible=true").first().click();
await page.waitForSelector("#history-day-panel:not(.hidden)", { timeout: 10000 }); await page.waitForTimeout(800);
await page.locator("#history-dates-list button", { hasText: `${ontem.slice(8, 10)}/${ontem.slice(5, 7)}/${ontem.slice(0, 4)}` }).click();
await page.waitForTimeout(500);
const hLinha = (n) => page.locator("#history-day-list > div", { hasText: n });
check("Histórico: botão de saída só em quem estava presente", (await hLinha("Ana").locator(".history-exit-button").count()) === 1 && (await hLinha("Eva").locator(".history-exit-button").count()) === 0);
// horário inválido / antes da chegada / no futuro
page.responder = (d) => d.accept("25:99");
await hLinha("Ana").locator(".history-exit-button").click(); await page.waitForTimeout(400);
check("Histórico: horário inválido é recusado", /Horário inválido/.test(await page.textContent("#toast-text")));
page.responder = (d) => d.accept("07:30");
await hLinha("Ana").locator(".history-exit-button").click(); await page.waitForTimeout(400);
check("Histórico: saída antes da chegada é recusada", /não pode ser antes da chegada \(08:00\)/.test(await page.textContent("#toast-text")), await page.textContent("#toast-text"));
check("Histórico: nada gravado com horário errado", (await list("turmas/T1/presencas")).every((r) => r.id !== "a0" || !r.saidaEm));
page.responder = (d) => d.accept("10:15");
await hLinha("Ana").locator(".history-exit-button").click();
await page.waitForFunction(() => /08:00 · saiu às 10:15/.test([...document.querySelectorAll("#history-day-list > div")].find((r) => /Ana/.test(r.textContent)).textContent), null, { timeout: 8000 })
  .then(() => check("Histórico: \"08:00 · saiu às 10:15\" no dia de ontem", true), () => check("Histórico: \"08:00 · saiu às 10:15\"", false));
check("Histórico: pergunta o horário com o nome e o dia", /^Horário em que Ana saiu em \d{2}\/\d{2}\/\d{4} \(ex\.: 10:15\):$/.test(page.ultimoDialog), page.ultimoDialog);
const a0 = (await list("turmas/T1/presencas")).find((r) => r.id === "a0");
check("Histórico: grava a hora certa (10:15 de ontem, Brasília)", a0.saidaEm && a0.saidaEm.toMillis() === Date.parse(`${ontem}T10:15:00-03:00`));
check("Histórico: título do dia com \"1 saída antecipada\"", /1 saída antecipada/.test(await page.textContent("#history-day-title")));
await page.screenshot({ path: `${OUT}/l22-02-historico-saida-celular.png` });
// desfazer (cancelar e confirmar)
page.responder = (d) => d.dismiss();
await hLinha("Ana").locator(".history-exit-button").click(); await page.waitForTimeout(400);
check("Histórico: \"Cancelar\" mantém a saída", /saiu às 10:15/.test(await hLinha("Ana").innerText()));
page.responder = null;
await hLinha("Ana").locator(".history-exit-button").click();
await page.waitForFunction(() => !/saiu às/.test([...document.querySelectorAll("#history-day-list > div")].find((r) => /Ana/.test(r.textContent)).textContent), null, { timeout: 8000 })
  .then(() => check("Histórico: desfazer a saída", true), () => check("Histórico: desfazer a saída", false));
check("Histórico: confirmação do desfazer com o nome, o dia e o horário", /^Desfazer a saída antecipada de Ana em \d{2}\/\d{2}\/\d{4} \(saiu às 10:15\)\?$/.test(page.ultimoDialog), page.ultimoDialog);
check("Histórico: saída apagada no banco", !(await list("turmas/T1/presencas")).find((r) => r.id === "a0").saidaEm);
check("Nenhum erro de JavaScript (histórico)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// --- Aluno: aviso claro quando não há código
const ctxA = await newCtx(true);
const aluno = await open(ctxA, APP + "#turma=T2");
await aluno.waitForSelector("#view-attendance:not(.hidden)"); await aluno.waitForTimeout(600);
check("Aluno: filtro do professor não aparece", await aluno.isHidden("#chamada-filtro"));
await aluno.fill("#student-daily-code", "123456");
const expirou = `O código desta aula expirou às ${hm(now - 10 * 60000)}.`;
await aluno.waitForFunction((t) => document.getElementById("global-message-text").textContent.startsWith(t), expirou, { timeout: 8000 })
  .then(() => check("Aluno: \"O código desta aula expirou às HH:MM\"", true), async () => check("Aluno: \"O código desta aula expirou às HH:MM\"", false, await aluno.textContent("#global-message-text")));
await aluno.goto(APP + "#turma=T3"); await aluno.reload();
await aluno.waitForSelector("#view-attendance:not(.hidden)"); await aluno.waitForTimeout(600);
await aluno.fill("#student-daily-code", "123456");
await aluno.waitForFunction(() => /^Não há código ativo nesta turma agora: o professor ainda não gerou o código desta aula ou já encerrou a chamada/.test(document.getElementById("global-message-text").textContent), null, { timeout: 8000 })
  .then(() => check("Aluno: sem código → \"Não há código ativo nesta turma agora\"", true), async () => check("Aluno: sem código", false, await aluno.textContent("#global-message-text")));
check("Nenhum erro de JavaScript (aluno)", aluno.errs.length === 0, aluno.errs.join(";"));
await ctxA.close();

await browser.close(); await env.cleanup(); server.close();
const falhas = results.filter((x) => !x).length;
console.log(`\n${results.length - falhas} passaram, ${falhas} falharam`);
process.exit(falhas ? 1 : 0);
