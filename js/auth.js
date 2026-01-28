import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const loginForm = document.getElementById('loginForm');

// Login Form Handling
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('floatingInput').value;
        const password = document.getElementById('floatingPassword').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        // Loading state
        const originalBtnText = submitBtn.innerText;
        submitBtn.disabled = true;
        submitBtn.innerText = 'Entrando...';

        signInWithEmailAndPassword(auth, email, password)
            .then((userCredential) => {
                // Signed in
                const user = userCredential.user;
                console.log("Login success:", user);
                window.location.href = 'telas/dashboard.html';
            })
            .catch((error) => {
                const errorCode = error.code;
                const errorMessage = error.message;
                alert(`Erro ao entrar: ${errorMessage}`);
                console.error(errorCode, errorMessage);

                // Reset button
                submitBtn.disabled = false;
                submitBtn.innerText = originalBtnText;
            });
    });
}

// Auth State Observer (Optional log for now, will be used in dashboard)
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User is signed in:", user.email);
    } else {
        console.log("User is signed out");
    }
});
