
import { escapeHtml as e } from './layout.ts';
import { adminLayout } from './admin-shell.ts';
import type { AdminUser, ArtistProfile } from '../models/admin.ts';
import type { Project } from '../models/project.ts';

export function adminProjectList(
  projects: Project[],
  artists: ArtistProfile[]
) {
  const names = new Map(
    artists.map(a => [a.id, a.display_name || a.username])
  );

  return `<div class="admin-records">
    ${projects.map(p => `
      <article class="admin-records__item">
        <div>
          <p class="eyebrow">${e(p.genre)} · ${p.bpm} BPM</p>
          <h2><a href="/admin/projects/${p.id}">${e(p.title)}</a></h2>
          <p class="muted">
            ${e(names.get(p.ownerId) ?? 'Cuenta administrativa')} · ${e(p.status)}
          </p>
          <p>${e(p.need)}</p>
        </div>
        <div class="admin-records__actions">
          <a class="button" href="/admin/projects/${p.id}">Revisar</a>
          <a class="button button--primary" href="/admin/projects/${p.id}/edit">Editar</a>
          <a class="button button--danger" href="/admin/projects/${p.id}/delete">Eliminar</a>
        </div>
      </article>
    `).join('') || '<p class="empty">No hay proyectos para mostrar.</p>'}
  </div>`;
}

export function artistsView(
  artists: ArtistProfile[],
  projects: Project[],
  token: string,
  query = ''
) {
  const filtered = artists.filter(a =>
    `${a.username} ${a.display_name ?? ''}`
      .toLocaleLowerCase('es')
      .includes(query.toLocaleLowerCase('es'))
  );

  return adminLayout(`
    <section class="heading">
      <div>
        <p class="eyebrow">ARTISTAS</p>
        <h1>Quienes crean</h1>
        <p class="muted">Edita perfiles y revisa sus proyectos musicales.</p>
      </div>
    </section>

    <form class="admin-filter" method="get" action="/admin/artists">
      <label class="field">
        Buscar artista
        <input
          type="search"
          name="q"
          maxlength="80"
          value="${e(query)}"
          placeholder="Nombre artístico o usuario"
        >
      </label>
      <button class="button" type="submit">Buscar</button>
    </form>

    <div class="admin-records">
      ${filtered.map(a => `
        <article class="admin-records__item">
          <div>
            <h2>
              <a href="/admin/artists/${a.id}">
                ${e(a.display_name || a.username)}
              </a>
            </h2>
            <p class="muted">
              @${e(a.username)} ·
              ${projects.filter(p => p.ownerId === a.id).length} proyectos
            </p>
            <p class="admin-records__bio">
              ${e(a.bio || 'Sin biografía todavía.')}
            </p>
          </div>
          <a class="button button--primary" href="/admin/artists/${a.id}">
            Editar perfil y ver proyectos
          </a>
        </article>
      `).join('') || '<p class="empty">No se encontraron artistas.</p>'}
    </div>
  `, token, 'artists');
}

export function artistView(
  artist: ArtistProfile,
  projects: Project[],
  token: string,
  message = '',
  error = false,
  fields?: URLSearchParams
) {
  return adminLayout(`
    <a class="back" href="/admin/artists">← Volver a artistas</a>

    <section class="heading">
      <div>
        <p class="eyebrow">PERFIL DEL ARTISTA</p>
        <h1>${e(artist.display_name || artist.username)}</h1>
        <p class="muted">@${e(artist.username)}</p>
      </div>
    </section>

    ${message ? `
      <p class="notice ${error ? 'notice--error' : ''}"
         role="${error ? 'alert' : 'status'}">
        ${e(message)}
      </p>
    ` : ''}

    <form class="project-form" method="post"
          action="/admin/artists/${artist.id}">
      <input type="hidden" name="csrf" value="${e(token)}">

      <div class="project-form__grid">
        <label class="field field--wide">
          Nombre artístico
          <input
            name="displayName"
            required
            minlength="2"
            maxlength="60"
            value="${e(fields?.get('displayName') ?? artist.display_name ?? artist.username)}"
          >
        </label>

        <label class="field field--wide">
          Biografía <span class="muted">(opcional)</span>
          <textarea name="bio" maxlength="500" rows="4"
            placeholder="Su sonido, sus influencias, su historia…">${e(fields?.get('bio') ?? artist.bio ?? '')}</textarea>
          <span class="muted">Hasta 500 caracteres.</span>
        </label>
      </div>

      <div class="project-form__actions">
        <a class="button" href="/admin/artists">Cancelar</a>
        <button class="button button--primary" type="submit">
          Guardar perfil
        </button>
      </div>
    </form>

    <section class="collection">
      <div class="collection__heading">
        <h2>Proyectos del artista</h2>
        <span class="badge">${projects.length} proyectos</span>
      </div>
      ${adminProjectList(projects, [artist])}
    </section>
  `, token, 'artists');
}

export function adminProjectsView(
  projects: Project[],
  artists: ArtistProfile[],
  token: string,
  owner = '',
  message = ''
) {
  return adminLayout(`
    <section class="heading">
      <div>
        <p class="eyebrow">PROYECTOS</p>
        <h1>Lo que están creando</h1>
        <p class="muted">Revisa las demos y gestiona las publicaciones.</p>
      </div>
    </section>

    ${message ? `<p class="notice" role="status">${e(message)}</p>` : ''}

    <form class="admin-filter" method="get" action="/admin/projects">
      <label class="field">
        Artista
        <select name="artist">
          <option value="">Todos los artistas</option>
          ${artists.map(a => `
            <option value="${a.id}" ${owner === a.id ? 'selected' : ''}>
              ${e(a.display_name || a.username)} (@${e(a.username)})
            </option>
          `).join('')}
        </select>
      </label>
      <button class="button" type="submit">Filtrar proyectos</button>
    </form>

    ${adminProjectList(projects, artists)}
  `, token, 'projects');
}

// Nueva vista de administración de usuarios.
export function adminUsersView(
  users: AdminUser[],
  token: string,
  currentUserId: string,
  message = '',
  error = false
) {
  return adminLayout(`
    <section class="heading">
      <div>
        <p class="eyebrow">CUENTAS</p>
        <h1>Administración de usuarios</h1>
        <p class="muted">
          Consulta las cuentas y asigna permisos de usuario o superadministrador.
        </p>
      </div>
    </section>

    ${message ? `
      <p class="notice ${error ? 'notice--error' : ''}"
         role="${error ? 'alert' : 'status'}">
        ${e(message)}
      </p>
    ` : ''}

    <p class="muted">
      Los cambios se aplican al siguiente acceso a una página.
      No puedes modificar tu propio rol y ENTRA siempre conservará
      al menos un superadministrador.
    </p>

    <div class="admin-records">
      ${users.map(account => {
        const isCurrent = account.id === currentUserId;
        const roleLabel = account.role === 'superadmin'
          ? 'Superadministrador'
          : 'Usuario';

        return `
          <article class="admin-records__item">
            <div>
              <h2>${e(account.display_name || account.username)}</h2>
              <p class="muted">
                @${e(account.username)} · ${roleLabel}
                ${isCurrent ? ' · Tu cuenta' : ''}
              </p>
            </div>

            <form class="admin-records__actions"
                  method="post"
                  action="/admin/users/${account.id}/role">

              <input type="hidden" name="csrf" value="${e(token)}">

              <label class="field">
                Rol
                <select name="role" ${isCurrent ? 'disabled' : ''}>
                  <option value="user"
                    ${account.role === 'user' ? 'selected' : ''}>
                    Usuario
                  </option>
                  <option value="superadmin"
                    ${account.role === 'superadmin' ? 'selected' : ''}>
                    Superadministrador
                  </option>
                </select>
              </label>

              <button
                class="button button--primary"
                type="submit"
                ${isCurrent ? 'disabled' : ''}
              >
                Guardar rol
              </button>
            </form>
          </article>
        `;
      }).join('') || '<p class="empty">No hay cuentas registradas.</p>'}
    </div>
  `, token, 'users');
}
