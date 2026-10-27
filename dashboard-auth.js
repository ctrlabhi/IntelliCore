import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  connectAuthEmulator, getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, connectFirestoreEmulator, doc, getDoc, getDocs, initializeFirestore,
  limit, orderBy, query, serverTimestamp, setDoc, where
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-functions.js";
import {
  connectStorageEmulator, getBlob, getStorage, ref, uploadBytes
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-storage.js";

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
const useFirebaseEmulators = new URLSearchParams(location.search).get("firebaseEmulator") === "1"
  && ["localhost", "127.0.0.1"].includes(location.hostname);
if (useFirebaseEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
const functions = getFunctions(app, "us-central1");
const storage = getStorage(app);
if (useFirebaseEmulators) connectStorageEmulator(storage, "127.0.0.1", 9199);
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
let dialogReturnFocus = null;
let connectionAttempt = 0;
let trainingWorkspace = null;
let activeTaskFilter = "all";
let selectedAttendanceMonth = "";
let internshipPeriodPreview = null;
let profilePhotoObjectUrl = null;
let meetingRefreshTimer = null;

const localProfileStorageKey = uid => `icLocalInternshipProfile:${uid}`;
const firebaseProfileDraftRef = uid => doc(db, "users", uid, "profileDrafts", "current");
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
async function ensureClientProfile(user) {
  const ref = doc(db, "profiles", user.uid);
  const snapshot = await getDoc(ref);
  const token = await user.getIdTokenResult();
  if (snapshot.exists()) {
    const profile = snapshot.data();
    if (profile.role !== (token.claims.role || "learner")) {
      throw new Error("Your workspace profile and Firebase role claim do not match. Contact an authorised administrator.");
    }
    return profile;
  }
  if (token.claims.role && token.claims.role !== "learner") {
    throw new Error("This staff profile must be provisioned by an authorised administrator.");
  }
  const profile = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || "",
    role: "learner",
    mentorTracks: [],
    track: null
  };
  await setDoc(ref, profile);
  return profile;
}
async function saveClientProfileDraft(user, values) {
  const startDate = values.internshipStartDate;
  const endDate = addMonthsToDate(startDate, values.durationMonths);
  const parsedStart = new Date(`${startDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)
    || Number.isNaN(parsedStart.getTime())
    || parsedStart.toISOString().slice(0, 10) !== startDate) {
    throw new Error("Choose a valid internship start date.");
  }
  if (!tracksForDashboard.includes(values.track)) throw new Error("Choose an internship domain.");
  if (![1, 2, 3, 6].includes(values.durationMonths)) throw new Error("Choose a valid internship duration.");
  if (!["Female", "Male"].includes(values.gender)) throw new Error("Choose a gender option.");
  if (!/^[+()0-9 .-]{7,24}$/.test(values.phone)
    || values.phone.replace(/\D/g, "").length < 7
    || values.phone.replace(/\D/g, "").length > 15) {
    throw new Error("Enter a valid phone number with 7 to 15 digits.");
  }
  if (values.displayName.length < 2 || values.displayName.length > 80) {
    throw new Error("Full name must be between 2 and 80 characters.");
  }
  const ref = firebaseProfileDraftRef(user.uid);
  await setDoc(ref, {
    displayName: values.displayName,
    email: user.email || "",
    gender: values.gender,
    phone: values.phone,
    track: values.track,
    durationMonths: values.durationMonths,
    internshipStartDate: startDate,
    internshipEndDate: endDate,
    savedAt: serverTimestamp()
  });
  const saved = await getDoc(ref);
  if (!saved.exists()) throw new Error("The profile draft was saved but could not be reloaded.");
  return createFirebaseDraftWorkspace(user, saved.data()).profile;
}
async function updateClientPersonalProfile(user, values) {
  const ref = doc(db, "profiles", user.uid);
  await setDoc(ref, {
    displayName: values.displayName,
    gender: values.gender,
    phone: values.phone
  }, { merge: true });
  const saved = await getDoc(ref);
  if (!saved.exists()) throw new Error("The profile was updated but could not be reloaded.");
  return saved.data();
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
    || draft.email !== (user.email || "")
    || (draft.internshipStartDate !== undefined
      && !/^\d{4}-\d{2}-\d{2}$/.test(draft.internshipStartDate))
    || (draft.internshipEndDate !== undefined
      && !/^\d{4}-\d{2}-\d{2}$/.test(draft.internshipEndDate))
    || Boolean(draft.internshipStartDate) !== Boolean(draft.internshipEndDate)
    || (draft.internshipStartDate && draft.internshipEndDate
      && draft.internshipEndDate < draft.internshipStartDate)) {
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
  $("workspaceTop").setAttribute("aria-busy", "true");
  renderAll();
  notice(trainingWorkspace?.profile.profileDraft
    ? "Your saved internship profile is ready. Connecting to assigned training…"
    : trainingWorkspace?.profile.localOnly
      ? "Your profile is on this device only. Connecting to assigned training…"
      : "Connecting to your private workspace…");
  const [trainingResult] = await Promise.allSettled([
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
  if (trainingResult.status === "rejected") {
    if (trainingWorkspace?.profile.localOnly) {
      notice("Your profile is saved on this device only. It is not synced to your IntelliCore account.");
    } else if (trainingWorkspace?.profile.profileDraft) {
      notice("Your saved profile is ready, but secure activation and training could not connect.");
    } else {
      notice(`Your secure profile or workspace could not be loaded. ${trainingResult.reason?.message || "Check your Firestore rules and connection."}`, true);
    }
  } else {
    notice(trainingWorkspace?.sparkLimited
      ? "Your profile, assigned task statuses, and saved attendance loaded. Detailed curriculum, task actions, and new attendance require trusted Cloud Functions; nothing was fabricated."
      : "Your private workspace and training assignments are ready.");
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
    } else if (trainingWorkspace.sparkLimited) {
      notice("Your workspace is ready. Login attendance requires a trusted Cloud Function and was not recorded on the Spark plan.");
    } else {
      let result;
      try {
        result = await recordAttendanceForLogin(user, attempt);
        if (attempt !== connectionAttempt) return;
      } catch (error) {
        console.error("Daily attendance could not be recorded during login.", error);
        notice(`Your dashboard is ready, but today's attendance was not recorded. ${callableErrorNotice(error, "checkInToday")}`, true);
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
function escapeHtml(value="") {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}
function internshipProfileComplete(profile) {
  return Boolean(
    profile?.role === "learner"
    && !profile.profileDraft
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
  const button = $("icBuildProfileButton");
  const isOnboarding = isLearner && !complete;
  $("icProfile").classList.remove("is-onboarding");
  $("icInternshipPrompt").hidden = true;
  $("icProfileName").hidden = false;
  $("icProfileEmail").hidden = false;
  $("icProfileInitial").hidden = false;
  if (isOnboarding) {
    const accountUser = currentUser || auth.currentUser;
    const displayName = profile?.displayName || accountUser?.displayName
      || accountUser?.email?.split("@")[0] || "Welcome";
    $("icProfileName").textContent = displayName;
  }
  button.hidden = true;
  button.textContent = isOnboarding
    ? "Build your profile"
    : "Edit profile";
  button.classList.remove("is-onboarding");
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
function renderAttendanceCalendar(attendance, periodPreview = internshipPeriodPreview) {
  const today = indiaDateString();
  const currentMonth = today.slice(0, 7);
  const firstRecordedDate = attendance
    .map(item => item.attendanceDate)
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()[0];
  const rawInternshipStartDate = periodPreview?.startDate || trainingWorkspace?.profile?.internshipStartDate;
  const internshipStartDate = /^\d{4}-\d{2}-\d{2}$/.test(rawInternshipStartDate || "")
    ? rawInternshipStartDate
    : null;
  const rawInternshipEndDate = periodPreview?.endDate || trainingWorkspace?.profile?.internshipEndDate;
  const internshipEndDate = /^\d{4}-\d{2}-\d{2}$/.test(rawInternshipEndDate || "")
    ? rawInternshipEndDate
    : null;
  const hasDateRange = Boolean(internshipStartDate && internshipEndDate);
  const savedDraftPreview = !periodPreview
    && Boolean(trainingWorkspace?.profile?.profileDraft || trainingWorkspace?.profile?.localOnly);
  const hasInternshipPeriod = !periodPreview && hasDateRange
    && !trainingWorkspace?.profile?.profileDraft
    && !trainingWorkspace?.profile?.localOnly;
  const isPeriodPreview = Boolean(hasDateRange && (periodPreview || savedDraftPreview));
  const [currentYear, currentMonthNumber] = currentMonth.split("-").map(Number);
  const currentMonthIndex = currentYear * 12 + currentMonthNumber - 1;
  const startMonth = internshipStartDate?.slice(0, 7)
    || firstRecordedDate?.slice(0, 7)
    || currentMonth;
  const [startYear, startMonthNumber] = startMonth.split("-").map(Number);
  const startPeriodMonthIndex = startYear * 12 + startMonthNumber - 1;
  const endPeriodMonthIndex = hasDateRange
    ? Number(internshipEndDate.slice(0, 4)) * 12 + Number(internshipEndDate.slice(5, 7)) - 1
    : currentMonthIndex;
  const firstMonthIndex = hasDateRange
    ? startPeriodMonthIndex
    : Math.min(currentMonthIndex, Math.max(startPeriodMonthIndex, currentMonthIndex - 11));
  const lastMonthIndex = hasDateRange
    ? endPeriodMonthIndex
    : currentMonthIndex;
  const months = [];
  for (let monthIndex = lastMonthIndex; monthIndex >= firstMonthIndex; monthIndex--) {
    const year = Math.floor(monthIndex / 12);
    const month = monthIndex % 12 + 1;
    const value = `${year}-${String(month).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
      .format(new Date(Date.UTC(year, month - 1, 1)));
    months.push(`<option value="${value}">${value === currentMonth ? "This Month" : label}</option>`);
  }
  const monthFilter = $("icAttendanceMonthFilter");
  monthFilter.closest("label").hidden = false;
  monthFilter.innerHTML = months.join("");
  if (!months.some(option => option.includes(`value="${selectedAttendanceMonth}"`))) {
    selectedAttendanceMonth = months.some(option => option.includes(`value="${currentMonth}"`))
      ? currentMonth
      : startMonth;
  }
  monthFilter.value = selectedAttendanceMonth;
  const [year, month] = selectedAttendanceMonth.split("-").map(Number);
  const firstWeekday = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const recordedDates = new Set(attendance.map(item => item.attendanceDate));
  const monthLabel = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  }).format(new Date(Date.UTC(year, month - 1, 1)));
  const weekdays = ["M", "T", "W", "T", "F", "S", "S"]
    .map(day => `<span aria-hidden="true">${day}</span>`).join("");
  const blanks = Array.from({ length: firstWeekday }, () => '<span class="ic-calendar-day is-empty" aria-hidden="true"></span>').join("");
  let presentCount = 0;
  let noRecordCount = 0;
  let upcomingCount = 0;
  let proposedCount = 0;
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const recorded = recordedDates.has(date);
    const isWorkday = hasInternshipPeriod
      && !isSundayInIndia(date)
      && (!internshipStartDate || date >= internshipStartDate)
      && (!internshipEndDate || date <= internshipEndDate);
    const isProposedWorkday = isPeriodPreview
      && !isSundayInIndia(date)
      && date >= internshipStartDate
      && date <= internshipEndDate;
    const upcoming = date > today && isWorkday;
    const noRecord = date < today && isWorkday && !recorded;
    if (isProposedWorkday) proposedCount++;
    if (recorded) presentCount++;
    if (noRecord) noRecordCount++;
    if (upcoming) upcomingCount++;
    const classes = ["ic-calendar-day", recorded ? "is-recorded" : "", noRecord ? "is-no-record" : "", upcoming || isProposedWorkday ? "is-upcoming" : "", date === today ? "is-today" : ""]
      .filter(Boolean).join(" ");
    const label = recorded
      ? `${day}, attendance recorded`
      : isProposedWorkday
        ? `${day}, proposed internship workday; attendance is not active`
      : upcoming
        ? `${day}, upcoming workday`
        : noRecord
          ? `${day}, no check-in recorded`
            : date === today
              ? `${day}, today`
              : isSundayInIndia(date) ? `${day}, Sunday off` : `${day}, outside internship period`;
    return `<span class="${classes}" aria-label="${label}"${date === today ? ' aria-current="date"' : ""}>${day}</span>`;
  }).join("");
  $("icAttendanceHistory").innerHTML = `
    <div class="ic-attendance-calendar-body">
      <div class="ic-attendance-calendar-grid" aria-label="${monthLabel} attendance calendar">${weekdays}${blanks}${days}</div>
      <div class="ic-attendance-calendar-legend" aria-label="Attendance calendar legend">
        <span><i class="is-recorded"></i><span>Present</span><strong>${presentCount}</strong></span>
        ${isPeriodPreview
          ? `<span><i class="is-upcoming"></i><span>Proposed workdays</span><strong>${proposedCount}</strong></span>`
          : `<span><i class="is-no-record"></i><span>No record</span><strong>${noRecordCount}</strong></span>
        <span><i class="is-upcoming"></i><span>Upcoming</span><strong>${upcomingCount}</strong></span>`}
      </div>
    </div>`;
}
async function recordAttendanceForLogin(user, attempt = connectionAttempt) {
  const result = await callFunction("checkInToday");
  if (attempt !== connectionAttempt || auth.currentUser?.uid !== user.uid) return null;
  return result;
}
function initialsFor(name) {
  return (name || "IC").trim().split(/\s+/).slice(0,2).map(part => part[0] || "").join("").toUpperCase() || "IC";
}
function renderDashboardIdentity(name, profile = null) {
  const displayName = name || "Intern";
  $("icDashboardUserName").textContent = displayName;
  $("icDashboardInitial").textContent = displayName.trim().charAt(0).toUpperCase() || "I";
  $("icDashboardUserRole").textContent = profile?.track ? `${profile.track} Intern` : "Intern";
}
function renderProfile(user, profile = trainingWorkspace?.profile || null) {
  const name = profile?.displayName || user.displayName || (user.email || "").split("@")[0] || "IntelliCore member";
  $("icProfileName").textContent = name;
  $("icInternWelcomeName").textContent = name.trim().split(/\s+/)[0] || "Intern";
  $("icProfileEmail").textContent = user.email || "Google account";
  $("icInternshipTitle").textContent = profile?.track
    ? `${profile.track} Intern`
    : "Internship not active";
  renderDashboardIdentity(name, profile);
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
function renderInternProfileDetails(profile, hasInternshipProfile, internshipActive, today = indiaDateString()) {
  const rows = [
    ["duration", "Duration", profile.durationMonths
      ? `${profile.durationMonths} Month${profile.durationMonths === 1 ? "" : "s"}${profile.internshipStartDate && profile.internshipEndDate ? ` (${profile.internshipStartDate} to ${profile.internshipEndDate})` : ""}`
      : "Not set"],
    ["domain", "Domain", profile.track || "Not selected"],
    ["role", "Role", "Intern"],
    ...(profile.teamLeaderName || profile.mentorName
      ? [["leader", "Team Leader", profile.teamLeaderName || profile.mentorName]]
      : []),
    ["email", "Email", profile.email || currentUser?.email || "Not available"],
    ["gender", "Gender", profile.gender || "Not added"],
    ["phone", "Phone", profile.phone || "Not added"],
    ["status", "Status", profile.statusLabel || (profile.profileDraft
      ? "Pending activation"
      : profile.localOnly
        ? "Not synced"
        : hasInternshipProfile
          ? internshipActive ? "Active" : profile.internshipEndDate < today ? "Completed" : "Not active"
          : "Profile incomplete")]
  ];
  $("icInternProfileDetails").innerHTML = rows.map(([icon, label, value]) => `
    <div class="ic-intern-profile-row">
      <span class="ic-intern-profile-icon ic-profile-icon-${icon}" aria-hidden="true"></span>
      <span class="ic-intern-profile-label">${label}</span>
      <strong${icon === "status" && value === "Active" ? ' class="is-profile-active"' : ""}>${escapeHtml(value)}</strong>
    </div>`).join("");
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
    const displayName = accountUser?.displayName || accountUser?.email?.split("@")[0] || "Your workspace";
    if (accountUser) {
      $("icProfileName").textContent = displayName;
      $("icProfileEmail").textContent = accountUser.email || "";
      renderDashboardIdentity($("icProfileName").textContent);
      $("icInternshipName").value = accountUser.displayName || "";
      $("icInternshipEmail").value = accountUser.email || "";
    }
    $("icInternshipTitle").textContent = accountUser ? "Internship not active" : "Sign in required";
    renderInternProfileDetails({
      displayName,
      email: accountUser?.email || "Not available",
      statusLabel: accountUser ? undefined : "Sign in required"
    }, false, false);
    $("icProfileDetailsButton").textContent = accountUser ? "Complete Profile" : "Sign in to continue";
    $("icProfileDetailsButton").disabled = !accountUser;
    $("icProfileDetailsButton").setAttribute("aria-label", accountUser
      ? "Complete your internship profile"
      : "Sign in to complete your internship profile");
    renderProfileOnboarding(authenticatedRole);
    $("icTrainingTrack").textContent = "Training unavailable";
    $("icTrainingIntro").textContent = "Your private Firestore workspace could not be reached. Check the connection and deployed Firestore rules.";
    tasksElement.innerHTML = '<div class="ic-activity-empty"><strong>Your training could not be loaded</strong><p>Check that Firestore is enabled and the owner-only security rules are deployed, then retry.</p></div>';
    $("icAssignedTrainingCount").textContent = "—";
    $("icApprovedTrainingCount").textContent = "—";
    $("icPendingTaskCount").textContent = "—";
    $("icInProgressTaskCount").textContent = "—";
    $("icCompletedTaskCount").textContent = "—";
    $("icTrainingProgress").textContent = "Training service unavailable";
    $("icInternshipProgress").textContent = "—";
    $("icProgressPanel").hidden = false;
    $("icProgressChartValue").textContent = "—";
    $("icProgressChart").setAttribute("aria-label", "Internship progress is unavailable until assignments load");
    $("icProgressChart").style.setProperty("--progress-value", "0%");
    $("icProgressApproved").textContent = "—";
    $("icProgressActive").textContent = "—";
    $("icProgressPending").textContent = "—";
    $("icStaffPanel").hidden = true;
    $("icAttendancePanel").hidden = false;
    $("icAttendanceSummary").textContent = "Attendance history could not be loaded from your private Firestore workspace.";
    $("icAttendanceMessage").textContent = "Check your connection and Firestore rules, then retry to view saved attendance.";
    $("icCheckInButton").disabled = true;
    $("icCheckInButton").textContent = "Unavailable";
    $("icAttendanceMonthFilter").closest("label").hidden = true;
    $("icAttendanceHistory").innerHTML = '<div class="ic-activity-empty"><strong>Attendance could not be loaded</strong><p>Connect to the secure workspace to view your attendance calendar.</p></div>';
    $("icMeetingPanel").hidden = true;
    $("icTrainingSection").hidden = false;
    return;
  }

  const {
    profile, assignments, catalog, reviewQueue, attendance = [],
    activeInternship, activeMeeting, internDirectory = [], attendanceReport = [],
    internDirectoryHasMore = false, internDirectoryNextCursor = null
  } = trainingWorkspace;
  const pendingAssignments = assignments.filter(assignment => assignment.status === "assigned");
  const inProgressAssignments = assignments.filter(assignment =>
    ["submitted", "changes_requested"].includes(assignment.status)
  );
  const completedAssignments = assignments.filter(assignment => assignment.status === "approved");
  $("icPendingTaskCount").textContent = String(pendingAssignments.length);
  $("icInProgressTaskCount").textContent = String(inProgressAssignments.length);
  $("icCompletedTaskCount").textContent = String(completedAssignments.length);
  const role = profile.role || "learner";
  const isIntern = role === "learner";
  $("icProgressPanel").hidden = !isIntern;
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

  $("icAttendancePanel").hidden = !isIntern;
  $("icTrainingSection").hidden = false;
  $("icProfileName").textContent = profile.displayName || currentUser?.displayName || currentUser?.email?.split("@")[0] || "Your workspace";
  $("icProfileInitial").textContent = $("icProfileName").textContent.trim().charAt(0).toUpperCase() || "I";
  renderDashboardIdentity($("icProfileName").textContent, profile);
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
  $("icInternshipStartDate").value = profile.internshipStartDate || indiaDateString();
  $("icInternshipEndDate").value = profile.internshipEndDate || addMonthsToDate(
    $("icInternshipStartDate").value,
    Number(durationSelect.value)
  );
  $("icInternshipTrack").value = profile.track || "";
  $("icInternshipForm").elements.track.value = profile.track || tracksForDashboard[0];
  $("icInternshipPhone").value = profile.phone || "";
  const profileIsDraft = Boolean(profile.profileDraft || profile.localOnly);
  const trackIsLocked = hasInternshipProfile || (Boolean(profile.track) && !profileIsDraft);
  const durationIsLocked = hasInternshipProfile || (Boolean(profile.durationMonths) && !profileIsDraft);
  $("icInternshipTrack").disabled = trackIsLocked;
  $("icInternshipForm").elements.track.disabled = trackIsLocked;
  $("icInternshipForm").elements.durationMonths.disabled = durationIsLocked;
  $("icInternshipStartDate").disabled = hasInternshipProfile;
  $("icInternshipDialogTitle").textContent = profile.profileDraft
    ? "Your saved profile draft"
    : hasInternshipProfile
    ? "Your internship profile"
    : "Build your internship profile";
  $("icInternshipDialogDescription").textContent = profile.profileDraft
    ? "Your saved details are ready. The end date follows your selected duration; trusted processing is required to activate the internship."
    : hasInternshipProfile
    ? "Update your personal details below. Domain, duration, and dates stay fixed while your internship is active."
    : "Enter your details, choose your domain and duration, and select a start date. On Spark, saving creates a private draft; activation requires trusted backend processing.";
  $("icInternshipPeriodPreview").textContent = profile.profileDraft
    ? `Profile draft saved to Firebase. Proposed period: ${profile.internshipStartDate} through ${profile.internshipEndDate}.`
    : hasInternshipProfile
    ? `Active from ${profile.internshipStartDate} through ${profile.internshipEndDate}. Contact HR if your domain or duration needs to change.`
    : "Your selected dates are a proposed internship period. Attendance starts only after trusted activation.";
  $("icBuildProfileButton").textContent = hasRequiredProfile ? "Edit profile" : "Build your profile";

  const internshipActive = Boolean(activeInternship);
  $("icAttendanceSummary").textContent = hasInternshipProfile
    ? trainingWorkspace.sparkLimited
      ? `Saved attendance is read-only on Spark. Secure check-in requires trusted backend processing. ${profile.track} · ${profile.durationMonths} month${profile.durationMonths === 1 ? "" : "s"} · ${profile.internshipStartDate} to ${profile.internshipEndDate}`
      : `Attendance is recorded automatically once per login day (Sunday excluded). ${profile.track} · ${profile.durationMonths} month${profile.durationMonths === 1 ? "" : "s"} · ${profile.internshipStartDate} to ${profile.internshipEndDate}`
    : profile.profileDraft
      ? "Your selected internship dates are saved as a draft. Attendance begins only after trusted activation."
      : "Complete your internship profile to activate attendance tracking.";
  $("icAttendanceStatStatus").textContent = profile.profileDraft
    ? "Draft saved"
    : profile.localOnly
      ? "Not synced"
    : isIntern
    ? hasInternshipProfile ? `${attendance.length} check-in${attendance.length === 1 ? "" : "s"}` : "Not enrolled"
    : canViewAttendance ? `${attendanceReport.length} check-ins` : "Staff view";
  $("icAttendanceStatDetail").textContent = profile.profileDraft
    ? "Attendance requires trusted activation"
    : profile.localOnly
      ? "Available after secure profile sync"
    : isIntern
    ? hasInternshipProfile ? "Saved check-ins in this internship" : "Build your internship profile to begin"
    : canViewAttendance ? "Open the staff attendance report" : "Attendance is managed by authorised staff";
  $("icCheckInButton").disabled = profile.profileDraft || profile.localOnly
    || trainingWorkspace.sparkLimited || !internshipActive || isCheckedIn || isSunday;
  $("icCheckInButton").textContent = profile.profileDraft
    ? "Activation required"
    : profile.localOnly
      ? "Sync required"
      : trainingWorkspace.sparkLimited
        ? "Check-in requires secure backend"
    : isSunday ? "Sunday (no attendance)"
      : isCheckedIn ? "Attendance recorded today" : internshipActive ? "Check in today" : "Internship ended";
  renderInternProfileDetails(profile, hasInternshipProfile, internshipActive, today);
  $("icProfileDetailsButton").textContent = hasRequiredProfile
    ? "View Details"
    : profile.profileDraft || profile.localOnly
      ? "Continue Setup"
      : "Complete Profile";
  $("icProfileDetailsButton").disabled = false;
  $("icProfileDetailsButton").setAttribute("aria-label", hasRequiredProfile
    ? "View or edit your internship profile"
    : "Complete your internship profile");
  $("icAttendanceMessage").textContent = trainingWorkspace.sparkLimited
    ? "Saved attendance history is read-only on the Spark plan. Automatically recording or submitting a new check-in requires a trusted Cloud Function; no client-generated attendance is accepted."
    : profile.profileDraft
    ? "Your profile is saved as a draft. Attendance will begin only after trusted profile activation."
    : profile.localOnly
      ? "This profile is saved on this device only. Sync it to your account before using attendance."
    : isCheckedIn
    ? "Your attendance for today was recorded automatically when you logged in."
    : isSunday
      ? "Sunday is an off day. Attendance is not recorded on Sundays."
    : internshipActive
      ? "Attendance is recorded automatically when you log in during your internship. You can also check in manually."
      : !hasInternshipProfile
        ? "Complete your internship profile to activate attendance tracking."
      : `Your internship period ended on ${profile.internshipEndDate}. Attendance is closed.`;
  renderAttendanceCalendar(attendance);

  renderMeetingPanel(activeMeeting, role, hasInternshipProfile, trainingWorkspace.sparkLimited);

  if (role === "learner") {
    const approved = assignments.filter(assignment => assignment.status === "approved").length;
    const progress = assignments.length ? Math.round((approved / assignments.length) * 100) : 0;
    const inReview = assignments.filter(assignment => ["submitted", "changes_requested"].includes(assignment.status)).length;
    const pending = assignments.filter(assignment => assignment.status === "assigned").length;
    $("icAssignedTrainingCount").textContent = profile.profileDraft || profile.localOnly ? "—" : String(assignments.length);
    $("icApprovedTrainingCount").textContent = profile.profileDraft || profile.localOnly ? "—" : String(approved);
    $("icProgressChartValue").textContent = profile.profileDraft || profile.localOnly ? "—" : `${progress}%`;
    $("icProgressChart").setAttribute("aria-label", profile.profileDraft || profile.localOnly
      ? "Internship progress is unavailable"
      : `${progress}% overall internship progress`);
    $("icProgressChart").style.setProperty("--progress-value", profile.profileDraft || profile.localOnly ? "0%" : `${progress}%`);
    $("icProgressApproved").textContent = profile.profileDraft || profile.localOnly ? "—" : String(approved);
    $("icProgressActive").textContent = profile.profileDraft || profile.localOnly ? "—" : String(inReview);
    $("icProgressPending").textContent = profile.profileDraft || profile.localOnly ? "—" : String(pending);
    $("icTrainingProgress").textContent = profile.profileDraft
      ? "Save profile to activate"
      : profile.localOnly ? "Secure assignments unavailable"
      : `${pending} pending · ${approved} complete`;
    $("icInternshipProgress").textContent = profile.profileDraft
      ? "Profile not activated"
      : profile.localOnly ? "Sync required" : `${progress}%`;
  } else {
    $("icAssignedTrainingCount").textContent = "Staff";
    $("icApprovedTrainingCount").textContent = "—";
    $("icProgressChartValue").textContent = "—";
    $("icProgressChart").setAttribute("aria-label", "Internship progress is not available for staff accounts");
    $("icProgressChart").style.setProperty("--progress-value", "0%");
    $("icProgressApproved").textContent = "—";
    $("icProgressActive").textContent = "—";
    $("icProgressPending").textContent = "—";
    $("icTrainingProgress").textContent = "Manage assigned work";
    $("icInternshipProgress").textContent = "Staff view";
  }
  $("icTrainingTrack").textContent = profile.track
    || (role === "mentor" ? profile.mentorTracks.join(", ") || "No tracks assigned" : ["founder", "co_founder", "admin"].includes(role) ? "All tracks" : "Track pending");
  $("icTrainingIntro").textContent = profile.profileDraft
    ? "Your profile and selected dates are saved as a draft. Trusted backend activation is required before training or attendance starts."
    : profile.localOnly
      ? "Profile saved on this device. Secure training data is not synced."
    : role === "learner"
    ? profile.track
      ? trainingWorkspace.sparkLimited
        ? `Your ${profile.track} assignment statuses are available. Detailed curriculum and submissions require the trusted Cloud Functions backend, which is not available on Spark.`
        : `Your ${profile.track} training assignments and progress.`
      : "Complete your profile to activate your internship and see assignments here."
    : `Signed in with ${role} access for your authorised training tracks.`;

  if (profile.profileDraft) {
    tasksElement.innerHTML = '<div class="ic-activity-empty"><strong>Profile draft saved</strong><p>Your domain, duration, and dates are saved. Activating the internship and unlocking training requires trusted backend processing, which is not available on Spark.</p></div>';
  } else if (profile.localOnly) {
    tasksElement.innerHTML = '<div class="ic-activity-empty"><strong>Your dashboard is ready</strong><p>Training assignments will appear after this profile is securely synced to your IntelliCore account.</p></div>';
  } else if (!profile.track && role === "learner") {
    tasksElement.innerHTML = '<div class="ic-activity-empty"><strong>Your training track is not assigned yet</strong><p>Contact an IntelliCore administrator. Your track and tasks will appear here after assignment.</p></div>';
  } else if (!assignments.length) {
    tasksElement.innerHTML = role === "learner"
      ? '<div class="ic-activity-empty"><strong>No tasks assigned yet</strong><p>Your mentor will assign track-specific work here. Instructions, deliverables, and evaluation rubrics will appear with every task.</p></div>'
      : '<div class="ic-activity-empty"><strong>No personal learner assignments</strong><p>Use the staff tools below to assign training work and review learner submissions.</p></div>';
  } else {
    const query = $("icTaskSearch").value.trim().toLocaleLowerCase();
    const filteredAssignments = assignments.filter(assignment =>
      (activeTaskFilter === "all"
        || (activeTaskFilter === "pending" && assignment.status === "assigned")
        || (activeTaskFilter === "in-progress" && ["submitted", "changes_requested"].includes(assignment.status))
        || (activeTaskFilter === "completed" && assignment.status === "approved"))
      && [assignment.task.title, assignment.task.track, assignment.task.instructions, assignment.status]
        .some(value => String(value || "").toLocaleLowerCase().includes(query))
    );
    tasksElement.innerHTML = filteredAssignments.length ? filteredAssignments.map(assignment => {
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
      const canSubmit = role === "learner" && !trainingWorkspace.sparkLimited
        && ["assigned", "changes_requested"].includes(assignment.status);
      const submitForm = canSubmit
        ? `<form class="ic-training-submit" data-training-submit="${escapeHtml(assignment.id)}"><label>Submission notes<textarea name="text" maxlength="20000" rows="3" placeholder="Summarise your work and what you learned"></textarea></label><label>Deliverable link (optional)<input name="url" type="url" maxlength="2048" placeholder="https://…"></label><button type="submit" class="ic-primary-button">Submit for review</button></form>`
        : "";
      const statusLabel = {
        assigned: "Pending",
        submitted: "Submitted",
        changes_requested: "Revision required",
        approved: "Completed"
      }[assignment.status] || assignment.status.replaceAll("_", " ");
      return `<article class="ic-training-task"><div class="ic-training-task-heading"><div><span class="ic-muted-label">${escapeHtml(task.track)}</span><h3>${escapeHtml(task.title)}</h3></div><span class="ic-training-status status-${escapeHtml(assignment.status)}">${escapeHtml(statusLabel)}</span></div>${due}<details><summary>Task instructions, deliverable &amp; rubric</summary><p>${escapeHtml(task.instructions)}</p><div class="ic-training-deliverable"><strong>Deliverable</strong><p>${escapeHtml(task.deliverable)}</p></div><ul class="ic-training-rubric">${rubric}</ul></details>${submission}${feedback}${submitForm}</article>`;
    }).join("") : '<div class="ic-activity-empty"><strong>No matching assigned tasks</strong><p>Try another search term or task status.</p></div>';
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
  if (authenticatedRole === "learner") {
    const user = currentUser || auth.currentUser;
    if (!user) throw new Error("Sign in to load your private workspace.");
    const profileRefForUser = doc(db, "profiles", user.uid);
    const [profileSnapshot, assignmentSnapshot, attendanceSnapshot] = await Promise.all([
      getDoc(profileRefForUser),
      getDocs(query(
        collection(db, "trainingAssignments"),
        where("assignedToUid", "==", user.uid),
        orderBy("assignedAt", "desc"),
        limit(100)
      )),
      getDocs(query(
        collection(db, "internships", user.uid, "attendance"),
        orderBy("attendanceDate", "desc"),
        limit(200)
      ))
    ]);
    if (!profileSnapshot.exists()) {
      throw new Error("Your learner profile is not available. Refresh and retry.");
    }
    const profile = profileSnapshot.data();
    const today = indiaDateString();
    const assignments = assignmentSnapshot.docs.map(document => {
      const assignment = document.data();
      const task = window.IntelliCoreCurriculum?.taskById.get(assignment.taskId);
      const taskTitle = assignment.taskTitle || task?.title
        || String(assignment.taskId || "Assigned task").replaceAll("-", " ");
      return {
        id: document.id,
        ...assignment,
        assignedAt: assignment.assignedAt?.toMillis?.() || null,
        updatedAt: assignment.updatedAt?.toMillis?.() || null,
        task: task || {
          title: taskTitle,
          track: assignment.track || profile.track || "",
          instructions: "Detailed task instructions are not stored in this assignment record. The secure training service is required to load the approved curriculum.",
          deliverable: "Refer to the task assignment provided by your mentor.",
          rubric: []
        }
      };
    });
    const attendance = attendanceSnapshot.docs.map(document => ({
      attendanceDate: document.get("attendanceDate"),
      checkedInAt: document.get("checkedInAt")?.toMillis?.() || null
    }));
    const profileDraft = !internshipProfileComplete(profile)
      ? await loadFirebaseProfileDraft(user)
      : null;
    trainingWorkspace = {
      profile: profileDraft?.profile || { ...profile, uid: user.uid, email: user.email || "", role: "learner" },
      assignments,
      catalog: [],
      reviewQueue: [],
      attendance,
      activeInternship: Boolean(
        profile.internshipStartDate
        && profile.internshipEndDate
        && today >= profile.internshipStartDate
        && today <= profile.internshipEndDate
      ),
      activeMeeting: null,
      internDirectory: [],
      attendanceReport: [],
      sparkLimited: true
    };
    renderTraining();
    return;
  }
  const workspace = await callFunction("getTrainingDashboard");
  const profileDraft = workspace.profile?.role === "learner" && !internshipProfileComplete(workspace.profile)
    ? await loadFirebaseProfileDraft(currentUser)
    : null;
  trainingWorkspace = profileDraft
    ? { ...workspace, profile: profileDraft.profile }
    : workspace;
  renderTraining();
}
function renderMeetingPanel(activeMeeting, role, hasInternshipProfile, sparkLimited = false) {
  const canManageMeetings = ["founder", "co_founder"].includes(role);
  const canSeeMeeting = hasInternshipProfile || [
    "founder", "co_founder", "admin", "hr_manager", "hr_executive", "operations_executive"
  ].includes(role);
  $("icMeetingPanel").hidden = !canSeeMeeting;
  $("icJoinMeetButton").hidden = !activeMeeting;
  $("icJoinMeetButton").href = activeMeeting?.meetUrl || "#";
  $("icMeetingTitle").textContent = activeMeeting?.title || "Team meeting";
  $("icMeetingStatus").textContent = activeMeeting
    ? "Meeting is live"
    : sparkLimited ? "Secure service unavailable" : "No active meeting";
  $("icMeetingDescription").textContent = activeMeeting
    ? `The IntelliCore team meeting is live${activeMeeting.expiresAt ? ` until ${new Date(activeMeeting.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}.`
    : sparkLimited
      ? "Meeting status and Google Meet creation require the trusted Cloud Functions service."
      : canManageMeetings
      ? "Start a shared Google Meet for active interns."
      : "There is no active organisation-wide meeting right now.";
  $("icStartMeetButton").hidden = !canManageMeetings || Boolean(activeMeeting);
  $("icEndMeetButton").hidden = !canManageMeetings || !activeMeeting;
}
async function refreshMeetingState() {
  if (!currentUser || !trainingWorkspace || trainingWorkspace.sparkLimited
    || trainingWorkspace.profile.localOnly || trainingWorkspace.profile.profileDraft) return;
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
  const startDate = $("icInternshipStartDate").value;
  if (!startDate) {
    $("icInternshipEndDate").value = "";
    $("icInternshipPeriodPreview").textContent = "Choose a start date to preview your internship period.";
    internshipPeriodPreview = null;
    renderAttendanceCalendar(trainingWorkspace?.attendance || []);
    return;
  }
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== startDate) {
    $("icInternshipEndDate").value = "";
    $("icInternshipPeriodPreview").textContent = "Choose a valid internship start date.";
    internshipPeriodPreview = null;
    renderAttendanceCalendar(trainingWorkspace?.attendance || []);
    return;
  }
  const end = addMonthsToDate(startDate, duration);
  $("icInternshipEndDate").value = end;
  const isActiveProfileDate = $("icInternshipStartDate").disabled;
  $("icInternshipPeriodPreview").textContent = isActiveProfileDate
    ? `Active internship period: ${startDate} through ${end}. Dates cannot be changed here.`
    : `Proposed internship period: ${startDate} through ${end}. Attendance begins only after trusted activation.`;
  selectedAttendanceMonth = startDate.slice(0, 7);
  internshipPeriodPreview = isActiveProfileDate ? null : { startDate, endDate: end };
  renderAttendanceCalendar(trainingWorkspace?.attendance || [], internshipPeriodPreview);
}
function renderUpcomingDeadlines() {
  const target = $("icUpcomingDeadlines");
  if (!trainingWorkspace) {
    target.className = "ic-activity-empty";
    target.innerHTML = "<strong>Task dates are unavailable</strong><p>Connect to your workspace to load assigned training deadlines.</p>";
    return;
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadlines = (trainingWorkspace?.assignments || [])
    .filter(record => record.dueDate && record.status !== "approved")
    .map(record => ({
      date: record.dueDate,
      title: record.task.title,
      kind: record.track,
      overdue: new Date(`${record.dueDate}T00:00:00`).getTime() < today.getTime()
    }))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.date.localeCompare(b.date));
  const overdue = deadlines.filter(item => item.overdue);
  const upcoming = overdue.concat(deadlines.filter(item => !item.overdue).slice(0, Math.max(0, 4 - overdue.length)));
  if (!upcoming.length) {
    target.className = "ic-activity-empty";
    target.innerHTML = (trainingWorkspace?.profile.localOnly || trainingWorkspace?.profile.profileDraft)
      ? "<strong>Assigned deadlines are unavailable</strong><p>Activate your secure internship profile to load mentor-assigned task dates.</p>"
      : "<strong>No upcoming deadlines</strong><p>Due dates from mentor-assigned training work will appear here.</p>";
    return;
  }
  target.className = "ic-deadline-list";
  target.innerHTML = upcoming.map(record => `<div class="ic-deadline-item${record.overdue ? " is-overdue" : ""}"><span>${record.overdue ? "Overdue · " : ""}${escapeHtml(new Date(`${record.date}T00:00:00`).toLocaleDateString())} · ${escapeHtml(record.kind)}</span><strong>${escapeHtml(record.title)}</strong></div>`).join("");
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
  renderUpcomingDeadlines();
  renderOnboardingChecklist();
  renderTraining();
}
function bindEvents() {
  const openInternshipProfile = () => {
    dialogReturnFocus = document.activeElement;
    $("icInternshipDialog").hidden = false;
    document.body.classList.add("ic-dialog-open");
    updateInternshipPeriodPreview();
    setTimeout(() => $("icInternshipName").focus(), 40);
  };
  $("icBuildProfileButton").addEventListener("click", openInternshipProfile);
  $("icProfileDetailsButton").addEventListener("click", openInternshipProfile);
  ["icCloseInternshipDialog", "icCancelInternshipEdit"].forEach(id =>
    $(id).addEventListener("click", () => {
      $("icInternshipDialog").hidden = true;
      document.body.classList.remove("ic-dialog-open");
      internshipPeriodPreview = null;
      if (trainingWorkspace) renderAttendanceCalendar(trainingWorkspace.attendance || []);
      if (dialogReturnFocus instanceof HTMLElement && dialogReturnFocus.isConnected) dialogReturnFocus.focus();
      dialogReturnFocus = null;
    })
  );
  $("icInternshipDialog").addEventListener("click", event => {
    if (event.target === $("icInternshipDialog")) $("icCancelInternshipEdit").click();
  });
  $("icInternshipDuration").addEventListener("change", updateInternshipPeriodPreview);
  $("icInternshipStartDate").addEventListener("change", updateInternshipPeriodPreview);
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
      const profileIsDraft = Boolean(previousProfile?.profileDraft || previousProfile?.localOnly);
      const durationMonths = previousProfile?.durationMonths && !profileIsDraft
        ? Number(previousProfile.durationMonths)
        : Number(data.get("durationMonths"));
      const startDate = previousProfile?.internshipStartDate && !profileIsDraft
        ? previousProfile.internshipStartDate
        : String(data.get("internshipStartDate") || "");
      const profile = {
        displayName: String(data.get("displayName") || "").trim(),
        gender: String(data.get("gender") || ""),
        phone: String(data.get("phone") || "").trim(),
        track: previousProfile?.track && !previousProfile.profileDraft && !previousProfile.localOnly
          ? previousProfile.track
          : String(data.get("track") || ""),
        durationMonths: previousProfile?.durationMonths
          && !previousProfile.profileDraft
          && !previousProfile.localOnly
          ? previousProfile.durationMonths
          : durationMonths,
        internshipStartDate: startDate,
        internshipEndDate: addMonthsToDate(startDate, durationMonths)
      };
      const activeProfile = Boolean(
        previousProfile?.internshipStartDate
        && previousProfile?.internshipEndDate
        && !profileIsDraft
      );
      const savedProfile = activeProfile
        ? await updateClientPersonalProfile(currentUser, profile)
        : await saveClientProfileDraft(currentUser, profile);
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
          ...savedProfile,
          localOnly: false,
          profileDraft: !activeProfile,
          role: "learner"
        },
        activeInternship: activeProfile,
        sparkLimited: true
      };
      selectedAttendanceMonth = savedProfile.internshipStartDate.slice(0, 7);
      renderAll();
      notice(activeProfile
        ? "Your personal profile details were saved. Internship dates and enrollment remain unchanged."
        : "Your profile draft was saved securely. Internship activation and attendance require trusted backend processing, which is not available on the Spark plan.");
    } catch (error) {
      console.error("The secure internship profile could not be saved.", error);
      const code = typeof error?.code === "string" ? error.code : "";
      const message = typeof error?.message === "string" && error.message
        ? error.message
        : "Unknown Firebase error.";
      formError.textContent = `Could not save your internship profile${code ? ` (${code})` : ""}: ${message}`;
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
  const openDrawer = () => {
    drawer?.classList.add("active");
    overlay?.classList.add("active");
    hamburger?.classList.add("open");
    hamburger?.setAttribute("aria-expanded", "true");
    drawer?.setAttribute("aria-hidden", "false");
    drawer?.removeAttribute("inert");
    overlay?.setAttribute("aria-hidden", "false");
    $("closeDrawerBtn")?.focus({ preventScroll: true });
  };
  const workspaceNavLinks = [...document.querySelectorAll(
    ".ic-workspace-nav a[href^='#'], .mobile-nav-list a[href^='#']"
  )];
  const updateWorkspaceNav = (activeHash = window.location.hash || "#workspaceHome") => {
    workspaceNavLinks.forEach(link => {
      const active = link.hash === activeHash;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
  };
  workspaceNavLinks.forEach(link => link.addEventListener("click", () => {
    updateWorkspaceNav(link.hash);
    closeDrawer();
  }));
  window.addEventListener("hashchange", () => updateWorkspaceNav());
  updateWorkspaceNav();
  $("closeDrawerBtn")?.addEventListener("click", () => closeDrawer(true));
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!$("icInternshipDialog").hidden) $("icCancelInternshipEdit").click();
    closeDrawer(true);
  });
  $("icTaskSearch").addEventListener("input", renderTraining);
  $("icAttendanceMonthFilter").addEventListener("change", event => {
    selectedAttendanceMonth = event.currentTarget.value;
    renderAttendanceCalendar(trainingWorkspace?.attendance || []);
  });
  document.querySelectorAll("[data-task-filter]").forEach(button => button.addEventListener("click", () => {
    activeTaskFilter = button.dataset.taskFilter;
    document.querySelectorAll("[data-task-filter]").forEach(filterButton => {
      const active = filterButton === button;
      filterButton.classList.toggle("active", active);
      filterButton.setAttribute("aria-pressed", String(active));
    });
    renderTraining();
  }));
  document.querySelectorAll("[data-workspace-view]").forEach(button => button.addEventListener("click", () => {
    const target = button.dataset.workspaceView === "attendance"
      ? !$("icAttendancePanel").hidden
        ? $("icAttendancePanel")
        : !$("icProfile").hidden
          ? $("icProfile")
          : !$("icAttendanceReportWrap").hidden
            ? $("icAttendanceReportWrap")
            : !$("icInternDirectoryWrap").hidden
              ? $("icInternDirectoryWrap")
              : $("icStaffPanel")
      : $("icTrainingSection");
    target.scrollIntoView({behavior:"smooth",block:"start"});
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
    if (drawer?.classList.contains("active")) closeDrawer(true);
    else openDrawer();
  });
  overlay?.addEventListener("click", () => closeDrawer(true));
  drawer?.querySelectorAll(".mobile-nav-list a:not([href^='#'])").forEach(link =>
    link.addEventListener("click", () => closeDrawer())
  );
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
      window.location.replace(`index.html?auth=login${useFirebaseEmulators ? "&firebaseEmulator=1" : ""}`);
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
  if (["founder", "co_founder"].includes(authenticatedRole)) {
    window.location.replace("founder-dashboard.html");
    return;
  }
  if (["admin", "hr_manager", "hr_executive", "operations_executive"].includes(authenticatedRole)
    && new URLSearchParams(window.location.search).get("workspace") !== "operations") {
    window.location.replace("hr-dashboard.html");
    return;
  }
  if (authenticatedRole === "mentor"
    && new URLSearchParams(window.location.search).get("workspace") !== "operations") {
    window.location.replace("tl-dashboard.html");
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
  try {
    await ensureClientProfile(user);
    if (auth.currentUser?.uid !== user.uid) return;
    await currentUser.reload();
  } catch (error) {
    profileSetupError = error;
    console.error("The secured account profile could not be initialised.", error);
  }
  if (auth.currentUser?.uid !== user.uid) return;
  if (auth.currentUser?.uid !== user.uid) return;
  renderProfile(auth.currentUser, trainingWorkspace?.profile || null);
  void connectWorkspace(user, profileSetupError);
});
