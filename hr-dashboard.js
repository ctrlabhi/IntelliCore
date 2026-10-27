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
const staffRoles = {
  admin: {
    label: "Administrator",
    display: "HR DASHBOARD",
    scope: "HR workspace · Administrator access",
    capabilities: ["manageInterns", "recruitment", "attendance", "reports", "tasks", "certificates", "announcements", "export"]
  },
  hr_manager: {
    label: "HR Manager",
    display: "HR DASHBOARD",
    scope: "HR workspace · Authorized HR scope",
    capabilities: ["manageInterns", "recruitment", "attendance", "reports", "tasks", "certificates", "announcements", "export"]
  },
  hr_executive: {
    label: "HR Executive",
    display: "HR DASHBOARD",
    scope: "HR workspace · Assigned processes",
    capabilities: ["recruitment", "attendance", "reports", "certificates", "announcements"]
  },
  operations_executive: {
    label: "Operations Executive",
    display: "HR DASHBOARD",
    scope: "Operations workspace · Operational scope",
    capabilities: ["attendance", "reports", "tasks", "announcements"]
  }
};
let toastTimer;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3600);
}

function applyRole(role, name) {
  const config = staffRoles[role];
  $("userName").textContent = name;
  $("userRole").textContent = config.label;
  $("welcomeCopy").textContent = `Welcome back, ${name.split(/\s+/)[0]}. Review your authorized work and coordinate your team.`;
  $("roleScope").textContent = config.scope;
  $("dashboardRoleLabel").textContent = config.display;
  $("userAvatar").textContent = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  $("profileEmail").textContent = auth.currentUser?.email || "Signed in with an authorized staff account.";

  document.querySelectorAll("[data-capability]").forEach(item => {
    item.hidden = !config.capabilities.includes(item.dataset.capability);
  });
  if (!config.capabilities.includes("manageInterns")) {
    $("interns").querySelectorAll(".row-menu").forEach(button => { button.hidden = true; });
  }
  $("exportButton").disabled = !config.capabilities.includes("export");
  if ($("exportButton").disabled) $("exportButton").title = "Export is not available for your role.";
  document.querySelectorAll("[data-preview-action]").forEach(button => {
    const action = button.dataset.previewAction.toLowerCase();
    const capability = action.includes("intern") ? "manageInterns"
      : action.includes("attendance") ? "attendance"
        : action.includes("task") ? "tasks"
          : action.includes("certificate") ? "certificates"
            : action.includes("domain") ? "manageInterns"
              : action.includes("announcement") ? "announcements" : "reports";
    button.disabled = !config.capabilities.includes(capability);
    if (button.disabled) button.title = "Not available for your role in this preview.";
  });
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

    const role = token.claims.role;
    if (["founder", "co_founder"].includes(role)) {
      window.location.replace("founder-dashboard.html");
      return;
    }
    if (!staffRoles[role]) {
      window.location.replace("dashboard.html?workspace=operations");
      return;
    }

    applyRole(role, latestUser.displayName?.trim() || staffRoles[role].label);
    $("authState").hidden = true;
    $("dashboardShell").hidden = false;
  } catch (error) {
    console.error("HR dashboard access could not be verified.", error);
    $("authState").textContent = "Access could not be verified. Please return to sign in and try again.";
  }
});

async function logout() {
  try {
    await signOut(auth);
    window.location.replace("index.html");
  } catch (error) {
    console.error("HR dashboard sign-out failed.", error);
    showToast("Sign out failed. Please try again.");
  }
}

$("sidebarLogout").addEventListener("click", logout);
$("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("sidebar").querySelectorAll(".nav-link:not(.nav-button)").forEach(link => {
  link.addEventListener("click", () => {
    $("sidebar").querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
    closeMobileNav();
  });
});
$("notificationButton").addEventListener("click", () => showToast("Notifications are sample data in this preview."));

document.querySelectorAll("[data-preview-action]").forEach(button => {
  button.addEventListener("click", () => {
    if (!button.disabled) showToast(`${button.dataset.previewAction} is a preview only; no changes were made.`);
  });
});

$("exportButton").addEventListener("click", () => {
  showToast("Export is disabled in this sample-data preview.");
});

function filterSampleInterns() {
  const query = $("internSearch").value.trim().toLowerCase();
  const domain = $("domainFilter").value;
  let visibleRows = 0;
  $("internRows").querySelectorAll("tr").forEach(row => {
    const matches = row.textContent.toLowerCase().includes(query)
      && (!domain || row.cells[2]?.textContent.trim() === domain);
    row.hidden = !matches;
    if (matches) visibleRows += 1;
  });
  $("emptySearch").hidden = visibleRows !== 0;
}

$("internSearch").addEventListener("input", filterSampleInterns);
$("domainFilter").addEventListener("change", filterSampleInterns);

$("globalSearch").addEventListener("keydown", event => {
  if (event.key === "Enter" && event.currentTarget.value.trim()) {
    const query = event.currentTarget.value.trim().toLowerCase();
    const match = [...document.querySelectorAll(".module-card, .panel, .stat-card")]
      .find(item => item.textContent.toLowerCase().includes(query));
    if (match) match.scrollIntoView({ behavior: "smooth", block: "center" });
    else showToast("No matching sample dashboard content found.");
  }
});
