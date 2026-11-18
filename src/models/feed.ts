import { supabaseAdmin } from '../config/supabase.ts';
import { ValidationError } from './project.ts';
export const FEED_PAGE_SIZE = 8;
export type FeedItem = {
  id: number; title: string; genre: string; bpm: number; musical_key: string; need: string;
  owner_id: string; username: string; artist_name: string; hook_start: number; hook_end: number; published_at: string;
};
export type FeedPage = { items: FeedItem[]; nextCursor: string | null };
type Cursor = { time: string; id: number };
export function parseFeedCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    if (value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error();
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString());
    if (typeof cursor.time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(cursor.time) || !Number.isFinite(Date.parse(cursor.time)) || !Number.isSafeInteger(cursor.id) || cursor.id <= 0) throw new Error();
    if (new Date(cursor.time).toISOString().slice(0,19) !== cursor.time.slice(0,19)) throw new Error();
    return { time: cursor.time, id: cursor.id };
  } catch { throw new ValidationError('La página del feed no es válida.'); }
}
export class FeedModel {
  async list(cursor: string | null = null): Promise<FeedPage> {
    const before = parseFeedCursor(cursor);
    const { data, error } = await supabaseAdmin.rpc('entra_feed_page', { p_before_time: before?.time ?? null, p_before_id: before?.id ?? null, p_limit: FEED_PAGE_SIZE + 1 });
    if (error) throw new Error('No se pudo cargar el feed. Ejecuta 20261117_feed_publication.sql. '+error.message);
    const rows = (data ?? []) as FeedItem[];
    const items = rows.slice(0, FEED_PAGE_SIZE);
    const last = items.at(-1);
    const nextCursor = rows.length > FEED_PAGE_SIZE && last ? Buffer.from(JSON.stringify({time:last.published_at,id:last.id})).toString('base64url') : null;
    return {items, nextCursor};
  }
  async audio(id: number): Promise<Uint8Array | undefined> {
    if (!Number.isSafeInteger(id) || id <= 0) return undefined;
    // Esta consulta nunca amplía los permisos del CRUD privado.
    const { data, error } = await supabaseAdmin.from('projects').select('audio_bytes').eq('id',id).eq('publication_status','published').maybeSingle();
    if (error) throw new Error('No se pudo consultar el audio publicado: '+error.message);
    if (!data?.audio_bytes) return undefined;
    const value = data.audio_bytes;
    if (value instanceof Uint8Array) return value;
    if (typeof value !== 'string' || !/^\\x(?:[0-9a-f]{2})+$/i.test(value)) throw new Error('Audio publicado inválido.');
    return new Uint8Array(Buffer.from(value.slice(2),'hex'));
  }
}
