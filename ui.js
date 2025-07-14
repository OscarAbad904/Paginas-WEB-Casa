import { state, PLAYERS, ORGANS, ORGAN_STATES, startGame, drawCard, endTurn, clearSelection, playCard } from './engine.js';

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
const helpModal = document.getElementById('help-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const cardTemplate = document.getElementById('card-template');
const organSlotTemplate = document.getElementById('organ-slot-template');

const targetListeners = [];

function clearTargetHighlights() {
    targetListeners.forEach(({ el, handler }) => {
        el.classList.remove('valid-target');
        el.removeEventListener('click', handler);
    });
    targetListeners.length = 0;
}

function deselectCard() {
    if (state.selectedCard && state.selectedCard.element) {
        state.selectedCard.element.classList.remove('selected');
        const lbl = state.selectedCard.element.querySelector('.action-label');
        if (lbl) lbl.textContent = '';
    }
    clearTargetHighlights();
    clearSelection();
    updateControls();
}

function handleSlotSelected(owner, organ) {
    const { card } = state.selectedCard || {};
    if (!card) return;
    const success = playCard(PLAYERS.ME, card, owner, organ);
    if (success) drawCard(PLAYERS.ME);
    deselectCard();
    renderAll();
    if (success && !state.ended) endTurn();
}

function highlightValidTargets(card) {
    clearTargetHighlights();
    const organNames = card.organ === 'multi' ? ORGANS : [card.organ];
    if (card.type === 'organ') {
        organNames.forEach(o => {
            if (state.players.me.organs[o] === ORGAN_STATES.EMPTY) {
                const el = playerBoardEl.querySelector(`[data-owner="me"][data-organ="${o}"]`);
                if (el) {
                    const handler = () => handleSlotSelected('me', o);
                    el.classList.add('valid-target');
                    el.addEventListener('click', handler);
                    targetListeners.push({ el, handler });
                }
            }
        });
    } else if (card.type === 'virus') {
        organNames.forEach(o => {
            const stateVal = state.players[PLAYERS.BOT].organs[o];
            if (stateVal !== ORGAN_STATES.EMPTY && stateVal !== ORGAN_STATES.IMMUNE) {
                const el = botBoardEl.querySelector(`[data-owner="${PLAYERS.BOT}"][data-organ="${o}"]`);
                if (el) {
                    const handler = () => handleSlotSelected(PLAYERS.BOT, o);
                    el.classList.add('valid-target');
                    el.addEventListener('click', handler);
                    targetListeners.push({ el, handler });
                }
            }
        });
    } else if (card.type === 'cure') {
        organNames.forEach(o => {
            const stateVal = state.players[PLAYERS.ME].organs[o];
            if (stateVal !== ORGAN_STATES.EMPTY && stateVal !== ORGAN_STATES.IMMUNE) {
                const el = playerBoardEl.querySelector(`[data-owner="${PLAYERS.ME}"][data-organ="${o}"]`);
                if (el) {
                    const handler = () => handleSlotSelected(PLAYERS.ME, o);
                    el.classList.add('valid-target');
                    el.addEventListener('click', handler);
                    targetListeners.push({ el, handler });
                }
            }
        });
    }
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
    if (state.ended) {
        playerMsgEl.textContent = state.turn === PLAYERS.ME ? '¡Has ganado!' : 'Derrota...';
        botMsgEl.textContent = state.turn === PLAYERS.ME ? 'Derrota...' : '¡El bot gana!';
        return;
    }
    if (state.turn === PLAYERS.ME) {
        playerMsgEl.textContent = 'Tu turno: selecciona una carta para jugar o descartar.';
        botMsgEl.textContent = 'Esperando...';
    } else {
        playerMsgEl.textContent = 'Turno del oponente...';
        botMsgEl.textContent = 'Pensando...';
    }
}

function updateControls() {
    const isMyTurn = state.turn === PLAYERS.ME && !state.ended;
    discardBtn.disabled = !(isMyTurn && state.selectedCard);
    discardBtn.textContent = 'Descartar';
    discardBtn.classList.remove('bg-red-500', 'hover:bg-red-600');
    discardBtn.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
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

    if (state.selectedCard && state.selectedCard.element === cardEl) {
        deselectCard();
        return;
    }

    deselectCard();
    state.selectedCard = { card, element: cardEl };
    cardEl.classList.add('selected');

    if (card.type === 'organ') {
        const organs = card.organ === 'multi' ? ORGANS : [card.organ];
        const target = organs.find(o => state.players.me.organs[o] === ORGAN_STATES.EMPTY);
        if (target) {
            const success = playCard(PLAYERS.ME, card, PLAYERS.ME, target);
            if (success) drawCard(PLAYERS.ME);
            deselectCard();
            renderAll();
            if (success && !state.ended) endTurn();
            return;
        }
    }

    label.textContent = 'Usar';
    highlightValidTargets(card);
    updateControls();
}

function handleDiscardAction() {
    if (state.turn !== PLAYERS.ME || state.ended || !state.selectedCard) return;
    const card = state.selectedCard.card;
    state.players.me.hand = state.players.me.hand.filter(c => c !== card);
    state.discard.push(card);
    deselectCard();
    drawCard(PLAYERS.ME);
    renderAll();
    if (!state.ended) endTurn();
}


resetBtn.addEventListener('click', () => { startGame(); renderAll(); });
deckPileEl.addEventListener('click', () => {
    if (state.turn === PLAYERS.ME && !state.ended) {
        drawCard(PLAYERS.ME);
        renderAll();
    }
});
discardBtn.addEventListener('click', handleDiscardAction);
helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => helpModal.classList.add('hidden'));
helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
});

startGame();
renderAll();
