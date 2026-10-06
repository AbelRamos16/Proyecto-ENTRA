import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const genres = ['Alternativo', 'Electrónica', 'Hip hop', 'Indie', 'Pop', 'Rock'];
export const statuses = ['Borrador', 'Buscando colaboración', 'En producción', 'Finalizado'];
export type ProjectInput = { title: string; genre: string; bpm: number; musicalKey: string; need: string; description: string; status: string };
export type Project = ProjectInput & { id: number; updatedAt: string };
export class ValidationError extends Error {}

export function validateProject(fields: URLSearchParams): ProjectInput {
  const value = (key: string) => (fields.get(key) ?? '').trim();
  const project = { title: value('title'), genre: value('genre'), bpm: Number(value('bpm')), musicalKey: value('musicalKey'), need: value('need'), description: value('description'), status: value('status') };
  if (project.title.length < 3 || project.title.length > 80) throw new ValidationError('El título debe tener entre 3 y 80 caracteres.');
  if (!genres.includes(project.genre) || !statuses.includes(project.status)) throw new ValidationError('Selecciona un género y un estado válidos.');
  if (!Number.isInteger(project.bpm) || project.bpm < 40 || project.bpm > 240) throw new ValidationError('El tempo debe ser un número entero entre 40 y 240 BPM.');
  if (project.musicalKey.length > 20 || project.need.length < 3 || project.need.length > 120 || project.description.length > 1000) throw new ValidationError('Revisa la tonalidad, la colaboración solicitada y la descripción.');
  return project;
}

export class ProjectModel {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, title TEXT NOT NULL, genre TEXT NOT NULL, bpm INTEGER NOT NULL, musicalKey TEXT NOT NULL, need TEXT NOT NULL, description TEXT NOT NULL, status TEXT NOT NULL, updatedAt TEXT NOT NULL)`);
  }
  list(): Project[] { return this.db.prepare('SELECT * FROM projects ORDER BY updatedAt DESC, id DESC').all() as Project[]; }
  find(id: number): Project | undefined { return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | undefined; }
  create(project: ProjectInput): number {
    return Number(this.db.prepare('INSERT INTO projects (title, genre, bpm, musicalKey, need, description, status, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(...this.values(project)).lastInsertRowid);
  }
  update(id: number, project: ProjectInput): void {
    this.db.prepare('UPDATE projects SET title=?, genre=?, bpm=?, musicalKey=?, need=?, description=?, status=?, updatedAt=? WHERE id=?').run(...this.values(project), id);
  }
  delete(id: number): void { this.db.prepare('DELETE FROM projects WHERE id=?').run(id); }
  private values(project: ProjectInput): (string | number)[] { return [project.title, project.genre, project.bpm, project.musicalKey, project.need, project.description, project.status, new Date().toISOString()]; }
}
