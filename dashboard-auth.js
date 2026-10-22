import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

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
const $ = id => document.getElementById(id);
const notice = text => { const el = $("icWorkspaceNotice"); if (el) el.textContent = text; };

onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.replace("index.html?auth=login");
    return;
  }
  const name = user.displayName || (user.email || "").split("@")[0] || "there";
  const initials = name.trim().split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase() || "IC";
  $("icProfileName").textContent = name;
  $("icProfileEmail").textContent = user.email || "Google account";
  $("icProfileEmailDetail").textContent = user.email || "Not available";
  $("icProfileInitials").setAttribute("aria-label", `Profile for ${name}`);
  $("icVerificationState").textContent = user.emailVerified ? "Email verified" : "Signed in · email not verified";
  $("icProfileStatus").textContent = user.emailVerified || user.providerData.some(p => p.providerId === "google.com") ? "Active" : "Verify";
  if (!user.emailVerified && user.providerData.every(p => p.providerId !== "google.com")) {
    $("icProfileNote").textContent = "Your account is connected. Verify your email to improve account security.";
  }
});

document.querySelectorAll("#icWorkspaceLogout, #icHeaderLogout").forEach(button => button.addEventListener("click", async () => {
  button.disabled = true;
  button.textContent = "Logging out…";
  try { await signOut(auth); window.location.replace("index.html"); }
  catch (error) { button.disabled = false; button.innerHTML = 'Log out <span>↗</span>'; notice(error.message || "Could not log out. Please try again."); }
}));

document.querySelectorAll("[data-workspace-view]").forEach(button => button.addEventListener("click", () => {
  const views = {
    applications: "Your application area is ready. Application records will appear here when connected to the IntelliCore database.",
    tasks: "Your tasks and learning area is ready. Assigned work and progress require database records to be configured.",
    certificates: "Your certificate area is ready. Issued certificates will appear here once certificate records are connected.",
    profile: "Your profile details are shown in the Account panel. Additional editable profile fields can be added with database integration."
  };
  notice(views[button.dataset.workspaceView] || "Workspace section selected.");
  const target = $("icWorkspaceNotice");
  target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}));

// Small mobile navigation behavior for the shared site header.
const hamburger = $("hamburgerBtn"), drawer = $("mobileDrawer"), overlay = $("mobileOverlay");
function closeDrawer(){ drawer?.classList.remove("active","open","is-open"); overlay?.classList.remove("active","open","is-open"); hamburger?.setAttribute("aria-expanded","false"); }
hamburger?.addEventListener("click", () => {
  const opening = !drawer?.classList.contains("active");
  drawer?.classList.toggle("active", opening); overlay?.classList.toggle("active", opening);
  hamburger.setAttribute("aria-expanded", String(opening));
});
overlay?.addEventListener("click", closeDrawer);
drawer?.querySelectorAll("a").forEach(a => a.addEventListener("click", closeDrawer));
$("dashboardHomeLogin")?.addEventListener("click", () => window.location.href = "index.html?auth=login");

// Reuse the existing policy dialog on the original site without loading the homepage's full script.
const policy = $("policyModal");
const policyTitle = $("policyModalTitle"), policyTag = $("policyModalTag"), policyBody = $("policyModalBody");
function openPolicy(kind){
  if (!policy) return;
  const privacy = kind === "privacy";
  policyTitle.textContent = privacy ? "Privacy Policy" : "Internship Terms & Code of Conduct";
  policyTag.textContent = privacy ? "Privacy & Data" : "Internship Guidelines";
  policyBody.textContent = privacy
    ? "IntelliCore uses account information to provide access to its workspace and related services. Keep your sign-in credentials private. Account data should only be accessed by authorised users. Contact Info@IntelliCoreTechnologies.in for privacy-related requests."
    : "Interns are expected to communicate respectfully, protect confidential information, complete assigned work honestly, and follow project instructions. Certificates should only be issued for work and completion that IntelliCore has verified. Contact the team if a requirement or deadline is unclear.";
  policy.classList.add("active"); policy.setAttribute("aria-hidden","false");
}
$("openPrivacyBtn")?.addEventListener("click", () => openPolicy("privacy"));
$("openTermsBtn")?.addEventListener("click", () => openPolicy("terms"));
$("closePolicyModalBtn")?.addEventListener("click", () => { policy?.classList.remove("active"); policy?.setAttribute("aria-hidden","true"); });
policy?.addEventListener("click", event => { if (event.target === policy) { policy.classList.remove("active"); policy.setAttribute("aria-hidden","true"); } });
