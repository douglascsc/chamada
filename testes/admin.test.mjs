import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, Timestamp, Bytes } from "firebase/firestore";
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
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": f.endsWith(".css") ? "text/css" : "text/html" }); res.end(body); }).listen(5177);
const APP = "http://localhost:5177/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const PASS = "senha-123456";
async function createUser(email, displayName) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASS, returnSecureToken: true }) }).then((r) => r.json());
  await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName }) });
  return r.localId;
}
const uidM = await createUser("douglascamargo@ifsul.edu.br", "Douglas");
const uidA = await createUser("ana@teste.br", "Ana Souza");
const uidB = await createUser("bruno@teste.br", "Bruno Lima");
const uidC = await createUser("carla@teste.br", "Carla Dias");
const uidN = await createUser("novo@teste.br", "Nelson Novo");
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8").replace("COLE_AQUI_O_UID_DA_CONTA_MASTER", uidM) /* conta master do teste */ } });
let adminDb;
await env.withSecurityRulesDisabled(async (ctx) => { adminDb = ctx.firestore(); const db = adminDb;
  await setDoc(doc(db, "acordosProfessor", uidM), { avisosAceitosEm: Timestamp.now(), email: "douglascamargo@ifsul.edu.br", nome: "Douglas" });
  await setDoc(doc(db, "acordosProfessor", uidA), { avisosAceitosEm: Timestamp.now(), email: "ana@teste.br" }); // registro antigo, sem nome
  await setDoc(doc(db, "acordosProfessor", uidB), { avisosAceitosEm: Timestamp.now(), email: "bruno@teste.br", nome: "Bruno Lima" });
  // Carla: sem registro (nunca aceitou avisos nesta versão), mas tem turma
  await setDoc(doc(db, "turmas/tA1"), { nome: "INF2M 2026 - Banco de Dados", professorUid: uidA, professorNome: "Ana Souza", professorEmail: "ana@teste.br" });
  await setDoc(doc(db, "turmas/tA2"), { nome: "INF3M 2026 - Redes", professorUid: uidA, professorNome: "Ana Souza", professorEmail: "ana@teste.br" });
  await setDoc(doc(db, "turmas/tB1"), { nome: "INF2N 2026 - Web", professorUid: uidB, professorNome: "Bruno Lima", professorEmail: "bruno@teste.br" });
  await setDoc(doc(db, "turmas/tC1"), { nome: "INF4M 2026 - Projeto", professorUid: uidC, professorNome: "Carla Dias", professorEmail: "carla@teste.br" });
  await setDoc(doc(db, "turmas/tA1/alunos/a1"), { nome: "Aluno 1" });
  await setDoc(doc(db, "turmas/tC1/alunos/c1"), { nome: "Aluno C" });
  const img = Bytes.fromUint8Array(new Uint8Array(readFileSync("out/pequena_800x600.jpg.img")));
  const th = Bytes.fromUint8Array(new Uint8Array(readFileSync("out/pequena_800x600.jpg.thumb")));
  await setDoc(doc(db, "turmas/tA1/atrasos/f1"), { criadoEm: Timestamp.now(), thumb: th });
  await setDoc(doc(db, "turmas/tA1/atrasosImg/f1"), { img });
  await setDoc(doc(db, "turmas/tC1/atrasos/fc"), { criadoEm: Timestamp.now(), thumb: th });
  await setDoc(doc(db, "turmas/tC1/atrasosImg/fc"), { img });
});
const read = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDoc(doc(ctx.firestore(), p))).data(); }); return out; };
const count = async (p) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = (await getDocs(collection(ctx.firestore(), p))).size; }); return out; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
async function login(email, mobile = false) {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 1000 } });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (q) => q.fulfill({ body: readFileSync(`node_modules/firebase/${path.basename(new URL(q.request().url()).pathname)}`), contentType: "text/javascript" }));
  await ctx.route("https://cdn.tailwindcss.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdnjs.cloudflare.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: "" }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  const page = await ctx.newPage();
  page.errs = []; page.on("pageerror", (e) => page.errs.push(e.message));
  page.dialogs = []; page.on("dialog", (d) => { page.dialogs.push(d.message()); d.accept(d.type() === "prompt" ? PASS : undefined); });
  await page.goto(APP + "#professor");
  await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
  await page.fill("#teacher-gate-email", email); await page.fill("#teacher-gate-password", PASS); await page.click("#teacher-gate-submit");
  await page.waitForSelector("#teacher-dashboard-content:not(.hidden), #terms-modal-backdrop:not(.hidden)");
  return page;
}
async function openAdmin(page) {
  await page.click("#btn-open-more-options");
  if (!(await page.evaluate(() => document.getElementById("admin-panel-section").open))) await page.click("#admin-panel-section summary");
  await page.waitForFunction(() => document.querySelectorAll("#admin-professores-list > div").length > 0 && !/Carregando/.test(document.getElementById("admin-professores-status").textContent));
}
const adminRows = (page) => page.$$eval("#admin-professores-list > div", (rows) => rows.map((r) => r.querySelector(".font-semibold").textContent + " | " + r.querySelector(".text-xs").textContent));

// ===== Registro: professor novo aparece depois do 1º acesso =====
let pN = await login("novo@teste.br");
await pN.waitForSelector("#terms-modal-backdrop:not(.hidden)", { timeout: 8000 }).catch(() => {});
check("Professor novo: aviso obrigatório no 1º acesso", await pN.isVisible("#terms-modal-backdrop"));
await pN.waitForTimeout(400);
const termos = await pN.$eval("#terms-modal-box", (b) => ({ top: b.scrollTop, rola: b.scrollHeight > b.clientHeight + 24 }));
check("Avisos (1º acesso): abrem no topo", termos.top === 0, JSON.stringify(termos));
if (termos.rola) check("Avisos: \"Concordo\" travado até rolar até o fim, com a dica", (await pN.isDisabled("#btn-close-terms")) && (await pN.isVisible("#terms-scroll-hint")));
await pN.$eval("#terms-modal-box", (b) => b.scrollTo(0, b.scrollHeight)); await pN.waitForTimeout(300);
check("Avisos: no fim, \"Concordo\" liberado e a dica some", (await pN.isEnabled("#btn-close-terms")) && (await pN.isHidden("#terms-scroll-hint")));
await pN.click("#btn-close-terms");
await pN.waitForTimeout(800);
const regN = await read(`acordosProfessor/${uidN}`);
check("Professor novo: ao aceitar, registro guarda nome e e-mail", regN && regN.nome === "Nelson Novo" && regN.email === "novo@teste.br", JSON.stringify(regN && { nome: regN.nome, email: regN.email }));
check("Professor comum NÃO vê o Painel admin", await pN.isHidden("#admin-panel-section"));
await pN.context().close();
let pA = await login("ana@teste.br");
await pA.waitForTimeout(1200);
check("Registro antigo sem nome é completado no login", (await read(`acordosProfessor/${uidA}`)).nome === "Ana Souza");
await pA.context().close();

// ===== Master: lista =====
let pM = await login("douglascamargo@ifsul.edu.br");
await pM.waitForSelector("#teacher-turmas-list > div");
await openAdmin(pM);
let rows = await adminRows(pM);
console.log("   lista:", rows.join(" || "));
check("Lista: todos os professores (registro + donos de turma), com nº de turmas",
  rows.length === 5 && rows.some((r) => r.startsWith("Ana Souza | ana@teste.br · 2 turmas")) && rows.some((r) => r.startsWith("Carla Dias | e-mail desconhecido · 1 turma")) /* sem cadastro: o e-mail não vem mais da turma (pública) */ && rows.some((r) => r.startsWith("Nelson Novo | novo@teste.br · 0 turmas")) && rows.some((r) => r.startsWith("Douglas (você)")));
check("Lista: a própria conta master não tem botão Remover", await pM.locator("#admin-professores-list > div", { hasText: "(você)" }).getByRole("button", { name: "Remover" }).count() === 0);
await pM.screenshot({ path: `${OUT}/adm-01-lista.png`, fullPage: false });

// ===== Redefinir senha =====
await pM.locator("#admin-professores-list > div", { hasText: "Bruno Lima" }).getByRole("button", { name: "Redefinir senha" }).click();
await pM.waitForFunction(() => /enviado/.test(document.getElementById("admin-professores-status").textContent));
const oob = await fetch("http://127.0.0.1:9099/emulator/v1/projects/demo-chamada/oobCodes").then((r) => r.json());
check("Redefinir senha: pede confirmação e envia o e-mail de redefinição", pM.dialogs.some((m) => m.includes("bruno@teste.br")) && oob.oobCodes.some((c) => c.email === "bruno@teste.br" && c.requestType === "PASSWORD_RESET"));
check("Redefinir senha: master continua conectada (na tela de Opções)", (await pM.isVisible("#teacher-options-view")) && (await pM.textContent("#teacher-account-email")) === "douglascamargo@ifsul.edu.br");

// ===== Transferir turma (Gerenciar) =====
await pM.click("#btn-close-teacher-options");
await pM.waitForSelector("#teacher-turmas-section:not(.hidden)");
await cardClick(pM.locator("#teacher-turmas-list > div", { hasText: "INF2M 2026 - Banco de Dados" }), "Gerenciar"); await abrirGerenciar(pM);
await pM.waitForSelector("#manage-transfer-section:not(.hidden)");
await pM.waitForFunction(() => document.getElementById("manage-transfer-select").options.length > 0);
check("Gerenciar (master): seção Transferir com dono atual", (await pM.textContent("#manage-transfer-owner")) === "Ana Souza");
const opts = await pM.$$eval("#manage-transfer-select option", (o) => o.map((x) => x.textContent));
check("Transferir: lista não inclui o dono atual", !opts.some((o) => o.startsWith("Ana Souza")) && opts.some((o) => o.startsWith("Bruno Lima")), opts.join(" | "));
await pM.selectOption("#manage-transfer-select", uidB);
await pM.click("#btn-transfer-turma");
await pM.waitForFunction(() => /transferida/.test(document.getElementById("manage-transfer-status").textContent));
const tA1 = await read("turmas/tA1");
check("Transferir: turma passa para o Bruno (uid e nome; sem e-mail na turma)", tA1.professorUid === uidB && tA1.professorNome === "Bruno Lima" && !("professorEmail" in tA1));
check("Transferir: alunos e fotos continuam na turma", (await count("turmas/tA1/alunos")) === 1 && (await count("turmas/tA1/atrasos")) === 1);
await pM.waitForTimeout(500);
check("Transferir: dono atual atualiza na tela", (await pM.textContent("#manage-transfer-owner")) === "Bruno Lima");
await pM.screenshot({ path: `${OUT}/adm-02-transferir.png` });
let pB = await login("bruno@teste.br");
await pB.waitForSelector("#teacher-turmas-list > div");
const namesB = await pB.$$eval("#teacher-turmas-list > div .font-semibold.truncate", (e) => e.map((x) => x.textContent));
check("Novo dono vê a turma recebida", namesB.includes("INF2M 2026 - Banco de Dados"), namesB.join(" | "));
check("Novo dono NÃO vê a seção Transferir nem o Painel admin", (await pB.isHidden("#admin-panel-section")));
await pB.click("#btn-open-all-atrasos");
await pB.waitForFunction(() => document.getElementById("atrasos-status").textContent === "");
check("Novo dono vê as fotos de atraso da turma recebida", (await pB.locator("#atrasos-list button").count()) === 1);
await pB.context().close();
pA = await login("ana@teste.br");
await pA.waitForSelector("#teacher-turmas-list > div");
const namesA = await pA.$$eval("#teacher-turmas-list > div .font-semibold.truncate", (e) => e.map((x) => x.textContent));
check("Dono anterior deixa de ver a turma", !namesA.includes("INF2M 2026 - Banco de Dados") && namesA.includes("INF3M 2026 - Redes"), namesA.join(" | "));
await pA.context().close();

// ===== Remover professor transferindo turmas =====
await pM.click("#btn-manage-back");
await openAdmin(pM);
await pM.click("#btn-refresh-professores");
await pM.waitForFunction(() => !/Carregando/.test(document.getElementById("admin-professores-status").textContent) && document.querySelectorAll("#admin-professores-list > div").length > 0);
const rowA = pM.locator("#admin-professores-list > div", { hasText: "Ana Souza" });
await rowA.getByRole("button", { name: "Remover" }).click();
check("Remover: mostra as turmas e as opções (transferir / excluir)", (await rowA.textContent()).includes("INF3M 2026 - Redes") && (await rowA.locator('input[type="radio"]').count()) === 2);
await rowA.locator("select").selectOption(uidM);
await pM.screenshot({ path: `${OUT}/adm-03-remover.png` });
await rowA.getByRole("button", { name: "Confirmar remoção" }).click();
await pM.waitForSelector("#reauth-backdrop:not(.hidden)");
check("Remover: pede a senha da master antes, em campo oculto", (await pM.textContent("#reauth-message")).includes("Remover Ana Souza") && (await pM.getAttribute("#reauth-input", "type")) === "password");
await pM.fill("#reauth-input", PASS); await pM.click("#btn-submit-reauth");
await rowA.getByText("Último passo").waitFor({ timeout: 15000 });
check("Remover (transferir): turma foi para a master", (await read("turmas/tA2")).professorUid === uidM);
check("Remover: registro do professor apagado (sai da lista)", !(await read(`acordosProfessor/${uidA}`)));
check("Remover: mostra link para apagar o login no Console", (await rowA.locator("a").getAttribute("href")) === "https://console.firebase.google.com/project/demo-chamada/authentication/users");
await pM.screenshot({ path: `${OUT}/adm-04-removido.png` });

// ===== Remover professor excluindo turmas =====
const rowC = pM.locator("#admin-professores-list > div", { hasText: "Carla Dias" });
await rowC.getByRole("button", { name: "Remover" }).click();
await rowC.locator('input[value="delete"]').check();
check("Remover: ao escolher excluir, a lista de destino é desativada", await rowC.locator("select").isDisabled());
await rowC.getByRole("button", { name: "Confirmar remoção" }).click();
await pM.waitForSelector("#reauth-backdrop:not(.hidden)");
await pM.fill("#reauth-input", PASS); await pM.click("#btn-submit-reauth");
await rowC.getByText("Último passo").waitFor({ timeout: 15000 });
check("Remover (excluir): turma e tudo dentro dela apagados", !(await read("turmas/tC1")) && (await count("turmas/tC1/alunos")) === 0 && (await count("turmas/tC1/atrasos")) === 0 && (await count("turmas/tC1/atrasosImg")) === 0);
await rowC.getByRole("button", { name: "Concluir" }).click(); // fecha a confirmação e atualiza a lista
await pM.waitForFunction(() => !/Carregando/.test(document.getElementById("admin-professores-status").textContent) && document.querySelectorAll("#admin-professores-list > div").length > 0);
rows = await adminRows(pM);
check("\"Concluir\": lista atualizada, Ana e Carla não aparecem mais", !rows.some((r) => r.startsWith("Ana") || r.startsWith("Carla")), rows.join(" || "));

// ===== Senha errada não altera nada =====
const rowN = pM.locator("#admin-professores-list > div", { hasText: "Nelson Novo" });
await rowN.getByRole("button", { name: "Remover" }).click();
await rowN.getByRole("button", { name: "Confirmar remoção" }).click();
await pM.waitForSelector("#reauth-backdrop:not(.hidden)");
await pM.fill("#reauth-input", "senha-errada"); await pM.click("#btn-submit-reauth");
await pM.waitForSelector("#reauth-error:not(.hidden)");
check("Senha errada: mensagem na própria janela, que continua aberta", await pM.isVisible("#reauth-backdrop"));
await pM.click("#btn-cancel-reauth");
await pM.waitForTimeout(800);
check("Remover com senha errada + Cancelar: nada é alterado", Boolean(await read(`acordosProfessor/${uidN}`)) && (await pM.isHidden("#reauth-backdrop")));
check("Nenhum erro de JavaScript (master)", pM.errs.length === 0, pM.errs.join(";"));
await pM.context().close();

// ===== Celular =====
const pMm = await login("douglascamargo@ifsul.edu.br", true);
await pMm.waitForSelector("#teacher-turmas-list > div");
await openAdmin(pMm);
await pMm.evaluate(() => document.getElementById("admin-professores-list").scrollIntoView());
check("Celular: painel de professores sem rolagem horizontal", await pMm.evaluate(() => document.documentElement.scrollWidth <= 390));
await pMm.screenshot({ path: `${OUT}/adm-05-celular.png` });
await pMm.context().close();

await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
