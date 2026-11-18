import { supabaseAdmin } from '../config/supabase.ts';
import { ValidationError } from './project.ts';
export const catalogKinds = ['genre', 'instrument', 'collaboration'] as const;
export type CatalogKind = typeof catalogKinds[number];
export type CatalogItem = { id: number; kind: CatalogKind; name: string; parent_id: number | null; active: boolean };
export function validateCatalog(fields: URLSearchParams) {
  const kind = fields.get('kind') as CatalogKind;
  const name = (fields.get('name') ?? '').trim().replace(/\s+/g, ' ');
  const parentId = kind === 'collaboration' ? Number(fields.get('parentId')) : null;
  if (!catalogKinds.includes(kind)) throw new ValidationError('Catálogo inválido.');
  if (name.length < 2 || name.length > 60 || /[<>\x00-\x1f]/.test(name)) throw new ValidationError('El nombre debe tener entre 2 y 60 caracteres, sin etiquetas ni caracteres de control.');
  if (kind === 'collaboration' && (!Number.isSafeInteger(parentId) || Number(parentId) <= 0)) throw new ValidationError('Selecciona un instrumento válido.');
  return { kind, name, parent_id: parentId };
}
export function resolveSelection(items: CatalogItem[], fields: URLSearchParams) {
  const choose = (field: string, kind: CatalogKind) => {
    const id = Number(fields.get(field));
    const item = items.find(i => i.id === id && i.kind === kind && i.active);
    if (!Number.isSafeInteger(id) || !item) throw new ValidationError('Selecciona opciones activas del catálogo.');
    return item;
  };
  const genre = choose('genreId', 'genre');
  const instrument = choose('instrumentId', 'instrument');
  const collaboration = choose('collaborationId', 'collaboration');
  if (collaboration.parent_id !== instrument.id) throw new ValidationError('La colaboración no corresponde al instrumento seleccionado.');
  return { genre, instrument, collaboration };
}
export class CatalogModel {
  async list(): Promise<CatalogItem[]> {
    const { data, error } = await supabaseAdmin.from('entra_catalog_items').select('*').order('name');
    if (error) throw new Error(`Catálogos: ejecuta 20261028_music_catalogs.sql. ${error.message}`);
    return data ?? [];
  }
  async save(fields: URLSearchParams) {
    const input = validateCatalog(fields);
    const items = await this.list();
    if (fields.has('active') && !['true', 'false'].includes(fields.get('active')!)) throw new ValidationError('Disponibilidad inválida.');
    if (input.parent_id && !items.some(i => i.id === input.parent_id && i.kind === 'instrument' && (i.active || fields.get('active') === 'false'))) throw new ValidationError('El instrumento no existe o está inactivo.');
    const idText = fields.get('id');
    const id = Number(idText);
    if (idText && (!Number.isSafeInteger(id) || id <= 0 || !items.some(i => i.id === id && i.kind === input.kind))) throw new ValidationError('La opción no existe.');
    const query = idText ? supabaseAdmin.from('entra_catalog_items').update({ ...input, active: fields.get('active') !== 'false' }).eq('id', id) : supabaseAdmin.from('entra_catalog_items').insert(input);
    const { error } = await query;
    if (error?.code === '23505') throw new ValidationError('Ya existe ese nombre en el catálogo.');
    if (error && ['23514','23503','P0001'].includes(error.code)) throw new ValidationError('Revisa el instrumento: no se permite cambiar la relación de una opción utilizada.');
    if (error) throw new Error(`No se pudo guardar el catálogo: ${error.message}`);
  }
}
