import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, addDoc, getDocs, query, where, updateDoc, doc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- AUTH PROTECTION ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
    } else {
        initApp();
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = '../index.html');
});

// --- APP LOGIC ---
const studentsListEl = document.getElementById('studentsList');
const studentForm = document.getElementById('studentForm');
const studentModal = new bootstrap.Modal(document.getElementById('studentModal'));
let allStudents = [];
let allTransactions = [];

function initApp() {
    // Escuta Alunos
    onSnapshot(collection(db, "students"), (snapshot) => {
        allStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAll();
    });

    // Escuta Transações do mês atual para Alertas e Estatísticas
    const currentMonth = new Date().toISOString().substring(0, 7);
    const qTrans = query(collection(db, "transactions"), where("monthRef", "==", currentMonth));
    onSnapshot(qTrans, (snapshot) => {
        allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderFinancialStats();
        renderFinancialAlerts();
    });
}

function renderAll() {
    const searchTerm = document.getElementById('studentSearch').value.toLowerCase();
    const filtered = allStudents.filter(s => s.name.toLowerCase().includes(searchTerm));

    renderStudents(filtered);
    renderGeneralStats(allStudents);
}

// 1. Dashboard Stats
function renderGeneralStats(students) {
    const active = students.filter(s => s.status === 'Ativo');
    document.getElementById('statActiveStudents').innerText = active.length;
}

function renderFinancialStats() {
    let incomePlanned = 0;
    allTransactions.forEach(t => {
        if (t.type === 'fee' || t.type === 'income_extra') {
            incomePlanned += t.amount;
        }
    });
    document.getElementById('statMonthlyRevenue').innerText = `R$ ${incomePlanned.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

function renderFinancialAlerts() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = allTransactions.filter(t => t.status === 'pending' && t.dueDate.toDate() < today);

    const alertEl = document.getElementById('financialAlert');
    const msgEl = document.getElementById('alertMessage');

    if (overdue.length > 0) {
        alertEl.classList.remove('d-none');
        msgEl.innerText = `Atenção: Existem ${overdue.length} mensalidades ATRASADAS!`;
    } else {
        alertEl.classList.add('d-none');
    }
}

// 2. Render Student List
function renderStudents(students) {
    studentsListEl.innerHTML = '';

    if (students.length === 0) {
        studentsListEl.innerHTML = '<div class="col-12 text-center text-muted py-4">Nenhum aluno encontrado.</div>';
        return;
    }

    students.forEach(student => {
        const card = document.createElement('div');
        card.className = 'col-12 col-md-6 col-lg-4';
        const fee = parseFloat(student.monthlyFee || 0);
        card.innerHTML = `
            <div class="card border-0 shadow-sm h-100 student-card">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h6 class="card-title fw-bold mb-0">${student.name}</h6>
                        <span class="badge ${student.status === 'Ativo' ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-secondary'}">
                            ${student.status}
                        </span>
                    </div>
                    <p class="small text-muted mb-2"><i class="bi bi-telephone"></i> ${student.phone}</p>
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="small">
                            <strong>R$ ${fee.toFixed(2)}</strong>
                            <span class="text-muted ms-1">Dia ${student.dueDate || '--'}</span>
                        </div>
                        <div class="btn-group">
                            <a href="anamnese.html?id=${student.id}" class="btn btn-sm btn-outline-primary border">
                                <i class="bi bi-file-earmark-person"></i> Ficha
                            </a>
                            <button class="btn btn-sm btn-light border edit-btn" data-id="${student.id}">
                                <i class="bi bi-pencil"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        card.querySelector('.edit-btn').addEventListener('click', () => openEditModal(student));
        studentsListEl.appendChild(card);
    });
}

// --- CRUD OPERATIONS ---
studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('studentId').value;
    const data = {
        name: document.getElementById('studentName').value,
        phone: document.getElementById('studentPhone').value,
        monthlyFee: parseFloat(document.getElementById('studentFee').value),
        dueDate: document.getElementById('studentDueDay').value, // Salva como string YYYY-MM-DD
        status: document.querySelector('input[name="status"]:checked').value,
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "students", id), data);
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "students"), data);
        }
        studentModal.hide();
        studentForm.reset();
    } catch (err) {
        alert("Erro ao salvar aluno: " + err.message);
    }
});

function openEditModal(student) {
    document.getElementById('modalTitle').innerText = "Editar Aluno";
    document.getElementById('studentId').value = student.id;
    document.getElementById('studentName').value = student.name;
    document.getElementById('studentPhone').value = student.phone;
    document.getElementById('studentFee').value = student.monthlyFee;
    document.getElementById('studentDueDay').value = student.dueDate; // Agora carrega a string YYYY-MM-DD no input date

    if (student.status === 'Ativo') {
        document.getElementById('statusActive').checked = true;
    } else {
        document.getElementById('statusInactive').checked = true;
    }

    studentModal.show();
}

document.getElementById('studentModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('modalTitle').innerText = "Cadastrar Aluno";
    document.getElementById('studentId').value = "";
    studentForm.reset();
});

document.getElementById('studentSearch').addEventListener('input', renderAll);
