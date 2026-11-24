"use strict";

const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { tracks } = require("../curriculum");

async function main() {
  const [, , accountIdentifier, role, trackList = ""] = process.argv;
  const validRoles = [
    "founder",
    "co_founder",
    "admin",
    "hr_manager",
    "hr_executive",
    "operations_executive",
    "mentor",
    "learner"
  ];
  if (!accountIdentifier || !validRoles.includes(role)) {
    throw new Error("Usage: npm run set-user-role -- <firebase-uid-or-email> <founder|co_founder|admin|hr_manager|hr_executive|operations_executive|mentor|learner> [mentor-track,mentor-track]");
  }

  const mentorTracks = role === "mentor"
    ? trackList.split(",").map(track => track.trim()).filter(Boolean)
    : [];
  if (role !== "mentor" && trackList) {
    throw new Error("Only mentor accounts can be assigned training tracks.");
  }
  if (role === "mentor" && (!mentorTracks.length || mentorTracks.some(track => !tracks[track]))) {
    throw new Error(`Mentors must be assigned valid track names: ${Object.keys(tracks).join(" | ")}`);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("Set FIREBASE_PROJECT_ID to the Firebase project ID before running this command.");
  initializeApp({ projectId });
  const auth = getAuth();
  const db = getFirestore();
  const account = accountIdentifier.includes("@")
    ? await auth.getUserByEmail(accountIdentifier.trim().toLowerCase())
    : await auth.getUser(accountIdentifier);
  if (account.disabled || !(account.emailVerified
    || account.providerData.some(provider => provider.providerId === "google.com"))) {
    throw new Error("The account must be active and have a verified email address.");
  }

  const uid = account.uid;
  const existingClaims = account.customClaims || {};
  await auth.setCustomUserClaims(uid, {
    ...existingClaims,
    role,
    mentorTracks
  });
  try {
    await db.collection("profiles").doc(uid).set({
      uid,
      email: account.email || "",
      displayName: account.displayName || "",
      role,
      mentorTracks,
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    try {
      await auth.setCustomUserClaims(uid, existingClaims);
    } catch (rollbackError) {
      console.error("Role profile update failed and claims could not be rolled back.", {
        uid,
        error,
        rollbackError
      });
      throw new Error("The role update only partially completed. Contact an administrator before retrying.");
    }
    throw error;
  }
  console.log(`Updated ${account.email || uid} to ${role}. The user must sign in again for new claims to take effect.`);
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});
