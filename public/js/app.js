// KickPact – Global JS

// Auto-hide alerts after 5 seconds
document.querySelectorAll('.alert-success').forEach(el => {
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; }, 5000);
});

// Confirm dangerous actions
document.querySelectorAll('[data-confirm]').forEach(btn => {
  btn.addEventListener('click', e => {
    if (!confirm(btn.dataset.confirm)) e.preventDefault();
  });
});
