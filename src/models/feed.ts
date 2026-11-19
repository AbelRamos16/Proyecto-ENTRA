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
export type DiscoverFilters={genre:number|null;instrument:number|null;min:number;max:number;state:string|null;query:string};
export function parseDiscoverFilters(params:URLSearchParams):DiscoverFilters|undefined{
 if(!['genre','instrument','min','max','state','q'].some(k=>params.get(k)))return undefined;
 const option=(key:string)=>{const text=params.get(key);if(!text)return null;const n=Number(text);if(!/^[1-9]\d*$/.test(text)||!Number.isSafeInteger(n))throw new ValidationError('Filtro inválido.');return n;};
 const min=Number(params.get('min')||40),max=Number(params.get('max')||240),state=params.get('state')||null,query=(params.get('q')||'').trim();
 if(!Number.isInteger(min)||!Number.isInteger(max)||min<40||max>240||min>max||query.length>80||state&&!['Buscando colaboración','En producción','Finalizado'].includes(state))throw new ValidationError('Revisa los filtros de búsqueda.');
 return {genre:option('genre'),instrument:option('instrument'),min,max,state,query};
}
export class FeedModel {
  async list(cursor: string | null = null, filters?:DiscoverFilters): Promise<FeedPage> {
    const before = parseFeedCursor(cursor);
    const args={p_before_time:before?.time??null,p_before_id:before?.id??null,p_limit:FEED_PAGE_SIZE+1};
    const {data,error}=filters?await supabaseAdmin.rpc('entra_discover_page',{...args,p_genre:filters.genre,p_instrument:filters.instrument,p_min:filters.min,p_max:filters.max,p_state:filters.state,p_query:filters.query}):await supabaseAdmin.rpc('entra_feed_page',args);
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
    const { data, error } = await supabaseAdmin.from('projects').select('audio_bytes').eq('id',id).eq('publication_status','published').eq('moderation_hidden',false).maybeSingle();
    if (error) throw new Error('No se pudo consultar el audio publicado: '+error.message);
    if (!data?.audio_bytes) return undefined;
    const value = data.audio_bytes;
    if (value instanceof Uint8Array) return value;
    if (typeof value !== 'string' || !/^\\x(?:[0-9a-f]{2})+$/i.test(value)) throw new Error('Audio publicado inválido.');
    return new Uint8Array(Buffer.from(value.slice(2),'hex'));
  }
}
