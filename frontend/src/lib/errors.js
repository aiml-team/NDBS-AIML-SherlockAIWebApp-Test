export function friendlyUploadError(fileName, serverError) {
  switch (serverError) {
    case 'Empty file':
      return `"${fileName}" is empty. Please choose a file that contains content.`;
    case 'Invalid filename':
      return `"${fileName}" has an unsupported name. Please rename it (use letters, numbers, spaces, dashes or underscores) and try again.`;
    case 'Invalid prospect name':
      return `The prospect name is not valid. Please go back and choose a different name.`;
    case 'Missing file or prospect':
      return `Could not upload "${fileName}". Please reselect the file and try again.`;
    case 'Upload failed':
      return `Could not save "${fileName}" to storage. Please check your connection and try again.`;
    default:
      return `Could not upload "${fileName}". Please try again.`;
  }
}

export const ALLOWED_EXTS = ['.docx', '.vtt', '.txt'];

export function validateFiles(files) {
  const invalid = files.filter(
    (f) => !ALLOWED_EXTS.some((ext) => f.name.toLowerCase().endsWith(ext)),
  );
  if (invalid.length) {
    return `Unsupported file type: ${invalid.map((f) => f.name).join(', ')}\nAllowed: .docx, .vtt, .txt`;
  }
  const empty = files.filter((f) => !f.size);
  if (empty.length) {
    const names = empty.map((f) => `"${f.name}"`).join(', ');
    const verb = empty.length > 1 ? 'are' : 'is';
    const desc = empty.length > 1 ? 'files that contain' : 'a file that contains';
    return `${names} ${verb} empty. Please choose ${desc} content.`;
  }
  return null;
}
