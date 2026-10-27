"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldPath, FieldValue, getFirestore } = require("firebase-admin/firestore");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const { google } = require("googleapis");
const { randomUUID } = require("node:crypto");
const { tracks, taskById } = require("./curriculum");

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 20 });

const calendarClientId = defineSecret("GOOGLE_CALENDAR_CLIENT_ID");
const calendarClientSecret = defineSecret("GOOGLE_CALENDAR_CLIENT_SECRET");
const calendarRefreshToken = defineSecret("GOOGLE_CALENDAR_REFRESH_TOKEN");
const auth = getAuth();
const db = getFirestore();
const profileRef = uid => db.collection("profiles").doc(uid);
const assignmentRef = id => db.collection("trainingAssignments").doc(id);
const meetingRef = db.collection("organization").doc("currentMeeting");
const attendanceCollection = uid => db.collection("internships").doc(uid).collection("attendance");
const superAdminRoles = ["founder", "co_founder"];
const founderEmailAllowlist = new Set(["ctrlabhishek@gmail.com"]);
const staffAccountAllowlist = new Map([
  ["thesumitsah47@gmail.com", { role: "admin", displayName: "Sumit Kumar" }],
  ["tanu65159@gmail.com", { role: "operations_executive", displayName: "Tanya Tyagi" }],
  ["mikkurwt694@gmail.com", { role: "hr_executive", displayName: "Mahak Rawat" }],
  ["ashitarohilla32@gmail.com", { role: "hr_manager", displayName: "Ashita Rohilla" }]
]);
const staffRoles = [...superAdminRoles, "admin", "hr_manager", "hr_executive", "operations_executive"];
const internManagerRoles = staffRoles;
const profileManagers = [...superAdminRoles, "admin", "hr_manager"];
const trainingManagerRoles = [...superAdminRoles, "admin", "hr_manager"];
const attendanceRoles = [...superAdminRoles, "admin", "hr_manager", "operations_executive"];
const supportedDurations = [1, 2, 3, 6];
const timezone = "Asia/Kolkata";

function requireSignedIn(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please sign in to continue.");
  const signInProvider = request.auth.token.firebase?.sign_in_provider;
  if (!["password", "google.com"].includes(signInProvider)
    || request.auth.token.email_verified !== true) {
    throw new HttpsError("permission-denied", "Verify your email address before using the IntelliCore workspace.");
  }
  return request.auth;
}

function callerRole(user) {
  if (user.token.email_verified === true
    && typeof user.token.email === "string"
    && founderEmailAllowlist.has(user.token.email.trim().toLowerCase())) {
    return "founder";
  }
  const role = user.token.role;
  return staffRoles.includes(role) || role === "mentor" ? role : "learner";
}

function mentorTracks(user) {
  return Array.isArray(user.token.mentorTracks) ? user.token.mentorTracks : [];
}

function requireAdmin(user) {
  if (!superAdminRoles.includes(callerRole(user))) {
    throw new HttpsError("permission-denied", "A Founder or Co-founder Super Admin account is required.");
  }
}

function requireTrackAccess(user, track) {
  if (trainingManagerRoles.includes(callerRole(user))) return;
  if (callerRole(user) !== "mentor" || !mentorTracks(user).includes(track)) {
    throw new HttpsError("permission-denied", "You are not authorised for this training track.");
  }
}

function requireAnyRole(user, roles, message = "You are not authorised to perform this action.") {
  if (!roles.includes(callerRole(user))) throw new HttpsError("permission-denied", message);
}

function dateInIndia(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addDurationMonths(startDate, durationMonths) {
  const [year, month, day] = startDate.split("-").map(Number);
  const targetMonthIndex = month - 1 + durationMonths;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12 + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

function requireSupportedDuration(value) {
  const duration = Number(value);
  if (!Number.isInteger(duration) || !supportedDurations.includes(duration)) {
    throw new HttpsError("invalid-argument", "Choose a duration of 1, 2, 3, or 6 months.");
  }
  return duration;
}

function canJoinMeeting(user) {
  const role = callerRole(user);
  return role === "learner" || staffRoles.includes(role);
}

function calendarApi() {
  const oauth = new google.auth.OAuth2(calendarClientId.value(), calendarClientSecret.value());
  oauth.setCredentials({ refresh_token: calendarRefreshToken.value() });
  return google.calendar({ version: "v3", auth: oauth });
}

async function activeMeetingFor(user, profile = null) {
  const role = callerRole(user);
  let authorised = staffRoles.includes(role);
  if (role === "learner") {
    const learnerProfile = profile || publicProfile((await profileRef(user.uid).get()).data() || {});
    const today = dateInIndia();
    authorised = Boolean(
      learnerProfile.track
      && learnerProfile.internshipStartDate
      && learnerProfile.internshipEndDate
      && today >= learnerProfile.internshipStartDate
      && today <= learnerProfile.internshipEndDate
    );
  }
  if (!authorised || !canJoinMeeting(user)) return null;

  const snapshot = await meetingRef.get();
  if (!snapshot.exists) return null;
  const meeting = snapshot.data();
  const expiresAt = meeting.expiresAt?.toMillis?.();
  if (meeting.status !== "active" || !expiresAt || expiresAt <= Date.now()) return null;
  return {
    title: meeting.title,
    meetUrl: meeting.meetUrl,
    startedAt: meeting.startedAt?.toMillis?.() || null,
    expiresAt
  };
}

function requiredText(value, field, maximum) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
    throw new HttpsError("invalid-argument", `${field} must contain 1 to ${maximum} characters.`);
  }
  return value.trim();
}

function requiredDocumentId(value) {
  const id = requiredText(value, "Assignment", 128);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    throw new HttpsError("invalid-argument", "The assignment identifier is invalid.");
  }
  return id;
}

function validTrack(track) {
  return Object.prototype.hasOwnProperty.call(tracks, track);
}

function validEmail(value) {
  if (typeof value !== "string" || value.length > 254) {
    throw new HttpsError("invalid-argument", "Enter a valid account email address.");
  }
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid account email address.");
  }
  return email;
}

function validPhone(value) {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "Enter a valid phone number.");
  }
  const phone = value.trim();
  const digits = phone.replace(/\D/g, "");
  if (phone.length > 24 || digits.length < 7 || digits.length > 15 || !/^[+()\d .-]+$/.test(phone)) {
    throw new HttpsError("invalid-argument", "Enter a valid phone number with 7 to 15 digits.");
  }
  return phone;
}

function publicProfile(data) {
  return {
    uid: data.uid,
    email: data.email || "",
    displayName: data.displayName || "",
    phone: data.phone || "",
    gender: data.gender || "",
    role: data.role || "learner",
    track: data.track || null,
    durationMonths: data.durationMonths || null,
    internshipStartDate: data.internshipStartDate || null,
    internshipEndDate: data.internshipEndDate || null,
    internshipStatus: data.internshipStatus || null,
    accountStatus: data.accountStatus || "active",
    lastLoginAt: data.lastLoginAt?.toMillis?.() || null,
    mentorTracks: Array.isArray(data.mentorTracks) ? data.mentorTracks : []
  };
}

function lastLoginMillis(profile, account) {
  const profileTime = profile.lastLoginAt?.toMillis?.() || 0;
  const authTime = account?.metadata.lastSignInTime
    ? Date.parse(account.metadata.lastSignInTime)
    : 0;
  return Math.max(profileTime, Number.isFinite(authTime) ? authTime : 0) || null;
}

async function internDirectoryPage(cursor = null) {
  let query = db.collection("profiles")
    .where("role", "==", "learner")
    .orderBy(FieldPath.documentId())
    .limit(101);
  if (cursor) {
    const cursorSnapshot = await profileRef(cursor).get();
    if (!cursorSnapshot.exists || cursorSnapshot.get("role") !== "learner") {
      throw new HttpsError("invalid-argument", "The intern directory page cursor is no longer valid. Refresh the dashboard.");
    }
    query = query.startAfter(cursorSnapshot);
  }
  const snapshot = await query.get();
  const hasMore = snapshot.size > 100;
  const page = snapshot.docs.slice(0, 100);
  const authUsers = page.length
    ? await auth.getUsers(page.map(document => ({ uid: document.id })))
    : { users: [] };
  const authUsersByUid = new Map(authUsers.users.map(account => [account.uid, account]));
  const inactiveBefore = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const interns = page.map(document => {
    const intern = document.data();
    const account = authUsersByUid.get(document.id);
    const lastLoginAt = lastLoginMillis(intern, account);
    const enrolled = Boolean(
      intern.track
      && intern.internshipStartDate
      && intern.internshipEndDate
      && (intern.internshipStatus || "active") === "active"
    );
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
      inactive: enrolled && Boolean(lastLoginAt && lastLoginAt < inactiveBefore)
    };
  });
  return {
    interns,
    hasMore,
    nextCursor: hasMore && page.length ? page[page.length - 1].id : null
  };
}

async function userByEmail(email) {
  try {
    return await auth.getUserByEmail(validEmail(email));
  } catch (error) {
    if (error.code === "auth/user-not-found") {
      throw new HttpsError("not-found", "No registered IntelliCore account was found for that email.");
    }
    throw error;
  }
}

function hasVerifiedEmail(user) {
  return user.emailVerified
    || user.providerData.some(provider => provider.providerId === "google.com");
}

async function ensureProfileRecord(user, authUser, role) {
  const ref = profileRef(user.uid);
  const snapshot = await ref.get();
  const profile = {
    uid: user.uid,
    email: authUser.email || "",
    displayName: authUser.displayName || "",
    role,
    mentorTracks: role === "mentor" ? mentorTracks(user) : [],
    lastLoginAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };
  if (!snapshot.exists) {
    profile.createdAt = FieldValue.serverTimestamp();
    profile.track = null;
  } else {
    profile.track = snapshot.get("track") || null;
  }
  await ref.set(profile, { merge: true });
  return publicProfile({ ...(snapshot.exists ? snapshot.data() : {}), ...profile });
}

exports.bootstrapAccount = onCall(async request => {
  const user = requireSignedIn(request);
  const authUser = await auth.getUser(user.uid);
  if (!hasVerifiedEmail(authUser)) {
    throw new HttpsError("permission-denied", "Verify your email address before creating a workspace.");
  }

  const account = staffAccountAllowlist.get((authUser.email || "").trim().toLowerCase());
  let role = callerRole(user);
  if (account) {
    const currentClaims = authUser.customClaims || {};
    if (currentClaims.role !== account.role
      || (currentClaims.mentorTracks?.length || 0) > 0) {
      await auth.setCustomUserClaims(user.uid, {
        ...currentClaims,
        role: account.role,
        mentorTracks: []
      });
    }
    if (authUser.displayName !== account.displayName) {
      await auth.updateUser(user.uid, { displayName: account.displayName });
    }
    role = account.role;
  }

  const profile = await ensureProfileRecord(
    user,
    account ? { ...authUser, displayName: account.displayName } : authUser,
    role
  );
  return { role, profile };
});

exports.ensureProfile = onCall(async request => {
  const user = requireSignedIn(request);
  const authUser = await auth.getUser(user.uid);
  const role = callerRole(user);
  const profile = await ensureProfileRecord(user, authUser, role);
  return profile;
});

exports.listRoleAssignmentCandidates = onCall(async request => {
  const user = requireSignedIn(request);
  requireAdmin(user);

  const snapshot = await db.collection("profiles")
    .where("role", "==", "learner")
    .limit(100)
    .get();
  const accounts = snapshot.empty
    ? { users: [] }
    : await auth.getUsers(snapshot.docs.map(document => ({ uid: document.id })));
  const eligibleAccounts = new Map(accounts.users
    .filter(account => !account.disabled
      && hasVerifiedEmail(account)
      && callerRole({ token: account.customClaims || {} }) === "learner")
    .map(account => [account.uid, account]));
  return {
    learners: snapshot.docs.filter(document => eligibleAccounts.has(document.id)).map(document => {
      const profile = document.data();
      return {
        uid: document.id,
        email: profile.email || "",
        displayName: profile.displayName || "",
        track: profile.track || "",
        lastLoginAt: profile.lastLoginAt?.toMillis?.() || null
      };
    }),
    tracks: Object.keys(tracks)
  };
});

exports.assignStaffRole = onCall(async request => {
  const user = requireSignedIn(request);
  requireAdmin(user);

  const uid = requiredText(request.data?.uid, "Account", 128);
  if (!/^[A-Za-z0-9_-]+$/.test(uid)) {
    throw new HttpsError("invalid-argument", "The account identifier is invalid.");
  }
  const role = request.data?.role;
  if (!["mentor", "hr_manager", "hr_executive"].includes(role)) {
    throw new HttpsError("invalid-argument", "Choose Team Leader, HR Manager, or HR Executive.");
  }

  const selectedTracks = request.data?.mentorTracks;
  let assignedTracks = [];
  if (role === "mentor") {
    if (!Array.isArray(selectedTracks) || !selectedTracks.length
      || selectedTracks.length > Object.keys(tracks).length
      || selectedTracks.some(track => typeof track !== "string" || !validTrack(track))
      || new Set(selectedTracks).size !== selectedTracks.length) {
      throw new HttpsError("invalid-argument", "Assign a Team Leader to one or more valid internship tracks.");
    }
    assignedTracks = selectedTracks;
  } else if (selectedTracks !== undefined && (!Array.isArray(selectedTracks) || selectedTracks.length)) {
    throw new HttpsError("invalid-argument", "Internship track access can only be assigned to Team Leaders.");
  }

  const profileRefForTarget = profileRef(uid);
  const [account, profileSnapshot] = await Promise.all([
    auth.getUser(uid),
    profileRefForTarget.get()
  ]);
  if (account.disabled || !hasVerifiedEmail(account)) {
    throw new HttpsError("failed-precondition", "The account must be active and have a verified email address.");
  }
  if (!profileSnapshot.exists
    || profileSnapshot.get("role") !== "learner"
    || callerRole({ token: account.customClaims || {} }) !== "learner") {
    throw new HttpsError("failed-precondition", "Only an unassigned intern account can receive a staff role.");
  }

  const existingClaims = account.customClaims || {};
  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    role,
    mentorTracks: assignedTracks
  });
  try {
    await profileRefForTarget.set({
      role,
      mentorTracks: assignedTracks,
      roleAssignedBy: user.uid,
      roleAssignedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    try {
      await auth.setCustomUserClaims(uid, existingClaims);
    } catch (rollbackError) {
      console.error("Staff role assignment failed and its claims could not be rolled back.", {
        uid,
        error,
        rollbackError
      });
      throw new HttpsError(
        "internal",
        "The role could not be fully saved. Contact an administrator before retrying."
      );
    }
    console.error("Staff role assignment failed; the temporary role claim was rolled back.", { uid, error });
    throw new HttpsError("internal", "The role could not be saved. Please retry the assignment.");
  }

  return {
    uid,
    role,
    mentorTracks: assignedTracks,
    requiresSignIn: true
  };
});

exports.updateDisplayName = onCall(async request => {
  const user = requireSignedIn(request);
  const displayName = requiredText(request.data?.displayName, "Display name", 80);
  await auth.updateUser(user.uid, { displayName });
  await profileRef(user.uid).set({
    uid: user.uid,
    displayName,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { displayName };
});

exports.assignTrack = onCall(async request => {
  const user = requireSignedIn(request);
  requireAnyRole(user, profileManagers, "Only a founder, administrator, or HR manager can update an internship profile.");
  const email = validEmail(request.data?.email);
  const track = request.data?.track;
  if (!validTrack(track)) throw new HttpsError("invalid-argument", "Choose one of the supported internship tracks.");

  const target = await userByEmail(email);
  if (!hasVerifiedEmail(target)) {
    throw new HttpsError("failed-precondition", "The learner must verify their email before a training track can be assigned.");
  }
  const targetRef = profileRef(target.uid);
  const profile = await targetRef.get();
  if (!profile.exists) {
    throw new HttpsError("failed-precondition", "The learner must sign in once before a track can be assigned.");
  }
  if (callerRole({ token: target.customClaims || {} }) !== "learner") {
    throw new HttpsError("failed-precondition", "Training tracks can only be assigned to learner accounts.");
  }
  const currentTrack = profile.get("track");
  if (currentTrack && currentTrack !== track) {
    const assignments = await db.collection("trainingAssignments")
      .where("assignedToUid", "==", target.uid)
      .limit(1)
      .get();
    if (!assignments.empty) {
      throw new HttpsError("failed-precondition", "This learner already has training tasks. Complete or resolve those assignments before changing tracks.");
    }
  }
  await targetRef.set({
    uid: target.uid,
    email: target.email || email,
    track,
    updatedAt: FieldValue.serverTimestamp(),
    trackAssignedBy: user.uid
  }, { merge: true });
  return { uid: target.uid, email: target.email || email, track };
});

exports.assignTrainingTask = onCall(async request => {
  const user = requireSignedIn(request);
  if (callerRole(user) === "learner") {
    throw new HttpsError("permission-denied", "Only an administrator or authorised mentor can assign training tasks.");
  }
  const task = taskById.get(request.data?.taskId);
  if (!task) throw new HttpsError("invalid-argument", "Choose a task from the approved training curriculum.");
  requireTrackAccess(user, task.track);

  const target = await userByEmail(request.data?.email);
  if (!hasVerifiedEmail(target)) {
    throw new HttpsError("failed-precondition", "The learner must verify their email before training tasks can be assigned.");
  }
  const profile = await profileRef(target.uid).get();
  if (!profile.exists || profile.get("role") !== "learner") {
    throw new HttpsError("failed-precondition", "The recipient must have an active learner profile.");
  }
  if (profile.get("track") !== task.track) {
    throw new HttpsError("failed-precondition", "The task must match the learner's administrator-assigned track.");
  }

  let dueDate = null;
  if (request.data?.dueDate) {
    dueDate = requiredText(request.data.dueDate, "Due date", 10);
    const parsedDate = new Date(`${dueDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)
      || Number.isNaN(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== dueDate) {
      throw new HttpsError("invalid-argument", "Enter a valid due date.");
    }
  }
  const existing = await db.collection("trainingAssignments")
    .where("assignedToUid", "==", target.uid)
    .where("taskId", "==", task.id)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new HttpsError("already-exists", "This task has already been assigned to this learner.");
  }

  const ref = db.collection("trainingAssignments").doc();
  const assignment = {
    assignedToUid: target.uid,
    learnerEmail: target.email || email,
    track: task.track,
    taskId: task.id,
    status: "assigned",
    dueDate,
    assignedByUid: user.uid,
    assignedByRole: callerRole(user),
    assignedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    submissionCount: 0,
    latestSubmissionText: "",
    latestSubmissionUrl: "",
    feedback: ""
  };
  await ref.set(assignment);
  return { id: ref.id, taskId: task.id, status: assignment.status };
});

exports.submitTrainingTask = onCall(async request => {
  const user = requireSignedIn(request);
  const assignmentId = requiredDocumentId(request.data?.assignmentId);
  const text = typeof request.data?.text === "string" ? request.data.text.trim() : "";
  const url = typeof request.data?.url === "string" ? request.data.url.trim() : "";
  if (text.length > 20000) {
    throw new HttpsError("invalid-argument", "Submission notes must be 20,000 characters or fewer.");
  }
  if (url.length > 2048) {
    throw new HttpsError("invalid-argument", "Deliverable links must be 2,048 characters or fewer.");
  }
  if (!text && !url) {
    throw new HttpsError("invalid-argument", "Add submission notes or a link to your deliverable.");
  }
  if (url) {
    let parsedUrl;
    try { parsedUrl = new URL(url); }
    catch { throw new HttpsError("invalid-argument", "Enter a valid HTTPS deliverable link."); }
    if (parsedUrl.protocol !== "https:") {
      throw new HttpsError("invalid-argument", "Deliverable links must use HTTPS.");
    }
  }

  const ref = assignmentRef(assignmentId);
  const submissionRef = ref.collection("submissions").doc();
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get("assignedToUid") !== user.uid) {
      throw new HttpsError("not-found", "This assignment is not available in your account.");
    }
    const status = snapshot.get("status");
    if (!["assigned", "changes_requested"].includes(status)) {
      throw new HttpsError("failed-precondition", "This task cannot be submitted in its current review state.");
    }
    const submissionCount = (snapshot.get("submissionCount") || 0) + 1;
    const submission = {
      assignmentId,
      userId: user.uid,
      track: snapshot.get("track"),
      attempt: submissionCount,
      text,
      url,
      submittedAt: FieldValue.serverTimestamp()
    };
    transaction.set(submissionRef, submission);
    transaction.update(ref, {
      status: "submitted",
      submissionCount,
      latestSubmissionText: text,
      latestSubmissionUrl: url,
      submittedAt: FieldValue.serverTimestamp(),
      feedback: "",
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { status: "submitted" };
});

exports.reviewTrainingTask = onCall(async request => {
  const user = requireSignedIn(request);
  if (callerRole(user) === "learner") {
    throw new HttpsError("permission-denied", "Only an administrator or authorised mentor can review submissions.");
  }
  const assignmentId = requiredDocumentId(request.data?.assignmentId);
  const decision = request.data?.decision;
  if (!["approved", "changes_requested"].includes(decision)) {
    throw new HttpsError("invalid-argument", "Choose approve or request changes.");
  }
  const feedback = requiredText(request.data?.feedback, "Review feedback", 4000);
  const ref = assignmentRef(assignmentId);
  const reviewRef = ref.collection("reviews").doc();
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw new HttpsError("not-found", "The training assignment was not found.");
    const assignment = snapshot.data();
    requireTrackAccess(user, assignment.track);
    if (assignment.status !== "submitted") {
      throw new HttpsError("failed-precondition", "Only a submitted task can be reviewed.");
    }
    transaction.set(reviewRef, {
      assignmentId,
      reviewerUid: user.uid,
      decision,
      feedback,
      reviewedAt: FieldValue.serverTimestamp()
    });
    transaction.update(ref, {
      status: decision,
      feedback,
      reviewedByUid: user.uid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  return { status: decision };
});

exports.getTrainingDashboard = onCall(async request => {
  const user = requireSignedIn(request);
  const profileSnapshot = await profileRef(user.uid).get();
  if (!profileSnapshot.exists) {
    throw new HttpsError("failed-precondition", "Your profile is still being prepared. Refresh and try again.");
  }
  const profile = publicProfile(profileSnapshot.data());
  const assignmentSnapshot = await db.collection("trainingAssignments")
    .where("assignedToUid", "==", user.uid)
    .limit(100)
    .get();
  const toWireAssignment = (snapshot, task) => {
    const data = snapshot.data();
    const wireData = Object.fromEntries(Object.entries(data).map(([key, value]) => [
      key,
      value && typeof value.toMillis === "function" ? value.toMillis() : value
    ]));
    return { id: snapshot.id, ...wireData, task };
  };
  const assignments = assignmentSnapshot.docs.map(snapshot => {
    const task = taskById.get(snapshot.get("taskId"));
    return task ? toWireAssignment(snapshot, task) : null;
  }).filter(Boolean).sort((a, b) => {
    const timeA = Number(a.updatedAt || a.assignedAt || 0);
    const timeB = Number(b.updatedAt || b.assignedAt || 0);
    return timeB - timeA;
  });

  const role = callerRole(user);
  let catalog = [];
  let reviewQueue = [];
  if ([...trainingManagerRoles, "mentor"].includes(role)) {
    const availableTracks = trainingManagerRoles.includes(role)
      ? Object.keys(tracks)
      : mentorTracks(user);
    catalog = availableTracks.flatMap(track =>
      (tracks[track] || []).map(task => ({ ...task, track }))
    );
    const queueSnapshots = await Promise.all(availableTracks.map(track =>
      db.collection("trainingAssignments")
        .where("track", "==", track)
        .where("status", "==", "submitted")
        .limit(100)
        .get()
    ));
    reviewQueue = queueSnapshots.flatMap(snapshot => snapshot.docs.map(document => {
      const task = taskById.get(document.get("taskId"));
      return task ? toWireAssignment(document, task) : null;
    })).filter(Boolean);
  }
  const attendanceSnapshot = await attendanceCollection(user.uid)
    .orderBy("attendanceDate", "desc")
    .limit(200)
    .get();
  const attendance = attendanceSnapshot.docs.map(document => ({
    attendanceDate: document.get("attendanceDate"),
    checkedInAt: document.get("checkedInAt")?.toMillis?.() || null
  }));
  const today = dateInIndia();
  const activeInternship = Boolean(
    profile.track
    && profile.internshipStartDate
    && profile.internshipEndDate
    && today >= profile.internshipStartDate
    && today <= profile.internshipEndDate
  );
  const activeMeeting = await activeMeetingFor(user, profile);

  let internDirectory = [];
  let internDirectoryHasMore = false;
  let internDirectoryNextCursor = null;
  if (internManagerRoles.includes(role)) {
    const page = await internDirectoryPage();
    internDirectory = page.interns;
    internDirectoryHasMore = page.hasMore;
    internDirectoryNextCursor = page.nextCursor;
  }

  let attendanceReport = [];
  if (attendanceRoles.includes(role)) {
    const reportSnapshot = await db.collectionGroup("attendance")
      .orderBy("attendanceDate", "desc")
      .limit(500)
      .get();
    const reportEntries = reportSnapshot.docs.map(document => ({
      uid: document.ref.parent.parent.id,
      attendanceDate: document.get("attendanceDate"),
      checkedInAt: document.get("checkedInAt")?.toMillis?.() || null
    }));
    const profileRefs = [...new Set(reportEntries.map(entry => entry.uid))]
      .map(uid => profileRef(uid));
    const profiles = profileRefs.length ? await db.getAll(...profileRefs) : [];
    const profilesByUid = new Map(profiles.map(snapshot => [snapshot.id, snapshot.data()]));
    attendanceReport = reportEntries.map(entry => {
      const intern = profilesByUid.get(entry.uid) || {};
      return {
        ...entry,
        email: intern.email || "",
        displayName: intern.displayName || "",
        track: intern.track || ""
      };
    });
  }

  return {
    profile,
    assignments,
    catalog,
    reviewQueue,
    attendance,
    activeInternship,
    activeMeeting,
    internDirectory,
    internDirectoryHasMore,
    internDirectoryNextCursor,
    attendanceReport,
    role
  };
});

exports.getActiveTeamMeeting = onCall(async request => {
  const user = requireSignedIn(request);
  return { activeMeeting: await activeMeetingFor(user) };
});

exports.getMoreInternDirectory = onCall(async request => {
  const user = requireSignedIn(request);
  requireAnyRole(user, internManagerRoles, "Only authorised IntelliCore staff can view intern profiles.");
  const cursor = requiredText(request.data?.cursor, "Directory cursor", 128);
  const page = await internDirectoryPage(cursor);
  return {
    internDirectory: page.interns,
    internDirectoryHasMore: page.hasMore,
    internDirectoryNextCursor: page.nextCursor
  };
});

exports.setInternAccountStatus = onCall(async request => {
  const user = requireSignedIn(request);
  requireAnyRole(user, internManagerRoles, "Only authorised IntelliCore staff can manage intern account access.");
  const uid = requiredText(request.data?.uid, "Intern account", 128);
  if (!/^[A-Za-z0-9_-]+$/.test(uid)) {
    throw new HttpsError("invalid-argument", "The intern account identifier is invalid.");
  }
  const status = request.data?.status;
  if (!["active", "deactivated"].includes(status)) {
    throw new HttpsError("invalid-argument", "Choose active or deactivated account status.");
  }

  const ref = profileRef(uid);
  const profileSnapshot = await ref.get();
  if (!profileSnapshot.exists || profileSnapshot.get("role") !== "learner") {
    throw new HttpsError("not-found", "The intern profile was not found.");
  }
  const profile = profileSnapshot.data();
  const enrolled = Boolean(
    profile.track
    && profile.internshipStartDate
    && profile.internshipEndDate
    && (profile.internshipStatus || "active") === "active"
  );
  if (!enrolled) {
    throw new HttpsError("failed-precondition", "Only enrolled intern accounts can be deactivated or reactivated here.");
  }
  const account = await auth.getUser(uid);
  if (status === "deactivated") {
    const lastLoginAt = lastLoginMillis(profile, account);
    if (!lastLoginAt || lastLoginAt > Date.now() - 7 * 24 * 60 * 60 * 1000) {
      throw new HttpsError("failed-precondition", "Only enrolled interns who have not logged in for at least 7 days can be deactivated.");
    }
    if (account.disabled) {
      await ref.set({
        accountStatus: "deactivated",
        deactivatedAt: profile.deactivatedAt || FieldValue.serverTimestamp()
      }, { merge: true });
      return { uid, status: "deactivated" };
    }
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
    await ref.set({
      accountStatus: "deactivated",
      deactivatedAt: FieldValue.serverTimestamp(),
      deactivatedBy: user.uid,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { uid, status: "deactivated" };
  }

  if (account.disabled) await auth.updateUser(uid, { disabled: false });
  await ref.set({
    accountStatus: "active",
    reactivatedAt: FieldValue.serverTimestamp(),
    reactivatedBy: user.uid,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { uid, status: "active" };
});

exports.saveInternshipProfile = onCall(async request => {
  const user = requireSignedIn(request);
  if (callerRole(user) !== "learner") {
    throw new HttpsError("permission-denied", "Only intern accounts can build an internship profile.");
  }
  const displayName = requiredText(request.data?.displayName, "Full name", 80);
  if (displayName.length < 2) {
    throw new HttpsError("invalid-argument", "Full name must contain at least 2 characters.");
  }
  const gender = request.data?.gender;
  const allowedGenders = ["Female", "Male"];
  if (!allowedGenders.includes(gender)) {
    throw new HttpsError("invalid-argument", "Choose a gender option to continue.");
  }
  const track = request.data?.track;
  if (!validTrack(track)) {
    throw new HttpsError("invalid-argument", "Choose one of the eight supported internship domains.");
  }
  const phone = validPhone(request.data?.phone);
  const durationMonths = requireSupportedDuration(request.data?.durationMonths);
  const ref = profileRef(user.uid);
  const draftSnapshot = await db.collection("users").doc(user.uid)
    .collection("profileDrafts").doc("current").get();
  const savedAt = draftSnapshot.get("savedAt");
  const startDate = savedAt?.toDate
    ? dateInIndia(savedAt.toDate())
    : dateInIndia();
  const endDate = addDurationMonths(startDate, durationMonths);
  const savedDates = await db.runTransaction(async transaction => {
    const profileSnapshot = await transaction.get(ref);
    if (!profileSnapshot.exists || profileSnapshot.get("role") !== "learner") {
      throw new HttpsError("failed-precondition", "Your intern profile is not ready. Refresh and try again.");
    }
    const current = profileSnapshot.data();
    const profileData = {
      displayName,
      gender,
      phone,
      updatedAt: FieldValue.serverTimestamp()
    };
    if (current.internshipStartDate && current.internshipEndDate) {
      if (current.track === track && current.durationMonths === durationMonths) {
        transaction.set(ref, {
          ...profileData,
          profileCompletedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        return { startDate: current.internshipStartDate, endDate: current.internshipEndDate };
      }
      throw new HttpsError("failed-precondition", "Your internship profile is already active. Contact HR to change your domain or duration.");
    }
    if (current.track && current.track !== track) {
      const assignments = await transaction.get(db.collection("trainingAssignments")
        .where("assignedToUid", "==", user.uid)
        .limit(1));
      const attendance = await transaction.get(attendanceCollection(user.uid).limit(1));
      if (!assignments.empty || !attendance.empty) {
        throw new HttpsError("failed-precondition", "Your saved training or attendance records lock this domain. Contact HR to change it.");
      }
    }
    transaction.set(ref, {
      ...profileData,
      track,
      durationMonths,
      internshipStartDate: startDate,
      internshipEndDate: endDate,
      internshipStatus: "active",
      profileCompletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    return { startDate, endDate };
  });
  await auth.updateUser(user.uid, { displayName });
  return { track, durationMonths, ...savedDates, status: "active" };
});

exports.updateInternshipProfile = onCall(async request => {
  const user = requireSignedIn(request);
  requireAnyRole(user, profileManagers, "Only a founder, administrator, or HR manager can update intern profiles.");
  const email = validEmail(request.data?.email);
  const track = request.data?.track;
  if (!validTrack(track)) {
    throw new HttpsError("invalid-argument", "Choose one of the eight supported internship domains.");
  }
  const durationMonths = requireSupportedDuration(request.data?.durationMonths);
  const phone = typeof request.data?.phone === "string" && request.data.phone.trim()
    ? validPhone(request.data.phone)
    : null;
  const target = await userByEmail(email);
  if (callerRole({ token: target.customClaims || {} }) !== "learner") {
    throw new HttpsError("failed-precondition", "Only an intern account can have an internship profile updated.");
  }
  const ref = profileRef(target.uid);
  let startDate;
  let endDate;
  await db.runTransaction(async transaction => {
    const profile = await transaction.get(ref);
    if (!profile.exists || profile.get("role") !== "learner") {
      throw new HttpsError("failed-precondition", "The selected account does not have an intern profile.");
    }
    if (profile.get("track") && profile.get("track") !== track) {
      const assignments = await transaction.get(db.collection("trainingAssignments")
        .where("assignedToUid", "==", target.uid)
        .limit(1));
      if (!assignments.empty) {
        throw new HttpsError("failed-precondition", "Resolve the intern's existing training assignments before changing their domain.");
      }
    }
    startDate = profile.get("internshipStartDate") || dateInIndia();
    endDate = addDurationMonths(startDate, durationMonths);
    transaction.set(ref, {
      track,
      ...(phone ? { phone } : {}),
      durationMonths,
      internshipStartDate: startDate,
      internshipEndDate: endDate,
      internshipStatus: "active",
      updatedAt: FieldValue.serverTimestamp(),
      profileUpdatedBy: user.uid
    }, { merge: true });
  });
  return { uid: target.uid, track, durationMonths, startDate, endDate };
});

exports.checkInToday = onCall(async request => {
  const user = requireSignedIn(request);
  if (callerRole(user) !== "learner") {
    throw new HttpsError("permission-denied", "Attendance check-in is available to intern accounts.");
  }
  const ref = profileRef(user.uid);
  const today = dateInIndia();
  const attendanceRef = attendanceCollection(user.uid).doc(today);
  const result = await db.runTransaction(async transaction => {
    const profile = await transaction.get(ref);
    if (!profile.exists) {
      throw new HttpsError("failed-precondition", "Build your internship profile before checking in.");
    }
    const data = profile.data();
    if (!data.track || !data.durationMonths || !data.internshipStartDate || !data.internshipEndDate) {
      throw new HttpsError("failed-precondition", "Build your internship profile before checking in.");
    }
    if (today < data.internshipStartDate || today > data.internshipEndDate) {
      throw new HttpsError("failed-precondition", "Attendance check-in is only available during your internship dates.");
    }
    if (new Date(`${today}T00:00:00Z`).getUTCDay() === 0) {
      return { alreadyCheckedIn: false, skippedSunday: true, attendanceDate: today };
    }
    const existing = await transaction.get(attendanceRef);
    if (existing.exists) return { alreadyCheckedIn: true, attendanceDate: today };
    transaction.create(attendanceRef, {
      uid: user.uid,
      attendanceDate: today,
      track: data.track,
      durationMonths: data.durationMonths,
      internshipStartDate: data.internshipStartDate,
      internshipEndDate: data.internshipEndDate,
      checkedInAt: FieldValue.serverTimestamp()
    });
    return { alreadyCheckedIn: false, attendanceDate: today };
  });
  return result;
});

exports.startTeamMeeting = onCall({
  secrets: [calendarClientId, calendarClientSecret, calendarRefreshToken]
}, async request => {
  const user = requireSignedIn(request);
  requireAdmin(user);
  const now = Date.now();
  const startedAt = new Date(now);
  const expiresAt = new Date(now + 2 * 60 * 60 * 1000);
  const requestId = randomUUID();
  const reservation = await db.runTransaction(async transaction => {
    const current = await transaction.get(meetingRef);
    const currentData = current.exists ? current.data() : null;
    if (
      ["active", "provisioning"].includes(currentData?.status)
      && currentData.expiresAt?.toMillis?.() > now
    ) {
      throw new HttpsError("already-exists", "A team meeting is already active.");
    }
    transaction.set(meetingRef, {
      title: "IntelliCore Intern Team Meeting",
      status: "provisioning",
      startedByUid: user.uid,
      requestId,
      startedAt: FieldValue.serverTimestamp(),
      expiresAt: new Date(now + 5 * 60 * 1000),
      meetUrl: "",
      eventId: ""
    });
    return true;
  });
  if (!reservation) throw new HttpsError("aborted", "Could not reserve the team meeting.");

  let eventId = "";
  try {
    const calendar = calendarApi();
    const response = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      requestBody: {
        summary: "IntelliCore Intern Team Meeting",
        description: "A live meeting for active IntelliCore interns.",
        start: { dateTime: startedAt.toISOString() },
        end: { dateTime: expiresAt.toISOString() },
        conferenceData: {
          createRequest: {
            requestId,
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
        }
      }
    });
    eventId = response.data.id;
    let meetUrl = response.data.hangoutLink || "";
    for (let attempt = 0; !meetUrl && eventId && attempt < 5; attempt++) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1000));
      const refreshed = await calendar.events.get({ calendarId: "primary", eventId });
      meetUrl = refreshed.data.hangoutLink || "";
    }
    if (!eventId || !meetUrl) {
      throw new HttpsError("unavailable", "Google Calendar accepted the meeting, but has not returned its Meet link yet. Try again in a moment.");
    }
    await meetingRef.set({
      status: "active",
      title: "IntelliCore Intern Team Meeting",
      meetUrl,
      eventId,
      requestId,
      startedByUid: user.uid,
      startedAt: FieldValue.serverTimestamp(),
      expiresAt
    });
    return { title: "IntelliCore Intern Team Meeting", meetUrl, startedAt: now, expiresAt: expiresAt.getTime() };
  } catch (error) {
    if (eventId) {
      try {
        await calendarApi().events.delete({ calendarId: "primary", eventId });
      } catch (cleanupError) {
        console.error("The failed Google Meet event could not be removed.", cleanupError);
      }
    }
    const current = await meetingRef.get();
    if (current.get("requestId") === requestId) {
      await meetingRef.set({
        status: "failed",
        meetUrl: "",
        eventId,
        failedAt: FieldValue.serverTimestamp()
      }, { merge: true });
    }
    if (error instanceof HttpsError) throw error;
    console.error("Google Meet creation failed.", error);
    throw new HttpsError("failed-precondition", "Could not create a Google Meet. Check Calendar API and configured OAuth credentials.");
  }
});

exports.endTeamMeeting = onCall({
  secrets: [calendarClientId, calendarClientSecret, calendarRefreshToken]
}, async request => {
  const user = requireSignedIn(request);
  requireAdmin(user);
  const meeting = await meetingRef.get();
  if (!meeting.exists || meeting.get("status") !== "active") {
    throw new HttpsError("failed-precondition", "There is no active team meeting to end.");
  }
  const eventId = meeting.get("eventId");
  if (eventId) {
    try {
      await calendarApi().events.delete({ calendarId: "primary", eventId });
    } catch (error) {
      if (error.code !== 404 && error.response?.status !== 404) throw error;
    }
  }
  await meetingRef.set({
    status: "ended",
    endedByUid: user.uid,
    endedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  return { status: "ended" };
});
