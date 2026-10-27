import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, collectionGroup, doc, getDoc, getDocs, getFirestore, limit, orderBy, query, runTransaction,
  serverTimestamp, setDoc, where
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
const tracks = [
  "Business Analyst Intern", "Web Development Intern", "Data Analyst Intern",
  "Digital Marketing Intern", "Graphic Designer Intern", "Social Media Intern",
  "Content Writing Intern", "Human Resources Intern"
];
const $ = id => document.getElementById(id);
const authState = $("authState");
const shell = $("dashboardShell");
let toastTimer;
let roleAssignmentBusy = false;
let founderInterns = [];
let founderStaff = [];
let founderAssignments = [];
let founderAttendance = [];
let founderDraftUids = new Set();
let founderPendingCertificates = 0;

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3600);
}

function updateFounderNotificationBadge() {
  const total = founderDraftUids.size + founderPendingCertificates;
  const badge = $("notificationButton").querySelector(".notification-count");
  badge.textContent = total > 99 ? "99+" : String(total);
  badge.hidden = total === 0;
  $("notificationButton").setAttribute("aria-label", total
    ? `${total} pending approval${total === 1 ? "" : "s"}`
    : "No pending approvals");
}

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const indiaDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const stamp = value => value?.toMillis?.() || 0;
function founderStatus(profile, today = indiaDate()) {
  if (profile.accountStatus === "deactivated") return "Deactivated";
  if (founderDraftUids.has(profile.uid) || !profile.track) return "Pending activation";
  if (profile.internshipStatus === "completed" || profile.internshipEndDate < today) return "Completed";
  if (profile.internshipStartDate > today) return "Scheduled";
  return profile.internshipStatus === "active" ? "Active" : "Pending activation";
}
function workdaysBetween(startValue, endValue) {
  if (!startValue || !endValue || startValue > endValue) return 0;
  let count = 0;
  for (let date = new Date(`${startValue}T00:00:00Z`), end = new Date(`${endValue}T00:00:00Z`); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0) count += 1;
  }
  return count;
}
function renderFounderOverview() {
  const today = indiaDate();
  const month = today.slice(0, 7);
  const monthStart = `${month}-01`;
  const activeInterns = founderInterns.filter(profile => founderStatus(profile, today) === "Active");
  const monthAttendance = founderAttendance.filter(item => item.attendanceDate?.startsWith(month));
  const expected = activeInterns.reduce((total, profile) => total + workdaysBetween(
    profile.internshipStartDate > monthStart ? profile.internshipStartDate : monthStart,
    profile.internshipEndDate < today ? profile.internshipEndDate : today
  ), 0);
  const rate = expected ? Math.min(100, Math.round(monthAttendance.length / expected * 100)) : 0;
  const pendingTasks = founderAssignments.filter(item => ["assigned", "submitted", "changes_requested"].includes(item.status)).length;
  $("founderInternCount").textContent = String(founderInterns.length);
  $("founderStaffCount").textContent = String(founderStaff.length);
  $("founderPendingTaskCount").textContent = String(pendingTasks);
  $("founderAttendanceRate").textContent = `${rate}%`;
  $("founderDomainTotal").textContent = String(founderInterns.length);
  const counts = new Map(tracks.map(track => [track, founderInterns.filter(profile => profile.track === track).length]));
  $("founderDomainLegend").innerHTML = tracks.map((track, index) => `<li><i class="c${index + 1}"></i><span>${escapeHtml(track.replace(/ Intern$/, ""))}</span><b>${counts.get(track)}</b></li>`).join("");
  $("founderLiveOverview").textContent = `${activeInterns.length} active internships from ${founderInterns.length} registered learner profiles. ${founderStaff.length} staff roles are assigned.`;
  $("founderStaffList").innerHTML = founderStaff.length
    ? founderStaff.map((profile, index) => `<div class="staff-row"><span class="staff-avatar avatar-${index % 5 + 1}">${escapeHtml((profile.displayName || profile.email || "S").split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase())}</span><span class="person"><strong>${escapeHtml(profile.displayName || profile.email || "Staff member")}</strong><small>${escapeHtml(profile.role.replaceAll("_", " "))}${profile.role === "mentor" && profile.mentorTracks?.length ? ` · ${escapeHtml(profile.mentorTracks.join(", "))}` : ""}</small></span></div>`).join("")
    : "<p>No staff roles have been assigned yet.</p>";
  const attendanceByUid = new Map();
  monthAttendance.forEach(record => attendanceByUid.set(record.uid, (attendanceByUid.get(record.uid) || 0) + 1));
  const search = $("internSearch").value.trim().toLowerCase();
  const domain = $("domainFilter").value;
  const visible = founderInterns.filter(profile => (!search || `${profile.displayName} ${profile.email}`.toLowerCase().includes(search))
    && (!domain || profile.track === domain));
  $("internRows").innerHTML = visible.map((profile, index) => {
    const status = founderStatus(profile, today);
    const expectedDays = workdaysBetween(profile.internshipStartDate > monthStart ? profile.internshipStartDate : monthStart,
      profile.internshipEndDate < today ? profile.internshipEndDate : today);
    const present = attendanceByUid.get(profile.uid) || 0;
    const attendanceRate = expectedDays ? `${Math.min(100, Math.round(present / expectedDays * 100))}%` : "—";
    const className = status === "Active" ? "active" : status === "Completed" ? "complete" : "pending";
    return `<tr><td>${String(index + 1).padStart(2, "0")}</td><td><span class="table-avatar">${escapeHtml((profile.displayName || profile.email || "I").split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase())}</span>${escapeHtml(profile.displayName || "Name not set")}</td><td>${escapeHtml((profile.track || "Not selected").replace(/ Intern$/, ""))}</td><td>Intern</td><td><span class="table-status ${className}">${escapeHtml(status)}</span></td><td>${attendanceRate}</td><td>${escapeHtml(profile.internshipStartDate || "—")}</td><td>${escapeHtml(profile.internshipEndDate || "—")}</td></tr>`;
  }).join("");
  $("emptySearch").hidden = visible.length > 0;
  const activity = [
    ...founderAssignments.map(item => ({ at: stamp(item.updatedAt || item.assignedAt), label: `Task ${item.status || "updated"}`, detail: item.taskTitle || item.taskId })),
    ...founderAttendance.map(item => ({ at: stamp(item.checkedInAt), label: "Attendance check-in", detail: `${item.displayName || item.email || "Intern"} · ${item.attendanceDate}` }))
  ].filter(item => item.at).sort((a, b) => b.at - a.at).slice(0, 8);
  $("founderRecentActivity").innerHTML = activity.length ? activity.map((item, index) => `<li><span class="activity-icon ${["blue", "cyan", "green", "violet"][index % 4]}">${index % 2 ? "▣" : "✓"}</span><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.detail || "Workspace record")}</small></span><time>${escapeHtml(new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.at)))}</time></li>`).join("") : "<li>No live attendance or task activity has been recorded yet.</li>";
}
async function loadFounderOverview() {
  const [learners, staff, assignments, attendance, certificates] = await Promise.all([
    getDocs(query(collection(db, "profiles"), where("role", "==", "learner"), limit(1000))),
    getDocs(query(collection(db, "profiles"), where("role", "in", ["mentor", "hr_manager", "hr_executive", "operations_executive", "admin", "co_founder"]), limit(500))),
    getDocs(query(collection(db, "trainingAssignments"), limit(1000))),
    getDocs(query(collectionGroup(db, "attendance"), orderBy("attendanceDate", "desc"), limit(1000))),
    getDocs(query(collection(db, "certificateRequests"), where("status", "==", "requested"), limit(100)))
  ]);
  founderInterns = learners.docs.map(snapshot => ({ uid: snapshot.id, ...snapshot.data() }));
  founderStaff = staff.docs.map(snapshot => ({ uid: snapshot.id, ...snapshot.data() }));
  founderAssignments = assignments.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data(), taskTitle: window.IntelliCoreCurriculum?.taskById?.get(snapshot.get("taskId"))?.title || snapshot.get("taskId") }));
  founderAttendance = attendance.docs.map(snapshot => ({
    uid: snapshot.ref.parent.parent?.id || "", attendanceDate: snapshot.get("attendanceDate") || snapshot.id,
    checkedInAt: snapshot.get("checkedInAt") || null,
    displayName: founderInterns.find(profile => profile.uid === snapshot.ref.parent.parent?.id)?.displayName || "",
    email: founderInterns.find(profile => profile.uid === snapshot.ref.parent.parent?.id)?.email || ""
  }));
  const pendingProfiles = founderInterns.filter(profile => profile.internshipStatus !== "active" && profile.accountStatus !== "deactivated");
  const draftSnapshots = await Promise.all(pendingProfiles.map(async profile => {
    const draft = await getDoc(doc(db, "users", profile.uid, "profileDrafts", "current"));
    return draft.exists() ? profile.uid : "";
  }));
  founderDraftUids = new Set(draftSnapshots.filter(Boolean));
  founderPendingCertificates = certificates.size;
  updateFounderNotificationBadge();
  const approvals = [
    ...[...founderDraftUids].map(uid => {
      const profile = founderInterns.find(item => item.uid === uid);
      return `<div class="approval-row"><span class="approval-mark amber">↗</span><span><strong>Internship activation</strong><small>${escapeHtml(profile?.displayName || profile?.email || "Intern")}</small></span><a class="tag amber-tag" href="hr-dashboard.html?view=pending-activation">Review</a></div>`;
    }),
    ...certificates.docs.map(snapshot => `<div class="approval-row"><span class="approval-mark violet">✧</span><span><strong>Certificate request</strong><small>${escapeHtml(snapshot.get("displayName") || snapshot.get("email") || "Intern")}</small></span><button class="tag violet-tag" type="button" data-founder-certificate="${escapeHtml(snapshot.id)}">Approve</button></div>`)
  ];
  $("founderApprovalList").innerHTML = approvals.length ? approvals.slice(0, 10).join("") : "<p>No profile activations or certificate requests are waiting.</p>";
  const currentDomain = $("domainFilter").value;
  $("domainFilter").innerHTML = `<option value="">All Domains</option>${tracks.map(track => `<option value="${escapeHtml(track)}">${escapeHtml(track.replace(/ Intern$/, ""))}</option>`).join("")}`;
  if (tracks.includes(currentDomain)) $("domainFilter").value = currentDomain;
  renderFounderOverview();
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
    const candidateSnapshot = await getDocs(query(
      collection(db, "profiles"),
      where("role", "==", "learner"),
      limit(200)
    ));
    const learners = candidateSnapshot.docs
      .map(document => ({ uid: document.id, ...document.data() }))
      .filter(profile => profile.accountStatus !== "deactivated")
      .sort((a, b) => (a.displayName || a.email || "").localeCompare(b.displayName || b.email || ""));
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
    return tracks;
  } catch (error) {
    console.error("Unassigned intern accounts could not be loaded.", error);
    select.replaceChildren(new Option("Could not load intern accounts", ""));
    select.disabled = true;
    setRoleAssignmentStatus(error.message || "Could not load intern accounts. Check Firestore access and retry.", "error");
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
    setRoleAssignmentStatus("Saving role securely…");
  try {
    const profileRef = doc(db, "profiles", $("roleCandidate").value);
    await runTransaction(db, async transaction => {
      const profileSnapshot = await transaction.get(profileRef);
      if (!profileSnapshot.exists() || profileSnapshot.get("role") !== "learner") {
        throw new Error("Only an unassigned intern profile can receive a staff role.");
      }
      if (profileSnapshot.get("accountStatus") === "deactivated") {
        throw new Error("Reactivate this account before assigning a staff role.");
      }
      if (role === "mentor" && (!mentorTracks.length || mentorTracks.some(track => !tracks.includes(track)))) {
        throw new Error("Choose at least one valid track for the Team Leader.");
      }
      transaction.update(profileRef, {
        role,
        mentorTracks: role === "mentor" ? [...new Set(mentorTracks)] : [],
        roleAssignedBy: auth.currentUser.uid,
        roleAssignedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    setRoleAssignmentStatus("Role assigned. The user must sign out and sign in again for the new access to take effect.", "success");
    showToast("Staff role assigned. The user needs to sign in again.");
    form.reset();
    $("mentorTrackField").hidden = true;
    await loadRoleAssignmentCandidates();
    await loadFounderOverview();
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
    const profileSnapshot = await getDoc(doc(db, "profiles", latestUser.uid));
    const storedRole = profileSnapshot.exists() ? profileSnapshot.get("role") : "";
    const isAllowlistedFounder = verified
      && latestUser.email?.trim().toLowerCase() === "ctrlabhishek@gmail.com";
    if (!verified || !["google.com", "password"].includes(provider)) {
      window.location.replace("index.html?auth=login&verification=required");
      return;
    }

    const role = isAllowlistedFounder ? "founder"
      : ["founder", "co_founder"].includes(storedRole) ? storedRole : token.claims.role;
    if (!isAllowlistedFounder && !["founder", "co_founder"].includes(role)) {
      window.location.replace("Intern-dashboard.html");
      return;
    }

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
    await loadFounderOverview();
    window.setInterval(() => { void loadFounderOverview().catch(error => console.error("Founder live overview refresh failed.", error)); }, 60000);
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

$("sidebarClose").addEventListener("click", closeMobileNav);
$("mobileMenu").addEventListener("click", () => setMobileNavOpen(!$("sidebar").classList.contains("open")));
$("sidebarOverlay").addEventListener("click", closeMobileNav);
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && $("sidebar").classList.contains("open")) closeMobileNav();
});
$("sidebar").querySelectorAll(".nav-link").forEach(link => {
  link.addEventListener("click", () => {
    $("sidebar").querySelectorAll(".nav-link").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
    closeMobileNav();
  });
});

async function publishFounderAnnouncement() {
  const audienceChoice = window.prompt(
    `Choose an audience: enter all or a track number.\n${tracks.map((track, index) => `${index + 1}. ${track}`).join("\n")}`,
    "all"
  );
  if (audienceChoice === null) return;
  const choice = audienceChoice.trim();
  const audienceTrack = choice.toLowerCase() === "all"
    ? "all"
    : tracks[Number(choice) - 1] || tracks.find(track => track.toLowerCase() === choice.toLowerCase());
  if (!audienceTrack) return showToast("Choose all or one of the listed internship tracks.");
  const title = window.prompt("Announcement title:")?.trim();
  if (!title || title.length < 3 || title.length > 120) return showToast("Enter a title between 3 and 120 characters.");
  const body = window.prompt("Announcement message:")?.trim();
  if (!body || body.length > 5000) return showToast("Enter a message up to 5,000 characters.");
  try {
    await setDoc(doc(collection(db, "announcements")), {
      title, body, audienceTrack,
      createdByUid: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });
    showToast("Announcement published.");
  } catch (error) {
    console.error("Founder announcement could not be published.", error);
    showToast(error.message || "Could not publish the announcement.");
  }
}

async function reviewFounderCertificate(button) {
  const uid = button.dataset.founderCertificate;
  if (!uid) return;
  button.disabled = true;
  try {
    await runTransaction(db, async transaction => {
      const requestRef = doc(db, "certificateRequests", uid);
      const request = await transaction.get(requestRef);
      if (!request.exists() || request.get("status") !== "requested") {
        throw new Error("This certificate request has already been reviewed.");
      }
      transaction.update(requestRef, {
        status: "approved",
        feedback: "Certificate review approved. Contact HR to receive the verified certificate document.",
        reviewedByUid: auth.currentUser.uid,
        reviewedAt: serverTimestamp()
      });
    });
    showToast("Certificate request approved for HR follow-up.");
    await loadFounderOverview();
  } catch (error) {
    console.error("Founder certificate review failed.", error);
    showToast(error.message || "Could not approve the certificate request.");
    button.disabled = false;
  }
}

const quickActionRoutes = {
  "Assign staff access": () => document.querySelector("#roleAssignments")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  "Manage roles": () => document.querySelector("#roleAssignments")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  "View domains": () => document.querySelector("#domains")?.scrollIntoView({ behavior: "smooth", block: "start" }),
  "Assign task": () => { window.location.href = "Intern-dashboard.html?workspace=operations#icAssignTaskForm"; },
  "Send announcement": () => { void publishFounderAnnouncement(); },
  "Review approvals": () => { window.location.href = "hr-dashboard.html?view=pending-activation"; }
};
document.querySelectorAll("[data-founder-action]").forEach(button => {
  button.addEventListener("click", () => quickActionRoutes[button.dataset.founderAction]?.());
});
$("founderApprovalList").addEventListener("click", event => {
  const button = event.target.closest("[data-founder-certificate]");
  if (button) void reviewFounderCertificate(button);
});

$("notificationButton").addEventListener("click", () => {
  if (founderDraftUids.size) {
    window.location.href = "hr-dashboard.html?view=pending-activation";
  } else if (founderPendingCertificates) {
    document.querySelector("#approvals")?.scrollIntoView({ behavior: "smooth", block: "start" });
  } else {
    showToast("There are no pending approvals.");
  }
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

function filterFounderInterns() { renderFounderOverview(); }

$("internSearch").addEventListener("input", filterFounderInterns);
$("domainFilter").addEventListener("change", filterFounderInterns);

$("globalSearch").addEventListener("keydown", event => {
  if (event.key === "Enter" && event.currentTarget.value.trim()) {
    const query = event.currentTarget.value.trim().toLowerCase();
    const match = [...document.querySelectorAll(".module-card, .panel, .stat-card")]
      .find(item => item.textContent.toLowerCase().includes(query));
    if (match) match.scrollIntoView({ behavior: "smooth", block: "center" });
    else showToast("No matching live dashboard content found.");
  }
});
