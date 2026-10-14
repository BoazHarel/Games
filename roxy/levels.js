/* Roxy's Big Clean: LEGO colors, floor styles, house layouts, and the grid builder. */
(function () {
  var RX = globalThis.RX || (globalThis.RX = {});

  // Classic LEGO palette
  var C = RX.C = {
    red: '#C91A09', blue: '#0055BF', yellow: '#F2CD37', green: '#237841', bgreen: '#4B9F4A',
    white: '#F2F3F2', black: '#1B2A34', tan: '#E4CD9E', dtan: '#958A73', brown: '#582A12',
    nougat: '#AA7D55', lgray: '#A0A5A9', dgray: '#6C6E68', orange: '#FE8A18', lavender: '#CDA4DE',
    pink: '#FC97AC', dpink: '#C870A0', azure: '#36AEBF', lime: '#BBE90B', sky: '#9FC3E9',
    mblue: '#5A93DB', dred: '#720E0F', purple: '#81007B', coral: '#FF698F', teal: '#069D9F',
    gold: '#DBAC34', sand: '#DCC48D', lgreen: '#78B65F', aqua: '#ADC3C0'
  };

  // Floor styles. base = plate color, studs = studded plate (else smooth tiles in `pattern`)
  RX.FLOORS = {
    studs:   { base: C.tan, studs: true },
    wood:    { base: '#B5835A', pattern: 'planks', alt: '#A2714A' },
    lwood:   { base: '#E2C495', pattern: 'planks', alt: '#D3B07E' },
    deck:    { base: '#C9A06C', pattern: 'deck', alt: '#B58C5A' },
    tile:    { base: '#B9BDC0', pattern: 'tiles2', alt: '#ABAFB2' },
    checker: { base: C.white, pattern: 'checker', alt: C.sky },
    bath:    { base: '#DDEBF7', pattern: 'checker1', alt: '#9FC3E9' },
    lav:     { base: C.lavender, studs: true },
    bluec:   { base: '#7FAEE8', studs: true },
    pinkc:   { base: '#F7B5C6', studs: true },
    stone:   { base: '#8D9296', pattern: 'stone', alt: '#7A7F83' },
    lstone:  { base: '#B4B7B9', pattern: 'stone', alt: '#A3A6A9' }
  };

  // What gets spilled where (by floor) when a room doesn't say
  var DEFAULT_MESS = {
    studs: ['crumb', 'cheerio', 'dust'], wood: ['dust', 'crumb'], lwood: ['sand', 'crumb'],
    tile: ['crumb', 'juice'], checker: ['crumb', 'cheerio', 'juice'], bath: ['puddle', 'dust'],
    lav: ['brick', 'crumb'], bluec: ['brick', 'dust'], pinkc: ['glitter', 'cheerio'],
    stone: ['dust', 'hay'], lstone: ['crumb', 'coin'], deck: ['sand', 'shell']
  };
  RX.DEFAULT_MESS = DEFAULT_MESS;

  RX.LEVELS = [
    {
      id: 'apartment', name: 'Tiny Apartment', w: 18, h: 14, outside: 'grass', seed: 11,
      rooms: [
        { id: 'bedroom', name: 'Bedroom', icon: '🛏️', floor: 'wood', wall: C.yellow, rects: [[2, 2, 8, 4]], mess: { n: 7, k: ['dust', 'crumb'] } },
        { id: 'bath', name: 'Bathroom', icon: '🛁', floor: 'bath', wall: C.azure, rects: [[11, 2, 5, 4]], mess: { n: 5, k: ['puddle', 'dust'] } },
        { id: 'living', name: 'Living Room', icon: '🛋️', floor: 'studs', wall: C.red, rects: [[2, 7, 8, 4]], mess: { n: 10, k: ['crumb', 'cheerio', 'brick'] } },
        { id: 'kitchen', name: 'Kitchen', icon: '🍳', floor: 'checker', wall: C.blue, rects: [[11, 7, 5, 4]], mess: { n: 8, k: ['crumb', 'cheerio', 'juice'] } }
      ],
      doors: [[5, 6, 'living'], [10, 8, 'kitchen'], [10, 9, 'kitchen'], [10, 3, 'bath']],
      windows: [[4, 1, 2, 'h'], [12, 1, 2, 'h'], [1, 3, 2, 'v'], [1, 8, 2, 'v'], [16, 8, 2, 'v'], [16, 3, 2, 'v'], [3, 11, 2, 'h'], [12, 11, 2, 'h']],
      frontDoor: [7, 11],
      furniture: [
        { t: 'bed', x: 2, y: 2, w: 3, h: 2, head: 'w', color: C.dpink },
        { t: 'nightstand', x: 2, y: 4 },
        { t: 'dresser', x: 8, y: 2, w: 2, h: 1 },
        { t: 'tub', x: 13, y: 2, w: 3, h: 1 },
        { t: 'toilet', x: 15, y: 5, face: 'w' },
        { t: 'sink', x: 11, y: 5 },
        { t: 'rug', x: 3, y: 8, w: 3, h: 3, color: C.mblue },
        { t: 'sofa', x: 2, y: 8, w: 1, h: 3, face: 'e', color: C.red },
        { t: 'table', x: 4, y: 9, w: 1, h: 1 },
        { t: 'plant', x: 9, y: 10 },
        { t: 'counter', x: 12, y: 10, w: 3, h: 1, stove: 1, sinkAt: 0 },
        { t: 'fridge', x: 15, y: 10 },
        { t: 'dtable', x: 13, y: 8, w: 1, h: 1 }
      ],
      dock: [8, 7, 'n'],
      toys: { n: 1, k: ['teddy'] },
      pet: null
    },
    {
      id: 'house', name: 'LEGO House', w: 24, h: 17, outside: 'grass', seed: 22,
      rooms: [
        { id: 'living', name: 'Living Room', icon: '🛋️', floor: 'studs', wall: C.red, rects: [[2, 2, 7, 6]], mess: { n: 11, k: ['crumb', 'cheerio', 'dust'] } },
        { id: 'kitchen', name: 'Kitchen', icon: '🍳', floor: 'tile', wall: C.blue, rects: [[2, 9, 7, 5]], mess: { n: 10, k: ['crumb', 'juice', 'cheerio'] } },
        { id: 'hall', name: 'Hallway', icon: '👟', floor: 'studs', wall: C.white, rects: [[10, 2, 3, 12]], mess: { n: 8, k: ['mud', 'leaf', 'sand'] } },
        { id: 'master', name: 'Big Bedroom', icon: '🛏️', floor: 'wood', wall: C.bgreen, rects: [[14, 2, 8, 5]], mess: { n: 8, k: ['dust', 'crumb'] } },
        { id: 'kids', name: 'Kids Room', icon: '🧸', floor: 'lav', wall: C.yellow, rects: [[14, 8, 4, 6]], mess: { n: 9, k: ['brick', 'cheerio'] } },
        { id: 'bath', name: 'Bathroom', icon: '🛁', floor: 'bath', wall: C.azure, rects: [[19, 8, 3, 6]], mess: { n: 5, k: ['puddle', 'dust'] } }
      ],
      doors: [[9, 4, 'living'], [9, 5, 'living'], [9, 11, 'kitchen'], [5, 8, 'kitchen'], [13, 4, 'master'], [13, 10, 'kids'], [20, 7, 'bath']],
      windows: [[3, 1, 2, 'h'], [6, 1, 2, 'h'], [16, 1, 2, 'h'], [19, 1, 2, 'h'], [1, 4, 2, 'v'], [1, 10, 2, 'v'], [22, 3, 2, 'v'], [22, 10, 2, 'v'], [4, 14, 2, 'h'], [15, 14, 2, 'h'], [20, 14, 1, 'h']],
      frontDoor: [11, 14],
      furniture: [
        { t: 'rug', x: 3, y: 3, w: 4, h: 4, color: C.red },
        { t: 'sofa', x: 2, y: 3, w: 1, h: 3, face: 'e', color: C.blue },
        { t: 'table', x: 4, y: 4, w: 1, h: 2 },
        { t: 'tv', x: 8, y: 2, w: 1, h: 2, face: 'w' },
        { t: 'plant', x: 8, y: 7 },
        { t: 'plant', x: 2, y: 7 },
        { t: 'fridge', x: 2, y: 9 },
        { t: 'counter', x: 2, y: 10, w: 1, h: 2, sinkAt: 1 },
        { t: 'counter', x: 2, y: 13, w: 4, h: 1, stove: 2 },
        { t: 'dtable', x: 5, y: 11, w: 2, h: 1 },
        { t: 'shelf', x: 10, y: 13 },
        { t: 'plant', x: 12, y: 13 },
        { t: 'rug', x: 16, y: 3, w: 2, h: 3, color: C.white },
        { t: 'bed', x: 19, y: 3, w: 3, h: 2, head: 'e', color: C.bgreen },
        { t: 'nightstand', x: 21, y: 2 },
        { t: 'nightstand', x: 21, y: 5 },
        { t: 'dresser', x: 15, y: 2, w: 2, h: 1 },
        { t: 'bed', x: 16, y: 11, w: 2, h: 3, head: 's', color: C.yellow },
        { t: 'toybox', x: 17, y: 8 },
        { t: 'beanbag', x: 14, y: 13, color: C.orange },
        { t: 'sink', x: 19, y: 8 },
        { t: 'toilet', x: 21, y: 8, face: 's' },
        { t: 'tub', x: 19, y: 13, w: 3, h: 1 }
      ],
      dock: [11, 2, 'n'],
      toys: { n: 2, k: ['sock', 'car'] },
      pet: null
    },
    {
      id: 'upstairs', name: 'Toy Tornado', w: 24, h: 19, outside: 'grass', seed: 33,
      rooms: [
        { id: 'play', name: 'Playroom', icon: '🧩', floor: 'lav', wall: C.orange, rects: [[2, 2, 10, 7]], mess: { n: 18, k: ['brick', 'brick', 'crumb', 'cheerio'] } },
        { id: 'blue', name: 'Blue Room', icon: '🚀', floor: 'bluec', wall: C.blue, rects: [[13, 2, 9, 7]], mess: { n: 10, k: ['brick', 'dust'] } },
        { id: 'hall', name: 'Hallway', icon: '👣', floor: 'wood', wall: C.white, rects: [[2, 10, 20, 2]], mess: { n: 8, k: ['dust', 'crumb'] } },
        { id: 'pink', name: 'Pink Room', icon: '🦄', floor: 'pinkc', wall: C.dpink, rects: [[2, 13, 8, 3]], mess: { n: 8, k: ['glitter', 'cheerio'] } },
        { id: 'bath', name: 'Bathroom', icon: '🛁', floor: 'bath', wall: C.azure, rects: [[11, 13, 5, 3]], mess: { n: 5, k: ['puddle', 'puddle', 'dust'] } },
        { id: 'laundry', name: 'Laundry', icon: '🧺', floor: 'tile', wall: C.lime, rects: [[17, 13, 5, 3]], mess: { n: 6, k: ['dust', 'puddle'] } }
      ],
      doors: [[6, 9, 'play'], [7, 9, 'play'], [17, 9, 'blue'], [12, 5, 'play'], [5, 12, 'pink'], [13, 12, 'bath'], [19, 12, 'laundry']],
      windows: [[4, 1, 2, 'h'], [8, 1, 2, 'h'], [15, 1, 2, 'h'], [19, 1, 2, 'h'], [1, 4, 2, 'v'], [22, 4, 2, 'v'], [1, 14, 1, 'v'], [22, 14, 1, 'v'], [4, 16, 2, 'h'], [13, 16, 1, 'h'], [19, 16, 1, 'h']],
      frontDoor: null,
      furniture: [
        { t: 'rug', x: 3, y: 4, w: 6, h: 3, color: C.yellow },
        { t: 'shelf', x: 4, y: 2, w: 3, h: 1 },
        { t: 'beanbag', x: 2, y: 2, color: C.red },
        { t: 'beanbag', x: 11, y: 2, color: C.lime },
        { t: 'kidtable', x: 5, y: 5, w: 2, h: 1 },
        { t: 'toybox', x: 2, y: 8 },
        { t: 'legoset', x: 9, y: 7, w: 2, h: 1 },
        { t: 'rug', x: 15, y: 4, w: 3, h: 3, color: C.white, round: 1 },
        { t: 'bed', x: 20, y: 2, w: 2, h: 3, head: 'n', color: C.blue },
        { t: 'desk', x: 13, y: 2, w: 2, h: 1 },
        { t: 'shelf', x: 16, y: 2, w: 2, h: 1 },
        { t: 'beanbag', x: 21, y: 8, color: C.yellow },
        { t: 'stairs', x: 20, y: 10, w: 2, h: 2 },
        { t: 'plant', x: 2, y: 10 },
        { t: 'bed', x: 2, y: 14, w: 3, h: 2, head: 'w', color: C.pink },
        { t: 'dresser', x: 8, y: 15, w: 2, h: 1 },
        { t: 'shelf', x: 7, y: 13 },
        { t: 'sink', x: 11, y: 13 },
        { t: 'toilet', x: 15, y: 13, face: 's' },
        { t: 'tub', x: 13, y: 15, w: 3, h: 1 },
        { t: 'washer', x: 21, y: 13 },
        { t: 'washer', x: 21, y: 14, dryer: 1 },
        { t: 'basket', x: 17, y: 15 }
      ],
      dock: [3, 11, 's'],
      toys: { n: 4, k: ['teddy', 'car', 'dino', 'ball', 'sock'] },
      pet: 'cat'
    },
    {
      id: 'beach', name: 'Beach House', w: 24, h: 17, outside: 'beach', seed: 44,
      rooms: [
        { id: 'great', name: 'Big Room', icon: '🏖️', floor: 'lwood', wall: C.azure, rects: [[2, 2, 12, 7]], mess: { n: 18, k: ['sand', 'shell', 'crumb'] } },
        { id: 'bed1', name: 'Sunny Bedroom', icon: '🌞', floor: 'lwood', wall: C.yellow, rects: [[15, 2, 7, 5]], mess: { n: 8, k: ['sand', 'dust'] } },
        { id: 'mud', name: 'Front Hall', icon: '🩴', floor: 'tile', wall: C.orange, rects: [[2, 10, 5, 4]], mess: { n: 8, k: ['sand', 'mud', 'puddle'] } },
        { id: 'deck', name: 'Deck', icon: '🌴', floor: 'deck', wall: C.white, rects: [[8, 10, 6, 4]], mess: { n: 10, k: ['sand', 'shell', 'puddle'] } },
        { id: 'bath', name: 'Bathroom', icon: '🛁', floor: 'bath', wall: C.teal, rects: [[15, 8, 3, 6]], mess: { n: 6, k: ['puddle', 'sand'] } },
        { id: 'bed2', name: 'Shell Room', icon: '🐚', floor: 'bluec', wall: C.coral, rects: [[19, 8, 3, 6]], mess: { n: 6, k: ['shell', 'sand'] } }
      ],
      doors: [[4, 9, 'mud'], [10, 9, 'deck'], [11, 9, 'deck'], [14, 4, 'bed1'], [14, 8, 'bath'], [7, 12, 'mud'], [20, 7, 'bed2']],
      windows: [[4, 1, 2, 'h'], [9, 1, 2, 'h'], [17, 1, 2, 'h'], [1, 4, 2, 'v'], [22, 3, 2, 'v'], [22, 10, 2, 'v'], [16, 14, 1, 'h'], [20, 14, 1, 'h']],
      frontDoor: [4, 14],
      furniture: [
        { t: 'counter', x: 9, y: 2, w: 5, h: 1, stove: 3, sinkAt: 1 },
        { t: 'island', x: 10, y: 4, w: 2, h: 1 },
        { t: 'rug', x: 3, y: 3, w: 3, h: 4, color: C.azure },
        { t: 'sofa', x: 2, y: 3, w: 1, h: 3, face: 'e', color: C.teal },
        { t: 'table', x: 4, y: 4, w: 1, h: 2 },
        { t: 'plant', x: 2, y: 8, palm: 1 },
        { t: 'dtable', x: 7, y: 6, w: 2, h: 1 },
        { t: 'bed', x: 19, y: 3, w: 3, h: 2, head: 'e', color: C.orange },
        { t: 'nightstand', x: 21, y: 2 },
        { t: 'surfboard', x: 16, y: 2, w: 2, h: 1, color: C.coral },
        { t: 'bench', x: 2, y: 10, w: 1, h: 2 },
        { t: 'surfboard', x: 2, y: 13, w: 2, h: 1, color: C.yellow },
        { t: 'umbrella', x: 9, y: 12 },
        { t: 'lounger', x: 12, y: 12, w: 2, h: 1 },
        { t: 'lounger', x: 12, y: 10, w: 2, h: 1 },
        { t: 'sink', x: 17, y: 8 },
        { t: 'toilet', x: 17, y: 13, face: 'n' },
        { t: 'tub', x: 15, y: 13, w: 2, h: 1 },
        { t: 'bed', x: 20, y: 11, w: 2, h: 3, head: 's', color: C.red },
        { t: 'dresser', x: 19, y: 13, w: 1, h: 1 }
      ],
      dock: [6, 2, 'n'],
      toys: { n: 3, k: ['bucket', 'duck', 'ball', 'teddy'] },
      pet: 'cat'
    },
    {
      id: 'castle', name: 'LEGO Castle', w: 26, h: 18, outside: 'moat', seed: 55,
      rooms: [
        { id: 'wizard', name: 'Wizard Tower', icon: '🧙', floor: 'stone', wall: C.dgray, rects: [[2, 2, 5, 5]], mess: { n: 7, k: ['glitter', 'dust'] } },
        { id: 'throne', name: 'Throne Room', icon: '👑', floor: 'lstone', wall: C.dred, rects: [[8, 2, 10, 5]], mess: { n: 12, k: ['coin', 'crumb', 'dust'] } },
        { id: 'princess', name: 'Princess Tower', icon: '👸', floor: 'pinkc', wall: C.dgray, rects: [[19, 2, 5, 5]], mess: { n: 7, k: ['glitter', 'cheerio'] } },
        { id: 'hall', name: 'Great Hall', icon: '🍗', floor: 'stone', wall: C.lgray, rects: [[2, 8, 22, 4]], mess: { n: 20, k: ['crumb', 'hay', 'dust', 'coin'] } },
        { id: 'kitchen', name: 'Castle Kitchen', icon: '🍲', floor: 'tile', wall: C.lgray, rects: [[2, 13, 8, 3]], mess: { n: 9, k: ['crumb', 'juice', 'puddle'] } },
        { id: 'entry', name: 'Gate Hall', icon: '🏰', floor: 'lstone', wall: C.lgray, rects: [[11, 13, 7, 3]], mess: { n: 8, k: ['mud', 'hay', 'leaf'] } },
        { id: 'armory', name: 'Armory', icon: '⚔️', floor: 'stone', wall: C.lgray, rects: [[19, 13, 5, 3]], mess: { n: 6, k: ['dust', 'coin'] } }
      ],
      doors: [[4, 7, 'wizard'], [12, 7, 'throne'], [13, 7, 'throne'], [21, 7, 'princess'], [6, 12, 'kitchen'], [14, 12, 'entry'], [21, 12, 'armory'], [7, 4, 'throne']],
      windows: [[4, 1, 1, 'h'], [10, 1, 2, 'h'], [14, 1, 2, 'h'], [21, 1, 1, 'h'], [1, 9, 2, 'v'], [24, 9, 2, 'v'], [5, 16, 2, 'h'], [21, 16, 1, 'h']],
      frontDoor: [14, 16],
      furniture: [
        { t: 'shelf', x: 2, y: 2, w: 2, h: 1 },
        { t: 'cauldron', x: 4, y: 4 },
        { t: 'rug', x: 12, y: 3, w: 2, h: 4, color: C.red },
        { t: 'throne', x: 12, y: 2, w: 2, h: 1 },
        { t: 'armor', x: 8, y: 2 },
        { t: 'armor', x: 17, y: 2 },
        { t: 'banner', x: 10, y: 2, color: C.blue },
        { t: 'banner', x: 15, y: 2, color: C.blue },
        { t: 'bed', x: 22, y: 2, w: 2, h: 3, head: 'n', color: C.dpink },
        { t: 'dresser', x: 19, y: 2, w: 1, h: 1 },
        { t: 'longtable', x: 6, y: 9, w: 5, h: 1 },
        { t: 'longtable', x: 15, y: 9, w: 5, h: 1 },
        { t: 'barrel', x: 2, y: 11 },
        { t: 'barrel', x: 23, y: 8 },
        { t: 'counter', x: 2, y: 15, w: 3, h: 1, stove: 1 },
        { t: 'cauldron', x: 8, y: 15 },
        { t: 'barrel', x: 9, y: 13 },
        { t: 'rug', x: 13, y: 13, w: 3, h: 3, color: C.dred },
        { t: 'armor', x: 11, y: 13 },
        { t: 'armor', x: 17, y: 13 },
        { t: 'weapons', x: 23, y: 13, w: 1, h: 3 },
        { t: 'chest', x: 19, y: 15 }
      ],
      dock: [3, 8, 'n'],
      toys: { n: 4, k: ['knight', 'horse', 'teddy', 'ball'] },
      pet: 'dragon'
    }
  ];

  // Flip a layout across its diagonal so a wide house fits a tall screen
  var FLIP = { n: 'w', w: 'n', s: 'e', e: 's' };
  RX.transposeDef = function (def) {
    var t = JSON.parse(JSON.stringify(def));
    t.transposed = true;
    t.w = def.h; t.h = def.w;
    t.rooms.forEach(function (r) { r.rects = r.rects.map(function (rc) { return [rc[1], rc[0], rc[3], rc[2]]; }); });
    t.doors = def.doors.map(function (d) { return [d[1], d[0], d[2]]; });
    t.windows = (def.windows || []).map(function (w) { return [w[1], w[0], w[2], w[3] === 'h' ? 'v' : 'h']; });
    t.frontDoor = def.frontDoor ? [def.frontDoor[1], def.frontDoor[0]] : null;
    t.dock = [def.dock[1], def.dock[0], FLIP[def.dock[2]]];
    t.furniture.forEach(function (f) {
      var x = f.x; f.x = f.y; f.y = x;
      var w = f.w || 1; f.w = f.h || 1; f.h = w;
      if (f.head) f.head = FLIP[f.head];
      if (f.face) f.face = FLIP[f.face];
    });
    return t;
  };

  // Build the cell grid for a level definition.
  // type: 0 outside, 1 wall, 2 floor. room: room index or -1. passable: floor without furniture.
  RX.buildLevel = function (def) {
    var W = def.w, H = def.h, N = W * H;
    var L = {
      def: def, W: W, H: H,
      type: new Uint8Array(N), room: new Int8Array(N).fill(-1), blocked: new Uint8Array(N),
      passable: new Uint8Array(N), wallColor: new Array(N).fill(null), window: new Uint8Array(N),
      door: new Uint8Array(N), rooms: [], furniture: [], warnings: []
    };
    var idx = {};
    def.rooms.forEach(function (r, k) {
      idx[r.id] = k;
      L.rooms.push({ id: r.id, name: r.name, icon: r.icon, floor: r.floor, wall: r.wall, mess: r.mess, k: k, cells: [] });
      r.rects.forEach(function (rc) {
        for (var y = rc[1]; y < rc[1] + rc[3]; y++) for (var x = rc[0]; x < rc[0] + rc[2]; x++) {
          var i = y * W + x; L.type[i] = 2; L.room[i] = k;
        }
      });
    });
    // walls hug every room
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var i = y * W + x;
      if (L.type[i] !== 0) continue;
      var best = 99, diag = 99;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var nx = x + dx, ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var j = ny * W + nx;
        if (L.type[j] === 2) {
          if (dx === 0 || dy === 0) best = Math.min(best, L.room[j]);
          else diag = Math.min(diag, L.room[j]);
        }
      }
      if (best < 99 || diag < 99) {
        L.type[i] = 1;
        L.wallColor[i] = L.rooms[best < 99 ? best : diag].wall;
      }
    }
    (def.doors || []).forEach(function (d) {
      var i = d[1] * W + d[0];
      if (L.type[i] !== 1) L.warnings.push('door not on wall ' + d);
      L.type[i] = 2; L.room[i] = idx[d[2]]; L.door[i] = 1; L.wallColor[i] = null;
    });
    (def.windows || []).forEach(function (wd) {
      for (var n = 0; n < wd[2]; n++) {
        var x = wd[0] + (wd[3] === 'h' ? n : 0), y = wd[1] + (wd[3] === 'v' ? n : 0);
        var i = y * W + x;
        if (L.type[i] === 1) L.window[i] = wd[3] === 'h' ? 1 : 2;
        else L.warnings.push('window not on wall ' + wd);
      }
    });
    if (def.frontDoor) {
      var fi = def.frontDoor[1] * W + def.frontDoor[0];
      if (L.type[fi] === 1) L.window[fi] = 3; else L.warnings.push('front door not on wall');
    }
    (def.furniture || []).forEach(function (f) {
      var o = Object.assign({ w: 1, h: 1 }, f);
      L.furniture.push(o);
      if (o.t === 'rug') return; // flat: Roxy drives over rugs
      for (var y = o.y; y < o.y + o.h; y++) for (var x = o.x; x < o.x + o.w; x++) {
        var i = y * W + x;
        if (L.type[i] !== 2) L.warnings.push('furniture off floor ' + o.t + ' ' + x + ',' + y);
        if (L.door[i]) L.warnings.push('furniture in door ' + o.t);
        L.blocked[i] = 1;
      }
    });
    for (var c = 0; c < N; c++) L.passable[c] = (L.type[c] === 2 && !L.blocked[c]) ? 1 : 0;
    L.dock = { x: def.dock[0], y: def.dock[1], dir: def.dock[2], cell: def.dock[1] * W + def.dock[0] };
    if (!L.passable[L.dock.cell]) L.warnings.push('dock not passable');
    // keep only what Roxy can reach from the dock
    var seen = new Uint8Array(N), q = [L.dock.cell]; seen[L.dock.cell] = 1;
    while (q.length) {
      var cc = q.pop(), cx = cc % W, cy = (cc / W) | 0;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = cx + d[0], ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
        var j = ny * W + nx;
        if (!seen[j] && L.passable[j]) { seen[j] = 1; q.push(j); }
      });
    }
    for (c = 0; c < N; c++) {
      if (L.passable[c] && !seen[c]) { L.passable[c] = 0; L.warnings.push('unreachable ' + (c % W) + ',' + ((c / W) | 0)); }
      if (L.passable[c]) L.rooms[L.room[c]].cells.push(c);
    }
    // a badge spot for each room: passable, non-door cell nearest the room's middle
    L.rooms.forEach(function (r) {
      var sx = 0, sy = 0, all = [];
      for (var i = 0; i < N; i++) if (L.room[i] === r.k && L.type[i] === 2 && !L.door[i]) { all.push(i); sx += i % W; sy += (i / W) | 0; }
      sx /= all.length; sy /= all.length;
      var best = -1, bd = 1e9;
      r.cells.forEach(function (i) {
        if (L.door[i]) return;
        var d = Math.pow(i % W - sx, 2) + Math.pow(((i / W) | 0) - sy, 2);
        if (d < bd) { bd = d; best = i; }
      });
      r.label = { x: best % W + 0.5, y: ((best / W) | 0) + 0.5 };
      r.center = { x: sx + 0.5, y: sy + 0.5 };
    });
    return L;
  };
})();
