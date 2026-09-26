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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5196);
const APP = "http://localhost:5196/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "prof.ana@ifsul.edu.br", password: PASS, returnSecureToken: true }) }).then((r) => r.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName: "Ana Souza" }) });
const uidA = r.localId;
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
const now = Date.now();
const ontem = new Date(now - 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const read = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), p))).data(); }); return out; };
const list = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDocs(collection(ctx.firestore(), p))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };

await migrarCodigos(env);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
async function newCtx(mobile = true) {
  const ctx = await browser.newContext({ ...(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } }), locale: "pt-BR" });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (q) => q.fulfill({ body: readFileSync(`node_modules/firebase/${path.basename(new URL(q.request().url()).pathname)}`), contentType: "text/javascript" }));
  await ctx.route("https://cdn.tailwindcss.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdnjs.cloudflare.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
async function open(ctx, url) { const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); await p.goto(url); return p; }
import ExcelJS from "exceljs";

// ===== Código de 30 min / 1h e presença com atraso =====
const hoje = new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const nomesT0 = ["Ana (08:00, 1ª)", "Bruno (08:15)", "Caio (08:20, limite)", "Davi (08:21, atrasado)", "Eva (08:40, professor)", "Fabio (falta)"].map((n) => n.split(" (")[0]);
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  await setDoc(doc(db, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(db, "turmas/t0"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDoDia: "4821", codigoDefinidoEm: Timestamp.fromMillis(now - 5 * 60000), codigoDuracaoMin: 60 });
  await setDoc(doc(db, "turmas/t1"), { nome: "INF3M 2026 - Web", professorUid: uidA, professorNome: "Ana Souza" });
  const b = writeBatch(db); nomesT0.forEach((n, k) => b.set(doc(db, `turmas/t0/alunos/s${k}`), { nome: n })); ["Gil", "Hugo"].forEach((n, k) => b.set(doc(db, `turmas/t1/alunos/s${k}`), { nome: n })); await b.commit();
  const exp = Timestamp.fromMillis(now + 3 * 86400000);
  const b2 = writeBatch(db);
  [["Ana", "08:00", "m0"], ["Bruno", "08:15", "m1"], ["Caio", "08:20", "m2"], ["Davi", "08:21", "m3"], ["Eva", "08:40", "professor"]].forEach(([n, h, m], k) => b2.set(doc(db, `turmas/t0/presencas/h${k}`), { nome: n, data: hoje, horario: h, maquina: m, expiraEm: exp }));
  // ontem: 1ª marcação às 10:00; Bruno 10:30 atrasado; Caio corrigido pelo histórico ("manual", sem horário)
  [["Ana", "10:00", "m0"], ["Bruno", "10:30", "m1"], ["Caio", "manual", "professor"]].forEach(([n, h, m], k) => b2.set(doc(db, `turmas/t0/presencas/o${k}`), { nome: n, data: ontem, horario: h, maquina: m, expiraEm: exp }));
  await b2.commit();
});
const card = (p, n) => p.locator("#teacher-turmas-list > div", { hasText: n });
const status = (p, n) => p.locator(".student-row", { hasText: n }).locator(".present-status-label").innerText();
async function login(page) {
  await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
  await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
  await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);
}
async function lerExcel(page, clicar) {
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), clicar()]);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(await dl.path());
  const ws = wb.worksheets[0]; const linhas = [];
  ws.eachRow((r) => linhas.push(r.values.slice(1).map((v) => (v && v.richText ? v.richText.map((t) => t.text).join("") : v))));
  return linhas;
}

// ----- Professor no celular -----
let ctx = await newCtx(true);
let page = await open(ctx, APP + "#professor");
await login(page);
const c1 = card(page, "INF3M 2026");
const visiveis = await c1.locator("button:visible").evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-label") || b.innerText.trim()));
check("Celular: \"Gerar código 30 min\" na linha principal", visiveis.includes("Gerar código 30 min") && !visiveis.includes("Gerar código 1h"), visiveis.join(" | "));
await c1.getByRole("button", { name: /^Mais opções/ }).click();
check("Celular: \"Gerar código 1h\" no ⋯ (com Gerenciar)", (await c1.getByRole("button", { name: "Gerar código 1h", exact: true }).locator("visible=true").count()) === 1 && /gerar código 1h e gerenciar/.test(await c1.getByRole("button", { name: /^Mais opções/ }).getAttribute("aria-label")));
await page.screenshot({ path: `${OUT}/l11-01-cartao-30min-celular.png` });
await c1.getByRole("button", { name: "Gerar código 30 min", exact: true }).click();
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
check("Gerar código 30 min: janela mostra 30 min", /expira em (29|30) min/.test(await page.textContent("#code-display-validity")), await page.textContent("#code-display-validity"));
check("Gerar código 30 min: banco grava 30 minutos", (await read("turmas/t1")).codigoDuracaoMin === 30);
await page.click("#btn-close-code-display"); await page.waitForTimeout(400);
check("Cartão: código de 30 min com o horário certo", /Código \d{4} · até \d{2}:\d{2}/.test(await c1.locator("[data-expira] span:visible").innerText()));
// Chamada com atrasos
await card(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 6); await page.waitForTimeout(500);
check("Atraso: 1ª marcação (08:00) não é atraso", !/atrasado/.test(await status(page, "Ana")));
check("Atraso: 15 min depois não é atraso", !/atrasado/.test(await status(page, "Bruno")));
check("Atraso: exatamente 20 min não é atraso", !/atrasado/.test(await status(page, "Caio")));
check("Atraso: 21 min depois é atraso (\"Presente · 08:21 · atrasado\", em laranja)", (await status(page, "Davi")) === "Presente · 08:21 · atrasado" && (await page.locator(".student-row", { hasText: "Davi" }).locator(".present-status-label").evaluate((e) => e.classList.contains("is-late"))));
check("Atraso: marcação do professor também conta", (await status(page, "Eva")) === "Presente · 08:40 · atrasado");
check("Chamada: contagem \"· 2 atrasados\" junto de Presentes", (await page.isVisible("#late-count")) && (await page.innerText("#late-count")).trim() === "· 2 atrasados");
await page.screenshot({ path: `${OUT}/l11-02-chamada-atrasados-celular.png` });
const xHoje = await lerExcel(page, () => page.click("#btn-export-csv"));
const stHoje = Object.fromEntries(xHoje.slice(1).map((l) => [l[1], l[2]]));
check("Excel de hoje: Presente / Atrasado / Ausente", stHoje.Ana === "Presente" && stHoje.Caio === "Presente" && stHoje.Davi === "Atrasado" && stHoje.Eva === "Atrasado" && stHoje.Fabio === "Ausente", JSON.stringify(stHoje));
// sem código ativo: a barra oferece 30 min
await page.click("#btn-bar-end-code"); await page.waitForTimeout(800);
check("Chamada sem código: botão \"Gerar código 30 min\"", (await page.isVisible("#btn-bar-new-code")) && (await page.innerText("#btn-bar-new-code")).trim() === "Gerar código 30 min");
await page.click("#btn-bar-new-code");
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
check("Barra: gera código de 30 min", (await read("turmas/t0")).codigoDuracaoMin === 30);
await page.click("#btn-close-code-display");
await page.click("#btn-trocar-turma"); await page.waitForTimeout(600);
// Histórico
const c0 = card(page, "INF2M 2026");
await c0.getByRole("button", { name: /^Mais opções/ }).click();
await c0.getByRole("button", { name: "Gerenciar", exact: true }).locator("visible=true").click();
await page.waitForSelector("#history-day-panel:not(.hidden)", { timeout: 10000 }); await page.waitForTimeout(600);
check("Histórico de hoje: \"(2 atrasados)\" no título", /6 presente|5 presente\(s\) de 6 \(2 atrasados\)/.test(await page.textContent("#history-day-title")), await page.textContent("#history-day-title"));
await page.locator("#history-dates-list button", { hasText: `${ontem.slice(8, 10)}/${ontem.slice(5, 7)}/${ontem.slice(0, 4)}` }).click();
await page.waitForTimeout(500);
const linhaBruno = await page.locator("#history-day-list > div", { hasText: "Bruno" }).innerText();
const linhaCaio = await page.locator("#history-day-list > div", { hasText: "Caio" }).innerText();
check("Histórico de ontem: Bruno \"10:30 · atrasado\"; correção manual não é atraso", /10:30 · atrasado/.test(linhaBruno) && !/atrasado/.test(linhaCaio) && /\(1 atrasado\)/.test(await page.textContent("#history-day-title")), `${linhaBruno.replace(/\n/g, " ")} | ${linhaCaio.replace(/\n/g, " ")}`);
const xDia = await lerExcel(page, () => page.click("#btn-export-history-csv"));
check("Excel do dia (histórico): Bruno \"Atrasado\"", Object.fromEntries(xDia.slice(1).map((l) => [l[1], l[2]])).Bruno === "Atrasado");
const xSemana = await lerExcel(page, () => page.click("#btn-export-week"));
const cab = xSemana.find((l) => l[0] === "Aluno");
const lDavi = xSemana.find((l) => l[0] === "Davi"), lBruno = xSemana.find((l) => l[0] === "Bruno");
check("Excel dos 7 dias: coluna \"Atrasos\" e horário marcado \"(atrasado)\"", cab.includes("Atrasos") && lDavi.includes("08:21 (atrasado)") && lDavi[cab.indexOf("Atrasos")] === 1 && lBruno.includes("10:30 (atrasado)") && lBruno[cab.indexOf("Atrasos")] === 1, JSON.stringify({ cab, lDavi }));
check("Excel dos 7 dias: legenda explicando o atraso", xSemana.some((l) => /Atrasado: marcou mais de 20 minutos depois da primeira marcação/.test(String(l[0]))));
await page.click("#manage-config-details > summary");
check("Gerenciar: opção de 30 min no código manual", await page.locator('.btn-generate-code-duration[data-minutes="30"]').isVisible());
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ----- Aluno não vê "atrasado" -----
await env.withSecurityRulesDisabled(async (c) => { const { updateDoc } = await import("firebase/firestore"); await updateDoc(doc(c.firestore(), "turmas/t0"), { codigoDoDia: "4821", codigoDefinidoEm: Timestamp.fromMillis(Date.now() - 60000), codigoDuracaoMin: 30 }); });
await migrarCodigos(env);
ctx = await newCtx(true);
page = await open(ctx, APP + "#turma=t0");
await page.waitForSelector("#view-attendance:not(.hidden)");
await page.fill("#student-daily-code", "4821");
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 6); await page.waitForTimeout(500);
await page.click("#present-toggle");
check("Aluno: não vê \"atrasado\" nem a contagem de atrasos", !/atrasado/.test(await status(page, "Davi")) && (await page.isHidden("#late-count")));
check("Nenhum erro de JavaScript (aluno)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ----- Computador -----
ctx = await newCtx(false);
page = await open(ctx, APP + "#professor");
await login(page);
const bot = (await card(page, "INF3M 2026").locator("button:visible").allInnerTexts()).map((t) => t.trim());
check("Computador: Gerar código 30 min · Gerar código 1h · Chamada · Atrasos · Gerenciar", JSON.stringify(bot) === JSON.stringify(["Gerar código 30 min", "Gerar código 1h", "Chamada", "Atrasos", "Gerenciar"]) || JSON.stringify(bot.slice(-5)) === JSON.stringify(["Gerar código 30 min", "Gerar código 1h", "Chamada", "Atrasos", "Gerenciar"]), bot.join(" | "));
await page.screenshot({ path: `${OUT}/l11-03-painel-computador.png` });
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
