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
    for (let i = 0; i < count; i++) {
        if (state.deck.length === 0) return;
        const card = state.deck.pop();
        if (card) state.players[playerId].hand.push(card);
    }
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
    if (bot.hand.length > 0) {
        state.discard.push(bot.hand.shift());
    }
    endTurn();
}
