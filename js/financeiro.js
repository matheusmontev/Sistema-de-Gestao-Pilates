import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, query, where, onSnapshot, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- STATE ---
let currentMonth = new Date().toISOString().substring(0, 7); // YYYY-MM
let allTransactions = [];
let allStudents = [];

// --- UI ELEMENTS ---
const monthFilter = document.getElementById('monthFilter');
const feedbackToast = new bootstrap.Toast(document.getElementById('feedbackToast'));

// --- AUTH ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
    } else {
        init();
    }
});

async function init() {
    monthFilter.value = currentMonth;

    // 1. Initial Data Load
    await loadInitialData();

    // 2. Auto Automation (Fees and Recurring)
    await runAutomation();

    // 3. Listen for Changes
    setupListeners();

    // 4. Bind UI Events
    bindEvents();
}

async function loadInitialData() {
    const studentsSnap = await getDocs(collection(db, "students"));
    allStudents = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function setupListeners() {
    const q = query(collection(db, "transactions"), where("monthRef", "==", currentMonth));
    onSnapshot(q, (snapshot) => {
        allTransactions = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        renderAll();
    });
}

// --- AUTOMATION LOGIC ---
async function runAutomation() {
    console.log("Running financial automation...");
    const settingsRef = doc(db, "settings", "financial");
    const settingsSnap = await getDoc(settingsRef);
    const settings = settingsSnap.exists() ? settingsSnap.data() : { lastAutoGeneration: "" };

    if (settings.lastAutoGeneration !== currentMonth) {
        // A) Generate Student Fees
        const activeStudents = allStudents.filter(s => s.status === 'Ativo');
        const batchPromises = activeStudents.map(async (student) => {
            // Check if already exists for this month to avoid duplicates
            const q = query(collection(db, "transactions"),
                where("studentId", "==", student.id),
                where("monthRef", "==", currentMonth),
                where("type", "==", "fee"));
            const existing = await getDocs(q);

            if (existing.empty) {
                const [year, month] = currentMonth.split('-');
                let day = 10;
                if (student.dueDate) {
                    // Extrai o dia da string YYYY-MM-DD
                    const dateParts = student.dueDate.split('-');
                    day = parseInt(dateParts[2]) || 10;
                }
                const dueDate = new Date(year, month - 1, day);

                await addDoc(collection(db, "transactions"), {
                    type: "fee",
                    category: "Mensalidade",
                    description: `Mensalidade - ${student.name}`,
                    amount: parseFloat(student.monthlyFee || 0), // Corrigido: era student.fee
                    dueDate: Timestamp.fromDate(dueDate),
                    paymentDate: null,
                    status: "pending",
                    studentId: student.id,
                    monthRef: currentMonth,
                    createdAt: serverTimestamp()
                });
            }
        });

        // B) Recurring Expenses
        // Find expenses from PREVIOUS month marked as recurring
        const [y, m] = currentMonth.split('-').map(Number);
        const prevMonthDate = new Date(y, m - 2, 1);
        const prevMonthRef = prevMonthDate.toISOString().substring(0, 7);

        const data = {
            type: document.getElementById('expenseRecurring').checked ? 'expense_fixed' : 'expense_variable',
            description: document.getElementById('expenseDesc').value,
            amount: parseFloat(document.getElementById('expenseAmount').value),
            dueDate: Timestamp.fromDate(new Date(document.getElementById('expenseDueDate').value + "T00:00:00")),
            monthRef: currentMonth,
            status: "pending",
            isRecurring: document.getElementById('expenseRecurring').checked,
            createdAt: serverTimestamp()
        };
        const prevExpQuery = query(collection(db, "transactions"),
            where("monthRef", "==", prevMonthRef),
            where("isRecurring", "==", true));
        const prevExpSnap = await getDocs(prevExpQuery);

        batchPromises.push(...prevExpSnap.docs.map(async (d) => {
            const data = d.data();
            // Check if already exists in current month
            const qCheck = query(collection(db, "transactions"),
                where("description", "==", data.description),
                where("monthRef", "==", currentMonth));
            const existCheck = await getDocs(qCheck);

            if (existCheck.empty) {
                const newDueDate = new Date(data.dueDate.toDate());
                newDueDate.setMonth(newDueDate.getMonth() + 1);

                await addDoc(collection(db, "transactions"), {
                    ...data,
                    dueDate: Timestamp.fromDate(newDueDate),
                    paymentDate: null,
                    status: "pending",
                    monthRef: currentMonth,
                    createdAt: serverTimestamp()
                });
            }
        }));

        await Promise.all(batchPromises);
        await setDoc(settingsRef, { lastAutoGeneration: currentMonth }, { merge: true });
        console.log("Automation complete for " + currentMonth);
    }
}

// --- RENDER FUNCTIONS ---
function renderAll() {
    renderStats();
    renderAlerts();
    renderFees();
    renderExpenses();
    renderOtherIncomes();
}

function renderStats() {
    let incomePlanned = 0, incomePaid = 0;
    let expensePlanned = 0, expensePaid = 0;

    allTransactions.forEach(t => {
        if (t.type === 'fee' || t.type === 'income_extra') {
            incomePlanned += t.amount;
            if (t.status === 'paid') incomePaid += t.amount;
        } else {
            expensePlanned += t.amount;
            if (t.status === 'paid') expensePaid += t.amount;
        }
    });

    document.getElementById('totalIncome').innerText = formatCurrency(incomePlanned);
    document.getElementById('paidIncome').innerText = formatCurrency(incomePaid);
    document.getElementById('pendingIncome').innerText = formatCurrency(incomePlanned - incomePaid);

    document.getElementById('totalExpense').innerText = formatCurrency(expensePlanned);
    document.getElementById('paidExpense').innerText = formatCurrency(expensePaid);
    document.getElementById('pendingExpense').innerText = formatCurrency(expensePlanned - expensePaid);

    document.getElementById('netBalance').innerText = formatCurrency(incomePlanned - expensePlanned);
    document.getElementById('realBalance').innerText = formatCurrency(incomePaid - expensePaid);
}

function renderAlerts() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = allTransactions.filter(t => t.status === 'pending' && t.dueDate.toDate() < today);
    const expiresToday = allTransactions.filter(t => t.status === 'pending' && isSameDay(t.dueDate.toDate(), today));

    const container = document.getElementById('alertsContainer');
    const list = document.getElementById('alertsList');
    list.innerHTML = '';

    if (overdue.length > 0 || expiresToday.length > 0) {
        container.classList.remove('d-none');
        if (overdue.length > 0) {
            const sum = overdue.reduce((a, b) => a + b.amount, 0);
            list.innerHTML += `<div class="mb-1 text-danger">⚠️ <strong>${overdue.length}</strong> itens ATRASADOS - Total: ${formatCurrency(sum)}</div>`;
        }
        if (expiresToday.length > 0) {
            list.innerHTML += `<div class="text-warning-emphasis">⏳ <strong>${expiresToday.length}</strong> itens vencem HOJE.</div>`;
        }
    } else {
        container.classList.add('d-none');
    }
}

function renderFees() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const fees = allTransactions.filter(t => t.type === 'fee');

    const groups = {
        overdue: fees.filter(t => t.status === 'pending' && t.dueDate.toDate() < today),
        today: fees.filter(t => t.status === 'pending' && isSameDay(t.dueDate.toDate(), today)),
        pending: fees.filter(t => t.status === 'pending' && t.dueDate.toDate() > today),
        paid: fees.filter(t => t.status === 'paid')
    };

    renderGroup('listOverdue', groups.overdue, 'overdue');
    renderGroup('listToday', groups.today, 'today');
    renderGroup('listPending', groups.pending, 'pending');
    renderGroup('listPaid', groups.paid, 'paid');

    document.getElementById('countOverdue').innerText = groups.overdue.length;
    document.getElementById('countToday').innerText = groups.today.length;
    document.getElementById('countPending').innerText = groups.pending.length;
    document.getElementById('countPaid').innerText = groups.paid.length;
}

function renderGroup(containerId, list, state) {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    if (list.length === 0) {
        el.innerHTML = `<div class="py-2 text-muted small">Nenhum item</div>`;
        return;
    }

    list.forEach(t => {
        const item = document.createElement('div');
        item.className = `list-group-item transaction-item status-${state}`;

        let actions = '';
        if (t.status === 'pending') {
            actions = `<button class="btn btn-sm btn-success px-3" onclick="confirmPayment('${t.id}')">Pagar</button>`;
        } else {
            actions = `<small class="text-success fw-bold"><i class="bi bi-check-all"></i> Pago em ${t.paymentDate.toDate().toLocaleDateString('pt-BR')}</small>`;
        }

        let delayText = '';
        if (state === 'overdue') {
            const diff = Math.floor((new Date() - t.dueDate.toDate()) / (1000 * 60 * 60 * 24));
            delayText = `<span class="badge bg-danger rounded-pill">${diff} dias de atraso</span>`;
        } else if (state === 'today') {
            delayText = `<span class="badge bg-warning text-dark rounded-pill">Vence Hoje</span>`;
        }

        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="fw-bold">${t.description} ${delayText}</div>
                    <div class="small text-muted">${formatCurrency(t.amount)} | Venc: ${t.dueDate.toDate().toLocaleDateString('pt-BR')}</div>
                </div>
                <div>${actions}</div>
            </div>
        `;
        el.appendChild(item);
    });
}

function renderExpenses() {
    const list = document.getElementById('listExpenses');
    list.innerHTML = '';
    const expenses = allTransactions.filter(t => t.type === 'expense_fixed' || t.type === 'expense_variable');

    if (expenses.length === 0) {
        list.innerHTML = `<div class="text-center py-4 text-muted">Nenhuma despesa cadastrada.</div>`;
        return;
    }

    expenses.forEach(t => {
        const item = document.createElement('div');
        const state = t.status === 'paid' ? 'paid' : (t.dueDate.toDate() < new Date() ? 'overdue' : 'pending');
        item.className = `list-group-item transaction-item status-${state}`;

        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="fw-bold">${t.isRecurring ? '<i class="bi bi-arrow-repeat text-primary" title="Recorrente"></i> ' : ''}${t.description}</div>
                    <div class="small text-muted">${formatCurrency(t.amount)} | Venc: ${t.dueDate.toDate().toLocaleDateString('pt-BR')}</div>
                </div>
                <div class="d-flex gap-2">
                    ${t.status === 'pending' ? `<button class="btn btn-sm btn-outline-danger" onclick="confirmPayment('${t.id}')">Pagar</button>` : '<span class="text-success small fw-bold">PAGO</span>'}
                    <button class="btn btn-sm btn-light text-danger" onclick="deleteTransaction('${t.id}')"><i class="bi bi-trash"></i></button>
                </div>
            </div>
        `;
        list.appendChild(item);
    });
}

function renderOtherIncomes() {
    const list = document.getElementById('listOtherIncomes');
    list.innerHTML = '';
    const incomes = allTransactions.filter(t => t.type === 'income_extra');

    if (incomes.length === 0) {
        list.innerHTML = `<div class="text-center py-4 text-muted">Nenhuma entrada extra.</div>`;
        return;
    }

    incomes.forEach(t => {
        const item = document.createElement('div');
        item.className = `list-group-item transaction-item status-paid`;
        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="fw-bold">${t.description}</div>
                    <div class="small text-muted">${formatCurrency(t.amount)} | Data: ${t.dueDate.toDate().toLocaleDateString('pt-BR')}</div>
                </div>
                <button class="btn btn-sm btn-light text-danger" onclick="deleteTransaction('${t.id}')"><i class="bi bi-trash"></i></button>
            </div>
        `;
        list.appendChild(item);
    });
}

// --- ACTIONS ---
window.confirmPayment = async (id) => {
    if (!confirm("Confirmar recebimento/pagamento deste item?")) return;
    try {
        await updateDoc(doc(db, "transactions", id), {
            status: "paid",
            paymentDate: serverTimestamp()
        });
        showToast("Pagamento registrado!");
    } catch (err) {
        showToast("Erro: " + err.message, "danger");
    }
};

window.deleteTransaction = async (id) => {
    if (!confirm("Excluir este lançamento permanentemente?")) return;
    try {
        // We use the firestore delete method directly injected or via a deleteDoc import
        const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        await deleteDoc(doc(db, "transactions", id));
        showToast("Excluído com sucesso.");
    } catch (err) {
        showToast("Erro: " + err.message, "danger");
    }
};

// --- FORM HANDLING ---
document.getElementById('expenseForm').onsubmit = async (e) => {
    e.preventDefault();
    const kind = document.getElementById('expenseKind').value;
    const data = {
        type: kind === 'fixed' ? 'expense_fixed' : 'expense_variable',
        description: document.getElementById('expenseDesc').value,
        amount: parseFloat(document.getElementById('expenseAmount').value),
        dueDate: Timestamp.fromDate(new Date(document.getElementById('expenseDueDate').value + "T00:00:00")),
        monthRef: currentMonth,
        status: "pending",
        isRecurring: document.getElementById('expenseRecurring').checked,
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "transactions"), data);
        bootstrap.Modal.getInstance(document.getElementById('expenseModal')).hide();
        e.target.reset();
        showToast("Despesa adicionada!");
    } catch (err) {
        showToast("Erro: " + err.message, "danger");
    }
};

document.getElementById('incomeForm').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        type: "income_extra",
        description: document.getElementById('incomeDesc').value,
        amount: parseFloat(document.getElementById('incomeAmount').value),
        dueDate: Timestamp.fromDate(new Date(document.getElementById('incomeDate').value + "T00:00:00")),
        paymentDate: serverTimestamp(),
        monthRef: currentMonth,
        status: "paid",
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "transactions"), data);
        bootstrap.Modal.getInstance(document.getElementById('incomeModal')).hide();
        e.target.reset();
        showToast("Entrada registrada!");
    } catch (err) {
        showToast("Erro: " + err.message, "danger");
    }
};

// --- HELPERS ---
function bindEvents() {
    monthFilter.onchange = (e) => {
        currentMonth = e.target.value;
        setupListeners();
        runAutomation(); // Check if month changed requires new fees
    };

    document.getElementById('prevMonth').onclick = () => {
        const [y, m] = currentMonth.split('-').map(Number);
        const d = new Date(y, m - 2, 1);
        currentMonth = d.toISOString().substring(0, 7);
        monthFilter.value = currentMonth;
        monthFilter.dispatchEvent(new Event('change'));
    };

    document.getElementById('nextMonth').onclick = () => {
        const [y, m] = currentMonth.split('-').map(Number);
        const d = new Date(y, m, 1);
        currentMonth = d.toISOString().substring(0, 7);
        monthFilter.value = currentMonth;
        monthFilter.dispatchEvent(new Event('change'));
    };

    document.getElementById('syncFeesBtn').onclick = () => {
        loadInitialData().then(() => {
            // Force clear the lastAutoGeneration to rerun automation for current month
            setDoc(doc(db, "settings", "financial"), { lastAutoGeneration: "" }, { merge: true })
                .then(() => runAutomation());
        });
    };
}

window.setExpenseType = (type) => {
    const title = document.getElementById('expenseModalTitle');
    const recurring = document.getElementById('recurringDiv');
    const kind = document.getElementById('expenseKind');

    // Sempre mostrar a opção de recorrência (Fixa)
    recurring.classList.remove('d-none');

    if (type === 'fixed') {
        title.innerText = "Nova Despesa Fixa";
        document.getElementById('expenseRecurring').checked = true;
        kind.value = 'fixed';
    } else {
        title.innerText = "Nova Despesa";
        document.getElementById('expenseRecurring').checked = false;
        kind.value = 'variable';
    }
};

function formatCurrency(val) {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();
}

function showToast(msg, type = "success") {
    document.getElementById('feedbackMessage').innerText = msg;
    const toastEl = document.getElementById('feedbackToast');
    toastEl.className = `toast align-items-center text-white border-0 bg-${type}`;
    feedbackToast.show();
}
