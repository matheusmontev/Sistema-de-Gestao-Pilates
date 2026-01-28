import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- STATE ---
let currentDay = 'segunda';
let dayWorkout = { exercises: [] };
let allLibraryExercises = [];
let selectedLibEx = null; // For modal config
let editIndex = -1; // For editing exercise already in workout

const daysMap = {
    'segunda': 'Segunda-feira',
    'terca': 'Terça-feira',
    'quarta': 'Quarta-feira',
    'quinta': 'Quinta-feira',
    'sexta': 'Sexta-feira',
    'sabado': 'Sábado',
    'domingo': 'Domingo'
};

// --- UI ELEMENTS ---
const workoutList = document.getElementById('workoutList');
const libraryList = document.getElementById('libraryList');
const selectExerciseModal = new bootstrap.Modal(document.getElementById('selectExerciseModal'));
const configExerciseModal = new bootstrap.Modal(document.getElementById('configExerciseModal'));
const configForm = document.getElementById('configExerciseForm');
const feedbackToast = new bootstrap.Toast(document.getElementById('feedbackToast'));
const feedbackEl = document.getElementById('feedbackToast');

// --- AUTH & INIT ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
    } else {
        init();
    }
});

function init() {
    // 1. Load Library once
    onSnapshot(collection(db, "exercises"), (snap) => {
        allLibraryExercises = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderLibrary();
    });

    // 2. Setup Day Selectors
    document.querySelectorAll('.day-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelector('.day-btn.active').classList.remove('active');
            btn.classList.add('active');
            currentDay = btn.dataset.day;
            loadDayWorkout();
        };
    });

    // 3. Initial Load
    loadDayWorkout();

    // 4. Modal listeners
    document.getElementById('addExerciseBtn').onclick = () => selectExerciseModal.show();
    document.getElementById('libSearch').oninput = renderLibrary;
    document.getElementById('startClassBtn').onclick = () => {
        window.location.href = `aula.html?day=${currentDay}`;
    };
}

// --- DATA LOADING ---
function loadDayWorkout() {
    document.getElementById('currentDayTitle').innerText = `Treino de ${daysMap[currentDay]}`;
    workoutList.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';

    const docRef = doc(db, "workouts", currentDay);

    // Listener for real-time update of specific day
    onSnapshot(docRef, (docSnap) => {
        if (docSnap.exists()) {
            dayWorkout = docSnap.data();
            const lastUpd = dayWorkout.updatedAt ? dayWorkout.updatedAt.toDate().toLocaleString('pt-BR') : '--/--/---- --:--';
            document.getElementById('lastUpdated').innerText = `Última atualização: ${lastUpd}`;
        } else {
            dayWorkout = { exercises: [] };
            document.getElementById('lastUpdated').innerText = 'Nenhum treino definido';
        }
        renderWorkout();
    });
}

// --- RENDER WORKOUT ---
function renderWorkout() {
    workoutList.innerHTML = '';
    const items = dayWorkout.exercises || [];

    if (items.length === 0) {
        workoutList.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-calendar-x fs-1 d-block mb-2"></i>
                Nenhum exercício para este dia.
            </div>`;
        return;
    }

    items.forEach((ex, index) => {
        const hasPhoto = ex.photoUrl && ex.photoUrl.trim() !== '';
        const card = document.createElement('div');
        card.className = 'card workout-exercise-card shadow-sm p-3';
        card.innerHTML = `
            <div class="d-flex align-items-center gap-3">
                <div class="reorder-btns no-print">
                    <button class="btn btn-sm btn-light up-btn" ${index === 0 ? 'disabled' : ''}><i class="bi bi-chevron-up"></i></button>
                    <button class="btn btn-sm btn-light down-btn" ${index === items.length - 1 ? 'disabled' : ''}><i class="bi bi-chevron-down"></i></button>
                </div>
                
                <div class="flex-shrink-0">
                    ${hasPhoto
                ? `<img src="${ex.photoUrl}" class="exercise-thumb" alt="${ex.name}">`
                : `<div class="exercise-thumb d-flex align-items-center justify-content-center bg-light text-muted"><i class="bi bi-image"></i></div>`
            }
                </div>

                <div class="flex-grow-1">
                    <h5 class="mb-1 fw-bold">${index + 1}. ${ex.name}</h5>
                    <div class="d-flex gap-3 small text-muted">
                        <span><i class="bi bi-arrow-repeat"></i> <strong>${ex.sets}</strong> séries</span>
                        <span><i class="bi bi-hash"></i> <strong>${ex.reps}</strong> reps</span>
                        <span><i class="bi bi-hourglass-split"></i> <strong>${ex.restSeconds}s</strong> desc.</span>
                    </div>
                </div>

                <div class="d-flex gap-2">
                    <button class="btn btn-sm btn-outline-primary edit-ex-btn"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-outline-danger remove-ex-btn"><i class="bi bi-trash"></i></button>
                </div>
            </div>
        `;

        // Actions
        card.querySelector('.up-btn').onclick = () => moveExercise(index, -1);
        card.querySelector('.down-btn').onclick = () => moveExercise(index, 1);
        card.querySelector('.edit-ex-btn').onclick = () => openEditExercise(index);
        card.querySelector('.remove-ex-btn').onclick = () => removeExercise(index);

        workoutList.appendChild(card);
    });
}

// --- RENDER LIBRARY (MODAL) ---
function renderLibrary() {
    libraryList.innerHTML = '';
    const search = document.getElementById('libSearch').value.toLowerCase();

    const filtered = allLibraryExercises.filter(ex => ex.name.toLowerCase().includes(search));

    filtered.forEach(ex => {
        const item = document.createElement('button');
        item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center py-3';
        item.innerHTML = `
            <div>
                <strong class="d-block">${ex.name}</strong>
                <small class="text-muted">${ex.category}</small>
            </div>
            <i class="bi bi-plus-circle text-primary fs-5"></i>
        `;
        item.onclick = () => {
            selectExerciseModal.hide();
            openConfigModal(ex);
        };
        libraryList.appendChild(item);
    });
}

// --- CONFIG MODAL LOGIC ---
function openConfigModal(ex) {
    selectedLibEx = ex;
    editIndex = -1;
    document.getElementById('configExName').innerText = ex.name;
    document.getElementById('exSets').value = 3;
    document.getElementById('exReps').value = 12;
    document.getElementById('exRest').value = 60;
    configExerciseModal.show();
}

function openEditExercise(index) {
    const ex = dayWorkout.exercises[index];
    selectedLibEx = ex;
    editIndex = index;
    document.getElementById('configExName').innerText = ex.name;
    document.getElementById('exSets').value = ex.sets;
    document.getElementById('exReps').value = ex.reps;
    document.getElementById('exRest').value = ex.restSeconds;
    configExerciseModal.show();
}

configForm.onsubmit = async (e) => {
    e.preventDefault();
    const exData = {
        name: selectedLibEx.name,
        photoUrl: selectedLibEx.photoUrl || '',
        videoUrl: selectedLibEx.videoUrl || '',
        sets: parseInt(document.getElementById('exSets').value),
        reps: parseInt(document.getElementById('exReps').value),
        restSeconds: parseInt(document.getElementById('exRest').value)
    };

    if (editIndex > -1) {
        dayWorkout.exercises[editIndex] = exData;
    } else {
        dayWorkout.exercises.push(exData);
    }

    await saveWorkout();
    configExerciseModal.hide();
};

// --- ACTIONS ---
async function moveExercise(index, direction) {
    const items = [...dayWorkout.exercises];
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    [items[index], items[target]] = [items[target], items[index]];
    dayWorkout.exercises = items;
    await saveWorkout();
}

async function removeExercise(index) {
    if (!confirm("Remover este exercício do treino de hoje?")) return;
    dayWorkout.exercises.splice(index, 1);
    await saveWorkout();
}

async function saveWorkout() {
    try {
        const docRef = doc(db, "workouts", currentDay);
        await setDoc(docRef, {
            day: currentDay,
            updatedAt: serverTimestamp(),
            exercises: dayWorkout.exercises
        });
        showToast("Treino salvo!");
    } catch (err) {
        showToast("Erro ao salvar: " + err.message, "danger");
    }
}

function showToast(msg, type = "success") {
    document.getElementById('feedbackMessage').innerText = msg;
    feedbackEl.className = `toast align-items-center text-white border-0 bg-${type}`;
    feedbackToast.show();
}
