// Opening signed storage URLs (PDFs) in a new tab. Kept out of the component files so they only export
// components (required for React Fast Refresh).

export async function openSignedUrl(load: () => Promise<{ url: string }>, onError: (msg: string) => void, page?: number) {
  // Open the tab first (synchronously, inside the click) so popup blockers allow it, then point it at the signed URL.
  const win = window.open('about:blank', '_blank');
  if (win) win.opener = null;
  try {
    const { url } = await load();
    const target = page ? `${url}#page=${page}` : url;
    if (win && !win.closed) win.location.replace(target);
    else if (!window.open(target, '_blank', 'noopener')) window.location.href = target;
  } catch (err) {
    win?.close();
    onError((err as Error).message);
  }
}
