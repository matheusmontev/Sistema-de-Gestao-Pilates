import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
    collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- STATE ---
let allExercises = [];

// --- UI ELEMENTS ---
const exercisesGrid = document.getElementById('exercisesGrid');
const exerciseForm = document.getElementById('exerciseForm');
const exerciseModal = new bootstrap.Modal(document.getElementById('exerciseModal'));
const feedbackToast = new bootstrap.Toast(document.getElementById('feedbackToast'));
const feedbackEl = document.getElementById('feedbackToast');

// --- AUTH ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
    } else {
        init();
    }
});

function init() {
    const q = collection(db, "exercises");
    onSnapshot(q, (snapshot) => {
        allExercises = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGrid();
    });
}

// --- RENDER ---
function renderGrid() {
    exercisesGrid.innerHTML = '';
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const categoryFilter = document.getElementById('categoryFilter').value;

    const filtered = allExercises.filter(ex => {
        const matchesName = ex.name.toLowerCase().includes(searchTerm);
        const matchesCategory = categoryFilter ? ex.category === categoryFilter : true;
        return matchesName && matchesCategory;
    });

    if (filtered.length === 0) {
        exercisesGrid.innerHTML = `
            <div class="col-12 text-center py-5 text-muted">
                <i class="bi bi-inbox fs-1 d-block mb-3"></i>
                Nenhum exercício encontrado.
            </div>`;
        return;
    }

    filtered.forEach(ex => {
        const hasPhoto = ex.photoUrl && ex.photoUrl.trim() !== '';

        const col = document.createElement('div');
        col.className = 'col-12 col-sm-6 col-md-4 col-lg-3';
        col.innerHTML = `
            <div class="card exercise-card h-100 shadow-sm position-relative">
                <span class="category-badge">${ex.category}</span>
                <div class="exercise-img-wrapper">
                    ${hasPhoto
                ? `<img src="${ex.photoUrl}" class="exercise-img" alt="${ex.name}" onerror="this.src='../img/placeholder.png'">`
                : `<i class="bi bi-image exercise-placeholder"></i>`
            }
                </div>
                <div class="card-body d-flex flex-column">
                    <h5 class="card-title fw-bold text-dark mb-1">${ex.name}</h5>
                    <div class="mt-auto pt-3 d-flex justify-content-between align-items-center">
                        ${ex.videoUrl ? `<a href="${ex.videoUrl}" target="_blank" class="btn btn-sm btn-outline-danger"><i class="bi bi-play-circle"></i> Vídeo</a>` : '<span></span>'}
                        <div class="btn-group">
                            <button class="btn btn-sm btn-light text-primary edit-btn"><i class="bi bi-pencil-fill"></i></button>
                            <button class="btn btn-sm btn-light text-danger delete-btn"><i class="bi bi-trash-fill"></i></button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Bind Events
        col.querySelector('.edit-btn').onclick = () => openEditModal(ex);
        col.querySelector('.delete-btn').onclick = () => deleteExercise(ex.id, ex.name);

        exercisesGrid.appendChild(col);
    });
}

// --- CRUD ---
exerciseForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('exerciseId').value;
    const data = {
        name: document.getElementById('exerciseName').value,
        category: document.getElementById('exerciseCategory').value,
        photoUrl: document.getElementById('exercisePhoto').value,
        videoUrl: document.getElementById('exerciseVideo').value,
        updatedAt: serverTimestamp()
    };

    try {
        if (id) {
            await updateDoc(doc(db, "exercises", id), data);
            showToast("Exercício atualizado!");
        } else {
            data.createdAt = serverTimestamp();
            await addDoc(collection(db, "exercises"), data);
            showToast("Exercício criado!");
        }
        exerciseModal.hide();
        exerciseForm.reset();
    } catch (err) {
        showToast("Erro: " + err.message, "danger");
    }
});

async function deleteExercise(id, name) {
    if (!confirm(`Tem certeza que deseja excluir "${name}"?`)) return;
    try {
        await deleteDoc(doc(db, "exercises", id));
        showToast("Exercício excluído.");
    } catch (err) {
        showToast("Erro ao excluir: " + err.message, "danger");
    }
}

// --- MODAL HELPERS ---
function openEditModal(ex) {
    document.getElementById('modalTitle').innerText = "Editar Exercício";
    document.getElementById('exerciseId').value = ex.id;
    document.getElementById('exerciseName').value = ex.name;
    document.getElementById('exerciseCategory').value = ex.category;
    document.getElementById('exercisePhoto').value = ex.photoUrl || '';
    document.getElementById('exerciseVideo').value = ex.videoUrl || '';
    exerciseModal.show();
}

document.getElementById('exerciseModal').addEventListener('hidden.bs.modal', () => {
    document.getElementById('modalTitle').innerText = "Novo Exercício";
    document.getElementById('exerciseId').value = "";
    exerciseForm.reset();
});

// --- SEARCH ---
document.getElementById('searchInput').addEventListener('input', renderGrid);
document.getElementById('categoryFilter').addEventListener('change', renderGrid);

// --- TOAST ---
function showToast(msg, type = "success") {
    document.getElementById('feedbackMessage').innerText = msg;
    feedbackEl.className = `toast align-items-center text-white border-0 bg-${type}`;
    feedbackToast.show();
}
