import { api, toast } from './dashboard';
import { confirmAction } from './dialogs';
const boxes = Array.from(document.querySelectorAll<HTMLInputElement>('[data-post-select]'));
const all = document.querySelector<HTMLInputElement>('[data-select-posts]');
const apply = document.querySelector<HTMLButtonElement>('[data-bulk-apply]');
function update() {
  const selected = boxes.filter((b) => b.checked);
  const visible = boxes.filter((b) => !b.closest<HTMLElement>('[data-post-row]')!.hidden);
  const count = document.querySelector('[data-selection-count]');
  if (count) count.textContent = `${selected.length} selected`;
  if (apply) apply.disabled = !selected.length;
  if (all) {
    all.checked = !!visible.length && visible.every((b) => b.checked);
    all.indeterminate = !!selected.length && !all.checked;
  }
}
boxes.forEach((b) => b.addEventListener('change', update));
all?.addEventListener('change', () => {
  boxes.forEach(
    (b) => (b.checked = !!all.checked && !b.closest<HTMLElement>('[data-post-row]')!.hidden),
  );
  update();
});
document.addEventListener('post-filter-change', () => {
  boxes.forEach((b) => (b.checked = false));
  update();
});
apply?.addEventListener('click', async () => {
  const ids = boxes.filter((b) => b.checked).map((b) => b.value);
  const action = document.querySelector<HTMLSelectElement>('[data-bulk-action]')!.value;
  if (
    !(await confirmAction({
      title: `${action === 'delete' ? 'Delete' : action === 'publish' ? 'Publish' : 'Unpublish'} ${ids.length} posts?`,
      message:
        action === 'delete'
          ? 'Only unpublished drafts can be deleted. This removes them from your post list.'
          : action === 'publish'
            ? 'Publish the latest saved versions of all selected posts together.'
            : 'Remove the selected posts from the website. Saved drafts will remain.',
      accept: 'Continue',
    }))
  )
    return;
  document.querySelector('#bulk-errors')?.remove();
  apply.disabled = true;
  try {
    const result = await api('posts/bulk', 'POST', { ids, action });
    location.assign(result.job ? '/publishing' : '/');
  } catch (error) {
    const issues = (error as Error & {issues?:{id:string,title:string,fields:string[]}[]}).issues;
    if (issues?.length) {
      const panel = document.createElement('section'); panel.id='bulk-errors'; panel.className='panel migration-panel';
      panel.setAttribute('role','alert'); panel.tabIndex=-1;
      const heading=document.createElement('h2'); heading.textContent=(error as Error).message; panel.append(heading);
      for (const issue of issues) {
        const row=document.createElement('p');
        const link=document.createElement('a'); link.href='/posts/'+encodeURIComponent(issue.id); link.textContent=issue.title;
        row.append(link,document.createTextNode(' — '+issue.fields.join(', ')));panel.append(row);
      }
      document.querySelector('.bulk-tools')?.after(panel); panel.focus();
    } else toast((error as Error).message);
    update();
  }
});
