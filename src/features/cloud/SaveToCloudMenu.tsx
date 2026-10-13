// TODO(analytics): "Save to Google Drive / OneDrive / SharePoint" menu. Renders nothing when not configured.
export interface SaveToCloudProps {
  /** Produces the file to save (called when the user picks a destination). */
  getFile: () => Promise<{ blob: Blob; name: string }>;
  /** Called after a successful save (e.g. to log it). */
  onSaved?: (destination: 'google_drive' | 'onedrive' | 'sharepoint', name: string) => void;
}
export default function SaveToCloudMenu(_props: SaveToCloudProps) {
  return null;
}
