/* global supabase */
const config = window.BEXS_CONFIG;
const client = supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
const $ = (selector) => document.querySelector(selector);
let currentProfile = null;
let books = [];
let lookupTimer;

const normalizedUsername = (value) => value.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, "");
const memberEmail = (username) => `${normalizedUsername(username)}@members.bexslibrary.app`;
const setLoginState = (found, profile) => {
  $("#password-row").hidden = !found;
  $("#login-button").disabled = !found;
  $("#lookup-status").className = `lookup-status ${found ? "success" : "error"}`;
  if (found) {
    $("#lookup-status").textContent = `Card found. Welcome, ${profile.display_name || profile.username}.`;
    if (profile.avatar_url) {
      $("#member-photo").src = profile.avatar_url;
      $("#member-photo").hidden = false;
      $("#portrait-frame").hidden = false;
      $(".card-art").hidden = true;
    }
    $("#password").focus();
  } else {
    $("#lookup-status").textContent = "No member card found with that name.";
    $("#member-photo").hidden = true;
    $("#portrait-frame").hidden = true;
    $(".card-art").hidden = false;
  }
};

$("#username").addEventListener("input", () => {
  clearTimeout(lookupTimer);
  $("#password-row").hidden = true; $("#login-button").disabled = true; $("#member-photo").hidden = true;
  $("#portrait-frame").hidden = true; $(".card-art").hidden = false;
  const username = normalizedUsername($("#username").value);
  $("#lookup-status").className = "lookup-status";
  $("#lookup-status").textContent = username.length < 3 ? "Enter your username to find your card." : "Checking the card catalogue…";
  if (username.length < 3) return;
  lookupTimer = setTimeout(async () => {
    const { data, error } = await client.rpc("preview_member_card", { requested_username: username }).maybeSingle();
    if (error) { $("#lookup-status").textContent = "The catalogue is unavailable. Try again shortly."; return; }
    setLoginState(Boolean(data), data);
  }, 350);
});

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const username = normalizedUsername($("#username").value);
  $("#login-message").textContent = "Opening your library…";
  const { error } = await client.auth.signInWithPassword({ email: memberEmail(username), password: $("#password").value });
  if (error) { $("#login-message").className = "form-message error"; $("#login-message").textContent = "That password does not match this card."; return; }
  await openLibrary();
});

const openLibrary = async () => {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const { data: profile } = await client.from("profiles").select("username, display_name, avatar_url").eq("id", user.id).single();
  currentProfile = profile;
  $("#login-view").hidden = true; $("#app-view").hidden = false;
  const name = profile?.display_name || profile?.username || "reader";
  $("#member-name").textContent = `Cardholder: ${name}`; $("#welcome-name").textContent = name;
  await loadBooks();
};

const loadBooks = async () => {
  const { data, error } = await client.from("books").select("*").order("created_at", { ascending: false });
  if (error) { $("#book-count").textContent = "We couldn't retrieve your shelf."; return; }
  books = data || []; renderBooks();
};
const coverColor = (index) => ["#193d32", "#99472f", "#6a4769", "#785d2e", "#345865"][index % 5];
const renderBooks = () => {
  const grid = $("#book-grid"); grid.innerHTML = "";
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
  event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget));
  const metadata = { status: values.status, rating: values.rating ? Number(values.rating) : null, isbn: values.isbn, cover_url: values.cover_url, review: values.review };
  const { error } = await client.from("books").insert({ username: currentProfile.username, title: values.title, author: values.author, metadata });
  if (error) { $("#book-message").className = "form-message error"; $("#book-message").textContent = error.message; return; }
  event.currentTarget.reset(); $("#book-dialog").close(); await loadBooks();
});
document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => { const room = button.dataset.view === "room"; $("#collection-view").hidden = room; $("#room-view").hidden = !room; document.querySelectorAll(".nav-button").forEach((item) => item.classList.toggle("active", item === button)); }));
$("#sign-out").addEventListener("click", async () => { await client.auth.signOut(); window.location.reload(); });
client.auth.getSession().then(({ data }) => { if (data.session) openLibrary(); });
