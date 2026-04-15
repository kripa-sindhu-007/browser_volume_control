export function MuteToggle({
  muted,
  disabled,
  onToggle,
}: {
  muted: boolean;
  disabled: boolean;
  onToggle: (muted: boolean) => void;
}): JSX.Element {
  return (
    <button
      className="btn btn--mute"
      type="button"
      disabled={disabled}
      data-muted={muted}
      onClick={() => onToggle(!muted)}
    >
      {muted ? 'unmute' : 'mute'}
    </button>
  );
}
