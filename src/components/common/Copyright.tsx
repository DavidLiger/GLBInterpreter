// components/Copyright.tsx
'use client'

import { useHomeTranslation } from "@/contexts/HomeTranslationContext";
import content from "../../content/content.json";

export default function Copyright() {
  const { t } = useHomeTranslation();

  return (
    <div className="mb-24 text-center text-sm text-gray-500">
      {t.footer.copyright}
    </div>
  );
}
