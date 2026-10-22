(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const modal = $('loginModal');
  if (!modal) return;
  const form = $('icAuthForm');
  const msg = $('icAuthMessage');
  const tabs = [...document.querySelectorAll('[data-auth-mode]')];
  let mode = 'login';

  function openModal() {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ic-modal-open');
    $('icDashboardPanel').hidden = true;
    $('icAuthFormPanel').hidden = false;
    window.setTimeout(() => $('icAuthEmail')?.focus(), 80);
  }
  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ic-modal-open');
  }
  function setMode(nextMode) {
    mode = nextMode === 'signup' ? 'signup' : 'login';
    $('icAuthTabs').hidden = false;
    $('icAuthFormPanel').hidden = false;
    $('icDashboardPanel').hidden = true;
    $('icAuthTitle').textContent = mode === 'signup' ? 'Create your IntelliCore account' : 'Sign in to IntelliCore';
    $('icAuthSubtitle').textContent = mode === 'signup' ? 'Create your workspace to get started.' : 'Access your personal workspace.';
    $('icAuthSubmit').innerHTML = mode === 'signup' ? 'Create account <span>→</span>' : 'Log in <span>→</span>';
    $('icNameLabel').hidden = mode !== 'signup';
    $('icConfirmLabel').hidden = mode !== 'signup';
    $('icLoginOptions').hidden = mode !== 'login';
    $('icAuthPassword').autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
    $('icAuthConfirm').required = mode === 'signup';
    $('icAuthName').required = mode === 'signup';
    $('icGoogleSignIn').innerHTML = '<span class="ic-google-g">G</span> Continue with Google';
    $('icAuthSwitch').innerHTML = mode === 'signup'
      ? 'Already have an account? <button type="button" data-auth-mode="login">Log in</button>'
      : 'New to IntelliCore? <button type="button" data-auth-mode="signup">Create an account</button>';
    tabs.forEach(btn => btn.classList.toggle('active', btn.dataset.authMode === mode));
    msg.textContent = '';
  }
  function showDashboard(name, email) {
    $('icAuthFormPanel').hidden = true;
    $('icAuthTabs').hidden = true;
    $('icDashboardPanel').hidden = false;
    $('icDashboardName').textContent = name || (email ? email.split('@')[0] : 'there');
    $('icDashboardDetail').textContent = 'Demo workspace opened. No account was verified and no records were saved. Connect Firebase Authentication and a database to enable real personal data.';
  }

  $('loginTrigger')?.addEventListener('click', openModal);
  $('closeLoginModal')?.addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal(); });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-auth-mode]');
    if (button) { event.preventDefault(); setMode(button.dataset.authMode); }
  });
  $('icForgotPassword')?.addEventListener('click', () => {
    msg.textContent = 'Password reset will be available after a secure authentication provider is connected.';
  });
  $('icGoogleSignIn')?.addEventListener('click', () => {
    msg.textContent = 'Google sign-in needs Firebase / Google OAuth configuration before it can authenticate accounts.';
  });
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = $('icAuthEmail').value.trim();
    const password = $('icAuthPassword').value;
    if (!email || password.length < 6) {
      msg.textContent = 'Enter a valid email and a password with at least 6 characters.';
      return;
    }
    if (mode === 'signup') {
      const name = $('icAuthName').value.trim();
      if (!name) { msg.textContent = 'Enter your full name.'; return; }
      if (password !== $('icAuthConfirm').value) { msg.textContent = 'Passwords do not match.'; return; }
      msg.textContent = '';
      showDashboard(name, email);
    } else {
      msg.textContent = '';
      showDashboard('', email);
    }
  });
  $('icLogoutBtn')?.addEventListener('click', () => {
    setMode('login');
    $('icAuthEmail').value = '';
    $('icAuthPassword').value = '';
    $('icAuthName').value = '';
    $('icAuthConfirm').value = '';
    msg.textContent = 'Demo session ended.';
  });
  document.querySelectorAll('[data-dash-view]').forEach(button => button.addEventListener('click', () => {
    $('icDashboardDetail').textContent = button.dataset.dashView + ': this section is ready for integration. Real records will appear when authentication and the database are connected.';
  }));
  setMode('login');
})();
