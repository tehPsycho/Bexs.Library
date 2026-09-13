/* global supabase */
const config = window.BEXS_CONFIG;
const client = supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
const $ = (selector) => document.querySelector(selector);
let currentProfile = null;
let currentUser = null;
let books = [];
let authGeneration = 0;

const normalizedEmail = (value) => value.trim().toLowerCase();
const isCurrentUser = (user, generation) => currentUser?.id === user.id && authGeneration === generation;

const showLogin = () => {
  document.body.classList.remove("auth-loading", "exploring", "show-book");
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
};

const showLibrary = () => {
  document.body.classList.remove("auth-loading");
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
};

const setCollectionView = () => {
  $("#collection-view").hidden = false;
  $("#room-view").hidden = true;
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === "collection");
  });
};

const clearLibraryState = () => {
  authGeneration += 1;
  currentUser = null;
  currentProfile = null;
  books = [];
  $("#book-grid").replaceChildren();
  [$("#shelf-1"), $("#shelf-2"), $("#shelf-3")].forEach((shelf) => shelf.replaceChildren());
  $("#empty-state").hidden = true;
  $("#load-error").hidden = true;
  $("#book-count").textContent = "Your shelves are waiting.";
  $("#member-name").textContent = "";
  $("#welcome-name").textContent = "reader";
  if ($("#book-dialog").open) $("#book-dialog").close();
  if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
  setCollectionView();
};

const returnToLogin = () => {
  clearLibraryState();
  showLogin();
};

const showLoadError = (message) => {
  books = [];
  $("#book-grid").replaceChildren();
  [$("#shelf-1"), $("#shelf-2"), $("#shelf-3")].forEach((shelf) => shelf.replaceChildren());
  $("#empty-state").hidden = true;
  $("#load-error-message").textContent = message;
  $("#load-error").hidden = false;
  $("#book-count").textContent = "Your shelf could not be loaded.";
};

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = normalizedEmail($("#email").value);
  $("#login-message").className = "form-message";
  $("#login-message").textContent = "Opening your library…";
  const { error } = await client.auth.signInWithPassword({ email, password: $("#password").value });
  if (error) {
    $("#login-message").className = "form-message error";
    $("#login-message").textContent = "That email or password is incorrect.";
  }
});

const openLibrary = async (user) => {
  if (!user) { returnToLogin(); return; }
  currentUser = user;
  const generation = ++authGeneration;
  showLibrary();
  $("#load-error").hidden = true;
  $("#empty-state").hidden = true;
  $("#book-count").textContent = "Loading your shelves…";

  const { data: profile, error } = await client.from("profiles").select("username, display_name, avatar_url").eq("id", user.id).single();
  if (!isCurrentUser(user, generation)) return;
  if (error || !profile) {
    currentProfile = null;
    showLoadError("We couldn't load your member profile. Please try again.");
    return;
  }

  currentProfile = profile;
  const name = profile.display_name || profile.username || "reader";
  $("#member-name").textContent = `Cardholder: ${name}`;
  $("#welcome-name").textContent = name;
  await loadBooks(user, generation);
};

const loadBooks = async (user = currentUser, generation = authGeneration) => {
  if (!user || !isCurrentUser(user, generation)) return;
  $("#load-error").hidden = true;
  $("#empty-state").hidden = true;
  $("#book-count").textContent = "Loading your shelves…";
  const { data, error } = await client.from("books").select("*").order("created_at", { ascending: false });
  if (!isCurrentUser(user, generation)) return;
  if (error) {
    showLoadError("We couldn't retrieve your books. Check your connection and try again.");
    return;
  }
  books = data || [];
  renderBooks();
};

const coverColor = (index) => ["#193d32", "#99472f", "#6a4769", "#785d2e", "#345865"][index % 5];
const renderBooks = () => {
  const grid = $("#book-grid"); grid.innerHTML = "";
  $("#load-error").hidden = true;
  $("#book-count").textContent = `${books.length} ${books.length === 1 ? "book" : "books"} catalogued on your shelves.`;
  $("#empty-state").hidden = books.length > 0;
  books.forEach((book, index) => {
    const node = $("#book-template").content.cloneNode(true); const card = node.querySelector(".book-card");
    card.querySelector(".book-cover").style.background = coverColor(index); card.querySelector(".book-cover span").textContent = book.title.charAt(0);
    if (book.metadata?.cover_url) { const img = card.querySelector("img"); img.src = book.metadata.cover_url; img.alt = `Cover of ${book.title}`; img.hidden = false; }
    card.querySelector("h3").textContent = book.title; card.querySelector(".book-author").textContent = book.author;
    card.querySelector(".book-status").textContent = book.metadata?.status || "Catalogued";
    card.querySelector(".stars").textContent = book.metadata?.rating ? `${"★".repeat(book.metadata.rating)}${"☆".repeat(5-book.metadata.rating)}` : "Not yet rated";
    card.querySelector(".book-review").textContent = book.metadata?.review || "No reading notes yet.";
    card.querySelector(".delete-book").addEventListener("click", () => removeBook(book.id)); grid.append(node);
  });
  renderRoom();
};
const renderRoom = () => {
  [$("#shelf-1"), $("#shelf-2"), $("#shelf-3")].forEach((s) => s.innerHTML = "");
  books.forEach((book, index) => { const spine = document.createElement("div"); spine.className = "shelf-book"; spine.textContent = book.title; spine.title = `${book.title} by ${book.author}`; spine.style.setProperty("--book-color", coverColor(index)); $(`#shelf-${index % 3 + 1}`).append(spine); });
};
const removeBook = async (id) => { if (!window.confirm("Remove this book from your shelf?")) return; const { error } = await client.from("books").delete().eq("id", id); if (!error) { books = books.filter((book) => book.id !== id); renderBooks(); } };

$("#show-add-book").addEventListener("click", () => $("#book-dialog").showModal());
$("#book-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!currentUser || !currentProfile) { showLoadError("Your member profile is unavailable. Please try loading your library again."); return; }
  const values = Object.fromEntries(new FormData(event.currentTarget));
  const metadata = { status: values.status, rating: values.rating ? Number(values.rating) : null, isbn: values.isbn, cover_url: values.cover_url, review: values.review };
  const { error } = await client.from("books").insert({ username: currentProfile.username, title: values.title, author: values.author, metadata });
  if (error) { $("#book-message").className = "form-message error"; $("#book-message").textContent = error.message; return; }
  event.currentTarget.reset(); $("#book-dialog").close(); await loadBooks();
});
document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => {
  if (!currentUser) return;
  const room = button.dataset.view === "room"; $("#collection-view").hidden = room; $("#room-view").hidden = !room;
  document.querySelectorAll(".nav-button").forEach((item) => item.classList.toggle("active", item === button));
}));
$("#retry-library").addEventListener("click", () => currentUser && openLibrary(currentUser));
$("#sign-out").addEventListener("click", async () => {
  returnToLogin();
  const { error } = await client.auth.signOut();
  if (error) {
    $("#login-message").className = "form-message error";
    $("#login-message").textContent = "You were returned to sign in, but the server could not finish signing out. Please try again.";
  }
});

client.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session?.user) {
    returnToLogin();
  } else if (event === "SIGNED_IN" && currentUser?.id !== session.user.id) {
    openLibrary(session.user);
  }
});

const initializeSession = async () => {
  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session?.user) { returnToLogin(); return; }
    await openLibrary(data.session.user);
  } catch (_error) {
    returnToLogin();
  }
};

initializeSession();
