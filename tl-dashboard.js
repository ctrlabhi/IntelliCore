import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, collectionGroup, doc, getDoc, getDocs, getFirestore, limit,
  query, serverTimestamp, setDoc, startAfter, where
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
const auth = getAuth(initializeApp(firebaseConfig));
const db = getFirestore(auth.app);
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const indiaDate = (date = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
let authorizedTracks = [];
let selectedTrack = "";
let liveInterns = [];
let liveAssignments = [];
let liveAttendance = [];
let refreshTimer = null;
function timestampMillis(value) { return value?.toMillis?.() || (typeof value === "number" ? value : Date.parse(value || "") || 0); }
async function fetchAllDocs(buildQuery) {
  const documents = [];
  let cursor = null;
  while (true) {
    const pageSize = 500;
    const page = await getDocs(buildQuery(cursor, pageSize));
    documents.push(...page.docs);
    if (page.size < pageSize) break;
    cursor = page.docs.at(-1) || null;
    if (!cursor) break;
  }
  return documents;
}
function internStatus(intern) {
  const today = indiaDate();
  if (intern.accountStatus === "deactivated") return "Deactivated";
  if (intern.internshipStatus === "completed" || (intern.internshipEndDate && intern.internshipEndDate < today)) return "Completed";
  if (intern.internshipStatus !== "active" || !intern.internshipStartDate || !intern.internshipEndDate) return "Pending activation";
  if (intern.internshipStartDate > today) return "Scheduled";
  return "Active";
}
function activeTrackList() { return selectedTrack === "__all__" ? authorizedTracks : [selectedTrack]; }
function monthDays(month) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number, 0)).getUTCDate();
}
function expectedWorkdays(intern, month) {
  const today = indiaDate();
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(monthDays(month)).padStart(2, "0")}`;
  const start = intern.internshipStartDate > monthStart ? intern.internshipStartDate : monthStart;
  const endBound = monthEnd < today ? monthEnd : today;
  const end = intern.internshipEndDate && intern.internshipEndDate < endBound ? intern.internshipEndDate : endBound;
  if (!start || start > end) return 0;
  let count = 0;
  for (let date = new Date(`${start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`); date <= last; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0) count += 1;
  }
  return count;
}
function filteredInterns() {
  const search = $("internSearch").value.trim().toLowerCase();
  const status = $("statusFilter").value;
  return liveInterns.filter(intern => (!search || `${intern.displayName} ${intern.email}`.toLowerCase().includes(search))
    && (status === "all" || internStatus(intern) === status));
}
function renderLiveTeam() {
  const month = $("tlAttendancePeriod").value;
  const today = indiaDate();
  const monthRecords = liveAttendance.filter(item => item.attendanceDate?.startsWith(month));
  const attendanceByIntern = new Map();
  monthRecords.forEach(item => attendanceByIntern.set(item.uid, (attendanceByIntern.get(item.uid) || 0) + 1));
  const completedTasks = liveAssignments.filter(item => ["approved", "completed"].includes(item.status)).length;
  const pendingTasks = liveAssignments.filter(item => ["assigned", "submitted", "changes_requested"].includes(item.status)).length;
  const possible = liveInterns.reduce((sum, intern) => sum + expectedWorkdays(intern, month), 0);
  const attendanceRate = possible ? Math.min(100, Math.round(monthRecords.length / possible * 100)) : 0;
  $("tlInternCount").textContent = String(liveInterns.length);
  $("tlDomainCount").textContent = String(liveInterns.length);
  $("tlActiveCount").textContent = String(liveInterns.filter(intern => internStatus(intern) === "Active").length);
  $("tlDomainActive").textContent = String(liveInterns.filter(intern => internStatus(intern) === "Active").length);
  $("tlDomainInactive").textContent = String(liveInterns.filter(intern => internStatus(intern) !== "Active").length);
  $("tlPendingTasks").textContent = String(pendingTasks);
  $("tlCompletedTasks").textContent = String(completedTasks);
  $("tlAttendanceRate").textContent = `${attendanceRate}%`;
  $("tlAttendanceRing").textContent = `${attendanceRate}%`;
  $("tlPresentCount").textContent = String(monthRecords.length);
  $("tlAbsentCount").textContent = String(Math.max(0, possible - monthRecords.length));
  const completion = liveAssignments.length ? Math.round(completedTasks / liveAssignments.length * 100) : 0;
  $("tlDomainCompletion").textContent = `${completion}%`;
  $("tlTaskSummary").innerHTML = `<strong>${liveAssignments.length}</strong> assigned · <strong>${completedTasks}</strong> approved · <strong>${pendingTasks}</strong> awaiting work or review`;
  const taskById = window.IntelliCoreCurriculum?.taskById;
  const internByUid = new Map(liveInterns.map(intern => [intern.uid, intern]));
  const tasksByIntern = new Map();
  liveAssignments.forEach(task => tasksByIntern.set(task.assignedToUid, [...(tasksByIntern.get(task.assignedToUid) || []), task]));
  $("internRows").innerHTML = filteredInterns().map((intern, index) => {
    const status = internStatus(intern);
    const className = status === "Active" ? "active" : status === "Completed" ? "complete" : "hold";
    const tasks = tasksByIntern.get(intern.uid) || [];
    const present = attendanceByIntern.get(intern.uid) || 0;
    const expected = expectedWorkdays(intern, month);
    const rate = expected ? Math.min(100, Math.round(present / expected * 100)) : 0;
    return `<tr data-status="${escapeHtml(status)}"><td>${String(index + 1).padStart(2, "0")}</td><td><span class="table-avatar">${escapeHtml((intern.displayName || intern.email || "I").split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase())}</span>${escapeHtml(intern.displayName || "Intern")}</td><td>${escapeHtml(intern.email || "—")}</td><td><span class="table-status ${className}">${escapeHtml(status)}</span></td><td>${rate}% (${present})</td><td>${tasks.filter(task => ["approved", "completed"].includes(task.status)).length}/${tasks.length}</td><td>${escapeHtml(intern.internshipStartDate || "—")}</td><td>${escapeHtml(intern.internshipEndDate || "—")}</td><td><a class="row-menu" href="Intern-dashboard.html?workspace=operations#icTrainingSection" aria-label="Open training workspace">↗</a></td></tr>`;
  }).join("");
  const visible = filteredInterns().length;
  $("emptySearch").hidden = visible > 0;
  const taskTitles = taskById;
  const deadlines = liveAssignments.filter(item => item.dueDate && item.dueDate >= today && !["approved", "completed"].includes(item.status))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 7);
  $("liveTeamDeadlines").innerHTML = deadlines.length ? deadlines.map(task => {
    const title = taskTitles?.get(task.taskId)?.title || task.taskId;
    const day = task.dueDate.slice(8, 10);
    const monthName = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${task.dueDate}T00:00:00Z`)).toUpperCase();
    const intern = internByUid.get(task.assignedToUid);
    return `<div class="deadline-row"><span class="date-badge"><small>${monthName}</small><b>${day}</b></span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(intern?.displayName || intern?.email || "Intern")}</small></span><b class="tag team-task-tag">Task</b></div>`;
  }).join("") : "<p>No upcoming assigned-task deadlines.</p>";
  const activity = [
    ...liveAssignments.map(task => ({ at: timestampMillis(task.updatedAt || task.assignedAt), intern: internByUid.get(task.assignedToUid), detail: `Task ${task.status || "updated"}` })),
    ...liveAttendance.map(record => ({ at: timestampMillis(record.checkedInAt), intern: internByUid.get(record.uid), detail: `Checked in · ${record.attendanceDate}` }))
  ].filter(item => item.at).sort((a, b) => b.at - a.at).slice(0, 8);
  $("liveTeamActivity").innerHTML = activity.length ? activity.map((item, index) => {
    const name = item.intern?.displayName || item.intern?.email || "Intern";
    const age = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.at));
    return `<li><span class="staff-avatar avatar-${index % 5 + 1}">${escapeHtml(name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase())}</span><span><strong>${escapeHtml(name)} <small>${escapeHtml(item.detail)}</small></strong></span><time>${escapeHtml(age)}</time></li>`;
  }).join("") : "<li>No attendance or task activity has been recorded yet.</li>";
  updateTeamNotificationBadge();
}

function updateTeamNotificationBadge() {
  const pendingReviews = liveAssignments.filter(task => task.status === "submitted").length;
  const badge = $("notificationButton").querySelector(".notification-count");
  badge.textContent = pendingReviews > 99 ? "99+" : String(pendingReviews);
  badge.hidden = pendingReviews === 0;
  $("notificationButton").setAttribute("aria-label", pendingReviews
    ? `${pendingReviews} task submission${pendingReviews === 1 ? "" : "s"} awaiting review`
    : "No task submissions are awaiting review");
  return pendingReviews;
}
async function loadLiveTeam() {
  const selectedTracks = activeTrackList();
  if (!selectedTracks.length) throw new Error("No authorized internship tracks are assigned to this Team Leader account.");
  const [profilePages, taskPages, attendancePages] = await Promise.all([
    Promise.all(selectedTracks.map(track => fetchAllDocs((cursor, pageSize) => query(collection(db, "profiles"), where("role", "==", "learner"), where("track", "==", track), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize))))),
    Promise.all(selectedTracks.map(track => fetchAllDocs((cursor, pageSize) => query(collection(db, "trainingAssignments"), where("track", "==", track), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize))))),
    Promise.all(selectedTracks.map(track => fetchAllDocs((cursor, pageSize) => query(collectionGroup(db, "attendance"), where("track", "==", track), ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)))))
  ]);
  const profiles = new Map(profilePages.flat().map(snapshot => [snapshot.id, { uid: snapshot.id, ...snapshot.data() }]));
  liveInterns = [...profiles.values()].sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));
  const assignments = new Map(taskPages.flat().map(snapshot => [snapshot.id, { id: snapshot.id, ...snapshot.data() }]));
  liveAssignments = [...assignments.values()];
  const attendance = new Map(attendancePages.flat().map(snapshot => [snapshot.ref.path, {
    uid: snapshot.ref.parent.parent?.id || "", attendanceDate: snapshot.get("attendanceDate") || snapshot.id,
    checkedInAt: snapshot.get("checkedInAt") || null
  }]));
  liveAttendance = [...attendance.values()];
  renderLiveTeam();
}
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

function setMobileNavOpen(open) {
  $("sidebar").classList.toggle("open", open);
  $("sidebarOverlay").hidden = !open;
  $("mobileMenu").textContent = open ? "×" : "☰";
  $("mobileMenu").setAttribute("aria-expanded", String(open));
  $("mobileMenu").setAttribute("aria-label", open ? "Close dashboard navigation" : "Open dashboard navigation");
  (open ? $("sidebarClose") : $("mobileMenu")).focus({ preventScroll: true });
}

function closeMobileNav() {
  setMobileNavOpen(false);
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

    const profileSnapshot = await getDoc(doc(db, "profiles", latestUser.uid));
    const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
    if (profile.accountStatus === "deactivated") {
      await signOut(auth);
      window.location.replace("index.html?auth=login&deactivated=1");
      return;
    }
    const role = profile.role || token.claims.role;
    if (role !== "mentor") {
      window.location.replace("Intern-dashboard.html?workspace=operations");
      return;
    }

    authorizedTracks = Array.isArray(profile.mentorTracks || token.claims.mentorTracks)
      ? [...new Set((profile.mentorTracks || token.claims.mentorTracks).filter(track => allowedTracks.includes(track)))]
      : [];
    if (!authorizedTracks.length) {
      window.location.replace("Intern-dashboard.html?workspace=operations");
      return;
    }
    selectedTrack = authorizedTracks.length > 1 ? "__all__" : authorizedTracks[0];

    const name = latestUser.displayName?.trim() || "Team Leader";
    $("userName").textContent = name;
    $("mobileWelcomeName").textContent = name.split(/\s+/)[0];
    $("userAvatar").textContent = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
    $("profileEmail").textContent = latestUser.email || "Authorized Team Leader account";
    $("domainSelect").innerHTML = `${authorizedTracks.length > 1 ? '<option value="__all__">All my assigned domains</option>' : ""}${authorizedTracks.map(track =>
      `<option value="${track}">${trackLabel(track)}</option>`
    ).join("")}`;
    $("domainSelect").value = selectedTrack;
    $("domainSelect").hidden = authorizedTracks.length < 2;
    $("domainLabel").textContent = selectedTrack === "__all__"
      ? `${authorizedTracks.length} authorized domains`
      : trackLabel(selectedTrack);
    const [year, month] = indiaDate().slice(0, 7).split("-").map(Number);
    const previousDate = new Date(Date.UTC(year, month - 2, 1));
    const currentMonth = indiaDate().slice(0, 7);
    const previousMonth = `${previousDate.getUTCFullYear()}-${String(previousDate.getUTCMonth() + 1).padStart(2, "0")}`;
    $("tlAttendancePeriod").innerHTML = `<option value="${currentMonth}">This Month</option><option value="${previousMonth}">Last Month</option>`;
    $("domainSelect").addEventListener("change", event => {
      selectedTrack = event.currentTarget.value;
      $("domainLabel").textContent = selectedTrack === "__all__" ? `${authorizedTracks.length} authorized domains` : trackLabel(selectedTrack);
      void loadLiveTeam().catch(error => showToast(error.message || "Could not load this track."));
    });

    $("authState").hidden = true;
    $("dashboardShell").hidden = false;
    await loadLiveTeam();
    refreshTimer = window.setInterval(() => { void loadLiveTeam().catch(error => console.error("Live TL data refresh failed.", error)); }, 60000);
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
$("topbarLogout").addEventListener("click", logout);
$("sidebarClose").addEventListener("click", closeMobileNav);
$("mobileMenu").addEventListener("click", () => setMobileNavOpen(!$("sidebar").classList.contains("open")));
$("sidebarOverlay").addEventListener("click", closeMobileNav);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && $("sidebar").classList.contains("open")) closeMobileNav();
});
$("sidebar").querySelectorAll(".nav-link:not(.nav-button)").forEach(link => {
  link.addEventListener("click", () => {
    $("sidebar").querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
    closeMobileNav();
  });
});
$("notificationButton").addEventListener("click", () => {
  const pendingReviews = updateTeamNotificationBadge();
  if (pendingReviews) {
    window.location.href = "Intern-dashboard.html?workspace=operations#icReviewQueue";
  } else {
    showToast("No task submissions are waiting for review. Team records refresh from Firebase every minute.");
  }
});

function filterInterns() {
  renderLiveTeam();
}

$("internSearch").addEventListener("input", filterInterns);
$("statusFilter").addEventListener("change", filterInterns);
$("exportButton").addEventListener("click", () => {
  const rows = [["Name", "Email", "Track", "Status", "Attendance", "Tasks completed", "Tasks assigned", "Start", "End"]];
  const month = $("tlAttendancePeriod").value;
  const assignmentsByIntern = new Map();
  liveAssignments.forEach(task => assignmentsByIntern.set(task.assignedToUid, [...(assignmentsByIntern.get(task.assignedToUid) || []), task]));
  const attendanceByIntern = new Map();
  liveAttendance.filter(item => item.attendanceDate?.startsWith(month))
    .forEach(item => attendanceByIntern.set(item.uid, (attendanceByIntern.get(item.uid) || 0) + 1));
  filteredInterns().forEach(intern => {
    const tasks = assignmentsByIntern.get(intern.uid) || [];
    const attendance = attendanceByIntern.get(intern.uid) || 0;
    const expected = expectedWorkdays(intern, month);
    rows.push([intern.displayName, intern.email, intern.track, internStatus(intern), `${expected ? Math.min(100, Math.round(attendance / expected * 100)) : 0}%`, tasks.filter(task => ["approved", "completed"].includes(task.status)).length, tasks.length, intern.internshipStartDate, intern.internshipEndDate]);
  });
  const csv = rows.map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "intellicore-team-report.csv";
  link.click();
  URL.revokeObjectURL(url);
});
$("globalSearch").addEventListener("keydown", event => {
  if (event.key === "Enter" && event.currentTarget.value.trim()) {
    const query = event.currentTarget.value.trim().toLowerCase();
    const match = [...document.querySelectorAll(".module-card, .panel, .stat-card")]
      .find(item => item.textContent.toLowerCase().includes(query));
    if (match) match.scrollIntoView({ behavior: "smooth", block: "center" });
    else showToast("No matching live dashboard content found.");
  }
});

$("tlAttendancePeriod").addEventListener("change", renderLiveTeam);
$("messageTeamButton").addEventListener("click", async () => {
  const choice = selectedTrack === "__all__"
    ? window.prompt(`Choose one assigned track:\n${authorizedTracks.map((item, index) => `${index + 1}. ${trackLabel(item)}`).join("\n")}`)
    : selectedTrack;
  const audienceTrack = authorizedTracks.includes(choice)
    ? choice
    : Number.isInteger(Number(choice)) ? authorizedTracks[Number(choice) - 1] : "";
  if (!audienceTrack) return showToast("Choose one of your assigned tracks to message.");
  const title = window.prompt("Announcement title:")?.trim();
  if (!title) return;
  const body = window.prompt("Message for this track:")?.trim();
  if (!body) return;
  try {
    await setDoc(doc(collection(db, "announcements")), {
      title, body, audienceTrack, createdByUid: auth.currentUser.uid, createdAt: serverTimestamp()
    });
    showToast(`Announcement published to ${trackLabel(audienceTrack)} interns.`);
  } catch (error) {
    console.error("The track announcement could not be published.", error);
    showToast(error.message || "Could not publish the announcement.");
  }
});
window.addEventListener("beforeunload", () => { if (refreshTimer !== null) window.clearInterval(refreshTimer); });
