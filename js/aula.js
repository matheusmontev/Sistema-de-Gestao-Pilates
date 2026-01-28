import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- STATE ---
let workout = { exercises: [] };
let currentIndex = 0;
let timerSeconds = 0;
let timerInterval = null;
let isTimerRunning = false;

const dayNames = {
    'segunda': 'Segunda-feira',
    'terca': 'Terça-feira',
    'quarta': 'Quarta-feira',
    'quinta': 'Quinta-feira',
    'sexta': 'Sexta-feira',
    'sabado': 'Sábado',
    'domingo': 'Domingo'
};

// --- UI ELEMENTS ---
const exerciseDisplay = document.getElementById('exerciseDisplay');
const timerDisplay = document.getElementById('timerDisplay');
const timerContainer = document.getElementById('timerContainer');
const startTimerBtn = document.getElementById('startTimerBtn');
const resetTimerBtn = document.getElementById('resetTimerBtn');
const prevExBtn = document.getElementById('prevExBtn');
const nextExBtn = document.getElementById('nextExBtn');
const btnPlayIcon = document.getElementById('btnPlayIcon');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const stepIndicator = document.getElementById('stepIndicator');

// Beep sound (base64)
const beepSound = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFRm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTdvT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19vT19');

// --- AUTH ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '../index.html';
    } else {
        init();
    }
});

async function init() {
    const params = new URLSearchParams(window.location.search);
    const day = params.get('day') || 'segunda';

    document.getElementById('headerTitle').innerText = `Aula de ${dayNames[day] || day}`;

    // Load Workout Data
    const docRef = doc(db, "workouts", day);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        workout = docSnap.data();
        if (workout.exercises && workout.exercises.length > 0) {
            renderExercise();
        } else {
            exerciseDisplay.innerHTML = `
                <div class="text-center p-4">
                    <i class="bi bi-emoji-frown fs-1 text-muted d-block mb-3"></i>
                    <p>Nenhum exercício cadastrado para hoje.</p>
                </div>`;
        }
    } else {
        exerciseDisplay.innerHTML = "<p>Treino não encontrado para hoje.</p>";
    }
}

// --- RENDERING ---
function renderExercise() {
    const ex = workout.exercises[currentIndex];
    const total = workout.exercises.length;

    // Update UI Indicators
    progressText.innerText = `${currentIndex + 1}/${total}`;
    stepIndicator.innerText = `${currentIndex + 1} de ${total}`;
    progressBar.style.width = `${((currentIndex + 1) / total) * 100}%`;

    // Render Card
    const hasPhoto = ex.photoUrl && ex.photoUrl.trim() !== '';
    exerciseDisplay.innerHTML = `
        <div class="animate-fade-in">
            ${hasPhoto
            ? `<img src="${ex.photoUrl}" class="exercise-img-lg" alt="${ex.name}">`
            : `<div class="exercise-img-lg d-flex align-items-center justify-content-center border"><i class="bi bi-image fs-1 text-muted"></i></div>`
        }
            <h2 class="exercise-title">${ex.name}</h2>
            <div class="exercise-stats">
                ${ex.sets} séries x ${ex.reps} repetições
            </div>
            ${ex.videoUrl ? `
                <div class="mt-2">
                    <a href="${ex.videoUrl}" target="_blank" class="btn btn-sm btn-outline-danger rounded-pill">
                        <i class="bi bi-play-circle"></i> Ver Vídeo
                    </a>
                </div>` : ''}
        </div>
    `;

    // Reset Timer for the new exercise
    stopTimer();
    timerSeconds = ex.restSeconds || 60;
    updateTimerDisplay();

    // Update Nav Buttons
    prevExBtn.disabled = currentIndex === 0;
    nextExBtn.disabled = currentIndex === total - 1;
}

// --- TIMER LOGIC ---
function updateTimerDisplay() {
    const mins = Math.floor(timerSeconds / 60);
    const secs = timerSeconds % 60;
    timerDisplay.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startTimer() {
    if (isTimerRunning) {
        stopTimer();
    } else {
        if (timerSeconds <= 0) return;

        isTimerRunning = true;
        timerContainer.classList.add('timer-active');
        btnPlayIcon.classList.remove('bi-play-fill');
        btnPlayIcon.classList.add('bi-pause-fill');

        timerInterval = setInterval(() => {
            timerSeconds--;
            updateTimerDisplay();

            if (timerSeconds <= 0) {
                finishTimer();
            }
        }, 1000);
    }
}

function stopTimer() {
    isTimerRunning = false;
    timerContainer.classList.remove('timer-active');
    btnPlayIcon.classList.remove('bi-pause-fill');
    btnPlayIcon.classList.add('bi-play-fill');
    clearInterval(timerInterval);
}

function finishTimer() {
    stopTimer();
    beepSound.play().catch(() => { }); // Play sound
    // Visual alert
    timerDisplay.classList.add('text-danger');
    setTimeout(() => timerDisplay.classList.remove('text-danger'), 2000);
}

function resetTimer() {
    stopTimer();
    timerSeconds = workout.exercises[currentIndex].restSeconds || 60;
    updateTimerDisplay();
}

// --- EVENT LISTENERS ---
startTimerBtn.onclick = startTimer;
resetTimerBtn.onclick = resetTimer;

nextExBtn.onclick = () => {
    if (currentIndex < workout.exercises.length - 1) {
        currentIndex++;
        renderExercise();
    }
};

prevExBtn.onclick = () => {
    if (currentIndex > 0) {
        currentIndex--;
        renderExercise();
    }
};

// Wake Lock (Prevent screen from dimming)
if ('wakeLock' in navigator) {
    let wakeLock = null;
    const requestWakeLock = async () => {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) { }
    };
    requestWakeLock();
}
