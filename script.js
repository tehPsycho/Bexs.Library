/* global supabase */
const config = window.BEXS_CONFIG;
const client = supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
const { deserializeBook, serializeBook } = window.BexsBookMetadata;
const $ = (selector) => document.querySelector(selector);
let currentProfile = null;
let books = [];

const normalizedEmail = (value) => value.trim().toLowerCase();

const showLogin = () => {
  document.body.classList.remove("auth-loading");
  $("#app-view").hidden = true;
  $("#login-view").hidden = false;
};

const showLibrary = () => {
  document.body.classList.remove("auth-loading");
  $("#login-view").hidden = true;
  $("#app-view").hidden = false;
};

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = normalizedEmail($("#email").value);
  $("#login-message").textContent = "Opening your library…";
  const { error } = await client.auth.signInWithPassword({ email, password: $("#password").value });
  if (error) { $("#login-message").className = "form-message error"; $("#login-message").textContent = "That email or password is incorrect."; return; }
  await openLibrary();
});

const openLibrary = async () => {
  const { data: { user } } = await client.auth.getUser();
  if (!user) { showLogin(); return; }
  showLibrary();
  const { data: profile } = await client.from("profiles").select("username, display_name, avatar_url").eq("id", user.id).single();
  currentProfile = profile;
  const name = profile?.display_name || profile?.username || "reader";
  $("#member-name").textContent = `Cardholder: ${name}`; $("#welcome-name").textContent = name;
  await loadBooks();
};

const loadBooks = async () => {
  const { data, error } = await client.from("books").select("*").order("created_at", { ascending: false });
  if (error) { $("#book-count").textContent = "We couldn't retrieve your shelf."; return; }
  books = (data || []).map(deserializeBook); renderBooks();
};
const coverColor = (index) => ["#193d32", "#99472f", "#6a4769", "#785d2e", "#345865"][index % 5];
const renderBooks = () => {
  const grid = $("#book-grid"); grid.innerHTML = "";
  $("#book-count").textContent = `${books.length} ${books.length === 1 ? "book" : "books"} catalogued on your shelves.`;
  $("#empty-state").hidden = books.length > 0;
  books.forEach((book, index) => {
    const node = $("#book-template").content.cloneNode(true); const card = node.querySelector(".book-card");
    card.querySelector(".book-cover").style.background = coverColor(index); card.querySelector(".book-cover span").textContent = book.title.charAt(0);
    if (book.coverUrl) { const img = card.querySelector("img"); img.src = book.coverUrl; img.alt = `Cover of ${book.title}`; img.hidden = false; }
    card.querySelector("h3").textContent = book.title; card.querySelector(".book-author").textContent = book.authors.join(", ") || "Unknown author";
    card.querySelector(".book-status").textContent = book.isRead ? "Read" : "Catalogued";
    card.querySelector(".stars").textContent = book.rating ? `${"★".repeat(Math.round(book.rating))}${"☆".repeat(5-Math.round(book.rating))}` : "Not yet rated";
    card.querySelector(".book-review").textContent = book.review || "No reading notes yet.";
    card.querySelector(".delete-book").addEventListener("click", () => removeBook(book.id)); grid.append(node);
  });
  renderRoom();
};
const renderRoom = () => {
  [$("#shelf-1"), $("#shelf-2"), $("#shelf-3")].forEach((s) => s.innerHTML = "");
  books.forEach((book, index) => { const spine = document.createElement("div"); spine.className = "shelf-book"; spine.textContent = book.title; spine.title = `${book.title} by ${book.authors.join(", ") || "Unknown author"}`; spine.style.setProperty("--book-color", coverColor(index)); $(`#shelf-${index % 3 + 1}`).append(spine); });
};
const removeBook = async (id) => { if (!window.confirm("Remove this book from your shelf?")) return; const { error } = await client.from("books").delete().eq("id", id); if (!error) { books = books.filter((book) => book.id !== id); renderBooks(); } };

$("#show-add-book").addEventListener("click", () => $("#book-dialog").showModal());
$("#book-form").addEventListener("submit", async (event) => {
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  const record = serializeBook({ title: values.title, authors: [values.author], isbns: values.isbn ? [values.isbn] : [], coverUrl: values.cover_url, isRead: values.status === "Read", rating: values.rating, review: values.review });
  const { error } = await client.from("books").insert({ username: currentProfile.username, ...record });
  if (error) { $("#book-message").className = "form-message error"; $("#book-message").textContent = error.message; return; }
  event.currentTarget.reset(); $("#book-dialog").close(); await loadBooks();
});
document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => { const room = button.dataset.view === "room"; $("#collection-view").hidden = room; $("#room-view").hidden = !room; document.querySelectorAll(".nav-button").forEach((item) => item.classList.toggle("active", item === button)); }));
$("#sign-out").addEventListener("click", async () => { await client.auth.signOut(); window.location.reload(); });
client.auth.getSession().then(({ data }) => {
  if (data.session) openLibrary();
  else showLogin();
}).catch(showLogin);
