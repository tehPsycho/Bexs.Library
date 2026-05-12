const reviews = [
  {
    title: "Add your first review",
    author: "Book title + author",
    rating: "★★★★★",
    summary:
      "Use this card for a short hook, then link to your TikTok review, Etsy item, Amazon referral, or a longer post.",
    tag: "Template",
    link: "https://www.tiktok.com/@bexs.library",
  },
  {
    title: "Cozy favorite shelf",
    author: "Seasonal reads",
    rating: "★★★★☆",
    summary:
      "Highlight a themed list, like cozy mysteries, romantasy, middle grade, or books found in Little Free Libraries.",
    tag: "List idea",
    link: "#libraries",
  },
  {
    title: "Little Free Library find",
    author: "Map-connected review",
    rating: "To read",
    summary:
      "When a review comes from a library stop, add the same review URL to the matching map pin in data/libraries.json.",
    tag: "Map idea",
    link: "#libraries",
  },
];

const fallbackLibraries = [
  {
    name: "Example Neighborhood Library",
    slug: "example-neighborhood-library",
    status: "Wishlist",
    latitude: 39.8283,
    longitude: -98.5795,
    location: "United States",
    note: "Replace with a real Little Free Library location you plan to visit.",
    reviewTitle: "Planning notes",
    review: "Add what you hope to find, nearby stops, and the review link after your visit.",
    reviewUrl: "#reviews",
  },
];

const statusColors = {
  Visited: "#788461",
  Reviewed: "#9f5637",
  Wishlist: "#c49649",
};

const escapeHtml = (value = "") =>
  String(value).replace(/[&<>'"]/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };

    return entities[character];
  });

const libraryHash = (library) => `library-${library.slug}`;

const getLibraryUrl = (library) => `#${libraryHash(library)}`;

const renderReviews = () => {
  const reviewGrid = document.querySelector("#review-grid");

  reviewGrid.innerHTML = reviews
    .map(
      (review) => `
        <article class="review-card">
          <div class="review-cover" aria-hidden="true">${escapeHtml(review.title.charAt(0))}</div>
          <div>
            <p class="review-meta">${escapeHtml(review.tag)}</p>
            <h3>${escapeHtml(review.title)}</h3>
            <p>${escapeHtml(review.author)}</p>
          </div>
          <p>${escapeHtml(review.summary)}</p>
          <span class="rating">${escapeHtml(review.rating)}</span>
          <div class="review-actions">
            <a class="button button-secondary" href="${escapeHtml(review.link)}">Open link</a>
          </div>
        </article>
      `,
    )
    .join("");
};

const libraryIcon = (status) =>
  L.divIcon({
    className: "custom-library-marker",
    html: `<span style="background:${statusColors[status] || statusColors.Wishlist}">📚</span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -36],
  });

const renderLibraryDetail = (library) => {
  const libraryDetail = document.querySelector("#library-detail");
  const reviewUrl = library.reviewUrl || getLibraryUrl(library);

  libraryDetail.innerHTML = `
    <article class="library-detail-card">
      <p class="library-status">${escapeHtml(library.status)}</p>
      <h3>${escapeHtml(library.name)}</h3>
      <p class="library-location">${escapeHtml(library.location || "Location coming soon")}</p>
      <p>${escapeHtml(library.note)}</p>
      <div class="library-review-note">
        <h4>${escapeHtml(library.reviewTitle || "Review notes")}</h4>
        <p>${escapeHtml(library.review || "Add the review, TikTok recap, or book haul note here.")}</p>
      </div>
      <a class="button button-secondary" href="${escapeHtml(reviewUrl)}">Open review or page</a>
    </article>
  `;
};

const renderLibraryList = (libraries, selectedSlug) => {
  const libraryList = document.querySelector("#library-list");

  libraryList.innerHTML = libraries
    .map((library) => {
      const isSelected = library.slug === selectedSlug;

      return `
        <a class="library-item${isSelected ? " is-selected" : ""}" href="${escapeHtml(getLibraryUrl(library))}" data-library-slug="${escapeHtml(library.slug)}">
          <span class="library-status">${escapeHtml(library.status)}</span>
          <h4>${escapeHtml(library.name)}</h4>
          <p>${escapeHtml(library.location || "Location coming soon")}</p>
        </a>
      `;
    })
    .join("");
};

const initializeMap = (libraries) => {
  const map = L.map("library-map", {
    scrollWheelZoom: false,
    zoomControl: true,
  });
  const bounds = [];
  const markers = new Map();

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const selectLibrary = (slug, options = {}) => {
    const library = libraries.find((item) => item.slug === slug) || libraries[0];
    const marker = markers.get(library.slug);

    renderLibraryList(libraries, library.slug);
    renderLibraryDetail(library);

    if (marker) {
      marker.openPopup();
      if (options.pan !== false) {
        map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 11), { duration: 0.45 });
      }
    }
  };

  libraries.forEach((library) => {
    const coordinates = [library.latitude, library.longitude];
    bounds.push(coordinates);

    const marker = L.marker(coordinates, {
      icon: libraryIcon(library.status),
      title: library.name,
    })
      .addTo(map)
      .bindPopup(
        `<strong>${escapeHtml(library.name)}</strong><br>${escapeHtml(library.location || "")}` +
          `<br><a href="${escapeHtml(getLibraryUrl(library))}">Open library page</a>`,
      );

    marker.on("click", () => {
      window.location.hash = libraryHash(library);
      selectLibrary(library.slug, { pan: false });
    });

    markers.set(library.slug, marker);
  });

  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
  } else {
    map.setView(bounds[0], 5);
  }

  setTimeout(() => map.invalidateSize(), 0);

  document.querySelector("#library-list").addEventListener("click", (event) => {
    const libraryLink = event.target.closest("[data-library-slug]");

    if (!libraryLink) {
      return;
    }

    selectLibrary(libraryLink.dataset.librarySlug);
  });

  window.addEventListener("hashchange", () => {
    if (!window.location.hash.startsWith("#library-")) {
      return;
    }

    const slug = window.location.hash.replace("#library-", "");
    selectLibrary(slug);
  });

  const initialSlug = window.location.hash.startsWith("#library-")
    ? window.location.hash.replace("#library-", "")
    : libraries[0].slug;

  selectLibrary(initialSlug, { pan: false });
};

const normalizeLibraries = (libraries) =>
  libraries.map((library, index) => ({
    slug:
      library.slug ||
      library.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") ||
      `library-${index + 1}`,
    ...library,
  }));

const loadLibraries = async () => {
  try {
    const response = await fetch("data/libraries.json");
    if (!response.ok) {
      throw new Error("Unable to load library map data");
    }
    const libraries = await response.json();

    return normalizeLibraries(libraries);
  } catch (error) {
    console.warn(error);
    return normalizeLibraries(fallbackLibraries);
  }
};

const initializeNavigation = () => {
  const navToggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector("#nav-links");

  navToggle.addEventListener("click", () => {
    const isOpen = navLinks.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
};

const initializeSite = async () => {
  document.querySelector("#year").textContent = new Date().getFullYear();
  initializeNavigation();
  renderReviews();

  const libraries = await loadLibraries();
  renderLibraryList(libraries, libraries[0].slug);
  initializeMap(libraries);
};

initializeSite();
