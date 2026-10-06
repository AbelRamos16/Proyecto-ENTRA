const welcome = document.querySelector<HTMLDialogElement>('#welcome');

if (welcome) {
  const next = welcome.querySelector<HTMLButtonElement>('[data-next]')!;
  const skip = welcome.querySelector<HTMLButtonElement>('[data-skip]')!;
  const title = welcome.querySelector<HTMLElement>('#welcome-title')!;
  const description = welcome.querySelector<HTMLElement>('[data-description]')!;
  const progress = welcome.querySelector<HTMLElement>('[data-progress]')!;
  const steps = [
    { title: '¿Qué le falta a tu canción?', description: 'Encuentra tu siguiente pieza.' },
    { title: 'Una voz. Un bajo. Otra mirada.', description: 'La música se hace en compañía.' },
    { title: 'Dale un lugar a tu idea.', description: 'Ponle nombre y dinos qué buscas.' },
  ];
  let step = 0;
  function render() {
    title.textContent = steps[step].title;
    description.textContent = steps[step].description;
    progress.textContent = `${step + 1} / ${steps.length}`;
    next.textContent = step === steps.length - 1 ? 'Crear mi proyecto' : 'Siguiente';
    welcome!.dataset.step = String(step);
  }
  function close() {
    welcome!.close();
    document.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
  }
  function open() { step = 0; render(); welcome!.showModal(); }
  next.addEventListener('click', () => { if (step === steps.length - 1) close(); else { step++; render(); } });
  skip.addEventListener('click', close);
  welcome.addEventListener('cancel', event => { event.preventDefault(); close(); });
  if (!document.querySelector('[role="alert"]')) open();
}
