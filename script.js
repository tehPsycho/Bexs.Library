/* global supabase */
const config = window.BEXS_CONFIG;
const client = supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
const $ = (selector) => document.querySelector(selector);
let renderAppPromise = null;

const normalizedEmail = (value) => value.trim().toLowerCase();

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

// The catalogue owns window.BeccasLibrary. Load the room module only after that
// public API exists so there can never be two competing room implementations.
const initializeRenderApplication = () => {
  if (renderAppPromise) return renderAppPromise;
  renderAppPromise = new Promise((resolve, reject) => {
    const application = document.createElement("script");
    application.src = "app.js";
    application.addEventListener("load", async () => {
      if (!window.BeccasLibrary) {
        reject(new Error("The library application did not initialize."));
        return;
      }
      try {
        await import("./room.js");
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    application.addEventListener("error", () => reject(new Error("The library application could not be loaded.")));
    document.body.append(application);
  });
  return renderAppPromise;
};

const openLibrary = async () => {
  const { data: { user } } = await client.auth.getUser();
  if (!user) {
    showLogin();
    return;
  }

  const { data: profile } = await client
    .from("profiles")
    .select("username, display_name, avatar_url")
    .eq("id", user.id)
    .single();
  const name = profile?.display_name || profile?.username || "reader";
  $("#member-name").textContent = `Cardholder: ${name}`;
  showLibrary();

  try {
    await initializeRenderApplication();
  } catch (error) {
    console.error(error);
    $("#login-message").className = "form-message error";
    $("#login-message").textContent = "Your library could not be opened. Please refresh and try again.";
  }
};

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = normalizedEmail($("#email").value);
  $("#login-message").textContent = "Opening your library…";
  const { error } = await client.auth.signInWithPassword({ email, password: $("#password").value });
  if (error) {
    $("#login-message").className = "form-message error";
    $("#login-message").textContent = "That email or password is incorrect.";
    return;
  }
  await openLibrary();
});

$("#sign-out").addEventListener("click", async () => {
  window.BeccasLibrary?.exitExplore();
  showLogin();
  await client.auth.signOut();
  window.location.reload();
});

client.auth.getSession()
  .then(({ data }) => (data.session ? openLibrary() : showLogin()))
  .catch(showLogin);
