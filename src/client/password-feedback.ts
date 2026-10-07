const passwordField = document.querySelector<HTMLInputElement>('[data-register-password]');
const feedback = document.querySelector<HTMLElement>('[data-password-feedback]');
const rules: Record<string, (value: string) => boolean> = {
  length: value => value.length >= 8 && value.length <= 64,
  uppercase: value => /[A-Z]/.test(value),
  lowercase: value => /[a-z]/.test(value),
  number: value => /[0-9]/.test(value),
  symbol: value => /[^A-Za-z0-9\s]/.test(value),
};
if (passwordField && feedback) {
  const update = () => {
    feedback.hidden = passwordField.value.length === 0;
    for (const item of feedback.querySelectorAll<HTMLElement>('[data-rule]')) {
      const met = rules[item.dataset.rule!](passwordField.value);
      item.classList.toggle('password-feedback__item--met', met);
      item.querySelector<HTMLElement>('[data-indicator]')!.textContent = met ? '✓' : '○';
      item.querySelector<HTMLElement>('[data-rule-state]')!.textContent = met ? 'Cumplido: ' : 'Falta: ';
    }
  };
  passwordField.addEventListener('input', update);
  update();
}
