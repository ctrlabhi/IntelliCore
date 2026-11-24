/**
 * IntelliCore Homepage Authentication Controller
 * Version: 2.0.0
 * Architecture: Modular Monolith
 * 
 * Drives the modal login, signup, Google sign-in, and dashboard routing.
 */

import { authService } from '/services/auth.js';

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
  const submitBtn = $('icAuthSubmit');
  const googleBtn = $('icGoogleSignIn');
  const messageEl = $('icAuthMessage');
  const tabsContainer = $('icAuthTabs');
  const titleEl = $('icAuthTitle');
  const subtitleEl = $('icAuthSubtitle');
  const loginTrigger = $('loginTrigger');
  const forgotPasswordBtn = $('icForgotPassword');
  const verificationPanel = $('icVerificationActions');
  const resendVerificationBtn = $('icResendVerification');

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

  function setMode(newMode) {
    mode = newMode;
    setMessage('');

    if (tabsContainer) {
      tabsContainer.querySelectorAll('button').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.authMode === mode);
      });
    }

    if (mode === 'signup') {
      if (titleEl) titleEl.textContent = 'Create your account';
      if (subtitleEl) subtitleEl.textContent = 'Join IntelliCore to start your journey.';
      if (nameLabel) nameLabel.hidden = false;
      if (nameInput) nameInput.required = true;
      if (confirmLabel) confirmLabel.hidden = false;
      if (confirmInput) confirmInput.required = true;
      if (submitBtn) submitBtn.innerHTML = 'Create account <span>→</span>';
      if ($('icLoginOptions')) $('icLoginOptions').hidden = true;
    } else {
      if (titleEl) titleEl.textContent = 'Sign in to IntelliCore';
      if (subtitleEl) subtitleEl.textContent = 'Access your personal workspace.';
      if (nameLabel) nameLabel.hidden = true;
      if (nameInput) nameInput.required = false;
      if (confirmLabel) confirmLabel.hidden = true;
      if (confirmInput) confirmInput.required = false;
      if (submitBtn) submitBtn.innerHTML = 'Log in <span>→</span>';
      if ($('icLoginOptions')) $('icLoginOptions').hidden = false;
    }

    if (verificationPanel) verificationPanel.hidden = true;
  }

  // Handle Tab Switching
  tabsContainer?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-auth-mode]');
    if (btn) {
      setMode(btn.dataset.authMode);
    }
  });

  // Switch links inside form
  document.querySelectorAll('[data-auth-mode]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      setMode(btn.dataset.authMode);
    });
  });

  // Form Submission
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;
    const name = nameInput?.value.trim();
    const confirm = confirmInput?.value;

    if (!email || !password) {
      setMessage('Please enter both email and password.', 'error');
      return;
    }

    if (mode === 'signup') {
      if (password !== confirm) {
        setMessage('Passwords do not match. Please re-enter.', 'error');
        return;
      }
      if (password.length < 6) {
        setMessage('Password must be at least 6 characters.', 'error');
        return;
      }
    }

    isSubmitting = true;
    if (submitBtn) submitBtn.disabled = true;
    setMessage('Processing...', 'info');

    try {
      if (mode === 'signup') {
        await authService.registerWithEmail(email, password, name);
        setMessage('Account created! A verification email has been sent. Please check your inbox.', 'success');
        if (verificationPanel) verificationPanel.hidden = false;
      } else {
        const user = await authService.loginWithEmail(email, password);
        if (user.emailVerified) {
          const context = authService.getContext();
          const route = authService.determineDashboardRoute(context);
          if (route && route !== '/?auth=login') window.location.href = route;
        } else {
          setMessage('Verify your email to access your application.', 'info');
          if (verificationPanel) verificationPanel.hidden = false;
        }
      }
    } catch (err) {
      console.error('[Auth] Form error:', err);
      let userFriendly = err.message;
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        userFriendly = 'Invalid email or password. Please try again.';
      } else if (err.code === 'auth/email-already-in-use') {
        userFriendly = 'This email address is already registered. Please log in.';
      } else if (err.code === 'auth/too-many-requests') {
        userFriendly = 'Too many attempts. Please try again in a few minutes.';
      }
      setMessage(userFriendly, 'error');
    } finally {
      isSubmitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Google Sign-In
  googleBtn?.addEventListener('click', async () => {
    if (isSubmitting) return;
    isSubmitting = true;
    setMessage('Connecting to Google...', 'info');

    try {
      await authService.loginWithGoogle();
      setMessage('Google authentication successful! Redirecting...', 'success');
    } catch (err) {
      console.error('[Auth] Google OAuth error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setMessage('Sign-in canceled. Please try again.', 'info');
      } else if (err.code === 'auth/popup-blocked') {
        setMessage('Pop-up was blocked by your browser. Please allow pop-ups for this site.', 'error');
      } else {
        setMessage(err.message || 'Failed to authenticate with Google.', 'error');
      }
    } finally {
      isSubmitting = false;
    }
  });

  // Forgot Password
  forgotPasswordBtn?.addEventListener('click', async () => {
    const email = emailInput?.value.trim();
    if (!email) {
      setMessage('Please enter your email address above to reset your password.', 'error');
      emailInput?.focus();
      return;
    }

    try {
      setMessage('Sending password reset email...', 'info');
      await authService.sendPasswordReset(email);
      setMessage(`Password reset link sent to ${email}. Check your inbox.`, 'success');
    } catch (err) {
      setMessage(err.message || 'Failed to send password reset email.', 'error');
    }
  });

  // Resend Verification Email
  resendVerificationBtn?.addEventListener('click', async () => {
    try {
      setMessage('Resending verification email...', 'info');
      await authService.resendVerificationEmail();
      setMessage('Verification email sent! Please check your inbox and spam folder.', 'success');
    } catch (err) {
      setMessage(err.message || 'Failed to resend verification email.', 'error');
    }
  });

  // Global Auth State Observer & Router
  if (verificationPanel) {
    const checkVerification = document.createElement('button');
    checkVerification.type = 'button';
    checkVerification.className = resendVerificationBtn?.className || '';
    checkVerification.textContent = 'I verified my email';
    checkVerification.addEventListener('click', async () => {
      checkVerification.disabled = true;
      try {
        const user = await authService.refreshIdentity();
        if (user && !user.emailVerified) setMessage('Your email is still unverified. Open the verification link and try again.', 'info');
      } catch (error) {
        setMessage(error.message, 'error');
      } finally {
        checkVerification.disabled = false;
      }
    });
    verificationPanel.append(checkVerification);
  }

  authService.onAuthStateChanged((context) => {
    if (!context.isAuthenticated) {
      if (loginTrigger) {
        loginTrigger.innerHTML = 'Login <span>↗</span>';
      }
      return;
    }

    // User is signed in and synchronized
    const { appUser, status } = context;

    if (!appUser.emailVerified) {
      setMessage('Verify your email to access your application.', 'info');
      if (verificationPanel) verificationPanel.hidden = false;
      return;
    }

    if (loginTrigger) {
      loginTrigger.innerHTML = 'Workspace <span>→</span>';
      loginTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        const route = authService.determineDashboardRoute(context);
        if (route) {
          window.location.href = route;
        }
      }, { once: true });
    }

    if (status === 'ACTIVE' || context.workspaces.onboarding) {
      const targetRoute = authService.determineDashboardRoute(context);
      if (targetRoute && modal?.classList.contains('is-open')) {
        window.location.href = targetRoute;
      }
    } else {
      setMessage(`Account restricted. Status: ${status}. Please contact support.`, 'error');
    }
  });
})();

