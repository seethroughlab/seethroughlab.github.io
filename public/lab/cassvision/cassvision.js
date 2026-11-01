// Cassvision case viewer for the research page: the printable CAD enclosure in 3D, its screen running the
// camera's own image pipeline (C, compiled to JS). Adapted from the Cassvision repo's tools/viewer/case-src.html:
// controls are scoped to the viewer's root element, parts load as files, the viewer starts when it nears the
// viewport, and the parts the CAD only cuts holes for (screen glass, camera and lens, USB-C, power switch, LED,
// screws, tripod insert) are drawn in, at the positions in enclosure/pxl_case.py and pxl_internals.py.
//
// Axes: CAD (build123d, mm) is X front(-) to rear(+), Y camera-right(+), Z up from the body's floor.
// three is (X, Z, -Y): x front to rear, y up, z camera-left(+).
(function () {
  if (window.Cassvision) return;
  const BASE = '/lab/cassvision/';
  const THREE_EX = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
  const LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    THREE_EX + 'controls/OrbitControls.js',
    THREE_EX + 'loaders/STLLoader.js',
    THREE_EX + 'environments/RoomEnvironment.js',
    BASE + 'pxl_web.js'
  ];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let libsReady = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  function loadLibs() {
    if (!libsReady) libsReady = LIBS.reduce((p, src) => p.then(() => loadScript(src)), Promise.resolve());
    return libsReady;
  }

  const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
  // CAD point (X, Y, Z) -> three.
  const P = (x, y, z) => new THREE.Vector3(x, z, -y);

  // ---- CAD numbers (enclosure/pxl_case.py, pxl_internals.py) ---------------------------------------------

  const BODY_L = 82, BODY_W = 76, BODY_H = 61, WALL = 2, BEZEL = 7;
  const REAR = BODY_L / 2;                                   // bezel's outer face
  const GLASS = { w: 61.2, h: 44, t: 3.5, z: 33 + 0.5 };     // glass with its frame, centre height
  const GLASS_X0 = REAR - 2.0;                               // module board's face; the glass stands 3.5 proud
  const ACTIVE = { w: 48.96, h: 36.72 };                     // 2.4" 320x240 active area
  const SCREEN_HOLES = [[-32.75, 33 - 18.75], [-32.75, 33 + 18.75], [32.75, 33 - 18.75], [32.75, 33 + 18.75]];
  const LED = { y: 27, z: 5.2, d: 5 };
  const CAM_Z = BODY_H / 2, LENS_FRONT = -BODY_L / 2 + WALL + 4 - 24;   // board front -24 mm
  const USBC = { x: -4.2 + 25 - 6.2, z: 22.9 };              // slot 9.4 x 3.6 in the right wall
  const SWITCH = { x: 8, z: 38 };                            // slot 10.5 x 5.2 in the right wall
  const SIDE = BODY_W / 2;
  const TRIPOD = { x: (-18 + 14) / 2 + 6 + 1.5, z: -92 };    // grip cap's underside
  const LOGO_DOT = { x: -31 + 11 + 3 + 6.3 * 6.5 + 2.2, z: (14 - 0.27 * 6.5) + 0.42 * 6.5 }; // red paint, left side

  // ---- scene -----------------------------------------------------------------------------------------------

  function makeStage(canvas, background, groundY) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.physicallyCorrectLights = true;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(background);
    // Studio reflections, so plastic, glass and metal read as what they are.
    if (THREE.RoomEnvironment) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    }
    const camera = new THREE.PerspectiveCamera(30, 4 / 3, 1, 3000);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f44, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-160, 260, 220);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    Object.assign(key.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 10, far: 900 });
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 1.2);
    rim.position.set(260, 120, -200);
    scene.add(rim);

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.55 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = groundY;
    ground.receiveShadow = true;
    scene.add(ground);
    return { renderer, scene, camera };
  }

  function roundedRect(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  // Size reference: a generic poker deck in its box, standing on its end beside the camera.
  function makeDeck() {
    function deckTexture(face) {
      const cv = document.createElement('canvas');
      cv.width = 264; cv.height = 368;
      const g = cv.getContext('2d');
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, 264, 368);
      g.fillStyle = '#b3262d'; g.fillRect(14, 14, 236, 340);
      if (face) {
        g.strokeStyle = 'rgba(244,241,234,.55)'; g.lineWidth = 3;
        for (let i = -368; i < 264; i += 18) { g.beginPath(); g.moveTo(i, 14); g.lineTo(i + 340, 354); g.stroke(); g.beginPath(); g.moveTo(i + 340, 14); g.lineTo(i, 354); g.stroke(); }
        g.fillStyle = '#b3262d'; g.fillRect(70, 130, 124, 108);
        g.fillStyle = '#f4f1ea'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.fillText('♠', 132, 205);
      }
      const t = new THREE.CanvasTexture(cv);
      t.encoding = THREE.sRGBEncoding;
      return t;
    }
    const sideMat = new THREE.MeshStandardMaterial({ map: deckTexture(false), roughness: 0.55 });
    const faceMat = new THREE.MeshStandardMaterial({ map: deckTexture(true), roughness: 0.55 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(66, 92, 20), [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat]);
    deck.rotation.y = THREE.MathUtils.degToRad(-24);
    deck.castShadow = true; deck.receiveShadow = true;
    return deck;
  }

  function fetchStl(loader, name) {
    return fetch(BASE + 'parts/' + name + '.stl')
      .then(r => { if (!r.ok) throw new Error(name + ': ' + r.status); return r.arrayBuffer(); })
      .then(buf => { const g = loader.parse(buf); g.computeVertexNormals(); return g; });
  }

  // Printed parts: MJF nylon, dyed. Matte with a soft sheen.
  const CASE_PARTS = [
    { name: 'front_shell', color: 0x34393e, explode: [0, 0, 0] },
    { name: 'rear_bezel', color: 0x2a2e32, explode: [30, 0, 0] },
    { name: 'grip', color: 0x2f3337, explode: [0, 0, -28] },
    { name: 'grip_cap', color: 0x24272a, explode: [0, 0, -52] },
    { name: 'trigger', color: 0xc8372a, explode: [-22, 0, -28] }
  ];
  // Electronics inside (pxl_internals.py; the carrier is the routed KiCad board). Loaded the first time the
  // inside can be seen: explode, a single part, or X-ray. `real` colours normally, `xray` the legend's colours.
  // The camera is drawn from the start: it shows through the lens barrel.
  const CASE_INTERNALS = [
    { name: 'in_nano', part: 'front_shell', real: 0x1c1f22, xray: 0x3c8d5a },
    { name: 'in_nano_parts', part: 'front_shell', real: 0xa7acb1, xray: 0x9aa3ad, metal: true },
    { name: 'in_carrier_board', part: 'front_shell', real: 0x1f4a33, xray: 0x8a5cd6 },
    { name: 'in_carrier_parts', part: 'front_shell', real: 0xddd8cb, xray: 0xe6e1d3 },
    { name: 'in_usb_link', part: 'front_shell', real: 0x161616, xray: 0xe08a2c },
    { name: 'in_screen', part: 'rear_bezel', real: 0x15212d, xray: 0x4d7fc4 }
  ];
  const CASE_VIEWS = {
    front: [-230, 95, 215],
    rear: [235, 85, 175],
    side: [0, -5, 360],
    top: [20, 380, 30],
    ports: [40, 95, -315],
    under: [-60, -260, 140]
  };

  function buildCase(canvas, video, opts) {
    opts = opts || {};
    const groundY = -92.2;
    const { renderer, scene, camera } = makeStage(canvas, opts.background || '#0e0e0e', groundY);

    const model = new THREE.Group();
    scene.add(model);

    // Materials for the bought parts.
    const M = {
      glass: new THREE.MeshPhysicalMaterial({ color: lin(0x050607), roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 }),
      cover: new THREE.MeshPhysicalMaterial({ color: 0x000000, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false }),
      steel: new THREE.MeshStandardMaterial({ color: lin(0xb9bec4), roughness: 0.28, metalness: 1 }),
      blackSteel: new THREE.MeshStandardMaterial({ color: lin(0x1b1c1e), roughness: 0.35, metalness: 0.9 }),
      brass: new THREE.MeshStandardMaterial({ color: lin(0xc9a35a), roughness: 0.3, metalness: 1 }),
      darkPlastic: new THREE.MeshStandardMaterial({ color: lin(0x111214), roughness: 0.5 }),
      camera: new THREE.MeshStandardMaterial({ color: lin(0x141516), roughness: 0.55 }),
      lens: new THREE.MeshPhysicalMaterial({ color: lin(0x0b1220), roughness: 0.02, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 }),
      led: new THREE.MeshPhysicalMaterial({ color: lin(0xb3120a), emissive: lin(0xff1205), emissiveIntensity: 0.9, roughness: 0.12, clearcoat: 1 }),
      slider: new THREE.MeshStandardMaterial({ color: lin(0x55595e), roughness: 0.45 }),
      paint: new THREE.MeshStandardMaterial({ color: lin(0xd9412b), roughness: 0.45 })
    };

    // Each detail moves and hides with the printed part it belongs to.
    const details = { front_shell: new THREE.Group(), rear_bezel: new THREE.Group(), grip: new THREE.Group(), grip_cap: new THREE.Group() };
    Object.values(details).forEach(g => model.add(g));
    function put(part, geo, mat, pos, setup) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      m.castShadow = true; m.receiveShadow = true;
      if (setup) setup(m);
      details[part].add(m);
      return m;
    }

    // --- Screen: glass with its black frame, standing 1.5 mm proud of the bezel, and the picture under it.
    const IW = 320, IH = 240, OW = 320, OH = 240;
    const grab = document.createElement('canvas');
    grab.width = IW; grab.height = IH;
    const gctx = grab.getContext('2d', { willReadFrequently: true });
    const scr = document.createElement('canvas');
    scr.width = OW; scr.height = OH;
    const sctx = scr.getContext('2d');
    const simg = sctx.createImageData(OW, OH);
    const screenTex = new THREE.CanvasTexture(scr);
    screenTex.encoding = THREE.sRGBEncoding;
    screenTex.magFilter = THREE.LinearFilter;
    const still = new THREE.TextureLoader().load(BASE + 'screen.png');
    still.encoding = THREE.sRGBEncoding;
    const screenMat = new THREE.MeshBasicMaterial({ map: still, toneMapped: false });

    const glassFace = GLASS_X0 + GLASS.t;
    put('rear_bezel', new THREE.BoxGeometry(GLASS.t, GLASS.h, GLASS.w), M.glass, P(GLASS_X0 + GLASS.t / 2, 0, GLASS.z));
    put('rear_bezel', new THREE.PlaneGeometry(ACTIVE.w, ACTIVE.h), screenMat, P(glassFace + 0.02, 0, GLASS.z),
      m => { m.rotation.y = Math.PI / 2; m.castShadow = false; });
    // A faint reflective cover over the picture.
    put('rear_bezel', new THREE.PlaneGeometry(GLASS.w - 0.4, GLASS.h - 0.4), M.cover, P(glassFace + 0.06, 0, GLASS.z),
      m => { m.rotation.y = Math.PI / 2; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; });

    // --- Four M2 countersunk screws through the bezel and the screen's corner holes.
    SCREEN_HOLES.forEach(([y, z]) => {
      put('rear_bezel', new THREE.CylinderGeometry(1.9, 1.9, 0.5, 24), M.blackSteel, P(REAR + 0.15, y, z), m => { m.rotation.z = Math.PI / 2; });
      put('rear_bezel', new THREE.BoxGeometry(0.2, 1.8, 0.45), M.darkPlastic, P(REAR + 0.42, y, z));
      put('rear_bezel', new THREE.BoxGeometry(0.2, 0.45, 1.8), M.darkPlastic, P(REAR + 0.42, y, z));
    });

    // --- REC LED: a 5 mm red LED standing 1.5 mm out of its hole.
    put('rear_bezel', new THREE.CylinderGeometry(LED.d / 2, LED.d / 2, 1.6, 24), M.led, P(REAR, LED.y, LED.z), m => { m.rotation.z = Math.PI / 2; });
    put('rear_bezel', new THREE.SphereGeometry(LED.d / 2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.led, P(REAR + 0.8, LED.y, LED.z),
      m => { m.rotation.z = -Math.PI / 2; });

    // --- Camera: the measured module (from pxl_internals.py) and the lens's front glass in the barrel.
    let cameraMesh = null;
    const lensX = LENS_FRONT;
    put('front_shell', new THREE.TorusGeometry(6.4, 0.9, 12, 40), M.blackSteel, P(lensX - 0.1, 0, CAM_Z), m => { m.rotation.y = Math.PI / 2; });
    // Front element: a shallow dome (radius 20, rim 5.5) in the lens's front ring.
    put('front_shell', new THREE.SphereGeometry(20, 40, 8, 0, Math.PI * 2, 0, 0.28), M.lens, P(lensX + 20 * Math.cos(0.28) - 0.1, 0, CAM_Z),
      m => { m.rotation.z = Math.PI / 2; });

    // --- Right wall: the carrier's USB-C receptacle and the power slide switch, seen through their slots.
    const usb = new THREE.Shape(roundedRect(8.94, 3.26, 1.55).getPoints(24));
    usb.holes.push(new THREE.Path(roundedRect(8.3, 2.62, 1.25).getPoints(24)));
    const usbDepth = 1.4;
    // Shapes lie in three's x-y plane (CAD X, Z) and extrude along +z, i.e. inward from the right wall.
    const usbMouth = SIDE - 0.4;                                    // receptacle mouth, just inside the slot
    put('front_shell', new THREE.ExtrudeGeometry(usb, { depth: usbDepth, bevelEnabled: false }), M.steel, P(USBC.x, usbMouth, USBC.z));
    put('front_shell', new THREE.BoxGeometry(8.3, 2.6, 0.3), M.darkPlastic, P(USBC.x, usbMouth - usbDepth, USBC.z));
    put('front_shell', new THREE.BoxGeometry(6.6, 0.7, 1.0), M.darkPlastic, P(USBC.x, usbMouth - 0.9, USBC.z));
    put('front_shell', new THREE.BoxGeometry(5.6, 0.74, 0.8), M.brass, P(USBC.x, usbMouth - 0.95, USBC.z));

    put('front_shell', new THREE.ExtrudeGeometry(roundedRect(10.1, 4.8, 0.9), { depth: 0.8, bevelEnabled: false }), M.darkPlastic,
      P(SWITCH.x, SIDE - 1.0, SWITCH.z));
    put('front_shell', new THREE.BoxGeometry(3.4, 3.0, 2.6), M.slider, P(SWITCH.x - 2.3, SIDE - 0.9, SWITCH.z));
    for (let i = -1; i <= 1; i++) {   // grip ridges on the slider
      put('front_shell', new THREE.BoxGeometry(0.4, 2.8, 0.25), M.blackSteel, P(SWITCH.x - 2.3 + i * 0.9, SIDE + 0.45, SWITCH.z));
    }

    // --- The logo's REC dot, filled with red paint.
    put('front_shell', new THREE.CircleGeometry(1.0, 24), M.paint, P(LOGO_DOT.x, -SIDE + 0.55, LOGO_DOT.z), m => { m.receiveShadow = false; });

    // --- Grip cap: the ¼-20 heat-set insert.
    const insert = new THREE.Shape(); insert.absarc(0, 0, 4.0, 0, Math.PI * 2);
    const bore = new THREE.Path(); bore.absarc(0, 0, 3.15, 0, Math.PI * 2, true); insert.holes.push(bore);
    put('grip_cap', new THREE.ExtrudeGeometry(insert, { depth: 6, bevelEnabled: false, curveSegments: 32 }), M.brass, P(TRIPOD.x, 0, TRIPOD.z - 0.05),
      m => { m.rotation.x = -Math.PI / 2; });
    put('grip_cap', new THREE.CircleGeometry(3.15, 32), M.darkPlastic, P(TRIPOD.x, 0, TRIPOD.z + 5.9), m => { m.rotation.x = Math.PI / 2; });

    // Live PXL processing: each raw clip frame -> camera pipeline -> screen, at the camera's 15 fps.
    const cam = { light: 0.5, fx: 0, mode: 0, colour: true, sound: false, level: 0, analyser: null, abuf: null };
    let pxl = null, inPtr = 0, outPtr = 0, lastTick = 0;
    const pxlReady = (typeof PXLModule === 'function' ? PXLModule() : Promise.reject(new Error('no pipeline')))
      .then(m => {
        pxl = m;
        pxl._pxl_web_init(IW, IH, OW, OH);
        inPtr = pxl._pxl_web_input();
        outPtr = pxl._pxl_web_output();
        cam.mode = pxl._pxl_web_fx_next(99); // SCAN
        pxl._pxl_web_glitch();               // the first clip opens like a recording
        return pxl;
      })
      .catch(() => null);
    function processFrame(now, force) {
      if (!pxl || video.readyState < 2) return;
      if (!force && (video.paused || now - lastTick < 1000 / 15)) return;
      lastTick = now;
      gctx.drawImage(video, 0, 0, IW, IH);
      let d;
      try { d = gctx.getImageData(0, 0, IW, IH).data; } catch (e) { return; }
      pxl.HEAPU8.set(d, inPtr);
      pxl._pxl_web_controls(cam.mode, cam.fx, 0, cam.light);
      pxl._pxl_web_saturation(cam.colour ? 1 : 0);
      if (cam.sound && cam.analyser) {
        cam.analyser.getFloatTimeDomainData(cam.abuf);
        pxl.HEAPF32.set(cam.abuf, pxl._pxl_web_audio_buffer() >> 2);
        cam.level = pxl._pxl_web_audio(cam.abuf.length);
      }
      pxl._pxl_web_process();
      simg.data.set(pxl.HEAPU8.subarray(outPtr, outPtr + OW * OH * 4));
      sctx.putImageData(simg, 0, 0);
      screenTex.needsUpdate = true;
      if (screenMat.map !== screenTex) { screenMat.map = screenTex; screenMat.needsUpdate = true; }
    }

    // CAD parts (build123d -> three: rotate -90 about X).
    const loader = new THREE.STLLoader();
    const cad = new THREE.Group();
    cad.rotation.x = -Math.PI / 2;
    model.add(cad);
    const parts = {};
    const shellMats = [];
    let explodeAmount = 0;
    function applyExplode() {
      CASE_PARTS.forEach(def => {
        const e = def.explode.map(v => v * explodeAmount);
        if (parts[def.name]) parts[def.name].position.set(e[0], e[1], e[2]);
        if (details[def.name]) details[def.name].position.copy(P(e[0], e[1], e[2]));
      });
    }
    const partsReady = Promise.all(CASE_PARTS.map(def => fetchStl(loader, def.name).then(geo => {
      const mat = new THREE.MeshPhysicalMaterial({ color: lin(def.color), roughness: 0.72, metalness: 0, clearcoat: 0.06, clearcoatRoughness: 0.6 });
      shellMats.push(mat);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      parts[def.name] = m;
      cad.add(m);
      applyExplode();
    }))).then(() => fetchStl(loader, 'in_camera')).then(geo => {
      // The camera module sits in the front shell; in CAD coords like the shell.
      cameraMesh = new THREE.Mesh(geo, M.camera);
      cameraMesh.rotation.x = -Math.PI / 2;
      cameraMesh.castShadow = true;
      details.front_shell.add(cameraMesh);
    }).catch(() => {});

    // Internals: each rides with the part it is fixed to (the screen module with the bezel, the cell in the grip).
    const boards = [];   // { mat, def }
    let xray = false;
    function boardMat(def) {
      const mat = new THREE.MeshStandardMaterial({ color: lin(xray ? def.xray : def.real), roughness: def.metal ? 0.35 : 0.6, metalness: def.metal ? 0.6 : 0 });
      boards.push({ mat, def });
      return mat;
    }
    let internalsLoaded = null;
    function loadInternals() {
      if (!internalsLoaded) {
        internalsLoaded = Promise.all(CASE_INTERNALS.map(def => fetchStl(loader, def.name).then(geo => {
          const m = new THREE.Mesh(geo, boardMat(def));
          m.rotation.x = -Math.PI / 2;      // CAD coords, like the shell
          m.castShadow = true; m.receiveShadow = true;
          details[def.part].add(m);
        }).catch(() => {})));
        // The 18650 in the grip's bay, in its wrap.
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(9.3, 9.3, 65.5, 32), boardMat({ real: 0x2b5a86, xray: 0xb04a3a }));
        cell.position.set(1.6, -50, 0);
        cell.rotation.z = THREE.MathUtils.degToRad(3.8);
        details.grip.add(cell);
      }
      return internalsLoaded;
    }

    const deck = makeDeck();
    deck.position.set(52, groundY + 46, -64);   // beside the rear right corner: close enough to stay in frame as it turns
    scene.add(deck);
    camera.position.set(...CASE_VIEWS.front);

    return {
      renderer, scene, camera, model, parts, details, deck, cam, screenMat,
      views: CASE_VIEWS, partsReady, pxlReady, processFrame, loadInternals,
      setExplode(v) { explodeAmount = v; applyExplode(); },
      setXray(on) {
        xray = on;
        boards.forEach(b => b.mat.color.copy(lin(on ? b.def.xray : b.def.real)));
        shellMats.forEach(m => { m.transparent = on; m.opacity = on ? 0.18 : 1; m.depthWrite = !on; m.needsUpdate = true; });
        M.camera.color.copy(lin(on ? 0xc9a227 : 0x141516));
      },
      get pxl() { return pxl; }
    };
  }

  // ---- interactive viewer ----------------------------------------------------------------------------------

  function q(root, role) { return root.querySelector('[data-role="' + role + '"]'); }
  function pressIn(root, attr, btn) {
    root.querySelectorAll('[' + attr + ']').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
  }
  function toggle(btn, fn) {
    btn.addEventListener('click', () => {
      const on = btn.getAttribute('aria-pressed') !== 'true';
      btn.setAttribute('aria-pressed', String(on));
      fn(on);
    });
  }
  function failed(root) {
    const fb = q(root, 'fallback');
    if (fb) fb.hidden = false;
    const hint = q(root, 'hint');
    if (hint) hint.hidden = true;
  }

  const PART_INFO = {
    front_shell: 'Front shell · 97 × 76 × 61 mm · 56.6 cm³ · camera standoffs, 19 mm lens barrel, screen posts, NANO posts, logo (left), ports (right)',
    rear_bezel: 'Rear bezel · 10 × 76 × 61 mm · 10.3 cm³ · glass window and screen pocket, REC LED under the screen, 4 × M2 through the screen into the shell',
    grip: 'Grip · 37 × 30 × 90 mm · 46.8 cm³ · 18650 bay, trigger slot, switch pocket, pivot pin, 2 × M3 into the body',
    grip_cap: 'Grip cap · 25 × 25 × 8 mm · 2.2 cm³ · closes the battery bay, ¼-20 tripod insert',
    trigger: 'Trigger · 10 × 12 × 19 mm · 2.1 cm³ · REC lever on a Ø2 mm pin'
  };

  function initCase(root) {
    const stage = q(root, 'stage');
    const canvas = q(root, 'canvas');
    const video = q(root, 'video');
    video.src = BASE + 'clips/market.mp4';
    let c;
    const studio = getComputedStyle(root).getPropertyValue('--cv-studio').trim() || '#0e0e0e';
    try { c = buildCase(canvas, video, { background: studio }); } catch (e) { failed(root); return; }
    const { renderer, camera, scene } = c;

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 160;
    controls.maxDistance = 900;
    controls.target.set(0, -15, 0);
    controls.autoRotateSpeed = 1.6;
    let tween = null;
    function goTo(name) {
      const to = new THREE.Vector3(...c.views[name]);
      if (reduceMotion) { camera.position.copy(to); controls.update(); return; }
      tween = { from: camera.position.clone(), to, t: 0 };
    }
    controls.addEventListener('start', () => { tween = null; });
    root.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { pressIn(root, 'data-view', b); goTo(b.dataset.view); }));

    const xb = q(root, 'xray');
    let isolated = null;
    function isolate(name) {
      isolated = name === 'all' ? null : name;
      Object.entries(c.parts).forEach(([n, m]) => { m.visible = !isolated || n === isolated; });
      Object.entries(c.details).forEach(([n, g]) => { g.visible = !isolated || n === isolated; });
      if (isolated) c.loadInternals();
      q(root, 'part-info').textContent = isolated ? PART_INFO[isolated] : '';
      if (isolated && c.parts[isolated]) {
        const box = new THREE.Box3().setFromObject(c.parts[isolated]);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3()).length();
        controls.minDistance = Math.max(30, size);
        controls.target.copy(center);
        const dir = camera.position.clone().sub(controls.target).normalize();
        tween = { from: camera.position.clone(), to: center.clone().add(dir.multiplyScalar(size * 1.7 + 25)), t: reduceMotion ? 1 : 0 };
      } else {
        controls.minDistance = 160;
        controls.target.set(0, -15, 0);
        pressIn(root, 'data-view', root.querySelector('[data-view="front"]'));
        goTo('front');
      }
    }
    root.querySelectorAll('[data-part]').forEach(b => b.addEventListener('click', () => { pressIn(root, 'data-part', b); isolate(b.dataset.part); }));
    q(root, 'explode').addEventListener('input', ev => { c.loadInternals(); c.setExplode(parseFloat(ev.target.value)); });
    toggle(xb, on => {
      if (on) c.loadInternals();
      q(root, 'legend').hidden = !on;
      c.setXray(on);
    });
    const spin = q(root, 'spin');
    toggle(spin, on => { controls.autoRotate = on; });
    toggle(q(root, 'cards'), on => { c.deck.visible = on; });
    if (root.hasAttribute('data-autospin')) {
      // As the page hero it turns by itself (unless the reader prefers reduced motion), starting a little
      // further out so the camera and the deck both stay in frame as it turns.
      controls.autoRotate = !reduceMotion;
      spin.setAttribute('aria-pressed', String(!reduceMotion));
      controls.target.set(0, -25, 0);
      camera.position.sub(controls.target).multiplyScalar(1.45).add(controls.target);
    }

    // Clips.
    const pb = q(root, 'play');
    function setPlaying(on) {
      pb.setAttribute('aria-pressed', String(on));
      pb.textContent = on ? 'Pause' : 'Play';
      if (on) video.play().catch(() => setPlaying(false)); else video.pause();
    }
    pb.addEventListener('click', () => setPlaying(pb.getAttribute('aria-pressed') !== 'true'));
    root.querySelectorAll('[data-clip]').forEach(b => b.addEventListener('click', () => {
      pressIn(root, 'data-clip', b);
      video.src = BASE + b.dataset.clip;
      if (c.pxl) c.pxl._pxl_web_glitch(); // a new clip opens like a recording
      setPlaying(true);
    }));
    setPlaying(!reduceMotion);

    q(root, 'scannow').addEventListener('click', () => { if (c.pxl) c.pxl._pxl_web_scan_visit(); });
    const colourBtn = q(root, 'colour');
    colourBtn.addEventListener('click', () => {
      c.cam.colour = !c.cam.colour;
      colourBtn.setAttribute('aria-pressed', String(c.cam.colour));
      colourBtn.textContent = c.cam.colour ? 'Colour' : 'B&W';
    });
    const soundBtn = q(root, 'sound');
    let actx = null;
    soundBtn.addEventListener('click', () => {
      c.cam.sound = !c.cam.sound;
      soundBtn.setAttribute('aria-pressed', String(c.cam.sound));
      if (c.cam.sound && !actx) {
        try {
          actx = new AudioContext();
          const src = actx.createMediaElementSource(video);
          const analyser = actx.createAnalyser();
          analyser.fftSize = 4096;
          c.cam.analyser = analyser;
          c.cam.abuf = new Float32Array(analyser.fftSize);
          src.connect(analyser);
          analyser.connect(actx.destination);
          if (c.pxl) c.pxl._pxl_web_audio_rate(actx.sampleRate);
        } catch (e) { c.cam.analyser = null; }
      }
      if (actx) actx.resume();
      video.muted = !c.cam.sound;
      if (!c.cam.sound && c.pxl) c.pxl._pxl_web_silence();
    });

    function resize() {
      const w = stage.clientWidth, h = stage.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    new ResizeObserver(resize).observe(stage);
    resize();

    let visible = true;
    new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);
    function frame() {
      requestAnimationFrame(frame);
      if (!visible) return;
      c.processFrame(performance.now());
      if (tween) {
        tween.t = Math.min(1, tween.t + 0.045);
        const e = 1 - Math.pow(1 - tween.t, 3);
        camera.position.lerpVectors(tween.from, tween.to, e);
        if (tween.t >= 1) tween = null;
      }
      controls.update();
      renderer.render(scene, camera);
    }
    frame();
    window.__cassvision = { c, controls }; // for inspection from the console
  }

  function boot() {
    document.querySelectorAll('[data-cassvision="case"]').forEach(root => {
      if (root.dataset.cvStarted) return;
      const io = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        root.dataset.cvStarted = '1';
        loadLibs().then(() => initCase(root)).catch(() => failed(root));
      }, { rootMargin: '300px' });
      io.observe(root);
    });
  }

  window.Cassvision = { loadLibs, buildCase, BASE };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
