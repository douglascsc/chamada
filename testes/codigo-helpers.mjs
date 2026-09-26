// O código do dia não fica mais na turma (pública): ele é o ID do documento
// turmas/{id}/salas/{código}, com a lista de nomes para os alunos.
// migrarCodigos(): converte as turmas semeadas no formato antigo
// ({ codigoDoDia: "4821", ... }) para o formato novo, como o professor
// faria ao gerar o código (inclui o código nas presenças de hoje já
// semeadas, que representam alunos que marcaram com ele).
import { doc, getDocs, setDoc, updateDoc, collection, deleteField, getDoc } from "firebase/firestore";

const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

export async function migrarCodigos(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const f = c.firestore();
    const turmas = await getDocs(collection(f, "turmas"));
    for (const t of turmas.docs) {
      const d = t.data();
      if (!d.codigoDoDia) continue;
      const alunos = await getDocs(collection(f, "turmas", t.id, "alunos"));
      await setDoc(doc(f, "turmas", t.id, "salas", d.codigoDoDia), {
        nomes: [...new Set(alunos.docs.map((a) => a.data().nome))].sort(),
        definidoEm: d.codigoDefinidoEm
      });
      const presencas = await getDocs(collection(f, "turmas", t.id, "presencas"));
      for (const p of presencas.docs) {
        const pd = p.data();
        if (pd.data === hojeSP() && !pd.codigoUsado) await updateDoc(p.ref, { codigoUsado: d.codigoDoDia });
      }
      await updateDoc(t.ref, { codigoDoDia: deleteField() });
    }
  });
}

// Código atual da turma ("" se não houver)
export async function codigoAtual(env, turmaId) {
  let out = "";
  await env.withSecurityRulesDisabled(async (c) => {
    const f = c.firestore();
    const t = (await getDoc(doc(f, "turmas", turmaId))).data();
    if (!t || !t.codigoDefinidoEm) return;
    const salas = await getDocs(collection(f, "turmas", turmaId, "salas"));
    const s = salas.docs.find((d) => d.data().definidoEm && d.data().definidoEm.toMillis() === t.codigoDefinidoEm.toMillis());
    out = s ? s.id : "";
  });
  return out;
}
