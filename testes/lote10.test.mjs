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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5194);
const APP = "http://localhost:5194/";
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

// ===== Redução de leituras =====
const hoje = new Date(now).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const dias = [1, 2, 3, 4, 5, 6].map((d) => new Date(now - d * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }));
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  await setDoc(doc(db, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(db, "turmas/t0"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDoDia: "4821", codigoDefinidoEm: Timestamp.fromMillis(now - 5 * 60000), codigoDuracaoMin: 60 });
  await setDoc(doc(db, "turmas/t1"), { nome: "TURMA-SECRETA-DA-LISTA 2026", professorUid: uidA, professorNome: "Ana Souza" });
  const b = writeBatch(db); ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira"].forEach((n, k) => b.set(doc(db, `turmas/t0/alunos/s${k}`), { nome: n })); await b.commit();
  const b2 = writeBatch(db);
  dias.forEach((d, i) => b2.set(doc(db, `turmas/t0/presencas/old${i}`), { nome: "Ana Beatriz Rocha", data: d, horario: "07:5" + i, maquina: `MAQUINA-ANTIGA-${i}`, expiraEm: Timestamp.fromMillis(now + 86400000) }));
  b2.set(doc(db, "turmas/t0/presencas/hoje0"), { nome: "Bruno Henrique Alves", data: hoje, horario: "08:00", maquina: "MAQUINA-DE-HOJE", expiraEm: Timestamp.fromMillis(now + 86400000) });
  await b2.commit();
});
await migrarCodigos(env);
// Registra, dentro do navegador, tudo o que chega do banco (emulador),
// inclusive as conexões contínuas (o SDK usa XMLHttpRequest)
const GRAVAR_TRAFEGO = () => {
  window.__trafego = [];
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url, ...r) {
    if (String(url).includes("127.0.0.1:8080")) {
      let visto = 0;
      this.addEventListener("readystatechange", () => {
        try { const t = this.responseText || ""; if (t.length > visto) { window.__trafego.push(t.slice(visto)); visto = t.length; } } catch { /* sem texto */ }
      });
    }
    return open.call(this, m, url, ...r);
  };
  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const res = await origFetch(...args);
    const url = String(args[0] && args[0].url ? args[0].url : args[0]);
    if (url.includes("127.0.0.1:8080") && res.body) {
      const [paraSite, paraTeste] = res.body.tee();
      (async () => { const leitor = paraTeste.getReader(); const dec = new TextDecoder(); for (;;) { const { done, value } = await leitor.read(); if (done) break; window.__trafego.push(dec.decode(value, { stream: true })); } })().catch(() => {});
      return new Response(paraSite, { status: res.status, statusText: res.statusText, headers: res.headers });
    }
    return res;
  };
};
const trafego = (p) => p.evaluate(() => (window.__trafego || []).join("\n"));
// Aluno pelo link/QR da turma
let ctx = await newCtx(true);
await ctx.addInitScript(GRAVAR_TRAFEGO);
let page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(e.message));
await page.goto(APP + "#turma=t0");
await page.waitForSelector("#view-attendance:not(.hidden)");
await page.fill("#student-daily-code", "4821");
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 3); await page.waitForTimeout(2500);
let tudo = await trafego(page);
check("Captura do tráfego do banco funcionando (recebeu a presença de hoje e os alunos)", tudo.includes("MAQUINA-DE-HOJE") && tudo.includes("Camila Ferreira"), `${tudo.length} caracteres`);
check("Aluno: as presenças dos 6 dias anteriores NÃO são baixadas", !tudo.includes("MAQUINA-ANTIGA"));
check("Aluno pelo link: a lista de todas as turmas NÃO é baixada", !tudo.includes("TURMA-SECRETA-DA-LISTA"));
check("Aluno: presença de hoje aparece normalmente (Bruno presente)", (await page.locator(".student-row", { hasText: "Bruno Henrique Alves" }).evaluate((r) => r.classList.contains("is-present"))) && (await page.textContent("#present-count")) === "1");
check("Aluno: presença de ontem não conta como hoje (Ana ausente)", !(await page.locator(".student-row", { hasText: "Ana Beatriz Rocha" }).evaluate((r) => r.classList.contains("is-present"))));
check("Selo de conexão não fica preso em \"Conectando\"", await page.isHidden("#db-status-badge"));
await page.locator(".student-row", { hasText: "Camila Ferreira" }).locator(".mark-button").click();
await page.locator(".student-row", { hasText: "Camila Ferreira" }).locator(".confirm-attendance").click();
await page.waitForSelector("#student-done-panel:not(.hidden)", { timeout: 10000 });
check("Aluno marca normalmente", (await page.textContent("#student-done-name")) === "Camila Ferreira");
// voltar para a lista de turmas: aí sim baixa a lista
await page.click("#btn-student-done-list");
await page.click("#btn-trocar-turma");
await page.waitForSelector(".turma-card", { timeout: 10000 }); await page.waitForTimeout(800);
check("Voltando à lista: as turmas aparecem", (await page.locator(".turma-card").count()) === 2);
check("Nenhum erro de JavaScript (aluno pelo link)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// Aluno pela tela inicial: lista aparece; ao entrar na turma, tudo certo
ctx = await newCtx(true);
page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(e.message));
await page.goto(APP);
await page.waitForSelector(".turma-card"); await page.waitForTimeout(500);
check("Tela inicial: lista de turmas aparece", (await page.locator(".turma-card").count()) === 2);
await page.locator(".turma-card", { hasText: "INF2M 2026" }).click();
await page.waitForSelector("#view-attendance:not(.hidden)"); await page.waitForTimeout(500);
await page.fill("#student-daily-code", "4821");
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 3); await page.waitForTimeout(800);
check("Tela inicial → turma: presenças de hoje (2) e nenhuma antiga", (await page.textContent("#present-count")) === "2");
check("Nenhum erro de JavaScript (aluno pela lista)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// Aluno rápido: digita o código no mesmo instante em que abre a turma
for (const via of ["lista", "link"]) {
  for (let rodada = 0; rodada < 3; rodada++) {
    ctx = await newCtx(true);
    page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(e.message));
    if (via === "lista") {
      await page.goto(APP); await page.waitForSelector(".turma-card");
      await page.locator(".turma-card", { hasText: "INF2M 2026" }).click();
    } else {
      await page.goto(APP + "#turma=t0");
    }
    await page.fill("#student-daily-code", "4821"); // sem esperar nada
    const ok = await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 3, null, { timeout: 8000 }).then(() => true, () => false);
    check(`Aluno rápido ${via === "lista" ? "pela lista" : "pelo link"} (rodada ${rodada + 1}): código aceito e lista aparece`, ok && page.errs.length === 0, ok ? "" : await page.textContent("#global-message-text"));
    await ctx.close();
  }
}

// Professor: Chamada com as de hoje; histórico continua com os 7 dias
ctx = await newCtx(true);
await ctx.addInitScript(GRAVAR_TRAFEGO);
page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(e.message));
await page.goto(APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 3); await page.waitForTimeout(2000);
const trafProf = await trafego(page);
check("Professor: Chamada sem baixar as presenças antigas", trafProf.includes("MAQUINA-DE-HOJE") && !trafProf.includes("MAQUINA-ANTIGA") && (await page.textContent("#present-count")) === "2");
await page.click("#btn-trocar-turma"); await page.waitForTimeout(500);
const c = page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" });
await c.getByRole("button", { name: /^Mais opções/ }).click();
await c.getByRole("button", { name: "Gerenciar", exact: true }).locator("visible=true").click();
await page.waitForSelector("#history-day-panel:not(.hidden)", { timeout: 10000 }); await page.waitForTimeout(600);
check("Histórico continua com todos os dias (hoje + 6 anteriores)", (await page.locator("#history-dates-list button").count()) === 7, `${await page.locator("#history-dates-list button").count()} dias`);
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// Virada do dia com a página aberta: passa a buscar o dia novo
ctx = await newCtx(true);
await ctx.addInitScript(() => {
  // relógio controlado: começa agora e o teste avança 1 dia
  const realNow = Date.now; let offset = 0; window.__avancarDia = () => { offset += 86400000; };
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [realNow() + offset])); } static now() { return realNow() + offset; } }
  window.Date = FakeDate;
  const realSetInterval = window.setInterval; window.__intervals = [];
  window.setInterval = (fn, ms, ...r) => { if (ms === 60000) window.__intervals.push(fn); return realSetInterval(fn, ms, ...r); };
});
page = await ctx.newPage(); page.errs = []; page.on("pageerror", (e) => page.errs.push(e.message));
await page.goto(APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 3); await page.waitForTimeout(800);
const antes = await page.textContent("#present-count");
const amanha = new Date(now + 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
await env.withSecurityRulesDisabled(async (c2) => { await setDoc(doc(c2.firestore(), "turmas/t0/presencas/amanha0"), { nome: "Ana Beatriz Rocha", data: amanha, horario: "07:30", maquina: "x", expiraEm: Timestamp.fromMillis(now + 3 * 86400000) }); });
await page.evaluate(() => { window.__avancarDia(); window.__intervals.forEach((f) => f()); });
await page.waitForFunction(() => document.getElementById("present-count").textContent === "1", null, { timeout: 8000 }).catch(() => {});
check("Virada do dia: a lista passa a mostrar o dia novo sozinha", antes === "2" && (await page.textContent("#present-count")) === "1" && (await page.locator(".student-row", { hasText: "Ana Beatriz Rocha" }).evaluate((r) => r.classList.contains("is-present"))), `antes ${antes}, depois ${await page.textContent("#present-count")}`);
check("Nenhum erro de JavaScript (virada do dia)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
