// Page 404 exportée (`404.html`). Un hébergeur statique la sert à n'importe quelle adresse manquante, où les
// chemins relatifs de `_next/` ne se résolvent pas : styles en ligne, aucun lien ni script nécessaire (S-47).
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1rem",
        padding: "1.5rem",
        textAlign: "center",
        background: "#000",
        color: "#fff",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>Page introuvable</h1>
      <p style={{ opacity: 0.7, margin: 0 }}>
        Cette adresse ne correspond à aucune page du livre. Scannez à nouveau le QR code de la page.
      </p>
    </main>
  );
}
