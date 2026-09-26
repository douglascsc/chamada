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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": f.endsWith(".css") ? "text/css" : "text/html" }); res.end(body); }).listen(5179);
const APP = "http://localhost:5179/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
async function createUser(email, displayName) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASS, returnSecureToken: true }) }).then((r) => r.json());
  await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName }) });
  return r.localId;
}
const uidA = await createUser("prof.ana@ifsul.edu.br", "Ana Souza");
const uidB = await createUser("prof.bruno@ifsul.edu.br", "Bruno Lima");
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
const alunos = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira", "Daniel Souza Lima", "Eduarda Martins", "Felipe Carvalho", "Gabriela Nunes", "Heitor Ribeiro", "Isabela Costa", "João Pedro Santos"];
const turmasA = ["INF1M 2026 - Algoritmos", "INF1N 2026 - Lógica", "INF2M 2026 - Banco de Dados", "INF2N 2026 - Banco de Dados", "INF3M 2026 - Web", "INF3N 2026 - Web", "INF4M 2026 - Projeto", "ADS1 2026 - Introdução", "ADS3 2026 - Engenharia", "TMS1 2026 - Informática Básica"];
const now = Date.now();
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  for (const u of [uidA, uidB]) await setDoc(doc(db, "acordosProfessor", u), { avisosAceitosEm: Timestamp.now(), email: "x", nome: "x" });
  for (let i = 0; i < turmasA.length; i++) {
    const code = turmasA[i].startsWith("INF2M") ? { codigoDoDia: "4821", codigoDefinidoEm: Timestamp.now(), codigoDuracaoMin: 180 } : {};
    await setDoc(doc(db, `turmas/a${i}`), { nome: turmasA[i], professorUid: uidA, professorNome: "Ana Souza", professorEmail: "prof.ana@ifsul.edu.br", ...code });
    const b = writeBatch(db); alunos.forEach((n, k) => b.set(doc(db, `turmas/a${i}/alunos/s${k}`), { nome: n })); await b.commit();
  }
  for (let i = 0; i < 3; i++) await setDoc(doc(db, `turmas/b${i}`), { nome: `ELE${i + 1}M 2026 - Eletrônica`, professorUid: uidB, professorNome: "Bruno Lima", professorEmail: "prof.bruno@ifsul.edu.br" });
  // presenças de ontem e anteontem na INF2M (histórico)
  const b2 = writeBatch(db);
  for (let d = 1; d <= 2; d++) { const date = new Date(now - d * 86400000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    alunos.slice(0, 7).forEach((n, k) => b2.set(doc(db, `turmas/a2/presencas/${date}_${k}`), { nome: n, data: date, horario: "08:0" + k, maquina: "m" + k, expiraEm: Timestamp.fromMillis(now - d * 86400000 + 7 * 86400000) })); }
  // 3 alunos já marcaram hoje
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  alunos.slice(0, 3).forEach((n, k) => b2.set(doc(db, `turmas/a2/presencas/${hoje}_h${k}`), { nome: n, data: hoje, horario: "08:1" + k, maquina: "h" + k, expiraEm: Timestamp.fromMillis(now + 7 * 86400000) }));
  await b2.commit();
});
const read = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), p))).data(); }); return out; };
const listDocs = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDocs(collection(ctx.firestore(), p))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };

await migrarCodigos(env);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
async function newCtx(mobile = true) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: "pt-BR" } : { viewport: { width: 1280, height: 900 }, locale: "pt-BR" });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (q) => q.fulfill({ body: readFileSync(`node_modules/firebase/${path.basename(new URL(q.request().url()).pathname)}`), contentType: "text/javascript" }));
  await ctx.route("https://cdn.tailwindcss.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/**", (q) => q.fulfill({ headers: { "access-control-allow-origin": "*" }, contentType: "text/javascript", body: readFileSync("node_modules/exceljs/dist/exceljs.min.js") }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
async function open(ctx, url) { const p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message)); p.on("dialog", (d) => d.accept()); await p.goto(url); return p; }
const row = (page, nome) => page.locator("#teacher-turmas-list > div", { hasText: nome });

// ===== 4. Login sem o e-mail master =====
let ctx = await newCtx(true);
let page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
check("Login (1º acesso no aparelho): e-mail vem VAZIO, não o da conta master", (await page.inputValue("#teacher-gate-email")) === "", await page.inputValue("#teacher-gate-email"));
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(800);
const opcoes = await page.$$eval("#teacher-options-view details", (d) => d.map((x) => x.querySelector("summary span").textContent.trim()));
check("Opções na ordem: Atalho, Nova turma, Minha conta, Painel admin", JSON.stringify(opcoes) === JSON.stringify(["Atalho no celular", "Nova turma", "Minha conta", "Painel admin — professores"]), opcoes.join(" | "));

// ===== 10a. Alvos de toque =====
const alturas = await page.$$eval("#teacher-turmas-list > div button", (b) => b.map((x) => Math.round(x.getBoundingClientRect().height)).filter((h) => h > 0)); // só os visíveis
check("Celular: todos os botões das turmas com pelo menos 44px de altura", alturas.every((h) => h >= 44), `mín ${Math.min(...alturas)}px`);
const topo = await page.$$eval("#btn-open-more-options, #btn-sign-out, #btn-open-all-atrasos-bottom", (b) => b.map((x) => Math.round(x.getBoundingClientRect().height)));
check("Celular: Opções, Sair e Ver todos os atrasos (no fim da lista) com 44px", topo.every((h) => h >= 44), topo.join("/"));
check("Contraste: nenhum texto com o cinza fraco (slate-400)", (await page.evaluate(() => document.documentElement.outerHTML.includes("text-slate-400"))) === false);

// ===== 9. Busca + ⭐ =====
check("Com 10 turmas: aparece a busca de turmas", await page.isVisible("#teacher-turmas-search"));
await page.fill("#teacher-turmas-search", "inf2");
let nomes = await page.$$eval("#teacher-turmas-list > div .font-semibold.truncate", (e) => e.map((x) => x.textContent));
check("Busca \"inf2\" (sem diferenciar maiúsculas) mostra só INF2M e INF2N", nomes.length === 2 && nomes.every((n) => n.startsWith("INF2")), nomes.join(" | "));
await page.fill("#teacher-turmas-search", "xyz");
check("Busca sem resultado: mensagem própria", await page.isVisible("#teacher-turmas-search-empty"));
await page.fill("#teacher-turmas-search", "");
await row(page, "TMS1 2026").getByRole("button", { name: /Fixar TMS1/ }).click();
nomes = await page.$$eval("#teacher-turmas-list > div .font-semibold.truncate", (e) => e.map((x) => x.textContent));
check("⭐ Fixar: TMS1 (última da lista) sobe para o topo", nomes[0] === "TMS1 2026 - Informática Básica", nomes[0]);
check("⭐ Fixada: estrela cheia e aria-pressed", (await row(page, "TMS1 2026").locator("button[aria-pressed]").getAttribute("aria-pressed")) === "true");
await page.reload(); await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(600);
nomes = await page.$$eval("#teacher-turmas-list > div .font-semibold.truncate", (e) => e.map((x) => x.textContent));
check("⭐ Fixada continua no topo depois de recarregar", nomes[0] === "TMS1 2026 - Informática Básica");
await page.screenshot({ path: `${OUT}/nov-01-painel-busca-estrela-celular.png` });

// ===== 10c. Aviso flutuante visível mesmo rolado =====
await row(page, "INF4M 2026").scrollIntoViewIfNeeded();
await cardClick(row(page, "INF4M 2026"), "Gerar código 1h");
await page.waitForSelector("#code-display-backdrop:not(.hidden)");
// a janela do código já confirma; o aviso flutuante é testado com outra ação (copiar o link)
await page.click("#btn-code-display-copy-link");
await page.waitForSelector("#toast:not(.hidden)");
const toastVisivel = await page.evaluate(() => { const t = document.getElementById("toast"); const r = t.getBoundingClientRect(); return !t.classList.contains("hidden") && r.bottom <= innerHeight && r.top >= 0; });
check("Aviso flutuante aparece dentro da tela (fixo embaixo), mesmo com a lista rolada", toastVisivel, await page.textContent("#toast-text"));
await page.screenshot({ path: `${OUT}/nov-02-codigo-grande-ver-chamada-celular.png` });

// ===== 1. "Ver chamada" no código grande =====
await page.click("#btn-code-display-chamada");
await page.waitForSelector("#attendance-list-panel:not(.hidden)");
check("Código grande → \"Ver chamada\": abre a chamada da turma liberada, sem digitar código", (await page.textContent("#attendance-turma-name")) === "INF4M 2026 - Projeto");
await page.goBack(); await page.waitForTimeout(700);
check("Voltar do celular na chamada: volta ao painel", await page.isVisible("#teacher-turmas-list"));

// ===== 1. Botão Chamada =====
await row(page, "INF2M 2026").scrollIntoViewIfNeeded();
const scrollAntes = await page.evaluate(() => Math.round(scrollY));
await row(page, "INF2M 2026").getByRole("button", { name: "Chamada" }).click();
await page.waitForSelector("#attendance-list-panel:not(.hidden)"); await page.waitForTimeout(800);
check("Chamada: lista liberada para o dono, sem pedir código", (await page.isHidden("#daily-code-setup-card")) && (await page.isVisible("#attendance-list-panel")));
check("Chamada: botão \"Voltar às turmas\" e sem o botão Modo professor", (await page.textContent("#btn-trocar-turma")).includes("Voltar às turmas") && (await page.isHidden("#btn-teacher-mode")));
const ordem = await page.$$eval(".student-row .student-name", (e) => e.map((x) => x.textContent));
const presentes = ["Ana Beatriz Rocha", "Bruno Henrique Alves", "Camila Ferreira"];
check("Chamada: quem ainda NÃO marcou aparece primeiro", !presentes.includes(ordem[0]) && presentes.includes(ordem[ordem.length - 1]), `${ordem[0]} … ${ordem[ordem.length - 1]}`);
check("Chamada: total de presentes", (await page.textContent("#present-count")) === "3" && (await page.textContent("#student-count")) === "10");
await page.screenshot({ path: `${OUT}/nov-03-chamada-professor-celular.png` });
await page.locator(".student-row", { hasText: "Isabela Costa" }).locator(".mark-button").click();
await page.locator(".student-row", { hasText: "Isabela Costa" }).locator(".confirm-attendance").click().catch(() => {});
await page.waitForFunction(() => document.getElementById("present-count").textContent === "4", null, { timeout: 8000 }).catch(() => {});
check("Chamada: professor marca um aluno direto", (await page.textContent("#present-count")) === "4");
check("Chamada: professor vê \"Desfazer\" nos presentes", await page.locator(".student-row", { hasText: "Isabela Costa" }).locator(".undo-button").isVisible());
await page.click("#btn-trocar-turma"); await page.waitForTimeout(700);
const scrollDepois = await page.evaluate(() => Math.round(scrollY));
check("\"Voltar às turmas\": volta ao painel na mesma posição da lista", (await page.isVisible("#teacher-turmas-list")) && Math.abs(scrollDepois - scrollAntes) < 60, `${scrollAntes} → ${scrollDepois}`);

// ===== 7. Gerenciar como tela própria + histórico automático (7 dias) =====
await cardClick(row(page, "INF2M 2026"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#history-day-panel:not(.hidden)", { timeout: 10000 });
const g = await page.evaluate(() => ({ turmasOcultas: document.getElementById("teacher-turmas-section").classList.contains("hidden"), topo: Math.round(document.getElementById("teacher-manage-panel").getBoundingClientRect().top) }));
check("Gerenciar: tela própria (turmas escondidas), aberta no topo", g.turmasOcultas && g.topo < 844, JSON.stringify(g));
check("Gerenciar: histórico carregado sozinho, no dia mais recente", /presente\(s\) de 10/.test(await page.textContent("#history-day-title")));
check("Histórico: aviso fixo de 7 dias + exportar", (await page.textContent("#teacher-manage-panel")).includes("disponíveis por 7 dias"));
check("Histórico: cada dia mostra quando será apagado", /Será apagado automaticamente em/.test(await page.textContent("#history-day-title")), await page.textContent("#history-day-title"));
await page.screenshot({ path: `${OUT}/nov-04-gerenciar-celular.png`, fullPage: true });
await page.goBack(); await page.waitForTimeout(700);
check("Gerenciar: Voltar do celular volta às turmas", (await page.isVisible("#teacher-turmas-section")) && (await page.isHidden("#teacher-manage-panel")));

// ===== 3. Excluir turma com senha em campo oculto =====
await cardClick(row(page, "ADS1 2026"), "Gerenciar"); await abrirGerenciar(page);
await page.waitForSelector("#teacher-manage-panel:not(.hidden)");
await page.click("#btn-delete-turma");
await page.waitForSelector("#reauth-backdrop:not(.hidden)");
check("Excluir: janela com campo de senha oculto", (await page.getAttribute("#reauth-input", "type")) === "password");
await page.screenshot({ path: `${OUT}/nov-05-senha-oculta-celular.png` });
await page.keyboard.press("Escape");
check("Esc fecha a janela sem excluir", (await page.isHidden("#reauth-backdrop")) && Boolean(await read("turmas/a7")));
await page.click("#btn-delete-turma");
await page.fill("#reauth-input", "errada"); await page.click("#btn-submit-reauth");
await page.waitForSelector("#reauth-error:not(.hidden)");
check("Senha errada: aviso na própria janela, nada excluído", Boolean(await read("turmas/a7")));
await page.fill("#reauth-input", PASS); await page.click("#btn-submit-reauth");
await page.waitForFunction(() => /excluída com sucesso/.test(document.getElementById("toast-text").textContent), null, { timeout: 15000 });
check("Senha certa: turma excluída e volta às turmas", !(await read("turmas/a7")) && (await page.isVisible("#teacher-turmas-section")));
check("Nenhum erro de JavaScript (professora)", page.errs.length === 0, page.errs.join(";"));
await page.click("#btn-sign-out"); await page.waitForTimeout(600);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
check("Login seguinte no mesmo aparelho: e-mail NÃO vem preenchido (não fica guardado)", (await page.inputValue("#teacher-gate-email")) === "");
check("… e o cursor vai para o e-mail", await page.evaluate(() => document.activeElement && document.activeElement.id === "teacher-gate-email"));
await ctx.close();

// ===== Professor com poucas turmas: sem busca/estrela =====
ctx = await newCtx(true);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.bruno@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(500);
check("Com 3 turmas: sem busca e sem estrelas (tela limpa)", (await page.isHidden("#teacher-turmas-search-wrap")) && (await page.locator("#teacher-turmas-list button[aria-pressed]").count()) === 0);
await ctx.close();

// ===== 8. Aluno: confirmação final =====
ctx = await newCtx(true);
page = await open(ctx, APP);
await page.waitForSelector(".turma-card");
await page.locator(".turma-card", { hasText: "INF2M 2026 - Banco de Dados" }).click();
await page.waitForTimeout(1500);
await page.fill("#student-daily-code", "4821");
await page.waitForSelector("#attendance-list-panel:not(.hidden)");
await page.waitForFunction(() => document.querySelectorAll(".student-row").length === 10 && document.getElementById("present-count").textContent === "4");
const ordemAluno = await page.$$eval(".student-row .student-name", (e) => e.map((x) => x.textContent));
check("Aluno: quem falta vem primeiro; quem já marcou fica recolhido", ![...presentes, "Isabela Costa"].includes(ordemAluno[0]) && (await page.locator(".student-row:visible").count()) === 6 && /Já marcaram \(4\)/.test(await page.textContent("#present-toggle")), `${ordemAluno[0]} · visíveis ${await page.locator(".student-row:visible").count()}`);
await page.locator(".student-row", { hasText: "João Pedro Santos" }).locator(".mark-button").click();
await page.locator(".student-row", { hasText: "João Pedro Santos" }).locator(".confirm-attendance").click();
await page.waitForFunction(() => /Pode fechar/.test(document.getElementById("global-message-text").textContent), null, { timeout: 10000 });
const rowJ = page.locator(".student-row", { hasText: "João Pedro Santos" });
check("Aluno: mensagem \"registrada às hh:mm. Pode fechar esta página.\"", /registrada às \d{2}:\d{2}\. Pode fechar esta página\./.test(await page.textContent("#global-message-text")), await page.textContent("#global-message-text"));
check("Aluno: SEM botão \"Desfazer\" nem o falso botão \"Presente\"", (await rowJ.locator(".undo-button").isHidden()) && (await rowJ.locator(".present-pill").isHidden()));
check("Aluno: linha mostra \"Presente · hh:mm\"", /^Presente · \d{2}:\d{2}$/.test(await rowJ.locator(".present-status-label").textContent()));
check("Aluno: depois de marcar, aparece a tela \"Pronto ✓\" no lugar da lista", (await page.isVisible("#student-done-panel")) && (await page.isHidden("#attendance-list-panel")));
await page.screenshot({ path: `${OUT}/nov-06-aluno-confirmacao-celular.png` });
const pres = (await listDocs("turmas/a2/presencas")).find((p) => p.nome === "João Pedro Santos");
const dias = (pres.expiraEm.toMillis() - Date.now()) / 86400000;
check("Retenção: presença nova guarda 7 dias", dias > 6.9 && dias < 7.1, `${dias.toFixed(2)} dias`);
check("Nenhum erro de JavaScript (aluno)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

// ===== Computador: painel e chamada =====
ctx = await newCtx(false);
page = await open(ctx, APP + "#professor");
await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof.ana@ifsul.edu.br"); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(700);
check("Computador: cada turma continua numa linha só", await page.$$eval("#teacher-turmas-list > div", (rows) => rows.every((r) => new Set([...r.lastElementChild.querySelectorAll(":scope > button")].map((b) => Math.round(b.getBoundingClientRect().top))).size === 1)));
await page.screenshot({ path: `${OUT}/nov-07-painel-computador.png` });
check("Nenhum erro de JavaScript (computador)", page.errs.length === 0, page.errs.join(";"));
await ctx.close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
