/* global supabase */
(() => {
  const $ = (selector) => document.querySelector(selector);
  let client;
  let renderAppPromise = null;
  let openingLibrary = false;

  const setMessage = (element, message, type = "") => {
    element.className = `form-message${type ? ` ${type}` : ""}`;
    element.textContent = message;
  };

  const authModal = () => $("#auth-modal");
  const setFormBusy = (form, busy) => {
    const submit = form.querySelector('button[type="submit"]');
    if (!submit) return;
    submit.disabled = busy;
    submit.setAttribute("aria-busy", String(busy));
  };

  const authRequest = async (form, pendingMessage, request) => {
    setFormBusy(form, true);
    setMessage($("#auth-modal-message"), pendingMessage);
    let timeout;
    try {
      return await Promise.race([
        request(),
        new Promise((resolve) => {
          timeout = window.setTimeout(() => resolve({ timedOut: true }), 15000);
        }),
      ]);
    } catch (error) {
      console.error("Supabase authentication request failed", error);
      return { error: error instanceof Error ? error : new Error("The authentication service could not be reached.") };
    } finally {
      window.clearTimeout(timeout);
      setFormBusy(form, false);
    }
  };

  const showAuthModal = (mode, email = "") => {
    const content = {
      signup: ["Membership desk", "Request a library card", "Create your account, then follow the confirmation link we send to your email before signing in."],
      reset: ["Member help", "Reset your password", "Enter your member email and we’ll send you a secure link to choose a new password."],
      update: ["Member help", "Choose a new password", "Enter and confirm the new password for your library account."],
    }[mode];
    $("#auth-modal-eyebrow").textContent = content[0];
    $("#auth-modal-title").textContent = content[1];
    $("#auth-modal-description").textContent = content[2];
    ["signup", "reset-request", "update-password"].forEach((name) => {
      $(`#${name}-form`).hidden = name !== (mode === "reset" ? "reset-request" : mode === "update" ? "update-password" : "signup");
    });
    setMessage($("#auth-modal-message"), "");
    if (mode === "signup") $("#signup-email").value = email;
    if (mode === "reset") $("#reset-email").value = email;
    authModal().hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => authModal().querySelector("input")?.focus());
  };

  const closeAuthModal = () => {
    authModal().hidden = true;
    document.body.style.overflow = "";
  };

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

    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    $("#request-card").addEventListener("click", () => showAuthModal("signup", $("#email").value.trim()));
    $("#forgot-password").addEventListener("click", () => showAuthModal("reset", $("#email").value.trim()));
    $("#close-auth-modal").addEventListener("click", closeAuthModal);
    authModal().addEventListener("click", (event) => {
      if (event.target === authModal()) closeAuthModal();
    });

    $("#signup-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const email = $("#signup-email").value.trim().toLowerCase();
      const password = $("#signup-password").value;
      if (password !== $("#signup-confirm-password").value) {
        setMessage($("#auth-modal-message"), "Passwords do not match.", "error");
        return;
      }
      const { data, error, timedOut } = await authRequest(form, "Requesting your card…", () =>
        client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }));
      if (timedOut) {
        setMessage($("#auth-modal-message"), "This is taking longer than expected. Check your inbox for the confirmation email before trying again.", "success");
        return;
      }
      if (error) {
        setMessage($("#auth-modal-message"), error.message || "We could not create your account.", "error");
        return;
      }
      if (data.session) client.auth.signOut().catch((signOutError) => console.error("Could not clear the new session", signOutError));
      form.reset();
      setMessage($("#auth-modal-message"), "Check your inbox and confirm your email before signing in.", "success");
    });

    $("#reset-request-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const email = $("#reset-email").value.trim().toLowerCase();
      const { error, timedOut } = await authRequest(form, "Sending your reset link…", () =>
        client.auth.resetPasswordForEmail(email, { redirectTo }));
      const message = timedOut
        ? "This is taking longer than expected. Check your inbox before requesting another link."
        : error ? (error.message || "We could not send the reset email.") : "If that email belongs to a member, a reset link is on its way.";
      setMessage($("#auth-modal-message"), message, error ? "error" : "success");
    });

    $("#update-password-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const password = $("#new-password").value;
      if (password !== $("#confirm-new-password").value) {
        setMessage($("#auth-modal-message"), "Passwords do not match.", "error");
        return;
      }
      const { error, timedOut } = await authRequest(form, "Saving your new password…", () => client.auth.updateUser({ password }));
      if (timedOut) {
        setMessage($("#auth-modal-message"), "This is taking longer than expected. Please check your connection and try again.", "error");
        return;
      }
      if (error) {
        setMessage($("#auth-modal-message"), error.message || "We could not update your password.", "error");
        return;
      }
      form.reset();
      setMessage($("#auth-modal-message"), "Password updated. You can continue to your library.", "success");
    });

    $("#member-reset-password").addEventListener("click", async () => {
      const { data } = await client.auth.getUser();
      if (!data.user?.email) return;
      const { error } = await client.auth.resetPasswordForEmail(data.user.email, { redirectTo });
      setMenuOpen(false);
      window.alert(error ? (error.message || "We could not send the reset email.") : `A password reset link was sent to ${data.user.email}.`);
    });

    client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") showAuthModal("update");
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
        if (!authModal().hidden) closeAuthModal();
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
