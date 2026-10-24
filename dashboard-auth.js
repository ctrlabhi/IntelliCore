import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, initializeFirestore, writeBatch
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js";
import { getBlob, getStorage, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js";

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
const functions = getFunctions(app, "us-central1");
const storage = getStorage(app);
const callFunction = (name, data = {}) => httpsCallable(functions, name)(data).then(result => result.data);
const $ = id => document.getElementById(id);
const notice = (message, canRetry = false) => {
  const text = $("icWorkspaceNoticeText");
  const retry = $("icWorkspaceRetry");
  if (text) text.textContent = message;
  if (retry) retry.hidden = !canRetry;
};
let currentUser = null;
let loginRedirectStarted = false;
let authenticatedRole = "learner";
let activeTab = "applications";
let records = { applications: [], tasks: [], certificates: [] };
let editingId = null;
let dialogReturnFocus = null;
let persistedRecordIds = new Set();
let recordsReady = false;
let connectionAttempt = 0;
let trainingWorkspace = null;
let profilePhotoObjectUrl = null;
let meetingRefreshTimer = null;

const labels = {
  applications: { singular: "personal application", plural: "Personal Applications", subtitle: "Track roles you applied for yourself; these are not official IntelliCore recruitment applications.", add: "＋ Add application", empty: "No applications tracked yet", emptyCopy: "Add a role you have applied for to track your own progress.", statuses: ["Applied", "Under review", "Shortlisted", "Interview Scheduled", "Selected", "Rejected", "Withdrawn"] },
  tasks: { singular: "personal task", plural: "Personal Tasks & Learning", subtitle: "Track your own goals separately from mentor-assigned training.", add: "＋ Add task", empty: "No personal tasks yet", emptyCopy: "Add a learning goal or task you want to track.", statuses: ["To do", "In progress", "Completed"] },
  certificates: { singular: "certificate note", plural: "Certificate Notes", subtitle: "Personal notes only; official certificate issuance and verification are not enabled.", add: "＋ Add certificate note", empty: "No certificate notes yet", emptyCopy: "Keep a personal note about a certificate. This does not issue or verify a certificate.", statuses: ["Earned", "In progress"] }
};
const storageKey = uid => `icWorkspaceData:${uid}`;
const localProfileStorageKey = uid => `icLocalInternshipProfile:${uid}`;
const firebaseProfileDraftRef = uid => doc(db, "users", uid, "profileDrafts", "current");
const recordsCollection = uid => collection(db, "users", uid, "workspaceRecords");
const createRecordId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
function safeRead(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch (error) { console.warn("A saved local workspace preference could not be read.", error); return fallback; }
}
function addMonthsToDate(dateString, months) {
  const [year, month, day] = dateString.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}
function createLocalTrainingWorkspace(user, profile) {
  return {
    profile: { ...profile, uid: user.uid, email: user.email || "", role: "learner", localOnly: true, mentorTracks: [] },
    assignments: [],
    catalog: [],
    reviewQueue: [],
    attendance: [],
    activeInternship: null,
    activeMeeting: null,
    internDirectory: [],
    attendanceReport: []
  };
}
function createFirebaseDraftWorkspace(user, profile) {
  const internshipStartDate = profile.internshipStartDate
    || indiaDateString(profile.savedAt?.toDate?.() || new Date());
  return {
    profile: {
      ...profile,
      uid: user.uid,
      email: user.email || "",
      internshipStartDate,
      internshipEndDate: profile.internshipEndDate
        || addMonthsToDate(internshipStartDate, Number(profile.durationMonths)),
      role: "learner",
      localOnly: false,
      profileDraft: true,
      internshipStatus: "pending_activation",
      mentorTracks: []
    },
    assignments: [],
    catalog: [],
    reviewQueue: [],
    attendance: [],
    activeInternship: null,
    activeMeeting: null,
    internDirectory: [],
    attendanceReport: []
  };
}
async function loadFirebaseProfileDraft(user) {
  const snapshot = await getDoc(firebaseProfileDraftRef(user.uid));
  if (!snapshot.exists()) return null;
  const draft = snapshot.data();
  if (!tracksForDashboard.includes(draft.track)
    || !Number.isInteger(draft.durationMonths)
    || ![1, 2, 3, 6].includes(draft.durationMonths)
    || !["Female", "Male"].includes(draft.gender)
    || typeof draft.displayName !== "string"
    || draft.displayName.trim().length < 2
    || draft.displayName.length > 80
    || typeof draft.phone !== "string"
    || draft.phone.length < 7
    || draft.phone.length > 24
    || !/^[+()0-9 .-]+$/.test(draft.phone)
    || draft.email !== (user.email || "")) {
    throw new Error("The saved Firebase profile draft has invalid fields. Please edit and save it again.");
  }
  return createFirebaseDraftWorkspace(user, draft);
}
function loadLocalTrainingWorkspace(user) {
  const profile = safeRead(localProfileStorageKey(user.uid), null);
  if (!profile || profile.uid !== user.uid || profile.role !== "learner"
    || !tracksForDashboard.includes(profile.track)
    || ![1, 2, 3, 6].includes(Number(profile.durationMonths))
    || !["Female", "Male"].includes(profile.gender)
    || typeof profile.displayName !== "string" || !profile.displayName.trim()
    || typeof profile.phone !== "string" || !profile.phone.trim()
    || !/^\d{4}-\d{2}-\d{2}$/.test(profile.internshipStartDate)
    || !/^\d{4}-\d{2}-\d{2}$/.test(profile.internshipEndDate)) {
    return null;
  }
  return createLocalTrainingWorkspace(user, profile);
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
function callableErrorNotice(error, functionName) {
  const code = typeof error?.code === "string" ? error.code : "";
  if (code.endsWith("/not-found") || code === "not-found") {
    return `Firebase Function "${functionName}" was not found in us-central1. Deploy the latest Functions to project intellicore-229.`;
  }
  if (code.endsWith("/unauthenticated") || code === "unauthenticated") {
    return "Your sign-in expired before the secure workspace could load. Sign out and sign in again.";
  }
  if (code.endsWith("/permission-denied") || code === "permission-denied") {
    return "Your account is not authorised to load the secure workspace. Check its verified email and assigned role.";
  }
  if (code.endsWith("/failed-precondition") || code === "failed-precondition") {
    return error.message || "The secure workspace is not ready for this account yet.";
  }
  if (code.endsWith("/unavailable") || code.endsWith("/deadline-exceeded")
    || error?.message === "Workspace connection timed out.") {
    return `Firebase Function "${functionName}" did not respond. Check Firebase Functions availability and try again.`;
  }
  return `Firebase Function "${functionName}" failed${code ? ` (${code})` : ""}. Check Cloud Functions logs for project intellicore-229.`;
}
async function connectWorkspace(user, profileSetupError = null) {
  const attempt = ++connectionAttempt;
  recordsReady = false;
  $("workspaceTop").setAttribute("aria-busy", "true");
  renderAll();
  notice(trainingWorkspace?.profile.profileDraft
    ? "Your saved internship profile is ready. Connecting to secure records and training…"
    : trainingWorkspace?.profile.localOnly
      ? "Your profile is on this device only. Connecting to secure records and training…"
      : "Connecting to your private workspace…");
  const [recordResult, trainingResult] = await Promise.allSettled([
    withTimeout(loadRecords(user, attempt), 20000),
    profileSetupError
      ? Promise.reject(profileSetupError)
      : withTimeout(refreshTrainingWorkspace(), 20000)
  ]);
  if (attempt !== connectionAttempt) return;
  $("workspaceTop").setAttribute("aria-busy", "false");
  if (trainingResult.status === "rejected") {
    trainingWorkspace = trainingWorkspace || loadLocalTrainingWorkspace(user);
    if (!trainingWorkspace) {
      console.error("Training assignments could not be loaded.", trainingResult.reason);
    }
  }
  if (recordResult.status === "rejected") {
    connectionAttempt++;
    recordsReady = false;
    console.error("Private workspace records could not be loaded.", recordResult.reason);
    notice(trainingWorkspace?.profile.profileDraft
      ? "Your profile draft is saved in Firebase. Private records and secure training could not connect."
      : trainingWorkspace?.profile.localOnly
        ? "Your profile is available on this device only. Private records and secure training could not connect."
        : "Private records could not be loaded. Check Firestore setup, your connection, and the deployed security rules.", true);
  } else if (trainingResult.status === "rejected") {
    if (trainingWorkspace?.profile.localOnly) {
      notice("Your profile is saved on this device only. It is not synced to your IntelliCore account.");
    } else if (trainingWorkspace?.profile.profileDraft) {
      notice("Your saved profile is ready, but secure activation and training could not connect.");
    } else {
      const functionName = profileSetupError ? "ensureProfile" : "getTrainingDashboard";
      notice(`Your personal workspace loaded, but ${callableErrorNotice(trainingResult.reason, functionName)}`);
    }
  } else {
    notice("Your private workspace and training assignments are ready.");
  }
  const profile = trainingWorkspace?.profile;
  if (attempt === connectionAttempt
    && trainingResult.status === "fulfilled"
    && profile?.role === "learner"
    && !profile.profileDraft
    && !profile.localOnly
    && trainingWorkspace.activeInternship) {
    if (isSundayInIndia()) {
      notice("Your workspace is ready. Sunday is an off day, so attendance was not recorded.");
    } else {
      let result;
      try {
        result = await recordAttendanceForLogin(user, attempt);
        if (attempt !== connectionAttempt) return;
      } catch (error) {
        console.error("Daily attendance could not be recorded during login.", error);
        notice(`Your dashboard is ready, but today's attendance could not be recorded. ${error.message || "Retry the connection to try again."}`, true);
      }
      if (result?.skippedSunday) {
        notice("Your workspace is ready. Sunday is an off day, so attendance was not recorded.");
      } else if (result) {
        let attendanceViewRefreshed = true;
        if (!result.alreadyCheckedIn) {
          try {
            await refreshTrainingWorkspace();
          } catch (error) {
            console.error("Today's attendance was saved but the dashboard could not be refreshed.", error);
            notice("Today's attendance was saved. Retry the connection to refresh your dashboard.", true);
            attendanceViewRefreshed = false;
          }
        }
        if (attendanceViewRefreshed) {
          notice(result.alreadyCheckedIn
            ? "Your attendance was already recorded for today."
            : "Your attendance was automatically recorded for today.");
        }
      }
    }
  }
  renderAll();
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
function internshipProfileComplete(profile) {
  return Boolean(
    profile?.role === "learner"
    && profile.displayName
    && profile.phone
    && profile.gender
    && profile.track
    && profile.durationMonths
    && profile.internshipStartDate
    && profile.internshipEndDate
  );
}
function renderProfileOnboarding(role, profile = null) {
  const isLearner = role === "learner";
  const complete = internshipProfileComplete(profile);
  const prompt = $("icInternshipPrompt");
  const button = $("icBuildProfileButton");
  const isOnboarding = isLearner && !complete;
  $("icProfile").classList.toggle("is-onboarding", isOnboarding);
  prompt.hidden = true;
  $("icProfileName").hidden = false;
  $("icProfileEmail").hidden = isLearner && !complete;
  $("icProfileInitial").hidden = false;
  if (isOnboarding) {
    const accountUser = currentUser || auth.currentUser;
    const displayName = profile?.displayName || accountUser?.displayName
      || accountUser?.email?.split("@")[0] || "Welcome";
    $("icProfileName").textContent = displayName.trim().split(/\s+/)[0] || displayName;
  }
  button.hidden = !isLearner;
  button.textContent = isOnboarding
    ? "Firstly, build your profile"
    : "Edit profile";
  button.classList.toggle("is-onboarding", isOnboarding);
  document.querySelectorAll("[data-internship-dashboard]").forEach(section => {
    section.hidden = isLearner && !complete;
  });
}
function indiaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function isSundayInIndia(dateString = indiaDateString()) {
  return new Date(`${dateString}T00:00:00Z`).getUTCDay() === 0;
}
async function recordAttendanceForLogin(user, attempt = connectionAttempt) {
  const result = await callFunction("checkInToday");
  if (attempt !== connectionAttempt || auth.currentUser?.uid !== user.uid) return null;
  return result;
}
function initialsFor(name) {
  return (name || "IC").trim().split(/\s+/).slice(0,2).map(part => part[0] || "").join("").toUpperCase() || "IC";
}
function renderProfile(user, profile = trainingWorkspace?.profile || null) {
  const name = profile?.displayName || user.displayName || (user.email || "").split("@")[0] || "IntelliCore member";
  $("icProfileName").textContent = name;
  $("icProfileEmail").textContent = user.email || "Google account";
  $("icProfileStatus").textContent = profile?.profileDraft
    ? "Saved draft"
    : profile?.localOnly
      ? "Device only"
      : user.emailVerified || user.providerData.some(p => p.providerId === "google.com") ? "Active" : "Verify";
  $("icProfileInitial").textContent = name.trim().charAt(0).toUpperCase() || "I";
  const avatar = $("icProfilePhoto");
  avatar.hidden = true;
  void loadStoredProfilePhoto(user, name);
  renderProfileOnboarding(profile?.role || authenticatedRole, profile);
  updateProfileCompletion(user, profile);
}
function updateProfileCompletion(user, profile = null) {
  const verified = user.emailVerified || user.providerData.some(provider => provider.providerId === "google.com");
  const requiredDetails = [
    Boolean(profile?.displayName || user.displayName),
    Boolean(user.email),
    Boolean(verified),
    Boolean(profile?.phone),
    Boolean(profile?.gender),
    Boolean(profile?.track),
    Boolean(profile?.durationMonths)
  ];
  const completion = Math.round(requiredDetails.filter(Boolean).length / requiredDetails.length * 100);
  $("icProfileCompletion").textContent = profile?.localOnly
    ? "Device only"
    : profile?.profileDraft ? "Firebase draft" : `${completion}%`;
  $("icProfileProgressBar").style.width = `${completion}%`;
  $("icProfileProgressBar").parentElement.setAttribute("aria-valuenow", String(completion));
}
async function loadStoredProfilePhoto(user, name) {
  try {
    const blob = await getBlob(ref(storage, `profilePhotos/${user.uid}/avatar`), 3 * 1024 * 1024);
    if (profilePhotoObjectUrl) URL.revokeObjectURL(profilePhotoObjectUrl);
    profilePhotoObjectUrl = URL.createObjectURL(blob);
    $("icProfilePhoto").src = profilePhotoObjectUrl;
    $("icProfilePhoto").alt = `${name}'s profile photo`;
    $("icProfilePhoto").hidden = false;
  } catch (error) {
    if (error.code !== "storage/object-not-found") {
      console.error("The saved profile photo could not be loaded.", error);
      notice("Your profile photo could not be loaded. Check Storage setup and its security rules.");
    }
  }
}
function renderTraining() {
  const tasksElement = $("icTrainingTasks");
  const internshipOptions = tracksForDashboard.map(track =>
    `<option value="${escapeHtml(track)}">${escapeHtml(track)}</option>`
  ).join("");
  $("icInternshipTrack").innerHTML = `<option value="">Choose a domain</option>${internshipOptions}`;
  $("icInternshipProfileForm").elements.track.innerHTML = internshipOptions;

  if (!trainingWorkspace) {
    const accountUser = currentUser || auth.currentUser;
    if (accountUser) {
      $("icProfileName").textContent = accountUser.displayName || accountUser.email?.split("@")[0] || "Your workspace";
      $("icProfileEmail").textContent = accountUser.email || "";
      $("icInternshipName").value = accountUser.displayName || "";
      $("icInternshipEmail").value = accountUser.email || "";
    }
    renderProfileOnboarding(authenticatedRole);
    $("icTrainingTrack").textContent = "Training unavailable";
    $("icTrainingIntro").textContent = "Training services could not be reached. Retry after Firebase Functions are deployed.";
    tasksElement.innerHTML = '<div class="ic-activity-empty"><strong>Your training could not be loaded</strong><p>Refresh the page after the secure training service is available.</p></div>';
    $("icAssignedTrainingCount").textContent = "—";
    $("icTrainingProgress").textContent = "Training service unavailable";
    $("icInternshipProgress").textContent = "—";
    $("icStaffPanel").hidden = true;
    $("icAttendancePanel").hidden = true;
    $("icMeetingPanel").hidden = true;
    $("icTrainingSection").hidden = authenticatedRole === "learner";
    return;
  }

  const {
    profile, assignments, catalog, reviewQueue, attendance = [],
    activeInternship, activeMeeting, internDirectory = [], attendanceReport = [],
    internDirectoryHasMore = false, internDirectoryNextCursor = null
  } = trainingWorkspace;
  const role = profile.role || "learner";
  const isIntern = role === "learner";
  const hasInternshipProfile = !profile.profileDraft && !profile.localOnly && Boolean(
    profile.track && profile.durationMonths && profile.internshipStartDate && profile.internshipEndDate
  );
  const hasRequiredProfile = internshipProfileComplete(profile);
  const today = indiaDateString();
  const isSunday = isSundayInIndia(today);
  const isCheckedIn = attendance.some(item => item.attendanceDate === today);
  const canManageProfiles = ["founder", "co_founder", "admin", "hr_manager"].includes(role);
  const canViewProfiles = [
    "founder", "co_founder", "admin", "hr_manager", "hr_executive", "operations_executive"
  ].includes(role);
  const canViewAttendance = ["founder", "co_founder", "admin", "hr_manager", "operations_executive"].includes(role);
  const canManageTraining = ["founder", "co_founder", "admin", "hr_manager", "mentor"].includes(role);
  const canManageInternAccounts = [
    "founder", "co_founder", "admin", "hr_manager", "hr_executive", "operations_executive"
  ].includes(role);

  $("icAttendancePanel").hidden = !isIntern || !hasRequiredProfile;
  $("icTrainingSection").hidden = isIntern && !hasRequiredProfile;
  $("icProfileName").textContent = profile.displayName || currentUser?.displayName || currentUser?.email?.split("@")[0] || "Your workspace";
  $("icProfileInitial").textContent = $("icProfileName").textContent.trim().charAt(0).toUpperCase() || "I";
  renderProfileOnboarding(role, profile);
  const accountUser = currentUser || auth.currentUser;
  if (accountUser) {
    $("icInternshipEmail").value = accountUser.email || "";
    updateProfileCompletion(accountUser, profile);
  }

  const durationSelect = $("icInternshipForm").elements.durationMonths;
  $("icInternshipName").value = profile.displayName || currentUser?.displayName || "";
  $("icInternshipGender").value = profile.gender || "";
  if (profile.durationMonths) durationSelect.value = String(profile.durationMonths);
  $("icInternshipTrack").value = profile.track || "";
  $("icInternshipForm").elements.track.value = profile.track || tracksForDashboard[0];
  $("icInternshipPhone").value = profile.phone || "";
  $("icInternshipTrack").disabled = hasInternshipProfile;
  $("icInternshipForm").elements.track.disabled = hasInternshipProfile;
  $("icInternshipForm").elements.durationMonths.disabled = hasInternshipProfile;
  $("icInternshipDialogTitle").textContent = profile.profileDraft
    ? "Your saved profile draft"
    : hasInternshipProfile
    ? "Your internship profile"
    : "Build your internship profile";
  $("icInternshipDialogDescription").textContent = profile.profileDraft
    ? "Your saved details are ready. Save your profile to activate the internship and lock in its dates."
    : hasInternshipProfile
    ? "Update your personal details below. Domain and duration stay fixed while your internship is active."
    : "Enter your personal details, choose your domain and duration, then save to activate your internship.";
  $("icInternshipPeriodPreview").textContent = profile.profileDraft
    ? `Profile draft saved to Firebase. Proposed period: ${profile.internshipStartDate} through ${profile.internshipEndDate}.`
    : hasInternshipProfile
    ? `Active from ${profile.internshipStartDate} through ${profile.internshipEndDate}. Contact HR if your domain or duration needs to change.`
    : "Your internship starts as soon as you save this profile.";
  $("icBuildProfileButton").textContent = hasRequiredProfile ? "Edit profile" : "Build your profile";

  const internshipActive = Boolean(activeInternship);
  $("icAttendanceSummary").textContent = `Attendance is recorded automatically once per login day (Sunday excluded). ${profile.track} · ${profile.durationMonths} month${profile.durationMonths === 1 ? "" : "s"} · ${profile.internshipStartDate} to ${profile.internshipEndDate}`;
  $("icInternProfileDetails").innerHTML = `
    <div><span>Intern</span><strong>${escapeHtml(profile.displayName || currentUser?.displayName || "Intern")}</strong></div>
    <div><span>Email</span><strong>${escapeHtml(profile.email || currentUser?.email || "—")}</strong></div>
    <div><span>Gender</span><strong>${escapeHtml(profile.gender || "Not provided")}</strong></div>
    <div><span>Phone</span><strong>${escapeHtml(profile.phone || "Not provided")}</strong></div>
    <div><span>Domain &amp; duration</span><strong>${escapeHtml(profile.track)} · ${escapeHtml(profile.durationMonths)} month${profile.durationMonths === 1 ? "" : "s"}</strong></div>
    <div><span>Internship period</span><strong>${escapeHtml(profile.internshipStartDate)} – ${escapeHtml(profile.internshipEndDate)}</strong></div>`;
  $("icAttendanceCount").textContent = `${attendance.length} day${attendance.length === 1 ? "" : "s"}`;
  $("icAttendanceStatStatus").textContent = profile.profileDraft
    ? "Ready to activate"
    : profile.localOnly
      ? "Not synced"
    : isIntern
    ? hasInternshipProfile ? `${attendance.length} check-in${attendance.length === 1 ? "" : "s"}` : "Not enrolled"
    : canViewAttendance ? `${attendanceReport.length} check-ins` : "Staff view";
  $("icAttendanceStatDetail").textContent = profile.profileDraft
    ? "Available after saving your profile"
    : profile.localOnly
      ? "Available after secure profile sync"
    : isIntern
    ? hasInternshipProfile ? "Saved check-ins in this internship" : "Build your internship profile to begin"
    : canViewAttendance ? "Open the staff attendance report" : "Attendance is managed by authorised staff";
  $("icCheckInButton").disabled = profile.profileDraft || profile.localOnly || !internshipActive || isCheckedIn || isSunday;
  $("icCheckInButton").textContent = profile.profileDraft
    ? "Save profile to activate"
    : profile.localOnly
      ? "Sync required"
    : isSunday ? "Sunday (no attendance)"
      : isCheckedIn ? "Attendance recorded today" : internshipActive ? "Check in today" : "Internship ended";
  $("icAttendanceMessage").textContent = profile.profileDraft
    ? "Save your profile once to activate your internship. Attendance will then be recorded automatically when you log in."
    : profile.localOnly
      ? "This profile is saved on this device only. Sync it to your account before using attendance."
    : isCheckedIn
    ? "Your attendance for today was recorded automatically when you logged in."
    : isSunday
      ? "Sunday is an off day. Attendance is not recorded on Sundays."
    : internshipActive
      ? "Attendance is recorded automatically when you log in during your internship. You can also check in manually."
      : `Your internship period ended on ${profile.internshipEndDate}. Attendance is closed.`;
  $("icAttendanceHistory").innerHTML = attendance.length
    ? attendance.map(item => `<div class="ic-attendance-row"><strong>${escapeHtml(item.attendanceDate)}</strong><span>Checked in</span></div>`).join("")
    : profile.profileDraft
      ? '<div class="ic-activity-empty"><strong>Activate your internship</strong><p>Save your profile once. Your internship dates will stay fixed and attendance will be recorded on each login day, except Sundays.</p></div>'
      : profile.localOnly
        ? '<div class="ic-activity-empty"><strong>Attendance is not synced</strong><p>Connect your secure account profile before recording attendance.</p></div>'
      : '<div class="ic-activity-empty"><strong>No attendance recorded yet</strong><p>Check in on the days you attend.</p></div>';

  renderMeetingPanel(activeMeeting, role, hasInternshipProfile);

  if (role === "learner") {
    const approved = assignments.filter(assignment => assignment.status === "approved").length;
    const progress = assignments.length ? Math.round((approved / assignments.length) * 100) : 0;
    $("icAssignedTrainingCount").textContent = profile.profileDraft || profile.localOnly ? "—" : String(assignments.length);
    $("icTrainingProgress").textContent = profile.profileDraft
      ? "Save profile to activate"
      : profile.localOnly ? "Secure assignments unavailable"
      : `${approved} of ${assignments.length} approved`;
    $("icInternshipProgress").textContent = profile.profileDraft
      ? "Profile not activated"
      : profile.localOnly ? "Sync required" : `${progress}%`;
  } else {
    $("icAssignedTrainingCount").textContent = "Staff";
    $("icTrainingProgress").textContent = "Manage assigned work";
    $("icInternshipProgress").textContent = "Staff view";
  }
  $("icTrainingTrack").textContent = profile.track
    || (role === "mentor" ? profile.mentorTracks.join(", ") || "No tracks assigned" : ["founder", "co_founder", "admin"].includes(role) ? "All tracks" : "Track pending");
  $("icTrainingIntro").textContent = profile.profileDraft
    ? "Your saved details are ready. Save your profile to activate the internship and unlock training."
    : profile.localOnly
      ? "Profile saved on this device. Secure training data is not synced."
    : role === "learner"
    ? profile.track
      ? `Your ${profile.track} training assignments and progress.`
      : "Build your internship profile to unlock training assignments."
    : `Signed in with ${role} access for your authorised training tracks.`;

  if (profile.profileDraft) {
    tasksElement.innerHTML = '<div class="ic-activity-empty"><strong>Activate your internship</strong><p>Save your profile once to activate your fixed internship period and unlock training.</p></div>';
  } else if (profile.localOnly) {
    tasksElement.innerHTML = '<div class="ic-activity-empty"><strong>Your dashboard is ready</strong><p>Training assignments will appear after this profile is securely synced to your IntelliCore account.</p></div>';
  } else if (!profile.track && role === "learner") {
    tasksElement.innerHTML = '<div class="ic-activity-empty"><strong>Your training track is not assigned yet</strong><p>Contact an IntelliCore administrator. Your track and tasks will appear here after assignment.</p></div>';
  } else if (!assignments.length) {
    tasksElement.innerHTML = role === "learner"
      ? '<div class="ic-activity-empty"><strong>No tasks assigned yet</strong><p>Your mentor will assign track-specific work here. Instructions, deliverables, and evaluation rubrics will appear with every task.</p></div>'
      : '<div class="ic-activity-empty"><strong>No personal learner assignments</strong><p>Use the staff tools below to assign training work and review learner submissions.</p></div>';
  } else {
    tasksElement.innerHTML = assignments.map(assignment => {
      const task = assignment.task;
      const due = assignment.dueDate
        ? `<span class="ic-training-due">Due ${escapeHtml(new Date(`${assignment.dueDate}T00:00:00`).toLocaleDateString())}</span>`
        : "";
      const rubric = task.rubric.map(row =>
        `<li><span>${escapeHtml(row.criterion)}</span><strong>${escapeHtml(row.points)} pts</strong></li>`
      ).join("");
      const submission = assignment.latestSubmissionText || assignment.latestSubmissionUrl
        ? `<div class="ic-submission-preview"><strong>Latest submission</strong>${assignment.latestSubmissionText ? `<p>${escapeHtml(assignment.latestSubmissionText)}</p>` : ""}${httpsHref(assignment.latestSubmissionUrl) ? `<a href="${httpsHref(assignment.latestSubmissionUrl)}" target="_blank" rel="noopener noreferrer">Open deliverable ↗</a>` : ""}</div>`
        : "";
      const feedback = assignment.feedback
        ? `<div class="ic-review-feedback"><strong>Mentor feedback</strong><p>${escapeHtml(assignment.feedback)}</p></div>`
        : "";
      const canSubmit = role === "learner" && ["assigned", "changes_requested"].includes(assignment.status);
      const submitForm = canSubmit
        ? `<form class="ic-training-submit" data-training-submit="${escapeHtml(assignment.id)}"><label>Submission notes<textarea name="text" maxlength="20000" rows="3" placeholder="Summarise your work and what you learned"></textarea></label><label>Deliverable link (optional)<input name="url" type="url" maxlength="2048" placeholder="https://…"></label><button type="submit" class="ic-primary-button">Submit for review</button></form>`
        : "";
      return `<article class="ic-training-task"><div class="ic-training-task-heading"><div><span class="ic-muted-label">${escapeHtml(task.track)}</span><h3>${escapeHtml(task.title)}</h3></div><span class="ic-training-status status-${escapeHtml(assignment.status)}">${escapeHtml(assignment.status.replaceAll("_", " "))}</span></div>${due}<details><summary>Task instructions, deliverable &amp; rubric</summary><p>${escapeHtml(task.instructions)}</p><div class="ic-training-deliverable"><strong>Deliverable</strong><p>${escapeHtml(task.deliverable)}</p></div><ul class="ic-training-rubric">${rubric}</ul></details>${submission}${feedback}${submitForm}</article>`;
    }).join("");
  }

  const staffPanel = $("icStaffPanel");
  staffPanel.hidden = !canManageTraining && !canViewProfiles && !canViewAttendance;
  if (!staffPanel.hidden) {
    $("icInternshipProfileForm").hidden = !canManageProfiles;
    $("icAssignTaskForm").hidden = !canManageTraining;
    $("icStaffPanel").querySelector(".ic-review-queue-wrap").hidden = !canManageTraining;
    $("icInternDirectoryWrap").hidden = !canViewProfiles;
    $("icInactiveInternsWrap").hidden = !canViewProfiles;
    $("icAttendanceReportWrap").hidden = !canViewAttendance;
    $("icAdminHierarchy").hidden = !canViewProfiles;
    const isSuperAdmin = ["founder", "co_founder"].includes(role);
    const roleTitles = {
      founder: "Founder · Super Admin",
      co_founder: "Co-founder · Super Admin",
      admin: "Admin",
      hr_manager: "HR Manager",
      hr_executive: "HR Executive",
      operations_executive: "Operations Executive"
    };
    $("icAdminRoleTitle").textContent = isSuperAdmin
      ? `${roleTitles[role]} · All domains`
      : `${roleTitles[role] || "Staff"} · All domains`;
    $("icAdminRoleDescription").textContent = isSuperAdmin
      ? "Super Admins lead the workspace. All intern domains, inactive accounts and staff tools are available below."
      : "Interns are organised by domain. Enrolled interns without a login for 7 days are listed separately.";
    const groupedInterns = new Map();
    internDirectory
      .filter(intern => intern.accountStatus !== "deactivated" && !intern.inactive)
      .forEach(intern => {
        const domain = intern.track || "Profile pending";
        if (!groupedInterns.has(domain)) groupedInterns.set(domain, []);
        groupedInterns.get(domain).push(intern);
      });
    const domainOrder = [...tracksForDashboard, "Profile pending"];
    const directoryMarkup = domainOrder
      .filter(domain => groupedInterns.has(domain))
      .map(domain => `<section class="ic-domain-group"><h4>${escapeHtml(domain)} <span>${groupedInterns.get(domain).length}</span></h4>${groupedInterns.get(domain).map(intern => renderInternCard(intern, false)).join("")}</section>`)
      .join("");
    $("icInternDirectory").innerHTML = directoryMarkup
      || '<div class="ic-activity-empty"><strong>No active intern profiles yet</strong><p>Intern profiles will be grouped here under their selected domain.</p></div>';
    $("icLoadMoreInterns").hidden = !internDirectoryHasMore;
    $("icLoadMoreInterns").dataset.cursor = internDirectoryNextCursor || "";
    $("icLoadMoreInterns").disabled = false;
    $("icLoadMoreInterns").textContent = "Load more interns";
    const inactiveInterns = internDirectory.filter(intern =>
      intern.accountStatus === "deactivated" || intern.inactive
    );
    $("icInactiveInternCount").textContent = String(inactiveInterns.length);
    $("icInactiveInterns").innerHTML = inactiveInterns.length
      ? inactiveInterns.map(intern => renderInternCard(intern, canManageInternAccounts)).join("")
      : '<div class="ic-activity-empty"><strong>No inactive enrolled interns</strong><p>Enrolled interns with no login for 7 days will appear here.</p></div>';
    $("icAttendanceReport").innerHTML = attendanceReport.length
      ? attendanceReport.map(item => `<article class="ic-staff-data-row"><div><strong>${escapeHtml(item.displayName || item.email || "Intern")}</strong><span>${escapeHtml(item.email)}${item.track ? ` · ${escapeHtml(item.track)}` : ""}</span></div><span>${escapeHtml(item.attendanceDate)}</span></article>`).join("")
      : '<div class="ic-activity-empty"><strong>No attendance records yet</strong><p>Check-ins are recorded when interns attend.</p></div>';

    const profileTrackSelect = $("icInternshipProfileForm").elements.track;
    const selectedProfileTrack = profileTrackSelect.value;
    profileTrackSelect.innerHTML = internshipOptions;
    if (tracksForDashboard.includes(selectedProfileTrack)) profileTrackSelect.value = selectedProfileTrack;

    const taskSelect = $("icAssignTaskForm").elements.taskId;
    const selectedTask = taskSelect.value;
    taskSelect.innerHTML = catalog.map(task =>
      `<option value="${escapeHtml(task.id)}">${escapeHtml(task.track)} — ${escapeHtml(task.title)}</option>`
    ).join("");
    if (catalog.some(task => task.id === selectedTask)) taskSelect.value = selectedTask;
    $("icAssignTaskForm").elements.email.placeholder =
      role === "mentor" ? "learner@example.com (your assigned track)" : "learner@example.com";

    if (!reviewQueue.length) {
      $("icReviewQueue").innerHTML = '<div class="ic-activity-empty"><strong>No submissions awaiting review</strong><p>Submitted work for your authorised tracks will appear here.</p></div>';
    } else {
      $("icReviewQueue").innerHTML = reviewQueue.map(assignment => {
        const link = httpsHref(assignment.latestSubmissionUrl);
        const rubric = assignment.task.rubric.map(row =>
          `<li><span>${escapeHtml(row.criterion)}</span><strong>${escapeHtml(row.points)} pts</strong></li>`
        ).join("");
        return `<article class="ic-review-card" data-review-card="${escapeHtml(assignment.id)}"><div><span class="ic-muted-label">${escapeHtml(assignment.track)} · ${escapeHtml(assignment.learnerEmail)}</span><h4>${escapeHtml(assignment.task.title)}</h4><p>${escapeHtml(assignment.latestSubmissionText || "No written notes provided.")}</p>${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">Open deliverable ↗</a>` : ""}<details><summary>Review instructions &amp; rubric</summary><p>${escapeHtml(assignment.task.instructions)}</p><p><strong>Deliverable:</strong> ${escapeHtml(assignment.task.deliverable)}</p><ul class="ic-training-rubric">${rubric}</ul></details></div><form data-review-form="${escapeHtml(assignment.id)}"><label>Feedback<textarea name="feedback" required minlength="1" maxlength="4000" rows="3" placeholder="Give clear, actionable feedback"></textarea></label><div><button type="submit" class="ic-primary-button" data-decision="approved">Approve</button><button type="submit" class="ic-outline-button" data-decision="changes_requested">Request changes</button></div></form></article>`;
      }).join("");
    }
  }
}
const tracksForDashboard = [
  "Business Analyst Intern",
  "Web Development Intern",
  "Data Analyst Intern",
  "Digital Marketing Intern",
  "Graphic Designer Intern",
  "Social Media Intern",
  "Content Writing Intern",
  "Human Resources Intern"
];
function renderInternCard(intern, canManage) {
  const lastLogin = intern.lastLoginAt
    ? new Date(intern.lastLoginAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : "Not recorded yet";
  const phone = intern.phone
    ? `<a href="tel:${encodeURIComponent(intern.phone)}">${escapeHtml(intern.phone)}</a>`
    : "Phone not added";
  const email = intern.email
    ? `<a href="mailto:${escapeHtml(intern.email)}">${escapeHtml(intern.email)}</a>`
    : "Email unavailable";
  const duration = intern.durationMonths
    ? `${intern.durationMonths} month${intern.durationMonths === 1 ? "" : "s"}`
    : "Duration pending";
  const status = intern.accountStatus === "deactivated"
    ? "Access deactivated"
    : intern.inactive
      ? "No login for 7+ days"
      : "Active";
  const action = !canManage
    ? ""
    : intern.accountStatus === "deactivated"
      ? `<button type="button" class="ic-outline-button" data-intern-status="active" data-intern-uid="${escapeHtml(intern.uid)}">Reactivate access</button>`
      : intern.inactive
        ? `<button type="button" class="ic-deactivate-button" data-intern-status="deactivated" data-intern-uid="${escapeHtml(intern.uid)}">Deactivate access</button>`
        : "";
  return `<article class="ic-intern-card"><div class="ic-intern-card-heading"><div><strong>${escapeHtml(intern.displayName || "Intern")}</strong><span>${escapeHtml(intern.track || "Profile pending")} · ${escapeHtml(duration)}</span></div><span class="ic-intern-status ${intern.accountStatus === "deactivated" ? "is-deactivated" : intern.inactive ? "is-inactive" : ""}">${status}</span></div><dl><div><dt>Email</dt><dd>${email}</dd></div><div><dt>Phone</dt><dd>${phone}</dd></div><div><dt>Internship period</dt><dd>${intern.internshipStartDate && intern.internshipEndDate ? `${escapeHtml(intern.internshipStartDate)} – ${escapeHtml(intern.internshipEndDate)}` : "Not enrolled"}</dd></div><div><dt>Last login</dt><dd>${escapeHtml(lastLogin)}</dd></div></dl>${action ? `<div class="ic-intern-card-actions">${action}</div>` : ""}</article>`;
}
function httpsHref(value) {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? escapeHtml(url.href) : "";
  } catch {
    return "";
  }
}
async function refreshTrainingWorkspace() {
  const workspace = await callFunction("getTrainingDashboard");
  const profileDraft = workspace.profile?.role === "learner" && !internshipProfileComplete(workspace.profile)
    ? await loadFirebaseProfileDraft(currentUser)
    : null;
  trainingWorkspace = profileDraft
    ? { ...workspace, profile: profileDraft.profile }
    : workspace;
  renderTraining();
}
function renderMeetingPanel(activeMeeting, role, hasInternshipProfile) {
  const canManageMeetings = ["founder", "co_founder"].includes(role);
  const canSeeMeeting = hasInternshipProfile || [
    "founder", "co_founder", "admin", "hr_manager", "hr_executive", "operations_executive"
  ].includes(role);
  $("icMeetingPanel").hidden = !canSeeMeeting;
  $("icJoinMeetButton").hidden = !activeMeeting;
  $("icJoinMeetButton").href = activeMeeting?.meetUrl || "#";
  $("icMeetingTitle").textContent = activeMeeting?.title || "Team meeting";
  $("icMeetingStatus").textContent = activeMeeting ? "Meeting is live" : "No active meeting";
  $("icMeetingDescription").textContent = activeMeeting
    ? `The IntelliCore team meeting is live${activeMeeting.expiresAt ? ` until ${new Date(activeMeeting.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}.`
    : canManageMeetings
      ? "Start a shared Google Meet for active interns."
      : "There is no active organisation-wide meeting right now.";
  $("icStartMeetButton").hidden = !canManageMeetings || Boolean(activeMeeting);
  $("icEndMeetButton").hidden = !canManageMeetings || !activeMeeting;
}
async function refreshMeetingState() {
  if (!currentUser || !trainingWorkspace || trainingWorkspace.profile.localOnly || trainingWorkspace.profile.profileDraft) return;
  try {
    const result = await callFunction("getActiveTeamMeeting");
    if (auth.currentUser?.uid !== currentUser.uid || !trainingWorkspace) return;
    trainingWorkspace.activeMeeting = result.activeMeeting;
    const profile = trainingWorkspace.profile;
    const hasInternshipProfile = Boolean(
      profile.track && profile.durationMonths && profile.internshipStartDate && profile.internshipEndDate
    );
    renderMeetingPanel(result.activeMeeting, profile.role || "learner", hasInternshipProfile);
  } catch (error) {
    console.error("The shared meeting status could not be refreshed.", error);
  }
}
function updateInternshipPeriodPreview() {
  const duration = Number($("icInternshipDuration").value);
  const startDate = trainingWorkspace?.profile.internshipStartDate || indiaDateString();
  const parts = startDate.split("-");
  const start = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
  const targetMonth = start.getUTCMonth() + duration;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const endDay = Math.min(
    start.getUTCDate(),
    new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate()
  );
  const end = new Date(Date.UTC(targetYear, normalizedMonth, endDay)).toISOString().slice(0, 10);
  $("icInternshipPeriodPreview").textContent = `Your internship will run from ${startDate} through ${end}.`;
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
  if (!recordsReady && !trainingWorkspace) {
    target.className = "ic-activity-empty";
    target.innerHTML = "<strong>Recent activity is unavailable</strong><p>Connect to your private workspace to load account-specific activity.</p>";
    return;
  }
  const all = Object.entries(records).flatMap(([category, items]) => items
    .map(record => ({...record, kind: labels[category].singular})))
    .concat((trainingWorkspace?.assignments || []).map(assignment => ({
      title: assignment.task.title,
      kind: `Training · ${assignment.status.replaceAll("_", " ")}`,
      updatedAt: assignment.updatedAt || assignment.assignedAt || 0
    })))
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
  if (!recordsReady && !trainingWorkspace) {
    target.className = "ic-activity-empty";
    target.innerHTML = "<strong>Task dates are unavailable</strong><p>Connect to your private workspace to load your personal deadlines.</p>";
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const personalDeadlines = (recordsReady ? records.tasks : [])
    .filter(record => record.date && new Date(`${record.date}T00:00:00`).getTime() >= today.getTime() && record.status !== "Completed")
    .map(record => ({ date: record.date, title: record.title, kind: "Personal" }));
  const trainingDeadlines = (trainingWorkspace?.assignments || [])
    .filter(record => record.dueDate && new Date(`${record.dueDate}T00:00:00`).getTime() >= today.getTime()
      && !["approved"].includes(record.status))
    .map(record => ({ date: record.dueDate, title: record.task.title, kind: record.track }));
  const upcoming = personalDeadlines.concat(trainingDeadlines)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  if (!upcoming.length) {
    target.className = "ic-activity-empty";
    target.innerHTML = (trainingWorkspace?.profile.localOnly || trainingWorkspace?.profile.profileDraft) && !recordsReady
      ? "<strong>Personal deadlines are unavailable</strong><p>Connect your secure account workspace to load saved records and dates.</p>"
      : "<strong>No upcoming deadlines</strong><p>Due dates from your personal tasks and assigned training work will appear here.</p>";
    return;
  }
  target.className = "ic-deadline-list";
  target.innerHTML = upcoming.map(record => `<div class="ic-deadline-item"><span>${escapeHtml(new Date(`${record.date}T00:00:00`).toLocaleDateString())} · ${escapeHtml(record.kind)}</span><strong>${escapeHtml(record.title)}</strong></div>`).join("");
}
function renderOnboardingChecklist() {
  if (!currentUser) {
    $("icOnboardingChecklist").textContent = "Sign in to view your account checklist.";
    return;
  }
  const verified = currentUser.emailVerified || currentUser.providerData.some(provider => provider.providerId === "google.com");
  const localOnly = trainingWorkspace?.profile.localOnly;
  const profileDraft = trainingWorkspace?.profile.profileDraft;
  const items = [
    { label: "Add your display name", done: Boolean(currentUser.displayName) },
    { label: "Verify your email or connect Google", done: Boolean(verified) },
    {
      label: "Build your internship profile",
      done: internshipProfileComplete(trainingWorkspace?.profile),
      detail: profileDraft ? "Saved to Firebase · Save profile to activate" : localOnly ? "On this device only" : undefined
    },
    { label: "Receive your first mentor-assigned task", done: Boolean(trainingWorkspace?.assignments.length) }
  ];
  $("icOnboardingChecklist").innerHTML = items.map(item => `<div class="ic-onboarding-item"><span class="${item.done ? "is-done" : ""}" aria-hidden="true">${item.done ? "✓" : "○"}</span><span>${escapeHtml(item.label)}</span><small>${escapeHtml(item.detail || (item.done ? "Done" : "To do"))}</small></div>`).join("");
}
function renderAll() {
  updateCounts();
  renderRecords();
  renderActivity();
  renderUpcomingDeadlines();
  renderOnboardingChecklist();
  renderTraining();
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
  $("icBuildProfileButton").addEventListener("click", () => {
    dialogReturnFocus = document.activeElement;
    $("icInternshipDialog").hidden = false;
    document.body.classList.add("ic-dialog-open");
    updateInternshipPeriodPreview();
    setTimeout(() => $("icInternshipName").focus(), 40);
  });
  ["icCloseInternshipDialog", "icCancelInternshipEdit"].forEach(id =>
    $(id).addEventListener("click", () => {
      $("icInternshipDialog").hidden = true;
      document.body.classList.remove("ic-dialog-open");
      if (dialogReturnFocus instanceof HTMLElement && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
      dialogReturnFocus = null;
    })
  );
  $("icInternshipDialog").addEventListener("click", event => {
    if (event.target === $("icInternshipDialog")) $("icCancelInternshipEdit").click();
  });
  $("icInternshipDuration").addEventListener("change", updateInternshipPeriodPreview);
  const profileAvatar = $("icProfileAvatar");
  const profilePhotoInput = $("icProfilePhotoInput");
  function openProfilePhotoPicker() {
    if (!(currentUser || auth.currentUser)) {
      notice("Sign in before changing your profile photo.");
      return;
    }
    profilePhotoInput.click();
  }
  profileAvatar.addEventListener("click", openProfilePhotoPicker);
  profileAvatar.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openProfilePhotoPicker();
    }
  });
  profilePhotoInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    const user = currentUser || auth.currentUser;
    if (!file || !user) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      notice("Choose a JPEG, PNG, or WebP profile photo.");
      profilePhotoInput.value = "";
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      notice("Choose a profile photo smaller than 3 MB.");
      profilePhotoInput.value = "";
      return;
    }
    profileAvatar.setAttribute("aria-busy", "true");
    notice("Uploading your profile photo…");
    try {
      await uploadBytes(ref(storage, `profilePhotos/${user.uid}/avatar`), file, {
        contentType: file.type
      });
      if (profilePhotoObjectUrl) URL.revokeObjectURL(profilePhotoObjectUrl);
      profilePhotoObjectUrl = URL.createObjectURL(file);
      $("icProfilePhoto").src = profilePhotoObjectUrl;
      $("icProfilePhoto").alt = `${$("icProfileName").textContent}'s profile photo`;
      $("icProfilePhoto").hidden = false;
      notice("Your profile photo has been updated.");
    } catch (error) {
      console.error("The profile photo could not be uploaded.", error);
      notice(error.message || "Could not update your profile photo.");
    } finally {
      profileAvatar.removeAttribute("aria-busy");
      profilePhotoInput.value = "";
    }
  });
  $("icInternshipForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    const formError = $("icInternshipFormError");
    formError.hidden = true;
    formError.textContent = "";
    submit.disabled = true;
    try {
      const previousProfile = trainingWorkspace?.profile;
      const canEditDraftEnrollment = Boolean(previousProfile?.profileDraft || previousProfile?.localOnly);
      const durationMonths = Number(
        canEditDraftEnrollment ? data.get("durationMonths") : previousProfile?.durationMonths || data.get("durationMonths")
      );
      const startDate = previousProfile?.internshipStartDate || indiaDateString();
      const profile = {
        uid: currentUser.uid,
        email: currentUser.email || "",
        displayName: String(data.get("displayName") || "").trim(),
        gender: String(data.get("gender") || ""),
        phone: String(data.get("phone") || "").trim(),
        track: canEditDraftEnrollment
          ? String(data.get("track") || "")
          : previousProfile?.track || String(data.get("track") || ""),
        durationMonths,
        internshipStartDate: startDate,
        internshipEndDate: !canEditDraftEnrollment && previousProfile?.internshipEndDate
          ? previousProfile.internshipEndDate
          : addMonthsToDate(startDate, durationMonths),
        internshipStatus: "pending_activation",
        accountStatus: "active"
      };
      const savedProfile = await callFunction("saveInternshipProfile", {
        displayName: profile.displayName,
        gender: profile.gender,
        phone: profile.phone,
        track: profile.track,
        durationMonths: profile.durationMonths
      });
      authenticatedRole = "learner";
      $("icCancelInternshipEdit").click();
      const existingWorkspace = trainingWorkspace || {
        assignments: [],
        catalog: [],
        reviewQueue: [],
        attendance: [],
        activeMeeting: null,
        internDirectory: [],
        attendanceReport: []
      };
      trainingWorkspace = {
        ...existingWorkspace,
        profile: {
          ...existingWorkspace.profile,
          ...profile,
          internshipStartDate: savedProfile.startDate,
          internshipEndDate: savedProfile.endDate,
          internshipStatus: "active",
          localOnly: false,
          profileDraft: false,
          role: "learner"
        },
        activeInternship: true
      };
      try {
        const attendanceResult = isSundayInIndia()
          ? { skippedSunday: true }
          : await recordAttendanceForLogin(currentUser);
        await refreshTrainingWorkspace();
        renderAll();
        notice(attendanceResult?.skippedSunday
          ? "Your internship profile is active. Sunday attendance is not recorded."
          : attendanceResult?.alreadyCheckedIn
            ? "Your profile is active and today's attendance was already recorded."
            : "Your profile is active, your internship dates are saved, and today's attendance is recorded.");
      } catch (refreshError) {
        console.error("The profile was activated but its dashboard could not be refreshed.", refreshError);
        renderAll();
        notice("Your profile and internship dates were saved, but today's attendance or dashboard could not be refreshed. Retry the connection.", true);
      }
    } catch (error) {
      console.error("The secure internship profile could not be saved.", error);
      const code = typeof error?.code === "string" ? error.code : "";
      const message = typeof error?.message === "string" && error.message
        ? error.message
        : "Unknown Firebase error.";
      formError.textContent = `Could not save or activate your internship profile (${code || "unknown"}): ${message}`;
      formError.hidden = false;
      notice(formError.textContent);
    } finally {
      submit.disabled = false;
    }
  });
  $("icCheckInButton").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await callFunction("checkInToday");
      button.textContent = "Checked in today";
      notice(result.skippedSunday
        ? "Sunday is an off day. Attendance was not recorded."
        : result.alreadyCheckedIn
          ? "Your attendance was already recorded for today."
          : "Your attendance check-in is saved for today.");
      if (result.skippedSunday) {
        button.disabled = true;
        button.textContent = "Sunday (no attendance)";
        return;
      }
      try {
        await refreshTrainingWorkspace();
      } catch (refreshError) {
        console.error("The attendance was saved but its dashboard view could not be refreshed.", refreshError);
        notice("Your attendance was saved. Refresh the dashboard to load the latest attendance details.");
      }
    } catch (error) {
      console.error("Attendance could not be recorded.", error);
      notice(error.message || "Could not record attendance.");
      button.disabled = false;
    }
  });
  $("icInternshipProfileForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    submit.disabled = true;
    try {
      await callFunction("updateInternshipProfile", {
        email: data.get("email"),
        track: data.get("track"),
        durationMonths: Number(data.get("durationMonths")),
        phone: data.get("phone")
      });
      form.reset();
      notice("The intern's domain and duration have been updated.");
      try {
        await refreshTrainingWorkspace();
      } catch (refreshError) {
        console.error("The updated intern profile could not be refreshed.", refreshError);
        notice("The intern profile was updated. Refresh the dashboard to load the latest details.");
      }
    } catch (error) {
      console.error("The intern profile could not be updated.", error);
      notice(error.message || "Could not update the intern profile.");
    } finally {
      submit.disabled = false;
    }
  });
  $("icStartMeetButton").addEventListener("click", async event => {
    const button = event.currentTarget;
    const meetingWindow = window.open("about:blank", "_blank");
    if (meetingWindow) meetingWindow.opener = null;
    button.disabled = true;
    button.textContent = "Starting meeting…";
    try {
      const meeting = await callFunction("startTeamMeeting");
      trainingWorkspace.activeMeeting = meeting;
      renderMeetingPanel(meeting, trainingWorkspace.profile.role || "learner", Boolean(
        trainingWorkspace.profile.track
        && trainingWorkspace.profile.durationMonths
        && trainingWorkspace.profile.internshipStartDate
        && trainingWorkspace.profile.internshipEndDate
      ));
      notice("Google Meet is live and visible to active interns.");
      if (meetingWindow) meetingWindow.location.href = meeting.meetUrl;
      void refreshTrainingWorkspace().catch(error =>
        console.error("The dashboard could not refresh after starting the meeting.", error)
      );
    } catch (error) {
      console.error("The team meeting could not be started.", error);
      notice(error.message || "Could not start the Google Meet.");
      meetingWindow?.close();
    } finally {
      button.disabled = false;
      button.textContent = "Start meeting";
    }
  });
  $("icEndMeetButton").addEventListener("click", async event => {
    if (!confirm("End the shared meeting for everyone?")) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await callFunction("endTeamMeeting");
      trainingWorkspace.activeMeeting = null;
      renderMeetingPanel(null, trainingWorkspace.profile.role || "learner", Boolean(
        trainingWorkspace.profile.track
        && trainingWorkspace.profile.durationMonths
        && trainingWorkspace.profile.internshipStartDate
        && trainingWorkspace.profile.internshipEndDate
      ));
      notice("The shared Google Meet has ended.");
      void refreshTrainingWorkspace().catch(error =>
        console.error("The dashboard could not refresh after ending the meeting.", error)
      );
    } catch (error) {
      console.error("The team meeting could not be ended.", error);
      notice(error.message || "Could not end the Google Meet.");
    } finally {
      button.disabled = false;
    }
  });
  $("icStaffPanel").addEventListener("click", async event => {
    const moreButton = event.target.closest("#icLoadMoreInterns");
    if (moreButton && !moreButton.disabled) {
      moreButton.disabled = true;
      moreButton.textContent = "Loading interns…";
      try {
        const page = await callFunction("getMoreInternDirectory", {
          cursor: moreButton.dataset.cursor
        });
        trainingWorkspace.internDirectory.push(...page.internDirectory);
        trainingWorkspace.internDirectoryHasMore = page.internDirectoryHasMore;
        trainingWorkspace.internDirectoryNextCursor = page.internDirectoryNextCursor;
        renderTraining();
      } catch (error) {
        console.error("The next intern directory page could not be loaded.", error);
        notice(error.message || "Could not load more intern profiles.");
        moreButton.disabled = false;
        moreButton.textContent = "Load more interns";
      }
      return;
    }
    const button = event.target.closest("[data-intern-status][data-intern-uid]");
    if (!button) return;
    const status = button.dataset.internStatus;
    const uid = button.dataset.internUid;
    const isDeactivation = status === "deactivated";
    const prompt = isDeactivation
      ? "Deactivate this intern's sign-in access? Their profile, attendance and training records will be kept."
      : "Restore this intern's sign-in access?";
    if (!confirm(prompt)) return;
    button.disabled = true;
    try {
      await callFunction("setInternAccountStatus", { uid, status });
      await refreshTrainingWorkspace();
      notice(isDeactivation
        ? "Intern access has been deactivated. Their records are retained."
        : "Intern sign-in access has been restored.");
    } catch (error) {
      console.error("The intern account status could not be changed.", error);
      notice(error.message || "Could not update the intern account.");
      button.disabled = false;
    }
  });
  $("icRefreshTraining").addEventListener("click", async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await refreshTrainingWorkspace();
      renderAll();
      notice("Training tasks and review status are up to date.");
    } catch (error) {
      console.error("Training data could not be refreshed.", error);
      notice(error.message || "Could not refresh training data.");
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener("focus", () => void refreshMeetingState());
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
    if (!$("icInternshipDialog").hidden) $("icCancelInternshipEdit").click();
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
    if (view === "profile" && trainingWorkspace?.profile.role === "learner") $("icBuildProfileButton").click();
    else if (view === "profile") $("icProfile").scrollIntoView({ behavior: "smooth", block: "center" });
    else if (view) { setTab(view); $("icRecordsTitle").scrollIntoView({behavior:"smooth",block:"start"}); }
    else {
      const target = button.dataset.workspaceView === "attendance"
        ? !$("icAttendancePanel").hidden
          ? $("icAttendancePanel")
          : !$("icInternshipPrompt").hidden
            ? $("icInternshipPrompt")
            : !$("icAttendanceReportWrap").hidden
              ? $("icAttendanceReportWrap")
                : !$("icInternDirectoryWrap").hidden
                  ? $("icInternDirectoryWrap")
                  : $("icStaffPanel")
        : !$("icTrainingSection").hidden
          ? $("icTrainingSection")
          : $("icInternshipPrompt");
      target.scrollIntoView({behavior:"smooth",block:"start"});
    }
  }));
  $("icAssignTaskForm").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    submit.disabled = true;
    try {
      await callFunction("assignTrainingTask", {
        email: data.get("email"),
        taskId: data.get("taskId"),
        dueDate: data.get("dueDate")
      });
      form.reset();
      try {
        await refreshTrainingWorkspace();
        notice("Training task assigned successfully.");
      } catch (refreshError) {
        console.error("The assigned training task could not be refreshed.", refreshError);
        notice("The task was assigned. Refresh the dashboard to see it in the latest list.");
      }
    } catch (error) {
      notice(error.message || "Could not assign the training task.");
    } finally {
      submit.disabled = false;
    }
  });
  $("icTrainingTasks").addEventListener("submit", async event => {
    const form = event.target.closest("form[data-training-submit]");
    if (!form) return;
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    const data = new FormData(form);
    submit.disabled = true;
    try {
      await callFunction("submitTrainingTask", {
        assignmentId: form.dataset.trainingSubmit,
        text: data.get("text"),
        url: data.get("url")
      });
      notice("Your work was submitted to your mentor for review.");
      try {
        await refreshTrainingWorkspace();
      } catch (refreshError) {
        console.error("The submitted work could not be refreshed.", refreshError);
        notice("Your work was submitted. Refresh the dashboard to load its latest review status.");
      }
    } catch (error) {
      notice(error.message || "Could not submit this training task.");
    } finally {
      submit.disabled = false;
    }
  });
  $("icReviewQueue").addEventListener("submit", async event => {
    const form = event.target.closest("form[data-review-form]");
    if (!form) return;
    event.preventDefault();
    const decision = event.submitter?.dataset.decision;
    const data = new FormData(form);
    const buttons = [...form.querySelectorAll("button")];
    buttons.forEach(button => { button.disabled = true; });
    try {
      await callFunction("reviewTrainingTask", {
        assignmentId: form.dataset.reviewForm,
        decision,
        feedback: data.get("feedback")
      });
      notice(decision === "approved" ? "Task approved and learner notified in the dashboard." : "Revision requested and feedback saved.");
      try {
        await refreshTrainingWorkspace();
      } catch (refreshError) {
        console.error("The saved task review could not be refreshed.", refreshError);
        notice("The review was saved. Refresh the dashboard to load the latest submission status.");
      }
    } catch (error) {
      notice(error.message || "Could not save the task review.");
    } finally {
      buttons.forEach(button => { button.disabled = false; });
    }
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
onAuthStateChanged(auth, async user => {
  if (meetingRefreshTimer !== null) window.clearInterval(meetingRefreshTimer);
  meetingRefreshTimer = null;
  if (!user) {
    if (!loginRedirectStarted) {
      loginRedirectStarted = true;
      window.location.replace("index.html?auth=login");
    }
    return;
  }
  let mayEnterWorkspace = false;
  try {
    await user.reload();
    const latestUser = auth.currentUser;
    if (!latestUser || latestUser.uid !== user.uid) return;
    const token = await latestUser.getIdTokenResult(true);
    const signInProvider = token.claims.firebase?.sign_in_provider;
    const tokenRole = token.claims.role;
    authenticatedRole = [
      "founder", "co_founder", "admin", "hr_manager", "hr_executive",
      "operations_executive", "mentor", "learner"
    ].includes(tokenRole) ? tokenRole : "learner";
    mayEnterWorkspace = token.claims.email_verified === true
      && ["google.com", "password"].includes(signInProvider)
      && (signInProvider !== "password" || latestUser.emailVerified);
  } catch (error) {
    console.error("The signed-in user's email verification status could not be checked.", error);
  }
  if (!mayEnterWorkspace) {
    loginRedirectStarted = true;
    try {
      await signOut(auth);
    } catch (error) {
      console.error("The account without verified email could not be signed out.", error);
    }
    window.location.replace("index.html?auth=login&verification=required");
    return;
  }
  currentUser = user;
  trainingWorkspace = loadLocalTrainingWorkspace(user);
  try {
    trainingWorkspace = await loadFirebaseProfileDraft(user) || trainingWorkspace;
  } catch (error) {
    console.error("The Firebase internship profile draft could not be loaded.", error);
  }
  meetingRefreshTimer = window.setInterval(() => void refreshMeetingState(), 20000);
  let profileSetupError = null;
  let securedProfile = null;
  try {
    securedProfile = await callFunction("ensureProfile");
    if (auth.currentUser?.uid !== user.uid) return;
    await currentUser.reload();
  } catch (error) {
    profileSetupError = error;
    console.error("The secured account profile could not be initialised.", error);
  }
  if (auth.currentUser?.uid !== user.uid) return;
  if (!profileSetupError
    && trainingWorkspace?.profile.profileDraft
    && !securedProfile?.internshipStartDate) {
    const draft = trainingWorkspace.profile;
    try {
      const activated = await callFunction("saveInternshipProfile", {
        displayName: draft.displayName,
        gender: draft.gender,
        phone: draft.phone,
        track: draft.track,
        durationMonths: draft.durationMonths
      });
      trainingWorkspace = {
        ...trainingWorkspace,
        profile: {
          ...draft,
          internshipStartDate: activated.startDate,
          internshipEndDate: activated.endDate,
          internshipStatus: "active",
          profileDraft: false,
          localOnly: false
        },
        activeInternship: true
      };
    } catch (error) {
      console.error("The saved internship profile could not be activated.", error);
      notice(`Your saved internship profile could not be activated. ${error.message || "Retry the connection to try again."}`, true);
    }
  }
  if (auth.currentUser?.uid !== user.uid) return;
  renderProfile(auth.currentUser, trainingWorkspace?.profile || null);
  void connectWorkspace(user, profileSetupError);
});
