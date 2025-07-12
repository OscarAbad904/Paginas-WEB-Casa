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
            overlay.style.opacity = '1';
        } else if (card.type === 'cure') {
            base.src = card.organ === 'multi' ? 'images/heart.png' : `images/${card.organ}.png`;
            overlay.src = 'images/vaccine_overlay.png';
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
                base.src = `images/${organName}.png`; overlay.src = 'images/virus_overlay.png'; overlay.style.opacity = '1'; break;
            case ORGAN_STATES.HALF_VACC:
                base.src = `images/${organName}.png`; overlay.src = 'images/vaccine_overlay.png'; overlay.style.opacity = '0.6'; break;
            case ORGAN_STATES.IMMUNE:
                base.src = `images/${organName}.png`; overlay.src = 'images/vaccine_overlay.png'; overlay.style.opacity = '1'; break;
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
            overlay.style.opacity = '1';
        } else if (topCard.type === 'cure') {
            base.src = topCard.organ === 'multi' ? 'images/heart.png' : `images/${topCard.organ}.png`;
            overlay.src = 'images/vaccine_overlay.png';
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
