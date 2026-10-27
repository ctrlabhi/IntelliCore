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
const auth = getAuth(initializeApp(firebaseConfig));
const $ = id => document.getElementById(id);
const allowedTracks = [
  "Business Analyst Intern",
  "Web Development Intern",
  "Data Analyst Intern",
  "Digital Marketing Intern",
  "Graphic Designer Intern",
  "Social Media Intern",
  "Content Writing Intern",
  "Human Resources Intern"
];
let toastTimer;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3600);
}

function trackLabel(track) {
  return track.replace(/ Intern$/, "").replace("Graphic Designer", "Graphic Design");
}

function closeMobileNav() {
  $("sidebar").classList.remove("open");
}

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.replace("index.html?auth=login");
    return;
  }

  try {
    await user.reload();
    const latestUser = auth.currentUser;
    if (!latestUser || latestUser.uid !== user.uid) return;
    const token = await latestUser.getIdTokenResult(true);
    const provider = token.claims.firebase?.sign_in_provider;
    const verified = token.claims.email_verified === true
      && (provider !== "password" || latestUser.emailVerified);
    if (!verified || !["google.com", "password"].includes(provider)) {
      window.location.replace("index.html?auth=login&verification=required");
      return;
    }

    if (token.claims.role !== "mentor") {
      window.location.replace("dashboard.html?workspace=operations");
      return;
    }

    const tracks = Array.isArray(token.claims.mentorTracks)
      ? [...new Set(token.claims.mentorTracks.filter(track => allowedTracks.includes(track)))]
      : [];
    if (!tracks.length) {
      window.location.replace("dashboard.html?workspace=operations");
      return;
    }

    const name = latestUser.displayName?.trim() || "Team Leader";
    $("userName").textContent = name;
    $("userAvatar").textContent = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
    $("profileEmail").textContent = latestUser.email || "Authorized Team Leader account";
    $("domainSelect").innerHTML = tracks.map(track =>
      `<option value="${track}">${trackLabel(track)}</option>`
    ).join("");
    $("domainSelect").hidden = tracks.length < 2;
    $("domainLabel").textContent = tracks.length === 1
      ? trackLabel(tracks[0])
      : `${tracks.length} authorized domains`;
    $("domainSelect").addEventListener("change", event => {
      $("domainLabel").textContent = trackLabel(event.currentTarget.value);
    });

    $("authState").hidden = true;
    $("dashboardShell").hidden = false;
  } catch (error) {
    console.error("TL Dashboard access could not be verified.", error);
    $("authState").textContent = "Access could not be verified. Please return to sign in and try again.";
  }
});

async function logout() {
  try {
    await signOut(auth);
    window.location.replace("index.html");
  } catch (error) {
    console.error("TL Dashboard sign-out failed.", error);
    showToast("Sign out failed. Please try again.");
  }
}

$("logoutButton").addEventListener("click", logout);
$("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("sidebar").querySelectorAll(".nav-link:not(.nav-button)").forEach(link => {
  link.addEventListener("click", () => {
    $("sidebar").querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
    closeMobileNav();
  });
});
$("notificationButton").addEventListener("click", () => {
  showToast("Notifications are sample data in this preview.");
});

document.querySelectorAll("[data-preview-action]").forEach(button => {
  button.addEventListener("click", () => {
    showToast(`${button.dataset.previewAction} is a preview only; no changes were made.`);
  });
});

function filterInterns() {
  const query = $("internSearch").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  let visibleRows = 0;
  $("internRows").querySelectorAll("tr").forEach(row => {
    const matches = row.textContent.toLowerCase().includes(query)
      && (status === "all" || row.dataset.status === status);
    row.hidden = !matches;
    if (matches) visibleRows += 1;
  });
  $("emptySearch").hidden = visibleRows !== 0;
}

$("internSearch").addEventListener("input", filterInterns);
$("statusFilter").addEventListener("change", filterInterns);
$("exportButton").addEventListener("click", () => {
  showToast("Export is not connected in this dashboard preview.");
});
$("globalSearch").addEventListener("keydown", event => {
  if (event.key === "Enter" && event.currentTarget.value.trim()) {
    const query = event.currentTarget.value.trim().toLowerCase();
    const match = [...document.querySelectorAll(".module-card, .panel, .stat-card")]
      .find(item => item.textContent.toLowerCase().includes(query));
    if (match) match.scrollIntoView({ behavior: "smooth", block: "center" });
    else showToast("No matching sample dashboard content found.");
  }
});
