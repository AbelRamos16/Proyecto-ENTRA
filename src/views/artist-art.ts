// Retratos generados para perfiles ficticios. Nunca se asignan a cuentas reales.
const demoArtists=["demo_luna_velaz","demo_nico_sur","demo_amara_sol","demo_teo_bruma","demo_vera_rio","demo_gael_costa","demo_iris_nomada","demo_dante_ambar","demo_mara_cobalto","demo_leo_niebla"];
export function artistPortrait(username:string):number|null {
  const index=demoArtists.indexOf(username);
  if(index>=0)return index;
  return null;
}
