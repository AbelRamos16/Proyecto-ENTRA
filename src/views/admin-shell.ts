import { layout, escapeHtml as e } from './layout.ts';
export type AdminSection = 'catalogs' | 'artists' | 'projects';
export function adminLayout(content: string, token: string, section: AdminSection) {
  const tabs: [AdminSection, string, string][] = [
    ['catalogs', '/admin', 'Catálogos'],
    ['artists', '/admin/artists', 'Artistas'],
    ['projects', '/admin/projects', 'Proyectos'],
  ];
  return layout(`<nav class="admin-nav" aria-label="Administración">${tabs.map(([key, href, label]) => `<a class="admin-nav__link ${key === section ? 'admin-nav__link--active' : ''}" href="${href}" ${key === section ? 'aria-current="page"' : ''}>${e(label)}</a>`).join('')}</nav>${content}`, token, 'admin', 'superadmin');
}
