'use client'

interface BookDetailsCardProps {
  detail: any;
  labels: any;
  collectionName: string;
  publisherName: string;
}

export default function BookDetailsCard({ detail, labels, collectionName, publisherName }: BookDetailsCardProps) {
  const InfoRow = ({ label, value }: { label: string; value?: string }) => {
    if (!value) return null;
    return (
      <div className="flex border-b border-gray-200 py-3">
        <span className="font-semibold text-gray-600 w-1/3">{label}</span>
        <span className="text-gray-800 w-2/3">{value}</span>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
      {/* Description */}
      {detail.description && (
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-800 mb-3 border-b-2 border-indigo-600 pb-2">
            {labels.description}
          </h3>
          <p className="text-gray-700 leading-relaxed text-justify">
            {detail.description}
          </p>
        </div>
      )}

      {/* Caractéristiques techniques */}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-3 border-b-2 border-indigo-600 pb-2">
          Caractéristiques
        </h3>
        <div className="space-y-0">
          <InfoRow label={labels.author} value={detail.author} />
          <InfoRow label={labels.collection} value={collectionName} />
          <InfoRow label={labels.genre} value={detail.genre} />
          <InfoRow label={labels.pages} value={detail.pages} />
          <InfoRow label={labels.format} value={detail.format} />
          <InfoRow label={labels.binding} value={detail.binding} />
          <InfoRow label={labels.weight} value={detail.weight} />
          <InfoRow label={labels.language} value={detail.language} />
          <InfoRow label={labels.targetAge} value={detail.targetAge} />
          <InfoRow label={labels.publicationDate} value={detail.publicationDate} />
        </div>
      </div>

      {/* Informations commerciales */}
      <div className="mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-3 border-b-2 border-green-600 pb-2">
          Informations commerciales
        </h3>
        <div className="space-y-0">
          <InfoRow label={labels.publisher} value={publisherName} />
          <InfoRow label={labels.isbn13} value={detail.isbn13} />
          <InfoRow label={labels.isbn10} value={detail.isbn10} />
          <InfoRow label={labels.ean} value={detail.ean} />
          {detail.price && (
            <div className="flex border-b border-gray-200 py-3 bg-green-50">
              <span className="font-semibold text-gray-600 w-1/3">{labels.price}</span>
              <span className="text-green-700 font-bold text-lg w-2/3">{detail.price}</span>
            </div>
          )}
        </div>
      </div>

      {/* Note additionnelle */}
      {detail.text && (
        <div className="bg-indigo-50 rounded-lg p-4 border-l-4 border-indigo-600">
          <p className="text-gray-700 italic text-sm">{detail.text}</p>
        </div>
      )}
    </div>
  );
}