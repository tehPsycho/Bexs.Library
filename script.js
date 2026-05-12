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
    status: "Wishlist",
    latitude: 39.8283,
    longitude: -98.5795,
    note: "Replace with a real Little Free Library location you plan to visit.",
    reviewUrl: "#reviews",
  },
];

const renderReviews = () => {
  const reviewGrid = document.querySelector("#review-grid");

  reviewGrid.innerHTML = reviews
    .map(
      (review) => `
        <article class="review-card">
          <div class="review-cover" aria-hidden="true">${review.title.charAt(0)}</div>
          <div>
            <p class="review-meta">${review.tag}</p>
            <h3>${review.title}</h3>
            <p>${review.author}</p>
          </div>
          <p>${review.summary}</p>
          <span class="rating">${review.rating}</span>
          <div class="review-actions">
            <a class="button button-secondary" href="${review.link}">Open link</a>
          </div>
        </article>
      `,
    )
    .join("");
};

const libraryIcon = (status) => {
  const colors = {
    Visited: "#6f8c6f",
    Reviewed: "#b65b3a",
    Wishlist: "#e8b75f",
  };

  return L.divIcon({
    className: "custom-library-marker",
    html: `<span style="background:${colors[status] || colors.Wishlist}">📚</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18],
  });
};

const renderLibraryList = (libraries) => {
  const libraryList = document.querySelector("#library-list");

  libraryList.innerHTML = libraries
    .map(
      (library) => `
        <article class="library-item">
          <span class="library-status">${library.status}</span>
          <h4>${library.name}</h4>
          <p>${library.note}</p>
          <p><a href="${library.reviewUrl}">Review or video</a></p>
        </article>
      `,
    )
    .join("");
};

const initializeMap = (libraries) => {
  const map = L.map("library-map", { scrollWheelZoom: false });
  const bounds = [];

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  libraries.forEach((library) => {
    const coordinates = [library.latitude, library.longitude];
    bounds.push(coordinates);

    L.marker(coordinates, { icon: libraryIcon(library.status) })
      .addTo(map)
      .bindPopup(
        `<strong>${library.name}</strong><br>${library.status}<br>${library.note}<br><a href="${library.reviewUrl}">Open review</a>`,
      );
  });

  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [40, 40] });
    return;
  }

  map.setView(bounds[0], 4);
};

const loadLibraries = async () => {
  try {
    const response = await fetch("data/libraries.json");
    if (!response.ok) {
      throw new Error("Unable to load library map data");
    }
    return response.json();
  } catch (error) {
    console.warn(error);
    return fallbackLibraries;
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
  renderLibraryList(libraries);
  initializeMap(libraries);
};

initializeSite();
