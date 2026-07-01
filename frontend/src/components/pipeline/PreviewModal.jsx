import Modal from '../ui/Modal.jsx';
import { previewUrl } from '../../lib/api.js';

export default function PreviewModal({ open, onClose, prospect, folder, filename }) {
  const src = open && filename ? previewUrl(prospect, folder, filename) : '';
  return (
    <Modal open={open} onClose={onClose} title={filename || ''}>
      <iframe
        title="Document preview"
        src={src}
        className="flex-1 w-full border-none"
      />
    </Modal>
  );
}
