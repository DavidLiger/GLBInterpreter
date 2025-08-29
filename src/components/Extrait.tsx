import content from "../content/content.json";

export default function Extrait() {
  return (
    <section className="py-16 bg-gray-100 px-6 text-center">
      <h2 className="text-3xl font-bold mb-8">Extrait & Illustrations</h2>
      <div className="max-w-3xl mx-auto bg-white shadow rounded-2xl p-6">
        <p className="text-gray-700 italic">{content.extrait.text}</p>
      </div>
    </section>
  );
}
