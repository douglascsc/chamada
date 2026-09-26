import { migrarCodigos, codigoAtual } from "./codigo-helpers.mjs";
import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, writeBatch, Timestamp } from "firebase/firestore";
import http from "node:http";
import { readFileSync } from "node:fs";
import path from "node:path";
const OUT = process.env.OUT;
const results = [];
const check = (name, ok, detail = "") => { results.push(Boolean(ok)); console.log(ok ? "✅" : "❌", name, detail ? `— ${detail}` : ""); };
const server = http.createServer((req, res) => { const p = req.url.split("?")[0]; const f = p === "/" ? "site/index.html" : `site${p}`; let body; try { body = readFileSync(f); } catch { res.writeHead(404); res.end(); return; } res.writeHead(200, { "content-type": f.endsWith(".css") ? "text/css" : "text/html" }); res.end(body); }).listen(5181);
const APP = "http://localhost:5181/";
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const r = await fetch(`${AUTH}/accounts:signUp?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "prof@ifsul.edu.br", password: "senha-123456", returnSecureToken: true }) }).then((r) => r.json());
await fetch(`${AUTH}/accounts:update?key=fake`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken: r.idToken, displayName: "Prof" }) });
const env = await initializeTestEnvironment({ projectId: "demo-chamada", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync("firestore.rules", "utf8") } });
const NOME = "INF2M 2026 - Banco de Dados e Programação Orientada a Objetos";
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore();
  await setDoc(doc(db, "acordosProfessor", r.localId), { avisosAceitosEm: Timestamp.now() });
  await setDoc(doc(db, "turmas/t0"), { nome: NOME, professorUid: r.localId, professorNome: "Prof", codigoDoDia: "4821", codigoDefinidoEm: Timestamp.now(), codigoDuracaoMin: 60 });
  const b = writeBatch(db); ["Ana", "Bruno", "Carla"].forEach((n, k) => b.set(doc(db, `turmas/t0/alunos/a${k}`), { nome: n })); await b.commit();
});
await migrarCodigos(env);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-proxy-server"] });
async function ctxFor(w) {
  const mobile = w < 640;
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 800 : 900 }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2, locale: "pt-BR" });
  await ctx.route("https://www.gstatic.com/firebasejs/10.13.2/**", (q) => q.fulfill({ body: readFileSync(`node_modules/firebase/${path.basename(new URL(q.request().url()).pathname)}`), contentType: "text/javascript" }));
  await ctx.route("https://cdn.tailwindcss.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: `document.addEventListener("DOMContentLoaded", () => { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "/tw.css"; document.head.appendChild(l); });` }));
  await ctx.route("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/qrcode-generator/qrcode.js") }));
  await ctx.route("https://cdn.jsdelivr.net/npm/lucide**", (q) => q.fulfill({ contentType: "text/javascript", body: readFileSync("node_modules/lucide/dist/umd/lucide.min.js") }));
  await ctx.route("https://cdnjs.cloudflare.com/**", (q) => q.fulfill({ contentType: "text/javascript", body: "" }));
  await ctx.route("https://fonts.googleapis.com/**", (q) => q.fulfill({ contentType: "text/css", body: "" }));
  return ctx;
}
for (const w of [360, 390, 1280]) {
  const ctx = await ctxFor(w); const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
  await page.goto(APP); await page.waitForSelector(".turma-card"); await page.waitForTimeout(500);
  await page.locator(".turma-card").first().click();
  await page.waitForSelector("#view-attendance:not(.hidden)"); await page.waitForTimeout(900);
  const m = await page.evaluate(() => {
    const h = document.getElementById("attendance-turma-name");
    const hs = getComputedStyle(h);
    return { nomeInteiro: h.scrollWidth <= h.clientWidth + 1 && hs.textOverflow !== "ellipsis", fonte: hs.fontSize, linhas: Math.round(h.getBoundingClientRect().height / parseFloat(hs.lineHeight)),
      topoCodigo: Math.round(document.getElementById("student-daily-code").getBoundingClientRect().top), altura: innerHeight,
      focoNoCodigo: document.activeElement && document.activeElement.id === "student-daily-code",
      statusETexto: document.getElementById("code-badge-label").textContent, mesmaLinha: Math.abs(document.getElementById("daily-code-status-badge").getBoundingClientRect().top - document.getElementById("current-date").getBoundingClientRect().top) < 12 };
  });
  check(`${w}px: nome da turma aparece inteiro (sem "…")`, m.nomeInteiro && (w < 640 ? m.fonte === "18px" : true), `fonte ${m.fonte}, ${m.linhas} linha(s)`);
  check(`${w}px: situação do código e data na mesma linha`, m.mesmaLinha && m.statusETexto === "Aguardando código");
  check(`${w}px: campo do código visível sem rolar`, m.topoCodigo + 50 < m.altura, `topo do campo em ${m.topoCodigo}px de ${m.altura}px`);
  if (w < 640) check(`${w}px: cursor já no campo do código`, m.focoNoCodigo);
  await page.screenshot({ path: `${OUT}/topo-aluno-${w}.png` });
  check(`${w}px: sem erros de JavaScript`, errs.length === 0, errs.join(";"));
  await ctx.close();
}
// professor pela Chamada
const ctx = await ctxFor(390); const page = await ctx.newPage();
await page.goto(APP + "#professor"); await page.waitForSelector("#teacher-gate-modal-backdrop:not(.hidden)");
await page.fill("#teacher-gate-email", "prof@ifsul.edu.br"); await page.fill("#teacher-gate-password", "senha-123456"); await page.click("#teacher-gate-submit");
await page.waitForSelector("#teacher-turmas-list > div"); await page.waitForTimeout(600);
await page.locator("#teacher-turmas-list > div").first().getByRole("button", { name: "Chamada" }).click();
await page.waitForSelector("#teacher-code-bar:not(.hidden)"); await page.waitForTimeout(600);
check("Professor (Chamada): selo \"Modo professor\" e \"Voltar às turmas\"", (await page.textContent("#code-badge-label")) === "Modo professor" && (await page.textContent("#btn-trocar-turma")).includes("Voltar às turmas"));
check("Professor (Chamada): foco NÃO vai para o código (lista liberada)", await page.evaluate(() => document.activeElement.id !== "student-daily-code"));
await page.screenshot({ path: `${OUT}/topo-professor-390.png` });
await ctx.close();
await browser.close(); server.close(); await env.cleanup();
const failed = results.filter((x) => !x).length;
console.log(`\n${results.length - failed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
