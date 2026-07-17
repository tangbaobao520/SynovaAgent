/**
 * app/js/shell.js — Shared Navigation Shell (D96 v1.1)
 *
 * Renders common header on every page.
 * Auto-injected into `<header id="synova-shell">` element.
 *
 * Usage in any page:
 *   <header id="synova-shell"></header>
 *   <script src="js/shell.js"></script>
 */

(function () {
  const header = document.getElementById('synova-shell');
  if (!header) return;

  const user = typeof getUser === 'function' ? getUser() : null;

  header.innerHTML = `
    <nav class="synova-nav">
      <div class="nav-left">
        <a href="/app/dashboard.html" class="nav-logo">Synova</a>
      </div>
      <div class="nav-center">
        <a href="/app/dashboard.html" class="nav-link">Dashboard</a>
        <a href="/app/reports.html" class="nav-link">Reports</a>
      </div>
      <div class="nav-right">
        <span class="nav-user">${user ? user.userId + ' (' + user.role + ')' : ''}</span>
        <button class="nav-logout" onclick="logout()">Logout</button>
      </div>
    </nav>
  `;
})();
