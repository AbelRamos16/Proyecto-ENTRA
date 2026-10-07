function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

export function authView(error = '', register = false, username = '', token = '', registered = false): string {
  const title = register ? 'Crear cuenta' : 'Iniciar sesión';
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} · ENTRA</title>
  <link rel="icon" type="image/svg+xml" href="/brand/entra-isotipo.svg">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <div class="app-shell">
    <header class="masthead">
      <a class="masthead__brand" href="/login" aria-label="ENTRA">
        <img
          src="/brand/entra-logo-vertical.svg"
          alt="ENTRA"
          width="2000"
          height="2200"
        >
      </a>
    </header>

    <main class="workspace">
      <section class="heading">
        <div>
          <p class="eyebrow">ESTUDIO DE COLABORACIÓN</p>
          <h1>${title}</h1>
          <p class="muted">
            ${register ? 'Tu próxima colaboración empieza aquí.' : 'Accede a tus proyectos musicales.'}
          </p>
        </div>
      </section>

      ${
        error
          ? `<p class="notice notice--error" role="alert">${escapeHtml(error)}</p>`
          : ''
      }

      ${registered ? '<p class="notice" role="status">Cuenta creada. Ya puedes iniciar sesión.</p>' : ''}<form class="project-form" method="post" action="${register ? '/register' : '/login'}">${register ? `<input type="hidden" name="csrf" value="${escapeHtml(token)}">` : ''}
        <div class="project-form__grid">
          <label class="field field--wide">
            Usuario
            <input
              name="username"
              type="text"
              required
              autocomplete="username"
              maxlength="40" value="${escapeHtml(username)}" ${register ? 'minlength="3" pattern="[A-Za-z0-9_]{3,40}"' : ''}
              placeholder="Ingresa tu usuario"
            >
          </label>

          <label class="field field--wide">
            Contraseña
            <input
              name="password" ${register ? 'data-register-password aria-describedby="password-feedback"' : ''}
              type="password"
              required
              autocomplete="${register ? 'new-password' : 'current-password'}" ${register ? 'minlength="8"' : ''}
              maxlength="${register ? 64 : 120}"
              placeholder="Ingresa tu contraseña"
            >
          </label>
          ${register ? `<ul class="password-feedback" id="password-feedback" data-password-feedback hidden><li class="password-feedback__item" data-rule="length"><span data-indicator aria-hidden="true">○</span><span><span class="password-feedback__state" data-rule-state>Falta: </span>8–64 caracteres</span></li><li class="password-feedback__item" data-rule="uppercase"><span data-indicator aria-hidden="true">○</span><span><span class="password-feedback__state" data-rule-state>Falta: </span>Una mayúscula</span></li><li class="password-feedback__item" data-rule="lowercase"><span data-indicator aria-hidden="true">○</span><span><span class="password-feedback__state" data-rule-state>Falta: </span>Una minúscula</span></li><li class="password-feedback__item" data-rule="number"><span data-indicator aria-hidden="true">○</span><span><span class="password-feedback__state" data-rule-state>Falta: </span>Un número</span></li><li class="password-feedback__item" data-rule="symbol"><span data-indicator aria-hidden="true">○</span><span><span class="password-feedback__state" data-rule-state>Falta: </span>Un símbolo</span></li></ul>` : ''}
          ${register ? `<label class="field field--wide">
            Confirmar contraseña
            <input name="confirmPassword" type="password" required minlength="8" maxlength="${register ? 64 : 120}" autocomplete="new-password" placeholder="Repite tu contraseña">
          </label>` : ''}
        </div>

        <div class="project-form__actions">
          <button class="button button--primary" type="submit">
            ${title}
          </button>
        </div>
      </form><p class="auth-switch">${register ? '¿Ya tienes cuenta? <a href="/login">Iniciar sesión</a>' : '¿Eres nuevo? <a href="/register">Crear una cuenta</a>'}</p>
    </main>

    <footer class="app-footer">
      <span>Hecho para hacer música.</span>
      <span>ENTRA / Estudio de colaboración</span>
    </footer>
  </div>
${register ? '<script type="module" src="/password-feedback.js"></script>' : ''}
</body>
</html>`;
}



