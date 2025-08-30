// components/Copyright.tsx
'use client'

import content from "../content/content.json";

export default function Copyright() {
  return (
    <div className="mb-24 text-center text-sm text-gray-500">
      {content.footer.copyright}
    </div>
  );
}
