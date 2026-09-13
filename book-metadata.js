(function (root, factory) {
  const contract = factory();
  if (typeof module === "object" && module.exports) module.exports = contract;
  if (root) root.BexsBookMetadata = contract;
})(typeof globalThis === "undefined" ? this : globalThis, function () {
  "use strict";

  const text = (value, fallback = "") => typeof value === "string" ? value : fallback;
  const strings = (value) => Array.isArray(value)
    ? value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  const normalizeCoverUrl = (value) => {
    const url = text(value).trim();
    if (/^http:\/\//i.test(url)) return `https://${url.slice(7)}`;
    if (/^\/\//.test(url)) return `https:${url}`;
    return url;
  };
  const coverUrls = (value) => strings(value).map(normalizeCoverUrl).filter(Boolean);
  const nullableNumber = (value) => value === null || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
  const rating = (value) => {
    const parsed = nullableNumber(value);
    return parsed === null ? 0 : Math.max(0, Math.min(5, parsed));
  };
  const slot = (value) => Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

  function normalizeAuthors(value, displayAuthor = "") {
    const normalized = strings(value);
    return normalized.length ? normalized : (text(displayAuthor).trim() ? [displayAuthor.trim()] : []);
  }

  function normalizeIsbns(metadata) {
    const values = strings(metadata.isbns);
    if (typeof metadata.isbn === "string" && metadata.isbn.trim()) values.unshift(metadata.isbn.trim());
    return [...new Set(values)];
  }

  function deserializeBook(row = {}) {
    const metadata = row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : row;
    const authors = normalizeAuthors(metadata.authors, row.author || metadata.author);
    const isbns = normalizeIsbns(metadata);
    const legacyStatus = text(metadata.status).trim().toLowerCase();
    const explicitlyRead = typeof metadata.isRead === "boolean" ? metadata.isRead : null;
    const isRead = explicitlyRead === null ? legacyStatus === "read" : explicitlyRead;

    return {
      id: row.id ?? metadata.id ?? null,
      title: text(row.title, text(metadata.title, "Untitled book")),
      subtitle: text(metadata.subtitle),
      authors,
      isbn: isbns[0] || "",
      isbns,
      publishers: strings(metadata.publishers),
      publishedDate: text(metadata.publishedDate),
      pageCount: nullableNumber(metadata.pageCount),
      subjects: strings(metadata.subjects),
      synopsis: text(metadata.synopsis),
      coverUrl: normalizeCoverUrl(text(metadata.cover_url, text(metadata.coverUrl))),
      coverOptions: coverUrls(metadata.coverOptions),
      source: text(metadata.source),
      isRead,
      startedDate: text(metadata.startedDate),
      finishedDate: text(metadata.finishedDate),
      rating: rating(metadata.rating),
      review: text(metadata.review),
      shelfSlot: slot(metadata.shelfSlot),
      render: metadata.render && typeof metadata.render === "object" && !Array.isArray(metadata.render)
        ? { ...metadata.render }
        : {},
      addedAt: text(metadata.addedAt, text(row.created_at)),
      translatedSynopsis: Boolean(metadata.translatedSynopsis),
    };
  }

  function serializeBook(book = {}) {
    const normalized = deserializeBook(book);
    const authors = normalizeAuthors(book.authors, book.author);
    const isbns = strings(book.isbns);
    if (typeof book.isbn === "string" && book.isbn.trim()) isbns.unshift(book.isbn.trim());

    return {
      title: text(book.title, normalized.title),
      author: authors.join(", ") || "Unknown author",
      metadata: {
        subtitle: text(book.subtitle),
        authors,
        isbns: [...new Set(isbns)],
        publishers: strings(book.publishers),
        publishedDate: text(book.publishedDate),
        pageCount: nullableNumber(book.pageCount),
        subjects: strings(book.subjects),
        synopsis: text(book.synopsis),
        cover_url: normalizeCoverUrl(text(book.coverUrl, text(book.cover_url))),
        coverOptions: coverUrls(book.coverOptions),
        source: text(book.source),
        isRead: Boolean(book.isRead),
        startedDate: text(book.startedDate),
        finishedDate: text(book.finishedDate),
        rating: rating(book.rating),
        review: text(book.review),
        shelfSlot: slot(book.shelfSlot),
        render: book.render && typeof book.render === "object" && !Array.isArray(book.render)
          ? { ...book.render }
          : {},
        addedAt: text(book.addedAt),
        translatedSynopsis: Boolean(book.translatedSynopsis),
      },
    };
  }

  return { deserializeBook, normalizeCoverUrl, serializeBook };
});
