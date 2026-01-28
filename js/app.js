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
const pendingPaymentsListEl = document.getElementById('pendingPaymentsList');
const studentForm = document.getElementById('studentForm');
const studentModal = new bootstrap.Modal(document.getElementById('studentModal'));
let allStudents = [];

function initApp() {
    // Escuta mudanças em tempo real no Firestore
    const q = collection(db, "students");
    onSnapshot(q, (snapshot) => {
        allStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAll();
    });
}

function renderAll() {
    const searchTerm = document.getElementById('studentSearch').value.toLowerCase();
    const filtered = allStudents.filter(s => s.name.toLowerCase().includes(searchTerm));

    renderStudents(filtered);
    renderStats(allStudents);
    renderFinance(allStudents);
}

// 1. Dashboard Stats
function renderStats(students) {
    const active = students.filter(s => s.status === 'Ativo');
    const totalRevenue = active.reduce((sum, s) => sum + parseFloat(s.monthlyFee || 0), 0);

    document.getElementById('statActiveStudents').innerText = active.length;
    document.getElementById('statMonthlyRevenue').innerText = `R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
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
                            <strong>R$ ${parseFloat(student.monthlyFee).toFixed(2)}</strong>
                            <span class="text-muted ms-1">Venc: ${student.dueDate ? new Date(student.dueDate).toLocaleDateString('pt-BR') : 'N/A'}</span>
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

// 3. Render Finance (Pending)
function renderFinance(students) {
    pendingPaymentsListEl.innerHTML = '';
    const active = students.filter(s => s.status === 'Ativo');
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    active.forEach(student => {
        const isPaid = student.lastPaidMonth === currentMonth;

        if (!isPaid) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${student.name}</td>
                <td>Dia ${student.dueDate}</td>
                <td class="fw-bold">R$ ${parseFloat(student.monthlyFee).toFixed(2)}</td>
                <td>
                    <button class="btn btn-sm btn-success pay-btn" data-id="${student.id}">
                        <i class="bi bi-check-lg"></i> Pago
                    </button>
                </td>
            `;
            row.querySelector('.pay-btn').addEventListener('click', () => markAsPaid(student.id));
            pendingPaymentsListEl.appendChild(row);
        }
    });

    if (pendingPaymentsListEl.children.length === 0) {
        pendingPaymentsListEl.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Tudo em dia!</td></tr>';
    }
}

// --- CRUD OPERATIONS ---

// Add or Update
studentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('studentId').value;
    const data = {
        name: document.getElementById('studentName').value,
        phone: document.getElementById('studentPhone').value,
        monthlyFee: parseFloat(document.getElementById('studentFee').value),
        dueDate: parseInt(document.getElementById('studentDueDay').value),
        status: document.querySelector('input[name="status"]:checked').value,
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "students", id), data);
        } else {
            data.createdAt = serverTimestamp();
            data.lastPaidMonth = ""; // Inicia sem pagamento
            await addDoc(collection(db, "students"), data);
        }
        studentModal.hide();
        studentForm.reset();
    } catch (err) {
        alert("Erro ao salvar aluno: " + err.message);
    }
});

async function markAsPaid(id) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    await updateDoc(doc(db, "students", id), {
        lastPaidMonth: currentMonth
    });
}

function openEditModal(student) {
    document.getElementById('modalTitle').innerText = "Editar Aluno";
    document.getElementById('studentId').value = student.id;
    document.getElementById('studentName').value = student.name;
    document.getElementById('studentPhone').value = student.phone;
    document.getElementById('studentFee').value = student.monthlyFee;
    document.getElementById('studentDueDay').value = student.dueDate;

    if (student.status === 'Ativo') {
        document.getElementById('statusActive').checked = true;
    } else {
        document.getElementById('statusInactive').checked = true;
    }

    studentModal.show();
}

// Reset modal on close
document.getElementById('studentModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('modalTitle').innerText = "Cadastrar Aluno";
    document.getElementById('studentId').value = "";
    studentForm.reset();
});

// Search
document.getElementById('studentSearch').addEventListener('input', renderAll);
