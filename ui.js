import { state, PLAYERS, ORGANS, ORGAN_STATES, startGame, drawCard, endTurn, clearSelection } from './engine.js';

// DOM elements
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
const confirmBtn = document.getElementById('btn-confirm');
const helpModal = document.getElementById('help-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const cardTemplate = document.getElementById('card-template');
const organSlotTemplate = document.getElementById('organ-slot-template');

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
            playerMsgEl.textContent = 'Selecciona cartas para descartar y confirma.';
        } else {
            playerMsgEl.textContent = 'Tu turno: juega o descarta.';
        }
        botMsgEl.textContent = 'Esperando...';
    } else {
        playerMsgEl.textContent = 'Turno del oponente...';
        botMsgEl.textContent = 'Pensando...';
    }
}

function updateControls() {
    const isMyTurn = state.turn === PLAYERS.ME && !state.ended;
    discardBtn.disabled = !isMyTurn;
    confirmBtn.disabled = !isMyTurn || !state.selectedCard;
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

function handleCardClick(card, cardEl) {
    if (state.turn !== PLAYERS.ME || state.ended) return;
    const label = cardEl.querySelector('.action-label');
    if (state.isDiscarding) {
        if (state.selectedCard && state.selectedCard.element !== cardEl) {
            state.selectedCard.element.classList.remove('selected');
            state.selectedCard.element.querySelector('.action-label').textContent = '';
        }
        if (state.selectedCard && state.selectedCard.card === card) {
            state.selectedCard = null;
            cardEl.classList.remove('selected');
            label.textContent = '';
        } else {
            state.selectedCard = { card, element: cardEl };
            cardEl.classList.add('selected');
            label.textContent = 'Descartar';
        }
    } else {
        if (state.selectedCard && state.selectedCard.element !== cardEl) {
            state.selectedCard.element.classList.remove('selected');
            state.selectedCard.element.querySelector('.action-label').textContent = '';
        }
        if (state.selectedCard && state.selectedCard.card === card) {
            state.selectedCard = null;
            cardEl.classList.remove('selected');
            label.textContent = '';
        } else {
            state.selectedCard = { card, element: cardEl };
            cardEl.classList.add('selected');
            label.textContent = 'Usar';
        }
    }
    updateControls();
}

function toggleDiscardMode() {
    if (state.turn !== PLAYERS.ME || state.ended) return;
    state.isDiscarding = !state.isDiscarding;
    if (state.selectedCard && state.selectedCard.element) {
        state.selectedCard.element.classList.remove('selected');
        const lbl = state.selectedCard.element.querySelector('.action-label');
        if (lbl) lbl.textContent = '';
    }
    clearSelection();
    updateControls();
    updateMessages();
}

function confirmSelection() {
    if (state.turn !== PLAYERS.ME || state.ended || !state.selectedCard) return;
    const card = state.selectedCard.card;
    const element = state.selectedCard.element;
    element.classList.remove('selected');
    const lbl = element.querySelector('.action-label');
    if (lbl) lbl.textContent = '';
    state.players.me.hand = state.players.me.hand.filter(c => c !== card);
    state.discard.push(card);
    clearSelection();
    state.isDiscarding = false;
    endTurn();
    renderAll();
}

resetBtn.addEventListener('click', () => { startGame(); renderAll(); });
deckPileEl.addEventListener('click', () => {
    if (state.turn === PLAYERS.ME && !state.ended) {
        drawCard(PLAYERS.ME);
        renderAll();
    }
});
discardBtn.addEventListener('click', toggleDiscardMode);
confirmBtn.addEventListener('click', confirmSelection);
helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
});

startGame();
renderAll();
