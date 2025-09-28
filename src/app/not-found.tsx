export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-screen text-center">
      <h1 className="text-4xl font-bold">😕 Page introuvable</h1>
      <p className="mt-4 text-lg text-gray-500">
        Oups… ce contenu n’existe pas ou vous n’y avez pas accès.
      </p>
    </div>
  );
}
