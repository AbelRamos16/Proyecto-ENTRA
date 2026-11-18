export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export const icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;

export function layout(content: string, token: string, section = 'projects', role = '', bodyClass = ''): string {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${section === 'admin' ? 'Administración' : section === 'feed' ? 'Descubrir' : 'Proyectos'} · ENTRA</title>
  <link rel="icon" type="image/svg+xml" href="/brand/entra-isotipo.svg">
  <link rel="stylesheet" href="/styles.css">
  ${section === 'feed' ? '<link rel="stylesheet" href="/feed.css">' : ''}
</head>
<body class="${escapeHtml(bodyClass)}">
  <div class="app-shell">
    <header class="masthead">
      <a class="masthead__brand" href="/projects" aria-label="ENTRA, proyectos">
        <img src="/brand/entra-logo-vertical.svg" alt="ENTRA" width="2000" height="2200">
      </a>

      <nav class="masthead__nav" aria-label="Principal"><a class="masthead__link ${section === 'feed' ? 'masthead__link--active' : ''}" href="/feed">Descubrir</a>
        <a class="masthead__link ${section === 'projects' ? 'masthead__link--active' : ''}" href="/projects">Mis proyectos</a>
        ${role === 'superadmin' ? `<a class="masthead__link ${section === 'admin' ? 'masthead__link--active' : ''}" href="/admin">Administración</a>` : ''}
        <a class="masthead__create" href="/projects/new">
          ${icon}
          <span>Nuevo proyecto</span>
        </a>

        <form class="masthead__logout-form" method="post" action="/logout">
          <input type="hidden" name="csrf" value="${escapeHtml(token)}">
          <button class="masthead__logout" type="submit">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
              aria-hidden="true">
              <path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h12"/>
            </svg>
            <span>Cerrar sesión</span>
          </button>
        </form>
      </nav>
    </header>

    <main class="workspace">${content}</main>

    <footer class="app-footer">
      <span>Hecho para hacer música.</span>
      <span>ENTRA / Estudio de colaboración</span>
    </footer>
  </div>

  <input type="hidden" name="pageToken" value="${escapeHtml(token)}">

  <script type="module" src="/onboarding.js"></script>
  <script type="module" src="/project-audio.js"></script>
<script src="/catalog-selects.js" defer></script>
</body>
</html>`;
}


