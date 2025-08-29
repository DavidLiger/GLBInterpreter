import content from "../content/content.json";

export default function Header() {
  const { title, subtitle, cta } = content.header;

  return (
    <header className="bg-gradient-to-r from-purple-800 to-indigo-700 text-white p-12 text-center">
      <h1 className="text-4xl font-bold mb-4">{title}</h1>
      <p className="text-lg mb-6">{subtitle}</p>
      <a
        href={cta.href}
        className="bg-yellow-400 text-black font-semibold px-6 py-3 rounded-2xl shadow hover:bg-yellow-300 transition"
      >
        {cta.label}
      </a>
    </header>
  );
}
