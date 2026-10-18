import BookApp from "@/components/book/BookApp";

// Î16 (D-16.3) : fond noir et thème sombre pour la page du livre seulement (l'atelier garde le fond de `globals.css`).
// Sur iOS 26, la barre d'état de l'app installée et les barres de Safari prennent la couleur de la page : en thème clair,
// le fond blanc de `body` donnait une bande blanche au-dessus des écrans noirs. Écrit dans `index.html` dès l'export.
const bookPageStyle = "html,body{background:#000;color-scheme:dark}";

// Page unique du livre (D-8.4) : la scène est choisie côté client d'après `#/s/<scène>`.
export default function Home() {
  return (
    <>
      <style href="glbi-book-page" precedence="default">
        {bookPageStyle}
      </style>
      <BookApp />
    </>
  );
}
