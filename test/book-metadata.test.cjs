const assert = require("node:assert/strict");
const { deserializeBook, serializeBook } = require("../book-metadata.js");

const rendererBook = {
  id: 7,
  title: "A Test Book",
  subtitle: "The Sequel",
  authors: ["Ada Author", "Ed Editor"],
  isbn: "1234567890",
  isbns: ["1234567890", "9781234567897"],
  publishers: ["Test Press"],
  publishedDate: "2026-09-13",
  pageCount: 312,
  subjects: ["Testing"],
  synopsis: "Contract fixtures are useful.",
  coverUrl: "https://example.com/cover.jpg",
  coverOptions: ["https://example.com/cover.jpg"],
  source: "Test fixture",
  isRead: true,
  startedDate: "2026-09-01",
  finishedDate: "2026-09-13",
  rating: 4.5,
  review: "Round-tripped.",
  shelfSlot: 12,
  render: { spineColor: "#123456", width: 0.2 },
  addedAt: "2026-09-13T12:00:00.000Z",
  translatedSynopsis: false,
};

const record = serializeBook(rendererBook);
assert.equal(record.author, "Ada Author, Ed Editor");
assert.deepEqual(record.metadata.authors, rendererBook.authors);
assert.deepEqual(deserializeBook({ id: rendererBook.id, ...record }), rendererBook);

const legacy = deserializeBook({
  id: 8,
  title: "Legacy Book",
  author: "Original Author",
  metadata: { status: "Read", isbn: "1111111111", rating: null },
});
assert.equal(legacy.isRead, true);
assert.deepEqual(legacy.authors, ["Original Author"]);
assert.deepEqual(legacy.isbns, ["1111111111"]);
assert.equal(legacy.rating, 0);
assert.deepEqual(legacy.render, {});
assert.equal(legacy.coverUrl, "");

console.log("book metadata contract tests passed");
