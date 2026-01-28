import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, doc, getDoc, setDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- STATE ---
let allStudents = [];
let scheduleTimes = ["07:00", "08:00", "09:00", "10:00", "16:00", "17:00", "18:00", "19:00"]; // Default
let currentSelectedClass = null; // { day: 'Segunda', time: '08:00' }

const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const dayMap = { "Segunda": 0, "Terça": 1, "Quarta": 2, "Quinta": 3, "Sexta": 4, "Sábado": 5, "Domingo": 6 };

// --- UI ELEMENTS ---
const scheduleBody = document.getElementById('scheduleBody');
const classDetailsModal = new bootstrap.Modal(document.getElementById('classDetailsModal'));
const addStudentModal = new bootstrap.Modal(document.getElementById('addStudentModal'));
const feedbackToast = new bootstrap.Toast(document.getElementById('feedbackToast'));
const feedbackEl = document.getElementById('feedbackToast');

// --- AUTH ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'index.html';
    } else {
        init();
    }
});

async function init() {
    // 1. Load Settings (Times)
    const settingsRef = doc(db, "settings", "schedule");

    // Listener for Settings
    onSnapshot(settingsRef, (docSnap) => {
        if (docSnap.exists() && docSnap.data().times) {
            scheduleTimes = docSnap.data().times.sort();
        } else {
            // First run, create default
            setDoc(settingsRef, { times: scheduleTimes });
        }
        renderGrid(); // Re-render grid when times change
        renderTimesConfig();
    });

    // 2. Load Students
    const studentsRef = collection(db, "students");
    onSnapshot(studentsRef, (snapshot) => {
        allStudents = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        console.log("Students loaded:", allStudents.length); // Debug
        renderGrid(); // Re-render grid when students change
        if (currentSelectedClass) {
            updateDetailsModal(currentSelectedClass.day, currentSelectedClass.time); // Live update modal if open
        }
    });
}

// --- RENDER GRID ---
function renderGrid() {
    scheduleBody.innerHTML = '';

    scheduleTimes.forEach(time => {
        const tr = document.createElement('tr');

        // Sticky Time Column
        const th = document.createElement('th');
        th.className = 'sticky-col text-center align-middle bg-white';
        th.textContent = time;
        tr.appendChild(th);

        days.forEach(day => {
            const td = document.createElement('td');
            td.className = 'p-1'; // Tight padding

            // Calculate Occupancy
            const classId = `${day}_${time}`;
            const studentsInClass = allStudents.filter(s => s.turmas && s.turmas.includes(classId));
            const count = studentsInClass.length;

            // Determine Status Color
            let statusClass = 'status-low'; // Green
            if (count >= 4 && count < 6) statusClass = 'status-med'; // Yellow
            if (count >= 6) statusClass = 'status-full'; // Red

            const cellDiv = document.createElement('div');
            cellDiv.className = `class-cell rounded d-flex justify-content-center align-items-center ${statusClass}`;
            cellDiv.textContent = `${count}/6`;
            cellDiv.onclick = () => openClassDetails(day, time);

            if (day === "Domingo" && count === 0) {
                // Dim down empty Sundays visually if desired, or keep uniform
                cellDiv.style.opacity = "0.5";
            }

            td.appendChild(cellDiv);
            tr.appendChild(td);
        });

        scheduleBody.appendChild(tr);
    });
}

// --- CLASS DETAILS MODAL ---
function openClassDetails(day, time) {
    currentSelectedClass = { day, time };
    updateDetailsModal(day, time);
    classDetailsModal.show();
}

function updateDetailsModal(day, time) {
    const classId = `${day}_${time}`;
    const studentsInClass = allStudents.filter(s => s.turmas && s.turmas.includes(classId));

    document.getElementById('classDetailsTitle').innerText = `${day} às ${time}`;
    document.getElementById('classOccupancy').innerText = `${studentsInClass.length}/6`;

    const list = document.getElementById('classStudentsList');
    list.innerHTML = '';

    if (studentsInClass.length === 0) {
        list.innerHTML = '<li class="list-group-item text-center text-muted">Turma vazia</li>';
    } else {
        studentsInClass.forEach(s => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <span>${s.name}</span>
                <button class="btn btn-sm btn-outline-danger border-0 remove-student-btn">
                    <i class="bi bi-trash"></i>
                </button>
            `;
            li.querySelector('.remove-student-btn').onclick = () => removeStudentFromClass(s.id, classId);
            list.appendChild(li);
        });
    }

    // Disable "Add" button if full
    const addBtn = document.getElementById('btnAddStudentToClass');
    if (studentsInClass.length >= 6) {
        addBtn.disabled = true;
        addBtn.innerText = "Turma Lotada";
        addBtn.classList.remove('btn-success');
        addBtn.classList.add('btn-secondary');
    } else {
        addBtn.disabled = false;
        addBtn.innerText = "Adicionar Aluno";
        addBtn.classList.remove('btn-secondary');
        addBtn.classList.add('btn-success');
        addBtn.onclick = () => openAddStudentModal(day, time); // Pass context
    }
}

// --- ADD STUDENT TO CLASS ---
function openAddStudentModal(day, time) {
    const classId = `${day}_${time}`;
    const searchInput = document.getElementById('searchStudentInput');
    const list = document.getElementById('availableStudentsList');

    // Reset defaults
    searchInput.value = '';
    renderStudentListForAdd(classId, '');

    // Focus on search
    setTimeout(() => searchInput.focus(), 500);

    // Filter Logic
    searchInput.oninput = (e) => renderStudentListForAdd(classId, e.target.value.toLowerCase());

    addStudentModal.show();
}

function renderStudentListForAdd(classId, filterTerm) {
    const list = document.getElementById('availableStudentsList');
    list.innerHTML = '';

    // Relaxed filter: Show if status is not explicitly 'Inativo' (case insensitive) or if status is missing
    const activeStudents = allStudents.filter(s => !s.status || s.status.toLowerCase() !== 'inativo');

    if (activeStudents.length === 0) {
        list.innerHTML = '<div class="text-center text-muted p-3">Nenhum aluno disponível.</div>';
        return;
    }

    // Sort: Available first, then by name
    activeStudents.sort((a, b) => {
        const countA = a.turmas ? a.turmas.length : 0;
        const countB = b.turmas ? b.turmas.length : 0;
        if (countA === countB) return a.name.localeCompare(b.name);
        return countA - countB;
    });

    activeStudents.forEach(s => {
        if (filterTerm && !s.name.toLowerCase().includes(filterTerm)) return;

        const turmas = s.turmas || [];
        const count = turmas.length;
        const alreadyInClass = turmas.includes(classId);
        const isFull = count >= 2;

        let statusBadge = '';
        let isDisabled = false;
        let clickAction = null;

        if (alreadyInClass) {
            statusBadge = '<span class="badge bg-info">Nesta turma</span>';
            isDisabled = true;
        } else if (isFull) {
            statusBadge = '<span class="badge bg-secondary">2/2 Turmas</span>';
            isDisabled = true;
        } else {
            statusBadge = `<span class="badge bg-success">${count}/2</span>`;
            clickAction = () => addStudentToClass(s.id, classId);
        }

        const item = document.createElement('button');
        item.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center student-item ${isDisabled ? 'disabled' : ''}`;
        if (!isDisabled) item.onclick = clickAction;

        item.innerHTML = `
            <span>${s.name}</span>
            ${statusBadge}
        `;
        list.appendChild(item);
    });
}

// --- ACTIONS (FIRESTORE) ---
async function addStudentToClass(studentId, classId) {
    try {
        const studentRef = doc(db, "students", studentId);
        /* 
           Firestore check is good, but client-side check also helps speed.
           We assume the UI prevented invalid clicks, but data integrity 
           should be checked via Security Rules or Cloud Functions in Prod. 
           For this MVP, we proceed directly.
        */
        await updateDoc(studentRef, {
            turmas: arrayUnion(classId)
        });

        showToast("Aluno adicionado com sucesso!", "success");
        addStudentModal.hide(); // Close add modal
        // Class details modal will auto-update due to snapshot listener
    } catch (err) {
        showToast("Erro ao adicionar: " + err.message, "danger");
    }
}

async function removeStudentFromClass(studentId, classId) {
    if (!confirm("Remover aluno desta turma?")) return;

    try {
        const studentRef = doc(db, "students", studentId);
        await updateDoc(studentRef, {
            turmas: arrayRemove(classId)
        });
        showToast("Aluno removido.", "success");
    } catch (err) {
        showToast("Erro ao remover: " + err.message, "danger");
    }
}

// --- SETTINGS (TIMES) ---
const timesListEl = document.getElementById('timesList');
const newTimeInput = document.getElementById('newTimeInput');

function renderTimesConfig() {
    timesListEl.innerHTML = '';
    scheduleTimes.forEach(time => {
        const li = document.createElement('li');
        li.className = "list-group-item d-flex justify-content-between align-items-center";
        li.innerHTML = `
            ${time}
            <button class="btn btn-sm btn-outline-danger remove-time-btn"><i class="bi bi-trash"></i></button>
        `;
        li.querySelector('.remove-time-btn').onclick = () => {
            const newTimes = scheduleTimes.filter(t => t !== time);
            saveTimes(newTimes);
        };
        timesListEl.appendChild(li);
    });
}

document.getElementById('addTimeBtn').onclick = () => {
    const val = newTimeInput.value;
    if (val && !scheduleTimes.includes(val)) {
        const newTimes = [...scheduleTimes, val].sort();
        saveTimes(newTimes);
        newTimeInput.value = '';
    }
};

async function saveTimes(newTimesArray) {
    await setDoc(doc(db, "settings", "schedule"), { times: newTimesArray });
}

// --- UTILS ---
function showToast(msg, type = "success") {
    document.getElementById('feedbackMessage').innerText = msg;
    feedbackEl.className = `toast align-items-center border-0 text-white bg-${type}`;
    feedbackToast.show();
}

// Global exposure for debugging
window.allStudents = allStudents;
