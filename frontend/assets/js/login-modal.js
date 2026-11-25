/* Keep the login dialog usable even if Firebase's module CDN fails to load. */
(() => {
  const $ = id => document.getElementById(id);
  const modal = $('loginModal');
  if (!modal) return;

  const script = document.currentScript.src;
  // The repository-root Pages site serves the public homepage from the frontend directory.
  const home = new URL('../../', script);
  if (home.pathname.endsWith('/frontend/')) {
    $('loginTrigger')?.remove();
    modal.remove();
    return;
  }

  function openModal() {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('ic-modal-open');
    const formPanel = $('icAuthFormPanel');
    if (formPanel) formPanel.hidden = false;
    $('icAuthEmail')?.focus({ preventScroll: true });
  }
  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('ic-modal-open');
  }
  $('loginTrigger')?.addEventListener('click', event => {
    event.preventDefault();
    openModal();
  });
  $('closeLoginModal')?.addEventListener('click', closeModal);
  modal.addEventListener('click', event => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
  });
  if (new URLSearchParams(window.location.search).get('auth') === 'login') openModal();
  import(new URL('./auth.js?v=20261028-google-mobile-redirect', script).href).catch((error) => {
    console.error('IntelliCore workspace sign-in could not load.', error);
  });
})();
