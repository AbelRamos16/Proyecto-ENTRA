import { CatalogModel } from '../src/models/catalog.ts';
export async function catalogFields() {
 const items=await new CatalogModel().list();
 const genre=items.find(i=>i.kind==='genre' && i.active);
 const instrument=items.find(i=>i.kind==='instrument' && i.active && items.some(c=>c.kind==='collaboration' && c.active && c.parent_id===i.id));
 const collaboration=items.find(i=>i.kind==='collaboration' && i.active && i.parent_id===instrument?.id);
 if(!genre || !instrument || !collaboration) throw new Error('Ejecuta la migración y configura catálogos activos antes de las pruebas de integración.');
 return {genreId:String(genre.id),instrumentId:String(instrument.id),collaborationId:String(collaboration.id)};
}
