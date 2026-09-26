import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, Timestamp } from "firebase/firestore";
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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": f.endsWith(".css") ? "text/css" : "text/html" }); res.end(body); }).listen(5176);
const APP = "http://localhost:5176/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
async function createUser(email, displayName) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASS, returnSecureToken: true }) }).then((r) => r.json());
  await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName }) });
  return r.localId;
}
const uidA = await createUser("profa@teste.br", "Prof A");
const uidN = await createUser("novo@teste.br", "Prof Novo");
const uidM = await createUser("douglascamargo@ifsul.edu.br", "Master");
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8").replace("COLE_AQUI_O_UID_DA_CONTA_MASTER", uidM) /* conta master do teste */ } });
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  for (const u of [uidA, uidN, uidM]) await setDoc(doc(db, "acordosProfessor", u), { avisosAceitosEm: Timestamp.now() });
  const nomes = ["INF1M 2026 - Algoritmos", "INF2M 2026 - Banco de Dados", "INF2N 2026 - Web", "INF3M 2026 - Redes", "INF3N 2026 - POO", "INF4M 2026 - Projeto"];
  for (let i = 0; i < nomes.length; i++) await setDoc(doc(db, `turmas/t${i}`), { nome: nomes[i], professorUid: uidA });
  await setDoc(doc(db, "turmas/t0/alunos/a1"), { nome: "Aluno 1" });
});
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
async function newContext(mobile = true) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (q) => q.fulfill({ body: readFileSync(`node_modules/firebase/${path.basename(new URL(q.request().url()).pathname)}`), contentType: "text/javascript" }));
  await ctx.route("https://cdn.tailwindcss.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdnjs.cloudflare.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
async function open(ctx, url = APP) { const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); await p.goto(url); return p; }
async function gateLogin(page, email, remember) {
  await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
  await page.fill("#teacher-gate-email", email); await page.fill("#teacher-gate-password", PASS);
  if (remember) await page.check("#teacher-gate-remember");
  await page.click("#teacher-gate-submit");
}
const dashboardVisible = (p) => p.isVisible("#teacher-turmas-list");

// ========== 1. Turmas primeiro + ⚙️ Mais opções ==========
let ctx = await newContext(true);
let page = await open(ctx);
await page.click("#btn-teacher-area");
check("Login: opção \"Manter conectado\" aparece e vem DESMARCADA", (await page.isVisible("#teacher-gate-remember")) && !(await page.isChecked("#teacher-gate-remember")));
await gateLogin(page, "profa@teste.br", false);
await page.waitForSelector("#teacher-turmas-list > div");
await page.waitForTimeout(800);
const pos = await page.evaluate(() => ({
  turmas: document.getElementById("teacher-turmas-heading").getBoundingClientRect().top + scrollY,
  primeiraTurma: document.querySelector("#teacher-turmas-list > div").getBoundingClientRect().top + scrollY,
  opcoesVisivel: !document.getElementById("teacher-options-view").classList.contains("hidden"),
  h: innerHeight
}));
check("Celular: painel mostra as turmas, sem cartão de opções embaixo", !pos.opcoesVisivel && (await page.locator("text=Mais opções").count()) === 0, JSON.stringify(pos));
check("Celular: a primeira turma já aparece sem rolar", pos.primeiraTurma + 60 < pos.h, `topo da 1ª turma em ${Math.round(pos.primeiraTurma)}px de ${pos.h}px`);
check("Tela de Opções começa escondida", !pos.opcoesVisivel);
check("Minha conta / Nova turma / Admin / Atalho estão na tela de Opções", await page.evaluate(() => { const m = document.getElementById("teacher-options-view"); return m.contains(document.getElementById("new-turma-details")) && m.contains(document.getElementById("teacher-display-name-input")) && m.contains(document.getElementById("admin-panel-section")) && m.contains(document.getElementById("shortcut-details")); }));
check("Aviso do SUAP e \"Avisos importantes\" ficam em Opções (fora do painel)", (await page.isHidden("#btn-open-terms")) && (await page.$eval("#btn-open-terms", (b) => !!b.closest("#teacher-options-view"))));
await page.screenshot({ path: `${OUT}/ux-01-painel-celular.png` });
await page.click("#btn-open-more-options");
await page.waitForTimeout(700);
check("⚙️ Opções abre a tela de Opções e esconde as turmas", (await page.isVisible("#teacher-options-view")) && (await page.isHidden("#teacher-turmas-section")) && (await page.isHidden("#btn-open-more-options")));
check("Tela de Opções: só um \"Voltar\" visível (o para as turmas)", (await page.isHidden("#btn-teacher-back")) && (await page.isVisible("#btn-close-teacher-options")));
check("Tela de Opções aparece no topo (sem rolar)", await page.evaluate(() => document.getElementById("btn-close-teacher-options").getBoundingClientRect().top < innerHeight));
await page.screenshot({ path: `${OUT}/ux-02-mais-opcoes-celular.png` });
check("Painel admin escondido para professor comum", await page.isHidden("#admin-panel-section"));
await page.click("#shortcut-details summary");
check("Atalho: endereço mostrado termina com #professor", (await page.textContent("#teacher-shortcut-url")) === APP + "#professor", await page.textContent("#teacher-shortcut-url"));
check("Atalho: URL da página vira #professor ao entrar no painel", page.url().endsWith("#professor"), page.url());
await page.goBack();
await page.waitForTimeout(600);
check("Botão Voltar do celular na tela de Opções volta para as turmas (sem sair do painel)", (await page.isVisible("#teacher-turmas-section")) && (await page.isHidden("#teacher-options-view")) && page.url().endsWith("#professor"));
await page.click("#btn-open-more-options");
await page.click("#btn-close-teacher-options");
await page.waitForTimeout(600);
check("\"Voltar para as turmas\" volta para a lista (e o Voltar de cima reaparece)", (await page.isVisible("#teacher-turmas-section")) && (await page.isVisible("#btn-open-more-options")) && (await page.isVisible("#btn-teacher-back")));

// ========== 4. Código grande ==========
await page.evaluate(() => scrollTo(0, 0));
await cardClick(page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }), "Gerar código 1h");
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
const msgCode = (await page.textContent("#toast-text")).match(/Código (\d{4})/)[1];
const big = await page.textContent("#code-display-value");
check("Gerar código 1h: abre o código em tamanho grande", big === msgCode, big);
check("Código grande: turma e validade", (await page.textContent("#code-display-turma")) === "INF2M 2026 - Banco de Dados" && /^Válido até \d{2}:\d{2} · expira em (1h|59 min)$/.test(await page.textContent("#code-display-validity")), await page.textContent("#code-display-validity"));
const fontPx = await page.$eval("#code-display-value", (e) => parseFloat(getComputedStyle(e).fontSize));
check("Código grande: fonte de pelo menos 64px", fontPx >= 64, `${fontPx}px`);
await page.screenshot({ path: `${OUT}/ux-03-codigo-grande-celular.png` });
await page.click("#btn-close-code-display");
check("Código grande: fecha pelo botão", await page.isHidden("#code-display-backdrop"));
await cardClick(page.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026" }), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#teacher-manage-panel:not(.hidden)");
await page.click('.btn-generate-code-duration[data-minutes="15"]');
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
check("Gerenciar → 15 min: também mostra o código grande", /expira em (15|14) min$/.test(await page.textContent("#code-display-validity")), await page.textContent("#code-display-validity"));
await page.keyboard.press("Escape");
check("Código grande: fecha com Esc", await page.isHidden("#code-display-backdrop"));

// ========== 5. Sem "manter conectado": sessão só na aba ==========
await page.reload(); await page.waitForTimeout(1500);
check("Sem manter conectado: recarregar a aba mantém o login (como hoje)", await dashboardVisible(page));
let page2 = await open(ctx, APP + "#professor");
await page2.waitForTimeout(1500);
check("Sem manter conectado: nova aba pede login (sessão não fica no aparelho)", (await page2.isVisible("#teacher-gate-modal-backdrop")) && !(await dashboardVisible(page2)));
await page2.click("#cancel-teacher-gate");
check("Cancelar o login do atalho volta à tela inicial sem #professor", !page2.url().includes("#professor") && (await page2.isVisible("#view-turma-select")));
await page.click("#btn-teacher-back");
check("Voltar tira o #professor da URL", !page.url().includes("#professor"), page.url());
check("Nenhum erro de JavaScript (sessão 1)", page.errs.length + page2.errs.length === 0, [...page.errs, ...page2.errs].join(";"));
await ctx.close();

// ========== 5+6. Com "manter conectado" + atalho ==========
ctx = await newContext(true);
page = await open(ctx, APP + "#professor");
check("Atalho sem login: abre o login direto", await page.isVisible("#teacher-gate-modal-backdrop").then(async (v) => v || (await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)", { timeout: 5000 }).then(() => true, () => false))));
await gateLogin(page, "profa@teste.br", true);
await page.waitForSelector("#teacher-turmas-list > div");
check("Atalho + login: cai direto nas turmas", await dashboardVisible(page));
await page.close();
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-turmas-list > div", { timeout: 10000 }).catch(() => {});
check("Manter conectado: nova aba pelo atalho abre direto nas turmas, SEM pedir senha", (await dashboardVisible(page)) && (await page.isHidden("#teacher-gate-modal-backdrop")));
await page.screenshot({ path: `${OUT}/ux-04-atalho-direto-celular.png` });
page2 = await open(ctx, APP);
await page2.waitForTimeout(1500);
check("Manter conectado: abrir o site normal mostra a tela dos alunos (não força o painel)", await page2.isVisible("#view-turma-select"));
await page2.click("#btn-teacher-area");
await page2.waitForTimeout(500);
check("Manter conectado: \"Área do professor\" entra sem pedir senha", (await dashboardVisible(page2)) && (await page2.isHidden("#teacher-gate-modal-backdrop")));
await page2.close();
await page.click("#btn-sign-out");
await page.waitForTimeout(800);
check("Sair: volta para a tela inicial", await page.isVisible("#view-turma-select"));
page2 = await open(ctx, APP + "#professor");
await page2.waitForTimeout(1500);
check("Depois de Sair: atalho volta a pedir senha (manter conectado encerrado)", (await page2.isVisible("#teacher-gate-modal-backdrop")) && !(await dashboardVisible(page2)));
check("Depois de Sair: marca local removida", (await page2.evaluate(() => localStorage.getItem("chamada:manterConectado"))) === null);
check("Nenhum erro de JavaScript (sessão 2)", page.errs.length + page2.errs.length === 0, [...page.errs, ...page2.errs].join(";"));
await ctx.close();

// ========== Desfazer presença: não oferece "manter conectado" ==========
ctx = await newContext(false);
page = await open(ctx);
await page.locator(".turma-card", { hasText: "INF1M 2026" }).click();
await page.waitForTimeout(800);
await page.click("#btn-teacher-mode");
check("Modo professor: login oferece \"manter conectado\"", await page.isVisible("#teacher-gate-remember"));
await gateLogin(page, "profa@teste.br", false);
await page.waitForSelector("#attendance-list-panel:not(.hidden)");
await page.locator(".student-row", { hasText: "Aluno 1" }).locator(".mark-button").click();
await page.locator(".student-row", { hasText: "Aluno 1" }).locator(".confirm-attendance").click().catch(() => {});
await page.locator(".student-row", { hasText: "Aluno 1" }).locator(".undo-button").waitFor({ state: "visible", timeout: 10000 });
await page.locator(".student-row", { hasText: "Aluno 1" }).locator(".undo-button").click();
await page.waitForSelector("#reauth-backdrop:not(.hidden)");
check("Desfazer presença: pede só a senha (sem tela de login nem \"manter conectado\")", (await page.isHidden("#teacher-gate-modal-backdrop")) && (await page.isHidden("#teacher-gate-remember-wrap")));
await page.fill("#reauth-input", PASS); await page.click("#btn-submit-reauth");
await page.locator(".student-row", { hasText: "Aluno 1" }).locator(".mark-button").waitFor({ state: "visible", timeout: 10000 });
check("[regressão] Desfazer presença continua funcionando", true);
check("Nenhum erro de JavaScript (modo professor)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ========== Professor sem turmas ==========
ctx = await newContext(true);
page = await open(ctx, APP + "#professor");
await gateLogin(page, "novo@teste.br", false);
await page.waitForSelector("#teacher-turmas-empty:not(.hidden)");
await page.click("#btn-empty-new-turma");
await page.waitForTimeout(700);
check("Sem turmas: \"+ Criar primeira turma\" abre a tela de Opções em Nova turma", (await page.evaluate(() => document.getElementById("new-turma-details").open)) && (await page.isVisible("#new-turma-details summary")) && (await page.isVisible("#teacher-options-view")));
await page.fill("#new-turma-turma", "INF1N").catch(() => {});
await page.fill("#new-turma-ano", "2026").catch(() => {});
await page.fill("#new-turma-disciplina", "Lógica").catch(() => {});
await page.click("#btn-create-turma").catch(() => {});
await page.waitForSelector("#teacher-manage-panel:not(.hidden)", { timeout: 10000 }).catch(() => {});
check("Criar turma na tela de Opções: volta para as turmas e abre o Gerenciar da nova turma", (await page.isVisible("#teacher-manage-panel")) && (await page.isHidden("#teacher-options-view")) && (await page.textContent("#manage-turma-title")) === "INF1N 2026 - Lógica", await page.textContent("#manage-turma-title"));
await ctx.close();

// ========== Master + computador ==========
ctx = await newContext(false);
page = await open(ctx, APP + "#professor");
await gateLogin(page, "douglascamargo@ifsul.edu.br", false);
await page.waitForSelector("#teacher-turmas-list > div");
await page.click("#btn-open-more-options");
check("Master: Painel admin na tela de Opções", await page.isVisible("#admin-panel-section"));
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/ux-06-opcoes-computador.png` });
await page.click("#btn-close-teacher-options");
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/ux-05-painel-computador.png` });
check("Nenhum erro de JavaScript (master)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
