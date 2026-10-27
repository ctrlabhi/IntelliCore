
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
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  setPersistence,
  connectAuthEmulator
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
const useFirebaseEmulators = new URLSearchParams(location.search).get("firebaseEmulator") === "1"
  && ["localhost", "127.0.0.1"].includes(location.hostname);
if (useFirebaseEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
}
const googleProvider = new GoogleAuthProvider();
const staffRolesByEmail = new Map([
  ["thesumitsah47@gmail.com", "admin"],
  ["tanu65159@gmail.com", "operations_executive"],
  ["mikkurwt694@gmail.com", "hr_executive"],
  ["ashitarohilla32@gmail.com", "hr_manager"]
]);
const founderEmail = "ctrlabhishek@gmail.com";

const $ = id => document.getElementById(id);
const modal = $("loginModal");
if (!modal) throw new Error("Login modal not found in index.html");

const form = $("icAuthForm");
const msg = $("icAuthMessage");
let mode = "login";
let authActionInProgress = false;
let sessionCheckInProgress = false;
let verificationCooldownUntil = 0;
let verificationCooldownTimer = null;

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

  $("icAuthTabs").hidden = false;
  $("icAuthFormPanel").hidden = false;
  $("icAuthTitle").textContent =
    mode === "signup" ? "Create your IntelliCore account" : "Sign in to IntelliCore";
  $("icAuthSubtitle").textContent =
    mode === "signup"
      ? "Create your account. We’ll email you a verification link."
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
  $("icAuthEmail").readOnly = false;
  $("icAuthPasswordLabel").hidden = false;
  $("icVerificationActions").hidden = true;
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
    "auth/user-not-found": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
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

function showVerificationActions() {
  $("icVerificationActions").hidden = false;
  updateVerificationResendButton();
}

function startVerificationCooldown() {
  verificationCooldownUntil = Date.now() + 60_000;
  updateVerificationResendButton();
  if (verificationCooldownTimer !== null) window.clearInterval(verificationCooldownTimer);
  verificationCooldownTimer = window.setInterval(updateVerificationResendButton, 1000);
}

function updateVerificationResendButton() {
  const button = $("icResendVerification");
  if (!button) return;
  const remainingSeconds = Math.max(0, Math.ceil((verificationCooldownUntil - Date.now()) / 1000));
  button.disabled = authActionInProgress || remainingSeconds > 0;
  button.textContent = remainingSeconds > 0
    ? `Resend in ${remainingSeconds}s`
    : "Resend verification email";
  if (remainingSeconds === 0 && verificationCooldownTimer !== null) {
    window.clearInterval(verificationCooldownTimer);
    verificationCooldownTimer = null;
  }
}

function verificationErrorMessage(error) {
  if (error.code === "auth/too-many-requests") {
    startVerificationCooldown();
    return "Firebase is temporarily limiting verification emails. Wait a minute and try again.";
  }
  if (error.code === "auth/network-request-failed") {
    return "Could not reach Firebase to send the verification email. Check your connection and try again.";
  }
  return errorMessage(error);
}

async function refreshVerificationStatus(user) {
  await user.reload();
  const latestUser = auth.currentUser;
  if (!latestUser || latestUser.uid !== user.uid) {
    throw new Error("Your sign-in session has ended. Please log in again.");
  }
  if (!latestUser.emailVerified) return false;
  await latestUser.getIdToken(true);
  return true;
}

async function redirectToDashboard(user) {
  await user.reload();
  const latestUser = auth.currentUser;
  if (!latestUser || latestUser.uid !== user.uid) {
    throw new Error("Your sign-in session has ended. Please log in again.");
  }

  const token = await latestUser.getIdTokenResult(true);
  const provider = token.claims.firebase?.sign_in_provider;
  const verified = token.claims.email_verified === true
    && (provider !== "password" || latestUser.emailVerified);
  if (!verified || !["google.com", "password"].includes(provider)) {
    throw new Error("Verify your email address before opening a dashboard.");
  }

  const claims = token.claims;
  const email = latestUser.email?.trim().toLowerCase() || "";
  // On Spark, use the same verified email allowlist as Firestore rules. This
  // keeps staff sign-in immediate without requiring an undeployed callable.

  const claimedRole = claims.role;
  const role = email === founderEmail
    ? "founder"
    : staffRolesByEmail.get(email) || claimedRole || "learner";
  const destination = ["founder", "co_founder"].includes(role)
    ? "founder-dashboard.html"
    : ["admin", "hr_manager", "hr_executive", "operations_executive"].includes(role)
      ? "hr-dashboard.html"
      : role === "mentor"
        ? "tl-dashboard.html"
        : "Intern-dashboard.html";
  window.location.replace(`${destination}${useFirebaseEmulators ? "?firebaseEmulator=1" : ""}`);
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
  authActionInProgress = true;
  setLoading(submitButton, true, mode === "signup" ? "Creating account…" : "Signing in…");

  try {
    if (mode === "signup") {
      await setPersistence(auth, browserLocalPersistence);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      setMode("login");
      $("icAuthEmail").value = email;
      $("icAuthPassword").value = "";
      $("icAuthConfirm").value = "";
      showVerificationActions();

      try {
        await updateProfile(credential.user, { displayName: name });
      } catch (profileError) {
        console.error("The new account's display name could not be saved.", profileError);
        message("Your account was created, but the profile name could not be saved. You can still verify your email and update your profile later.");
        return;
      }

      try {
        await sendEmailVerification(credential.user);
        startVerificationCooldown();
        message("Account created. Open the verification link sent to your email before signing in to the dashboard.");
      } catch (verificationError) {
        console.error("The account was created, but its verification email could not be sent.", verificationError);
        message(`Your account was created, but the verification email could not be sent. ${verificationErrorMessage(verificationError)} Use the resend button to try again.`);
      }
    } else {
      await setPersistence(auth, $("icRemember").checked
        ? browserLocalPersistence
        : browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const verified = await refreshVerificationStatus(credential.user);
      if (!verified) {
        showVerificationActions();
        message("Your email address is not verified. Open the verification link in your inbox, then select “I’ve verified my email.”");
      } else {
        await redirectToDashboard(credential.user);
      }
    }
  } catch (error) {
    message(errorMessage(error));
  } finally {
    authActionInProgress = false;
    const restoredLabel = mode === "signup" ? 'Create account <span>→</span>' : 'Log in <span>→</span>';
    setLoading(submitButton, false, restoredLabel);
    updateVerificationResendButton();
  }
});

$("icResendVerification")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  const user = auth.currentUser;
  if (!user || !user.providerData.some(provider => provider.providerId === "password")) {
    message("Sign in with your email and password first, then you can resend the verification email.");
    return;
  }
  if (user.email?.toLowerCase() !== $("icAuthEmail").value.trim().toLowerCase()) {
    message("The signed-in account does not match this email address. Log in with the account you want to verify.");
    return;
  }
  setLoading(button, true, "Sending…");
  authActionInProgress = true;
  try {
    if (await refreshVerificationStatus(user)) {
      await redirectToDashboard(user);
      return;
    }
    await sendEmailVerification(auth.currentUser);
    startVerificationCooldown();
    message("A new verification link has been sent. Check your inbox and spam folder.");
  } catch (error) {
    console.error("The verification email could not be resent.", error);
    message(verificationErrorMessage(error));
  } finally {
    authActionInProgress = false;
    updateVerificationResendButton();
  }
});

$("icCheckVerification")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  const user = auth.currentUser;
  if (!user) {
    message("Please log in again to check your email verification status.");
    return;
  }
  authActionInProgress = true;
  setLoading(button, true, "Checking…");
  try {
    if (await refreshVerificationStatus(user)) {
      await redirectToDashboard(user);
    } else {
      message("Firebase still shows this email as unverified. Open the latest link in your inbox and try again.");
    }
  } catch (error) {
    console.error("The email verification status could not be refreshed.", error);
    message(errorMessage(error));
  } finally {
    authActionInProgress = false;
    setLoading(button, false, "I’ve verified my email");
  }
});

$("icCancelVerification")?.addEventListener("click", async event => {
  const button = event.currentTarget;
  authActionInProgress = true;
  setLoading(button, true, "Signing out…");
  try {
    await signOut(auth);
    $("icVerificationActions").hidden = true;
    $("icAuthPassword").value = "";
    message("You are signed out. Log in again after verifying your email.");
  } catch (error) {
    console.error("The unverified account could not be signed out.", error);
    message(errorMessage(error));
  } finally {
    authActionInProgress = false;
    setLoading(button, false, "Sign out");
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
    const credential = await signInWithPopup(auth, googleProvider);
    await redirectToDashboard(credential.user);
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
  if (!user || authActionInProgress || sessionCheckInProgress || !modal.classList.contains("is-open")) return;
  sessionCheckInProgress = true;
  void (async () => {
    try {
      const isGoogleUser = user.providerData.some(provider => provider.providerId === "google.com");
      if (isGoogleUser) {
        await redirectToDashboard(user);
        return;
      }
      if (!user.providerData.some(provider => provider.providerId === "password")) return;
      if (await refreshVerificationStatus(user)) {
        await redirectToDashboard(user);
      } else {
        $("icAuthEmail").value = user.email || "";
        showVerificationActions();
        message("Your email address is not verified. Open the link in your inbox to access the dashboard.");
      }
    } catch (error) {
      console.error("The existing sign-in session could not be checked.", error);
      message("Could not check your sign-in status. Please try again.");
    } finally {
      sessionCheckInProgress = false;
    }
  })();
});

setMode("login");
if (new URLSearchParams(window.location.search).get("verification") === "required") {
  message("Email verification is required. Log in with your email and password to resend the verification link.");
}
