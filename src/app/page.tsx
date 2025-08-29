import Header from "../components/Header";
import BooksSection from "../components/BooksSection";
import Extrait from "../components/Extrait";
import Footer from "../components/Footer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      <Header />
      <BooksSection />
      <Extrait />
      <Footer />
    </div>
  );
}
