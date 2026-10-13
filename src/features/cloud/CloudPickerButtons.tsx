// TODO(analytics): Google Drive / OneDrive / SharePoint pickers. Renders nothing when not configured.
export interface CloudPickerProps {
  /** Called with the picked files, already downloaded as File objects. */
  onPicked: (files: File[], source: 'google_drive' | 'onedrive' | 'sharepoint') => void;
  accept?: string[];          // MIME types, e.g. ['application/pdf']
  multiple?: boolean;
  disabled?: boolean;
}
export default function CloudPickerButtons(_props: CloudPickerProps) {
  return null;
}
