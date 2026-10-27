import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  connectAuthEmulator, getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  collection, collectionGroup, connectFirestoreEmulator, doc, getDoc, getDocs, initializeFirestore,
  limit, orderBy, query, runTransaction, serverTimestamp, setDoc, startAfter, where
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
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
const storage = getStorage(app);
if (useFirebaseEmulators) connectStorageEmulator(storage, "127.0.0.1", 9199);
const $ = id => document.getElementById(id);
const sparkStaffRolesByEmail = new Map([
  ["thesumitsah47@gmail.com", "admin"],
  ["tanu65159@gmail.com", "operations_executive"],
  ["mikkurwt694@gmail.com", "hr_executive"],
  ["ashitarohilla32@gmail.com", "hr_manager"]
]);
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
let certificateRequest = null;

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
    if (profile.accountStatus === "deactivated") throw new Error("Your account access is deactivated. Contact IntelliCore HR.");
    await setDoc(ref, { lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
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
  await setDoc(ref, { lastLoginAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
  return { ...profile, lastLoginAt: null };
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
    phone: values.phone,
    updatedAt: serverTimestamp()
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
      notice("Your profile draft is saved. Wait for HR or Founder to activate it.");
    } else {
      notice(`Your secure profile or workspace could not be loaded. ${trainingResult.reason?.message || "Check your Firestore rules and connection."}`, true);
    }
  } else {
    notice("Your profile, training tasks and attendance are connected to Firebase.");
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
        notice(`Your dashboard is ready, but today's attendance was not recorded. ${error.message || "Retry the check-in."}`, true);
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
  const today = indiaDateString();
  if (isSundayInIndia(today)) return { alreadyCheckedIn: false, skippedSunday: true, attendanceDate: today };
  const attendanceRef = doc(db, "internships", user.uid, "attendance", today);
  const profileRef = doc(db, "profiles", user.uid);
  const result = await runTransaction(db, async transaction => {
    const [profileSnapshot, attendanceSnapshot] = await Promise.all([
      transaction.get(profileRef), transaction.get(attendanceRef)
    ]);
    if (!profileSnapshot.exists()) throw new Error("Build your internship profile before checking in.");
    const profile = profileSnapshot.data();
    if (profile.accountStatus === "deactivated") throw new Error("Your account access is deactivated.");
    if (profile.role !== "learner" || profile.internshipStatus !== "active"
      || !profile.track || !profile.durationMonths
      || !profile.internshipStartDate || !profile.internshipEndDate) {
      throw new Error("Attendance starts after HR activates your internship profile.");
    }
    if (today < profile.internshipStartDate || today > profile.internshipEndDate) {
      throw new Error("Attendance is available only within your internship dates.");
    }
    if (attendanceSnapshot.exists()) return { alreadyCheckedIn: true, attendanceDate: today };
    transaction.set(attendanceRef, {
      uid: user.uid,
      attendanceDate: today,
      track: profile.track,
      durationMonths: profile.durationMonths,
      internshipStartDate: profile.internshipStartDate,
      internshipEndDate: profile.internshipEndDate,
      checkedInAt: serverTimestamp()
    });
    return { alreadyCheckedIn: false, attendanceDate: today };
  });
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
    : "Enter your details, choose your domain and duration, and select a start date. HR or Founder will activate your saved draft.";
  $("icInternshipPeriodPreview").textContent = profile.profileDraft
    ? `Profile draft saved to Firebase. Proposed period: ${profile.internshipStartDate} through ${profile.internshipEndDate}.`
    : hasInternshipProfile
    ? `Active from ${profile.internshipStartDate} through ${profile.internshipEndDate}. Contact HR if your domain or duration needs to change.`
    : "Your selected dates are a proposed internship period. Attendance starts only after trusted activation.";
  $("icBuildProfileButton").textContent = hasRequiredProfile ? "Edit profile" : "Build your profile";

  const internshipActive = Boolean(activeInternship);
  $("icAttendanceSummary").textContent = hasInternshipProfile
    ? trainingWorkspace.sparkLimited
      ? `Attendance check-in is enabled for this internship. ${profile.track} · ${profile.durationMonths} month${profile.durationMonths === 1 ? "" : "s"} · ${profile.internshipStartDate} to ${profile.internshipEndDate}`
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
    || !internshipActive || isCheckedIn || isSunday;
  $("icCheckInButton").textContent = profile.profileDraft
    ? "Activation required"
    : profile.localOnly
      ? "Sync required"
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
  $("icAttendanceMessage").textContent = profile.profileDraft
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
    ? "Your profile and selected dates are saved. HR or Founder activation will unlock training and attendance."
    : profile.localOnly
      ? "Profile saved on this device. Secure training data is not synced."
    : role === "learner"
    ? profile.track
      ? `Your ${profile.track} training assignments and progress.`
      : "Complete your profile to activate your internship and see assignments here."
    : `Signed in with ${role} access for your authorised training tracks.`;

  if (profile.profileDraft) {
    tasksElement.innerHTML = '<div class="ic-activity-empty"><strong>Profile draft saved</strong><p>HR or Founder must activate your internship before assigned training and attendance begin.</p></div>';
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
      const canSubmit = role === "learner"
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
  const user = currentUser || auth.currentUser;
  if (!user) throw new Error("Sign in to load your private workspace.");
  const role = authenticatedRole || "learner";
  const profileSnapshot = await getDoc(doc(db, "profiles", user.uid));
  if (!profileSnapshot.exists()) throw new Error("Your workspace profile is not available. Refresh and retry.");
  const storedProfile = profileSnapshot.data();
  if (storedProfile.accountStatus === "deactivated") throw new Error("Your account access is deactivated. Contact IntelliCore HR.");
  const profile = { ...storedProfile, uid: user.uid, email: user.email || "", role };
  const taskById = window.IntelliCoreCurriculum?.taskById;
  const toAssignment = document => {
    const data = document.data();
    const task = taskById?.get(data.taskId);
    return {
      id: document.id,
      ...data,
      assignedAt: data.assignedAt?.toMillis?.() || null,
      updatedAt: data.updatedAt?.toMillis?.() || null,
      submittedAt: data.submittedAt?.toMillis?.() || null,
      reviewedAt: data.reviewedAt?.toMillis?.() || null,
      task: task || {
        title: data.taskTitle || String(data.taskId || "Assigned task").replaceAll("-", " "),
        track: data.track || profile.track || "",
        instructions: "Task details are unavailable in the approved curriculum.",
        deliverable: "Follow the instructions shared by your mentor.",
        rubric: []
      }
    };
  };
  const [personalAssignmentSnapshot, attendanceSnapshot, meetingSnapshot] = await Promise.all([
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
    )),
    getDoc(doc(db, "organization", "currentMeeting"))
  ]);
  let profileView = profile;
  if (role === "learner" && !internshipProfileComplete(profile)) {
    const draft = await loadFirebaseProfileDraft(user);
    if (draft) profileView = draft.profile;
  }
  const today = indiaDateString();
  const assignments = personalAssignmentSnapshot.docs.map(toAssignment);
  const attendance = attendanceSnapshot.docs.map(document => ({
    attendanceDate: document.get("attendanceDate"),
    checkedInAt: document.get("checkedInAt")?.toMillis?.() || null
  }));
  const meetingData = meetingSnapshot.exists() ? meetingSnapshot.data() : null;
  const activeMeeting = meetingData?.status === "active"
    && meetingData.expiresAt?.toMillis?.() > Date.now()
    ? {
      title: meetingData.title,
      meetUrl: meetingData.meetUrl,
      startedAt: meetingData.startedAt?.toMillis?.() || null,
      expiresAt: meetingData.expiresAt.toMillis()
    }
    : null;
  const contentTracks = role === "mentor"
    ? [...new Set(profile.mentorTracks || [])]
    : profileView.track ? [profileView.track] : [];
  const contentRoles = ["founder", "co_founder", "admin", "hr_manager", "hr_executive", "operations_executive"];
  const readAllContent = contentRoles.includes(role);
  const [announcementSnapshots, resourceSnapshots, certificateSnapshot] = await Promise.all([
    Promise.all([
      getDocs(query(collection(db, "announcements"), where("audienceTrack", "==", "all"), orderBy("createdAt", "desc"), limit(20))),
      ...(readAllContent ? [] : contentTracks.map(track => getDocs(query(
        collection(db, "announcements"), where("audienceTrack", "==", track),
        orderBy("createdAt", "desc"), limit(20)
      ))))
    ]),
    Promise.all([
      getDocs(query(collection(db, "learningResources"), where("track", "==", "all"), orderBy("createdAt", "desc"), limit(20))),
      ...(readAllContent ? [] : contentTracks.map(track => getDocs(query(
        collection(db, "learningResources"), where("track", "==", track),
        orderBy("createdAt", "desc"), limit(20)
      ))))
    ]),
    getDoc(doc(db, "certificateRequests", user.uid))
  ]);
  if (readAllContent) {
    announcementSnapshots[0] = await getDocs(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(40)));
    resourceSnapshots[0] = await getDocs(query(collection(db, "learningResources"), orderBy("createdAt", "desc"), limit(40)));
  }
  const recentDocuments = snapshots => [...new Map(snapshots.flatMap(snapshot => snapshot.docs)
    .map(document => [document.id, document])).values()]
    .sort((a, b) => (b.get("createdAt")?.toMillis?.() || 0) - (a.get("createdAt")?.toMillis?.() || 0));
  certificateRequest = certificateSnapshot.exists() ? certificateSnapshot.data() : null;
  const availableTracks = ["founder", "co_founder", "admin", "hr_manager"].includes(role)
    ? tracksForDashboard
    : role === "mentor" ? profile.mentorTracks || [] : [];
  const catalog = (window.IntelliCoreCurriculum?.tracks || {});
  const taskCatalog = availableTracks.flatMap(track =>
    (catalog[track] || []).map(task => ({ ...task, track }))
  );
  let reviewQueue = [];
  if (availableTracks.length) {
    const queues = await Promise.all(availableTracks.map(track => getDocs(query(
      collection(db, "trainingAssignments"),
      where("track", "==", track),
      where("status", "==", "submitted"),
      limit(100)
    ))));
    reviewQueue = queues.flatMap(snapshot => snapshot.docs.map(toAssignment))
      .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
  }
  let internDirectory = [];
  let internDirectoryHasMore = false;
  let internDirectoryNextCursor = null;
  const canViewProfiles = ["founder", "co_founder", "admin", "hr_manager", "hr_executive", "operations_executive"].includes(role);
  if (canViewProfiles) {
    const directory = await getDocs(query(
      collection(db, "profiles"),
      where("role", "==", "learner"),
      orderBy("displayName"),
      limit(101)
    ));
    internDirectoryHasMore = directory.size > 100;
    const rows = directory.docs.slice(0, 100);
    internDirectoryNextCursor = internDirectoryHasMore ? rows.at(-1)?.id || null : null;
    internDirectory = rows.map(document => {
      const intern = document.data();
      const lastLoginAt = intern.lastLoginAt?.toMillis?.() || null;
      const enrolled = Boolean(intern.track && intern.internshipStartDate && intern.internshipEndDate
        && intern.internshipStatus === "active");
      return {
        uid: document.id,
        email: intern.email || "",
        displayName: intern.displayName || "",
        phone: intern.phone || "",
        track: intern.track || "",
        durationMonths: intern.durationMonths || null,
        internshipStartDate: intern.internshipStartDate || null,
        internshipEndDate: intern.internshipEndDate || null,
        lastLoginAt,
        accountStatus: intern.accountStatus || "active",
        enrolled,
        inactive: enrolled && Boolean(lastLoginAt && lastLoginAt < Date.now() - 7 * 24 * 60 * 60 * 1000)
      };
    });
  }
  let attendanceReport = [];
  const canViewAttendance = ["founder", "co_founder", "admin", "hr_manager", "operations_executive"].includes(role);
  if (canViewAttendance) {
    const report = await getDocs(query(
      collectionGroup(db, "attendance"),
      orderBy("attendanceDate", "desc"),
      limit(500)
    ));
    const profileByUid = new Map(internDirectory.map(intern => [intern.uid, intern]));
    attendanceReport = report.docs.map(document => {
      const uid = document.ref.parent.parent?.id || "";
      const intern = profileByUid.get(uid) || {};
      return {
        uid,
        attendanceDate: document.get("attendanceDate") || document.id,
        checkedInAt: document.get("checkedInAt")?.toMillis?.() || null,
        email: intern.email || "",
        displayName: intern.displayName || "",
        track: intern.track || ""
      };
    });
  }
  trainingWorkspace = {
    profile: profileView,
    assignments,
    catalog: taskCatalog,
    reviewQueue,
    attendance,
    activeInternship: Boolean(
      profile.internshipStatus === "active"
      && profile.internshipStartDate
      && profile.internshipEndDate
      && today >= profile.internshipStartDate
      && today <= profile.internshipEndDate
    ),
    activeMeeting,
    announcements: recentDocuments(announcementSnapshots).slice(0, 20).map(document => ({ id: document.id, ...document.data() })),
    resources: recentDocuments(resourceSnapshots).slice(0, 20).map(document => ({ id: document.id, ...document.data() })),
    internDirectory,
    internDirectoryHasMore,
    internDirectoryNextCursor,
    attendanceReport,
    sparkLimited: false
  };
  renderTraining();
  renderAdditionalWorkspace();
}

function renderAdditionalWorkspace() {
  const announcements = trainingWorkspace?.announcements || [];
  const resources = trainingWorkspace?.resources || [];
  $("icAnnouncementsList").innerHTML = announcements.length
    ? announcements.map(item => `<article><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p><small>${escapeHtml(item.audienceTrack === "all" ? "All interns" : item.audienceTrack || "Internship update")}</small></article>`).join("")
    : "<strong>No announcements yet</strong><p>There are no announcements for your internship track.</p>";
  $("icLearningResourcesList").innerHTML = resources.length
    ? resources.map(item => `<article><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description || "")}</p><a href="${httpsHref(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.type || "Open resource")} ↗</a></article>`).join("")
    : "<strong>No learning resources yet</strong><p>When resources are assigned to your track, they will appear here.</p>";
  const projects = trainingWorkspace?.assignments || [];
  $("icProjectsList").innerHTML = projects.length
    ? projects.map(item => `<article><strong>${escapeHtml(item.task.title)}</strong><p>${escapeHtml(item.track)} · ${escapeHtml(item.status.replaceAll("_", " "))}${item.dueDate ? ` · Due ${escapeHtml(item.dueDate)}` : ""}</p><a href="#icTrainingSection">Open assigned work ↗</a></article>`).join("")
    : "<strong>No projects yet</strong><p>New mentor assignments will appear here.</p>";
  const status = certificateRequest?.status || "Not requested";
  $("icCertificateStatus").textContent = status.replaceAll("_", " ").replace(/^./, char => char.toUpperCase());
  $("icCertificateDetail").textContent = certificateRequest?.feedback
    || (certificateRequest ? "HR has received your request." : "Request HR review after your internship ends");
  const profile = trainingWorkspace?.profile;
  const today = indiaDateString();
  $("icCertificateEligibility").disabled = Boolean(certificateRequest)
    || !profile || profile.role !== "learner" || !profile.internshipEndDate
    || profile.internshipEndDate > today || profile.internshipStatus !== "active";
  $("icCertificateEligibility").setAttribute("aria-label", certificateRequest
    ? `Certificate request ${status}`
    : "Request certificate review after your internship ends");
}

async function requestCertificateReview() {
  const profile = trainingWorkspace?.profile;
  if (!currentUser || !profile || profile.role !== "learner") throw new Error("Only intern accounts can request certificate review.");
  if (!profile.internshipEndDate || profile.internshipEndDate > indiaDateString()) {
    throw new Error("Certificate review is available after your internship end date.");
  }
  const requestRef = doc(db, "certificateRequests", currentUser.uid);
  await setDoc(requestRef, {
    uid: currentUser.uid,
    email: currentUser.email || "",
    displayName: profile.displayName || currentUser.displayName || "Intern",
    track: profile.track || "",
    status: "requested",
    requestedAt: serverTimestamp()
  });
  certificateRequest = (await getDoc(requestRef)).data();
  renderAdditionalWorkspace();
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
  $("icMeetingStatus").textContent = activeMeeting
    ? "Meeting is live"
    : "No active meeting";
  $("icMeetingDescription").textContent = activeMeeting
    ? `The IntelliCore team meeting is live${activeMeeting.expiresAt ? ` until ${new Date(activeMeeting.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}.`
    : canManageMeetings
      ? "Start a shared Google Meet for active interns."
      : "There is no active organisation-wide meeting right now.";
  $("icStartMeetButton").hidden = !canManageMeetings || Boolean(activeMeeting);
  $("icEndMeetButton").hidden = !canManageMeetings || !activeMeeting;
}
async function refreshMeetingState() {
  if (!currentUser || !trainingWorkspace
    || trainingWorkspace.profile.localOnly || trainingWorkspace.profile.profileDraft) return;
  try {
    const snapshot = await getDoc(doc(db, "organization", "currentMeeting"));
    if (auth.currentUser?.uid !== currentUser.uid || !trainingWorkspace) return;
    const meeting = snapshot.exists() ? snapshot.data() : null;
    trainingWorkspace.activeMeeting = meeting?.status === "active"
      && meeting.expiresAt?.toMillis?.() > Date.now()
      ? {
        title: meeting.title,
        meetUrl: meeting.meetUrl,
        startedAt: meeting.startedAt?.toMillis?.() || null,
        expiresAt: meeting.expiresAt.toMillis()
      }
      : null;
    const profile = trainingWorkspace.profile;
    const hasInternshipProfile = Boolean(
      profile.track && profile.durationMonths && profile.internshipStartDate && profile.internshipEndDate
    );
    renderMeetingPanel(trainingWorkspace.activeMeeting, profile.role || "learner", hasInternshipProfile);
  } catch (error) {
    console.error("The shared meeting status could not be refreshed.", error);
  }
}

async function assignTrainingTask({ email, taskId, dueDate = "" }) {
  const task = window.IntelliCoreCurriculum?.taskById.get(taskId);
  if (!task) throw new Error("Choose a task from the approved training curriculum.");
  const learnerEmail = String(email || "").trim().toLowerCase();
  const candidates = await getDocs(query(
    collection(db, "profiles"),
    where("email", "==", learnerEmail),
    where("role", "==", "learner"),
    limit(2)
  ));
  if (!candidates.size) throw new Error("No intern profile was found for that email.");
  if (candidates.size > 1) throw new Error("More than one profile uses that email. Contact an administrator.");
  const targetRef = candidates.docs[0].ref;
  const targetUid = targetRef.id;
  const existing = await getDocs(query(
    collection(db, "trainingAssignments"),
    where("assignedToUid", "==", targetUid),
    where("taskId", "==", taskId),
    limit(1)
  ));
  if (!existing.empty) throw new Error("This task has already been assigned to that intern.");
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error("Choose a valid due date.");
  const assignmentRef = doc(db, "trainingAssignments", `${targetUid}__${taskId}`);
  await runTransaction(db, async transaction => {
    const [target, assignment] = await Promise.all([
      transaction.get(targetRef), transaction.get(assignmentRef)
    ]);
    if (!target.exists() || target.get("role") !== "learner") throw new Error("The selected account is not an intern.");
    const profile = target.data();
    if (profile.accountStatus === "deactivated" || profile.internshipStatus !== "active") {
      throw new Error("Only active intern profiles can receive training tasks.");
    }
    if (profile.track !== task.track) throw new Error("The task must match the intern's activated domain.");
    if (authenticatedRole === "mentor" && !(profile.mentorTracks || []).includes(task.track)) {
      throw new Error("Your Team Leader account is not authorised for this domain.");
    }
    if (assignment.exists()) throw new Error("This task has already been assigned to that intern.");
    transaction.set(assignmentRef, {
      assignedToUid: targetUid,
      learnerEmail,
      track: task.track,
      taskId,
      status: "assigned",
      dueDate: dueDate || null,
      assignedByUid: auth.currentUser.uid,
      assignedByRole: authenticatedRole,
      assignedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      submissionCount: 0,
      latestSubmissionText: "",
      latestSubmissionUrl: "",
      latestSubmissionId: "",
      latestReviewId: "",
      feedback: ""
    });
  });
}

async function submitTrainingTask(assignmentId, { text = "", url = "" }) {
  const notes = String(text).trim();
  const deliverableUrl = String(url).trim();
  if (notes.length > 20000 || deliverableUrl.length > 2048) throw new Error("Submission is too long.");
  if (!notes && !deliverableUrl) throw new Error("Add notes or a deliverable link before submitting.");
  if (deliverableUrl && !httpsHref(deliverableUrl)) throw new Error("Deliverable links must use HTTPS.");
  const assignmentRef = doc(db, "trainingAssignments", assignmentId);
  const submissionRef = doc(collection(db, "trainingAssignments", assignmentId, "submissions"));
  await runTransaction(db, async transaction => {
    const assignment = await transaction.get(assignmentRef);
    if (!assignment.exists() || assignment.get("assignedToUid") !== auth.currentUser.uid) {
      throw new Error("This assignment is not available in your account.");
    }
    if (!["assigned", "changes_requested"].includes(assignment.get("status"))) {
      throw new Error("This task cannot be submitted in its current review state.");
    }
    const attempt = Number(assignment.get("submissionCount") || 0) + 1;
    transaction.set(submissionRef, {
      assignmentId,
      userId: auth.currentUser.uid,
      track: assignment.get("track"),
      attempt,
      text: notes,
      url: deliverableUrl,
      submittedAt: serverTimestamp()
    });
    transaction.update(assignmentRef, {
      status: "submitted",
      submissionCount: attempt,
      latestSubmissionText: notes,
      latestSubmissionUrl: deliverableUrl,
      latestSubmissionId: submissionRef.id,
      submittedAt: serverTimestamp(),
      feedback: "",
      updatedAt: serverTimestamp()
    });
  });
}

async function reviewTrainingTask(assignmentId, decision, feedback) {
  const reviewFeedback = String(feedback || "").trim();
  if (!["approved", "changes_requested"].includes(decision)) throw new Error("Choose approve or request changes.");
  if (!reviewFeedback || reviewFeedback.length > 4000) throw new Error("Add feedback of up to 4,000 characters.");
  const assignmentRef = doc(db, "trainingAssignments", assignmentId);
  const reviewRef = doc(collection(db, "trainingAssignments", assignmentId, "reviews"));
  await runTransaction(db, async transaction => {
    const assignment = await transaction.get(assignmentRef);
    if (!assignment.exists()) throw new Error("The assignment was not found.");
    if (assignment.get("status") !== "submitted") throw new Error("Only submitted work can be reviewed.");
    const track = assignment.get("track");
    if (authenticatedRole === "mentor" && !(trainingWorkspace.profile.mentorTracks || []).includes(track)) {
      throw new Error("Your Team Leader account is not authorised for this domain.");
    }
    transaction.set(reviewRef, {
      assignmentId,
      reviewerUid: auth.currentUser.uid,
      decision,
      feedback: reviewFeedback,
      reviewedAt: serverTimestamp()
    });
    transaction.update(assignmentRef, {
      status: decision,
      feedback: reviewFeedback,
      reviewedByUid: auth.currentUser.uid,
      reviewedAt: serverTimestamp(),
      latestReviewId: reviewRef.id,
      updatedAt: serverTimestamp()
    });
  });
}

async function changeInternAccountStatus(uid, status) {
  if (!["active", "deactivated"].includes(status)) throw new Error("Choose a valid account status.");
  const profileRef = doc(db, "profiles", uid);
  await runTransaction(db, async transaction => {
    const profileSnapshot = await transaction.get(profileRef);
    if (!profileSnapshot.exists() || profileSnapshot.get("role") !== "learner") {
      throw new Error("The intern profile was not found.");
    }
    const profile = profileSnapshot.data();
    if (profile.internshipStatus !== "active" || !profile.internshipStartDate || !profile.internshipEndDate) {
      throw new Error("Only an active internship profile can have access changed.");
    }
    if (status === "deactivated") {
      const lastLogin = profile.lastLoginAt?.toMillis?.() || 0;
      if (!lastLogin || Date.now() - lastLogin < 7 * 24 * 60 * 60 * 1000) {
        throw new Error("Access can be deactivated after 7 days without an intern login.");
      }
      transaction.update(profileRef, {
        accountStatus: "deactivated",
        deactivatedAt: serverTimestamp(),
        deactivatedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp()
      });
    } else {
      transaction.update(profileRef, {
        accountStatus: "active",
        reactivatedAt: serverTimestamp(),
        reactivatedBy: auth.currentUser.uid,
        updatedAt: serverTimestamp()
      });
    }
  });
}

async function startSharedMeeting() {
  const meetingWindow = window.open("https://meet.google.com/new", "_blank", "noopener,noreferrer");
  const pastedUrl = window.prompt("Google Meet khulne ke baad uska link yahan paste karein:");
  if (!pastedUrl) { meetingWindow?.close(); return null; }
  let meetUrl;
  try {
    const parsed = new URL(pastedUrl.trim());
    if (parsed.protocol !== "https:" || parsed.hostname !== "meet.google.com"
      || !/^\/[a-z]{3}-[a-z]{4}-[a-z]{3}\/?$/i.test(parsed.pathname)) {
      throw new Error();
    }
    meetUrl = parsed.href;
  } catch {
    meetingWindow?.close();
    throw new Error("Paste a valid https://meet.google.com/xxx-xxxx-xxx link.");
  }
  const meetingRef = doc(db, "organization", "currentMeeting");
  const expiresAt = new Date(Date.now() + 119 * 60 * 1000);
  await runTransaction(db, async transaction => {
    const current = await transaction.get(meetingRef);
    if (current.exists() && current.get("status") === "active"
      && current.get("expiresAt")?.toMillis?.() > Date.now()) {
      throw new Error("A team meeting is already active.");
    }
    transaction.set(meetingRef, {
      title: "IntelliCore Intern Team Meeting",
      status: "active",
      meetUrl,
      eventId: "",
      startedByUid: auth.currentUser.uid,
      startedAt: serverTimestamp(),
      expiresAt
    });
  });
  if (meetingWindow) meetingWindow.location.href = meetUrl;
  return { title: "IntelliCore Intern Team Meeting", meetUrl, expiresAt: expiresAt.getTime() };
}

async function endSharedMeeting() {
  const meetingRef = doc(db, "organization", "currentMeeting");
  await runTransaction(db, async transaction => {
    const meeting = await transaction.get(meetingRef);
    if (!meeting.exists() || meeting.get("status") !== "active") throw new Error("There is no active team meeting to end.");
    transaction.update(meetingRef, {
      status: "ended",
      endedByUid: auth.currentUser.uid,
      endedAt: serverTimestamp()
    });
  });
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
  $("icCertificateEligibility").addEventListener("click", async event => {
    const button = event.currentTarget;
    if (button.disabled) return;
    button.disabled = true;
    try {
      await requestCertificateReview();
      notice("Your certificate request has been sent to HR for review.");
    } catch (error) {
      notice(error.message || "Could not request certificate review.");
      button.disabled = false;
    }
  });
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
  $("icInternshipStartDate").addEventListener("click", event => {
    const input = event.currentTarget;
    if (!input.disabled && typeof input.showPicker === "function") {
      try { input.showPicker(); } catch (error) { /* The browser's native picker may already be open. */ }
    }
  });
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
        sparkLimited: false
      };
      selectedAttendanceMonth = savedProfile.internshipStartDate.slice(0, 7);
      renderAll();
      notice(activeProfile
        ? "Your personal profile details were saved. Internship dates and enrollment remain unchanged."
        : "Your profile draft was saved securely. HR or the Founder can activate the internship from the Pending Activations page.");
    } catch (error) {
      console.error("The secure internship profile could not be saved.", error);
      const code = typeof error?.code === "string" ? error.code : "";
      const message = typeof error?.message === "string" && error.message
        ? error.message
        : "Unknown Firebase error.";
      const userMessage = /(?:learner|intern) profile is not ready/i.test(message)
        ? "This response came from an older internship-save service. Reload the latest dashboard files; on Spark, profile setup saves a private draft and requires the updated Firestore rules."
        : message;
      formError.textContent = `Could not save your internship profile${code ? ` (${code})` : ""}: ${userMessage}`;
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
      const result = await recordAttendanceForLogin(currentUser || auth.currentUser);
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
      const email = String(data.get("email") || "").trim().toLowerCase();
      const track = String(data.get("track") || "");
      const durationMonths = Number(data.get("durationMonths"));
      const phone = String(data.get("phone") || "").trim();
      if (!tracksForDashboard.includes(track) || ![1, 2, 3, 6].includes(durationMonths)) {
        throw new Error("Choose a supported domain and duration.");
      }
      const results = await getDocs(query(
        collection(db, "profiles"),
        where("email", "==", email),
        where("role", "==", "learner"),
        limit(2)
      ));
      if (!results.size) throw new Error("No intern profile was found for that email.");
      if (results.size > 1) throw new Error("More than one profile uses that email.");
      const profileRef = results.docs[0].ref;
      await runTransaction(db, async transaction => {
        const profileSnapshot = await transaction.get(profileRef);
        if (!profileSnapshot.exists() || profileSnapshot.get("role") !== "learner") {
          throw new Error("The selected account is not an intern.");
        }
        const profile = profileSnapshot.data();
        if (profile.internshipStatus !== "active" || profile.accountStatus === "deactivated") {
          throw new Error("Activate the intern profile before changing its domain or duration.");
        }
        if (profile.track !== track) {
          const existingAssignments = await getDocs(query(
            collection(db, "trainingAssignments"),
            where("assignedToUid", "==", profileRef.id),
            limit(1)
          ));
          if (!existingAssignments.empty) {
            throw new Error("Resolve the intern's training tasks before changing their domain.");
          }
        }
        const startDate = profile.internshipStartDate || indiaDateString();
        transaction.update(profileRef, {
          track,
          durationMonths,
          internshipStartDate: startDate,
          internshipEndDate: addMonthsToDate(startDate, durationMonths),
          ...(phone ? { phone } : {}),
          profileUpdatedBy: auth.currentUser.uid,
          updatedAt: serverTimestamp()
        });
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
    button.disabled = true;
    button.textContent = "Starting meeting…";
    try {
      const meeting = await startSharedMeeting();
      if (!meeting) return;
      trainingWorkspace.activeMeeting = meeting;
      renderMeetingPanel(meeting, trainingWorkspace.profile.role || "learner", Boolean(
        trainingWorkspace.profile.track
        && trainingWorkspace.profile.durationMonths
        && trainingWorkspace.profile.internshipStartDate
        && trainingWorkspace.profile.internshipEndDate
      ));
      notice("Google Meet is live and visible to active interns.");
      void refreshTrainingWorkspace().catch(error =>
        console.error("The dashboard could not refresh after starting the meeting.", error)
      );
    } catch (error) {
      console.error("The team meeting could not be started.", error);
      notice(error.message || "Could not start the Google Meet.");
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
      await endSharedMeeting();
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
        const cursorSnapshot = await getDoc(doc(db, "profiles", moreButton.dataset.cursor));
        if (!cursorSnapshot.exists()) throw new Error("The directory changed. Refresh to continue.");
        const page = await getDocs(query(
          collection(db, "profiles"),
          where("role", "==", "learner"),
          orderBy("displayName"),
          startAfter(cursorSnapshot),
          limit(101)
        ));
        const rows = page.docs.slice(0, 100).map(document => {
          const intern = document.data();
          const lastLoginAt = intern.lastLoginAt?.toMillis?.() || null;
          const enrolled = Boolean(intern.track && intern.internshipStartDate && intern.internshipEndDate
            && intern.internshipStatus === "active");
          return {
            uid: document.id, email: intern.email || "", displayName: intern.displayName || "",
            phone: intern.phone || "", track: intern.track || "", durationMonths: intern.durationMonths || null,
            internshipStartDate: intern.internshipStartDate || null, internshipEndDate: intern.internshipEndDate || null,
            lastLoginAt, accountStatus: intern.accountStatus || "active", enrolled,
            inactive: enrolled && Boolean(lastLoginAt && lastLoginAt < Date.now() - 7 * 24 * 60 * 60 * 1000)
          };
        });
        trainingWorkspace.internDirectory.push(...rows);
        trainingWorkspace.internDirectoryHasMore = page.size > 100;
        trainingWorkspace.internDirectoryNextCursor = page.size > 100 ? rows.at(-1)?.uid || null : null;
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
      await changeInternAccountStatus(uid, status);
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
      await assignTrainingTask({
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
      await submitTrainingTask(form.dataset.trainingSubmit, {
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
      await reviewTrainingTask(form.dataset.reviewForm, decision, data.get("feedback"));
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
  const accountEmail = user.email?.trim().toLowerCase() || "";
  try {
    await user.reload();
    const latestUser = auth.currentUser;
    if (!latestUser || latestUser.uid !== user.uid) return;
    const token = await latestUser.getIdTokenResult(true);
    const signInProvider = token.claims.firebase?.sign_in_provider;
    const tokenRole = token.claims.role;
    const profileSnapshot = await getDoc(doc(db, "profiles", latestUser.uid));
    const accountProfile = profileSnapshot.exists() ? profileSnapshot.data() : null;
    const validTokenRole = [
      "founder", "co_founder", "admin", "hr_manager", "hr_executive",
      "operations_executive", "mentor", "learner"
    ].includes(tokenRole) ? tokenRole : "";
    if (accountProfile?.accountStatus === "deactivated") {
      loginRedirectStarted = true;
      await signOut(auth);
      window.location.replace("index.html?auth=login&deactivated=1");
      return;
    }
    authenticatedRole = accountEmail === "ctrlabhishek@gmail.com"
      ? "founder"
      : sparkStaffRolesByEmail.get(accountEmail)
        || accountProfile?.role
        || (validTokenRole && validTokenRole !== "learner" ? validTokenRole : validTokenRole || "learner");
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
  const operationsWorkspace = new URLSearchParams(window.location.search).get("workspace") === "operations";
  if (["founder", "co_founder"].includes(authenticatedRole) && !operationsWorkspace) {
    window.location.replace("founder-dashboard.html");
    return;
  }
  if (sparkStaffRolesByEmail.has(accountEmail) && !operationsWorkspace) {
    window.location.replace("hr-dashboard.html");
    return;
  }
  if (["admin", "hr_manager", "hr_executive", "operations_executive"].includes(authenticatedRole)
    && !operationsWorkspace) {
    window.location.replace("hr-dashboard.html");
    return;
  }
  if (authenticatedRole === "mentor" && !operationsWorkspace) {
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
