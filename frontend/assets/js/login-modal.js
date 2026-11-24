/* Keep the login dialog usable even if Firebase's module CDN fails to load. */
(() => {
  const $ = id => document.getElementById(id);
  const modal = $('loginModal');
  if (!modal) return;

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
})();
