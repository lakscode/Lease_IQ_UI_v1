// Opening signed storage URLs (PDFs) in a new tab. Kept out of the component files so they only export
// components (required for React Fast Refresh).

export async function openSignedUrl(load: () => Promise<{ url: string }>, onError: (msg: string) => void) {
  // Open the tab first so popup blockers allow it, then point it at the signed URL.
  const win = window.open('', '_blank');
  try {
    const { url } = await load();
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    onError((err as Error).message);
  }
}
