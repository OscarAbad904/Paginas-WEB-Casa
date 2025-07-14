export const ORGANS = ['heart', 'brain', 'bone', 'stomach'];
export const ORGAN_STATES = { EMPTY: 0, HEALTHY: 1, INFECTED: 2, HALF_VACC: 3, IMMUNE: 4 };
export const PLAYERS = { ME: 'me', BOT: 'bot' };

export let state = {};

export function createEmptyBody() {
    return { heart: ORGAN_STATES.EMPTY, brain: ORGAN_STATES.EMPTY, bone: ORGAN_STATES.EMPTY, stomach: ORGAN_STATES.EMPTY };
}

export function buildDeck() {
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

export function createInitialState() {
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

export function startGame() {
    state = createInitialState();
    for (let i = 0; i < 3; i++) {
        drawCard(PLAYERS.ME);
        drawCard(PLAYERS.BOT);
    }
}

export function drawCard(playerId, count = 1) {
    const hand = state.players[playerId].hand;
    for (let i = 0; i < count; i++) {
        if (state.deck.length === 0) return;
        if (hand.length >= 3) return;
        const card = state.deck.pop();
        if (card) hand.push(card);
    }
}

export function checkWin(playerId) {
    return ORGANS.every(o => state.players[playerId].organs[o] === ORGAN_STATES.IMMUNE);
}

export function playCard(fromId, card, targetId, organ) {
    const fromHand = state.players[fromId].hand;
    const idx = fromHand.indexOf(card);
    if (idx === -1) return false;

    if (fromId === PLAYERS.ME) {
        if (card.type === 'virus' && targetId !== PLAYERS.BOT) return false;
        if (card.type === 'cure' && targetId !== PLAYERS.ME) return false;
    }

    const target = state.players[targetId];
    const current = target.organs[organ];
    let success = false;

    switch (card.type) {
        case 'organ':
            if (targetId === fromId && current === ORGAN_STATES.EMPTY) {
                target.organs[organ] = ORGAN_STATES.HEALTHY;
                success = true;
            }
            break;
        case 'virus':
            if (current === ORGAN_STATES.INFECTED) {
                target.organs[organ] = ORGAN_STATES.EMPTY;
                success = true;
            } else if (current === ORGAN_STATES.HEALTHY) {
                target.organs[organ] = ORGAN_STATES.INFECTED;
                success = true;
            } else if (current === ORGAN_STATES.HALF_VACC) {
                target.organs[organ] = ORGAN_STATES.HEALTHY;
                success = true;
            }
            break;
        case 'cure':
            if (current === ORGAN_STATES.INFECTED) {
                target.organs[organ] = ORGAN_STATES.HEALTHY;
                success = true;
            } else if (current === ORGAN_STATES.HEALTHY) {
                target.organs[organ] = ORGAN_STATES.HALF_VACC;
                success = true;
            } else if (current === ORGAN_STATES.HALF_VACC) {
                target.organs[organ] = ORGAN_STATES.IMMUNE;
                success = true;
            }
            break;
    }

    if (success) {
        fromHand.splice(idx, 1);
        state.discard.push(card);
        if (checkWin(fromId)) state.ended = true;
    }

    return success;
}

export function clearSelection() {
    state.selectedCard = null;
}

export function endTurn() {
    if (state.ended) return;
    const currentPlayerId = state.turn;
    const handSize = state.players[currentPlayerId].hand.length;
    if (handSize < 3) {
        drawCard(currentPlayerId, 3 - handSize);
    }
    state.turn = state.turn === PLAYERS.ME ? PLAYERS.BOT : PLAYERS.ME;
    clearSelection();
    if (state.turn === PLAYERS.BOT) {
        setTimeout(botTurn, 1200);
    }
}

export function botTurn() {
    const bot = state.players.bot;
    const me = state.players.me;

    // 1. Intentar curar o vacunar sus propios órganos
    for (const card of bot.hand) {
        if (card.type === 'cure') {
            const organs = card.organ === 'multi' ? ORGANS : [card.organ];
            for (const o of organs) {
                const st = bot.organs[o];
                if (st === ORGAN_STATES.INFECTED || st === ORGAN_STATES.HEALTHY || st === ORGAN_STATES.HALF_VACC) {
                    if (playCard(PLAYERS.BOT, card, PLAYERS.BOT, o)) {
                        endTurn();
                        return;
                    }
                }
            }
        }
    }

    // 2. Jugar órganos en espacios vacíos
    for (const card of bot.hand) {
        if (card.type === 'organ') {
            const organs = card.organ === 'multi' ? ORGANS : [card.organ];
            for (const o of organs) {
                if (bot.organs[o] === ORGAN_STATES.EMPTY) {
                    if (playCard(PLAYERS.BOT, card, PLAYERS.BOT, o)) {
                        endTurn();
                        return;
                    }
                }
            }
        }
    }

    // 3. Atacar con virus al jugador
    for (const card of bot.hand) {
        if (card.type === 'virus') {
            const organs = card.organ === 'multi' ? ORGANS : [card.organ];
            for (const o of organs) {
                const st = me.organs[o];
                if (st !== ORGAN_STATES.EMPTY && st !== ORGAN_STATES.IMMUNE) {
                    if (playCard(PLAYERS.BOT, card, PLAYERS.ME, o)) {
                        endTurn();
                        return;
                    }
                }
            }
        }
    }

    // 4. Si no puede jugar, descarta
    if (bot.hand.length > 0) {
        state.discard.push(bot.hand.shift());
    }
    endTurn();
}
