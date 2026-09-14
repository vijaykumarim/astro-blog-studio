export function GET() {
  return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#6133b5"/><stop offset=".75" stop-color="#a444b5"/><stop offset="1" stop-color="#d75a36"/></linearGradient></defs><rect width="64" height="64" rx="17" fill="url(#g)"/><text x="13" y="49" font-family="Georgia,serif" font-size="52" font-style="italic" fill="white">b.</text></svg>`,{headers:{'Content-Type':'image/svg+xml','Cache-Control':'public, max-age=86400'}});
}
