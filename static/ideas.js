/* ============================================================
   pyMusicGPT – idea card deck
   A deck of prompt-idea cards. Each card type ("suit") has its own
   colours and looping CSS animation. Exposes window.IdeaDeck.
   ============================================================ */
(function () {
  "use strict";

  // ---------- card types (suits) ----------
  const TYPES = {
    chill:     { label: "Chill",       icon: "🌧" },
    energy:    { label: "Energy",      icon: "⚡" },
    retro:     { label: "Retro",       icon: "🌆" },
    cinematic: { label: "Cinematic",   icon: "🎬" },
    world:     { label: "World",       icon: "🌍" },
    jazz:      { label: "Jazz & Soul", icon: "🎷" },
  };

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

  // ---------- animated card art (static markup, no user input) ----------
  const rep = (html, n) => html.repeat(n);
  const ART = {
    chill:     `<div class="art-rain">${rep('<i class="drop"></i>', 9)}</div><span class="art-note">♪</span>`,
    energy:    `<div class="art-eq">${rep('<i class="bar"></i>', 9)}</div>`,
    retro:     `<div class="art-sun"></div><div class="art-grid"></div>`,
    cinematic: `<div class="art-rays"></div>${rep('<i class="spark"></i>', 6)}`,
    world:     `<div class="art-ripples">${rep('<i class="ripple"></i>', 3)}</div><div class="art-dot"></div>`,
    jazz:      `<div class="art-smoke">${rep('<i class="puff"></i>', 4)}</div>`,
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

  /** Build a (face-up) card element for an idea. */
  function makeCard(idea) {
    const type = TYPES[idea.type];
    const card = el("div", `idea-card type-${idea.type}`);
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", `${type.label} idea: ${idea.title}`);

    const inner = el("div", "card-inner");

    const front = el("div", "card-face card-front");
    const art = el("div", "card-art");
    art.innerHTML = ART[idea.type];
    art.setAttribute("aria-hidden", "true");
    const corner = el("span", "card-corner", type.icon);
    corner.setAttribute("aria-hidden", "true");
    art.appendChild(corner);

    const body = el("div", "card-body");
    body.append(
      el("div", "card-type", type.label.toUpperCase()),
      el("div", "card-title", idea.title),
      el("div", "card-prompt", idea.prompt),
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
      Object.entries(TYPES).forEach(([key, t]) => chip(key, `${t.icon} ${t.label}`));

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
      if (this.busy || (key !== "all" && !TYPES[key])) return;
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

  IdeaDeck.TYPES = TYPES;
  IdeaDeck.IDEAS = IDEAS;
  IdeaDeck.makeCard = makeCard;
  window.IdeaDeck = IdeaDeck;
})();
