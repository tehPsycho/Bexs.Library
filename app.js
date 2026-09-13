(function () {
  const { deserializeBook, normalizeCoverUrl, serializeBook } = window.BexsBookMetadata;
  const STORAGE_KEY = "beccas-library:v1";
  const SETTINGS_KEY = "beccas-library:settings";
  const config = window.BEXS_CONFIG;
  const supabaseClient = window.BexsSupabaseClient
    || window.supabase?.createClient(config?.supabaseUrl, config?.supabasePublishableKey);
  const elements = {
    isbnInput: document.querySelector("#isbnInput"),
    scanButton: document.querySelector("#scanButton"),
    cameraScanButton: document.querySelector("#cameraScanButton"),
    cameraScannerModal: document.querySelector("#cameraScannerModal"),
    cameraScannerVideo: document.querySelector("#cameraScannerVideo"),
    cameraScannerStatus: document.querySelector("#cameraScannerStatus"),
    closeCameraScanner: document.querySelector("#closeCameraScanner"),
    mobileFilterToggle: document.querySelector("#mobileFilterToggle"),
    bookToolbar: document.querySelector("#bookToolbar"),
    statusFilter: document.querySelector("#statusFilter"),
    sortBooks: document.querySelector("#sortBooks"),
    returnLibrary: document.querySelector("#returnLibrary"),
    exploreLibrary: document.querySelector("#exploreLibrary"),
    exploreMain: document.querySelector("#exploreMain"),
    languageSelect: document.querySelector("#languageSelect"),
    bookGrid: document.querySelector("#bookGrid"),
    emptyState: document.querySelector("#emptyState"),
    resultCount: document.querySelector("#resultCount"),
    bookDetail: document.querySelector("#bookDetail"),
    panelTemplate: document.querySelector("#panelTemplate"),
    toast: document.querySelector("#toast"),
    stats: {
      books: document.querySelector("#statBooks"),
      read: document.querySelector("#statRead"),
      pages: document.querySelector("#statPages"),
      rating: document.querySelector("#statRating"),
    },
  };

  const legacySizeProfiles = ["slim", "standard", "tall", "wide", "chunky"];
  let library = [];
  let settings = loadSettings();
  let currentProfile = null;
  let activeBook = null;
  let toastTimer = null;
  let translateTimer = null;
  let cameraStream = null;
  let barcodeScanFrame = null;
  let fallbackScannerControls = null;
  const translationCache = new Map();
  const textOriginals = new WeakMap();
  const attrOriginals = new WeakMap();
  const isVerifyMode = localStorage.getItem("beccas-library:verify") === "1";

  function loadLibrary() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(saved)) return [];
      let changed = false;
      const hydrated = saved.map((book, index) => {
        const normalized = deserializeBook(book);
        const next = hydrateBookRender({ ...book, ...normalized }, index);
        if (next !== book) changed = true;
        return next;
      });
      if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(hydrated));
      return hydrated;
    } catch (_error) {
      return [];
    }
  }

  const booksRepository = {
    async list() {
      const { data, error } = await supabaseClient.from("books").select("*").order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map(rowToRenderBook);
    },
    async insert(book) {
      const payload = { username: currentProfile.username, title: book.title, author: (book.authors || []).join(", ") || "Unknown author", metadata: renderBookToMetadata(book) };
      const { data, error } = await supabaseClient.from("books").insert(payload).select().single();
      if (error) throw error;
      return rowToRenderBook(data);
    },
    async update(book) {
      const payload = { title: book.title, author: (book.authors || []).join(", ") || "Unknown author", metadata: renderBookToMetadata(book), updated_at: new Date().toISOString() };
      const { data, error } = await supabaseClient.from("books").update(payload).eq("id", book.id).select().single();
      if (error) throw error;
      return rowToRenderBook(data);
    },
    async remove(id) {
      const { error } = await supabaseClient.from("books").delete().eq("id", id);
      if (error) throw error;
    },
  };

  function rowToRenderBook(row) {
    return hydrateBookRender(deserializeBook(row));
  }

  function renderBookToMetadata(book) {
    return serializeBook(book).metadata;
  }

  function reportDatabaseError(action, error) {
    console.error(`Could not ${action}`, error);
    showToast(`Could not ${action}. ${error?.message || "Please try again."}`);
  }

  async function initializeLibrary() {
    if (!supabaseClient) {
      reportDatabaseError("connect to the library", new Error("Supabase configuration is unavailable."));
      return false;
    }
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError || !session?.user) {
      reportDatabaseError("open your library", sessionError || new Error("Please sign in first."));
      return false;
    }
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("username")
      .eq("id", session.user.id)
      .single();
    if (profileError || !profile?.username) {
      reportDatabaseError("load your profile", profileError || new Error("Your profile has no username."));
      return false;
    }
    currentProfile = profile;
    try {
      library = await booksRepository.list();
      render();
      return true;
    } catch (error) {
      reportDatabaseError("retrieve your shelf", error);
      return false;
    }
  }

  function loadSettings() {
    try {
      return { language: "en", ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
    } catch (_error) {
      return { language: "en" };
    }
  }

  function saveSettings() {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function normalizeIsbn(value) {
    return String(value || "").replace(/[^0-9Xx]/g, "").toUpperCase();
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(date) {
    if (!date) return "";
    const parsed = new Date(`${date}T00:00:00`);
    return Number.isNaN(parsed.valueOf())
      ? date
      : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function escapeText(value) {
    const div = document.createElement("div");
    div.textContent = String(value || "");
    return div.innerHTML;
  }

  function showToast(message) {
    elements.toast.textContent = message;
    translateElement(elements.toast);
    elements.toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
  }

  function scheduleTranslatePage() {
    window.clearTimeout(translateTimer);
    translateTimer = window.setTimeout(() => translatePageText(), 80);
  }

  async function translatePageText(root = document.body) {
    if (!root) return;
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        const text = node.textContent.trim();
        if (!parent || !text || parent.closest("script, style, textarea, input, select, option, canvas")) return NodeFilter.FILTER_REJECT;
        if (parent.closest(".cover-choice-list")) return NodeFilter.FILTER_REJECT;
        return shouldTranslateText(text) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    await Promise.all(textNodes.slice(0, 90).map(translateTextNode));
    await Promise.all([...root.querySelectorAll("input[placeholder], textarea[placeholder], button[aria-label], [title]")].map(translateAttributes));
  }

  function shouldTranslateText(text, target = settings.language) {
    const value = String(text || "").trim();
    if (value.length < 2 || /^[\d\sISBN:.,/-]+$/i.test(value)) return false;
    if (target === "en") return looksNonEnglish(value);
    return true;
  }

  async function translateTextNode(node) {
    if (!textOriginals.has(node)) textOriginals.set(node, node.textContent);
    const original = textOriginals.get(node);
    const translated = await translateInterfaceText(original);
    if (translated && node.isConnected) node.textContent = translated;
  }

  async function translateAttributes(element) {
    const attrs = ["placeholder", "aria-label", "title"];
    let originals = attrOriginals.get(element);
    if (!originals) {
      originals = {};
      attrOriginals.set(element, originals);
    }
    await Promise.all(attrs.map(async (attr) => {
      if (!element.hasAttribute(attr)) return;
      originals[attr] ||= element.getAttribute(attr);
      const translated = await translateInterfaceText(originals[attr]);
      if (translated && element.isConnected) element.setAttribute(attr, translated);
    }));
  }

  async function translateInterfaceText(text, target = settings.language) {
    if (isVerifyMode) return text;
    if (!shouldTranslateText(text, target)) return text;
    const key = `${target}:${text}`;
    if (translationCache.has(key)) return translationCache.get(key);
    const translated = await translateText(text, target);
    const result = translated || text;
    translationCache.set(key, result);
    return result;
  }

  function translateElement(element) {
    if (!element) return;
    window.setTimeout(() => translatePageText(element), 0);
  }

  async function submitSearch() {
    const rawQuery = elements.isbnInput.value.trim();
    const isbn = normalizeIsbn(rawQuery);
    const isIsbn = (/^\d{9}[\dX]$|^\d{13}$/).test(isbn) && (/^[\d\sXx-]+$/).test(rawQuery);

    if (!rawQuery || !isIsbn) {
      showLibrary();
      renderBooks();
      if (!rawQuery) elements.isbnInput.focus();
      return;
    }
    await lookupByIsbn(isbn);
  }

  async function lookupByIsbn(rawIsbn) {
    const isbn = normalizeIsbn(rawIsbn);
    if (!isbn) {
      showToast("Scan or enter an ISBN first.");
      elements.isbnInput.focus();
      return;
    }

    const existing = library.find((book) => book.isbns.includes(isbn));
    if (existing) {
      openBook(existing, "Already in your library");
      return;
    }

    setLookupBusy(true);
    try {
      const book = await fetchBookData(isbn);
      if (!book) {
        showToast("I could not find that ISBN. You can try another barcode.");
        return;
      }
      openBook(book, "New scan", { isPreview: true });
    } catch (error) {
      console.error(error);
      showToast("The lookup service did not answer. Try again in a moment.");
    } finally {
      setLookupBusy(false);
    }
  }

  function setLookupBusy(isBusy) {
    elements.scanButton.disabled = isBusy;
    elements.scanButton.textContent = isBusy ? "Looking..." : "Search";
  }

  async function openCameraScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      if (!window.isSecureContext) {
        showToast("Camera access requires HTTPS. Reopen this page using its secure address.");
      } else {
        showToast("This browser cannot access the camera. Update Chrome or check whether it is blocked for this site.");
      }
      return;
    }

    elements.cameraScannerModal.hidden = false;
    elements.cameraScannerStatus.textContent = "Starting camera…";
    try {
      if ("BarcodeDetector" in window) {
        const supportedFormats = await window.BarcodeDetector.getSupportedFormats();
        const formats = ["ean_13", "ean_8"].filter((format) => supportedFormats.includes(format));
        if (formats.length) {
          await startNativeBarcodeScanner(formats);
          return;
        }
      }

      await startFallbackBarcodeScanner();
    } catch (error) {
      console.error("Could not start barcode scanner", error);
      closeCameraScanner();
      const cameraErrorMessages = {
        NotAllowedError: "Camera access was not allowed. In Chrome, open Site settings, allow Camera, and try again.",
        NotFoundError: "No rear camera was found on this device.",
        NotReadableError: "The camera is busy in another app. Close it there and try again.",
        OverconstrainedError: "This device does not provide a compatible camera.",
        SecurityError: "Chrome blocked camera access for this page. Check this site's Camera permission.",
      };
      showToast(cameraErrorMessages[error?.name] || error?.message || "The camera could not be started.");
    }
  }

  async function startNativeBarcodeScanner(formats) {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    });
    elements.cameraScannerVideo.srcObject = cameraStream;
    await elements.cameraScannerVideo.play();
    const detector = new window.BarcodeDetector({ formats });
    elements.cameraScannerStatus.textContent = "Looking for an ISBN barcode…";
    detectBarcode(detector);
  }

  async function startFallbackBarcodeScanner() {
    if (!window.ZXingBrowser?.BrowserMultiFormatReader) {
      throw new Error("The barcode scanner could not load. Check your connection and try again.");
    }

    const reader = new window.ZXingBrowser.BrowserMultiFormatReader();
    fallbackScannerControls = await reader.decodeFromConstraints(
      { video: { facingMode: { ideal: "environment" } }, audio: false },
      elements.cameraScannerVideo,
      (result) => {
        const isbn = normalizeIsbn(result?.getText?.() || result?.text || "");
        if (/^(978|979)\d{10}$/.test(isbn)) completeBarcodeScan(isbn);
      },
    );
    cameraStream = elements.cameraScannerVideo.srcObject;
    elements.cameraScannerStatus.textContent = "Looking for an ISBN barcode…";
  }

  async function detectBarcode(detector) {
    if (!cameraStream) return;
    try {
      const barcodes = await detector.detect(elements.cameraScannerVideo);
      const match = barcodes.find(({ rawValue }) => /^(978|979)\d{10}$/.test(normalizeIsbn(rawValue)));
      if (match) {
        await completeBarcodeScan(normalizeIsbn(match.rawValue));
        return;
      }
    } catch (_error) {
      // A video frame can be unavailable while the camera is warming up; keep scanning.
    }
    barcodeScanFrame = window.requestAnimationFrame(() => detectBarcode(detector));
  }

  async function completeBarcodeScan(isbn) {
    elements.isbnInput.value = isbn;
    closeCameraScanner();
    showToast("ISBN scanned. Looking up your book…");
    await submitSearch();
  }

  function closeCameraScanner() {
    if (barcodeScanFrame) window.cancelAnimationFrame(barcodeScanFrame);
    barcodeScanFrame = null;
    fallbackScannerControls?.stop();
    fallbackScannerControls = null;
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    elements.cameraScannerVideo.srcObject = null;
    elements.cameraScannerModal.hidden = true;
    elements.cameraScanButton.focus();
  }

  async function fetchBookData(isbn) {
    const [openLibrary, google, googleLanguage, openLibrarySearch, archive] = await Promise.allSettled([
      fetchOpenLibrary(isbn),
      fetchGoogleBooks(isbn),
      fetchGoogleBooks(isbn, settings.language),
      fetchOpenLibrarySearch(isbn),
      withTimeout(fetchArchiveMetadata(isbn), 1200),
    ]);
    const primary = openLibrary.status === "fulfilled" ? openLibrary.value : null;
    const fallback = google.status === "fulfilled" ? google.value : null;
    const preferredLanguage = googleLanguage.status === "fulfilled" ? googleLanguage.value : null;
    const searchExtras = openLibrarySearch.status === "fulfilled" ? openLibrarySearch.value : null;
    const archiveExtras = archive.status === "fulfilled" ? archive.value : null;
    const merged = mergeBookData(isbn, primary, preferredLanguage || fallback, mergeExtras(searchExtras, archiveExtras));
    if (needsSynopsis(merged)) {
      const [titleSearch, titleSearchEnglish, richerOpenLibrary] = await Promise.allSettled([
        withTimeout(fetchGoogleBooksByTitle(merged), 1200),
        withTimeout(fetchGoogleBooksByTitle(merged, "en"), 1200),
        withTimeout(fetchOpenLibraryByTitle(merged), 1200),
      ]);
      Object.assign(
        merged,
        mergeSynopsisExtras(
          merged,
          titleSearch.status === "fulfilled" ? titleSearch.value : null,
          titleSearchEnglish.status === "fulfilled" ? titleSearchEnglish.value : null,
          richerOpenLibrary.status === "fulfilled" ? richerOpenLibrary.value : null,
        ),
      );
    }
    return prepareBookLanguage(merged);
  }

  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((resolve) => window.setTimeout(() => resolve(null), ms)),
    ]);
  }

  async function fetchOpenLibrary(isbn) {
    const response = await fetch(`https://openlibrary.org/isbn/${encodeURIComponent(isbn)}.json`);
    if (!response.ok) return null;
    const data = await response.json();
    const authorNames = await fetchOpenLibraryAuthors(data.authors || []);
    const work = data.works && data.works[0] ? await fetchOpenLibraryWork(data.works[0].key) : null;
    const description =
      typeof work?.description === "string" ? work.description : work?.description?.value || "";

    return {
      title: data.title,
      subtitle: data.subtitle,
      authors: authorNames,
      publishers: data.publishers || [],
      publishedDate: data.publish_date || "",
      pageCount: data.number_of_pages || null,
      subjects: (work?.subjects || data.subjects || []).slice(0, 8),
      synopsis: description,
      coverUrl: `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`,
      coverOptions: unique([
        `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`,
        ...(data.covers || []).slice(0, 5).map((coverId) => `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`),
      ]),
      source: "Open Library",
      isbns: [isbn, ...(data.isbn_10 || []), ...(data.isbn_13 || [])].map(normalizeIsbn),
    };
  }

  async function fetchOpenLibraryAuthors(authors) {
    const names = await Promise.all(
      authors.slice(0, 4).map(async (author) => {
        if (!author.key) return "";
        const response = await fetch(`https://openlibrary.org${author.key}.json`);
        if (!response.ok) return "";
        const data = await response.json();
        return data.name || "";
      }),
    );
    return names.filter(Boolean);
  }

  async function fetchOpenLibraryWork(key) {
    const response = await fetch(`https://openlibrary.org${key}.json`);
    return response.ok ? response.json() : null;
  }

  async function fetchGoogleBooks(isbn, language = "") {
    const langParam = language ? `&langRestrict=${encodeURIComponent(language)}` : "";
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}${langParam}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    const info = data.items && data.items[0] ? data.items[0].volumeInfo : null;
    if (!info) return null;

    const imageLinks = info.imageLinks || {};
    const googleCovers = ["extraLarge", "large", "medium", "small", "thumbnail", "smallThumbnail"]
      .map((key) => imageLinks[key])
      .filter(Boolean)
      .map(normalizeCoverUrl);

    return {
      title: info.title,
      subtitle: info.subtitle,
      authors: info.authors || [],
      publishers: info.publisher ? [info.publisher] : [],
      publishedDate: info.publishedDate || "",
      pageCount: info.pageCount || null,
      subjects: info.categories || [],
      synopsis: info.description || "",
      coverUrl: googleCovers[0] || "",
      coverOptions: unique(googleCovers),
      source: "Google Books",
      isbns: (info.industryIdentifiers || []).map((item) => normalizeIsbn(item.identifier)),
    };
  }

  async function fetchGoogleBooksByTitle(book, language = "") {
    if (!book?.title) return null;
    const author = book.authors?.[0] ? `+inauthor:${encodeURIComponent(book.authors[0])}` : "";
    const langParam = language ? `&langRestrict=${encodeURIComponent(language)}` : "";
    const response = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(book.title)}${author}&maxResults=5${langParam}`,
    );
    if (!response.ok) return null;
    const data = await response.json();
    const items = data.items || [];
    const found = items.map((item) => item.volumeInfo).find((info) => info?.description);
    return found ? { synopsis: found.description } : null;
  }

  async function fetchOpenLibrarySearch(isbn) {
    const response = await fetch(`https://openlibrary.org/search.json?isbn=${encodeURIComponent(isbn)}&limit=6`);
    if (!response.ok) return null;
    const data = await response.json();
    const covers = (data.docs || [])
      .flatMap((doc) => doc.cover_i ? [`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg?default=false`] : [])
      .slice(0, 8);
    const synopsis = (data.docs || []).map((doc) => doc.first_sentence?.join?.(" ") || doc.first_sentence).find(Boolean) || "";
    return { coverOptions: unique(covers), synopsis };
  }

  async function fetchOpenLibraryByTitle(book) {
    if (!book?.title) return null;
    const author = book.authors?.[0] ? `&author=${encodeURIComponent(book.authors[0])}` : "";
    const response = await fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}${author}&limit=6`);
    if (!response.ok) return null;
    const data = await response.json();
    const workKey = (data.docs || []).find((doc) => doc.key)?.key;
    if (!workKey) return null;
    const work = await fetchOpenLibraryWork(workKey);
    const description = typeof work?.description === "string" ? work.description : work?.description?.value || "";
    const firstSentence = (data.docs || []).map((doc) => doc.first_sentence?.join?.(" ") || doc.first_sentence).find(Boolean) || "";
    return description || firstSentence ? { synopsis: description || firstSentence } : null;
  }

  async function fetchArchiveMetadata(isbn) {
    const response = await fetch(`https://archive.org/advancedsearch.php?q=isbn:${encodeURIComponent(isbn)}&fl[]=identifier&fl[]=description&rows=4&output=json`);
    if (!response.ok) return null;
    const data = await response.json();
    const doc = data.response?.docs?.find((item) => item.description || item.identifier);
    if (!doc) return null;
    if (doc.description) return { synopsis: Array.isArray(doc.description) ? doc.description.join(" ") : doc.description };
    const metadata = await fetch(`https://archive.org/metadata/${encodeURIComponent(doc.identifier)}`);
    if (!metadata.ok) return null;
    const meta = await metadata.json();
    const description = meta.metadata?.description;
    return description ? { synopsis: Array.isArray(description) ? description.join(" ") : description } : null;
  }

  function mergeExtras(...extras) {
    return {
      coverOptions: unique(extras.flatMap((extra) => extra?.coverOptions || [])),
      synopsis: extras.map((extra) => extra?.synopsis).find((synopsis) => synopsis && !isTranslationError(synopsis)) || "",
    };
  }

  function mergeSynopsisExtras(book, ...extras) {
    const synopsis = bestSynopsis(...extras.map((extra) => extra?.synopsis));
    return synopsis && needsSynopsis(book) ? { synopsis } : {};
  }

  function needsSynopsis(book) {
    return !book?.synopsis || /no synopsis found/i.test(book.synopsis) || isTranslationError(book.synopsis);
  }

  async function prepareBookLanguage(book) {
    if (!book || settings.language !== "en" || !looksNonEnglish(book.synopsis)) return book;
    const translated = await translateText(book.synopsis, "en");
    return translated ? { ...book, synopsis: translated, translatedSynopsis: true } : book;
  }

  async function translateSavedBooks() {
    if (settings.language !== "en") return;
    const targets = library.filter((book) => looksNonEnglish(book.synopsis));
    if (!targets.length) return;
    showToast("Translating saved summaries...");
    const translated = await Promise.all(
      targets.map(async (book) => ({ book, synopsis: await findEnglishSynopsis(book) })),
    );
    const changes = translated.filter(({ synopsis }) => Boolean(synopsis));
    if (changes.length) {
      await Promise.all(changes.map(({ book, synopsis }) => updateBook(book.id, { synopsis, translatedSynopsis: true })));
      if (activeBook) openBook(library.find((book) => book.id === activeBook.id) || activeBook, "From your shelves");
      showToast("Saved summaries updated.");
    }
  }

  async function translateText(text, targetLanguage) {
    if (!text) return "";
    const chunks = chunkText(text, 430);
    const translated = [];
    for (const chunk of chunks) {
      const part = await translateChunk(chunk, targetLanguage, guessSourceLanguage(chunk, targetLanguage));
      translated.push(part || chunk);
    }
    const output = translated.join(" ").replace(/\s+/g, " ").trim();
    return isTranslationError(output) ? "" : output;
  }

  async function translateChunk(text, targetLanguage, sourceLanguage = "en") {
    if (sourceLanguage === targetLanguage) return text;
    const libre = await translateWithLibre(text, targetLanguage, sourceLanguage);
    if (libre) return libre;
    try {
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(sourceLanguage)}|${encodeURIComponent(targetLanguage)}`,
      );
      if (!response.ok) return "";
      const data = await response.json();
      const translated = data.responseData?.translatedText || "";
      return isTranslationError(translated) ? "" : translated;
    } catch (_error) {
      return "";
    }
  }

  async function translateWithLibre(text, targetLanguage, sourceLanguage = "auto") {
    try {
      const response = await fetch("https://libretranslate.de/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: text, source: sourceLanguage, target: targetLanguage, format: "text" }),
      });
      if (!response.ok) return "";
      const data = await response.json();
      return data.translatedText || "";
    } catch (_error) {
      return "";
    }
  }

  function chunkText(text, maxLength) {
    const sentences = String(text).match(/[^.!?]+[.!?]*/g) || [String(text)];
    const chunks = [];
    let current = "";
    sentences.forEach((sentence) => {
      if ((current + sentence).length > maxLength && current) {
        chunks.push(current.trim());
        current = "";
      }
      if (sentence.length > maxLength) {
        for (let i = 0; i < sentence.length; i += maxLength) chunks.push(sentence.slice(i, i + maxLength).trim());
      } else current += `${sentence} `;
    });
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  function isTranslationError(text) {
    return /query length limit exceeded|max allowed query|invalid source language/i.test(text || "");
  }

  function guessSourceLanguage(text, targetLanguage = settings.language) {
    if (looksPortuguese(text)) return "pt";
    if (/\b(el|la|los|las|una|para|cuando|pero|desde|hasta|porque)\b/i.test(text || "")) return "es";
    if (/\b(le|la|les|des|une|pour|quand|mais|depuis|parce)\b/i.test(text || "")) return "fr";
    return targetLanguage === "en" ? "pt" : "en";
  }

  function looksNonEnglish(text) {
    return looksPortuguese(text) || /[áéíóúñçãõ]|(?:\bque\b|\buma\b|\bpara\b|\bcom\b|\bquando\b|\bel\b|\bla\b|\bles\b)/i.test(text || "");
  }

  function looksPortuguese(text) {
    return /[ãõç]|(?:\bmãe\b|\birmão\b|\bprisão\b|\bnão\b|\buma\b|\bquando\b|\bcom\b|\bpara\b|\bque\b|\bseu\b|\bsua\b|\bdesde\b|\baté\b)/i.test(text || "");
  }

  function mergeBookData(isbn, primary, fallback, extras) {
    if (!primary && !fallback) return null;
    const merged = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${isbn}-${Date.now()}`,
      isbn,
      isbns: unique([isbn, ...(primary?.isbns || []), ...(fallback?.isbns || [])]),
      title: primary?.title || fallback?.title || "Untitled book",
      subtitle: primary?.subtitle || fallback?.subtitle || "",
      authors: primary?.authors?.length ? primary.authors : fallback?.authors || [],
      publishers: primary?.publishers?.length ? primary.publishers : fallback?.publishers || [],
      publishedDate: primary?.publishedDate || fallback?.publishedDate || "",
      pageCount: primary?.pageCount || fallback?.pageCount || null,
      subjects: primary?.subjects?.length ? primary.subjects : fallback?.subjects || [],
      synopsis: bestSynopsis(primary?.synopsis, fallback?.synopsis, extras?.synopsis),
      coverUrl: primary?.coverUrl || fallback?.coverUrl || "",
      coverOptions: unique([
        ...(primary?.coverOptions || []),
        ...(fallback?.coverOptions || []),
        ...(extras?.coverOptions || []),
        primary?.coverUrl,
        fallback?.coverUrl,
      ]),
      source: primary?.source || fallback?.source || "Book lookup",
      addedAt: new Date().toISOString(),
      isRead: false,
      startedDate: "",
      finishedDate: "",
      rating: 0,
      review: "",
    };
    return merged;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function bestSynopsis(...values) {
    const candidates = values
      .map((value) => cleanCandidateSynopsis(value))
      .filter(Boolean)
      .sort((a, b) => synopsisScore(b) - synopsisScore(a));
    return candidates[0] || "No synopsis found for this edition.";
  }

  function cleanCandidateSynopsis(value) {
    const text = String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!text || /no synopsis found/i.test(text) || isTranslationError(text)) return "";
    return decodeHtml(text);
  }

  function synopsisScore(text) {
    const value = String(text || "");
    const wordCount = value.split(/\s+/).filter(Boolean).length;
    const sentenceCount = (value.match(/[.!?](\s|$)/g) || []).length;
    const englishPenalty = settings.language === "en" && looksNonEnglish(value) ? 250 : 0;
    return Math.min(wordCount, 220) + Math.min(sentenceCount, 8) * 12 - englishPenalty;
  }

  function decodeHtml(value) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = String(value || "");
    return textarea.value;
  }

  async function addBook(book) {
    const savedBook = await addBookToLibrary(book);
    if (!savedBook) return;
    openBook(savedBook, "Added to your library");
    showToast(`${savedBook.title} was added.`);
  }

  async function addBookToLibrary(book) {
    const savedBook = hydrateBookRender({ ...book, shelfSlot: book.shelfSlot ?? firstAvailableShelfSlot(), addedAt: new Date().toISOString() }, library.length);
    try {
      const inserted = await booksRepository.insert(savedBook);
      library = [...library, inserted];
      render();
      return inserted;
    } catch (error) {
      reportDatabaseError("add this book", error);
      return null;
    }
  }

  function hydrateBookRender(book, index = 0) {
    const render = book.render || {};
    if (render.width && render.height && render.depth && render.spineColor && render.pageColor && render.sizeCategory && render.thicknessCategory) return book;
    const hash = hashString(book.id || book.isbn || book.title || String(index));
    const profile = render.sizeProfile || legacySizeProfiles[hash % legacySizeProfiles.length];
    const categories = renderCategories(profile, render);
    return {
      ...book,
      render: {
        ...bookSize(categories.sizeCategory, categories.thicknessCategory),
        spineColor: render.spineColor || "#7b2e3b",
        pageColor: render.pageColor || "#f5ead7",
        sizeCategory: categories.sizeCategory,
        thicknessCategory: categories.thicknessCategory,
        spineFromCover: Boolean(render.spineFromCover),
        ...render,
      },
    };
  }

  function renderCategories(profile, render = {}) {
    if (render.sizeCategory || render.thicknessCategory) {
      return {
        sizeCategory: render.sizeCategory || "medium",
        thicknessCategory: render.thicknessCategory || "regular",
      };
    }
    return {
      slim: { sizeCategory: "small", thicknessCategory: "slim" },
      standard: { sizeCategory: "medium", thicknessCategory: "regular" },
      tall: { sizeCategory: "large", thicknessCategory: "regular" },
      wide: { sizeCategory: "small", thicknessCategory: "thick" },
      chunky: { sizeCategory: "medium", thicknessCategory: "thick" },
    }[profile] || { sizeCategory: "medium", thicknessCategory: "regular" };
  }

  function bookSize(sizeCategory, thicknessCategory) {
    const size = {
      small: { width: 0.16, height: 0.72 },
      medium: { width: 0.19, height: 0.84 },
      large: { width: 0.23, height: 0.96 },
    }[sizeCategory] || { width: 0.19, height: 0.84 };
    const thickness = {
      slim: { depth: 0.42 },
      regular: { depth: 0.52 },
      thick: { depth: 0.64 },
    }[thicknessCategory] || { depth: 0.52 };
    return { ...size, ...thickness };
  }

  function hashString(value) {
    let hash = 0;
    String(value || "").split("").forEach((char) => {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    });
    return hash;
  }

  function firstAvailableShelfSlot() {
    const used = new Set(library.map((book) => book.shelfSlot).filter((slot) => Number.isInteger(slot)));
    for (let slot = 0; slot < 66; slot += 1) {
      if (!used.has(slot)) return slot;
    }
    return library.length;
  }

  async function updateBook(bookId, changes) {
    const existing = library.find((book) => book.id === bookId);
    if (!existing) return null;
    try {
      const saved = await booksRepository.update({ ...existing, ...changes });
      library = library.map((book) => (book.id === bookId ? saved : book));
      render();
      activeBook = library.find((book) => book.id === bookId) || activeBook;
      return saved;
    } catch (error) {
      reportDatabaseError("save this book", error);
      return null;
    }
  }

  async function removeBook(bookId) {
    const book = library.find((item) => item.id === bookId);
    try {
      await booksRepository.remove(bookId);
      library = library.filter((item) => item.id !== bookId);
      showLibrary();
      render();
      showToast(book ? `${book.title} was removed.` : "Book removed.");
    } catch (error) {
      reportDatabaseError("remove this book", error);
    }
  }

  function render() {
    renderStats();
    renderBooks();
    scheduleTranslatePage();
  }

  function renderStats() {
    const readBooks = library.filter((book) => book.isRead);
    const pagesRead = readBooks.reduce((sum, book) => sum + (Number(book.pageCount) || 0), 0);
    const rated = library.filter((book) => Number(book.rating) > 0);
    const average = rated.length
      ? (rated.reduce((sum, book) => sum + Number(book.rating), 0) / rated.length).toFixed(1)
      : "-";

    elements.stats.books.textContent = library.length.toLocaleString();
    elements.stats.read.textContent = readBooks.length.toLocaleString();
    elements.stats.pages.textContent = pagesRead.toLocaleString();
    elements.stats.rating.textContent = average === "-" ? "-" : `${average} ★`;
  }

  function renderBooks() {
    const books = filteredBooks();
    elements.bookGrid.innerHTML = "";
    elements.emptyState.classList.toggle("visible", books.length === 0);
    elements.resultCount.textContent =
      books.length === 0 ? "No books yet" : `${books.length} ${books.length === 1 ? "book" : "books"}`;

    books.forEach((book) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "book-card";
      card.addEventListener("click", () => openBook(book, "From your shelves"));

      const cover = book.coverUrl
        ? `<img src="${escapeText(book.coverUrl)}" alt="Cover of ${escapeText(book.title)}" loading="lazy" data-cover />`
        : `<div class="cover-placeholder">${escapeText(book.title)}</div>`;
      card.innerHTML = `
        ${cover}
        <span class="status-chip ${book.isRead ? "" : "unread"}">${book.isRead ? "Read" : "Unread"}</span>
        <h3>${escapeText(book.title)}</h3>
        <p>${escapeText(book.authors.join(", ") || "Unknown author")}</p>
        <p>${book.rating ? renderStars(book.rating) : "Not rated"}</p>
      `;
      const image = card.querySelector("[data-cover]");
      if (image) image.addEventListener("error", () => replaceBrokenCover(image, book.title));
      elements.bookGrid.append(card);
    });
    if (window.BeccasRoom) {
      window.BeccasRoom.render(library);
    }
  }

  function filteredBooks() {
    const query = elements.isbnInput.value.trim().toLowerCase();
    const status = elements.statusFilter.value;
    const sort = elements.sortBooks.value;

    return library
      .filter((book) => {
        const haystack = [book.title, book.authors.join(" "), book.isbn, book.isbns.join(" ")]
          .join(" ")
          .toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        const matchesStatus =
          status === "all" ||
          (status === "read" && book.isRead) ||
          (status === "unread" && !book.isRead) ||
          (status === "rated" && Number(book.rating) > 0);
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => {
        if (sort === "title-asc") return a.title.localeCompare(b.title);
        if (sort === "author-asc") return (a.authors[0] || "").localeCompare(b.authors[0] || "");
        if (sort === "rating-desc") return Number(b.rating) - Number(a.rating);
        if (sort === "finished-desc") return String(b.finishedDate || "").localeCompare(a.finishedDate || "");
        return String(b.addedAt || "").localeCompare(a.addedAt || "");
      });
  }

  function replaceBrokenCover(image, title) {
    const fallback = document.createElement("div");
    fallback.className = "cover-placeholder";
    fallback.textContent = title;
    image.replaceWith(fallback);
  }

  function openBook(book, kicker, options = {}) {
    activeBook = book;
    const isInLibrary = library.some((item) => item.id === book.id);
    const fragment = elements.panelTemplate.content.cloneNode(true);
    const cover = fragment.querySelector(".detail-cover");
    const coverFallback = fragment.querySelector(".cover-fallback");
    const form = fragment.querySelector(".review-form");
    const actions = fragment.querySelector(".lookup-actions");

    fragment.querySelector(".panel-kicker").textContent = kicker;
    fragment.querySelector("#panelTitle").textContent = book.title;
    fragment.querySelector(".detail-author").textContent = book.authors.join(", ") || "Unknown author";
    const synopsisEl = fragment.querySelector(".synopsis");
    synopsisEl.textContent = cleanSynopsis(book.synopsis);
    renderMeta(fragment.querySelector(".meta-list"), book);
    renderCoverOptions(fragment.querySelector(".detail-main"), book, { isInLibrary, isPreview: options.isPreview, cover, coverFallback });

    if (book.coverUrl) {
      cover.src = book.coverUrl;
      cover.alt = `Cover of ${book.title}`;
      cover.addEventListener("error", () => {
        cover.style.display = "none";
        coverFallback.style.display = "grid";
      });
    } else {
      cover.style.display = "none";
      coverFallback.style.display = "grid";
    }

    if (options.isPreview && !isInLibrary) {
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "primary-action";
      addButton.textContent = "Add to library";
      addButton.addEventListener("click", () => addBook(book));

      const viewOnly = document.createElement("button");
      viewOnly.type = "button";
      viewOnly.textContent = "Just view data";
      viewOnly.addEventListener("click", () => showToast("Viewing only. Nothing has been saved."));
      actions.append(addButton, viewOnly);
      form.style.display = "none";
    } else {
      actions.remove();
      wireReviewForm(form, book);
    }

    const detailCard = document.createElement("article");
    detailCard.className = "book-detail-card";
    detailCard.append(fragment);
    elements.bookDetail.className = "";
    elements.bookDetail.innerHTML = "";
    elements.bookDetail.append(detailCard);
    showBookView(book.title);
    ensureEnglishSynopsis(book, synopsisEl, isInLibrary);
    scheduleTranslatePage();
  }

  async function ensureEnglishSynopsis(book, synopsisEl, isInLibrary) {
    if (settings.language !== "en" || !book || !looksNonEnglish(book.synopsis)) return;
    synopsisEl.textContent = "Refreshing English synopsis...";
    const english = await findEnglishSynopsis(book);
    if (!english) {
      synopsisEl.textContent = cleanSynopsis(book.synopsis);
      return;
    }
    const updatedBook = { ...book, synopsis: english, translatedSynopsis: true };
    synopsisEl.textContent = english;
    if (isInLibrary) {
      await updateBook(book.id, { synopsis: english, translatedSynopsis: true });
      if (activeBook?.id === book.id) activeBook = library.find((item) => item.id === book.id) || updatedBook;
      if (window.BeccasRoom) window.BeccasRoom.render(library);
    } else {
      book.synopsis = english;
      book.translatedSynopsis = true;
    }
    showToast("English synopsis updated.");
  }

  async function findEnglishSynopsis(book) {
    const [googleTitle, openTitle, archive] = await Promise.allSettled([
      fetchGoogleBooksByTitle(book, "en"),
      fetchOpenLibraryByTitle(book),
      book.isbn ? fetchArchiveMetadata(book.isbn) : Promise.resolve(null),
    ]);
    const candidate = [
      googleTitle.status === "fulfilled" ? googleTitle.value?.synopsis : "",
      openTitle.status === "fulfilled" ? openTitle.value?.synopsis : "",
      archive.status === "fulfilled" ? archive.value?.synopsis : "",
    ].find((text) => text && !looksNonEnglish(text) && !isTranslationError(text));
    if (candidate) return candidate;
    const translated = await translateText(book.synopsis, "en");
    return translated && !looksNonEnglish(translated) ? translated : "";
  }

  function renderMeta(list, book) {
    const entries = [
      ["ISBN", book.isbn || "Unknown"],
      ["Pages", book.pageCount ? Number(book.pageCount).toLocaleString() : "Unknown"],
      ["Published", book.publishedDate || "Unknown"],
      ["Publisher", book.publishers[0] || "Unknown"],
      ["Subject", book.subjects[0] || "Unlisted"],
      ["Finished", book.finishedDate ? formatDate(book.finishedDate) : "Not finished"],
    ];
    list.innerHTML = entries
      .map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeText(value)}</dd></div>`)
      .join("");
  }

  function cleanSynopsis(text) {
    return isTranslationError(text) ? "No synopsis found for this edition." : text || "No synopsis found for this edition.";
  }

  function renderCoverOptions(container, book, options) {
    const covers = unique([book.coverUrl, ...(book.coverOptions || [])]).slice(0, 8);

    const section = document.createElement("section");
    section.className = "cover-options";
    section.innerHTML = `
      <div>
        <p class="cover-options-label">Cover art</p>
        <p class="cover-options-help">Choose which edition to show on the shelf, or upload your own.</p>
      </div>
      <div class="cover-choice-list"></div>
      <label class="cover-upload">
        Upload cover
        <input type="file" accept="image/*" />
      </label>
    `;
    const list = section.querySelector(".cover-choice-list");
    const upload = section.querySelector(".cover-upload input");

    async function selectCover(url, button = null) {
      const coverOptions = unique([url, ...covers]);
      if (options.isInLibrary) {
        const saved = await updateBook(book.id, { coverUrl: url, coverOptions });
        if (!saved) return;
        book = saved;
      } else {
        book.coverUrl = url;
        book.coverOptions = coverOptions;
      }
      options.cover.src = url;
      options.cover.style.display = "";
      options.coverFallback.style.display = "none";
      list.querySelectorAll(".cover-choice").forEach((choice) => choice.classList.remove("selected"));
      if (button) button.classList.add("selected");
      showToast("Cover updated.");
    }

    covers.forEach((url, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = url === book.coverUrl ? "cover-choice selected" : "cover-choice";
      button.setAttribute("aria-label", `Use cover option ${index + 1}`);
      const img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.loading = "lazy";
      button.append(img);
      button.addEventListener("click", () => selectCover(url, button));
      list.append(button);
    });

    upload.addEventListener("change", () => {
      const file = upload.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener("load", () => {
        const url = String(reader.result || "");
        if (url) selectCover(url);
      });
      reader.readAsDataURL(file);
    });

    const meta = container.querySelector(".meta-list");
    meta.insertAdjacentElement("afterend", section);
  }

  function wireReviewForm(form, book) {
    const readInput = form.elements.isRead;
    const finishedDate = form.elements.finishedDate;
    const startedDate = form.elements.startDate;
    const ratingInput = form.elements.rating;
    const ratingValue = form.querySelector(".rating-value");
    const stars = form.querySelector(".stars");
    const removeButton = form.querySelector("[data-remove-book]");

    readInput.checked = Boolean(book.isRead);
    finishedDate.value = book.finishedDate || "";
    startedDate.value = book.startedDate || "";
    ratingInput.value = book.rating || 0;
    form.elements.review.value = book.review || "";
    updateRatingText();

    form.querySelector("[data-finish-today]").addEventListener("click", () => {
      readInput.checked = true;
      finishedDate.value = today();
    });

    ratingInput.addEventListener("input", updateRatingText);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const saved = await updateBook(book.id, {
        isRead: readInput.checked || Boolean(finishedDate.value),
        finishedDate: finishedDate.value,
        startedDate: startedDate.value,
        rating: Number(ratingInput.value),
        review: form.elements.review.value.trim(),
      });
      if (!saved) return;
      showToast("Book notes saved.");
      openBook(saved, "Saved in your library");
    });

    removeButton.addEventListener("click", () => removeBook(book.id));

    function updateRatingText() {
      const value = Number(ratingInput.value);
      ratingValue.textContent = value > 0 ? `${value.toFixed(1)} stars` : "Not rated";
      stars.textContent = value > 0 ? renderStars(value) : "No rating yet";
    }
  }

  function renderStars(value) {
    const rating = Number(value) || 0;
    let output = "";
    for (let star = 1; star <= 5; star += 1) {
      if (rating >= star) output += "★";
      else if (rating >= star - 0.5) output += "⯨";
      else output += "☆";
    }
    return output;
  }

  function showBookView(label) {
    document.body.classList.add("show-book");
    elements.returnLibrary.classList.remove("active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showLibrary() {
    document.body.classList.remove("show-book");
    elements.returnLibrary.classList.add("active");
    activeBook = null;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startExplore() {
    document.body.classList.add("exploring");
    elements.exploreLibrary.classList.add("active");
    if (window.BeccasRoom) {
      window.BeccasRoom.enter(library);
    }
  }

  function exitExplore() {
    document.body.classList.remove("exploring");
    elements.exploreLibrary.classList.remove("active");
    if (window.BeccasRoom) {
      window.BeccasRoom.exit();
    }
  }

  async function lookupAndAddBook(rawIsbn) {
    const isbn = normalizeIsbn(rawIsbn);
    if (!isbn) throw new Error("Scan or enter an ISBN first.");
    const existing = library.find((book) => book.isbns.includes(isbn));
    if (existing) return { book: existing, isNew: false };

    const book = await fetchBookData(isbn);
    if (!book) throw new Error("I could not find that ISBN.");
    const savedBook = await addBookToLibrary(book);
    if (!savedBook) throw new Error("The book could not be saved.");
    showToast(`${savedBook.title} was added.`);
    return { book: savedBook, isNew: true };
  }

  window.BeccasLibrary = {
    getBooks() {
      return library.slice();
    },
    lookupAndAddBook,
    exitExplore,
    getLanguage() {
      return settings.language;
    },
    translateInterfaceText,
    async updateBookNotes(bookId, changes) {
      return updateBook(bookId, changes);
    },
    async updateBookRender(bookId, changes) {
      const book = library.find((item) => item.id === bookId);
      if (!book) return null;
      return updateBook(bookId, { render: { ...(book.render || {}), ...changes } });
    },
    async moveBookToIndex(bookId, index) {
      const current = library.findIndex((book) => book.id === bookId);
      if (current < 0) return library.slice();
      const reordered = library.slice();
      const [book] = reordered.splice(current, 1);
      const target = Math.max(0, Math.min(index, reordered.length));
      reordered.splice(target, 0, book);
      try {
        const saved = await Promise.all(reordered.map((item, shelfSlot) => booksRepository.update({ ...item, shelfSlot })));
        library = saved;
        render();
      } catch (error) {
        reportDatabaseError("reorder the shelf", error);
        await initializeLibrary();
      }
      return library.slice();
    },
    async moveBookToSlot(bookId, slot) {
      await updateBook(bookId, { shelfSlot: slot });
      return library.slice();
    },
    openBookById(bookId, kicker = "From the shelf") {
      const book = library.find((item) => item.id === bookId);
      if (book) {
        exitExplore();
        openBook(book, kicker);
      }
    },
  };

  elements.scanButton.addEventListener("click", submitSearch);
  elements.cameraScanButton.addEventListener("click", openCameraScanner);
  elements.closeCameraScanner.addEventListener("click", closeCameraScanner);
  elements.cameraScannerModal.addEventListener("click", (event) => {
    if (event.target === elements.cameraScannerModal) closeCameraScanner();
  });
  elements.isbnInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitSearch();
    }
  });
  elements.isbnInput.addEventListener("input", () => {
    if (!document.body.classList.contains("show-book")) renderBooks();
  });
  elements.statusFilter.addEventListener("change", renderBooks);
  elements.sortBooks.addEventListener("change", renderBooks);
  elements.mobileFilterToggle.addEventListener("click", () => {
    const isOpen = elements.mobileFilterToggle.getAttribute("aria-expanded") === "true";
    elements.mobileFilterToggle.setAttribute("aria-expanded", String(!isOpen));
    elements.bookToolbar.classList.toggle("open", !isOpen);
  });
  elements.bookToolbar.addEventListener("change", () => {
    if (window.matchMedia("(max-width: 640px)").matches) {
      elements.mobileFilterToggle.setAttribute("aria-expanded", "false");
      elements.bookToolbar.classList.remove("open");
    }
  });
  document.addEventListener("click", (event) => {
    if (!elements.bookToolbar.contains(event.target) && !elements.mobileFilterToggle.contains(event.target)) {
      elements.mobileFilterToggle.setAttribute("aria-expanded", "false");
      elements.bookToolbar.classList.remove("open");
    }
  });
  elements.returnLibrary.addEventListener("click", showLibrary);
  elements.exploreLibrary.addEventListener("click", startExplore);
  elements.exploreMain.addEventListener("click", startExplore);
  elements.languageSelect.value = settings.language;
  elements.languageSelect.addEventListener("change", async () => {
    settings.language = elements.languageSelect.value;
    translationCache.clear();
    saveSettings();
    showToast("Language saved. New scans will prefer that language.");
    await translateSavedBooks();
    render();
    scheduleTranslatePage();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && elements.bookToolbar.classList.contains("open")) {
      elements.mobileFilterToggle.setAttribute("aria-expanded", "false");
      elements.bookToolbar.classList.remove("open");
      elements.mobileFilterToggle.focus();
      return;
    }
    if (event.key === "Escape" && !elements.cameraScannerModal.hidden) {
      closeCameraScanner();
      return;
    }
    if (event.key === "Escape" && document.body.classList.contains("show-book")) showLibrary();
    if (event.key === "/" && document.activeElement === document.body) {
      event.preventDefault();
      elements.isbnInput.focus();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && cameraStream) closeCameraScanner();
  });

  render();
  elements.isbnInput.focus();
  initializeLibrary().then((loaded) => {
    if (loaded) window.setTimeout(() => translateSavedBooks(), 350);
    window.setTimeout(() => scheduleTranslatePage(), 500);
  });
})();
