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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5206);
const APP = "http://localhost:5206/";
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

// ===== Lote 21: saída antecipada =====
const nomesT = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira"];
const D = 86400000;
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "professoresAutorizados", uidA), { email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: null });
  await setDoc(doc(f, "turmas/OUTRA"), { nome: "Outra", professorUid: "profB", professorNome: "B" });
  const b = writeBatch(f); nomesT.forEach((n, k) => b.set(doc(f, `turmas/T1/alunos/s${k}`), { nome: n })); await b.commit();
  const p = (nome, extra = {}) => ({ nome, data: hoje, horario: "08:00", maquina: "professor", expiraEm: Timestamp.fromMillis(Date.now() + D), ...extra });
  await setDoc(doc(f, "turmas/T1/presencas/a1"), p(nomesT[0]));
  // Bruno com registro repetido (professor e celular)
  await setDoc(doc(f, "turmas/T1/presencas/b1"), p(nomesT[1], { horario: "08:02" }));
  await setDoc(doc(f, `turmas/T1/presencas/${hoje}_celB`), p(nomesT[1], { horario: "08:03", maquina: "celB", aparelho: "celular" }));
  await setDoc(doc(f, "turmas/OUTRA/presencas/o1"), p("X"));
});
// --- regras
const anon = env.unauthenticatedContext().firestore();
const prof = env.authenticatedContext(uidA, { email: "prof.ana@ifsul.edu.br" }).firestore();
const profB = env.authenticatedContext("profB2", { email: "b2@x" }).firestore();
await nega("Aluno (sem login) NÃO registra saída", updateDoc(doc(anon, "turmas/T1/presencas/a1"), { saidaEm: Timestamp.now() }));
await nega("Outro professor NÃO registra saída na turma", updateDoc(doc(profB, "turmas/T1/presencas/a1"), { saidaEm: Timestamp.now() }));
await nega("Professor NÃO muda o nome junto com a saída", updateDoc(doc(prof, "turmas/T1/presencas/a1"), { saidaEm: Timestamp.now(), nome: "Outro" }));
await nega("Professor NÃO muda o horário da presença", updateDoc(doc(prof, "turmas/T1/presencas/a1"), { horario: "07:00" }));
await nega("Saída com hora no futuro (+1h) é recusada", updateDoc(doc(prof, "turmas/T1/presencas/a1"), { saidaEm: Timestamp.fromMillis(Date.now() + 3600000) }));
await nega("Saída que não é data/hora é recusada", updateDoc(doc(prof, "turmas/T1/presencas/a1"), { saidaEm: "09:40" }));
await ok("Professor registra a saída", updateDoc(doc(prof, "turmas/T1/presencas/a1"), { saidaEm: Timestamp.now() }));
await ok("Professor desfaz a saída", updateDoc(doc(prof, "turmas/T1/presencas/a1"), { saidaEm: deleteField() }));
await nega("Aluno NÃO sobrescreve presença existente (trava do aparelho continua)", setDoc(doc(anon, `turmas/T1/presencas/${hoje}_celB`), { nome: nomesT[1], data: hoje, horario: "", maquina: "celB", expiraEm: Timestamp.fromMillis(Date.now() + D) }));

// --- Chamada
const { ctx, page } = await entrar("prof.ana@ifsul.edu.br");
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 3, null, { timeout: 10000 });
await page.waitForTimeout(800);
const linha = (n) => page.locator(".student-row", { hasText: n });
check("Chamada: botão \"Saiu antes\" nos presentes", await linha(nomesT[0]).locator(".exit-button").isVisible() && (await linha(nomesT[0]).locator(".exit-label").textContent()) === "Saiu antes");
check("Chamada: sem \"Saiu antes\" em quem não marcou", await linha(nomesT[2]).locator(".exit-button").isHidden());
await linha(nomesT[1]).locator(".exit-button").click();
await page.waitForFunction((n) => /saiu às \d{2}:\d{2}/.test([...document.querySelectorAll(".student-row")].find((r) => r.dataset.studentName === n).querySelector(".present-status-label").textContent), nomesT[1], { timeout: 8000 })
  .then(() => check("Saiu antes: \"Presente · 08:02 · saiu às HH:MM\" (horário mais cedo)", true), () => check("Saiu antes: \"Presente · 08:02 · saiu às HH:MM\"", false));
const rot = await linha(nomesT[1]).locator(".present-status-label").textContent();
check("Rótulo em laranja e com o horário de chegada certo", /^Presente · 08:02 · saiu às \d{2}:\d{2}$/.test(rot) && (await linha(nomesT[1]).locator(".present-status-label").getAttribute("class")).includes("is-late"), rot);
check("Botão vira \"Desfazer saída\"", (await linha(nomesT[1]).locator(".exit-label").textContent()) === "Desfazer saída");
check("Resumo: \"· 1 saída antecipada\"", /1 saída antecipada/.test(await page.textContent("#late-count")), await page.textContent("#late-count"));
await page.waitForTimeout(800);
const regsB = (await list("turmas/T1/presencas")).filter((r) => r.nome === nomesT[1]);
check("Saída gravada nos 2 registros do aluno (repetido)", regsB.length === 2 && regsB.every((r) => r.saidaEm), JSON.stringify(regsB.map((r) => !!r.saidaEm)));
check("Presentes continua contando o aluno que saiu (2/3)", (await page.textContent("#present-count")) === "2");
// Excel do dia
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#btn-export-csv")]);
const ExcelJS = (await import("exceljs")).default;
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
const ws = wb.worksheets[0];
const cab = ws.getRow(1).values.slice(1);
const linhaB = ws.getRows(2, ws.rowCount - 1).map((r) => r.values.slice(1)).find((v) => v[1] === nomesT[1]);
check("Excel do dia: coluna \"Saída antecipada\" com o horário", cab.includes("Saída antecipada") && /^\d{2}:\d{2}$/.test(linhaB[cab.indexOf("Saída antecipada")]), JSON.stringify({ cab, linhaB }));
// Copiar ocorrências (ordem alfabética, com a ocorrência)
check("Botão \"Copiar ocorrências (2)\"", (await page.textContent("#btn-bar-copy-absent")) === "Copiar ocorrências (2)", await page.textContent("#btn-bar-copy-absent"));
await page.click("#btn-bar-copy-absent"); await page.waitForTimeout(300);
const oc = (await page.evaluate(() => navigator.clipboard.readText())).split("\n");
check("Copiar ocorrências: \"Nome - Saída antecipada HH:MM\" e \"Nome - Ausente\" em ordem alfabética", oc.length === 3 && /^Ocorrências - INF2M 2026 - .+ - \d{2}\/\d{2}\/\d{4}$/.test(oc[0]) && new RegExp(`^${nomesT[1]} - Saída antecipada \\d{2}:\\d{2}$`).test(oc[1]) && oc[2] === `${nomesT[2]} - Ausente`, JSON.stringify(oc));
// desfazer
await linha(nomesT[1]).locator(".exit-button").click();
await page.waitForFunction((n) => !/saiu às/.test([...document.querySelectorAll(".student-row")].find((r) => r.dataset.studentName === n).querySelector(".present-status-label").textContent), nomesT[1], { timeout: 8000 })
  .then(() => check("Desfazer saída: volta a \"Presente\"", true), () => check("Desfazer saída: volta a \"Presente\"", false));
await page.waitForTimeout(800);
check("Desfazer saída: apaga dos 2 registros", (await list("turmas/T1/presencas")).filter((r) => r.nome === nomesT[1]).every((r) => !r.saidaEm));
// marca de novo para o histórico
await linha(nomesT[0]).locator(".exit-button").click(); await page.waitForTimeout(1200);
check("Nenhum erro de JavaScript (Chamada)", page.errs.length === 0, page.errs.join(";"));

// --- histórico e Excel da semana
await page.click("#btn-trocar-turma"); await page.waitForTimeout(600);
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: /Gerenciar|Mais opções/ }).first().click();
if (!(await page.isVisible("#teacher-manage-panel"))) await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Gerenciar", exact: true }).locator("visible=true").first().click();
await page.waitForSelector("#teacher-manage-panel:not(.hidden)"); await page.waitForTimeout(1500);
check("Histórico: título do dia com \"1 saída antecipada\"", /1 saída antecipada/.test(await page.textContent("#history-day-title")), await page.textContent("#history-day-title"));
check("Histórico: aluno com \"· saiu às HH:MM\"", /08:00 · saiu às \d{2}:\d{2}/.test(await page.textContent("#history-day-list")));
const [dl2] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#btn-export-week")]);
const wb2 = new ExcelJS.Workbook(); await wb2.xlsx.readFile(await dl2.path());
const ws2 = wb2.worksheets[0];
const valores = []; ws2.eachRow((r) => valores.push(r.values.slice(1)));
const cab2 = valores.find((v) => v[0] === "Aluno");
const linhaA = valores.find((v) => v[0] === nomesT[0]);
check("Excel da semana: \"08:00 (saiu às HH:MM)\" e total de saídas", cab2.includes("Saídas antecipadas") && linhaA.some((c) => /^08:00 \(saiu às \d{2}:\d{2}\)$/.test(String(c))) && linhaA[cab2.indexOf("Saídas antecipadas")] === 1, JSON.stringify({ cab2, linhaA }));
check("Nenhum erro de JavaScript (histórico)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// --- aluno não vê a saída
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore(); const def = Timestamp.now();
  await updateDoc(doc(f, "turmas/T1"), { codigoDefinidoEm: def, codigoDuracaoMin: 30 });
  await setDoc(doc(f, "turmas/T1/salas/112233"), { nomes: [...nomesT].sort(), marcados: [nomesT[0]], definidoEm: def });
});
const ctxA = await newCtx(true); const aluno = await open(ctxA, APP + "#turma=T1");
await aluno.waitForSelector("#view-attendance:not(.hidden)"); await aluno.waitForTimeout(500);
await aluno.fill("#student-daily-code", "112233");
await aluno.waitForFunction(() => document.querySelectorAll(".student-row").length === 3, null, { timeout: 10000 });
await aluno.waitForTimeout(500);
check("Aluno: não vê \"saiu às\" nem o botão \"Saiu antes\"", !/saiu às/.test(await aluno.textContent("#student-list")) && (await aluno.locator(".exit-button:visible").count()) === 0);
await ctxA.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
