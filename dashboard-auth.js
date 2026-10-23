import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, doc, getDocs, initializeFirestore, writeBatch
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

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
const db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
const $ = id => document.getElementById(id);
const notice = (message, canRetry = false) => {
  const text = $("icWorkspaceNoticeText");
  const retry = $("icWorkspaceRetry");
  if (text) text.textContent = message;
  if (retry) retry.hidden = !canRetry;
};
let currentUser = null;
let activeTab = "applications";
let records = { applications: [], tasks: [], certificates: [] };
let editingId = null;
let dialogReturnFocus = null;
let persistedRecordIds = new Set();
let recordsReady = false;
let connectionAttempt = 0;

const labels = {
  applications: { singular: "personal application", plural: "Personal Applications", subtitle: "Track roles you applied for yourself; these are not official IntelliCore recruitment applications.", add: "＋ Add application", empty: "No applications tracked yet", emptyCopy: "Add a role you have applied for to track your own progress.", statuses: ["Applied", "Under review", "Shortlisted", "Interview Scheduled", "Selected", "Rejected", "Withdrawn"] },
  tasks: { singular: "personal task", plural: "Personal Tasks & Learning", subtitle: "Track your own goals. Official assignments are not connected yet.", add: "＋ Add task", empty: "No personal tasks yet", emptyCopy: "Add a learning goal or task you want to track.", statuses: ["To do", "In progress", "Completed"] },
  certificates: { singular: "certificate note", plural: "Certificate Notes", subtitle: "Personal notes only; official certificate issuance and verification are not enabled.", add: "＋ Add certificate note", empty: "No certificate notes yet", emptyCopy: "Keep a personal note about a certificate. This does not issue or verify a certificate.", statuses: ["Earned", "In progress"] }
};
const storageKey = uid => `icWorkspaceData:${uid}`;
const photoKey = uid => `icWorkspacePhoto:${uid}`;
const recordsCollection = uid => collection(db, "users", uid, "workspaceRecords");
const createRecordId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function safeRead(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch (error) { console.warn("A saved local workspace preference could not be read.", error); return fallback; }
}
async function loadRecords(user, attempt) {
  const snapshot = await getDocs(recordsCollection(user.uid));
  if (attempt !== connectionAttempt) return;
  const loaded = { applications: [], tasks: [], certificates: [] };
  const loadedIds = new Set();
  snapshot.forEach(document => {
    const record = document.data();
    if (!labels[record.category] || record.id !== document.id) return;
    loaded[record.category].push(record);
    loadedIds.add(document.id);
  });

  persistedRecordIds = loadedIds;
  recordsReady = true;
  if (!snapshot.size) {
    const legacy = safeRead(storageKey(user.uid), null);
    const hasLegacyRecords = legacy && ["applications", "tasks", "certificates"]
      .some(category => Array.isArray(legacy[category]) && legacy[category].length > 0);
    if (hasLegacyRecords && confirm("Your earlier workspace records are saved on this device. Copy them to your private Firebase account? The original local copy will be kept.")) {
      const migrated = Object.fromEntries(["applications", "tasks", "certificates"].map(category => [
        category,
        (Array.isArray(legacy[category]) ? legacy[category] : []).map(record => {
          const source = record && typeof record === "object" ? record : {};
          const statuses = labels[category].statuses;
          const legacyStatuses = {
            "Interview": "Interview Scheduled",
            "Not selected": "Rejected"
          };
          const status = legacyStatuses[source.status] || source.status;
          const now = Date.now();
          return {
            id: typeof source.id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(source.id) ? source.id : createRecordId(),
            title: String(source.title || "Untitled record").trim().slice(0, 100),
            organisation: String(source.organisation || "").slice(0, 120),
            date: typeof source.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.date) ? source.date : "",
            status: statuses.includes(status) ? status : statuses[0],
            createdAt: Number.isInteger(source.createdAt) ? source.createdAt : now,
            updatedAt: Number.isInteger(source.updatedAt) ? source.updatedAt : now
          };
        }).slice(0, 450)
      ]));
      if (!await persistRecords(migrated)) throw new Error("Your existing records were not migrated. The local copy is still available on this device.");
      Object.assign(loaded, migrated);
    }
  }

  if (attempt !== connectionAttempt) return;
  records = loaded;
  recordsReady = true;
}
function withTimeout(operation, delay) {
  let timeout;
  return Promise.race([
    operation,
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error("Workspace connection timed out.")), delay);
    })
  ]).finally(() => clearTimeout(timeout));
}
async function connectWorkspace(user) {
  const attempt = ++connectionAttempt;
  recordsReady = false;
  $("workspaceTop").setAttribute("aria-busy", "true");
  renderAll();
  notice("Connecting to your private workspace…");
  try {
    await withTimeout(loadRecords(user, attempt), 20000);
    if (attempt !== connectionAttempt) return;
    $("workspaceTop").setAttribute("aria-busy", "false");
    renderAll();
    notice("Your private workspace is ready.");
  } catch (error) {
    if (attempt !== connectionAttempt) return;
    connectionAttempt++;
    recordsReady = false;
    $("workspaceTop").setAttribute("aria-busy", "false");
    console.error("Private workspace records could not be loaded.", error);
    renderAll();
    notice("Private records could not be loaded. Check Firestore setup, your connection, and the deployed security rules.", true);
  }
}
async function persistRecords(nextRecords) {
  if (!currentUser || !recordsReady) {
    notice("Records are unavailable until your private workspace connection is ready.");
    return false;
  }
  const entries = Object.entries(nextRecords).flatMap(([category, items]) => items.map(record => [category, record]));
  if (entries.length > 450) {
    notice("This workspace has reached its safe record limit. Contact support before adding more.");
    return false;
  }
  try {
    const batch = writeBatch(db);
    const nextIds = new Set();
    for (const [category, record] of entries) {
      nextIds.add(record.id);
      batch.set(doc(recordsCollection(currentUser.uid), record.id), { ...record, category });
    }
    for (const id of persistedRecordIds) {
      if (!nextIds.has(id)) batch.delete(doc(recordsCollection(currentUser.uid), id));
    }
    await batch.commit();
    persistedRecordIds = nextIds;
    return true;
  } catch (error) {
    console.error("Workspace records could not be saved.", error);
    notice("Could not save to your private workspace. Check your connection and Firebase Firestore security rules, then try again.");
    return false;
  }
}
function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}
function initialsFor(name) {
  return (name || "IC").trim().split(/\s+/).slice(0,2).map(part => part[0] || "").join("").toUpperCase() || "IC";
}
function renderProfile(user) {
  const name = user.displayName || (user.email || "").split("@")[0] || "IntelliCore member";
  $("icProfileName").textContent = name;
  $("icProfileNameDetail").textContent = name;
  $("icProfileEmail").textContent = user.email || "Google account";
  $("icProfileEmailDetail").textContent = user.email || "Not available";
  $("icProfileStatus").textContent = user.emailVerified || user.providerData.some(p => p.providerId === "google.com") ? "Active" : "Verify";
  $("icVerificationState").textContent = user.emailVerified ? "Email verified" : user.providerData.some(p => p.providerId === "google.com") ? "Google account connected" : "Email not verified";
  $("icProfileNote").textContent = user.emailVerified || user.providerData.some(p => p.providerId === "google.com")
    ? "Your account is connected. Keep your sign-in details private."
    : "Your account is connected. Verify your email to improve account security.";
  const savedPhoto = safeRead(photoKey(user.uid), null);
  const photo = savedPhoto || user.photoURL;
  const avatar = $("icProfilePhoto");
  if (photo) { avatar.src = photo; avatar.alt = `${name}'s profile photo`; }
  else { avatar.src = "Photos/favicon.png"; avatar.alt = "IntelliCore logo"; }
  const verified = user.emailVerified || user.providerData.some(provider => provider.providerId === "google.com");
  const completion = [Boolean(user.displayName), Boolean(user.email), Boolean(verified), Boolean(photo)]
    .filter(Boolean).length * 25;
  $("icProfileCompletion").textContent = `${completion}%`;
  $("icProfileProgressBar").style.width = `${completion}%`;
  $("icProfileProgressBar").parentElement.setAttribute("aria-valuenow", String(completion));
}
function updateCounts() {
  const count = items => recordsReady ? String(items.length) : "—";
  $("icApplicationsCount").textContent = count(records.applications);
  $("icTasksCount").textContent = count(records.tasks);
  $("icCompletedTasksCount").textContent = count(records.tasks.filter(record => record.status === "Completed"));
  $("icCertificatesCount").textContent = count(records.certificates);
  $("icApplicationsTabCount").textContent = count(records.applications);
  $("icTasksTabCount").textContent = count(records.tasks);
  $("icCertificatesTabCount").textContent = count(records.certificates);
}
function renderRecords() {
  const meta = labels[activeTab];
  $("icRecordListTitle").textContent = activeTab === "applications" ? "My Applications" : meta.plural;
  $("icRecordListSubtitle").textContent = meta.subtitle;
  $("icAddRecordButton").textContent = meta.add;
  $("icAddRecordButton").disabled = !recordsReady;
  const query = ($("icRecordSearch").value || "").trim().toLowerCase();
  const list = records[activeTab].filter(r => [r.title, r.organisation, r.status, r.date].some(v => String(v || "").toLowerCase().includes(query)));
  const target = $("icRecordsList");
  if (!recordsReady) {
    target.innerHTML = `<div class="ic-record-empty"><strong>${currentUser ? "Private records are unavailable" : "Connect your account"}</strong><p>${currentUser ? "Retry after Firestore is available and its security rules have been deployed." : "Sign in to view your personal records."}</p></div>`;
    return;
  }
  if (!list.length) {
    target.innerHTML = `<div class="ic-record-empty"><span>✧</span><strong>${query ? "No matching records" : meta.empty}</strong><p>${query ? "Try a different search term." : meta.emptyCopy}</p></div>`;
    return;
  }
  target.innerHTML = list.map(record => `
    <article class="ic-record-row" data-record-id="${escapeHtml(record.id)}">
      <div class="ic-record-row-icon ${activeTab === "tasks" ? "icon-violet" : activeTab === "certificates" ? "icon-amber" : "icon-blue"}">${activeTab === "tasks" ? "▤" : activeTab === "certificates" ? "✧" : "▣"}</div>
      <div class="ic-record-main"><strong>${escapeHtml(record.title)}</strong><span>${escapeHtml(record.organisation || (activeTab === "tasks" ? "Personal learning" : "Personal record"))}${record.date ? ` · ${escapeHtml(record.date)}` : ""}</span></div>
      <span class="ic-record-status ${record.status === "Completed" || record.status === "Earned" || record.status === "Selected" ? "is-success" : ""}">${escapeHtml(record.status || "Added")}</span>
      <div class="ic-record-actions">${activeTab === "tasks" && record.status !== "Completed" ? `<button type="button" data-complete="${escapeHtml(record.id)}" aria-label="Mark task completed" title="Mark completed">✓</button>` : ""}<button type="button" data-edit="${escapeHtml(record.id)}" aria-label="Edit record" title="Edit">✎</button><button type="button" data-delete="${escapeHtml(record.id)}" aria-label="Delete record" title="Delete">×</button></div>
    </article>`).join("");
}
function renderActivity() {
  const target = $("icWorkspaceActivity");
  if (!recordsReady) {
    target.className = "ic-activity-empty";
    target.innerHTML = "<strong>Recent activity is unavailable</strong><p>Connect to your private workspace to load account-specific activity.</p>";
    return;
  }
  const all = Object.entries(records).flatMap(([category, items]) => items
    .map(record => ({...record, kind: labels[category].singular})))
    .sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0,4);
  if (!all.length) {
    target.className = "ic-activity-empty";
    target.innerHTML = '<span class="ic-empty-illustration">⌁</span><strong>Your journey starts here</strong><p>When you add applications, tasks or certificates, your latest updates will appear here.</p>';
    return;
  }
  target.className = "ic-activity-list";
  target.innerHTML = all.map(r => `<div class="ic-activity-item"><span class="ic-activity-dot"></span><div><strong>${escapeHtml(r.title)}</strong><p>${escapeHtml(r.kind)} · ${escapeHtml(r.status || "Added")}</p></div></div>`).join("");
}
function renderUpcomingDeadlines() {
  const target = $("icUpcomingDeadlines");
  if (!recordsReady) {
    target.className = "ic-activity-empty";
    target.innerHTML = "<strong>Task dates are unavailable</strong><p>Connect to your private workspace to load your personal deadlines.</p>";
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = records.tasks
    .filter(record => record.date && new Date(`${record.date}T00:00:00`).getTime() >= today.getTime() && record.status !== "Completed")
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  if (!upcoming.length) {
    target.className = "ic-activity-empty";
    target.innerHTML = "<strong>No upcoming personal deadlines</strong><p>Add a future due date to a personal task to see it here.</p>";
    return;
  }
  target.className = "ic-deadline-list";
  target.innerHTML = upcoming.map(record => `<div class="ic-deadline-item"><span>${escapeHtml(new Date(`${record.date}T00:00:00`).toLocaleDateString())}</span><strong>${escapeHtml(record.title)}</strong></div>`).join("");
}
function renderOnboardingChecklist() {
  if (!recordsReady) {
    $("icOnboardingChecklist").textContent = "Checklist status is unavailable until workspace records load.";
    return;
  }
  const verified = currentUser.emailVerified || currentUser.providerData.some(provider => provider.providerId === "google.com");
  const items = [
    { label: "Add your display name", done: Boolean(currentUser.displayName) },
    { label: "Verify your email or connect Google", done: Boolean(verified) },
    { label: "Track your first personal application", done: records.applications.length > 0 },
    { label: "Add a personal learning task", done: records.tasks.length > 0 }
  ];
  $("icOnboardingChecklist").innerHTML = items.map(item => `<div class="ic-onboarding-item"><span class="${item.done ? "is-done" : ""}" aria-hidden="true">${item.done ? "✓" : "○"}</span><span>${escapeHtml(item.label)}</span><small>${item.done ? "Done" : "To do"}</small></div>`).join("");
}
function renderAll() {
  updateCounts();
  renderRecords();
  renderActivity();
  renderUpcomingDeadlines();
  renderOnboardingChecklist();
}
function setTab(tab) {
  if (!labels[tab]) return;
  activeTab = tab;
  document.querySelectorAll("[data-record-tab]").forEach(button => {
    const active = button.dataset.recordTab === tab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  renderRecords();
}
function openDialog(record=null) {
  if (!recordsReady) {
    notice("Your private workspace is still connecting. Try again when the records have loaded.");
    return;
  }
  editingId = record?.id || null;
  dialogReturnFocus = document.activeElement;
  const meta = labels[activeTab];
  $("icRecordDialogTitle").textContent = `${record ? "Edit" : "Add"} ${meta.singular}`;
  $("icRecordDialogKicker").textContent = meta.plural.toUpperCase();
  $("icRecordDialogDescription").textContent = record ? "Update the details below." : `Add a ${meta.singular} to your personal workspace.`;
  $("icRecordTitle").value = record?.title || "";
  $("icRecordOrganisation").value = record?.organisation || "";
  $("icRecordDate").value = record?.date || "";
  $("icRecordStatus").innerHTML = meta.statuses.map(s => `<option${s === (record?.status || meta.statuses[0]) ? " selected" : ""}>${escapeHtml(s)}</option>`).join("");
  $("icRecordOrganisation").placeholder = activeTab === "applications" ? "Company or role details" : activeTab === "tasks" ? "Course, project or assigned by" : "Issuing organisation";
  $("icRecordDateField").firstChild.textContent = activeTab === "tasks" ? "Due date " : "Date ";
  $("icRecordDateField").hidden = false;
  $("icRecordDialog").hidden = false;
  document.body.classList.add("ic-dialog-open");
  setTimeout(() => $("icRecordTitle").focus(), 40);
}
function closeDialog() {
  $("icRecordDialog").hidden = true;
  document.body.classList.remove("ic-dialog-open");
  editingId = null;
  if (dialogReturnFocus instanceof HTMLElement && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
  dialogReturnFocus = null;
}
async function saveRecord(event) {
  event.preventDefault();
  const title = $("icRecordTitle").value.trim();
  if (!title) {
    notice("Enter a title before saving this record.");
    $("icRecordTitle").focus();
    return;
  }
  const existing = records[activeTab].find(r => r.id === editingId);
  const record = {
    id: editingId || createRecordId(),
    title,
    organisation: $("icRecordOrganisation").value.trim(),
    date: $("icRecordDate").value,
    status: $("icRecordStatus").value,
    updatedAt: Date.now(),
    createdAt: existing?.createdAt || Date.now()
  };
  const nextRecords = {
    ...records,
    [activeTab]: existing
      ? records[activeTab].map(item => item.id === editingId ? record : item)
      : [record, ...records[activeTab]]
  };
  const submitButton = $("icRecordForm").querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    if (!await persistRecords(nextRecords)) return;
    records = nextRecords;
    closeDialog(); renderAll();
    notice(`${labels[activeTab].singular[0].toUpperCase()+labels[activeTab].singular.slice(1)} saved to your private workspace.`);
  } finally {
    submitButton.disabled = false;
  }
}
function bindEvents() {
  $("icProfilePhotoButton").addEventListener("click", () => $("icProfilePhotoInput").click());
  $("icProfilePhotoInput").addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { notice("Choose an image file."); return; }
    if (file.size > 3 * 1024 * 1024) { notice("Please choose a photo smaller than 3 MB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      $("icProfilePhoto").src = reader.result;
      try { localStorage.setItem(photoKey(currentUser.uid), JSON.stringify(reader.result)); notice("Profile photo saved on this device."); }
      catch { notice("Photo preview updated, but this browser could not save it. Try a smaller image."); }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  });
  $("icAddRecordButton").addEventListener("click", () => openDialog());
  $("icRecordForm").addEventListener("submit", saveRecord);
  ["icCloseRecordDialog","icCancelRecord"].forEach(id => $(id).addEventListener("click", closeDialog));
  $("icRecordDialog").addEventListener("click", event => { if (event.target === $("icRecordDialog")) closeDialog(); });
  const hamburger = $("hamburgerBtn"), drawer = $("mobileDrawer"), overlay = $("mobileOverlay");
  const closeDrawer = (restoreFocus = false) => {
    const wasOpen = drawer?.classList.contains("active");
    drawer?.classList.remove("active", "open", "is-open");
    overlay?.classList.remove("active", "open", "is-open");
    hamburger?.classList.remove("open");
    hamburger?.setAttribute("aria-expanded", "false");
    drawer?.setAttribute("aria-hidden", "true");
    drawer?.setAttribute("inert", "");
    overlay?.setAttribute("aria-hidden", "true");
    if (restoreFocus && wasOpen) hamburger?.focus();
  };
  $("closeDrawerBtn")?.addEventListener("click", () => closeDrawer(true));
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!$("icRecordDialog").hidden) closeDialog();
    closeDrawer(true);
  });
  document.querySelectorAll("[data-record-tab]").forEach(button => button.addEventListener("click", () => setTab(button.dataset.recordTab)));
  $("icRecordSearch").addEventListener("input", renderRecords);
  $("icRecordsList").addEventListener("click", async event => {
    const del = event.target.closest("[data-delete]");
    const edit = event.target.closest("[data-edit]");
    const complete = event.target.closest("[data-complete]");
    if (del) {
      const record = records[activeTab].find(r => r.id === del.dataset.delete);
      if (!record || !confirm(`Delete "${record.title}"?`)) return;
      const nextRecords = {
        ...records,
        [activeTab]: records[activeTab].filter(r => r.id !== del.dataset.delete)
      };
      if (!await persistRecords(nextRecords)) return;
      records = nextRecords;
      renderAll(); notice("Record deleted from your private workspace.");
    } else if (edit) {
      const record = records[activeTab].find(r => r.id === edit.dataset.edit);
      if (record) openDialog(record);
    } else if (complete) {
      const nextRecords = {
        ...records,
        tasks: records.tasks.map(record => record.id === complete.dataset.complete
          ? {...record, status:"Completed", updatedAt:Date.now()}
          : record)
      };
      if (!await persistRecords(nextRecords)) return;
      records = nextRecords;
      renderAll(); notice("Personal task marked as completed.");
    }
  });
  document.querySelectorAll("[data-workspace-view]").forEach(button => button.addEventListener("click", () => {
    const map = {applications:"applications",tasks:"tasks",certificates:"certificates",profile:"profile"};
    const view = map[button.dataset.workspaceView];
    if (view === "profile") $("icProfileSettings").scrollIntoView({behavior:"smooth",block:"start"});
    else { setTab(view); $("icRecordsTitle").scrollIntoView({behavior:"smooth",block:"start"}); }
  }));
  $("icEditProfileButton").addEventListener("click", async () => {
    const oldName = currentUser.displayName || "";
    const nextName = prompt("Enter your display name:", oldName);
    if (nextName === null) return;
    if (!nextName.trim() || nextName.trim().length > 80) {
      notice("Display name must contain 1 to 80 characters.");
      return;
    }
    try {
      await updateProfile(currentUser, {displayName: nextName.trim()});
      await currentUser.reload();
      renderProfile(auth.currentUser);
      notice("Display name updated in your Firebase account.");
    } catch (error) { notice(error.message || "Could not update your profile."); }
  });
  $("icWorkspaceRetry").addEventListener("click", () => {
    if (currentUser) void connectWorkspace(currentUser);
  });
  $("icHeaderLogout")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = "Logging out…";
    try { await signOut(auth); window.location.replace("index.html"); }
    catch (error) { button.disabled = false; button.innerHTML = 'Log out <span aria-hidden="true">↗</span>'; notice(error.message || "Could not log out. Please try again."); }
  });
  hamburger?.addEventListener("click", () => {
    const opening = !drawer?.classList.contains("active");
    drawer?.classList.toggle("active", opening); overlay?.classList.toggle("active", opening);
    hamburger?.classList.toggle("open", opening);
    hamburger.setAttribute("aria-expanded", String(opening));
    drawer?.setAttribute("aria-hidden", String(!opening));
    if (opening) drawer?.removeAttribute("inert");
    else drawer?.setAttribute("inert", "");
    overlay?.setAttribute("aria-hidden", String(!opening));
  });
  overlay?.addEventListener("click", () => closeDrawer(true));
  drawer?.querySelectorAll("a").forEach(a => a.addEventListener("click", () => closeDrawer()));
  $("openPrivacyBtn")?.addEventListener("click", () => openPolicy("privacy"));
  $("openTermsBtn")?.addEventListener("click", () => openPolicy("terms"));
  $("closePolicyModalBtn")?.addEventListener("click", closePolicy);
  $("policyModal")?.addEventListener("click", e => { if (e.target === $("policyModal")) closePolicy(); });
}
function openPolicy(kind) {
  const modal = $("policyModal"); if (!modal) return;
  const privacy = kind === "privacy";
  $("policyModalTitle").textContent = privacy ? "Privacy Policy" : "Internship Terms & Code of Conduct";
  $("policyModalTag").textContent = privacy ? "Privacy & Data" : "Internship Guidelines";
  $("policyModalBody").textContent = privacy
    ? "IntelliCore uses account information to provide access to its workspace and related services. Keep your sign-in credentials private. Account data should only be accessed by authorised users. Contact Info@IntelliCoreTechnologies.in for privacy-related requests."
    : "Interns are expected to communicate respectfully, protect confidential information, complete assigned work honestly, and follow project instructions. Certificates should only be issued for work and completion that IntelliCore has verified. Contact the team if a requirement or deadline is unclear.";
  modal.classList.add("active"); modal.setAttribute("aria-hidden","false");
}
function closePolicy() { $("policyModal")?.classList.remove("active"); $("policyModal")?.setAttribute("aria-hidden","true"); }

bindEvents();
onAuthStateChanged(auth, user => {
  if (!user) { window.location.replace("index.html?auth=login"); return; }
  currentUser = user;
  renderProfile(user);
  void connectWorkspace(user);
});
