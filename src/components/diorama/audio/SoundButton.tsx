"use client";

type SoundButtonProps = {
  muted: boolean;
  onToggle: () => void;
};

export default function SoundButton({ muted, onToggle }: SoundButtonProps) {
  return (
    <button
      onClick={onToggle}
      className="rounded-full w-8 h-8 flex items-center justify-center shadow-lg"
      title={muted ? "Activer le son" : "Couper le son"}
    >
      <img
        src={muted ? "/icons/dioramas/UI/muted.png" : "/icons/dioramas/UI/sound.png"}
        alt={muted ? "Muet" : "Son"}
        className="w-8 h-8 object-contain"
      />
    </button>
  );
}
