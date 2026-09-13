/* global supabase */
(() => {
  const $ = (selector) => document.querySelector(selector);
  let client;
  let renderAppPromise = null;
  let openingLibrary = false;

  const showLogin = (message = "") => {
    document.body.classList.remove("auth-loading", "exploring", "show-book");
    $("#app-view").hidden = true;
    $("#login-view").hidden = false;
    if (message) {
      $("#login-message").className = "form-message error";
      $("#login-message").textContent = message;
    }
  };

  const showLibrary = () => {
    document.body.classList.remove("auth-loading");
    $("#login-view").hidden = true;
    $("#app-view").hidden = false;
  };

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
    if (openingLibrary) return;
    openingLibrary = true;
    try {
      const { data: { user }, error: userError } = await client.auth.getUser();
      if (userError || !user) {
        showLogin();
        return;
      }

      const { data: profile, error: profileError } = await client
        .from("profiles")
        .select("username, display_name, avatar_url")
        .eq("id", user.id)
        .single();
      if (profileError || !profile) throw profileError || new Error("Your member profile is missing.");

      const name = profile.display_name || profile.username || "reader";
      $("#member-name").textContent = name;
      $("#member-name").title = `Signed in as ${name}`;
      const avatar = $("#member-avatar");
      avatar.textContent = name.trim().charAt(0).toUpperCase() || "B";
      if (profile.avatar_url) {
        const image = document.createElement("img");
        image.src = window.BexsBookMetadata.normalizeCoverUrl(profile.avatar_url);
        image.alt = "";
        image.addEventListener("error", () => image.remove());
        avatar.append(image);
      }
      showLibrary();
      await initializeRenderApplication();
    } catch (error) {
      console.error("Could not open the library", error);
      showLogin("Your library could not be opened. Check the browser console and Supabase setup, then try again.");
    } finally {
      openingLibrary = false;
    }
  };

  const initialize = async () => {
    const config = window.BEXS_CONFIG;
    if (!window.supabase?.createClient) {
      showLogin("The Supabase client could not be loaded. Check your connection and content blockers, then refresh.");
      return;
    }
    if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
      showLogin("Supabase is not configured. Add the project URL and publishable key to config.js.");
      return;
    }

    client = supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
    window.BexsSupabaseClient = client;

    $("#login-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = $("#email").value.trim().toLowerCase();
      $("#login-message").className = "form-message";
      $("#login-message").textContent = "Opening your library…";
      const { error } = await client.auth.signInWithPassword({ email, password: $("#password").value });
      if (error) {
        $("#login-message").className = "form-message error";
        $("#login-message").textContent = error.message || "That email or password is incorrect.";
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

    const menuToggle = $("#member-menu-toggle");
    const menuPopover = $("#member-menu-popover");
    const setMenuOpen = (open) => {
      menuPopover.hidden = !open;
      menuToggle.setAttribute("aria-expanded", String(open));
    };
    menuToggle.addEventListener("click", () => setMenuOpen(menuPopover.hidden));
    document.addEventListener("click", (event) => {
      if (!event.target.closest(".member-menu")) setMenuOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuToggle.focus();
      }
    });

    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (data.session) await openLibrary();
      else showLogin();
    } catch (error) {
      console.error("Could not restore the Supabase session", error);
      showLogin("We could not contact Supabase. Check the project settings and your connection, then refresh.");
    }
  };

  initialize();
})();
