import { ValidationError } from './project.ts';
import type { Project } from './project.ts';

export function publicationIssues(project: Pick<Project, 'title' | 'genreId' | 'instrumentId' | 'collaborationId' | 'audioName' | 'audioDuration' | 'hookStart' | 'hookEnd'>): string[] {
  const issues: string[] = [];
  if (project.title.trim().length < 3 || project.title.trim().length > 80) issues.push('Añade un título de 3 a 80 caracteres.');
  if (!project.genreId || !project.instrumentId || !project.collaborationId) issues.push('Selecciona género, instrumento y colaboración.');
  if (!project.audioName || !project.audioDuration || !Number.isFinite(project.audioDuration)) issues.push('Adjunta una demo MP3 válida.');
  if (project.hookStart == null || project.hookEnd == null || !Number.isFinite(project.hookStart) || !Number.isFinite(project.hookEnd) || project.hookStart < 0 || project.hookEnd <= project.hookStart || project.hookEnd > (project.audioDuration ?? 0)) issues.push('Marca un hook dentro de la demo.');
  return issues;
}
export function requirePublishable(project: Parameters<typeof publicationIssues>[0]) {
  const issues = publicationIssues(project);
  if (issues.length) throw new ValidationError(issues.join(' '));
}
