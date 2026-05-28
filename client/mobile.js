// Mobile drawer toggle. Loaded as <script defer> from index.html.
// Self-contained -- does not touch app.js. Auto-closes the drawer when a
// conversation is picked so the chat view comes forward immediately.
(function () {
  function init() {
    var toggle = document.getElementById('mobileMenuToggle');
    var sidebar = document.querySelector('.sidebar');
    var backdrop = document.getElementById('sidebarBackdrop');
    if (!toggle || !sidebar || !backdrop) return;

    function open() {
      sidebar.classList.add('open');
      backdrop.classList.add('open');
    }
    function close() {
      sidebar.classList.remove('open');
      backdrop.classList.remove('open');
    }
    function toggleDrawer() {
      if (sidebar.classList.contains('open')) close();
      else open();
    }

    toggle.addEventListener('click', toggleDrawer);
    backdrop.addEventListener('click', close);

    // Auto-close on conversation pick (rooms list / DM list / user search result).
    document.addEventListener('click', function (e) {
      if (window.innerWidth > 768) return;
      if (!sidebar.classList.contains('open')) return;
      var t = e.target;
      if (
        t.closest('.rooms-list button') ||
        t.closest('.conversation-list button') ||
        t.closest('#userResults li')
      ) {
        setTimeout(close, 60);
      }
    });

    // Esc closes
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });

    // Resize over the breakpoint -> ensure clean state
    window.addEventListener('resize', function () {
      if (window.innerWidth > 768) close();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
