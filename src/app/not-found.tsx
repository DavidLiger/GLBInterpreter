import { MESSAGES, LANGS } from "@/i18n/messages";

// Page 404 exportée (`404.html`). Un hébergeur statique la sert à n'importe quelle adresse manquante, où les
// chemins relatifs de `_next/` ne se résolvent pas : styles en ligne, aucun lien ni script nécessaire (S-47).
// Î12 : sans script, la langue du lecteur n'est pas connue : le message est donné dans les trois langues du livre,
// chacune balisée par `lang` (textes du module i18n, `notFound`). `<html lang>` est réécrit au build (première langue).
export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2rem",
        padding: "1.5rem",
        textAlign: "center",
        background: "#000",
        color: "#fff",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {LANGS.map((l, i) => (
        <section key={l} lang={l} style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxWidth: "32rem" }}>
          {i === 0 ? (
            <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>{MESSAGES[l].notFound.title}</h1>
          ) : (
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{MESSAGES[l].notFound.title}</h2>
          )}
          <p style={{ opacity: 0.8, margin: 0 }}>{MESSAGES[l].notFound.message}</p>
        </section>
      ))}
    </main>
  );
}
