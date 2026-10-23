
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  setPersistence
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js";

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
const functions = getFunctions(app, "us-central1");
const googleProvider = new GoogleAuthProvider();
const callFunction = (name, data = {}) => httpsCallable(functions, name)(data).then(result => result.data);

const $ = id => document.getElementById(id);
const modal = $("loginModal");
if (!modal) throw new Error("Login modal not found in index.html");

const form = $("icAuthForm");
const msg = $("icAuthMessage");
let mode = "login";
let authActionInProgress = false;
let otpChallengePending = false;

function message(text) {
  if (msg) msg.textContent = text;
}

function openModal() {
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("ic-modal-open");
  $("icAuthFormPanel").hidden = false;
  setTimeout(() => $("icAuthEmail")?.focus({ preventScroll: true }), 80);
}

function closeModal() {
  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("ic-modal-open");
}

function setMode(nextMode) {
  mode = nextMode === "signup" ? "signup" : "login";
  otpChallengePending = false;

  $("icAuthTabs").hidden = false;
  $("icAuthFormPanel").hidden = false;
  $("icAuthTitle").textContent =
    mode === "signup" ? "Create your IntelliCore account" : "Sign in to IntelliCore";
  $("icAuthSubtitle").textContent =
    mode === "signup"
      ? "Create your account. A one-time email code is sent on your first sign-in."
      : "Use your password or continue directly with Google.";
  $("icAuthSubmit").innerHTML =
    mode === "signup" ? "Create account <span>→</span>" : "Log in <span>→</span>";

  $("icNameLabel").hidden = mode !== "signup";
  $("icConfirmLabel").hidden = mode !== "signup";
  $("icLoginOptions").hidden = mode !== "login";
  $("icAuthName").required = mode === "signup";
  $("icAuthConfirm").required = mode === "signup";
  $("icAuthPassword").autocomplete =
    mode === "signup" ? "new-password" : "current-password";
  $("icAuthPassword").required = true;
  $("icAuthPassword").disabled = false;
  $("icAuthPasswordLabel").hidden = false;
  $("icAuthEmail").readOnly = false;
  $("icAuthOtpLabel").hidden = true;
  $("icAuthOtp").required = false;
  $("icAuthOtp").value = "";
  $("icOtpActions").hidden = true;
  $("icResendOtp").hidden = true;
  $("icCancelOtp").hidden = true;
  $("icAuthTabs").hidden = false;
  $("icGoogleSignIn").hidden = false;
  $("icAuthSwitch").hidden = false;

  $("icAuthSwitch").innerHTML = mode === "signup"
    ? 'Already have an account? <button type="button" data-auth-mode="login">Log in</button>'
    : 'New to IntelliCore? <button type="button" data-auth-mode="signup">Create an account</button>';

  document.querySelectorAll("[data-auth-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
  message("");
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
    "auth/too-many-requests": "Too many attempts. Try again shortly."
  };
  return messages[error.code] || error.message || "Something went wrong. Please try again.";
}
function setLoading(button, busy, label) {
  button.disabled = busy;
  button.innerHTML = busy
    ? `<span class="ic-auth-loading"><span class="ic-auth-spinner" aria-hidden="true"></span>${label}</span>`
    : label;
}

function showOtpStep() {
  otpChallengePending = true;
  $("icAuthEmail").readOnly = true;
  $("icAuthPasswordLabel").hidden = true;
  $("icAuthPassword").disabled = true;
  $("icAuthPassword").required = false;
  $("icAuthPassword").value = "";
  $("icAuthOtpLabel").hidden = false;
  $("icAuthOtp").required = true;
  $("icLoginOptions").hidden = true;
  $("icAuthTabs").hidden = true;
  $("icGoogleSignIn").hidden = true;
  $("icAuthSwitch").hidden = true;
  $("icResendOtp").hidden = false;
  $("icCancelOtp").hidden = false;
  $("icOtpActions").hidden = false;
  $("icAuthTitle").textContent = "Check your email";
  $("icAuthSubtitle").textContent = `Enter the six-digit code sent to ${$("icAuthEmail").value.trim()}.`;
  $("icAuthSubmit").innerHTML = 'Verify code <span>→</span>';
  $("icAuthOtp").focus();
}

function resetOtpStep() {
  otpChallengePending = false;
  $("icAuthForm").reset();
  setMode("login");
  message("");
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

  if (!email || (!otpChallengePending && password.length < 6)) {
    message("Enter a valid email and a password with at least 6 characters.");
    return;
  }

  if (otpChallengePending) {
    if (!/^\d{6}$/.test($("icAuthOtp").value.trim())) {
      message("Enter the six-digit code sent to your email.");
      $("icAuthOtp").focus();
      return;
    }
  } else if (mode === "signup") {
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
  authActionInProgress = true;
  setLoading(submitButton, true, otpChallengePending ? "Verifying code…" : mode === "signup" ? "Creating account…" : "Signing in…");

  try {
    if (otpChallengePending) {
      await callFunction("verifyEmailOtp", { code: $("icAuthOtp").value.trim() });
      const user = auth.currentUser;
      if (!user) throw new Error("Your sign-in session expired. Please log in again.");
      await user.reload();
      await user.getIdToken(true);
      window.location.replace("dashboard.html");
    } else if (mode === "signup") {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try {
        await updateProfile(credential.user, { displayName: name });
      } catch (setupError) {
        await signOut(auth);
        throw setupError;
      }
      await signOut(auth);
      setMode("login");
      $("icAuthName").value = "";
      $("icAuthPassword").value = "";
      $("icAuthConfirm").value = "";
      $("icAuthEmail").value = email;
      message("Account created. Log in with your email and password to receive a one-time email code.");
    } else {
      await setPersistence(auth, $("icRemember").checked
        ? browserLocalPersistence
        : browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await credential.user.reload();
      const signedInUser = auth.currentUser;
      if (!signedInUser) throw new Error("Your sign-in session expired. Please log in again.");
      try {
        const result = await callFunction("sendEmailOtp");
        if (result.alreadyVerified) {
          await signedInUser.getIdToken(true);
          window.location.replace("dashboard.html");
          return;
        }
        showOtpStep();
        message("A six-digit sign-in code has been sent to your email.");
      } catch (otpError) {
        console.error("The email sign-in code could not be sent.", otpError);
        try {
          await signOut(auth);
        } catch (signOutError) {
          console.error("The session could not be cleared after OTP delivery failed.", signOutError);
        }
        message(otpError.message || "Could not send your email code. Try again shortly.");
      }
    }
  } catch (error) {
    message(errorMessage(error));
  } finally {
    authActionInProgress = false;
    const restoredLabel = otpChallengePending
      ? 'Verify code <span>→</span>'
      : mode === "signup" ? 'Create account <span>→</span>' : 'Log in <span>→</span>';
    setLoading(submitButton, false, restoredLabel);
  }
});

$("icResendOtp")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  setLoading(button, true, "Sending…");
  try {
    await callFunction("sendEmailOtp");
    message("A new six-digit code has been sent to your email.");
  } catch (error) {
    message(error.message || "Could not resend the email code. Try again shortly.");
  } finally {
    setLoading(button, false, "Resend code");
  }
});
$("icCancelOtp")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    resetOtpStep();
  } catch (error) {
    console.error("The pending OTP sign-in could not be cancelled.", error);
    message("Could not cancel this sign-in. Please refresh the page.");
  }
});

$("icGoogleSignIn")?.addEventListener("click", async () => {
  const button = $("icGoogleSignIn");
  const idleLabel = '<span class="ic-google-g">G</span> Continue with Google';
  authActionInProgress = true;
  setLoading(button, true, "Connecting to Google…");
  try {
    await setPersistence(auth, $("icRemember").checked
      ? browserLocalPersistence
      : browserSessionPersistence);
    await signInWithPopup(auth, googleProvider);
    window.location.replace("dashboard.html");
  } catch (error) {
    message(errorMessage(error));
  } finally {
    authActionInProgress = false;
    setLoading(button, false, idleLabel);
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

onAuthStateChanged(auth, user => {
  if (!user || authActionInProgress || !modal.classList.contains("is-open")) return;
  void user.getIdTokenResult().then(token => {
    const googleSignIn = token.claims.firebase?.sign_in_provider === "google.com";
    const firstEmailOtpVerified = user.emailVerified && token.claims.emailOtpVerified === true;
    if (googleSignIn || firstEmailOtpVerified) window.location.replace("dashboard.html");
  }).catch(error => {
    console.error("The existing sign-in session could not be checked.", error);
    message("Could not check your sign-in status. Please try again.");
  });
});

setMode("login");
if (new URLSearchParams(window.location.search).get("otp") === "required") {
  message("Enter your password to receive the one-time code for this email account.");
}
