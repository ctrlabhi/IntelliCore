
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

// Firebase Console se apna exact config yahan paste karo.
const firebaseConfig = {
  apiKey: "AIzaSyCEhvxTrpDORuCByXDtlgNNHbpa5fnuud0",
  authDomain: "intellicore-229.firebaseapp.com",
  projectId: "intellicore-229",
  storageBucket: "intellicore-229.firebasestorage.app",
  messagingSenderId: "167120080877",
  appId: "1:167120080877:web:a93abd68788b4d25caa1e4",
  measurementId: "G-7597XQRVMB"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

const $ = id => document.getElementById(id);
const modal = $("loginModal");
if (!modal) throw new Error("Login modal not found in index.html");

const form = $("icAuthForm");
const msg = $("icAuthMessage");
let mode = "login";

function message(text) {
  if (msg) msg.textContent = text;
}

function openModal() {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("ic-modal-open");
  $("icAuthFormPanel").hidden = false;
  $("icDashboardPanel").hidden = true;
  setTimeout(() => $("icAuthEmail")?.focus(), 80);
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("ic-modal-open");
}

function setMode(nextMode) {
  mode = nextMode === "signup" ? "signup" : "login";

  $("icAuthTabs").hidden = false;
  $("icAuthFormPanel").hidden = false;
  $("icDashboardPanel").hidden = true;
  $("icAuthTitle").textContent =
    mode === "signup" ? "Create your IntelliCore account" : "Sign in to IntelliCore";
  $("icAuthSubtitle").textContent =
    mode === "signup" ? "Create your workspace to get started." : "Access your personal workspace.";
  $("icAuthSubmit").innerHTML =
    mode === "signup" ? "Create account <span>→</span>" : "Log in <span>→</span>";

  $("icNameLabel").hidden = mode !== "signup";
  $("icConfirmLabel").hidden = mode !== "signup";
  $("icLoginOptions").hidden = mode !== "login";
  $("icAuthName").required = mode === "signup";
  $("icAuthConfirm").required = mode === "signup";
  $("icAuthPassword").autocomplete =
    mode === "signup" ? "new-password" : "current-password";

  $("icAuthSwitch").innerHTML = mode === "signup"
    ? 'Already have an account? <button type="button" data-auth-mode="login">Log in</button>'
    : 'New to IntelliCore? <button type="button" data-auth-mode="signup">Create an account</button>';

  document.querySelectorAll("[data-auth-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  message("");
}

function showDashboard(user) {
  $("icAuthFormPanel").hidden = true;
  $("icAuthTabs").hidden = true;
  $("icDashboardPanel").hidden = false;
  $("icDashboardName").textContent =
    user.displayName || user.email?.split("@")[0] || "there";
  $("icDashboardDetail").textContent = user.emailVerified
    ? `Signed in as ${user.email}`
    : `Signed in as ${user.email}. Please verify your email to secure your account.`;
}

function errorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "This email already has an account. Please log in.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/weak-password": "Choose a stronger password with at least 6 characters.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in popup.",
    "auth/operation-not-allowed": "Enable this sign-in method in Firebase Console.",
    "auth/unauthorized-domain": "Add this website domain in Firebase Authentication settings.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again."
  };
  return messages[error.code] || error.message || "Something went wrong. Please try again.";
}

$("loginTrigger")?.addEventListener("click", openModal);
$("closeLoginModal")?.addEventListener("click", closeModal);

modal.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && modal.classList.contains("is-open")) closeModal();
});

document.addEventListener("click", event => {
  const button = event.target.closest("[data-auth-mode]");
  if (button) {
    event.preventDefault();
    setMode(button.dataset.authMode);
  }
});

form?.addEventListener("submit", async event => {
  event.preventDefault();

  const email = $("icAuthEmail").value.trim();
  const password = $("icAuthPassword").value;
  const name = $("icAuthName").value.trim();

  if (!email || password.length < 6) {
    message("Enter a valid email and a password with at least 6 characters.");
    return;
  }

  if (mode === "signup") {
    if (!name) {
      message("Enter your full name.");
      return;
    }
    if (password !== $("icAuthConfirm").value) {
      message("Passwords do not match.");
      return;
    }
  }

  const submitButton = $("icAuthSubmit");
  submitButton.disabled = true;
  message("Please wait...");

  try {
    if (mode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: name });
      await sendEmailVerification(credential.user);
      showDashboard(credential.user);
      message("Account created. Check your email for the verification link.");
    } else {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      showDashboard(credential.user);
      message(credential.user.emailVerified
        ? "Login successful."
        : "Please check your email for the verification link.");
    }
  } catch (error) {
    message(errorMessage(error));
  } finally {
    submitButton.disabled = false;
  }
});

$("icGoogleSignIn")?.addEventListener("click", async () => {
  message("Connecting to Google...");
  try {
    const result = await signInWithPopup(auth, googleProvider);
    showDashboard(result.user);
    message("Google sign-in successful.");
  } catch (error) {
    message(errorMessage(error));
  }
});

$("icForgotPassword")?.addEventListener("click", async () => {
  const email = $("icAuthEmail").value.trim();
  if (!email) {
    message("Enter your email address first.");
    $("icAuthEmail").focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    message("If an account exists for this address, a password reset email will be sent.");
  } catch (error) {
    message(errorMessage(error));
  }
});

$("icLogoutBtn")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    $("icAuthEmail").value = "";
    $("icAuthPassword").value = "";
    $("icAuthName").value = "";
    $("icAuthConfirm").value = "";
    setMode("login");
    message("You have logged out.");
  } catch (error) {
    message(errorMessage(error));
  }
});

document.querySelectorAll("[data-dash-view]").forEach(button => {
  button.addEventListener("click", () => {
    $("icDashboardDetail").textContent =
      `${button.dataset.dashView}: your account is connected. Personal data storage needs a database setup.`;
  });
});

onAuthStateChanged(auth, user => {
  if (user && modal.classList.contains("is-open")) {
    showDashboard(user);
  }
});

setMode("login");
