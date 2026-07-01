function FileTypeIcon({ name }) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.vtt')) {
    return (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
        <path d="M8 1a2.5 2.5 0 0 1 2.5 2.5v4a2.5 2.5 0 0 1-5 0v-4A2.5 2.5 0 0 1 8 1Zm-3.5 6a.5.5 0 0 0-1 0 4.5 4.5 0 0 0 9 0 .5.5 0 0 0-1 0A3.5 3.5 0 0 1 8 10.5 3.5 3.5 0 0 1 4.5 7ZM7.5 12.5v1.5h-2a.5.5 0 0 0 0 1h5a.5.5 0 0 0 0-1h-2v-1.5a4.5 4.5 0 0 0 1-.18.5.5 0 0 0-.4-.92A3.49 3.49 0 0 1 8 11.5a3.49 3.49 0 0 1-.6-.1.5.5 0 0 0-.4.92 4.5 4.5 0 0 0 .5.18Z" />
      </svg>
    );
  }
  if (lower.endsWith('.txt')) {
    return (
      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
        <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0h5L13 3.5v11A1.5 1.5 0 0 1 11.5 16h-7A1.5 1.5 0 0 1 3 14.5v-13ZM9 1H4.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4H9.5A.5.5 0 0 1 9 3.5V1ZM5 6.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5a.5.5 0 0 1-.5-.5Zm0 2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 0 1h-5A.5.5 0 0 1 5 9Zm0 2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
      <path d="M3 1.5A1.5 1.5 0 0 1 4.5 0h5L13 3.5v11A1.5 1.5 0 0 1 11.5 16h-7A1.5 1.5 0 0 1 3 14.5v-13ZM9 1H4.5a.5.5 0 0 0-.5.5v13a.5.5 0 0 0 .5.5h7a.5.5 0 0 0 .5-.5V4H9.5A.5.5 0 0 1 9 3.5V1Z" />
    </svg>
  );
}

export default function SelectedFilesList({ files, startIndex = 0 }) {
  if (!files?.length) return null;
  return (
    <div className="flex flex-col gap-1.5 mb-1 flex-shrink-0">
      {files.map((f, i) => (
        <div
          key={`${f.name}-${i}`}
          className="flex items-center gap-2.5 bg-blue-lt border border-blue-mid px-3 py-2 rounded-lg text-[12.5px] animate-pop-in"
        >
          <span className="text-blue flex-shrink-0 flex items-center justify-center">
            <FileTypeIcon name={f.name} />
          </span>
          <span className="flex-1 text-ink font-medium truncate">
            {startIndex + i + 1}. {f.name}
          </span>
        </div>
      ))}
    </div>
  );
}
