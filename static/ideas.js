/* ============================================================
   pyMusicGPT – card decks
   - IdeaDeck: full-prompt idea cards in six animated genre types.
   - BuildTable: one pile per part (Style, Drums, Bass, Rhythm, Lead);
     the drawn hand is composed into a single MusicGen prompt.
   Each card type has its own colours and looping CSS animation.
   Exposes window.Cards, window.IdeaDeck and window.BuildTable.
   ============================================================ */
(function () {
  "use strict";

  // ---------- card types ----------
  const TYPES = {
    // genre types (Ideas deck + Style pile)
    chill:     { label: "Chill",       icon: "🌧" },
    energy:    { label: "Energy",      icon: "⚡" },
    retro:     { label: "Retro",       icon: "🌆" },
    cinematic: { label: "Cinematic",   icon: "🎬" },
    world:     { label: "World",       icon: "🌍" },
    jazz:      { label: "Jazz & Soul", icon: "🎷" },
    // part types (Build table)
    drums:     { label: "Drums",       icon: "🥁" },
    bass:      { label: "Bass",        icon: "🎸" },
    rhythm:    { label: "Rhythm",      icon: "🎹" },
    lead:      { label: "Lead",        icon: "🎺" },
    // typed / edited prompts
    custom:    { label: "Custom",      icon: "✍️" },
  };
  const GENRES = ["chill", "energy", "retro", "cinematic", "world", "jazz"];

  // ---------- ideas (prompts phrased the way MusicGen responds to) ----------
  const IDEAS = [
    { type: "chill", title: "Lo-fi study beat",
      prompt: "chill lo-fi hip hop beat with mellow Rhodes piano, soft vinyl crackle and laid-back drums, 75 BPM" },
    { type: "chill", title: "Ambient drift",
      prompt: "ambient drone with warm evolving synth pads and gentle shimmering textures, slow and spacious" },
    { type: "chill", title: "Rainy café",
      prompt: "relaxing acoustic guitar with soft brushed drums, cozy café atmosphere and light rain ambience, 85 BPM" },

    { type: "energy", title: "Drum & bass rush",
      prompt: "high-energy liquid drum and bass with rolling breakbeats, deep sub bass and bright synth stabs, 174 BPM" },
    { type: "energy", title: "Festival drop",
      prompt: "euphoric EDM festival track with big supersaw chords and a punchy four-on-the-floor kick, 128 BPM" },
    { type: "energy", title: "Garage punk",
      prompt: "fast garage punk rock with distorted guitars, driving bass and energetic live drums, 180 BPM" },

    { type: "retro", title: "Synthwave night drive",
      prompt: "80s synthwave with pulsing analog bass, gated reverb drums and dreamy neon synth leads, 100 BPM" },
    { type: "retro", title: "8-bit adventure",
      prompt: "upbeat chiptune video game melody with square wave leads and fast arpeggios, retro 8-bit style, 140 BPM" },
    { type: "retro", title: "City pop sunset",
      prompt: "80s Japanese city pop with funky slap bass, bright electric piano and smooth saxophone, 110 BPM" },

    { type: "cinematic", title: "Orchestral rise",
      prompt: "epic cinematic orchestral build with soaring strings, French horns and thunderous timpani" },
    { type: "cinematic", title: "Boss battle",
      prompt: "intense orchestral boss battle music with choir, staccato strings and pounding percussion, 150 BPM" },
    { type: "cinematic", title: "Fantasy village",
      prompt: "gentle fantasy score with harp, flute and warm strings, peaceful and magical" },

    { type: "world", title: "Afrobeat groove",
      prompt: "Afrobeat groove with interlocking guitars, punchy horn section and polyrhythmic percussion, 110 BPM" },
    { type: "world", title: "Flamenco fire",
      prompt: "passionate flamenco guitar with rhythmic hand claps and cajón, Spanish style" },
    { type: "world", title: "Koto & taiko",
      prompt: "traditional Japanese koto melody over powerful taiko drums and shakuhachi flute" },
    { type: "world", title: "Dub reggae",
      prompt: "roots dub reggae with a deep bassline, offbeat guitar skank and echoing delay effects, 75 BPM" },

    { type: "jazz", title: "Jazz piano trio",
      prompt: "smooth jazz piano trio with walking upright bass and brushed drums, late-night club, 120 BPM" },
    { type: "jazz", title: "Neo-soul Sunday",
      prompt: "neo-soul groove with warm Rhodes, silky bass and laid-back swung drums, 90 BPM" },
  ];

  // ---------- Build table: one pile per part ----------
  const SLOTS = [
    { key: "style",  label: "Style",  icon: "🎨" },
    { key: "drums",  label: "Drums",  icon: "🥁" },
    { key: "bass",   label: "Bass",   icon: "🎸" },
    { key: "rhythm", label: "Rhythm", icon: "🎹" },
    { key: "lead",   label: "Lead",   icon: "🎺" },
  ];

  // `phrase` is what goes into the composed prompt; Style cards also set the tempo.
  const PARTS = [
    { slot: "style", type: "chill",     title: "Lo-fi hip hop", phrase: "chill lo-fi hip hop", bpm: 75 },
    { slot: "style", type: "chill",     title: "Ambient",       phrase: "slow, spacious ambient music" },
    { slot: "style", type: "retro",     title: "80s synthwave", phrase: "80s synthwave", bpm: 100 },
    { slot: "style", type: "retro",     title: "Chiptune",      phrase: "upbeat chiptune", bpm: 140 },
    { slot: "style", type: "energy",    title: "Deep house",    phrase: "deep house", bpm: 122 },
    { slot: "style", type: "energy",    title: "Drum & bass",   phrase: "high-energy drum and bass", bpm: 174 },
    { slot: "style", type: "cinematic", title: "Cinematic",     phrase: "epic cinematic music" },
    { slot: "style", type: "world",     title: "Afrobeat",      phrase: "Afrobeat", bpm: 110 },
    { slot: "style", type: "jazz",      title: "Jazz club",     phrase: "late-night jazz club", bpm: 120 },
    { slot: "style", type: "jazz",      title: "Neo-soul",      phrase: "neo-soul", bpm: 90 },

    { slot: "drums", type: "drums", title: "Boom-bap",          phrase: "dusty boom-bap drums" },
    { slot: "drums", type: "drums", title: "Four-on-the-floor", phrase: "a punchy four-on-the-floor kick" },
    { slot: "drums", type: "drums", title: "Breakbeats",        phrase: "rolling breakbeats" },
    { slot: "drums", type: "drums", title: "Brushed jazz kit",  phrase: "soft brushed jazz drums" },
    { slot: "drums", type: "drums", title: "Trap 808s",         phrase: "trap hi-hats and booming 808 kicks" },
    { slot: "drums", type: "drums", title: "Gated reverb",      phrase: "big gated reverb drums" },
    { slot: "drums", type: "drums", title: "Taiko & hand drums", phrase: "powerful taiko and hand percussion" },

    { slot: "bass", type: "bass", title: "Deep sub",        phrase: "a deep sub bass" },
    { slot: "bass", type: "bass", title: "Slap bass",       phrase: "funky slap bass" },
    { slot: "bass", type: "bass", title: "Walking upright", phrase: "a walking upright bass" },
    { slot: "bass", type: "bass", title: "Acid 303",        phrase: "a squelchy acid 303 bassline" },
    { slot: "bass", type: "bass", title: "Analog pulse",    phrase: "a pulsing analog synth bass" },
    { slot: "bass", type: "bass", title: "Dub bass",        phrase: "a heavy dub bassline" },

    { slot: "rhythm", type: "rhythm", title: "Rhodes chords",   phrase: "mellow Rhodes chords" },
    { slot: "rhythm", type: "rhythm", title: "Acoustic strum",  phrase: "strummed acoustic guitar" },
    { slot: "rhythm", type: "rhythm", title: "Reggae skank",    phrase: "an offbeat reggae guitar skank" },
    { slot: "rhythm", type: "rhythm", title: "Lush pads",       phrase: "lush warm synth pads" },
    { slot: "rhythm", type: "rhythm", title: "String ostinato", phrase: "a driving staccato string ostinato" },
    { slot: "rhythm", type: "rhythm", title: "Funky chops",     phrase: "funky clean guitar chops" },
    { slot: "rhythm", type: "rhythm", title: "Synth arps",      phrase: "shimmering synth arpeggios" },

    { slot: "lead", type: "lead", title: "Saxophone",       phrase: "a smooth saxophone melody" },
    { slot: "lead", type: "lead", title: "Saw lead",        phrase: "a soaring saw synth lead" },
    { slot: "lead", type: "lead", title: "Piano melody",    phrase: "a gentle piano melody" },
    { slot: "lead", type: "lead", title: "Airy flute",      phrase: "an airy flute melody" },
    { slot: "lead", type: "lead", title: "Chiptune lead",   phrase: "a bright square-wave chiptune lead" },
    { slot: "lead", type: "lead", title: "Guitar solo",     phrase: "an expressive electric guitar solo" },
    { slot: "lead", type: "lead", title: "Wordless vocals", phrase: "dreamy wordless vocal chops" },
  ];

  function listJoin(items) {
    if (items.length <= 1) return items.join("");
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }

  /** Compose one MusicGen prompt from a hand {style, drums, bass, rhythm, lead}. */
  function composePrompt(hand) {
    const style = hand.style;
    const parts = ["drums", "bass", "rhythm", "lead"].map(k => hand[k] && hand[k].phrase).filter(Boolean);
    if (!style && !parts.length) return "";
    let prompt = style ? style.phrase : "an instrumental track";
    if (parts.length) prompt += ` with ${listJoin(parts)}`;
    if (style && style.bpm) prompt += `, ${style.bpm} BPM`;
    return prompt;
  }

  // ---------- animated card art (static markup, no user input) ----------
  const rep = (html, n) => html.repeat(n);
  const ART = {
    chill:     `<div class="art-rain">${rep('<i class="drop"></i>', 9)}</div><span class="art-note">♪</span>`,
    energy:    `<div class="art-eq">${rep('<i class="bar"></i>', 9)}</div>`,
    retro:     `<div class="art-sun"></div><div class="art-grid"></div>`,
    cinematic: `<div class="art-rays"></div>${rep('<i class="spark"></i>', 6)}`,
    world:     `<div class="art-ripples">${rep('<i class="ripple"></i>', 3)}</div><div class="art-dot"></div>`,
    jazz:      `<div class="art-smoke">${rep('<i class="puff"></i>', 4)}</div>`,
    drums:     `<i class="art-kick-ring"></i><i class="art-kick"></i><div class="art-hats">${rep('<i class="hat"></i>', 4)}</div>`,
    bass:      `${rep(`<svg class="art-wave bass-wave" viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0 30 Q25 -5 50 30 T100 30 T150 30 T200 30"/></svg>`, 2)}`,
    rhythm:    `<div class="art-chords">${rep('<i class="chord"><b></b><b></b><b></b></i>', 4)}</div>`,
    lead:      `<svg class="art-melody" viewBox="0 0 120 60" preserveAspectRatio="none"><polyline points="10,44 28,30 46,36 64,18 82,26 100,12 112,20"/></svg>${rep('<i class="mdot"></i>', 7)}`,
    custom:    `${rep(`<svg class="art-wave custom-wave" viewBox="0 0 200 60" preserveAspectRatio="none"><path d="M0 30 Q12.5 10 25 30 T50 30 T75 30 T100 30 T125 30 T150 30 T175 30 T200 30"/></svg>`, 2)}`,
  };

  // ---------- helpers ----------
  const reduceMotion = () =>
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function animate(el, keyframes, options) {
    if (!el || typeof el.animate !== "function") return Promise.resolve();
    const opts = { fill: "none", ...options };
    if (reduceMotion()) { opts.duration = 0; opts.delay = 0; }
    const finished = el.animate(keyframes, opts).finished.catch(() => {});
    // Safety net: never let a stalled animation (background tab, throttled
    // timeline, detached element) leave the deck stuck in a busy state.
    const budget = (opts.duration || 0) + (opts.delay || 0) + 150;
    const timeout = new Promise(resolve => setTimeout(resolve, budget));
    return Promise.race([finished, timeout]);
  }

  function shuffled(items) {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  /** Animated art panel for a card type (static markup only). */
  function artElement(typeKey) {
    const key = TYPES[typeKey] ? typeKey : "custom";
    const art = el("div", "card-art");
    art.innerHTML = ART[key];
    art.setAttribute("aria-hidden", "true");
    art.appendChild(el("span", "card-corner", TYPES[key].icon));
    return art;
  }

  /** Build a (face-up) card element for an idea or a part card. */
  function makeCard(idea, { mini = false } = {}) {
    const type = TYPES[idea.type];
    const card = el("div", `idea-card type-${idea.type}${mini ? " mini" : ""}`);
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `${type.label} card: ${idea.title}`);

    const inner = el("div", "card-inner");

    const front = el("div", "card-face card-front");
    const art = artElement(idea.type);

    const body = el("div", "card-body");
    body.append(
      el("div", "card-type", type.label.toUpperCase()),
      el("div", "card-title", idea.title),
      el("div", "card-prompt", idea.prompt || idea.phrase),
    );
    front.append(art, body);

    const back = el("div", "card-face card-back");
    inner.append(front, back);
    card.appendChild(inner);
    return card;
  }

  // ---------- the deck ----------
  class IdeaDeck {
    /**
     * @param {object} opts
     * @param {(idea) => void} opts.onUse         called when a card is used
     * @param {() => Element}  opts.getUseTarget  element the used card flies into
     */
    constructor({ onUse, getUseTarget } = {}) {
      this.onUse = onUse;
      this.getUseTarget = getUseTarget;
      this.filter = "all";
      this.pile = [];
      this.current = null;
      this.busy = false;
      this.el = this._build();
      this._refill();
      this._sync();
    }

    // ----- DOM -----
    _build() {
      const root = el("section", "deck");
      root.setAttribute("aria-label", "Idea deck");

      const head = el("div", "deck-head");
      head.append(
        el("div", "deck-title", "💡 Draw an idea"),
        el("div", "deck-sub", "Pick a card, tweak the prompt, then hit Generate."),
      );

      const stage = el("div", "deck-stage");

      this.pileEl = el("button", "deck-pile");
      this.pileEl.type = "button";
      this.pileEl.setAttribute("aria-label", "Draw a card");
      this.pileCards = [0, 1, 2, 3].map(i => {
        const c = el("div", "pile-card");
        c.style.setProperty("--i", i);
        return c;
      });
      this.countEl = el("span", "deck-count");
      this.pileEl.append(...this.pileCards, this.countEl);
      this.pileEl.addEventListener("click", () => this.draw());

      this.slotEl = el("div", "deck-slot");
      this.hintEl = el("div", "slot-hint", "Click the deck\nto draw a card");
      this.slotEl.appendChild(this.hintEl);

      stage.append(this.pileEl, this.slotEl);

      const actions = el("div", "deck-actions");
      const btn = (label, cls, handler, title) => {
        const b = el("button", `deck-btn ${cls || ""}`.trim(), label);
        b.type = "button";
        if (title) b.title = title;
        b.addEventListener("click", handler);
        actions.appendChild(b);
        return b;
      };
      btn("🔀 Shuffle", "", () => this.shuffle(), "Shuffle the deck");
      btn("🎲 Surprise", "", () => this.surprise(), "Shuffle and draw a random card");
      this.skipBtn = btn("⏭ Skip", "", () => this.draw(), "Skip this card and draw the next");
      this.useBtn = btn("✓ Use this", "primary", () => this.use(), "Put this prompt in the input box");

      const filters = el("div", "deck-filters");
      filters.setAttribute("role", "radiogroup");
      filters.setAttribute("aria-label", "Card type");
      this.chips = {};
      const chip = (key, label) => {
        const c = el("button", `deck-chip ${key === "all" ? "" : "type-" + key}`.trim(), label);
        c.type = "button";
        c.setAttribute("role", "radio");
        c.addEventListener("click", () => this.setFilter(key));
        filters.appendChild(c);
        this.chips[key] = c;
      };
      chip("all", "All");
      GENRES.forEach(key => chip(key, `${TYPES[key].icon} ${TYPES[key].label}`));

      this.liveEl = el("div", "sr-only");
      this.liveEl.setAttribute("aria-live", "polite");

      root.append(head, stage, actions, filters, this.liveEl);
      return root;
    }

    _sync() {
      const n = this.pile.length;
      this.countEl.textContent = String(n);
      this.pileCards.forEach((c, i) => { c.hidden = i >= Math.max(1, Math.min(4, n)); });
      this.skipBtn.disabled = !this.current;
      this.useBtn.disabled = !this.current;
      Object.entries(this.chips).forEach(([key, c]) =>
        c.setAttribute("aria-checked", String(key === this.filter)));
    }

    /** Refill the pile for the active filter, leaving out `exclude` (the card
     *  just shown) so a reshuffle never deals the same card twice in a row. */
    _refill(exclude = this.current) {
      const pool = IDEAS.filter(i => this.filter === "all" || i.type === this.filter);
      const rest = pool.filter(i => i !== exclude);
      this.pile = shuffled(rest.length ? rest : pool);
    }

    async _guard(fn) {
      if (this.busy) return;
      this.busy = true;
      try { await fn(); } finally { this.busy = false; this._sync(); }
    }

    // ----- animations -----
    _riffle() {
      return Promise.all(this.pileCards.map((c, i) => {
        const dir = i % 2 ? 1 : -1;
        return animate(c, [
          { transform: "translate(0, 0) rotate(0deg)" },
          { transform: `translate(${dir * 64}px, -6px) rotate(${dir * 10}deg)`, offset: 0.4 },
          { transform: `translate(${dir * -10}px, 0) rotate(${dir * -3}deg)`, offset: 0.75 },
          { transform: "translate(0, 0) rotate(0deg)" },
        ], { duration: 560, delay: i * 45, easing: "ease-in-out" });
      }));
    }

    async _discard() {
      const card = this.slotEl.querySelector(".idea-card");
      this.current = null;
      if (!card) return;
      await animate(card, [
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        { transform: "translate(150%, -30px) rotate(22deg)", opacity: 0 },
      ], { duration: 320, easing: "ease-in" });
      card.remove();
    }

    async _draw(previous = this.current) {
      await this._discard();
      if (!this.pile.length) {
        this._refill(previous);
        await this._riffle();
      }
      const idea = this.pile.pop();
      this.current = idea;

      const card = makeCard(idea);
      card.addEventListener("dblclick", () => this.use());
      this.hintEl.hidden = true;
      this.slotEl.appendChild(card);
      this._sync();

      const from = this.pileEl.getBoundingClientRect();
      const to = card.getBoundingClientRect();
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      const inner = card.querySelector(".card-inner");
      await Promise.all([
        animate(card, [
          { transform: `translate(${dx}px, ${dy}px) rotate(-4deg)` },
          { transform: `translate(${dx / 2}px, ${dy / 2 - 24}px) rotate(2deg)`, offset: 0.5 },
          { transform: "translate(0, 0) rotate(0deg)" },
        ], { duration: 620, easing: "cubic-bezier(.2,.8,.2,1)" }),
        animate(inner, [
          { transform: "rotateY(180deg)" },
          { transform: "rotateY(180deg)", offset: 0.25 },
          { transform: "rotateY(0deg)" },
        ], { duration: 620, easing: "ease-in-out" }),
      ]);
      this.liveEl.textContent = `Drew ${idea.title} (${TYPES[idea.type].label}): ${idea.prompt}`;
    }

    // ----- public actions -----
    draw()    { return this._guard(() => this._draw()); }

    shuffle() {
      return this._guard(async () => {
        this._refill();
        this._sync();
        await this._riffle();
        this.liveEl.textContent = "Deck shuffled";
      });
    }

    surprise() {
      return this._guard(async () => {
        const previous = this.current;
        await this._discard();
        this._refill(previous);
        this._sync();
        await this._riffle();
        await this._draw();
      });
    }

    setFilter(key) {
      if (this.busy || (key !== "all" && !GENRES.includes(key))) return;
      this.filter = key;
      return this._guard(async () => {
        const previous = this.current;
        await this._discard();
        this._refill(previous);
        this._sync();
        await this._riffle();
        await this._draw();
      });
    }

    use() {
      return this._guard(async () => {
        const card = this.slotEl.querySelector(".idea-card");
        const idea = this.current;
        if (!card || !idea) return;

        // Fly a fixed-position clone into the target so it is not clipped by scroll areas.
        const target = this.getUseTarget && this.getUseTarget();
        const rect = card.getBoundingClientRect();
        const clone = card.cloneNode(true);
        Object.assign(clone.style, {
          position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`,
          width: `${rect.width}px`, height: `${rect.height}px`,
          margin: "0", zIndex: "1000", pointerEvents: "none",
        });
        document.body.appendChild(clone);
        card.remove();
        this.current = null;
        this.hintEl.hidden = false;
        this.hintEl.textContent = "Nice pick!\nDraw another card";

        if (target) {
          const t = target.getBoundingClientRect();
          const dx = t.left + t.width / 2 - (rect.left + rect.width / 2);
          const dy = t.top + t.height / 2 - (rect.top + rect.height / 2);
          await animate(clone, [
            { transform: "translate(0, 0) scale(1) rotate(0deg)", opacity: 1 },
            { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 30}px) scale(.8) rotate(-6deg)`, opacity: 1, offset: 0.4 },
            { transform: `translate(${dx}px, ${dy}px) scale(.18) rotate(4deg)`, opacity: 0 },
          ], { duration: 560, easing: "ease-in" });
        }
        clone.remove();
        if (this.onUse) this.onUse(idea);
        this.liveEl.textContent = `Using ${idea.title}`;
      });
    }
  }

  // ---------- the Build table ----------
  const sleep = ms => new Promise(r => setTimeout(r, reduceMotion() ? 0 : ms));

  class BuildTable {
    /**
     * @param {object} opts
     * @param {({prompt, meta}) => void} opts.onUse  called with the composed prompt
     */
    constructor({ onUse } = {}) {
      this.onUse = onUse;
      this.slots = {};
      this.el = this._build();
      SLOTS.forEach(s => this._refill(s.key));
      this._sync();
    }

    // ----- DOM -----
    _build() {
      const root = el("section", "build");
      root.setAttribute("aria-label", "Track builder");
      root.appendChild(el("div", "deck-sub",
        "Draw one card per part \u2014 your hand becomes the prompt. Click a card to redraw it."));

      const row = el("div", "build-slots");
      SLOTS.forEach(slot => {
        const col = el("div", `build-slot slot-${slot.key}`);
        const label = el("div", "build-label", `${slot.icon} ${slot.label}`);

        const stage = el("div", "build-stage");
        const pile = el("button", "build-pile");
        pile.type = "button";
        pile.setAttribute("aria-label", `Draw a ${slot.label} card`);
        [0, 1, 2].forEach(i => {
          const c = el("div", "pile-card");
          c.style.setProperty("--i", i);
          pile.appendChild(c);
        });
        pile.addEventListener("click", () => this.draw(slot.key));
        stage.appendChild(pile);

        const controls = el("div", "build-controls");
        const mk = (text, title, handler) => {
          const b = el("button", "build-ctl", text);
          b.type = "button";
          b.title = title;
          b.setAttribute("aria-label", `${title} (${slot.label})`);
          b.addEventListener("click", handler);
          controls.appendChild(b);
          return b;
        };
        const drawBtn = mk("\u21bb", "Draw another card", () => this.draw(slot.key));
        const lockBtn = mk("\ud83d\udd12", "Lock this card", () => this.toggleLock(slot.key));
        const clearBtn = mk("\u2715", "Leave this part empty", () => this.clear(slot.key));

        col.append(label, stage, controls);
        row.appendChild(col);
        this.slots[slot.key] = {
          ...slot, card: null, locked: false, busy: false, pile: [],
          col, stage, pileEl: pile, drawBtn, lockBtn, clearBtn,
        };
      });

      this.previewEl = el("div", "build-preview");
      this.previewEl.setAttribute("aria-live", "polite");

      const actions = el("div", "deck-actions");
      const btn = (label, cls, handler, title) => {
        const b = el("button", `deck-btn ${cls || ""}`.trim(), label);
        b.type = "button";
        if (title) b.title = title;
        b.addEventListener("click", handler);
        actions.appendChild(b);
        return b;
      };
      btn("\ud83c\udfb2 Deal all", "", () => this.dealAll(), "Draw a card for every unlocked part");
      this.clearAllBtn = btn("\ud83e\uddf9 Clear", "", () => this.clearAll(), "Clear every unlocked part");
      this.useBtn = btn("\u2713 Use hand", "primary", () => this.use(), "Put the composed prompt in the input box");

      root.append(row, this.previewEl, actions);
      return root;
    }

    hand() {
      const h = {};
      SLOTS.forEach(s => { h[s.key] = this.slots[s.key].card; });
      return h;
    }

    prompt() { return composePrompt(this.hand()); }

    /** Metadata stored with a generated track so it can be shown as a played card. */
    meta() {
      const h = this.hand();
      const parts = {};
      ["drums", "bass", "rhythm", "lead"].forEach(k => { if (h[k]) parts[k] = h[k].title; });
      return {
        kind: "build",
        type: h.style ? h.style.type : "custom",
        title: h.style ? `${h.style.title} build` : "Custom build",
        parts,
      };
    }

    _sync() {
      const prompt = this.prompt();
      this.previewEl.textContent = prompt || "Draw some cards to build a prompt\u2026";
      this.previewEl.classList.toggle("is-empty", !prompt);
      this.useBtn.disabled = !prompt;
      const anyClearable = Object.values(this.slots).some(s => s.card && !s.locked);
      this.clearAllBtn.disabled = !anyClearable;
      Object.values(this.slots).forEach(s => {
        s.lockBtn.disabled = !s.card;
        s.lockBtn.setAttribute("aria-pressed", String(s.locked));
        s.lockBtn.textContent = s.locked ? "\ud83d\udd12" : "\ud83d\udd13";
        s.clearBtn.disabled = !s.card || s.locked;
        s.drawBtn.disabled = s.locked;
        s.col.classList.toggle("is-locked", s.locked);
        s.col.classList.toggle("has-card", !!s.card);
      });
    }

    _refill(key, exclude = this.slots[key] && this.slots[key].card) {
      const pool = PARTS.filter(p => p.slot === key);
      const rest = pool.filter(p => p !== exclude);
      this.slots[key].pile = shuffled(rest.length ? rest : pool);
    }

    async _removeCard(slot, direction = -1) {
      const card = slot.stage.querySelector(".idea-card");
      slot.card = null;
      if (!card) return;
      await animate(card, [
        { transform: "translateY(0) rotate(0deg)", opacity: 1 },
        { transform: `translateY(${direction * 40}px) rotate(${direction * -8}deg)`, opacity: 0 },
      ], { duration: 220, easing: "ease-in" });
      card.remove();
    }

    async _drawSlot(key, delay = 0) {
      const slot = this.slots[key];
      if (slot.locked || slot.busy) return;
      slot.busy = true;
      try {
        if (delay) await sleep(delay);
        const previous = slot.card;
        await this._removeCard(slot);
        if (!slot.pile.length) this._refill(key, previous);
        const item = slot.pile.pop();
        slot.card = item;

        const card = makeCard(item, { mini: true });
        card.title = "Click to redraw";
        card.addEventListener("click", () => this.draw(key));
        slot.stage.appendChild(card);
        this._sync();

        const inner = card.querySelector(".card-inner");
        await Promise.all([
          animate(card, [
            { transform: "translateY(4px) rotate(-3deg)" },
            { transform: "translateY(-22px) rotate(2deg)", offset: 0.45 },
            { transform: "translateY(0) rotate(0deg)" },
          ], { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }),
          animate(inner, [
            { transform: "rotateY(180deg)" },
            { transform: "rotateY(180deg)", offset: 0.2 },
            { transform: "rotateY(0deg)" },
          ], { duration: 520, easing: "ease-in-out" }),
        ]);
      } finally {
        slot.busy = false;
        this._sync();
      }
    }

    // ----- public actions -----
    draw(key) { return this._drawSlot(key); }

    dealAll() {
      return Promise.all(SLOTS.map((s, i) => this._drawSlot(s.key, i * 110)));
    }

    async clear(key) {
      const slot = this.slots[key];
      if (slot.locked || slot.busy || !slot.card) return;
      slot.busy = true;
      try { await this._removeCard(slot, 1); } finally { slot.busy = false; this._sync(); }
    }

    clearAll() { return Promise.all(SLOTS.map(s => this.clear(s.key))); }

    toggleLock(key) {
      const slot = this.slots[key];
      if (!slot.card) return;
      slot.locked = !slot.locked;
      this._sync();
    }

    use() {
      const prompt = this.prompt();
      if (!prompt) return;
      animate(this.previewEl, [
        { transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" },
      ], { duration: 260 });
      if (this.onUse) this.onUse({ prompt, meta: this.meta() });
    }
  }

  // ---------- exports ----------
  IdeaDeck.TYPES = TYPES;
  IdeaDeck.IDEAS = IDEAS;
  IdeaDeck.makeCard = makeCard;
  window.Cards = { TYPES, GENRES, IDEAS, SLOTS, PARTS, composePrompt, artElement, makeCard };
  window.IdeaDeck = IdeaDeck;
  window.BuildTable = BuildTable;
})();
