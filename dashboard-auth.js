import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";

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
const notice = message => { const el = $("icWorkspaceNotice"); if (el) el.textContent = message; };
let currentUser = null;
let activeTab = "applications";
let records = { applications: [], tasks: [], certificates: [] };
let editingId = null;

const labels = {
  applications: { singular: "application", plural: "Applications", subtitle: "Track roles and application progress.", add: "＋ Add application", empty: "No applications yet", emptyCopy: "Add a role you have applied for to track your progress.", statuses: ["Applied", "Under review", "Interview", "Selected", "Not selected"] },
  tasks: { singular: "task", plural: "Tasks & Learning", subtitle: "Keep track of assignments and learning milestones.", add: "＋ Add task", empty: "No tasks yet", emptyCopy: "Add an assignment or learning goal to get started.", statuses: ["To do", "In progress", "Completed"] },
  certificates: { singular: "certificate", plural: "Certificates", subtitle: "Keep a personal list of certificates you have earned.", add: "＋ Add certificate", empty: "No certificates yet", emptyCopy: "Add a certificate record when you receive one.", statuses: ["Earned", "In progress"] }
};
const storageKey = uid => `icWorkspaceData:${uid}`;
const photoKey = uid => `icWorkspacePhoto:${uid}`;
function safeRead(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}
function saveRecords() {
  if (!currentUser) return;
  try { localStorage.setItem(storageKey(currentUser.uid), JSON.stringify(records)); }
  catch { notice("Could not save this record in this browser. Try a smaller amount of data."); }
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
}
function updateCounts() {
  $("icApplicationsCount").textContent = records.applications.length;
  $("icTasksCount").textContent = records.tasks.length;
  $("icCertificatesCount").textContent = records.certificates.length;
  $("icApplicationsTabCount").textContent = records.applications.length;
  $("icTasksTabCount").textContent = records.tasks.length;
  $("icCertificatesTabCount").textContent = records.certificates.length;
}
function renderRecords() {
  const meta = labels[activeTab];
  $("icRecordListTitle").textContent = activeTab === "applications" ? "My Applications" : meta.plural;
  $("icRecordListSubtitle").textContent = meta.subtitle;
  $("icAddRecordButton").textContent = meta.add;
  const query = ($("icRecordSearch").value || "").trim().toLowerCase();
  const list = records[activeTab].filter(r => [r.title, r.organisation, r.status, r.date].some(v => String(v || "").toLowerCase().includes(query)));
  const target = $("icRecordsList");
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
  const all = [...records.applications, ...records.tasks, ...records.certificates]
    .map(r => ({...r, kind: records.applications.some(x=>x.id===r.id) ? "Application" : records.tasks.some(x=>x.id===r.id) ? "Task" : "Certificate"}))
    .sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0,4);
  const target = $("icWorkspaceActivity");
  if (!all.length) {
    target.className = "ic-activity-empty";
    target.innerHTML = '<span class="ic-empty-illustration">⌁</span><strong>Your journey starts here</strong><p>When you add applications, tasks or certificates, your latest updates will appear here.</p>';
    return;
  }
  target.className = "ic-activity-list";
  target.innerHTML = all.map(r => `<div class="ic-activity-item"><span class="ic-activity-dot"></span><div><strong>${escapeHtml(r.title)}</strong><p>${escapeHtml(r.kind)} · ${escapeHtml(r.status || "Added")}</p></div></div>`).join("");
}
function renderAll() { updateCounts(); renderRecords(); renderActivity(); }
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
  editingId = record?.id || null;
  const meta = labels[activeTab];
  $("icRecordDialogTitle").textContent = `${record ? "Edit" : "Add"} ${meta.singular}`;
  $("icRecordDialogKicker").textContent = meta.plural.toUpperCase();
  $("icRecordDialogDescription").textContent = record ? "Update the details below." : `Add a ${meta.singular} to your personal workspace.`;
  $("icRecordTitle").value = record?.title || "";
  $("icRecordOrganisation").value = record?.organisation || "";
  $("icRecordDate").value = record?.date || "";
  $("icRecordStatus").innerHTML = meta.statuses.map(s => `<option${s === (record?.status || meta.statuses[0]) ? " selected" : ""}>${escapeHtml(s)}</option>`).join("");
  $("icRecordOrganisation").placeholder = activeTab === "applications" ? "Company or role details" : activeTab === "tasks" ? "Course, project or assigned by" : "Issuing organisation";
  $("icRecordDateField").hidden = activeTab === "tasks";
  $("icRecordDialog").hidden = false;
  document.body.classList.add("ic-dialog-open");
  setTimeout(() => $("icRecordTitle").focus(), 40);
}
function closeDialog() { $("icRecordDialog").hidden = true; document.body.classList.remove("ic-dialog-open"); editingId = null; }
function saveRecord(event) {
  event.preventDefault();
  const title = $("icRecordTitle").value.trim();
  if (!title) return;
  const existing = records[activeTab].find(r => r.id === editingId);
  const record = {
    id: editingId || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    title,
    organisation: $("icRecordOrganisation").value.trim(),
    date: $("icRecordDate").value,
    status: $("icRecordStatus").value,
    updatedAt: Date.now(),
    createdAt: existing?.createdAt || Date.now()
  };
  if (existing) records[activeTab] = records[activeTab].map(r => r.id === editingId ? record : r);
  else records[activeTab].unshift(record);
  saveRecords(); closeDialog(); renderAll();
  notice(`${labels[activeTab].singular[0].toUpperCase()+labels[activeTab].singular.slice(1)} saved in this browser.`);
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
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeDialog(); });
  document.querySelectorAll("[data-record-tab]").forEach(button => button.addEventListener("click", () => setTab(button.dataset.recordTab)));
  $("icRecordSearch").addEventListener("input", renderRecords);
  $("icRecordsList").addEventListener("click", event => {
    const del = event.target.closest("[data-delete]");
    const edit = event.target.closest("[data-edit]");
    const complete = event.target.closest("[data-complete]");
    if (del) {
      const record = records[activeTab].find(r => r.id === del.dataset.delete);
      if (!record || !confirm(`Delete "${record.title}"?`)) return;
      records[activeTab] = records[activeTab].filter(r => r.id !== del.dataset.delete);
      saveRecords(); renderAll(); notice("Record deleted.");
    } else if (edit) {
      const record = records[activeTab].find(r => r.id === edit.dataset.edit);
      if (record) openDialog(record);
    } else if (complete) {
      records.tasks = records.tasks.map(r => r.id === complete.dataset.complete ? {...r, status:"Completed", updatedAt:Date.now()} : r);
      saveRecords(); renderAll(); notice("Task marked as completed.");
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
    if (!nextName.trim()) { notice("Display name cannot be empty."); return; }
    try {
      await updateProfile(currentUser, {displayName: nextName.trim()});
      await currentUser.reload();
      renderProfile(auth.currentUser);
      notice("Display name updated in your Firebase account.");
    } catch (error) { notice(error.message || "Could not update your profile."); }
  });
  $("icHeaderLogout")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    button.innerHTML = "Logging out…";
    try { await signOut(auth); window.location.replace("index.html"); }
    catch (error) { button.disabled = false; button.innerHTML = 'Log out <span aria-hidden="true">↗</span>'; notice(error.message || "Could not log out. Please try again."); }
  });
  const hamburger = $("hamburgerBtn"), drawer = $("mobileDrawer"), overlay = $("mobileOverlay");
  const closeDrawer = () => { drawer?.classList.remove("active","open","is-open"); overlay?.classList.remove("active","open","is-open"); hamburger?.setAttribute("aria-expanded","false"); };
  hamburger?.addEventListener("click", () => {
    const opening = !drawer?.classList.contains("active");
    drawer?.classList.toggle("active", opening); overlay?.classList.toggle("active", opening);
    hamburger.setAttribute("aria-expanded", String(opening));
  });
  overlay?.addEventListener("click", closeDrawer);
  drawer?.querySelectorAll("a").forEach(a => a.addEventListener("click", closeDrawer));
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
  records = safeRead(storageKey(user.uid), {applications:[],tasks:[],certificates:[]});
  if (!records || !Array.isArray(records.applications)) records = {applications:[],tasks:[],certificates:[]};
  records.tasks ||= []; records.certificates ||= [];
  renderProfile(user);
  renderAll();
  notice("Your personal workspace is ready.");
});
