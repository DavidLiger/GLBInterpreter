"use client";

import BookCacheManager from "./BookCacheManager";

export default function ClientBookCacheManager({ bookId }: { bookId: string }) {
  return <BookCacheManager bookId={bookId} variant="loader" />;
}
