export async function attendanceLogoutNotice(checkOut, timeoutMs = 3500) {
  let timer;
  try {
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Checkout deadline passed.')), timeoutMs);
    });
    const { data } = await Promise.race([Promise.resolve().then(checkOut), deadline]);
    return data?.reportReminder
      ? 'Your daily work report is still missing. You can sign out and submit the report before 20:00 IST.'
      : null;
  } catch {
    return 'Attendance checkout could not be confirmed. You can still sign out. Request a correction if your checkout is missing.';
  } finally {
    clearTimeout(timer);
  }
}

export async function signOutWithAttendance({ checkOut, signOut, notify, timeoutMs }) {
  try {
    if (checkOut) {
      const notice = await attendanceLogoutNotice(checkOut, timeoutMs);
      if (notice) {
        try { notify?.(notice); } catch { /* Sign-out has priority over notice handling. */ }
      }
    }
  } finally {
    await signOut();
  }
}
