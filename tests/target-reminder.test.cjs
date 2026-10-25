const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(`${__dirname}/../scripts/main.js`, 'utf8');

function setup({ gm = false, system = 'pf2e' } = {}) {
    const hooks = new Map(), settings = new Map(), dialogs = [], notices = [], clickListeners = [];
    let dialogAnswer = { action: 'select', tokenId: 'enemy' };
    const user = { id: 'player', isGM: gm, targets: new Set() };
    const otherUser = { id: 'other', targets: new Set() };
    const actor = owners => ({ testUserPermission: u => owners.includes(u.id) });
    const hero = { id: 'hero', actor: actor(['player']) };
    const other = { id: 'other', actor: actor(['other']) };
    const enemy = { id: 'enemy', actor: actor([]) };
    const combat = {
        id: 'combat', started: true, active: true, round: 1, turn: 0,
        scene: { id: 'scene' }, combatant: hero,
        combatants: new Map([hero, other, enemy].map(c => [c.id, c])), turns: []
    };
    function tokenFor(c) {
        const token = {
            id: c.id, actor: c.actor, isVisible: true,
            document: { hidden: false, parent: { id: 'scene' } },
            setTarget(value, { releaseOthers }) {
                if (releaseOthers) user.targets.clear();
                if (value) user.targets.add(this); else user.targets.delete(this);
            }
        };
        c.visible = true; c.tokenId = c.id; c.name = c.id; c.img = '/token.webp';
        c.token = { object: token };
        return token;
    }
    const tokens = [hero, other, enemy].map(tokenFor);
    combat.turns = [hero, other, enemy];
    const originalCheck = () => 'untouched';
    const game = {
        user, combat, combats: [combat], system: { id: system },
        pf2e: { Check: { roll: originalCheck } },
        settings: {
            register(_id, key, config) { settings.set(key, config.default); },
            get(_id, key) { return settings.get(key); }
        }
    };
    const context = vm.createContext({
        game, canvas: { ready: true, scene: { id: 'scene' }, tokens: { controlled: [tokens[0]] } },
        Hooks: {
            once(name, fn) { hooks.set(name, [fn]); },
            on(name, fn) { hooks.set(name, [...(hooks.get(name) || []), fn]); }
        },
        document: { addEventListener(type, fn, options) { clickListeners.push({ type, fn, options }); } },
        window: {}, MouseEvent: class { constructor(type, options) { this.type = type; Object.assign(this, options); } },
        foundry: { applications: { api: { DialogV2: { wait(options) {
            dialogs.push(options); return Promise.resolve(typeof dialogAnswer === 'function' ? dialogAnswer() : dialogAnswer);
        } } } } },
        ui: { notifications: { warn: n => notices.push(n), info: n => notices.push(n) } }, console
    });
    const fire = (name, ...args) => (hooks.get(name) || []).forEach(fn => fn(...args));
    vm.runInContext(source, context); fire('init'); fire('ready');
    function attack(action = 'strike-attack', options = {}) {
        const dispatches = [];
        const button = {
            dataset: { action }, disabled: false, isConnected: true,
            dispatchEvent(event) { dispatches.push({ event, targets: [...user.targets] }); }
        };
        const event = {
            target: { closest: () => button }, defaultPrevented: false, button: 0,
            shiftKey: true, ctrlKey: true, metaKey: false, altKey: false,
            preventDefault() { this.defaultPrevented = true; },
            stopImmediatePropagation() { this.stopped = true; }, ...options
        };
        return { button, event, dispatches, run: () => context.handleAttackClick(event) };
    }
    function next(from = hero, to = other, beforeRound = 1, afterRound = 1) {
        combat.combatant = to; combat.turn = 1; combat.round = afterRound;
        fire('combatTurnChange', combat, { combatantId: from.id, round: beforeRound }, { combatantId: to.id, round: afterRound });
    }
    return { context, game, hooks, settings, dialogs, notices, clickListeners, tokens, hero, other, enemy,
        combat, user, otherUser, originalCheck, attack, next, fire,
        answer(value) { dialogAnswer = value; } };
}

test('GM attacks pass through and GM targets are never cleared', async () => {
    const e = setup({ gm: true });
    const a = e.attack(); await a.run();
    assert.equal(e.dialogs.length, 0); assert.equal(a.event.defaultPrevented, false);
    e.user.targets.add(e.tokens[2]); e.next();
    e.fire('deleteCombat', e.combat); e.context.clearTargets();
    assert.equal(e.user.targets.size, 1);
});

test('select target before continuing one attack, preserving modifier keys', async () => {
    const e = setup(), a = e.attack(); await a.run();
    assert.equal(a.event.stopped, true); assert.equal(e.dialogs.length, 1);
    assert.equal(a.dispatches.length, 1); assert.equal(a.dispatches[0].targets[0], e.tokens[2]);
    assert.equal(a.dispatches[0].event.shiftKey, true); assert.equal(a.dispatches[0].event.ctrlKey, true);
    assert.equal(e.game.pf2e.Check.roll, e.originalCheck);
    const replay = a.dispatches[0].event;
    await e.context.handleAttackClick(replay);
    assert.equal(e.dialogs.length, 1);
});

test('native sheet/chat strike, spell MAP and elemental attack buttons are intercepted', async () => {
    for (const action of ['strike-attack', 'strike-attack2', 'strike-attack3', 'spell-attack', 'spell-attack-2', 'spell-attack-3', 'roll-attack', 'familiar-attack-roll']) {
        const e = setup(), a = e.attack(action); await a.run(); assert.equal(e.dialogs.length, 1, action);
    }
});

test('damage, non-attack, disabled and right-click controls are untouched', async () => {
    for (const action of ['strike-damage', 'spell-damage', 'strike-critical', 'perception']) {
        const e = setup(), a = e.attack(action); await a.run(); assert.equal(a.event.defaultPrevented, false);
    }
    const e = setup(), a = e.attack(); a.button.disabled = true; await a.run();
    const b = e.attack('strike-attack', { button: 2 }); await b.run();
    assert.equal(e.dialogs.length, 0);
});

test('no prompt with an existing target, outside combat, before combat starts or when disabled', async () => {
    for (const configure of [e => e.user.targets.add(e.tokens[2]), e => e.game.combat = null,
        e => e.combat.started = false, e => e.combat.active = false, e => e.settings.set('autoTargetPrompt', false),
        e => e.context.canvas.ready = false]) {
        const e = setup(); configure(e); const a = e.attack(); await a.run(); assert.equal(e.dialogs.length, 0);
    }
});

test('targets persist through attacks and damage and clear only when their owner finishes a turn', async () => {
    const e = setup(); e.user.targets.add(e.tokens[2]); e.otherUser.targets.add(e.tokens[0]);
    e.fire('createChatMessage', { flags: { pf2e: { context: { type: 'damage-roll' } } } });
    assert.equal(e.user.targets.size, 1);
    e.next(e.other, e.enemy); assert.equal(e.user.targets.size, 1);
    e.next(e.hero, e.other); assert.equal(e.user.targets.size, 0);
    assert.equal(e.otherUser.targets.size, 1);
});

test('spectators and players without OWNER permission retain their targets', () => {
    const e = setup(); e.user.id = 'spectator'; e.user.targets.add(e.tokens[2]); e.next();
    assert.equal(e.user.targets.size, 1);
});

test('a single combatant round advance ends the previous turn', () => {
    const e = setup(); e.user.targets.add(e.tokens[2]); e.next(e.hero, e.hero, 1, 2);
    assert.equal(e.user.targets.size, 0);
});

test('initiative edits and combat start do not clear targets', () => {
    const e = setup(); e.user.targets.add(e.tokens[2]); e.next(e.hero, e.hero);
    e.next(e.hero, e.other, 0, 1); assert.equal(e.user.targets.size, 1);
});

test('inactive, other-scene and other encounter turns do not clear targets', () => {
    for (const configure of [e => e.combat.active = false, e => e.combat.scene.id = 'elsewhere',
        e => e.game.combat = { id: 'other-combat' }]) {
        const e = setup(); configure(e); e.user.targets.add(e.tokens[2]); e.next(); assert.equal(e.user.targets.size, 1);
    }
});

test('turn clearing preference is preserved', () => {
    const e = setup(); e.settings.set('autoClearTargets', false); e.user.targets.add(e.tokens[2]); e.next();
    assert.equal(e.user.targets.size, 1);
});

test('deleting the active combatant still clears its owner using saved turn state', () => {
    const e = setup(); e.user.targets.add(e.tokens[2]); e.combat.combatants.delete('hero'); e.next();
    assert.equal(e.user.targets.size, 0);
});

test('ending, resetting or deactivating combat clears outgoing owner targets', () => {
    for (const action of ['delete', 'reset', 'deactivate']) {
        const e = setup(); e.user.targets.add(e.tokens[2]);
        if (action === 'delete') e.fire('deleteCombat', e.combat);
        else if (action === 'reset') { e.combat.started = false; e.fire('updateCombat', e.combat, { round: 0 }); }
        else { e.combat.active = false; e.fire('updateCombat', e.combat, { active: false }); }
        assert.equal(e.user.targets.size, 0, action);
    }
});

test('multiple player-owned combatants clear targets at each outgoing turn', () => {
    const e = setup(); e.other.actor = e.hero.actor;
    e.user.targets.add(e.tokens[2]); e.next(e.hero, e.other); assert.equal(e.user.targets.size, 0);
    e.user.targets.add(e.tokens[2]); e.next(e.other, e.enemy); assert.equal(e.user.targets.size, 0);
});

test('hidden, invisible, defeated, off-scene and controlled tokens are not offered', async () => {
    for (const configure of [e => e.enemy.hidden = true, e => e.enemy.visible = false,
        e => e.enemy.defeated = true, e => e.tokens[2].isVisible = false,
        e => e.tokens[2].document.hidden = true, e => e.tokens[2].document.parent.id = 'other']) {
        const e = setup(); configure(e);
        const ids = e.context.candidatesFor(e.combat).map(c => c.id);
        assert.equal(ids.includes('enemy'), false); assert.equal(ids.includes('hero'), false);
    }
});

test('no viable targets leaves normal attack behaviour available', async () => {
    const e = setup(); e.combat.turns = [e.hero]; const a = e.attack(); await a.run();
    assert.equal(a.event.defaultPrevented, false); assert.equal(e.dialogs.length, 0);
});

test('explicit Roll Without Target continues while closing the popup cancels', async () => {
    for (const choice of [{ action: 'skip' }, null, { action: 'cancel' }]) {
        const e = setup(); e.answer(choice); const a = e.attack(); await a.run();
        assert.equal(a.dispatches.length, choice?.action === 'skip' ? 1 : 0);
        assert.equal(e.user.targets.size, 0);
    }
});

test('repeat clicks share one pending selection and produce one attack', async () => {
    const e = setup(); let resolve; e.answer(() => new Promise(r => resolve = r));
    const a = e.attack(), first = a.run(), b = e.attack(); await b.run();
    assert.equal(b.event.stopped, true); assert.equal(e.dialogs.length, 1);
    resolve({ action: 'select', tokenId: 'enemy' }); await first;
    assert.equal(a.dispatches.length, 1); assert.equal(b.dispatches.length, 0);
});

test('turn changes, stale tokens and detached attack buttons cancel a pending attack', async () => {
    for (const change of [e => e.next(), e => e.tokens[2].document.hidden = true,
        (_e, a) => a.button.isConnected = false, e => e.combat.turns = [e.hero],
        e => e.game.combat = null]) {
        const e = setup(); let resolve; e.answer(() => new Promise(r => resolve = r));
        const a = e.attack(), pending = a.run(); change(e, a);
        resolve({ action: 'select', tokenId: 'enemy' }); await pending;
        assert.equal(a.dispatches.length, 0); assert.equal(e.user.targets.size, 0);
    }
});

test('popup escapes names and attributes and safely handles no radio selection', async () => {
    const e = setup(); e.enemy.name = '<script>bad()</script>'; e.enemy.img = '" onerror="bad()';
    const a = e.attack(); await a.run(); const dialog = e.dialogs[0];
    assert.ok(dialog.content.includes('&lt;script&gt;'));
    assert.ok(dialog.content.includes('&quot; onerror=&quot;')); assert.ok(!dialog.content.includes('<script>'));
    const result = dialog.buttons[0].callback(null, { form: { querySelector: () => null } });
    assert.equal(result.action, 'cancel');
    assert.equal(dialog.buttons[1].callback().action, 'skip');
});

test('unsupported systems register no attack handler or combat hooks', () => {
    const e = setup({ system: 'dnd5e' }); assert.equal(e.clickListeners.length, 0);
    assert.equal(e.hooks.has('combatTurnChange'), false);
});
