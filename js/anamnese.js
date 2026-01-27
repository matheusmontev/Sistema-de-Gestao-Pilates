import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    doc, getDoc, setDoc, updateDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const urlParams = new URLSearchParams(window.location.search);
const studentId = urlParams.get('id');

const anamneseForm = document.getElementById('anamneseForm');
const successToast = new bootstrap.Toast(document.getElementById('successToast'));

// --- AUTH PROTECTION ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else if (studentId) {
        loadData();
    } else {
        alert("ID de aluno não fornecido.");
        window.location.href = 'dashboard.html';
    }
});

async function loadData() {
    try {
        // Load direct student data (name/phone)
        const studentDoc = await getDoc(doc(db, "students", studentId));
        if (studentDoc.exists()) {
            const student = studentDoc.data();
            document.getElementById('displayStudentName').innerText = student.name;
            document.getElementById('displayStudentPhone').innerText = student.phone;
        } else {
            alert("Aluno não encontrado.");
            window.location.href = 'dashboard.html';
            return;
        }

        // Load anamnese data
        const anamneseDoc = await getDoc(doc(db, "anamnesis", studentId));
        if (anamneseDoc.exists()) {
            const data = anamneseDoc.data();

            // Fill basics
            document.getElementById('ocupacao').value = data.ocupacao || "";
            document.getElementById('endereco').value = data.endereco || "";
            document.getElementById('diagnosticoClinico').value = data.diagnosticoClinico || "";
            document.getElementById('dataQueixa').value = data.dataQueixa || "";
            document.getElementById('queixaPrincipal').value = data.queixaPrincipal || "";
            document.getElementById('hda').value = data.hda || "";
            document.getElementById('outrasPatologias').value = data.outrasPatologias || "";
            document.getElementById('medicamentos').value = data.medicamentos || "";
            document.getElementById('exames').value = data.exames || "";
            document.getElementById('exameFisico').value = data.exameFisico || "";
            document.getElementById('objetivosTratamento').value = data.objetivosTratamento || "";
            document.getElementById('planoTratamento').value = data.planoTratamento || "";

            // Radio
            if (data.dependencia) {
                const radio = document.querySelector(`input[name="dependencia"][value="${data.dependencia}"]`);
                if (radio) radio.checked = true;
            }

            // Checkboxes
            if (data.patologias && Array.isArray(data.patologias)) {
                if (data.patologias.includes("Cardiopatia")) document.getElementById('patCardiopatia').checked = true;
                if (data.patologias.includes("HAS (Hipertensão)")) document.getElementById('patHas').checked = true;
                if (data.patologias.includes("DM (Diabetes)")) document.getElementById('patDm').checked = true;
            }
        }
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

anamneseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Salvando...';

    const patologias = [];
    if (document.getElementById('patCardiopatia').checked) patologias.push("Cardiopatia");
    if (document.getElementById('patHas').checked) patologias.push("HAS (Hipertensão)");
    if (document.getElementById('patDm').checked) patologias.push("DM (Diabetes)");

    const data = {
        studentId: studentId,
        ocupacao: document.getElementById('ocupacao').value,
        endereco: document.getElementById('endereco').value,
        diagnosticoClinico: document.getElementById('diagnosticoClinico').value,
        dependencia: document.querySelector('input[name="dependencia"]:checked').value,
        dataQueixa: document.getElementById('dataQueixa').value,
        queixaPrincipal: document.getElementById('queixaPrincipal').value,
        hda: document.getElementById('hda').value,
        patologias: patologias,
        outrasPatologias: document.getElementById('outrasPatologias').value,
        medicamentos: document.getElementById('medicamentos').value,
        exames: document.getElementById('exames').value,
        exameFisico: document.getElementById('exameFisico').value,
        objetivosTratamento: document.getElementById('objetivosTratamento').value,
        planoTratamento: document.getElementById('planoTratamento').value,
        updatedAt: serverTimestamp()
    };

    try {
        await setDoc(doc(db, "anamnesis", studentId), data, { merge: true });
        successToast.show();
    } catch (err) {
        alert("Erro ao salvar ficha: " + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-save"></i> Salvar Ficha';
    }
});
