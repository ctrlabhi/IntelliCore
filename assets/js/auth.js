/**
 * IntelliCore Homepage Authentication Controller
 * Version: 2.0.0
 * Architecture: Modular Monolith
 * 
 * Drives the modal login, signup, password reset, Google sign-in, and dashboard routing.
 */

import { authService } from '../../services/auth.js';

// Standardize local origin from 127.0.0.1 to localhost for canonical Firebase Authorized Domain alignment
if (window.location.hostname === '127.0.0.1' && window.location.port === '3000') {
  const normalized = new URL(window.location.href);
  normalized.hostname = 'localhost';
  window.location.replace(normalized.href);
}

try {
  const notice = sessionStorage.getItem('intelliCoreAttendanceNotice');
  if (notice) {
    sessionStorage.removeItem('intelliCoreAttendanceNotice');
    const banner = document.createElement('p');
    banner.setAttribute('role', 'status');
    banner.className = 'ic-auth-message is-info';
    banner.textContent = notice;
    document.querySelector('main')?.prepend(banner);
  }
} catch {
  // Authentication works when session storage is unavailable.
}

(() => {
  const $ = (id) => document.getElementById(id);

  const modal = $('loginModal');
  const form = $('icAuthForm');
  const emailInput = $('icAuthEmail');
  const passwordInput = $('icAuthPassword');
  const nameLabel = $('icNameLabel');
  const nameInput = $('icAuthName');
  const confirmLabel = $('icConfirmLabel');
  const confirmInput = $('icAuthConfirm');
  const passwordLabel = $('icAuthPasswordLabel');
  const submitBtn = $('icAuthSubmit');
  const googleBtn = $('icGoogleSignIn');
  const messageEl = $('icAuthMessage');
  const tabsContainer = $('icAuthTabs');
  const titleEl = $('icAuthTitle');
  const subtitleEl = $('icAuthSubtitle');
  const eyebrowEl = $('icAuthEyebrow');
  const loginTrigger = $('loginTrigger');
  const forgotPasswordBtn = $('icForgotPassword');
  const backToLoginBtn = $('icBackToLogin');
  const forgotActions = $('icForgotActions');
  const loginOptions = $('icLoginOptions');
  const verificationPanel = $('icVerificationActions');
  const resendVerificationBtn = $('icResendVerification');
  const checkVerificationBtn = $('icCheckVerification');
  const cancelVerificationBtn = $('icCancelVerification');
  const authDivider = $('icAuthDivider');
  const authSwitch = $('icAuthSwitch');
  const authFootnote = $('icAuthFootnote');
  const rememberCheckbox = $('icRemember');

  let mode = 'login'; // 'login' | 'signup' | 'forgot'
  let isSubmitting = false;

  function setMessage(msg, type = 'info') {
    if (!messageEl) return;
    messageEl.textContent = msg;
    messageEl.className = 'ic-auth-message';
    if (msg) {
      messageEl.classList.add(`is-${type}`);
    }
  }

  function mapAuthError(err) {
    const code = err?.code || '';
    const msg = err?.message || '';
    if (code === 'auth/unauthorized-domain' || msg.includes('auth/unauthorized-domain')) {
      return 'Domain authorization is updating. If this persists, please use email/password sign-in or check Firebase Console authorized domains.';
    }
    if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return 'Invalid email or password. Please verify your credentials and try again.';
    }
    if (code === 'auth/email-already-in-use') {
      return 'An account with this email address already exists. Please log in instead.';
    }
    if (code === 'auth/weak-password') {
      return 'Password must be at least 6 characters long.';
    }
    if (code === 'auth/invalid-email') {
      return 'Please enter a valid email address.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Too many failed attempts. Please wait a few moments before trying again.';
    }
    if (code === 'auth/popup-closed-by-user') {
      return 'Sign-in cancelled. Please click Continue with Google when ready.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Sign-in pop-up was blocked by your browser. Please allow pop-ups for this site.';
    }
    if (code === 'auth/network-request-failed') {
      return 'Network connection issue. Please check your connection and try again.';
    }
    return msg || 'An unexpected authentication error occurred. Please try again.';
  }

  function setLoading(loading, text = '') {
    isSubmitting = loading;
    if (submitBtn) {
      submitBtn.disabled = loading;
      if (loading) {
        submitBtn.classList.add('is-loading');
        submitBtn.innerHTML = `<span class="ic-spinner" aria-hidden="true"></span> <span>${text || 'Processing...'}</span>`;
      } else {
        submitBtn.classList.remove('is-loading');
        if (mode === 'signup') {
          submitBtn.innerHTML = '<span>Create account</span> <span aria-hidden="true">→</span>';
        } else if (mode === 'forgot') {
          submitBtn.innerHTML = '<span>Send reset link</span> <span aria-hidden="true">→</span>';
        } else {
          submitBtn.innerHTML = '<span>Log in</span> <span aria-hidden="true">→</span>';
        }
      }
    }
    if (googleBtn) googleBtn.disabled = loading;
  }

  function setMode(newMode) {
    mode = newMode;
    setMessage('');

    if (tabsContainer) {
      tabsContainer.hidden = (mode === 'forgot');
      tabsContainer.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.authMode === mode);
      });
    }

    if (mode === 'signup') {
      if (eyebrowEl) eyebrowEl.textContent = 'JOIN INTELLICORE';
      if (titleEl) titleEl.textContent = 'Create your account';
      if (subtitleEl) subtitleEl.textContent = 'Join IntelliCore to start your internship journey.';
      if (nameLabel) nameLabel.hidden = false;
      if (nameInput) nameInput.required = true;
      if (passwordLabel) passwordLabel.hidden = false;
      if (passwordInput) passwordInput.required = true;
      if (confirmLabel) confirmLabel.hidden = false;
      if (confirmInput) confirmInput.required = true;
      if (loginOptions) loginOptions.hidden = true;
      if (forgotActions) forgotActions.hidden = true;
      if (authDivider) authDivider.hidden = false;
      if (googleBtn) googleBtn.hidden = false;
      if (authSwitch) {
        authSwitch.hidden = false;
        authSwitch.innerHTML = 'Already have an account? <button type="button" data-auth-mode="login">Sign in</button>';
      }
      if (authFootnote) authFootnote.hidden = false;
      if (submitBtn) submitBtn.innerHTML = '<span>Create account</span> <span aria-hidden="true">→</span>';
    } else if (mode === 'forgot') {
      if (eyebrowEl) eyebrowEl.textContent = 'PASSWORD RECOVERY';
      if (titleEl) titleEl.textContent = 'Reset your password';
      if (subtitleEl) subtitleEl.textContent = 'Enter your registered email address to receive a secure password reset link.';
      if (nameLabel) nameLabel.hidden = true;
      if (nameInput) nameInput.required = false;
      if (passwordLabel) passwordLabel.hidden = true;
      if (passwordInput) passwordInput.required = false;
      if (confirmLabel) confirmLabel.hidden = true;
      if (confirmInput) confirmInput.required = false;
      if (loginOptions) loginOptions.hidden = true;
      if (forgotActions) forgotActions.hidden = false;
      if (authDivider) authDivider.hidden = true;
      if (googleBtn) googleBtn.hidden = true;
      if (authSwitch) authSwitch.hidden = true;
      if (authFootnote) authFootnote.hidden = true;
      if (submitBtn) submitBtn.innerHTML = '<span>Send reset link</span> <span aria-hidden="true">→</span>';
    } else {
      mode = 'login';
      if (eyebrowEl) eyebrowEl.textContent = 'WELCOME BACK';
      if (titleEl) titleEl.textContent = 'Sign in to IntelliCore';
      if (subtitleEl) subtitleEl.textContent = 'Access your personal workspace.';
      if (nameLabel) nameLabel.hidden = true;
      if (nameInput) nameInput.required = false;
      if (passwordLabel) passwordLabel.hidden = false;
      if (passwordInput) passwordInput.required = true;
      if (confirmLabel) confirmLabel.hidden = true;
      if (confirmInput) confirmInput.required = false;
      if (loginOptions) loginOptions.hidden = false;
      if (forgotActions) forgotActions.hidden = true;
      if (authDivider) authDivider.hidden = false;
      if (googleBtn) googleBtn.hidden = false;
      if (authSwitch) {
        authSwitch.hidden = false;
        authSwitch.innerHTML = 'New to IntelliCore? <button type="button" data-auth-mode="signup">Create an account</button>';
      }
      if (authFootnote) authFootnote.hidden = false;
      if (submitBtn) submitBtn.innerHTML = '<span>Log in</span> <span aria-hidden="true">→</span>';
    }

    if (verificationPanel) verificationPanel.hidden = true;
  }

  // Pre-fill remembered email
  try {
    const remembered = localStorage.getItem('intelliCore_saved_email');
    if (remembered && emailInput) {
      emailInput.value = remembered;
      if (rememberCheckbox) rememberCheckbox.checked = true;
    }
  } catch {
    // LocalStorage unavailable
  }

  // Password Visibility Toggles
  $('togglePasswordBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!passwordInput) return;
    const isPw = passwordInput.type === 'password';
    passwordInput.type = isPw ? 'text' : 'password';
    $('togglePasswordBtn').textContent = isPw ? '🙈' : '👁';
  });

  $('toggleConfirmBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirmInput) return;
    const isPw = confirmInput.type === 'password';
    confirmInput.type = isPw ? 'text' : 'password';
    $('toggleConfirmBtn').textContent = isPw ? '🙈' : '👁';
  });

  // Handle Tab Switching
  tabsContainer?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-auth-mode]');
    if (btn) {
      setMode(btn.dataset.authMode);
    }
  });

  // Switch links inside form
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-auth-mode]');
    if (btn && btn !== tabsContainer) {
      e.preventDefault();
      setMode(btn.dataset.authMode);
    }
  });

  // Forgot password triggers
  forgotPasswordBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    setMode('forgot');
    emailInput?.focus();
  });

  backToLoginBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    setMode('login');
  });

  // Form Submission
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;
    const name = nameInput?.value.trim();
    const confirm = confirmInput?.value;

    if (!email) {
      setMessage('Please enter your email address.', 'error');
      emailInput?.focus();
      return;
    }

    if (mode === 'forgot') {
      setLoading(true, 'Sending link...');
      try {
        await authService.sendPasswordReset(email);
        setMessage(`Password reset instructions sent to ${email}. Check your inbox.`, 'success');
      } catch (err) {
        setMessage(mapAuthError(err), 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password) {
      setMessage('Please enter your password.', 'error');
      passwordInput?.focus();
      return;
    }

    if (mode === 'signup') {
      if (password !== confirm) {
        setMessage('Passwords do not match. Please re-enter.', 'error');
        confirmInput?.focus();
        return;
      }
      if (password.length < 6) {
        setMessage('Password must be at least 6 characters.', 'error');
        passwordInput?.focus();
        return;
      }
    }

    setLoading(true, mode === 'signup' ? 'Creating account...' : 'Signing in...');
    setMessage('');

    try {
      if (mode === 'signup') {
        await authService.registerWithEmail(email, password, name);
        setMessage('Account created! A verification link has been sent to your email. Please check your inbox.', 'success');
        if (verificationPanel) verificationPanel.hidden = false;
      } else {
        const user = await authService.loginWithEmail(email, password);
        
        // Handle remember-me persistence
        if (rememberCheckbox?.checked) {
          localStorage.setItem('intelliCore_saved_email', email);
        } else {
          localStorage.removeItem('intelliCore_saved_email');
        }

        if (user.emailVerified) {
          const context = authService.getContext();
          const route = authService.determineDashboardRoute(context);
          if (route && route !== '/?auth=login') {
            window.location.href = route;
          }
        } else {
          setMessage('Please verify your email address to access your workspace.', 'info');
          if (verificationPanel) verificationPanel.hidden = false;
        }
      }
    } catch (err) {
      console.error('[Auth] Form error:', err);
      setMessage(mapAuthError(err), 'error');
    } finally {
      setLoading(false);
    }
  });

  // Google Sign-In
  googleBtn?.addEventListener('click', async () => {
    if (isSubmitting) return;
    setLoading(true, 'Connecting to Google...');
    setMessage('');

    try {
      await authService.loginWithGoogle();
      setMessage('Verifying workspace authorization...', 'info');

      // 10-second timeout guard to ensure user is never indefinitely stuck
      const authTimeout = setTimeout(() => {
        const ctx = authService.getContext();
        if (!ctx.isAuthenticated) {
          setLoading(false);
          setMessage('Workspace verification timed out. Please retry signing in.', 'error');
        }
      }, 10000);

      const checkAndRedirect = () => {
        const ctx = authService.getContext();
        if (ctx.isAuthenticated) {
          clearTimeout(authTimeout);
          setMessage('Authentication successful! Opening workspace...', 'success');
          const target = authService.determineDashboardRoute(ctx);
          if (target) {
            window.location.href = target;
          }
        }
      };
      checkAndRedirect();
    } catch (err) {
      console.error('[Auth] Google OAuth error:', err);
      setMessage(mapAuthError(err), 'error');
      setLoading(false);
    }
  });

  // Verification Controls (single unified handler, zero duplicate buttons)
  checkVerificationBtn?.addEventListener('click', async () => {
    checkVerificationBtn.disabled = true;
    setMessage('Checking verification status...', 'info');
    try {
      const user = await authService.refreshIdentity();
      if (user && user.emailVerified) {
        setMessage('Email verified! Redirecting to workspace...', 'success');
        const context = authService.getContext();
        const route = authService.determineDashboardRoute(context);
        if (route) window.location.href = route;
      } else {
        setMessage('Your email is still unverified. Please open the link sent to your inbox and try again.', 'info');
      }
    } catch (err) {
      setMessage(mapAuthError(err), 'error');
    } finally {
      checkVerificationBtn.disabled = false;
    }
  });

  resendVerificationBtn?.addEventListener('click', async () => {
    resendVerificationBtn.disabled = true;
    try {
      setMessage('Resending verification email...', 'info');
      await authService.resendVerificationEmail();
      setMessage('Verification email sent! Please check your inbox and spam folder.', 'success');
    } catch (err) {
      setMessage(mapAuthError(err), 'error');
    } finally {
      resendVerificationBtn.disabled = false;
    }
  });

  cancelVerificationBtn?.addEventListener('click', async () => {
    await authService.logout();
    setMode('login');
    setMessage('Signed out.', 'info');
  });

  // Global Auth State Observer & Router
  authService.onAuthStateChanged((context) => {
    const mobileTrigger = $('mobileLoginTrigger');
    if (!context.isAuthenticated) {
      if (loginTrigger) {
        loginTrigger.innerHTML = 'Login <span>↗</span>';
      }
      if (mobileTrigger) {
        mobileTrigger.innerHTML = 'Login to Workspace <span>↗</span>';
      }
      return;
    }

    // User is signed in and synchronized
    const { appUser, status } = context;

    if (!appUser?.emailVerified) {
      setMessage('Verify your email to access your application workspace.', 'info');
      if (verificationPanel) verificationPanel.hidden = false;
      return;
    }

    const attachWorkspaceRedirect = (btn) => {
      if (!btn) return;
      btn.innerHTML = 'Workspace <span>→</span>';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const route = authService.determineDashboardRoute(context);
        if (route) {
          window.location.href = route;
        }
      }, { once: true });
    };

    attachWorkspaceRedirect(loginTrigger);
    attachWorkspaceRedirect(mobileTrigger);

    if (status === 'ACTIVE' || context.workspaces?.onboarding) {
      const targetRoute = authService.determineDashboardRoute(context);
      if (targetRoute && (modal?.classList.contains('is-open') || isSubmitting)) {
        setMessage('Authentication successful! Opening workspace...', 'success');
        window.location.href = targetRoute;
      }
    } else if (status === 'SUSPENDED') {
      setMessage('Your account has been suspended. Operational access is disabled. Please contact support.', 'error');
    } else if (status === 'INACTIVE') {
      setMessage('Your account is currently inactive. Please contact support.', 'error');
    } else {
      setMessage(`Account restricted. Status: ${status}. Please contact support.`, 'error');
    }
  });
})();
