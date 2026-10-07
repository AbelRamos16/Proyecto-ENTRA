import { parseBuffer } from 'music-metadata';
import { ValidationError } from './project.ts';

export type ProjectAudio = { bytes: Uint8Array; name: string; duration: number };
export async function validateAudio(file: File): Promise<ProjectAudio> {
  if (!/\.mp3$/i.test(file.name) || file.size > 10 * 1024 * 1024) throw new ValidationError('Adjunta un MP3 de hasta 10 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const { format } = await parseBuffer(bytes, { mimeType: 'audio/mpeg', size: bytes.length }, { duration: true });
    if (format.codec !== 'MPEG 1 Layer 3' && format.codec !== 'MPEG 2 Layer 3' && format.codec !== 'MPEG 2.5 Layer 3') throw new Error('Formato incompatible');
    if (!format.duration || !Number.isFinite(format.duration)) throw new Error('Duración no válida');
    return { bytes, name: file.name.slice(0, 160), duration: format.duration };
  } catch { throw new ValidationError('No se pudo leer el MP3. Adjunta un archivo de audio válido.'); }
}
