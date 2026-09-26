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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": types[path.extname(f)] || "text/html" }); res.end(body); }).listen(5204);
const APP = "http://localhost:5204/";
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

// ===== Lote 19: Excel sob demanda, QR com código, contador, aviso de 5 min, origem, tentativas =====
const nomesT = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira"];
const M = 60000;
await env.withSecurityRulesDisabled(async (c) => { const f = c.firestore();
  await setDoc(doc(f, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  await setDoc(doc(f, "professoresAutorizados", uidA), { email: "prof.ana@ifsul.edu.br", nome: "Ana Souza" });
  // código perto de vencer: gerado há 26 min, vale 30
  const def = Timestamp.fromMillis(Date.now() - 26 * M);
  await setDoc(doc(f, "turmas/T1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", codigoDefinidoEm: def, codigoDuracaoMin: 30 });
  await setDoc(doc(f, "turmas/T1/salas/135790"), { nomes: [...nomesT].sort(), marcados: [], definidoEm: def });
  const b = writeBatch(f); nomesT.forEach((n, k) => b.set(doc(f, `turmas/T1/alunos/s${k}`), { nome: n })); await b.commit();
  // uma presença pelo celular (com o código) e uma pelo professor
  await setDoc(doc(f, `turmas/T1/presencas/${hoje}_cel1`), { nome: nomesT[0], data: hoje, horario: "08:00", maquina: "cel1", codigoUsado: "135790", criadoEm: Timestamp.now(), expiraEm: Timestamp.fromMillis(Date.now() + 86400000) });
  await setDoc(doc(f, "turmas/T1/presencas/prof1"), { nome: nomesT[1], data: hoje, horario: "08:01", maquina: "professor", codigoUsado: "135790", expiraEm: Timestamp.fromMillis(Date.now() + 86400000) });
});

// --- professora: aviso de 5 min, origem, Excel sob demanda
let ctx = await newCtx(false);
const pedidos = [];
ctx.on("request", (q) => { if (/exceljs/.test(q.url())) pedidos.push(q.url()); });
let page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(1500);
const card = page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" });
const linhaCodigo = card.locator("[data-expira]");
check("Cartão: código perto de vencer em destaque (⚠, amarelo)", /⚠/.test(await linhaCodigo.innerText()) && (await linhaCodigo.getAttribute("class")).includes("text-amber-600"), await linhaCodigo.innerText());
await card.getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 3, null, { timeout: 10000 });
await page.waitForTimeout(800);
check("Barra da Chamada: ⚠ e \"expira em\" em amarelo", /^⚠ Código 135790 · expira em/.test(await page.textContent("#teacher-code-bar-text")) && (await page.getAttribute("#teacher-code-bar-text", "class")).includes("text-amber-700"), await page.textContent("#teacher-code-bar-text"));
check("Aviso único: \"o código vence em … se ainda faltar gente\"", /O código vence em .* Se ainda faltar gente, gere outro/.test(await page.textContent("#toast-text")), await page.textContent("#toast-text"));
const origemCel = page.locator(".student-row", { hasText: nomesT[0] }).locator(".origem-presenca");
const origemProf = page.locator(".student-row", { hasText: nomesT[1] }).locator(".origem-presenca");
check("Origem: 📱 marcado pelo celular do aluno", (await origemCel.getAttribute("aria-label")) === "Marcado pelo celular do aluno" && (await origemCel.locator("svg").count()) === 1);
check("Origem: 👤 marcado pelo professor", (await origemProf.getAttribute("aria-label")) === "Marcado pelo professor");
check("Excel ainda não baixado (só a Chamada aberta)", pedidos.length === 0 && (await page.evaluate(() => !window.ExcelJS)));
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.click("#btn-export-csv")]);
check("Exportar Excel: baixa a biblioteca na hora (com integrity) e gera o arquivo", pedidos.length === 1 && /\.xlsx$/.test(dl.suggestedFilename()) && (await page.evaluate(() => [...document.scripts].some((s) => /exceljs/.test(s.src) && s.integrity.startsWith("sha384-")))), dl.suggestedFilename());
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// Excel adulterado no CDN: bloqueado, com aviso
ctx = await newCtx(false);
await ctx.route("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: "window.__excelFalso = true; window.ExcelJS = {};" }));
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(1000);
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Chamada" }).click();
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 3, null, { timeout: 10000 });
await page.click("#btn-export-csv");
await page.waitForFunction(() => /Não foi possível preparar o Excel/.test(document.getElementById("toast-text").textContent), null, { timeout: 15000 })
  .then(() => check("Excel ALTERADO no CDN: bloqueado (não roda) e avisa", true), () => check("Excel ALTERADO no CDN: bloqueado (não roda) e avisa", false));
check("Excel ALTERADO: o código falso não rodou", await page.evaluate(() => !window.__excelFalso));
await ctx.close();

// --- QR com o código e contador na janela do código
await env.withSecurityRulesDisabled(async (c) => { await updateDoc(doc(c.firestore(), "turmas/T1"), { codigoDefinidoEm: null }); });
ctx = await newCtx(false);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(1000);
await page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }).getByRole("button", { name: "Gerar código 30 min" }).click();
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
const codigo = (await page.textContent("#code-display-value")).replace(/\s/g, "");
await page.waitForFunction(() => /de 3 já marcaram/.test(document.getElementById("code-display-count").textContent), null, { timeout: 10000 })
  .then(() => check("Contador na janela do código: \"2 de 3 já marcaram\"", true), () => check("Contador na janela do código: \"2 de 3 já marcaram\"", false));
check("Contador conta os marcados de hoje", /^2 de 3 já marcaram$/.test(await page.textContent("#code-display-count")), await page.textContent("#code-display-count"));
await page.click("#code-display-qr"); await page.waitForTimeout(600);
const png = await page.locator("#turma-qr-image img").screenshot();
const { PNG } = await import("pngjs"); const jsQR = (await import("jsqr")).default;
const im = PNG.sync.read(png); const lido = jsQR(new Uint8ClampedArray(im.data), im.width, im.height);
check("QR ampliado leva o link da turma COM o código", lido && lido.data === `${APP}#turma=T1&c=${codigo}`, lido && lido.data);
check("Texto do QR explica que já entra com o código", /já entra na turma com o código/.test(await page.textContent("#turma-qr-hint")));
await page.click("#btn-close-turma-qr");
// aluno escaneia (abre o link com o código)
const ctxA = await newCtx(true);
const aluno = await open(ctxA, `${APP}#turma=T1&c=${codigo}`);
await aluno.waitForFunction(() => document.querySelectorAll(".student-row").length === 3, null, { timeout: 10000 })
  .then(() => check("Aluno pelo QR: entra já com o código validado", true), () => check("Aluno pelo QR: entra já com o código validado", false));
check("Aluno pelo QR: o código sai do endereço", aluno.url() === `${APP}#turma=T1`, aluno.url());
await aluno.locator(".student-row", { hasText: nomesT[2] }).locator(".mark-button").click();
await aluno.locator(".student-row", { hasText: nomesT[2] }).locator(".confirm-attendance").click();
await page.waitForFunction(() => /Todos os 3 já marcaram|3 de 3/.test(document.getElementById("code-display-count").textContent) || /Encerrado/.test(document.getElementById("code-display-validity").textContent), null, { timeout: 10000 })
  .then(() => check("Contador atualiza ao vivo quando o aluno marca", true), () => check("Contador atualiza ao vivo quando o aluno marca", false));
check("Nenhum erro de JavaScript (professora e aluno)", page.errs.length === 0 && aluno.errs.length === 0, [...page.errs, ...aluno.errs].join(";"));
await ctxA.close();

// --- Limite de tentativas no aparelho do aluno
const ctxB = await newCtx(true);
const b = await open(ctxB, APP + "#turma=T1");
await b.waitForSelector("#view-attendance:not(.hidden)"); await b.waitForTimeout(600);
const errado = codigo === "000000" ? "000001" : "000000";
for (let i = 0; i < 5; i++) {
  await b.fill("#student-daily-code", ""); await b.fill("#student-daily-code", errado);
  await b.waitForTimeout(700);
}
check("5 códigos errados: pede para aguardar 1 minuto", /Código incorreto 5 vezes|Muitas tentativas/.test(await b.textContent("#global-message")), await b.textContent("#global-message"));
await b.fill("#student-daily-code", ""); await b.fill("#student-daily-code", codigo); await b.waitForTimeout(1200);
check("Durante a espera, nem o código certo é conferido", (await b.locator(".student-row").count()) === 0 && /Muitas tentativas/.test(await b.textContent("#global-message")));
await b.evaluate(() => localStorage.setItem("chamada:tentativasCodigo", JSON.stringify({ n: 0, ate: Date.now() - 1 })));
await b.reload(); await b.waitForSelector("#view-attendance:not(.hidden)"); await b.waitForTimeout(600);
await b.fill("#student-daily-code", codigo);
await b.waitForFunction(() => document.querySelectorAll(".student-row").length === 3, null, { timeout: 10000 })
  .then(() => check("Depois do minuto de espera, o código certo funciona", true), () => check("Depois do minuto de espera, o código certo funciona", false));
await ctxB.close(); await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
