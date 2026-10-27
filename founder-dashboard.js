import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js";

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
const functions = getFunctions(auth.app, "us-central1");
const callFunction = (name, data = {}) => httpsCallable(functions, name)(data).then(result => result.data);
const $ = id => document.getElementById(id);
const authState = $("authState");
const shell = $("dashboardShell");
let toastTimer;
let roleAssignmentBusy = false;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3600);
}

function closeMobileNav() {
  $("sidebar").classList.remove("open");
}

function setRoleAssignmentStatus(message, state = "") {
  const status = $("roleAssignmentStatus");
  status.textContent = message;
  status.dataset.state = state;
}

function updateRoleAssignmentButton() {
  $("assignRoleButton").disabled = roleAssignmentBusy
    || !$("roleCandidate").value
    || !$("assignedRole").value;
}

async function loadRoleAssignmentCandidates() {
  const select = $("roleCandidate");
  const refresh = $("refreshRoleCandidates");
  select.disabled = true;
  refresh.disabled = true;
  setRoleAssignmentStatus("Loading unassigned intern accounts…");

  try {
    const result = await callFunction("listRoleAssignmentCandidates");
    const learners = Array.isArray(result.learners) ? result.learners : [];
    select.replaceChildren(new Option(
      learners.length ? "Choose an intern account" : "No unassigned intern accounts",
      ""
    ));
    learners.forEach(learner => {
      const name = learner.displayName || learner.email || "Intern account";
      const detail = [learner.email, learner.track].filter(Boolean).join(" · ");
      const option = new Option(detail ? `${name} — ${detail}` : name, learner.uid);
      select.add(option);
    });
    select.disabled = learners.length === 0;
    updateRoleAssignmentButton();
    setRoleAssignmentStatus(learners.length
      ? `${learners.length} unassigned verified intern account${learners.length === 1 ? "" : "s"} available.`
      : "No unassigned intern profiles found. The user must sign in once before assignment.");
    return Array.isArray(result.tracks) ? result.tracks : [];
  } catch (error) {
    console.error("Unassigned intern accounts could not be loaded.", error);
    select.replaceChildren(new Option("Could not load intern accounts", ""));
    select.disabled = true;
    setRoleAssignmentStatus(error.message || "Could not load intern accounts. Retry or check the deployed Functions.", "error");
    return [];
  } finally {
    refresh.disabled = false;
  }
}

function renderMentorTracks(tracks) {
  const options = $("mentorTrackOptions");
  options.replaceChildren();
  tracks.forEach(track => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "mentorTracks";
    checkbox.value = track;
    label.append(checkbox, document.createTextNode(track));
    options.append(label);
  });
}

async function assignStaffRole(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = $("assignRoleButton");
  const role = $("assignedRole").value;
  const mentorTracks = role === "mentor"
    ? [...form.querySelectorAll('input[name="mentorTracks"]:checked')].map(input => input.value)
    : [];
  if (!form.reportValidity()) return;
  if (role === "mentor" && !mentorTracks.length) {
    setRoleAssignmentStatus("Select at least one authorized track for the Team Leader.", "error");
    $("mentorTrackOptions").querySelector("input")?.focus();
    return;
  }

  roleAssignmentBusy = true;
  updateRoleAssignmentButton();
  setRoleAssignmentStatus("Assigning role securely…");
  try {
    await callFunction("assignStaffRole", {
      uid: $("roleCandidate").value,
      role,
      mentorTracks
    });
    setRoleAssignmentStatus("Role assigned. The user must sign out and sign in again for the new access to take effect.", "success");
    showToast("Staff role assigned. The user needs to sign in again.");
    form.reset();
    $("mentorTrackField").hidden = true;
    await loadRoleAssignmentCandidates();
  } catch (error) {
    console.error("Staff role could not be assigned.", error);
    setRoleAssignmentStatus(error.message || "The role could not be assigned. Check permissions and try again.", "error");
  } finally {
    roleAssignmentBusy = false;
    updateRoleAssignmentButton();
  }
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
    const isAllowlistedFounder = token.claims.email_verified === true
      && latestUser.email?.trim().toLowerCase() === "ctrlabhishek@gmail.com";
    if (!verified || !["google.com", "password"].includes(provider)) {
      window.location.replace("index.html?auth=login&verification=required");
      return;
    }

    if (!isAllowlistedFounder && !["founder", "co_founder"].includes(token.claims.role)) {
      window.location.replace("dashboard.html");
      return;
    }

    const role = isAllowlistedFounder ? "founder" : token.claims.role;
    const name = latestUser.displayName?.trim() || (role === "co_founder" ? "Co-Founder" : "Founder");
    $("userName").textContent = name;
    $("welcomeName").textContent = name.split(/\s+/)[0];
    $("userRole").textContent = role === "co_founder" ? "Co-Founder · Super Admin" : "Founder · Super Admin";
    $("userAvatar").textContent = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
    $("profileEmail").textContent = latestUser.email || "Authorized Super Admin account";
    authState.hidden = true;
    shell.hidden = false;
    const tracks = await loadRoleAssignmentCandidates();
    renderMentorTracks(tracks);
  } catch (error) {
    console.error("Founder dashboard access could not be verified.", error);
    authState.textContent = "Access could not be verified. Please return to sign in and try again.";
  }
});

$("logoutButton").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.replace("index.html");
  } catch (error) {
    console.error("Founder dashboard sign-out failed.", error);
    showToast("Sign out failed. Please try again.");
  }
});

$("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("sidebar").querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    $("sidebar").querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
    closeMobileNav();
  });
});

document.querySelectorAll("[data-preview-action]").forEach(button => {
  button.addEventListener("click", () => {
    showToast(`${button.dataset.previewAction} is a preview only; no changes were made.`);
  });
});

$("notificationButton").addEventListener("click", () => {
  showToast("Notifications are sample data in this preview.");
});
$("refreshRoleCandidates").addEventListener("click", async () => {
  const tracks = await loadRoleAssignmentCandidates();
  if (tracks.length) renderMentorTracks(tracks);
});
$("assignedRole").addEventListener("change", event => {
  const isTeamLeader = event.currentTarget.value === "mentor";
  $("mentorTrackField").hidden = !isTeamLeader;
  $("mentorTrackOptions").querySelectorAll('input[name="mentorTracks"]').forEach(input => {
    input.required = isTeamLeader;
    if (!isTeamLeader) input.checked = false;
  });
  updateRoleAssignmentButton();
});
$("roleCandidate").addEventListener("change", updateRoleAssignmentButton);
$("roleAssignmentForm").addEventListener("submit", assignStaffRole);

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
