"use client";

type DialogueButtonProps = {
  visible: boolean;
  onToggle: () => void;
};

export default function DialogueButton({ visible, onToggle }: DialogueButtonProps) {
  return (
    <button
      onClick={onToggle}
      className="rounded-full w-8 h-8 flex items-center justify-center shadow-lg"
      title={visible ? "Masquer les sous-titres" : "Afficher les sous-titres"}
    >
      <img
        src={
          visible
            ? "icons/dioramas/UI/chat_on.png"
            : "icons/dioramas/UI/chat_off.png"
        }
        alt={visible ? "Sous-titres visibles" : "Sous-titres masqués"}
        className="w-8 h-8 object-contain"
      />
    </button>
  );
}
