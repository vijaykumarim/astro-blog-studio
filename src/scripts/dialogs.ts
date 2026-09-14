type Options = { title: string; message: string; accept?: string; label?: string; value?: string };
function ask(options: Options): Promise<string | null> {
  const dialog = document.querySelector<HTMLDialogElement>('#app-dialog');
  if (!dialog || dialog.open) return Promise.resolve(null);
  const input = dialog.querySelector<HTMLInputElement>('#app-dialog-input')!;
  dialog.querySelector('#app-dialog-title')!.textContent = options.title;
  dialog.querySelector('#app-dialog-message')!.textContent = options.message;
  dialog.querySelector('#app-dialog-accept')!.textContent = options.accept || 'Continue';
  dialog.querySelector<HTMLElement>('#app-dialog-field')!.hidden = !options.label;
  dialog.querySelector('#app-dialog-label')!.textContent = options.label || '';
  input.value = options.value || '';
  input.required = !!options.label;
  input.disabled = !options.label;
  dialog.returnValue = 'cancel';
  return new Promise((resolve) => {
    const cancel = () => dialog.close('cancel');
    const button = dialog.querySelector<HTMLButtonElement>('[data-app-cancel]')!;
    button.addEventListener('click', cancel);
    dialog.addEventListener(
      'close',
      () => {
        button.removeEventListener('click', cancel);
        resolve(dialog.returnValue === 'accept' ? input.value : null);
      },
      { once: true },
    );
    dialog.showModal();
    (options.label ? input : button).focus();
  });
}
export async function confirmAction(options: Options) {
  return (await ask(options)) !== null;
}
export async function requestText(options: Options) {
  return ask(options);
}
