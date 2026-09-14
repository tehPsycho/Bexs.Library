import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

const canvas = document.querySelector("#exploreCanvas");
const exploreMode = document.querySelector("#exploreMode");
const prompt = document.querySelector("#explorePrompt");
const exitButton = document.querySelector("#exitExplore");
const scannerModal = document.querySelector("#scannerModal");
const scannerForm = document.querySelector("#exploreScanForm");
const scannerInput = document.querySelector("#exploreIsbn");
const cancelScan = document.querySelector("#cancelExploreScan");
const overlay = document.querySelector("#heldBookOverlay");
const overlayClose = document.querySelector("#closeHeldBookOverlay");
const overlayCover = document.querySelector("#heldBookCover");
const overlayFallback = document.querySelector("#heldBookCoverFallback");
const overlayTitle = document.querySelector("#heldBookTitle");
const overlayAuthor = document.querySelector("#heldBookAuthor");
const overlaySynopsis = document.querySelector("#heldBookSynopsis");
const overlayForm = document.querySelector("#heldBookForm");
const overlayRatingText = document.querySelector("#heldBookRatingText");
const overlayReview = document.querySelector("#heldBookReview");
const inspectBar = document.querySelector("#inspectBar");
const inspectStars = document.querySelector("#inspectStars");
const spineColorInput = document.querySelector("#spineColorInput");
const pageColorInput = document.querySelector("#pageColorInput");
const bookSizeSlider = document.querySelector("#bookSizeSlider");
const bookThicknessSlider = document.querySelector("#bookThicknessSlider");
const mobileControls = document.querySelector("#mobileControls");
const moveTouchZone = document.querySelector("#moveTouchZone");
const lookTouchZone = document.querySelector("#lookTouchZone");
const joystickKnob = document.querySelector("#joystickKnob");
const mobileInteract = document.querySelector("#mobileInteract");
const mobileFlipBook = document.querySelector("#mobileFlipBook");
const mobileReviewBook = document.querySelector("#mobileReviewBook");
const api = window.BeccasLibrary;

if (canvas && api) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: localStorage.getItem("beccas-library:verify") === "1",
  });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.BasicShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x261c18);
  scene.fog = new THREE.Fog(0x261c18, 7, 18);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 90);
  const raycaster = new THREE.Raycaster();
  const centerPointer = new THREE.Vector2(0, 0);
  const clock = new THREE.Clock();
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");

  const player = { position: new THREE.Vector3(0, 1.55, 4.25), yaw: 0, pitch: -0.06, speed: 3.25 };
  const keys = new Set();
  const touchMove = new THREE.Vector2();
  const coarsePointer = window.matchMedia("(any-pointer: coarse)");
  let touchCapable = navigator.maxTouchPoints > 0 || coarsePointer.matches || "ontouchstart" in window;
  const bookMeshes = [];
  const hoverTargets = [];
  const textureCache = new Map();
  const colorInference = new Set();
  let active = false;
  let hovered = null;
  let placementSlot = null;
  let scannerOpen = false;
  let overlayOpen = false;
  let held = null;
  let inspectMode = false;
  let inspectDragging = false;
  let celebratingId = null;
  let celebration = null;
  let lastSignature = "";
  let frameId = 0;
  let promptRevision = 0;
  let movePointerId = null;
  let lookPointerId = null;
  let lookLastX = 0;
  let lookLastY = 0;
  let lookTravel = 0;

  exploreMode.classList.toggle("touch-enabled", touchCapable);

  const palette = [0x7b2e3b, 0x283f59, 0x49664b, 0x704128, 0x9b6539, 0x384b3d, 0x6f4b57];
  const sizeProfiles = {
    small: { label: "S", width: 0.16, height: 0.72 },
    medium: { label: "M", width: 0.19, height: 0.84 },
    large: { label: "L", width: 0.23, height: 0.96 },
  };
  const thicknessProfiles = {
    slim: { label: "Slim", depth: 0.42 },
    regular: { label: "Reg", depth: 0.52 },
    thick: { label: "Thick", depth: 0.64 },
  };
  const shelfConfig = {
    rowSurfaces: [0.48, 1.56, 2.64],
    boardCenters: [1.52, 2.6],
    bookZ: -3.82,
    slotsPerRow: 16,
    slotStartX: -2.7,
    slotGap: 0.36,
  };
  const materials = {
    wall: new THREE.MeshLambertMaterial({ color: 0xd6c0a4 }),
    floor: new THREE.MeshLambertMaterial({ color: 0x7a5134 }),
    wood: new THREE.MeshLambertMaterial({ color: 0x6f4328 }),
    darkWood: new THREE.MeshLambertMaterial({ color: 0x2d170e }),
    brass: new THREE.MeshLambertMaterial({ color: 0xc79d43 }),
    laptop: new THREE.MeshLambertMaterial({ color: 0x111821 }),
    screen: new THREE.MeshBasicMaterial({ color: 0x6fb7d8 }),
    scanner: new THREE.MeshLambertMaterial({ color: 0x20252a }),
    glow: new THREE.MeshBasicMaterial({ color: 0xffc43d }),
    pages: new THREE.MeshLambertMaterial({ color: 0xf5ead7 }),
    top: new THREE.MeshLambertMaterial({ color: 0x221b17 }),
  };
  const sharedMaterials = new Set(Object.values(materials));
  const hoverMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const placementMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.2, 0.78, 0.52),
    new THREE.MeshBasicMaterial({ color: 0xc79d43, transparent: true, opacity: 0.34, depthWrite: false }),
  );
  placementMarker.visible = false;
  scene.add(placementMarker);

  buildRoom();
  updateCamera();
  renderShelf(api.getBooks());
  resize();
  renderer.render(scene, camera);

  window.BeccasRoom = {
    enter(books) {
      active = true;
      scannerOpen = false;
      exitInspectMode(false);
      closeOverlay();
      scannerModal.classList.remove("open");
      scannerModal.setAttribute("aria-hidden", "true");
      player.position.set(0, 1.55, 4.25);
      player.yaw = 0;
      player.pitch = -0.06;
      renderShelf(books || api.getBooks());
      resize();
      updateCamera();
      setPrompt(touchCapable
        ? "Use the left stick to move. Drag the right side to aim and look around."
        : "WASD to move. Mouse look is active. Walk to the bookshelf or scanner table.");
      canvas.focus();
      if (touchCapable) {
        mobileControls?.setAttribute("aria-hidden", "false");
        requestMobilePresentation();
      } else {
        canvas.requestPointerLock?.();
      }
      startLoop();
    },
    exit() {
      active = false;
      scannerOpen = false;
      exitInspectMode(false);
      closeOverlay();
      scannerModal.classList.remove("open");
      scannerModal.setAttribute("aria-hidden", "true");
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      if (document.fullscreenElement === exploreMode) document.exitFullscreen?.();
      setHovered(null);
      resetTouchControls();
      mobileControls?.setAttribute("aria-hidden", "true");
      stopLoop();
    },
    render(nextBooks) {
      renderShelf(nextBooks || api.getBooks());
      refreshHeldFromLibrary();
    },
    __testAimFirstBook() {
      if (!bookMeshes.length) return false;
      const target = bookMeshes[0].position.clone();
      const direction = target.sub(player.position);
      player.yaw = Math.atan2(direction.x, -direction.z);
      player.pitch = -Math.atan2(direction.y, Math.hypot(direction.x, direction.z));
      updateCamera();
      setHovered(bookMeshes[0]);
      setPrompt(`${bookMeshes[0].userData.book.title}. Press E or click to pick it up.`);
      return true;
    },
    __testPickFirstBook() {
      if (!bookMeshes.length) return false;
      pickUpBook(bookMeshes[0].userData.book);
      return true;
    },
    __testPlayerState() {
      return {
        x: player.position.x,
        z: player.position.z,
        yaw: player.yaw,
        pitch: player.pitch,
        touchX: touchMove.x,
        touchY: touchMove.y,
      };
    },
  };

  exitButton.addEventListener("click", () => api.exitExplore());
  cancelScan.addEventListener("click", closeScanner);
  scannerForm.addEventListener("submit", handleScannerSubmit);
  overlayClose?.addEventListener("click", () => exitInspectMode(true));
  overlayForm.addEventListener("submit", saveHeldNotes);
  buildInspectStars();
  buildRenderControls();
  canvas.addEventListener("click", handlePrimaryAction);
  mobileInteract?.addEventListener("click", handlePrimaryAction);
  mobileFlipBook?.addEventListener("click", flipHeldBook);
  mobileReviewBook?.addEventListener("click", () => {
    if (!held) return;
    if (inspectMode) exitInspectMode(true);
    else enterInspectMode();
  });
  installTouchControls();

  // Some embedded iOS browsers do not advertise maxTouchPoints until their
  // first touch. Promote the room at runtime so those players still get the
  // controls instead of falling into desktop pointer-lock mode.
  window.addEventListener("touchstart", enableTouchControls, { passive: true, once: true });

  function enableTouchControls() {
    if (touchCapable) return;
    touchCapable = true;
    exploreMode.classList.add("touch-enabled");
    if (active) mobileControls?.setAttribute("aria-hidden", "false");
  }

  function handlePrimaryAction() {
    if (!active || scannerOpen || overlayOpen || inspectMode) return;
    if (held && nearShelf()) {
      putHeldBookBack();
      return;
    }
    if (hovered) {
      pickUpBook(hovered.userData.book);
      return;
    }
    if (nearScanner()) {
      openScanner();
      return;
    }
    if (!touchCapable) canvas.requestPointerLock?.();
  }
  window.addEventListener("mousemove", (event) => {
    if (!active || scannerOpen || overlayOpen) return;
    if (inspectMode) {
      if (inspectDragging && held) rotateInspectedBook(event.movementX, event.movementY);
      return;
    }
    if (document.pointerLockElement === canvas) look(event.movementX, event.movementY);
  });
  window.addEventListener("mousedown", (event) => {
    if (event.target !== canvas) return;
    if (active && inspectMode && held && !scannerOpen && !overlayOpen) inspectDragging = true;
  });
  window.addEventListener("mouseup", () => {
    inspectDragging = false;
  });
  window.addEventListener(
    "wheel",
    (event) => {
      if (!active || scannerOpen || overlayOpen || !held) return;
      if (inspectMode && event.shiftKey) {
        event.preventDefault();
        zoomInspectedBook(event.deltaY);
        return;
      }
      if (!held.flipped) return;
      event.preventDefault();
      scrollHeldBook(event.deltaY);
    },
    { passive: false },
  );
  window.addEventListener("keydown", (event) => {
    if (!active) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      if (inspectMode) exitInspectMode(true);
      else if (overlayOpen) closeOverlay();
      else api.exitExplore();
      return;
    }
    if (held && key === "e") {
      if (inspectMode) exitInspectMode(true);
      else enterInspectMode();
      return;
    }
    if (scannerOpen || overlayOpen) return;
    if (held && key === "q") {
      flipHeldBook();
      return;
    }
    if (key === "e") {
      if (nearScanner()) openScanner();
      else if (hovered) pickUpBook(hovered.userData.book);
    }
    if (key === "f" && held && nearShelf()) putHeldBookBack();
    keys.add(key);
  });
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  window.addEventListener("resize", resize);
  document.addEventListener("pointerlockchange", () => {
    if (active && document.pointerLockElement !== canvas && !scannerOpen && !overlayOpen && !inspectMode) {
      setPrompt("Click to resume mouse look. WASD still works.");
    }
  });

  async function handleScannerSubmit(event) {
    event.preventDefault();
    const submitButton = scannerForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    setPrompt("Looking up that ISBN...");
    try {
      const result = await api.lookupAndAddBook(scannerInput.value);
      closeScanner();
      if (result.isNew) {
        await animateUnlock(result.book);
        setPrompt(`${result.book.title} unlocked and joined the shelf.`);
      } else {
        setPrompt(`${result.book.title} is already on your shelf.`);
      }
      canvas.requestPointerLock?.();
    } catch (error) {
      setPrompt(error.message || "The scanner could not find that book.");
      scannerInput.focus();
    } finally {
      submitButton.disabled = false;
    }
  }

  function buildRoom() {
    scene.add(new THREE.HemisphereLight(0xfff4df, 0x2a1710, 1.45));
    const key = new THREE.DirectionalLight(0xffe0a5, 1.55);
    key.position.set(-3.6, 6, 4.2);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    scene.add(key);
    const lamp = new THREE.PointLight(0xffc975, 1.3, 7);
    lamp.position.set(3.2, 2.8, -1.4);
    scene.add(lamp);
    addBox("floor", [10, 0.12, 10], [0, -0.07, 0], materials.floor, true);
    addBox("back-wall", [10, 4.4, 0.14], [0, 2.1, -4.95], materials.wall, false);
    addBox("left-wall", [0.14, 4.4, 10], [-4.95, 2.1, 0], materials.wall, false);
    addBox("right-wall", [0.14, 4.4, 10], [4.95, 2.1, 0], materials.wall, false);
    addBox("rug", [4.6, 0.035, 3.2], [-0.25, 0.01, 2.15], new THREE.MeshLambertMaterial({ color: 0x7b2e3b }), false);
    buildShelf();
    buildScannerTable();
  }

  function buildShelf() {
    addBox("shelf-back", [6.05, 3.02, 0.12], [0, 1.86, -4.58], materials.darkWood, false);
    addShelfFrame();
    shelfConfig.boardCenters.forEach((y) => addBox("shelf-board", [6.12, 0.13, 0.82], [0, y, -4.21], materials.wood, true));
    [
      [-2.92, -3.83],
      [2.92, -3.83],
      [-2.92, -4.55],
      [2.92, -4.55],
    ].forEach(([x, z]) => addBox("shelf-foot", [0.22, 0.44, 0.22], [x, 0.22, z], materials.darkWood, true));
    addBox("left-handle", [0.06, 0.68, 0.08], [-3.2, 1.55, -3.68], materials.brass, false);
    addBox("right-handle", [0.06, 0.68, 0.08], [3.2, 1.55, -3.68], materials.brass, false);
  }

  function addShelfFrame() {
    const outer = { x: 3.28, y0: 0.22, y1: 3.5 };
    const inner = { x: 3.02, y0: 0.48, y1: 3.24 };
    const shape = new THREE.Shape();
    shape.moveTo(-outer.x, outer.y0);
    shape.lineTo(outer.x, outer.y0);
    shape.lineTo(outer.x, outer.y1);
    shape.lineTo(-outer.x, outer.y1);
    shape.lineTo(-outer.x, outer.y0);
    const hole = new THREE.Path();
    hole.moveTo(-inner.x, inner.y0);
    hole.lineTo(-inner.x, inner.y1);
    hole.lineTo(inner.x, inner.y1);
    hole.lineTo(inner.x, inner.y0);
    hole.lineTo(-inner.x, inner.y0);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.88, bevelEnabled: false });
    const frame = new THREE.Mesh(geometry, materials.wood);
    frame.position.z = -4.66;
    frame.castShadow = true;
    frame.receiveShadow = true;
    scene.add(frame);
  }

  function buildScannerTable() {
    addBox("table-top", [2.05, 0.14, 1.12], [3.15, 0.86, -2.42], materials.wood, true);
    [[2.28, -2.86], [4.02, -2.86], [2.28, -1.98], [4.02, -1.98]].forEach(([x, z]) => addBox("table-leg", [0.12, 0.86, 0.12], [x, 0.42, z], materials.darkWood, true));
    addBox("laptop-base", [0.8, 0.055, 0.55], [3.0, 0.96, -2.48], materials.laptop, true);
    const screen = addBox("laptop-screen", [0.82, 0.55, 0.05], [3.0, 1.25, -2.72], materials.screen, true);
    screen.rotation.x = -0.22;
    addBox("handheld-scanner", [0.55, 0.16, 0.24], [3.82, 1.02, -2.3], materials.scanner, true).rotation.y = -0.35;
    addBox("scanner-light", [0.06, 0.05, 0.3], [3.52, 1.03, -2.18], materials.glow, false).rotation.y = -0.35;
  }

  function addBox(name, size, position, material, castsShadow) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.castShadow = castsShadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function disposeMeshMaterials(mesh) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((material) => {
      if (material && !sharedMaterials.has(material) && material !== hoverMaterial) material.dispose();
    });
  }

  function renderShelf(nextBooks) {
    const data = (nextBooks || []).filter((book) => !book.placeholder && (!held || book.id !== held.book.id));
    const signature = data.map((book, index) => `${book.id}:${book.title}:${book.coverUrl}:${book.rating}:${book.shelfSlot ?? index}:${JSON.stringify(book.render || {})}`).join("|");
    if (signature === lastSignature) return;
    lastSignature = signature;
    bookMeshes.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
      disposeMeshMaterials(mesh);
    });
    hoverTargets.forEach((mesh) => {
      scene.remove(mesh);
      mesh.geometry.dispose();
    });
    bookMeshes.length = 0;
    hoverTargets.length = 0;
    hovered = null;
    data.forEach((book, index) => {
      const slot = getShelfSlot(book.shelfSlot ?? index);
      if (!slot) return;
      const spec = getBookRenderSpec(book, index);
      const mesh = makeShelfBook(book, spec);
      mesh.position.set(slot.x, slot.baseY, shelfConfig.bookZ + spec.zOffset);
      mesh.rotation.z = spec.lean;
      mesh.userData.home = mesh.position.clone();
      mesh.userData.homeRotation = mesh.rotation.clone();
      mesh.userData.slot = {
        minX: mesh.position.x - spec.width / 2,
        maxX: mesh.position.x + spec.width / 2,
        minY: slot.baseY,
        maxY: slot.baseY + spec.height,
      };
      if (book.id === celebratingId) mesh.visible = false;
      scene.add(mesh);
      bookMeshes.push(mesh);
      const target = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(spec.width, 0.22), spec.height, Math.max(spec.depth + 0.18, 0.72)),
        hoverMaterial,
      );
      target.position.set(slot.x, slot.baseY + spec.height / 2, shelfConfig.bookZ - 0.24);
      target.userData.book = book;
      target.userData.mesh = mesh;
      scene.add(target);
      hoverTargets.push(target);
    });
  }

  function getShelfSlot(index) {
    const row = Math.floor(index / shelfConfig.slotsPerRow);
    const col = index % shelfConfig.slotsPerRow;
    const baseY = shelfConfig.rowSurfaces[row];
    if (baseY === undefined) return null;
    return { index, row, col, x: shelfConfig.slotStartX + col * shelfConfig.slotGap, baseY };
  }

  function getBookRenderSpec(book, index = 0) {
    const render = book.render || {};
    const migrated = migrateRenderCategories(render);
    const size = sizeProfiles[migrated.sizeCategory] || sizeProfiles.medium;
    const thickness = thicknessProfiles[migrated.thicknessCategory] || thicknessProfiles.regular;
    return {
      width: Number(render.width) || size.width,
      height: Number(render.height) || size.height,
      depth: Number(render.depth) || thickness.depth,
      spineColor: render.spineColor || "#7b2e3b",
      pageColor: render.pageColor || "#f5ead7",
      topColor: render.pageColor || "#f5ead7",
      sizeCategory: migrated.sizeCategory,
      thicknessCategory: migrated.thicknessCategory,
      zOffset: stableNumber(book.id || book.title, 0.018),
      lean: (stableNumber(`${book.id || book.title}:lean`, 0.04) - 0.02),
    };
  }

  function migrateRenderCategories(render = {}) {
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
    }[render.sizeProfile] || { sizeCategory: "medium", thicknessCategory: "regular" };
  }

  function stableNumber(value, scale = 1) {
    let hash = 0;
    String(value || "").split("").forEach((char) => {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    });
    return ((hash % 1000) / 1000) * scale;
  }

  function makeBook(book, spec = getBookRenderSpec(book)) {
    const pageMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(spec.pageColor) });
    const topMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(spec.topColor) });
    const spine = new THREE.MeshLambertMaterial({ map: makeTextTexture(book.title, "#f9ead2", spec.spineColor, true) });
    const cover = new THREE.MeshLambertMaterial({ map: makeCoverTexture(book, spec.spineColor) });
    const back = new THREE.MeshLambertMaterial({ map: makeBackTexture(book, spec.spineColor) });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.height, spec.depth), [cover, back, topMaterial, pageMaterial, spine, pageMaterial]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.book = book;
    return mesh;
  }

  function makeShelfBook(book, spec) {
    const pageMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(spec.pageColor) });
    const topMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(spec.topColor) });
    const spine = new THREE.MeshLambertMaterial({ map: makeTextTexture(book.title, "#f9ead2", spec.spineColor, true) });
    const cover = new THREE.MeshLambertMaterial({ map: makeCoverTexture(book, spec.spineColor) });
    const back = new THREE.MeshLambertMaterial({ map: makeBackTexture(book, spec.spineColor) });
    const geometry = new THREE.BoxGeometry(spec.width, spec.height, spec.depth);
    geometry.translate(0, spec.height / 2, -spec.depth / 2);
    const mesh = new THREE.Mesh(geometry, [cover, back, topMaterial, pageMaterial, spine, pageMaterial]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.book = book;
    inferCoverSpineColor(book);
    return mesh;
  }

  function inferCoverSpineColor(book) {
    if (!book.coverUrl || book.render?.spineFromCover || colorInference.has(book.id)) return;
    colorInference.add(book.id);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = async () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        const buckets = new Map();
        for (let i = 0; i < data.length; i += 4) {
          const alpha = data[i + 3];
          if (alpha < 200) continue;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max < 35 || min > 232 || max - min < 22) continue;
          const key = `${Math.round(r / 32) * 32},${Math.round(g / 32) * 32},${Math.round(b / 32) * 32}`;
          buckets.set(key, (buckets.get(key) || 0) + 1);
        }
        const best = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!best) return;
        const [r, g, b] = best.split(",").map(Number);
        const color = `#${[r, g, b].map((part) => Math.max(0, Math.min(255, part)).toString(16).padStart(2, "0")).join("")}`;
        const updated = await api.updateBookRender(book.id, { spineColor: color, spineFromCover: true });
        if (held?.book.id === book.id && updated) {
          held.book = updated;
          rebuildHeldBookMesh();
          syncRenderControls();
        }
        lastSignature = "";
        renderShelf(api.getBooks());
      } catch (_error) {
        colorInference.delete(book.id);
      }
    };
    image.onerror = () => colorInference.delete(book.id);
    image.src = book.coverUrl;
  }

  function makeDisplayBook(book, spec = getBookRenderSpec(book)) {
    const front = makeHeldMaterial(makeCoverTexture(book, spec.spineColor));
    const back = makeHeldMaterial(makeBackTexture(book, spec.spineColor));
    const spine = makeHeldMaterial(makeTextTexture(book.title, "#f9ead2", spec.spineColor, true));
    const page = new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.pageColor), depthTest: false, depthWrite: false });
    const top = new THREE.MeshBasicMaterial({ color: new THREE.Color(spec.pageColor), depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 3.2, spec.height * 1.1, spec.depth * 0.32), [page, spine, top, page, front, back]);
    mesh.renderOrder = 1000;
    mesh.userData.book = book;
    return mesh;
  }

  function makeHeldMaterial(map) {
    return new THREE.MeshBasicMaterial({ map, depthTest: false, depthWrite: false });
  }

  function makeCoverTexture(book, fallbackColor) {
    if (book.coverUrl && textureCache.has(book.coverUrl)) return textureCache.get(book.coverUrl);
    if (book.coverUrl) {
      const texture = textureLoader.load(book.coverUrl, undefined, undefined, () => {});
      texture.colorSpace = THREE.SRGBColorSpace;
      textureCache.set(book.coverUrl, texture);
      return texture;
    }
    return makeTextTexture(book.title, "#fff5dc", fallbackColor, false);
  }

  function makeBackTexture(book, fallbackColor, scrollLine = 0) {
    const synopsis = isBadSummary(book.synopsis) ? "No synopsis found." : book.synopsis || "No synopsis found.";
    const summary = `${book.title}\n${ratingStars(book.rating)}\n\n${synopsis}`;
    return makeTextTexture(summary, "#271b14", 0xf7ecd8, false, scrollLine);
  }

  function isBadSummary(text) {
    return /query length limit exceeded|max allowed query/i.test(text || "");
  }

  function makeTextTexture(text, color, background, spine, scrollLine = 0) {
    const key = `text:${text}:${color}:${background}:${spine}:${scrollLine}`;
    if (textureCache.has(key)) return textureCache.get(key);
    const c = document.createElement("canvas");
    c.width = spine ? 128 : 512;
    c.height = spine ? 512 : 768;
    const ctx = c.getContext("2d");
    ctx.fillStyle = normalizeColor(background);
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    ctx.font = spine ? "700 26px Georgia" : "700 44px Georgia";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (spine) {
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate(-Math.PI / 2);
      wrapText(ctx, text, 0, 0, 420, 34, 4);
    } else {
      wrapText(ctx, text, c.width / 2, 78, c.width - 72, 42, 14, "top", scrollLine);
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(key, texture);
    return texture;
  }

  function normalizeColor(color) {
    if (typeof color === "string") return color.startsWith("#") ? color : `#${color}`;
    return `#${Number(color || 0).toString(16).padStart(6, "0")}`;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines, baseline = "middle", startLine = 0) {
    const paragraphs = String(text || "").split(/\n+/);
    const lines = [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean);
      let line = "";
      words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxWidth && line) {
          lines.push(line);
          line = word;
        } else line = test;
      });
      if (line) lines.push(line);
      if (paragraphIndex < paragraphs.length - 1) lines.push("");
    });
    const usable = lines.slice(startLine, startLine + maxLines);
    ctx.textBaseline = baseline;
    const startY = baseline === "top" ? y : y - ((usable.length - 1) * lineHeight) / 2;
    usable.forEach((part, index) => ctx.fillText(part, x, startY + index * lineHeight));
  }

  function pickUpBook(book) {
    held = { book, flipped: false, centered: false, inspectZoom: 0.72, backScroll: 0, group: makeHeldBook(book) };
    camera.add(held.group);
    scene.add(camera);
    renderShelf(api.getBooks());
    updateMobileActions();
    setPrompt("Book picked up. Q flips front/back. E inspects and reviews. Return to the shelf and press F to put it back.");
  }

  function makeHeldBook(book) {
    const group = new THREE.Group();
    const mesh = makeDisplayBook(book);
    mesh.rotation.set(-0.08, 0, 0.05);
    group.add(mesh);
    group.position.set(0.42, -0.18, -0.85);
    group.userData.mesh = mesh;
    return group;
  }

  function flipHeldBook() {
    if (!held) return;
    held.flipped = !held.flipped;
    held.group.userData.mesh.rotation.y = held.flipped ? Math.PI : 0;
    setPrompt(held.flipped ? "Back cover. Use the wheel to scroll the summary. Press Q to flip to the front." : "Front cover. Press Q to flip to the back.");
  }

  function scrollHeldBook(delta) {
    if (!held || !held.flipped) return;
    held.backScroll = THREE.MathUtils.clamp(held.backScroll + Math.sign(delta), 0, getBackScrollMax(held.book));
    const mesh = held.group.userData.mesh;
    mesh.material[5].map = makeBackTexture(held.book, 0xf7ecd8, held.backScroll);
    mesh.material[5].needsUpdate = true;
    setPrompt("Back cover summary. Scroll to keep reading, Q flips to the front.");
  }

  function getBackScrollMax(book) {
    const c = document.createElement("canvas");
    const ctx = c.getContext("2d");
    ctx.font = "700 44px Georgia";
    const synopsis = isBadSummary(book.synopsis) ? "No synopsis found." : book.synopsis || "No synopsis found.";
    const summary = `${book.title}\n${ratingStars(book.rating)}\n\n${synopsis}`;
    return Math.max(0, countWrappedLines(ctx, summary, 512 - 72) - 14);
  }

  function countWrappedLines(ctx, text, maxWidth) {
    return String(text || "")
      .split(/\n+/)
      .reduce((count, paragraph) => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        let line = "";
        let lines = 0;
        words.forEach((word) => {
          const test = line ? `${line} ${word}` : word;
          if (ctx.measureText(test).width > maxWidth && line) {
            lines += 1;
            line = word;
          } else line = test;
        });
        return count + Math.max(1, lines + (line ? 1 : 0));
      }, 0);
  }

  function enterInspectMode() {
    if (!held) return;
    inspectMode = true;
    inspectDragging = false;
    exploreMode?.classList.add("inspecting");
    placementMarker.visible = false;
    placementSlot = null;
    held.centered = true;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    held.group.position.set(0.52, 0.02, -1.02);
    held.group.scale.setScalar(held.inspectZoom);
    held.group.userData.mesh.rotation.set(-0.08, held.flipped ? Math.PI : 0, 0);
    renderInspectStars();
    syncRenderControls();
    openOverlay(held.book, { keepInspecting: true });
    inspectBar?.classList.add("open");
    inspectBar?.setAttribute("aria-hidden", "false");
    updateMobileActions();
    setPrompt("Inspect and review. Drag the book on the right, edit notes on the left. E returns to hand.");
  }

  function exitInspectMode(resumePointerLock) {
    inspectMode = false;
    inspectDragging = false;
    exploreMode?.classList.remove("inspecting");
    inspectBar?.classList.remove("open");
    inspectBar?.setAttribute("aria-hidden", "true");
    updateMobileActions();
    closeOverlay({ resumePointerLock: false });
    if (!held) return;
    held.centered = false;
    held.backScroll = 0;
    held.group.position.set(0.42, -0.18, -0.85);
    held.group.scale.setScalar(1);
    held.group.userData.mesh.rotation.set(-0.08, held.flipped ? Math.PI : 0, 0.05);
    refreshHeldMaterials();
    setPrompt("Book in hand. Q flips. E inspects and reviews.");
    if (resumePointerLock && active && !scannerOpen && !overlayOpen && !coarsePointer.matches) canvas.requestPointerLock?.();
  }

  function rotateInspectedBook(dx, dy) {
    const mesh = held.group.userData.mesh;
    mesh.rotation.y += dx * 0.008;
    mesh.rotation.x = THREE.MathUtils.clamp(mesh.rotation.x + dy * 0.006, -0.9, 0.9);
  }

  function zoomInspectedBook(delta) {
    if (!held || !inspectMode) return;
    held.inspectZoom = THREE.MathUtils.clamp(held.inspectZoom - Math.sign(delta) * 0.08, 0.72, 1.85);
    held.group.scale.setScalar(held.inspectZoom);
    setPrompt("Inspect and review. Shift + wheel zooms. Drag rotates. E returns to hand.");
  }

  function buildInspectStars() {
    if (!inspectStars) return;
    inspectStars.innerHTML = "";
    for (let star = 1; star <= 5; star += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "★";
      button.title = `Set star ${star}`;
      button.dataset.star = String(star);
      button.addEventListener("click", () => cycleQuickRating(star));
      inspectStars.append(button);
    }
  }

  function buildRenderControls() {
    bookSizeSlider?.addEventListener("input", () => {
      const t = Number(bookSizeSlider.value) / 100;
      updateHeldRender({
        width: round(THREE.MathUtils.lerp(0.15, 0.25, t)),
        height: round(THREE.MathUtils.lerp(0.7, 0.98, t)),
        sizeCategory: sliderCategory(t, ["small", "medium", "large"]),
      });
    });
    bookThicknessSlider?.addEventListener("input", () => {
      const t = Number(bookThicknessSlider.value) / 100;
      updateHeldRender({
        depth: round(THREE.MathUtils.lerp(0.36, 0.68, t)),
        thicknessCategory: sliderCategory(t, ["slim", "regular", "thick"]),
      });
    });
    spineColorInput?.addEventListener("input", () => updateHeldRender({ spineColor: spineColorInput.value, spineFromCover: false }));
    pageColorInput?.addEventListener("input", () => updateHeldRender({ pageColor: pageColorInput.value }));
  }

  function round(value) {
    return Math.round(value * 1000) / 1000;
  }

  function sliderCategory(t, values) {
    return values[Math.min(values.length - 1, Math.floor(t * values.length))];
  }

  function syncRenderControls() {
    if (!held) return;
    const spec = getBookRenderSpec(held.book);
    if (spineColorInput) spineColorInput.value = normalizeColor(spec.spineColor);
    if (pageColorInput) pageColorInput.value = normalizeColor(spec.pageColor);
    if (bookSizeSlider) bookSizeSlider.value = String(Math.round(THREE.MathUtils.clamp((spec.height - 0.7) / 0.28, 0, 1) * 100));
    if (bookThicknessSlider) bookThicknessSlider.value = String(Math.round(THREE.MathUtils.clamp((spec.depth - 0.36) / 0.32, 0, 1) * 100));
  }

  async function updateHeldRender(changes) {
    if (!held) return;
    const updated = await api.updateBookRender(held.book.id, changes);
    if (!updated) return;
    held.book = updated;
    rebuildHeldBookMesh();
    syncRenderControls();
    lastSignature = "";
    renderShelf(api.getBooks());
  }

  function rebuildHeldBookMesh() {
    if (!held) return;
    const oldMesh = held.group.userData.mesh;
    const rotation = oldMesh.rotation.clone();
    held.group.remove(oldMesh);
    oldMesh.geometry.dispose();
    disposeMeshMaterials(oldMesh);
    const mesh = makeDisplayBook(held.book);
    mesh.rotation.copy(rotation);
    held.group.add(mesh);
    held.group.userData.mesh = mesh;
  }

  function renderInspectStars() {
    if (!inspectStars || !held) return;
    const rating = Number(held.book.rating) || 0;
    inspectStars.querySelectorAll("button").forEach((button) => {
      const star = Number(button.dataset.star);
      const fill = THREE.MathUtils.clamp(rating - (star - 1), 0, 1);
      button.style.setProperty("--fill", `${Math.round(fill * 100)}%`);
      button.classList.toggle("empty", fill === 0);
    });
  }

  function cycleQuickRating(star) {
    const rating = Number(held?.book.rating) || 0;
    const currentFill = THREE.MathUtils.clamp(rating - (star - 1), 0, 1);
    const nextFill = currentFill >= 1 ? 0 : currentFill >= 0.5 ? 1 : 0.5;
    setQuickRating(star - 1 + nextFill);
  }

  async function setQuickRating(value) {
    if (!held) return;
    const updated = await api.updateBookNotes(held.book.id, { rating: value });
    if (!updated) return;
    held.book = updated;
    held.backScroll = 0;
    refreshHeldMaterials();
    renderInspectStars();
    updateOverlayRating();
    setPrompt(`${value.toFixed(1)} stars saved. It is now printed above the back-cover summary.`);
  }

  function ratingStars(value) {
    const rating = Number(value) || 0;
    if (!rating) return "Not rated";
    let output = "";
    for (let star = 1; star <= 5; star += 1) {
      if (rating >= star) output += "★";
      else if (rating >= star - 0.5) output += "⯨";
      else output += "☆";
    }
    return output;
  }

  function refreshHeldMaterials() {
    if (!held) return;
    const mesh = held.group.userData.mesh;
    mesh.material[5].map = makeBackTexture(held.book, 0xf7ecd8, held.backScroll);
    mesh.material[5].needsUpdate = true;
  }

  async function putHeldBookBack() {
    if (!held) return;
    const bookId = held.book.id;
    exitInspectMode(false);
    camera.remove(held.group);
    held = null;
    updateMobileActions();
    placementMarker.visible = false;
    if (placementSlot !== null) await api.moveBookToSlot(bookId, placementSlot);
    placementSlot = null;
    lastSignature = "";
    renderShelf(api.getBooks());
    setPrompt("Book returned to the shelf.");
  }

  function openOverlay(book, options = {}) {
    overlayOpen = !options.keepInspecting;
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    overlayTitle.textContent = book.title;
    overlayAuthor.textContent = book.authors?.join(", ") || "Unknown author";
    overlaySynopsis.textContent = book.synopsis || "No synopsis found.";
    overlayReview.value = book.review || "";
    updateOverlayRating();
    if (book.coverUrl && overlayCover && overlayFallback) {
      overlayCover.src = book.coverUrl;
      overlayCover.alt = `Cover of ${book.title}`;
      overlayCover.style.display = "block";
      overlayFallback.style.display = "none";
    } else if (overlayCover && overlayFallback) {
      overlayCover.style.display = "none";
      overlayFallback.style.display = "grid";
      overlayFallback.textContent = book.title;
    }
  }

  function closeOverlay(options = {}) {
    overlayOpen = false;
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    if (options.resumePointerLock !== false && active && !scannerOpen && !inspectMode) canvas.requestPointerLock?.();
  }

  async function saveHeldNotes(event) {
    event.preventDefault();
    if (!held) return;
    const updated = await api.updateBookNotes(held.book.id, { rating: Number(held.book.rating) || 0, review: overlayReview.value.trim() });
    if (!updated) return;
    held.book = updated;
    refreshHeldMaterials();
    renderInspectStars();
    updateOverlayRating();
    if (!inspectMode) closeOverlay();
    setPrompt("Notes saved. Q flips the book. E inspects and reviews. Return to the shelf and press F to put it back.");
  }

  function updateOverlayRating() {
    const value = Number(held?.book.rating) || 0;
    overlayRatingText.textContent = value ? `${value.toFixed(1)} stars` : "Not rated";
  }

  function refreshHeldFromLibrary() {
    if (!held) return;
    const latest = api.getBooks().find((book) => book.id === held.book.id);
    if (latest) {
      held.book = latest;
      refreshHeldMaterials();
      renderInspectStars();
      syncRenderControls();
    }
  }

  function look(dx, dy) {
    player.yaw -= dx * 0.0022;
    player.pitch -= dy * 0.0019;
    player.pitch = Math.max(-1.08, Math.min(0.82, player.pitch));
    updateCamera();
  }

  function movePlayer(delta) {
    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
    const movement = new THREE.Vector3();
    if (keys.has("w")) movement.add(forward);
    if (keys.has("s")) movement.sub(forward);
    if (keys.has("d")) movement.add(right);
    if (keys.has("a")) movement.sub(right);
    if (touchMove.y) movement.addScaledVector(forward, -touchMove.y);
    if (touchMove.x) movement.addScaledVector(right, touchMove.x);
    if (movement.lengthSq() > 0) {
      movement.normalize().multiplyScalar(player.speed * delta);
      player.position.add(movement);
      player.position.x = THREE.MathUtils.clamp(player.position.x, -4.05, 4.05);
      player.position.z = THREE.MathUtils.clamp(player.position.z, -3.45, 4.35);
      updateCamera();
    }
  }

  function updateCamera() {
    camera.position.copy(player.position);
    camera.rotation.order = "YXZ";
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
  }

  function updateInteractions() {
    if (!active || scannerOpen || overlayOpen || inspectMode) return;
    raycaster.setFromCamera(centerPointer, camera);
    const closeToShelf = nearShelf();
    if (held) {
      setHovered(null);
      updatePlacementPreview(closeToShelf);
      if (closeToShelf && placementSlot !== null) setPrompt("Aim anywhere on the shelves, then click or press F to place the book there. Q flips. E inspects.");
      else setPrompt("You are holding a book. Q flips it. E inspects and reviews.");
      return;
    }
    placementMarker.visible = false;
    placementSlot = null;
    const hit = raycaster.intersectObjects(hoverTargets, false).find((item) => item.distance < 3.2);
    setHovered(closeToShelf && hit ? hit.object.userData.mesh : null);
    if (held && closeToShelf) setPrompt("Press F or click to put the book back on the shelf. Q flips. E inspects.");
    else if (held) setPrompt("You are holding a book. Q flips it. E inspects and reviews.");
    else if (nearScanner()) setPrompt("Press E or click to scan a new book.");
    else if (hovered) setPrompt(`${hovered.userData.book.title}. Press E or click to pick it up.`);
    else if (closeToShelf) setPrompt("Look at a book spine to pull it out, then click to pick it up.");
    else setPrompt(touchCapable
      ? "The left stick follows your view. Drag the right side to aim."
      : "WASD follows your view. Mouse moves your POV.");
  }

  function setHovered(mesh) {
    hovered = mesh;
    updateMobileActions();
  }

  function updateMobileActions() {
    if (mobileFlipBook) mobileFlipBook.disabled = !held;
    if (mobileReviewBook) {
      mobileReviewBook.disabled = !held;
      mobileReviewBook.textContent = inspectMode ? "Close review" : "Review";
    }
    if (mobileInteract) mobileInteract.textContent = held && nearShelf() ? "Shelve" : hovered ? "Pick up" : nearScanner() ? "Scan" : "Use";
  }

  function installTouchControls() {
    if (!moveTouchZone || !lookTouchZone) return;

    const endMove = (pointerId) => {
      if (pointerId !== movePointerId) return;
      movePointerId = null;
      touchMove.set(0, 0);
      moveTouchZone.classList.remove("active");
      joystickKnob?.style.setProperty("transform", "translate3d(0, 0, 0)");
    };
    const endLook = (pointerId, activate = false) => {
      if (pointerId !== lookPointerId) return;
      lookPointerId = null;
      lookTouchZone.classList.remove("active");
      if (activate && lookTravel < 10) handlePrimaryAction();
    };

    moveTouchZone.addEventListener("pointerdown", (event) => {
      if (!active || movePointerId !== null) return;
      event.preventDefault();
      enableTouchControls();
      movePointerId = event.pointerId;
      moveTouchZone.classList.add("active");
      moveTouchZone.setPointerCapture?.(event.pointerId);
      updateJoystick(event);
    });
    window.addEventListener("pointermove", (event) => {
      if (event.pointerId !== movePointerId) return;
      event.preventDefault();
      updateJoystick(event);
    }, { passive: false });
    ["pointerup", "pointercancel"].forEach((type) => window.addEventListener(type, (event) => {
      endMove(event.pointerId);
    }));
    moveTouchZone.addEventListener("lostpointercapture", (event) => endMove(event.pointerId));
    lookTouchZone.addEventListener("pointerdown", (event) => {
      if (!active || lookPointerId !== null || scannerOpen || overlayOpen) return;
      event.preventDefault();
      enableTouchControls();
      lookPointerId = event.pointerId;
      lookLastX = event.clientX;
      lookLastY = event.clientY;
      lookTravel = 0;
      lookTouchZone.classList.add("active");
      lookTouchZone.setPointerCapture?.(event.pointerId);
    });
    window.addEventListener("pointermove", (event) => {
      if (event.pointerId !== lookPointerId) return;
      event.preventDefault();
      const dx = event.clientX - lookLastX;
      const dy = event.clientY - lookLastY;
      lookLastX = event.clientX;
      lookLastY = event.clientY;
      lookTravel += Math.abs(dx) + Math.abs(dy);
      if (inspectMode && held) rotateInspectedBook(dx, dy);
      else look(dx * 1.25, dy * 1.25);
    }, { passive: false });
    ["pointerup", "pointercancel"].forEach((type) => window.addEventListener(type, (event) => {
      endLook(event.pointerId, type === "pointerup");
    }));
    lookTouchZone.addEventListener("lostpointercapture", (event) => endLook(event.pointerId));

    // Pointer Events cover current Safari/Chrome. This fallback keeps the room
    // playable in older WKWebView and in-app browsers used by mobile launchers.
    if (!("PointerEvent" in window)) {
      moveTouchZone.addEventListener("touchstart", (event) => {
        if (!active || movePointerId !== null) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        event.preventDefault();
        movePointerId = touch.identifier;
        moveTouchZone.classList.add("active");
        updateJoystick(touch);
      }, { passive: false });
      lookTouchZone.addEventListener("touchstart", (event) => {
        if (!active || lookPointerId !== null || scannerOpen || overlayOpen) return;
        const touch = event.changedTouches[0];
        if (!touch) return;
        event.preventDefault();
        lookPointerId = touch.identifier;
        lookLastX = touch.clientX;
        lookLastY = touch.clientY;
        lookTravel = 0;
        lookTouchZone.classList.add("active");
      }, { passive: false });
      window.addEventListener("touchmove", (event) => {
        const moveTouch = findTouch(event.touches, movePointerId);
        const lookTouch = findTouch(event.touches, lookPointerId);
        if (!moveTouch && !lookTouch) return;
        event.preventDefault();
        if (moveTouch) updateJoystick(moveTouch);
        if (lookTouch) updateTouchLook(lookTouch);
      }, { passive: false });
      ["touchend", "touchcancel"].forEach((type) => window.addEventListener(type, (event) => {
        for (const touch of event.changedTouches) {
          endMove(touch.identifier);
          endLook(touch.identifier, type === "touchend");
        }
      }, { passive: false }));
    }
    window.addEventListener("blur", resetTouchControls);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) resetTouchControls();
    });
  }

  function findTouch(touchList, identifier) {
    if (identifier === null) return null;
    return Array.from(touchList).find((touch) => touch.identifier === identifier) || null;
  }

  function updateTouchLook(touch) {
    const dx = touch.clientX - lookLastX;
    const dy = touch.clientY - lookLastY;
    lookLastX = touch.clientX;
    lookLastY = touch.clientY;
    lookTravel += Math.abs(dx) + Math.abs(dy);
    if (inspectMode && held) rotateInspectedBook(dx, dy);
    else look(dx * 1.25, dy * 1.25);
  }

  function updateJoystick(event) {
    const bounds = moveTouchZone.querySelector(".joystick-base")?.getBoundingClientRect() || moveTouchZone.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const radius = Math.min(bounds.width, bounds.height) * 0.32;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy) || 1;
    const scale = Math.min(1, radius / length);
    const x = dx * scale;
    const y = dy * scale;
    const normalizedX = x / radius;
    const normalizedY = y / radius;
    const deadZone = 0.12;
    touchMove.set(
      Math.abs(normalizedX) < deadZone ? 0 : normalizedX,
      Math.abs(normalizedY) < deadZone ? 0 : normalizedY,
    );
    joystickKnob?.style.setProperty("transform", `translate3d(${x}px, ${y}px, 0)`);
  }

  function resetTouchControls() {
    movePointerId = null;
    lookPointerId = null;
    touchMove.set(0, 0);
    moveTouchZone?.classList.remove("active");
    lookTouchZone?.classList.remove("active");
    joystickKnob?.style.setProperty("transform", "translate3d(0, 0, 0)");
  }

  async function requestMobilePresentation() {
    try {
      if (!document.fullscreenElement) await exploreMode?.requestFullscreen?.({ navigationUI: "hide" });
    } catch (_error) {
      // Fullscreen availability varies by browser; the fixed viewport remains usable.
    }
    try {
      await screen.orientation?.lock?.("landscape");
    } catch (_error) {
      // iOS and some embedded browsers require the user to rotate manually.
    }
  }

  function pointInBookSlot(hit) {
    const slot = hit.object.userData.slot;
    if (!slot) return true;
    return hit.point.x >= slot.minX && hit.point.x <= slot.maxX && hit.point.y >= slot.minY && hit.point.y <= slot.maxY;
  }

  function updatePlacementPreview(closeToShelf) {
    if (!closeToShelf) {
      placementMarker.visible = false;
      placementSlot = null;
      return;
    }
    const forward = getForwardVector();
    if (Math.abs(forward.z) < 0.001) return;
    const t = (shelfConfig.bookZ - player.position.z) / forward.z;
    if (t <= 0 || t > 3.2) {
      placementMarker.visible = false;
      placementSlot = null;
      return;
    }
    const point = player.position.clone().add(forward.multiplyScalar(t));
    const row = nearestShelfRow(point.y);
    const col = THREE.MathUtils.clamp(Math.round((point.x - shelfConfig.slotStartX) / shelfConfig.slotGap), 0, shelfConfig.slotsPerRow - 1);
    const aimedSlot = row * shelfConfig.slotsPerRow + col;
    const targetSlot = nearestFreeSlot(aimedSlot);
    const slot = getShelfSlot(targetSlot);
    if (!slot) {
      placementMarker.visible = false;
      placementSlot = null;
      return;
    }
    placementSlot = targetSlot;
    placementMarker.position.set(slot.x, slot.baseY + 0.39, shelfConfig.bookZ - 0.24);
    placementMarker.visible = true;
  }

  function nearestShelfRow(y) {
    let best = 0;
    let bestDistance = Infinity;
    shelfConfig.rowSurfaces.forEach((baseY, row) => {
      const distance = Math.abs(y - (baseY + 0.38));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = row;
      }
    });
    return best;
  }

  function nearestFreeSlot(aimedSlot) {
    const books = api.getBooks();
    const heldId = held?.book.id;
    const occupied = new Set(
      books
        .filter((book) => book.id !== heldId && Number.isInteger(book.shelfSlot))
        .map((book) => book.shelfSlot),
    );
    const maxSlots = shelfConfig.rowSurfaces.length * shelfConfig.slotsPerRow;
    if (!occupied.has(aimedSlot)) return aimedSlot;
    for (let offset = 1; offset < maxSlots; offset += 1) {
      const left = aimedSlot - offset;
      const right = aimedSlot + offset;
      if (left >= 0 && !occupied.has(left)) return left;
      if (right < maxSlots && !occupied.has(right)) return right;
    }
    return aimedSlot;
  }

  function nearShelf() {
    return player.position.distanceTo(new THREE.Vector3(0, 1.55, -2.55)) < 2.05;
  }

  function nearScanner() {
    return player.position.distanceTo(new THREE.Vector3(3.25, 1.55, -1.65)) < 1.85;
  }

  function openScanner() {
    scannerOpen = true;
    scannerModal.classList.add("open");
    scannerModal.setAttribute("aria-hidden", "false");
    if (document.pointerLockElement === canvas) document.exitPointerLock();
    scannerInput.value = "";
    window.setTimeout(() => scannerInput.focus(), 50);
  }

  function closeScanner() {
    scannerOpen = false;
    scannerModal.classList.remove("open");
    scannerModal.setAttribute("aria-hidden", "true");
    scannerInput.value = "";
    if (active) canvas.requestPointerLock?.();
  }

  async function animateUnlock(book) {
    celebratingId = book.id;
    lastSignature = "";
    renderShelf(api.getBooks());
    const target = bookMeshes.find((mesh) => mesh.userData.book.id === book.id);
    if (!target) return;
    const group = new THREE.Group();
    group.add(makeBook(book));
    const sparkles = Array.from({ length: 14 }, (_, index) => {
      const sparkle = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), materials.glow);
      const angle = (index / 14) * Math.PI * 2;
      sparkle.position.set(Math.cos(angle) * 0.85, Math.sin(index) * 0.45, Math.sin(angle) * 0.85);
      group.add(sparkle);
      return sparkle;
    });
    const start = camera.position.clone().add(getForwardVector().multiplyScalar(1.45));
    start.y = Math.max(start.y, 1.45);
    group.position.copy(start);
    scene.add(group);
    celebration = { group, target, start, startedAt: performance.now(), sparkles };
  }

  function updateCelebration() {
    if (!celebration) return;
    const elapsed = (performance.now() - celebration.startedAt) / 1000;
    const targetPosition = celebration.target.userData.home.clone();
    targetPosition.z += 0.45;
    targetPosition.y += 0.22;
    if (elapsed < 1.55) {
      celebration.group.position.copy(celebration.start).add(new THREE.Vector3(0, Math.sin(elapsed * Math.PI) * 0.55, 0));
      celebration.group.rotation.y += 0.1;
      celebration.sparkles.forEach((sparkle, index) => (sparkle.visible = Math.sin(elapsed * 8 + index) > -0.55));
      return;
    }
    const t = Math.min(1, (elapsed - 1.55) / 1.15);
    celebration.group.position.lerpVectors(celebration.start, targetPosition, easeInOut(t));
    celebration.group.rotation.y += 0.04;
    if (t >= 1) {
      celebration.target.visible = true;
      scene.remove(celebration.group);
      celebratingId = null;
      celebration = null;
    }
  }

  function getForwardVector() {
    return new THREE.Vector3(0, 0, -1).applyEuler(camera.rotation).normalize();
  }

  function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  function setPrompt(text) {
    const revision = ++promptRevision;
    prompt.textContent = text;
    api.translateInterfaceText?.(text).then((translated) => {
      if (revision === promptRevision && translated) prompt.textContent = translated;
    });
  }

  function animate() {
    frameId = requestAnimationFrame(animate);
    if (!active) return;
    const delta = Math.min(clock.getDelta(), 0.05);
    if (active && !scannerOpen && !overlayOpen && !inspectMode) movePlayer(delta);
    const now = performance.now() * 0.001;
    bookMeshes.forEach((mesh, index) => {
      const isHovered = mesh === hovered;
      mesh.position.z += (mesh.userData.home.z - mesh.position.z) * 0.2;
      mesh.rotation.x += ((isHovered ? 0.42 : 0) - mesh.rotation.x) * 0.22;
      mesh.rotation.y += (mesh.userData.homeRotation.y - mesh.rotation.y) * 0.2;
      mesh.rotation.z = mesh.userData.homeRotation.z + Math.sin(now * 1.2 + index) * 0.003;
    });
    updateInteractions();
    updateCelebration();
    renderer.render(scene, camera);
  }

  function startLoop() {
    if (frameId) return;
    clock.getDelta();
    frameId = requestAnimationFrame(animate);
  }

  function stopLoop() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    keys.clear();
    placementMarker.visible = false;
  }

  function resize() {
    const width = Math.max(1, canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}
