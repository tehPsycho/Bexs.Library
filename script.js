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

const MASSACHUSETTS_CENTER = [42.4072, -71.3824];
const MASSACHUSETTS_DEFAULT_ZOOM = 8;

const fallbackLibraries = [
  {
    name: "Example Neighborhood Library",
    slug: "example-neighborhood-library",
    status: "Wishlist",
    latitude: 42.3601,
    longitude: -71.0589,
    location: "Boston, Massachusetts",
    note: "Replace with a real Little Free Library location you plan to visit in Massachusetts.",
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

const getStatusColor = (status) => statusColors[status] || statusColors.Wishlist;

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

const getCoordinateValue = (value) => {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const coordinate = Number(value);

  return Number.isFinite(coordinate) ? coordinate : null;
};

const hasValidCoordinates = (library) =>
  getCoordinateValue(library.latitude) !== null && getCoordinateValue(library.longitude) !== null;

const getCoordinates = (library) => [
  getCoordinateValue(library.latitude),
  getCoordinateValue(library.longitude),
];

const renderMapUnavailable = (message) => {
  const mapElement = document.querySelector("#library-map");

  mapElement.innerHTML = `
    <div class="map-unavailable">
      <strong>Map unavailable</strong>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
};

const latitudeToMercator = (latitude) => {
  const clampedLatitude = Math.max(Math.min(latitude, 85), -85);
  const radians = (clampedLatitude * Math.PI) / 180;

  return Math.log(Math.tan(Math.PI / 4 + radians / 2));
};

const getMapBounds = (libraries) => {
  const coordinates = libraries.filter(hasValidCoordinates).map(getCoordinates);

  if (!coordinates.length) {
    const [centerLatitude, centerLongitude] = MASSACHUSETTS_CENTER;

    return {
      minLatitude: centerLatitude - 1,
      maxLatitude: centerLatitude + 1,
      minLongitude: centerLongitude - 1.4,
      maxLongitude: centerLongitude + 1.4,
    };
  }

  const latitudes = coordinates.map(([latitude]) => latitude);
  const longitudes = coordinates.map(([, longitude]) => longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeRange = Math.max(maxLatitude - minLatitude, 0.7);
  const longitudeRange = Math.max(maxLongitude - minLongitude, 0.9);
  const latitudePadding = latitudeRange * 0.32;
  const longitudePadding = longitudeRange * 0.32;

  return {
    minLatitude: minLatitude - latitudePadding,
    maxLatitude: maxLatitude + latitudePadding,
    minLongitude: minLongitude - longitudePadding,
    maxLongitude: maxLongitude + longitudePadding,
  };
};

const getMapPosition = (library, bounds) => {
  const [latitude, longitude] = getCoordinates(library);
  const minMercator = latitudeToMercator(bounds.minLatitude);
  const maxMercator = latitudeToMercator(bounds.maxLatitude);
  const libraryMercator = latitudeToMercator(latitude);
  const x = ((longitude - bounds.minLongitude) / (bounds.maxLongitude - bounds.minLongitude)) * 100;
  const y = (1 - (libraryMercator - minMercator) / (maxMercator - minMercator)) * 100;

  return {
    x: Math.max(5, Math.min(95, x)),
    y: Math.max(7, Math.min(93, y)),
  };
};

const initializeMap = (libraries) => {
  const mapElement = document.querySelector("#library-map");
  const initialSlug = window.location.hash.startsWith("#library-")
    ? window.location.hash.replace("#library-", "")
    : libraries[0].slug;
  const mappedLibraries = libraries.filter(hasValidCoordinates);
  const bounds = getMapBounds(libraries);

  if (!mappedLibraries.length) {
    const selectLibraryWithoutMap = (slug) => {
      const library = libraries.find((item) => item.slug === slug) || libraries[0];

      renderLibraryList(libraries, library.slug);
      renderLibraryDetail(library);
    };

    renderMapUnavailable("Add latitude and longitude values to data/libraries.json to place pins on the map.");
    selectLibraryWithoutMap(initialSlug);

    document.querySelector("#library-list").addEventListener("click", (event) => {
      const libraryLink = event.target.closest("[data-library-slug]");

      if (!libraryLink) {
        return;
      }

      selectLibraryWithoutMap(libraryLink.dataset.librarySlug);
    });

    return;
  }

  mapElement.innerHTML = `
    <div class="simple-map" aria-hidden="true">
      <span class="simple-map-label simple-map-label-north">N</span>
      <span class="simple-map-label simple-map-label-south">S</span>
      <span class="simple-map-label simple-map-label-west">W</span>
      <span class="simple-map-label simple-map-label-east">E</span>
      <div class="simple-map-river"></div>
      <div class="simple-map-road simple-map-road-one"></div>
      <div class="simple-map-road simple-map-road-two"></div>
      <div class="simple-map-region simple-map-region-one"></div>
      <div class="simple-map-region simple-map-region-two"></div>
      <div class="simple-map-region simple-map-region-three"></div>
    </div>
    <div class="map-marker-layer"></div>
  `;

  const markerLayer = mapElement.querySelector(".map-marker-layer");

  mappedLibraries.forEach((library) => {
    const marker = document.createElement("button");
    const { x, y } = getMapPosition(library, bounds);

    marker.className = "custom-library-marker";
    marker.type = "button";
    marker.dataset.librarySlug = library.slug;
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.style.setProperty("--marker-color", getStatusColor(library.status));
    marker.setAttribute("aria-label", `${library.name} in ${library.location || "a saved location"}`);
    marker.innerHTML = '<span aria-hidden="true">📚</span>';
    markerLayer.appendChild(marker);
  });

  const selectLibrary = (slug) => {
    const library = libraries.find((item) => item.slug === slug) || libraries[0];

    renderLibraryList(libraries, library.slug);
    renderLibraryDetail(library);

    markerLayer.querySelectorAll(".custom-library-marker").forEach((marker) => {
      marker.classList.toggle("is-selected", marker.dataset.librarySlug === library.slug);
    });
  };

  markerLayer.addEventListener("click", (event) => {
    const marker = event.target.closest("[data-library-slug]");

    if (!marker) {
      return;
    }

    window.location.hash = marker.dataset.librarySlug ? `library-${marker.dataset.librarySlug}` : "libraries";
    selectLibrary(marker.dataset.librarySlug);
  });

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

  selectLibrary(initialSlug);
};

const normalizeLibraries = (libraries) =>
  libraries.map((library, index) => {
    const latitude = getCoordinateValue(library.latitude);
    const longitude = getCoordinateValue(library.longitude);

    return {
      ...library,
      latitude: latitude ?? library.latitude,
      longitude: longitude ?? library.longitude,
      slug:
        library.slug ||
        library.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") ||
        `library-${index + 1}`,
    };
  });

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
