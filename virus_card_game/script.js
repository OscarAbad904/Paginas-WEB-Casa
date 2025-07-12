// Motor de juego Virus! con renderizado clásico de imágenes
const ORGANS = ['heart', 'brain', 'bone', 'stomach'];
const ORGAN_STATES = { EMPTY: 0, HEALTHY: 1, INFECTED: 2, HALF_VACC: 3, IMMUNE: 4 };
const PLAYERS = { ME: 'me', BOT: 'bot' };

// DOM
const playerBoardEl = document.getElementById('player-board');
const botBoardEl = document.getElementById('bot-board');
const playerHandEl = document.getElementById('player-hand');
const deckPileEl = document.getElementById('deck-pile');
const discardPileEl = document.getElementById('discard-pile');
const deckCountEl = document.getElementById('deck-count');
const discardCountEl = document.getElementById('discard-count');
const playerMsgEl = document.getElementById('player-msg');
const botMsgEl = document.getElementById('bot-msg');
const resetBtn = document.getElementById('btn-reset');
const helpBtn = document.getElementById('btn-help');
const discardBtn = document.getElementById('btn-discard-action');
const helpModal = document.getElementById('help-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const cardTemplate = document.getElementById('card-template');
const organSlotTemplate = document.getElementById('organ-slot-template');

let state = {};

function createEmptyBody() {
    return { heart: ORGAN_STATES.EMPTY, brain: ORGAN_STATES.EMPTY, bone: ORGAN_STATES.EMPTY, stomach: ORGAN_STATES.EMPTY };
}

function buildDeck() {
    const deck = [];
    ORGANS.forEach(c => {
        for (let i = 0; i < 4; i++) deck.push({ type: 'organ', organ: c });
        for (let i = 0; i < 2; i++) deck.push({ type: 'virus', organ: c });
        for (let i = 0; i < 2; i++) deck.push({ type: 'cure', organ: c });
    });
    for (let i = 0; i < 2; i++) {
        deck.push({ type: 'organ', organ: 'multi' });
        deck.push({ type: 'virus', organ: 'multi' });
        deck.push({ type: 'cure', organ: 'multi' });
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

function createInitialState() {
    return {
        deck: buildDeck(),
        discard: [],
        players: {
            me: { hand: [], organs: createEmptyBody() },
            bot: { hand: [], organs: createEmptyBody() }
        },
        turn: PLAYERS.ME,
        ended: false,
        isDiscarding: false,
        selectedCard: null
    };
}

function renderHand() {
    playerHandEl.innerHTML = '';
    state.players.me.hand.forEach(card => {
        const cardEl = cardTemplate.content.cloneNode(true).firstElementChild;
        const base = cardEl.querySelector('.base');
        const overlay = cardEl.querySelector('.overlay');
        if (card.type === 'organ') {
            base.src = card.organ === 'multi' ? 'images/heart.png' : `images/${card.organ}.png`;
            overlay.remove();
        } else if (card.type === 'virus') {
            base.src = card.organ === 'multi' ? 'images/heart.png' : `images/${card.organ}.png`;
            overlay.src = 'images/virus_overlay.png';
            overlay.alt = 'superposición de virus';
            overlay.style.opacity = '1';
        } else if (card.type === 'cure') {
            base.src = card.organ === 'multi' ? 'images/heart.png' : `images/${card.organ}.png`;
            overlay.src = 'images/vaccine_overlay.png';
            overlay.alt = 'superposición de vacuna';
            overlay.style.opacity = '0.8';
        } else {
            base.remove();
            overlay.remove();
        }
        cardEl.__card__ = card;
        cardEl.addEventListener('click', () => handleCardClick(card, cardEl));
        playerHandEl.appendChild(cardEl);
    });
}

function renderBoard(playerId) {
    const player = state.players[playerId];
    const boardEl = playerId === PLAYERS.ME ? playerBoardEl : botBoardEl;
    boardEl.innerHTML = '';
    ORGANS.forEach(organName => {
        const organState = player.organs[organName];
        const slot = organSlotTemplate.content.cloneNode(true).firstElementChild;
        const base = slot.querySelector('.base');
        const overlay = slot.querySelector('.overlay');
        slot.dataset.owner = playerId;
        slot.dataset.organ = organName;
        switch (organState) {
            case ORGAN_STATES.EMPTY:
                base.remove(); overlay.remove(); break;
            case ORGAN_STATES.HEALTHY:
                base.src = `images/${organName}.png`; overlay.remove(); break;
            case ORGAN_STATES.INFECTED:
                base.src = `images/${organName}.png`;
                overlay.src = 'images/virus_overlay.png';
                overlay.alt = 'superposición de virus';
                overlay.style.opacity = '1';
                break;
            case ORGAN_STATES.HALF_VACC:
                base.src = `images/${organName}.png`;
                overlay.src = 'images/vaccine_overlay.png';
                overlay.alt = 'superposición de vacuna';
                overlay.style.opacity = '0.6';
                break;
            case ORGAN_STATES.IMMUNE:
                base.src = `images/${organName}.png`;
                overlay.src = 'images/vaccine_overlay.png';
                overlay.alt = 'superposición de vacuna';
                overlay.style.opacity = '1';
                break;
        }
        boardEl.appendChild(slot);
    });
}

function renderPiles() {
    deckCountEl.textContent = state.deck.length;
    discardCountEl.textContent = state.discard.length;
    discardPileEl.innerHTML = '';
    if (state.discard.length > 0) {
        const topCard = state.discard[state.discard.length - 1];
        const cardEl = cardTemplate.content.cloneNode(true).firstElementChild;
        const base = cardEl.querySelector('.base');
        const overlay = cardEl.querySelector('.overlay');
        if (topCard.type === 'organ') {
            base.src = topCard.organ === 'multi' ? 'images/heart.png' : `images/${topCard.organ}.png`;
            overlay.remove();
        } else if (topCard.type === 'virus') {
            base.src = topCard.organ === 'multi' ? 'images/heart.png' : `images/${topCard.organ}.png`;
            overlay.src = 'images/virus_overlay.png';
            overlay.alt = 'superposición de virus';
            overlay.style.opacity = '1';
        } else if (topCard.type === 'cure') {
            base.src = topCard.organ === 'multi' ? 'images/heart.png' : `images/${topCard.organ}.png`;
            overlay.src = 'images/vaccine_overlay.png';
            overlay.alt = 'superposición de vacuna';
            overlay.style.opacity = '0.8';
        } else {
            base.remove();
            overlay.remove();
        }
        discardPileEl.appendChild(cardEl);
    }
}

function updateMessages() {
    if (state.ended) return;
    if (state.turn === PLAYERS.ME) {
        if (state.isDiscarding) {
            playerMsgEl.textContent = "Selecciona cartas para descartar y confirma.";
        } else {
            playerMsgEl.textContent = "Tu turno: juega o descarta.";
        }
        botMsgEl.textContent = "Esperando...";
    } else {
        playerMsgEl.textContent = "Turno del oponente...";
        botMsgEl.textContent = "Pensando...";
    }
}

function updateControls() {
    const isMyTurn = state.turn === PLAYERS.ME && !state.ended;
    discardBtn.disabled = !isMyTurn;
    if (state.isDiscarding) {
        discardBtn.textContent = 'Confirmar Descarte';
        discardBtn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600');
        discardBtn.classList.add('bg-green-500', 'hover:bg-green-600');
    } else {
        discardBtn.textContent = 'Descartar';
        discardBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
        discardBtn.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
    }
}

function renderAll() {
    renderBoard(PLAYERS.ME);
    renderBoard(PLAYERS.BOT);
    renderHand();
    renderPiles();
    updateMessages();
    updateControls();
}

function startGame() {
    state = createInitialState();
    for (let i = 0; i < 3; i++) {
        drawCard(PLAYERS.ME);
        drawCard(PLAYERS.BOT);
    }
    renderAll();
}

function drawCard(playerId, count = 1) {
    for (let i = 0; i < count; i++) {
        if (state.deck.length === 0) return;
        const card = state.deck.pop();
        if (card) state.players[playerId].hand.push(card);
    }
}

function endTurn() {
    if (state.ended) return;
    const currentPlayerId = state.turn;
    const handSize = state.players[currentPlayerId].hand.length;
    if (handSize < 3) {
        drawCard(currentPlayerId, 3 - handSize);
    }
    state.turn = (state.turn === PLAYERS.ME) ? PLAYERS.BOT : PLAYERS.ME;
    clearSelection();
    renderAll();
    if (state.turn === PLAYERS.BOT) {
        setTimeout(botTurn, 1200);
    }
}

function handleCardClick(card, cardEl) {
    if (state.turn !== PLAYERS.ME || state.ended) return;
    if (state.isDiscarding) {
        cardEl.classList.toggle('selected');
        return;
    }
    if (state.selectedCard && state.selectedCard.card === card) {
        clearSelection();
    } else {
        clearSelection();
        state.selectedCard = { card, element: cardEl };
        cardEl.classList.add('selected');
    }
}

function toggleDiscardMode() {
    if (state.turn !== PLAYERS.ME || state.ended) return;
    state.isDiscarding = !state.isDiscarding;
    clearSelection();
    if (!state.isDiscarding) {
        const cardsToDiscard = [];
        document.querySelectorAll('#player-hand .card.selected').forEach(el => {
            const card = el.__card__;
            cardsToDiscard.push(card);
            el.classList.remove('selected');
        });
        if (cardsToDiscard.length > 0) {
            state.players.me.hand = state.players.me.hand.filter(c => !cardsToDiscard.includes(c));
            state.discard.push(...cardsToDiscard);
            endTurn();
        } else {
            renderAll();
        }
    } else {
        updateControls();
        updateMessages();
    }
}

function clearSelection() {
    if (state.selectedCard) {
        state.selectedCard.element.classList.remove('selected');
    }
    state.selectedCard = null;
}

function botTurn() {
    // Lógica simplificada: el bot descarta la primera carta si no puede jugar
    const bot = state.players.bot;
    if (bot.hand.length > 0) {
        state.discard.push(bot.hand.shift());
    }
    endTurn();
}

resetBtn.addEventListener('click', startGame);
deckPileEl.addEventListener('click', () => {
    if (state.turn === PLAYERS.ME && !state.ended) {
        drawCard(PLAYERS.ME);
        renderAll();
    }
});
discardBtn.addEventListener('click', toggleDiscardMode);
helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
});

startGame();
// Nuevo motor de juego para la versión mejorada
// IDs y lógica adaptados a la nueva estructura de index_actualizado.html

// --- CONSTANTES Y DEFINICIONES ---
const ORGANS = { HEART: 'heart', BRAIN: 'brain', BONE: 'bone', STOMACH: 'stomach' };
const CARD_TYPES = { ORGAN: 'organ', VIRUS: 'virus', MEDICINE: 'medicine', TREATMENT: 'treatment' };
const TREATMENT_TYPES = { THIEF: 'thief', TRANSPLANT: 'transplant' };
const ORGAN_STATES = { EMPTY: 0, HEALTHY: 1, INFECTED: 10, VACCINATED: 2, IMMUNE: 3 };
const PLAYERS = { ME: 'me', BOT: 'bot' };

// --- DOM ELEMENTS ---
const getEl = (id) => document.getElementById(id);
const playerBoardEl = getEl('player-board');
const botBoardEl = getEl('bot-board');
const playerHandEl = getEl('player-hand');
const deckPileEl = getEl('deck-pile');
const discardPileEl = getEl('discard-pile');
const deckCountEl = getEl('deck-count');
const discardCountEl = getEl('discard-count');
const playerMsgEl = getEl('player-msg');
const botMsgEl = getEl('bot-msg');
const resetBtn = getEl('btn-reset');
const helpBtn = getEl('btn-help');
const discardBtn = getEl('btn-discard-action');
const helpModal = getEl('help-modal');
const closeModalBtn = getEl('close-modal-btn');
const cardTemplate = getEl('card-template');
const organSlotTemplate = getEl('organ-slot-template');

// --- GAME STATE ---
let state = {};

function createInitialState() {
    return {
        deck: buildDeck(),
        discardPile: [],
        players: {
            me: { id: PLAYERS.ME, hand: [], organs: createEmptyBody() },
            bot: { id: PLAYERS.BOT, hand: [], organs: createEmptyBody() }
        },
        turn: PLAYERS.ME,
        selectedCard: null,
        isDiscarding: false,
        gameOver: false,
        turnPhase: 'play'
    };
}

function createEmptyBody() {
    return { heart: ORGAN_STATES.EMPTY, brain: ORGAN_STATES.EMPTY, bone: ORGAN_STATES.EMPTY, stomach: ORGAN_STATES.EMPTY };
function buildDeck() {
    const deck = [];
    const organTypes = Object.values(ORGANS);
    return deck;
}

function renderAll() {
    renderBoard(PLAYERS.ME);
    renderBoard(PLAYERS.BOT);
    renderHand();
    renderPiles();
    updateMessages();
    updateControls();
}

function renderBoard(playerId) {
    const player = state.players[playerId];
    const boardEl = playerId === PLAYERS.ME ? playerBoardEl : botBoardEl;
    boardEl.innerHTML = '';
    Object.entries(player.organs).forEach(([organName, organState]) => {
    });
}

function renderHand() {
    playerHandEl.innerHTML = '';
    state.players.me.hand.forEach(card => {
        const cardEl = cardTemplate.content.cloneNode(true).firstElementChild;
        playerHandEl.appendChild(cardEl);
    });
}

function renderPiles() {
    deckCountEl.textContent = state.deck.length;
    discardCountEl.textContent = state.discardPile.length;
    discardPileEl.innerHTML = '';
    if (state.discardPile.length > 0) {
        const topCard = state.discardPile[state.discardPile.length - 1];
        const cardEl = cardTemplate.content.cloneNode(true).firstElementChild;
    }
}

function updateMessages() {
    if (state.gameOver) return;
    if (state.turn === PLAYERS.ME) {
        if (state.isDiscarding) {
            playerMsgEl.textContent = "Selecciona cartas para descartar y confirma.";
        botMsgEl.textContent = "Esperando...";
    } else {
        playerMsgEl.textContent = "Turno del oponente...";
        botMsgEl.textContent = "Pensando...";
    }
}

function updateControls() {
    const isMyTurn = state.turn === PLAYERS.ME && !state.gameOver;
    discardBtn.disabled = !isMyTurn;
    if (state.isDiscarding) {
        discardBtn.textContent = 'Confirmar Descarte';
        discardBtn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600');
        discardBtn.classList.add('bg-green-500', 'hover:bg-green-600');
    } else {
        discardBtn.textContent = 'Descartar';
        discardBtn.classList.remove('bg-green-500', 'hover:bg-green-600');
    }
}

function startGame() {
    state = createInitialState();
    for (let i = 0; i < 3; i++) {
        drawCard(PLAYERS.ME);
        drawCard(PLAYERS.BOT);
    renderAll();
}

function drawCard(playerId, count = 1) {
    for (let i = 0; i < count; i++) {
        if (state.deck.length === 0) return;
        const card = state.deck.pop();
        if (card) state.players[playerId].hand.push(card);
    }
}

function endTurn() {
    if (state.gameOver) return;
    const currentPlayerId = state.turn;
    const handSize = state.players[currentPlayerId].hand.length;
    if (handSize < 3) {
        drawCard(currentPlayerId, 3 - handSize);
    }
    state.turn = (state.turn === PLAYERS.ME) ? PLAYERS.BOT : PLAYERS.ME;
    state.turnPhase = 'play';
    clearSelection();
    renderAll();
    if (state.turn === PLAYERS.BOT) {
        setTimeout(botTurn, 1200);
    }
}
function handleCardClick(card, cardEl) {
    if (state.turn !== PLAYERS.ME || state.gameOver) return;
    if (state.isDiscarding) {
        cardEl.classList.toggle('selected');
        return;
    }
    if (state.selectedCard && state.selectedCard.card === card) {
        clearSelection();
    } else {
        clearSelection();
        state.selectedCard = { card, element: cardEl };
        cardEl.classList.add('selected');
    }
}

function toggleDiscardMode() {
    if (state.turn !== PLAYERS.ME || state.gameOver) return;
    state.isDiscarding = !state.isDiscarding;
    clearSelection();
    if (!state.isDiscarding) {
        const cardsToDiscard = [];
        document.querySelectorAll('#player-hand .card.selected').forEach(el => {
            const card = JSON.parse(el.dataset.card);
            state.players.me.hand = state.players.me.hand.filter(c => !cardsToDiscard.includes(c));
            state.discardPile.push(...cardsToDiscard);
            endTurn();
        } else {
            renderAll();
        }
    } else {
        updateControls();
        updateMessages();
    }
}
function clearSelection() {
    if (state.selectedCard) {
        state.selectedCard.element.classList.remove('selected');
    }
    state.selectedCard = null;
}
function botTurn() {
    // Lógica simplificada: el bot descarta la primera carta si no puede jugar
    const bot = state.players.bot;
    if (bot.hand.length > 0) {
        state.discardPile.push(bot.hand.shift());
    }
    endTurn();
}

resetBtn.addEventListener('click', startGame);
deckPileEl.addEventListener('click', () => {
    if (state.turn === PLAYERS.ME && !state.gameOver) {
        drawCard(PLAYERS.ME);
        renderAll();
    }
});
discardBtn.addEventListener('click', toggleDiscardMode);
helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
});

startGame();
/**  Virus! – Motor de juego simplificado  **/
const organs = ['heart','brain','bone','stomach'];

/* ----------------------- DOM ----------------------- */
const deckEl     = document.getElementById('deck');
const discardEl  = document.getElementById('discard');
const deckCount  = document.getElementById('deck-count');
const discardCnt = document.getElementById('discard-count');

const playerBoard= document.getElementById('player-organs');
const botBoard   = document.getElementById('bot-organs');
const playerMsg  = document.getElementById('player-msg');
const botMsg     = document.getElementById('bot-msg');

const handEl     = document.getElementById('hand');
const resetBtn   = document.getElementById('btn-reset');
const helpBtn    = document.getElementById('btn-help');
const discardBtn = document.getElementById('btn-discard');

const modal      = document.getElementById('modal');
const closeModal = document.getElementById('close-modal');

const tplCard = document.getElementById('card-template');
const tplSlot = document.getElementById('slot-template');

// --- NUEVOS ESTADOS DE ÓRGANO ---
const STATES = { EMPTY:0, HEALTHY:1, INFECTED:2, HALF_VACC:3, IMMUNE:4 };

const makePlayer = () => ({
  organs: { heart: STATES.EMPTY, brain: STATES.EMPTY, bone: STATES.EMPTY, stomach: STATES.EMPTY },
  hand:[]
});

/* -------------------- Estado ---------------------- */
let state;
const shuffle = a => {for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}};
const clone   = t => t.content.firstElementChild.cloneNode(true);

/* ------------------ Inicialización ---------------- */
function init(){
  state={
    deck: buildDeck(),
    discard: [],
    players:{
      me: makePlayer(),
      bot:makePlayer()
    },
    turn:'me',
    ended:false
  };
  buildBoardUI();
  initialDraw();
  msg(playerMsg,'Tu turno: roba y juega.');
  msg(botMsg,'Esperando…');
}
function buildDeck(){
  const d=[];
  organs.forEach(c=>{
    for(let i=0;i<4;i++) d.push({type:'organ',organ:c});
    for(let i=0;i<2;i++) d.push({type:'virus',organ:c});
    for(let i=0;i<2;i++) d.push({type:'cure', organ:c});
  });
  for(let i=0;i<2;i++){
    d.push({type:'organ',organ:'multi'});
    d.push({type:'virus',organ:'multi'});
    d.push({type:'cure', organ:'multi'});
  }
  shuffle(d);
  return d;
}

/* --------------------- UI ------------------------- */
function buildBoardUI(){
  [playerBoard,botBoard].forEach(b=>b.innerHTML='');
  renderOrgans(playerBoard,state.players.me);
  renderOrgans(botBoard,state.players.bot);
  renderDeckBack();
  handEl.innerHTML='';
  discardEl.innerHTML='';
  updateCounts();
}
function renderOrgans(container,p){
  container.innerHTML='';
  organs.forEach(o=>{
    const n=clone(tplSlot);
    n.classList.add(o);
    const base=n.querySelector('.base');
    const ov=n.querySelector('.overlay');
    switch(p.organs[o]){
      case STATES.EMPTY:
        base.remove(); ov.remove(); break;
      case STATES.HEALTHY:
        base.src=`images/${o}.png`; ov.remove(); break;
      case STATES.INFECTED:
        base.src=`images/${o}.png`; ov.src='images/virus_overlay.png'; ov.style.opacity = '1'; break;
      case STATES.HALF_VACC:
        base.src=`images/${o}.png`; ov.src='images/vaccine_overlay.png'; ov.style.opacity = '0.5'; break;
      case STATES.IMMUNE:
        base.src=`images/${o}.png`; ov.src='images/vaccine_overlay.png'; ov.style.opacity = '1'; break;
    }
    container.appendChild(n);
  });
}
function renderCard(card,where,animate=false){
  const n=clone(tplCard);
  n.classList.add(card.organ==='multi'?'multi':card.organ, card.type);
  if(animate) n.style.animation='pop .2s ease-out';
  const base=n.querySelector('.base');
  const ov  =n.querySelector('.overlay');
  base.src=card.organ==='multi'?'images/heart.png':`images/${card.organ}.png`;
  if(card.type==='virus') ov.src='images/virus_overlay.png';
  else if(card.type==='cure') ov.src='images/vaccine_overlay.png';
  else ov.remove();
  if(where===handEl){
    n.__card__=card;
    const clickFn = () => handleClick(card,n);
    n._clickFn = clickFn;
    n.addEventListener('click', clickFn);
  }
  where.appendChild(n);
}
function renderDeckBack(){deckEl.innerHTML='<div class="card back" style="background:#4b5563;"></div>';}
function renderDiscardTop(){discardEl.innerHTML='';state.discard.length&&renderCard(state.discard.at(-1),discardEl);}
function updateCounts(){deckCount.textContent=state.deck.length;discardCnt.textContent=state.discard.length;}

/* ---------------- Mensajes ---------------- */
const msg=(el,t)=>el.textContent=t;

/* --------------- Robar cartas ------------- */
function draw(who='me'){
  if(!state.deck.length) return null;
  if(state.players[who].hand.length >= 3) return null; // No permitir más de 3 cartas
  const c = state.deck.pop();
  state.players[who].hand.push(c);
  if(who==='me') renderCard(c, handEl, true);
  updateCounts();
  return c;
}

function ensureHand(who){
  // Roba hasta tener 3 cartas
  while(state.players[who].hand.length < 3 && state.deck.length) draw(who);
  // Si por alguna razón tiene más de 3, descarta automáticamente
  while(state.players[who].hand.length > 3){
    const c = state.players[who].hand.pop();
    state.discard.push(c);
  }
  updateCounts();
}

/* --------------- Lógica básica ------------ */
function playOrgan(p,card){
  const slot = card.organ==='multi' ? organs.find(o=>p.organs[o]===STATES.EMPTY) : (p.organs[card.organ]===STATES.EMPTY?card.organ:null);
  if(!slot) return false;
  p.organs[slot]=STATES.HEALTHY;
  return true;
}
function playVirus(att,def,card){
  let targets = card.organ==='multi'
    ? organs.filter(o=>[STATES.HEALTHY,STATES.INFECTED,STATES.HALF_VACC].includes(def.organs[o]))
    : ([STATES.HEALTHY,STATES.INFECTED,STATES.HALF_VACC].includes(def.organs[card.organ]) ? [card.organ] : []);
  if(!targets.length) return false;
  const t = targets[Math.floor(Math.random()*targets.length)];
  if(def.organs[t]===STATES.HEALTHY){
    def.organs[t]=STATES.INFECTED;
    return true;
  } else if(def.organs[t]===STATES.INFECTED){
    def.organs[t]=STATES.EMPTY;
    // Buscar la carta de órgano real en la mesa del jugador defensor
    let destroyedCard = null;
    if(def===state.players.me){
      destroyedCard = state.players.me.hand.find(c=>c.type==='organ'&&c.organ===t) || {type:'organ',organ:t};
    }else{
      destroyedCard = state.players.bot.hand.find(c=>c.type==='organ'&&c.organ===t) || {type:'organ',organ:t};
    }
    state.discard.push(destroyedCard);
    return true;
  } else if(def.organs[t]===STATES.HALF_VACC){
    def.organs[t]=STATES.HEALTHY; // El virus elimina la media vacuna
    msg(def===state.players.me?playerMsg:botMsg,'El virus cancela la media vacuna.');
    return true;
  }
  return false;
}
function playCure(p,card){
  const possible = (o) => {
    if(p.organs[o]===STATES.INFECTED){ p.organs[o]=STATES.HEALTHY; return true; }
    if(p.organs[o]===STATES.HEALTHY){ p.organs[o]=STATES.HALF_VACC; return true; }
    if(p.organs[o]===STATES.HALF_VACC){ p.organs[o]=STATES.IMMUNE; return true; }
    return false;
  };
  if(card.organ==='multi'){
    const found = organs.find(possible);
    return !!found;
  } else {
    return possible(card.organ);
  }
}

/* ------------- Turnos & jugadas ---------- */
let discardMode = false;
let dumps = 0; // Lleva la cuenta de descartes en modo descarte
let discardCardOnceRef = null; // Referencia global para poder quitar el listener
function handleClick(card,node){
  if(state.ended||state.turn!=='me')return;

  /* --- modo descarte --- */
  if(discardMode){
    node.classList.toggle('selected');
    if(handEl.querySelectorAll('.selected').length>3)node.classList.remove('selected');
    return;
  }

  /* --- intento de jugar --- */
  const me=state.players.me, bot=state.players.bot;
  let ok=false;
  if(card.type==='organ')      ok=playOrgan(me,card);
  else if(card.type==='virus') ok=playVirus(me,bot,card);
  else if(card.type==='cure')  ok=playCure(me,card);

  if(!ok){msg(playerMsg,'Esa carta no puede jugarse.');return;}

  afterPlay(me,card,node);
  msg(playerMsg,describe('Tú',card));
  endTurn();
}
function afterPlay(owner,card,node){
  owner.hand.splice(owner.hand.indexOf(card),1);
  node&&node.remove();
  state.discard.push(card);
  renderDiscardTop();updateCounts();
  ensureHand(owner===state.players.me?'me':'bot');
  renderOrgans(playerBoard,state.players.me);
  renderOrgans(botBoard,state.players.bot);
}

/* ------- Descartar manual -------- */
discardBtn.addEventListener('click',()=>{
  if(state.ended||state.turn!=='me')return;
  if(!discardMode){
    discardMode=true;
    discardBtn.textContent='Cancelar';
    msg(playerMsg,'Haz clic en 1–3 cartas para descartar.');
    dumps = 0;
    // Definir la función fuera del forEach para poder quitarla después
    discardCardOnceRef = function discardCardOnce(e) {
      if(!discardMode) return;
      const cardNode = e.currentTarget;
      const c = cardNode.__card__;
      state.players.me.hand.splice(state.players.me.hand.indexOf(c),1);
      cardNode.remove();
      state.discard.push(c);
      renderDiscardTop();
      updateCounts();
      dumps++;
      // Salir si se han descartado 3 cartas o la mano está vacía
      if(dumps === 3 || !handEl.children.length){
        cerrarModoDescarte();
      }
    };
    [...handEl.children].forEach(cardNode => {
      cardNode.removeEventListener('click', cardNode._clickFn);
      cardNode.addEventListener('click', discardCardOnceRef, { once: true });
    });
  }else{
    discardMode=false;
    discardBtn.textContent='Descartar';
    msg(playerMsg,'');
    // Quitar listeners de descarte antes de restaurar _clickFn
    [...handEl.children].forEach(cardNode => {
      cardNode.classList.remove('selected');
      cardNode.removeEventListener('click', discardCardOnceRef);
      cardNode.addEventListener('click', cardNode._clickFn);
    });
  }
});

function cerrarModoDescarte(){
  discardMode = false;
  discardBtn.textContent = 'Descartar';
  msg(playerMsg,'Has descartado carta(s).');
  [...handEl.children].forEach(n=>{
    n.removeEventListener('click', discardCardOnceRef);
    n.addEventListener('click', n._clickFn);
  });
  ensureHand('me');
  endTurn();
}

/* -------------- Bot ----------------- */
function botTurn(){
  if(state.ended)return;
  const bot=state.players.bot, me=state.players.me;
  ensureHand('bot');
  shuffle(bot.hand);
  let card=null;
  // 1. Virus para destruir órgano infectado
  card = bot.hand.find(c=>c.type==='virus' && organs.some(o=>me.organs[o]===STATES.INFECTED && (c.organ==='multi'||c.organ===o)));
  // 2. Virus para infectar órgano sano
  if(!card) card = bot.hand.find(c=>c.type==='virus' && organs.some(o=>me.organs[o]===STATES.HEALTHY && (c.organ==='multi'||c.organ===o)));
  // 3. Cura para órgano infectado propio
  if(!card) card = bot.hand.find(c=>c.type==='cure' && organs.some(o=>bot.organs[o]===STATES.INFECTED && (c.organ==='multi'||c.organ===o)));
  // 4. Cura para completar vacuna (HALF_VACC → IMMUNE)
  if(!card) card = bot.hand.find(c=>c.type==='cure' && organs.some(o=>bot.organs[o]===STATES.HALF_VACC && (c.organ==='multi'||c.organ===o)));
  // 5. Cura para vacunar órgano sano
  if(!card) card = bot.hand.find(c=>c.type==='cure' && organs.some(o=>bot.organs[o]===STATES.HEALTHY && (c.organ==='multi'||c.organ===o)));
  // 6. Colocar órgano
  if(!card) card = bot.hand.find(c=>c.type==='organ' && organs.some(o=>bot.organs[o]===STATES.EMPTY && (c.organ==='multi'||c.organ===o)));
  if(card){ playCardBot(card); }
  else { botDiscard(); }
  endTurn();
}
function playCardBot(card){
  const bot=state.players.bot;
  playOrgan(bot,card)||playVirus(bot,state.players.me,card)||playCure(bot,card);
  bot.hand.splice(bot.hand.indexOf(card),1);
  state.discard.push(card);
  renderDiscardTop();updateCounts();
  ensureHand('bot');
  renderOrgans(playerBoard,state.players.me);
  renderOrgans(botBoard,state.players.bot);
  msg(botMsg,describe('Bot',card));
}
function botDiscard(){
  const bot=state.players.bot;
  const n=Math.min(3,bot.hand.length);
  const disc=bot.hand.splice(0,n);
  disc.forEach(c=>state.discard.push(c));
  renderDiscardTop();updateCounts();
  ensureHand('bot');
  msg(botMsg,'Bot descarta.');
}

/* ----------- Auxiliares ------------ */
const describe=(who,c)=>`${who} ${
  {organ:'coloca órgano',virus:'lanza virus',cure:'usa cura'}[c.type]
} ${c.organ==='multi'?'multicolor':c.organ}`;

function endTurn(){
  if(checkWin())return;
  state.turn=state.turn==='me'?'bot':'me';
  if(state.turn==='bot'){setTimeout(botTurn,600);}
  else msg(playerMsg,'Tu turno');
}
function checkWin(){
  // Gana quien tenga los 4 órganos sanos o inmunes
  const ok = p => organs.every(o => p.organs[o]===STATES.HEALTHY || p.organs[o]===STATES.IMMUNE);
  if(ok(state.players.me)||ok(state.players.bot)){
    state.ended=true;
    msg(playerMsg, ok(state.players.me)?'¡Has ganado!':''); 
    msg(botMsg   , ok(state.players.bot)?'El bot gana.':'');
    return true;
  }
  if(state.deck.length === 0) {
    const countSafe = p => organs.filter(o => p.organs[o]===STATES.HEALTHY || p.organs[o]===STATES.IMMUNE).length;
    const playerCount = countSafe(state.players.me);
    const botCount = countSafe(state.players.bot);
    if(playerCount > botCount) {
      state.ended = true;
      msg(playerMsg, '¡Has ganado por mayoría de órganos sanos/inmunes!');
      msg(botMsg, '');
      return true;
    } else if(botCount > playerCount) {
      state.ended = true;
      msg(playerMsg, '');
      msg(botMsg, 'El bot gana por mayoría de órganos sanos/inmunes.');
      return true;
    } else if(playerCount === botCount) {
      state.ended = true;
      msg(playerMsg, 'Empate: ambos tenéis la misma cantidad de órganos sanos/inmunes.');
      msg(botMsg, 'Empate.');
      return true;
    }
  }
  return false;
}

/* -------- Modal & botones -------- */
deckEl.addEventListener('click',()=>state.turn==='me'&&!state.ended&&draw('me'));
resetBtn.addEventListener('click',init);
helpBtn.addEventListener('click',()=>modal.classList.remove('hidden'));
closeModal.addEventListener('click',()=>modal.classList.add('hidden'));
modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden');});

/* --------------- GO --------------- */
init();

function initialDraw() {
  // Vacía las manos por si acaso
  state.players.me.hand = [];
  state.players.bot.hand = [];
  handEl.innerHTML = '';
  // Reparte 3 cartas a cada uno
  for (let i = 0; i < 3; i++) {
    draw('me');
    draw('bot');
  }
}
