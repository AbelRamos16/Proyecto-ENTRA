{
  const instrument = document.querySelector<HTMLSelectElement>('[data-catalog="instrument"]');
  const collaboration = document.querySelector<HTMLSelectElement>('[data-catalog="collaboration"]');
  if (instrument && collaboration) {
    const choices = Array.from(collaboration.options).slice(1).map(option => option.cloneNode(true) as HTMLOptionElement);
    const update = () => {
      const previous = collaboration.value;
      collaboration.replaceChildren(new Option('Seleccionar tipo de colaboración', ''));
      for (const option of choices.filter(o => o.dataset.parent === instrument.value)) collaboration.add(option.cloneNode(true) as HTMLOptionElement);
      collaboration.value = Array.from(collaboration.options).some(o => o.value === previous) ? previous : '';
      collaboration.disabled = !instrument.value;
    };
    instrument.addEventListener('change', update);
    update();
  }
}
