export default function ScanSuccess() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 via-black to-blue-900 flex items-center justify-center p-4">
      <div className="text-center max-w-md mx-auto">
        <div className="text-6xl mb-6">📖✨</div>
        <h1 className="text-3xl font-bold text-white mb-4">
          Retour au livre !
        </h1>
        <p className="text-gray-300 mb-6">
          La scène est ouverte dans l'onglet dédié. Vous pouvez maintenant :
        </p>
        
        <div className="bg-black/30 rounded-2xl p-6 mb-6">
          <ul className="text-left text-gray-300 space-y-3">
            <li className="flex items-start gap-3">
              <span className="text-2xl">✅</span>
              <span>Fermer cet onglet</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-2xl">📷</span>
              <span>Scanner le prochain QR code</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="text-2xl">📖</span>
              <span>Continuer votre lecture</span>
            </li>
          </ul>
        </div>
        
        <div className="bg-purple-900/30 rounded-xl p-4">
          <p className="text-sm text-purple-200">
            💡 <strong>Astuce :</strong> Tous les QR codes s'ouvrent dans le même onglet pour une expérience fluide
          </p>
        </div>
      </div>
    </div>
  );
}