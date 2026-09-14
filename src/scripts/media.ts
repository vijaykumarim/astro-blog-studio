export {};
const drawer=document.querySelector<HTMLDialogElement>('#media-details')!;
const url=drawer.querySelector<HTMLInputElement>('#media-url')!;
const copyStatus=drawer.querySelector<HTMLElement>('[data-media-status]')!;
let opener:HTMLButtonElement|null=null;
document.querySelectorAll<HTMLButtonElement>('[data-media-details]').forEach(button=>button.addEventListener('click',()=>{
  const item=JSON.parse(button.dataset.mediaDetails!);opener=button;
  const img=drawer.querySelector<HTMLImageElement>('.media-detail-preview')!;img.src=item.url;img.alt=item.alt||'Selected image';
  const values:Record<string,string>={filename:item.filename,dimensions:item.width?`${item.width} × ${item.height} px`:'Unavailable',size:item.size,format:item.filename.split('.').at(-1).toUpperCase(),date:new Date(item.created_at).toLocaleString(),alt:item.alt||'No description saved'};
  for(const [key,value] of Object.entries(values))drawer.querySelector<HTMLElement>(`[data-detail="${key}"]`)!.textContent=value;
  url.value=item.url;drawer.querySelector<HTMLAnchorElement>('[data-media-view]')!.href=item.url;copyStatus.textContent='';drawer.showModal();
}));
drawer.querySelector('[data-media-close]')!.addEventListener('click',()=>drawer.close());
drawer.addEventListener('close',()=>opener?.focus());
drawer.addEventListener('click',event=>{if(event.target===drawer){const r=drawer.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)drawer.close();}});
drawer.querySelector('[data-media-copy]')!.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(url.value);copyStatus.textContent='Image URL copied.';}catch{url.focus();url.select();copyStatus.textContent='Select and copy the URL above.';}});
