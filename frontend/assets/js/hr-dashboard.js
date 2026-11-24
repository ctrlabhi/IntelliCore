import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { connectAuthEmulator, getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, collectionGroup, connectFirestoreEmulator, doc, getDoc, getDocs,
  getFirestore, limit, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, where
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
const db = getFirestore(app);
const useEmulators = new URLSearchParams(location.search).get("firebaseEmulator") === "1"
  && ["localhost", "127.0.0.1"].includes(location.hostname);
if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}

const $ = id => document.getElementById(id);
const pendingActivationView = new URLSearchParams(location.search).get("view") === "pending-activation";
const tracks = [
  "Business Analyst Intern", "Web Development Intern", "Data Analyst Intern",
  "Digital Marketing Intern", "Graphic Designer Intern", "Social Media Intern",
  "Content Writing Intern", "Human Resources Intern"
];
const staffRolesByEmail = new Map([
  ["thesumitsah47@gmail.com", "admin"],
  ["tanu65159@gmail.com", "operations_executive"],
  ["mikkurwt694@gmail.com", "hr_executive"],
  ["ashitarohilla32@gmail.com", "hr_manager"]
]);
const roleAccess = {
  admin: { label: "Administrator", canManage: true, canAttendance: true, canTasks: true, capabilities: ["manageInterns", "recruitment", "attendance", "reports", "tasks", "certificates", "announcements", "export"] },
  founder: { label: "Founder", canManage: true, canAttendance: true, canTasks: true, capabilities: ["manageInterns", "recruitment", "attendance", "reports", "tasks", "certificates", "announcements", "export"] },
  co_founder: { label: "Co-Founder", canManage: true, canAttendance: true, canTasks: true, capabilities: ["manageInterns", "recruitment", "attendance", "reports", "tasks", "certificates", "announcements", "export"] },
  hr_manager: { label: "HR Manager", canManage: true, canAttendance: true, canTasks: true, capabilities: ["manageInterns", "recruitment", "attendance", "reports", "tasks", "certificates", "announcements", "export"] },
  hr_executive: { label: "HR Executive", canManage: false, canAttendance: false, canTasks: false, capabilities: ["reports", "recruitment", "certificates", "announcements"] },
  operations_executive: { label: "Operations Executive", canManage: false, canAttendance: true, canTasks: false, capabilities: ["attendance", "reports", "announcements"] }
};
let staffRole = "";
let interns = [];
let staffProfiles = [];
let attendanceRecords = [];
let assignments = [];
let announcements = [];
let resources = [];
let certificateRequests = [];
let dataRefreshTimer = null;
let toastTimer = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function showToast(text) {
  const toast = $("toast");
  toast.textContent = text;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 4000);
}

function dateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit"
  }).format(date);
}

function configureAttendancePeriods() {
  const current = dateString().slice(0, 7);
  const [year, month] = current.split("-").map(Number);
  const previousDate = new Date(Date.UTC(year, month - 2, 1));
  const previous = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;
  $("attendancePeriod").innerHTML = `<option value="${current}">This Month</option><option value="${previous}">Last Month</option>`;
}

function millis(value) {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchAllDocs(buildQuery) {
  const docs = [];
  let cursor = null;
  while (true) {
    const pageLimit = 500;
    const page = await getDocs(buildQuery(cursor, pageLimit));
    docs.push(...page.docs);
    if (page.size < pageLimit) break;
    cursor = page.docs[page.docs.length - 1] || null;
    if (!cursor) break;
  }
  return docs;
}

function initials(name = "Intern") {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase() || "I";
}

function internshipIsActive(intern, today = dateString()) {
  return !intern.profileDraft
    && intern.accountStatus !== "deactivated"
    && (intern.internshipStatus || "active") === "active"
    && intern.internshipStartDate && intern.internshipEndDate
    && intern.internshipStartDate <= today && intern.internshipEndDate >= today;
}

function statusFor(intern, today = dateString()) {
  if (intern.accountStatus === "deactivated") return "Deactivated";
  if (intern.profileDraft) return "Pending activation";
  if (intern.internshipStatus === "completed"
    || (intern.track && intern.internshipEndDate && intern.internshipEndDate < today)) return "Completed";
  const enrolled = Boolean(intern.track && intern.internshipStartDate && intern.internshipEndDate
    && (intern.internshipStatus || "active") === "active");
  if (enrolled && internshipIsActive(intern, today)) return "Active";
  if (enrolled && intern.internshipEndDate < today) return "Completed";
  if (enrolled && intern.internshipStartDate > today) return "Scheduled";
  if (intern.track || intern.internshipStartDate) return "Pending activation";
  return "Profile incomplete";
}

function rowMarkup(intern, index) {
  const attendanceCount = attendanceRecords.filter(item => item.uid === intern.uid
    && item.attendanceDate?.startsWith($("attendancePeriod").value)).length;
  const internTasks = assignments.filter(item => item.assignedToUid === intern.uid);
  const completed = internTasks.filter(item => ["approved", "completed"].includes(item.status)).length;
  const taskCount = staffRole === "admin" || staffRole === "hr_manager"
    ? `${completed}/${internTasks.length}` : "—";
  const status = statusFor(intern);
  const statusClass = status === "Active" ? "active" : status === "Deactivated" ? "inactive" : "pending";
  const joined = intern.internshipStartDate || "—";
  const end = intern.internshipEndDate || "—";
  const lastLogin = millis(intern.lastLoginAt)
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(millis(intern.lastLoginAt)))
    : "—";
  const action = status === "Pending activation" && intern.profileDraft && roleAccess[staffRole].canManage
    ? `<button class="row-menu activate-intern" data-uid="${escapeHtml(intern.uid)}" type="button" aria-label="Activate ${escapeHtml(intern.displayName || intern.email || "intern")}">Activate</button>`
    : "—";
  return `<tr><td>${String(index + 1).padStart(2, "0")}</td><td><span class="table-avatar">${escapeHtml(initials(intern.displayName || intern.email))}</span>${escapeHtml(intern.displayName || "Name not set")}</td><td>${escapeHtml(intern.email || "—")}</td><td>${escapeHtml(intern.track || "Not selected")}</td><td>${escapeHtml(intern.phone || "—")}</td><td>Intern</td><td><span class="table-status ${statusClass}">${escapeHtml(status)}</span></td><td>${roleAccess[staffRole].canAttendance ? attendanceCount : "Restricted"}</td><td>${intern.durationMonths ? `${escapeHtml(intern.durationMonths)} month${intern.durationMonths === 1 ? "" : "s"}` : "—"}</td><td>${escapeHtml(joined)}</td><td>${escapeHtml(end)}</td><td>${escapeHtml(lastLogin)}</td><td>${escapeHtml(taskCount)}</td><td>${action}</td></tr>`;
}

function filteredInterns() {
  const search = $("internSearch").value.trim().toLowerCase();
  const track = $("domainFilter").value;
  const statusFilter = document.querySelector('[aria-label="Filter by status"]')?.value || "";
  return interns.filter(intern => {
    const status = statusFor(intern);
    return (!search || `${intern.displayName} ${intern.email} ${intern.track}`.toLowerCase().includes(search))
      && (!track || intern.track === track)
      && (!statusFilter || statusFilter === status);
  });
}

function renderInterns() {
  const visible = filteredInterns();
  $("internRows").innerHTML = visible.map(rowMarkup).join("");
  $("emptySearch").hidden = visible.length > 0;
  $("emptySearch").textContent = interns.length
    ? "No intern records match these filters."
    : "No learner profiles have been created yet.";
  $("internSearch").setAttribute("aria-label", "Search live intern records");
}

function renderDomainCounts() {
  const counts = new Map(tracks.map(track => [track, 0]));
  interns.forEach(intern => { if (counts.has(intern.track)) counts.set(intern.track, counts.get(intern.track) + 1); });
  const total = interns.length;
  $("domainTotal").textContent = String(total);
  $("domainLegend").innerHTML = tracks.map((track, index) =>
    `<li><i class="c${(index % 7) + 1}"></i><span>${escapeHtml(track.replace(/ Intern$/, ""))}</span><b>${counts.get(track)}</b></li>`
  ).join("");
  const colors = ["#09c9ed", "#1687f8", "#c9dd19", "#ff9024", "#8145ee", "#ff719e", "#9daeff", "#00d3a0"];
  const slices = [];
  let cursor = 0;
  tracks.forEach((track, index) => {
    const portion = total ? counts.get(track) * 100 / total : 0;
    slices.push(`${colors[index]} ${cursor}% ${cursor + portion}%`);
    cursor += portion;
  });
  $("domainDonut").style.background = total
    ? `conic-gradient(${slices.join(",")})`
    : "conic-gradient(#16324a 0 100%)";
}

function renderLiveActivity() {
  const activity = [
    ...attendanceRecords.map(record => ({
      at: millis(record.checkedInAt) || Date.parse(`${record.attendanceDate}T00:00:00+05:30`),
      name: record.displayName || record.email || "Intern",
      detail: `Attendance check-in · ${record.attendanceDate}`
    })),
    ...assignments.filter(item => item.updatedAt || item.assignedAt).map(task => ({
      at: millis(task.updatedAt || task.assignedAt),
      name: task.displayName || task.learnerEmail || "Intern",
      detail: `Task ${task.status || "updated"} · ${task.taskTitle || task.taskId || "Training task"}`
    }))
  ].filter(item => item.at).sort((a, b) => b.at - a.at).slice(0, 6);
  $("liveActivityList").innerHTML = activity.length
    ? activity.map((item, index) => `<li><span class="staff-avatar avatar-${(index % 5) + 1}">${escapeHtml(initials(item.name))}</span><span><strong>${escapeHtml(item.name)} <small>${escapeHtml(item.detail)}</small></strong></span><time>${escapeHtml(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.at)))}</time></li>`).join("")
    : "<li><span>No attendance or task activity is recorded yet.</span></li>";
}

function renderDeadlines() {
  const today = dateString();
  const upcoming = assignments.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.dueDate || "") && item.dueDate >= today)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 7);
  $("liveDeadlineList").innerHTML = upcoming.length
    ? upcoming.map(item => {
      const [year, month, day] = item.dueDate.split("-");
      const label = item.taskTitle || item.taskId || "Training task";
      return `<div class="deadline-row"><span class="date-badge"><small>${new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1))).toUpperCase()}</small><b>${day}</b></span><span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(item.track || item.learnerEmail || "Intern")}</small></span><b class="tag task-tag">Task</b></div>`;
    }).join("")
    : "<p>No upcoming assigned-task deadlines.</p>";
}

function renderTaskTools() {
  const catalog = window.IntelliCoreCurriculum?.tracks || {};
  const totalCatalog = Object.values(catalog).reduce((total, tasks) => total + tasks.length, 0);
  $("liveTaskSummary").textContent = roleAccess[staffRole].canTasks
    ? `${assignments.length} live assignments · ${totalCatalog} approved tasks across ${Object.keys(catalog).length} domains.`
    : "Task assignments are limited to HR Managers and administrators.";
  $("liveTaskCatalog").innerHTML = roleAccess[staffRole].canTasks
    ? `<details><summary>Browse approved tasks by domain</summary>${Object.entries(catalog).map(([track, tasks]) => `<section><strong>${escapeHtml(track)}</strong><ul>${tasks.map(task => `<li><details><summary>${escapeHtml(task.title)}</summary><p>${escapeHtml(task.instructions)}</p><p><strong>Deliverable:</strong> ${escapeHtml(task.deliverable)}</p></details></li>`).join("")}</ul></section>`).join("")}</details>`
    : "";
  $("liveAssignedTasks").innerHTML = roleAccess[staffRole].canTasks
    ? assignments.length
      ? `<details><summary>View assigned tasks (${assignments.length})</summary><div class="live-assignment-list">${assignments.slice(0, 60).map(task => `<article><strong>${escapeHtml(task.taskTitle || task.taskId || "Training task")}</strong><span>${escapeHtml(task.learnerEmail || "Intern")} · ${escapeHtml(task.track || "Domain not set")}</span><small>Status: ${escapeHtml(task.status || "assigned")}${task.dueDate ? ` · Due ${escapeHtml(task.dueDate)}` : ""}</small></article>`).join("")}${assignments.length > 60 ? `<p>Showing 60 of ${assignments.length} task records.</p>` : ""}</div></details>`
      : "<p>No assigned training tasks yet.</p>"
    : "";
  const taskLink = $("manageTasksLink");
  if (taskLink) taskLink.hidden = !roleAccess[staffRole].canTasks;
}

function renderSharedContent() {
  const audienceOptions = tracks.map(track => `<option value="${escapeHtml(track)}">${escapeHtml(track)}</option>`).join("");
  ["announcementAudience", "resourceAudience"].forEach(id => {
    const select = $(id);
    if (select) select.innerHTML = `<option value="all">All interns</option>${audienceOptions}`;
  });
  const mayPublish = Boolean(roleAccess[staffRole]?.canTasks);
  ["announcementForm", "resourceForm"].forEach(id => { if ($(id)) $(id).hidden = !mayPublish; });
  $("liveStaffList").innerHTML = staffProfiles.length
    ? staffProfiles.map(profile => `${escapeHtml(profile.displayName || profile.email || "Staff member")} · ${escapeHtml(profile.role.replaceAll("_", " "))}${profile.role === "mentor" && profile.mentorTracks?.length ? ` (${escapeHtml(profile.mentorTracks.join(", "))})` : ""}`).join("<br>")
    : "No staff roles have been assigned yet.";
  $("liveAnnouncements").innerHTML = announcements.length
    ? announcements.slice(0, 8).map(item => `<article><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p><small>${escapeHtml(item.audienceTrack === "all" ? "All interns" : item.audienceTrack)}</small></article>`).join("")
    : "No announcements have been published.";
  $("liveResources").innerHTML = resources.length
    ? resources.slice(0, 8).map(item => `<article><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description || "")}</p><a href="${safeHttpsLink(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.type)} ↗</a></article>`).join("")
    : "No resources have been published.";
  $("certificateRequestList").innerHTML = certificateRequests.length
    ? certificateRequests.slice(0, 30).map(request => `<article class="certificate-request"><strong>${escapeHtml(request.displayName || request.email)}</strong><span>${escapeHtml(request.track || "")} · ${escapeHtml(request.status)}</span>${request.feedback ? `<p>${escapeHtml(request.feedback)}</p>` : ""}${roleAccess[staffRole]?.canTasks && request.status === "requested" ? `<button class="row-menu certificate-review" data-uid="${escapeHtml(request.uid)}" data-decision="approved" type="button">Approve</button> <button class="row-menu certificate-review" data-uid="${escapeHtml(request.uid)}" data-decision="declined" type="button">Decline</button>` : ""}</article>`).join("")
    : "No certificate requests are waiting for review.";
}

function updateNotificationBadge() {
  const config = roleAccess[staffRole];
  const pendingActivations = config?.canManage
    ? interns.filter(intern => intern.profileDraft && intern.accountStatus !== "deactivated").length
    : 0;
  const pendingTaskReviews = config?.canTasks
    ? assignments.filter(task => task.status === "submitted").length
    : 0;
  const pendingCertificates = config?.canTasks
    ? certificateRequests.filter(request => request.status === "requested").length
    : 0;
  const total = pendingActivations + pendingTaskReviews + pendingCertificates;
  const badge = $("notificationButton").querySelector(".notification-count");
  badge.textContent = total > 99 ? "99+" : String(total);
  badge.hidden = total === 0;
  $("notificationButton").setAttribute("aria-label", total
    ? `${total} pending HR action${total === 1 ? "" : "s"}`
    : "No pending HR actions");
  return { pendingActivations, pendingTaskReviews, pendingCertificates };
}

function safeHttpsLink(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? escapeHtml(url.href) : "#";
  } catch { return "#"; }
}

function renderMetrics() {
  const today = dateString();
  const selectedMonth = $("attendancePeriod").value;
  const monthAttendance = attendanceRecords.filter(item => item.attendanceDate?.startsWith(selectedMonth));
  const active = interns.filter(intern => internshipIsActive(intern, today)).length;
  const pendingTasks = assignments.filter(item => ["assigned", "submitted", "changes_requested"].includes(item.status)).length;
  const checkedInToday = new Set(attendanceRecords.filter(item => item.attendanceDate === today).map(item => item.uid)).size;
  $("liveInternCount").textContent = String(interns.length);
  $("liveActiveCount").textContent = String(active);
  $("liveOpenTaskCount").textContent = roleAccess[staffRole].canTasks ? String(pendingTasks) : "Restricted";
  $("liveAttendanceCount").textContent = roleAccess[staffRole].canAttendance ? String(monthAttendance.length) : "Restricted";
  $("liveTodayAttendance").textContent = roleAccess[staffRole].canAttendance ? String(checkedInToday) : "—";
  $("liveAttendanceTotal").textContent = roleAccess[staffRole].canAttendance ? String(monthAttendance.length) : "—";
}

function showLiveError(error) {
  console.error("Live HR records could not be loaded.", error);
  const text = error?.code?.includes("permission-denied")
    ? "Firebase denied this staff data read. Publish the latest firestore.rules, then refresh this page."
    : error?.message || "Could not connect to the live Firebase records.";
  $("liveDataNotice").hidden = false;
  $("liveDataNotice").classList.add("is-error");
  $("liveDataNotice").querySelector("p").innerHTML = `<strong>Live data unavailable.</strong> ${escapeHtml(text)}`;
}

async function loadLiveData() {
  const profileDocs = await fetchAllDocs((cursor, pageSize) => query(
    collection(db, "profiles"), where("role", "==", "learner"),
    ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)
  ));
  const profileRows = profileDocs.map(snapshot => ({ uid: snapshot.id, ...snapshot.data() }));
  const draftResults = await Promise.allSettled(profileRows
    .filter(profile => !["active", "completed"].includes(profile.internshipStatus)
      && profile.accountStatus !== "deactivated"
      && (!profile.internshipStatus || profile.internshipStatus === "pending_activation"
        || profile.internshipStatus === "pending"
        || !profile.track || !profile.internshipStartDate || !profile.internshipEndDate))
    .map(async profile => {
      const snapshot = await getDoc(doc(db, "users", profile.uid, "profileDrafts", "current"));
      return snapshot.exists() ? [profile.uid, snapshot.data()] : [profile.uid, null];
    }));
  const drafts = new Map(draftResults
    .filter(result => result.status === "fulfilled" && result.value[1])
    .map(result => result.value));
  interns = profileRows.map(profile => {
    const draft = drafts.get(profile.uid);
    return {
      ...profile,
      ...(draft ? {
        displayName: profile.displayName || draft.displayName,
        email: profile.email || draft.email,
        track: profile.track || draft.track,
        gender: profile.gender || draft.gender,
        phone: profile.phone || draft.phone,
        durationMonths: profile.durationMonths || draft.durationMonths,
        internshipStartDate: profile.internshipStartDate || draft.internshipStartDate,
        internshipEndDate: profile.internshipEndDate || draft.internshipEndDate,
        profileDraft: true
      } : {})
    };
  }).sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));

  const caps = roleAccess[staffRole];
  const warnings = [];
  if (draftResults.some(result => result.status === "rejected")) {
    warnings.push("Pending profile drafts need the latest Firestore rules to be published.");
  }
  const requests = [];
  const contentRequests = [fetchAllDocs((cursor, pageSize) => query(
    collection(db, "profiles"), where("role", "in", [
      "mentor", "hr_manager", "hr_executive", "operations_executive", "admin", "founder", "co_founder"
    ]), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)
  )).then(documents => { staffProfiles = documents.map(document => ({ uid: document.id, ...document.data() })); }), fetchAllDocs((cursor, pageSize) => query(
    collection(db, "announcements"), orderBy("createdAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)
  )).then(documents => { announcements = documents.map(document => ({ id: document.id, ...document.data() })); }), fetchAllDocs((cursor, pageSize) => query(
    collection(db, "learningResources"), orderBy("createdAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)
  )).then(documents => { resources = documents.map(document => ({ id: document.id, ...document.data() })); }), fetchAllDocs((cursor, pageSize) => query(
    collection(db, "certificateRequests"), orderBy("requestedAt", "desc"),
    ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)
  )).then(documents => { certificateRequests = documents.map(document => ({ id: document.id, ...document.data() })); })];
  if (caps.canAttendance) {
    requests.push(fetchAllDocs((cursor, pageSize) => query(
      collectionGroup(db, "attendance"), orderBy("attendanceDate", "desc"),
      ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)
    )).then(documents => {
      attendanceRecords = documents.map(document => ({
        uid: document.ref.parent.parent?.id || "",
        attendanceDate: document.get("attendanceDate") || document.id,
        checkedInAt: document.get("checkedInAt") || null,
        ...(() => {
          const profile = profileRows.find(item => item.uid === document.ref.parent.parent?.id);
          return { displayName: profile?.displayName || "", email: profile?.email || "", track: profile?.track || "" };
        })()
      }));
    }));
  } else attendanceRecords = [];
  if (caps.canTasks) {
    requests.push(fetchAllDocs((cursor, pageSize) => query(
      collection(db, "trainingAssignments"), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)
    )).then(documents => {
      const taskById = window.IntelliCoreCurriculum?.taskById;
      assignments = documents.map(document => {
        const data = document.data();
        const task = taskById?.get(data.taskId);
        const intern = profileRows.find(profile => profile.uid === data.assignedToUid);
        return {
          id: document.id,
          ...data,
          taskTitle: task?.title || data.taskId,
          displayName: intern?.displayName || "",
          track: data.track || intern?.track || ""
        };
      });
    }));
  } else assignments = [];
  const results = await Promise.allSettled(requests);
  let requestIndex = 0;
  if (caps.canAttendance) {
    if (results[requestIndex]?.status === "rejected") {
      attendanceRecords = [];
      warnings.push("Attendance is unavailable. Publish the latest Firestore rules to enable the staff attendance view.");
    }
    requestIndex += 1;
  }
  if (caps.canTasks && results[requestIndex]?.status === "rejected") {
    assignments = [];
    warnings.push("Task records are unavailable. Publish the latest Firestore rules to enable task management data.");
  }
  const contentResults = await Promise.allSettled(contentRequests);
  if (contentResults.some(result => result.status === "rejected")) {
    warnings.push("Announcements, resources, staff roles, or certificate requests could not all be loaded.");
  }

  renderInterns();
  renderDomainCounts();
  renderMetrics();
  renderLiveActivity();
  renderDeadlines();
  renderTaskTools();
  renderSharedContent();
  updateNotificationBadge();
  const notice = $("liveDataNotice");
  notice.hidden = false;
  notice.classList.toggle("is-error", warnings.length > 0);
  notice.querySelector("p").innerHTML = warnings.length
    ? `<strong>Some live sections are unavailable.</strong> ${escapeHtml(warnings.join(" "))}`
    : `<strong>Live records connected.</strong> Showing ${interns.length}${interns.length >= 5000 ? "+" : ""} learner profiles from Firebase.`;
}

async function publishAnnouncement(event) {
  event.preventDefault();
  if (!roleAccess[staffRole]?.canTasks) return showToast("Your role cannot publish announcements.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const body = String(data.get("body") || "").trim();
  const audienceTrack = String(data.get("audienceTrack") || "all");
  if (title.length < 3 || title.length > 120 || !body || body.length > 5000) return showToast("Enter a title and message within the allowed length.");
  try {
    await setDoc(doc(collection(db, "announcements")), {
      title, body, audienceTrack, createdByUid: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });
    form.reset();
    await loadLiveData();
    showToast("Announcement published to the selected interns.");
  } catch (error) {
    console.error("Announcement could not be published.", error);
    showToast(error.message || "Could not publish the announcement.");
  }
}

async function publishResource(event) {
  event.preventDefault();
  if (!roleAccess[staffRole]?.canTasks) return showToast("Your role cannot publish learning resources.");
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = String(data.get("title") || "").trim();
  const description = String(data.get("description") || "").trim();
  const url = String(data.get("url") || "").trim();
  const type = String(data.get("type") || "Link");
  const track = String(data.get("track") || "all");
  if (title.length < 2 || title.length > 120 || description.length > 2000 || !/^https:\/\//i.test(url)) return showToast("Add a title and a valid HTTPS resource link.");
  try {
    await setDoc(doc(collection(db, "learningResources")), {
      title, description, url, type, track, createdByUid: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });
    form.reset();
    await loadLiveData();
    showToast("Learning resource published.");
  } catch (error) {
    console.error("The learning resource could not be published.", error);
    showToast(error.message || "Could not publish the learning resource.");
  }
}

async function reviewCertificateRequest(uid, status, button) {
  button.disabled = true;
  try {
    await runTransaction(db, async transaction => {
      const requestRef = doc(db, "certificateRequests", uid);
      const request = await transaction.get(requestRef);
      if (!request.exists() || request.get("status") !== "requested") throw new Error("This certificate request has already been reviewed.");
      transaction.update(requestRef, {
        status,
        feedback: status === "approved" ? "Certificate review approved. Contact HR to receive the verified certificate document." : "Certificate request declined. Contact HR for next steps.",
        reviewedByUid: auth.currentUser.uid,
        reviewedAt: serverTimestamp()
      });
    });
    await loadLiveData();
    showToast(status === "approved" ? "Certificate request approved for HR follow-up." : "Certificate request declined.");
  } catch (error) {
    console.error("Certificate request could not be reviewed.", error);
    showToast(error.message || "Could not review certificate request.");
    button.disabled = false;
  }
}

function configureRole(role, name) {
  staffRole = role;
  const config = roleAccess[role];
  $("userName").textContent = name;
  $("userRole").textContent = config.label;
  $("mobileWelcomeName").textContent = name.split(/\s+/)[0];
  $("welcomeCopy").textContent = `Welcome back, ${name.split(/\s+/)[0]}. Review live intern profiles and authorized records.`;
  $("roleScope").textContent = pendingActivationView && ["founder", "co_founder"].includes(role)
    ? `${config.label} · Pending activation queue`
    : `HR workspace · ${config.label} access`;
  $("userAvatar").textContent = initials(name);
  $("profileEmail").textContent = auth.currentUser?.email || "Signed in with an authorized staff account.";
  document.querySelectorAll("[data-capability]").forEach(item => {
    const capability = item.dataset.capability;
    item.hidden = !config.capabilities.includes(capability);
  });
  $("exportButton").disabled = !config.canManage;
  if (!config.canTasks) $("tasks").hidden = true;
  if (!config.canAttendance) $("attendance").hidden = true;
}

async function activateIntern(button) {
  if (!roleAccess[staffRole]?.canManage) return showToast("Your role cannot activate internship profiles.");
  const uid = button.dataset.uid;
  if (!uid) return;
  button.disabled = true;
  button.textContent = "Activating…";
  try {
    await runTransaction(db, async transaction => {
      const profileRef = doc(db, "profiles", uid);
      const draftRef = doc(db, "users", uid, "profileDrafts", "current");
      const [profileSnapshot, draftSnapshot] = await Promise.all([
        transaction.get(profileRef), transaction.get(draftRef)
      ]);
      if (!profileSnapshot.exists()) throw new Error("The intern profile could not be found.");
      if (!draftSnapshot.exists()) throw new Error("This intern has not saved an internship profile draft.");
      const profile = profileSnapshot.data();
      const draft = draftSnapshot.data();
      if (profile.role !== "learner") throw new Error("Only learner profiles can be activated.");
      if (profile.accountStatus === "deactivated") throw new Error("This intern account is deactivated.");
      if (profile.internshipStatus === "active") throw new Error("This internship is already active.");
      if (!tracks.includes(draft.track) || ![1, 2, 3, 6].includes(draft.durationMonths)
        || !["Female", "Male"].includes(draft.gender)
        || !/^\d{4}-\d{2}-\d{2}$/.test(draft.internshipStartDate || "")
        || !/^\d{4}-\d{2}-\d{2}$/.test(draft.internshipEndDate || "")) {
        throw new Error("The saved internship profile is incomplete or invalid.");
      }
      transaction.update(profileRef, {
        displayName: draft.displayName,
        gender: draft.gender,
        phone: draft.phone,
        track: draft.track,
        durationMonths: draft.durationMonths,
        internshipStartDate: draft.internshipStartDate,
        internshipEndDate: draft.internshipEndDate,
        internshipStatus: "active",
        accountStatus: "active",
        profileCompletedAt: serverTimestamp(),
        profileUpdatedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp()
      });
    });
    showToast("Internship profile activated.");
    await loadLiveData();
  } catch (error) {
    console.error("Internship activation failed.", error);
    const message = error?.code?.includes("permission-denied")
      ? "Activation was denied. Publish the latest Firestore rules, then refresh and try again."
      : error?.message || "Could not activate this internship profile.";
    showToast(message);
    button.disabled = false;
    button.textContent = "Activate";
  }
}

function csvCell(value) { return `"${String(value ?? "").replaceAll('"', '""')}"`; }
function exportInterns() {
  if (!roleAccess[staffRole].canManage) return showToast("Your role cannot export intern records.");
  const rows = [["Name", "Email", "Domain", "Status", "Phone", "Start date", "End date"]];
  filteredInterns().forEach(intern => rows.push([
    intern.displayName, intern.email, intern.track, statusFor(intern), intern.phone,
    intern.internshipStartDate, intern.internshipEndDate
  ]));
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "intellicore-interns.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function setMobileNavOpen(open) {
  $("sidebar").classList.toggle("open", open);
  $("sidebarOverlay").hidden = !open;
  $("mobileMenu").textContent = open ? "×" : "☰";
  $("mobileMenu").setAttribute("aria-expanded", String(open));
  $("mobileMenu").setAttribute("aria-label", open ? "Close dashboard navigation" : "Open dashboard navigation");
}

async function logout() {
  try { await signOut(auth); window.location.replace("index.html"); }
  catch (error) { console.error("Staff sign-out failed.", error); showToast("Sign out failed. Please try again."); }
}

onAuthStateChanged(auth, async user => {
  if (!user) { window.location.replace("index.html?auth=login"); return; }
  try {
    await user.reload();
    const activeUser = auth.currentUser;
    if (!activeUser || activeUser.uid !== user.uid) return;
    const token = await activeUser.getIdTokenResult(true);
    const provider = token.claims.firebase?.sign_in_provider;
    const verified = token.claims.email_verified === true
      && (provider !== "password" || activeUser.emailVerified)
      && ["google.com", "password"].includes(provider);
    if (!verified) { window.location.replace("index.html?auth=login&verification=required"); return; }
    const email = activeUser.email?.trim().toLowerCase() || "";
    const claimedRole = token.claims.role;
    const profileSnapshot = await getDoc(doc(db, "profiles", activeUser.uid));
    const storedRole = profileSnapshot.exists() ? profileSnapshot.get("role") : "";
    const role = email === "ctrlabhishek@gmail.com"
      ? "founder"
      : staffRolesByEmail.get(email)
        || (roleAccess[storedRole] ? storedRole : roleAccess[claimedRole] ? claimedRole : "");
    if (["founder", "co_founder"].includes(role) && !pendingActivationView) { window.location.replace("founder-dashboard.html"); return; }
    if (!roleAccess[role]) { window.location.replace("Intern-dashboard.html"); return; }

    configureRole(role, activeUser.displayName?.trim() || roleAccess[role].label);
    $("authState").hidden = true;
    $("dashboardShell").hidden = false;
    try {
      await loadLiveData();
      dataRefreshTimer = window.setInterval(() => { void loadLiveData().catch(showLiveError); }, 60000);
    } catch (error) { showLiveError(error); }
  } catch (error) {
    console.error("HR dashboard access could not be verified.", error);
    $("authState").textContent = "Access could not be verified. Please return to sign in and try again.";
  }
});

$("sidebarLogout").addEventListener("click", logout);
$("topbarLogout").addEventListener("click", logout);
$("sidebarClose").addEventListener("click", () => setMobileNavOpen(false));
$("mobileMenu").addEventListener("click", () => setMobileNavOpen(!$("sidebar").classList.contains("open")));
$("sidebarOverlay").addEventListener("click", () => setMobileNavOpen(false));
$("sidebar").querySelectorAll(".nav-link:not(.nav-button)").forEach(link => {
  link.addEventListener("click", () => {
    $("sidebar").querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
    setMobileNavOpen(false);
  });
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && $("sidebar").classList.contains("open")) setMobileNavOpen(false);
});
$("internSearch").addEventListener("input", renderInterns);
configureAttendancePeriods();
$("domainFilter").innerHTML = `<option value="">All Domains</option>${tracks.map(track => `<option value="${escapeHtml(track)}">${escapeHtml(track)}</option>`).join("")}`;
$("domainFilter").addEventListener("change", renderInterns);
$("attendancePeriod").addEventListener("change", () => { renderMetrics(); renderInterns(); });
document.querySelector('[aria-label="Filter by status"]').innerHTML = "<option value=\"\">All Statuses</option><option>Active</option><option>Pending activation</option><option>Scheduled</option><option>Completed</option><option>Deactivated</option><option>Profile incomplete</option>";
if (pendingActivationView) document.querySelector('[aria-label="Filter by status"]').value = "Pending activation";
document.querySelector('[aria-label="Filter by status"]').addEventListener("change", renderInterns);
$("internRows").addEventListener("click", event => {
  const button = event.target.closest(".activate-intern");
  if (button) void activateIntern(button);
});
$("announcementForm").addEventListener("submit", publishAnnouncement);
$("resourceForm").addEventListener("submit", publishResource);
$("certificateRequestList").addEventListener("click", event => {
  const button = event.target.closest(".certificate-review");
  if (!button) return;
  void reviewCertificateRequest(button.dataset.uid, button.dataset.decision, button);
});
$("exportButton").addEventListener("click", exportInterns);
$("notificationButton").addEventListener("click", () => {
  const pending = updateNotificationBadge();
  if (pending.pendingActivations) {
    window.location.href = "hr-dashboard.html?view=pending-activation";
  } else if (pending.pendingTaskReviews) {
    window.location.hash = "tasks";
  } else if (pending.pendingCertificates) {
    window.location.hash = "certificates";
  } else {
    showToast("There are no pending HR actions.");
  }
});
$("globalSearch").addEventListener("keydown", event => {
  if (event.key !== "Enter" || !event.currentTarget.value.trim()) return;
  $("internSearch").value = event.currentTarget.value.trim();
  renderInterns();
  $("interns").scrollIntoView({ behavior: "smooth", block: "start" });
});
window.addEventListener("beforeunload", () => window.clearInterval(dataRefreshTimer));
