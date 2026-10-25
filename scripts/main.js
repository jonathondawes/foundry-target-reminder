const MODULE_ID = "foundry-target-reminder";
const ATTACK_ACTIONS = new Set([
    "strike-attack", "strike-attack2", "strike-attack3",
    "spell-attack", "spell-attack-2", "spell-attack-3",
    "roll-attack", "familiar-attack-roll"
]);
const replayedClicks = new WeakSet();
const lastTurns = new Map();
let promptOpen = false;

Hooks.once("init", () => {
    game.settings.register(MODULE_ID, "autoTargetPrompt", {
        name: "Show Target Reminder",
        hint: "Remind players to choose a target before using a PF2e attack button during an encounter. GMs are excluded.",
        scope: "client", config: true, type: Boolean, default: true
    });
    // Keep the existing key so a player's preference survives the update.
    game.settings.register(MODULE_ID, "autoClearTargets", {
        name: "Clear Targets at End of Turn",
        hint: "Clear your targets when a combatant you own finishes its turn. Targets stay selected between attacks and damage rolls. GMs are excluded.",
        scope: "client", config: true, type: Boolean, default: true
    });
});

Hooks.once("ready", () => {
    if (game.system.id !== "pf2e") return;
    for (const combat of game.combats) rememberTurn(combat);
    // Capture before PF2e's handlers calculate AC, range and modifiers.
    // Continue the same click after selection; never patch Check.roll or its context.
    document.addEventListener("click", event => {
        void handleAttackClick(event).catch(error => {
            console.error("Target Reminder | Target selection failed", error);
            ui.notifications.warn("Target Reminder: target selection failed. Select a token and try the attack again.");
        });
    }, { capture: true });
    Hooks.on("combatTurnChange", onTurnChange);
    Hooks.on("updateCombat", onCombatUpdate);
    Hooks.on("deleteCombat", onCombatDeleted);
});

function isPlayer() {
    return !!game.user && !game.user.isGM;
}

function activeEncounter() {
    const combat = game.combat;
    return combat?.started && (combat.isActive ?? combat.active) !== false ? combat : null;
}

function turnKey(combat) {
    return `${combat.id}:${combat.round}:${combat.turn}:${combat.combatant?.id ?? ""}`;
}

function candidatesFor(combat) {
    return combat.turns.filter(combatant => {
        const token = combatant.token?.object;
        return combatant.visible !== false && !combatant.hidden && !combatant.defeated
            && token?.actor && !token.document.hidden && token.isVisible
            && token.document.parent?.id === canvas.scene?.id
            && !canvas.tokens.controlled.includes(token);
    });
}

async function handleAttackClick(event) {
    if (replayedClicks.has(event) || !isPlayer() || event.defaultPrevented || event.button !== 0) return;
    const button = event.target?.closest?.("[data-action]");
    if (!button || button.disabled || !ATTACK_ACTIONS.has(button.dataset.action)) return;
    if (promptOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
    }
    if (!game.settings.get(MODULE_ID, "autoTargetPrompt") || game.user.targets.size > 0) return;
    const combat = activeEncounter();
    if (!combat || !canvas.ready) return;
    const candidates = candidatesFor(combat);
    if (!candidates.length) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    // Repeated clicks must not queue attacks while the first awaits a choice.
    if (promptOpen) return;
    promptOpen = true;
    const startingTurn = turnKey(combat);
    try {
        const choice = await promptTargetSelection(candidates);
        if (!choice || !["select", "skip"].includes(choice.action)) return;
        if (!isPlayer() || activeEncounter() !== combat || turnKey(combat) !== startingTurn || !button.isConnected) {
            ui.notifications.info("The encounter changed. Choose your target and attack again.");
            return;
        }
        if (choice.action === "select") {
            // Revalidate: a token may have become hidden, defeated or removed.
            const selected = candidatesFor(combat).find(c => c.tokenId === choice.tokenId)?.token.object;
            if (!selected) {
                ui.notifications.warn("That target is no longer available. Please try the attack again.");
                return;
            }
            selected.setTarget(true, { releaseOthers: true });
        }
        const replay = new MouseEvent("click", {
            bubbles: true, cancelable: true, composed: true, view: window,
            button: event.button, buttons: event.buttons, detail: event.detail,
            ctrlKey: event.ctrlKey, metaKey: event.metaKey,
            shiftKey: event.shiftKey, altKey: event.altKey,
            clientX: event.clientX, clientY: event.clientY
        });
        replayedClicks.add(replay);
        button.dispatchEvent(replay);
    } finally {
        promptOpen = false;
    }
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
}

async function promptTargetSelection(combatants) {
    const choices = combatants.map(c => `
        <label class="target-reminder-choice">
            <input type="radio" name="target-selection" value="${escapeHTML(c.tokenId)}">
            <img src="${escapeHTML(c.img)}" alt="" width="36" height="36">
            <span>${escapeHTML(c.name)}</span>
        </label>`).join("");
    return foundry.applications.api.DialogV2.wait({
        window: { title: "Select Target" },
        content: `<p>No target selected. Who are you attacking?</p><div class="target-reminder-list">${choices}</div>`,
        buttons: [{
            action: "select", label: "Target Selected", icon: "fa-solid fa-crosshairs", default: true,
            callback: (_event, button) => {
                const tokenId = button.form.querySelector('input[name="target-selection"]:checked')?.value;
                if (!tokenId) {
                    ui.notifications.warn("Choose a target, or use Roll Without Target.");
                    return { action: "cancel" };
                }
                return { action: "select", tokenId };
            }
        }, {
            action: "skip", label: "Roll Without Target", icon: "fa-solid fa-forward",
            callback: () => ({ action: "skip" })
        }],
        rejectClose: false
    });
}

function rememberTurn(combat) {
    lastTurns.set(combat.id, {
        id: combat.combatant?.id,
        actor: combat.combatant?.actor,
        started: combat.started,
        active: (combat.isActive ?? combat.active) !== false,
        sceneId: combat.scene?.id
    });
}

function ownsActor(actor) {
    return isPlayer() && !!actor?.testUserPermission(game.user, "OWNER");
}

function clearTargets() {
    if (!isPlayer() || !game.settings.get(MODULE_ID, "autoClearTargets")) return;
    // Token.setTarget works in v13 and v14; v14 removed User.updateTokenTargets.
    for (const token of [...game.user.targets]) token.setTarget(false, { releaseOthers: false });
}

function onTurnChange(combat, prior, current) {
    const saved = lastTurns.get(combat.id);
    rememberTurn(combat);
    if (!isPlayer() || !prior?.combatantId || prior.round < 1) return;
    const changed = prior.combatantId !== current?.combatantId || prior.round !== current?.round;
    if (!changed || combat.id !== game.combat?.id || (combat.isActive ?? combat.active) === false) return;
    if (combat.scene?.id !== canvas.scene?.id) return;
    // The saved actor handles deletion of the outgoing active combatant.
    const actor = combat.combatants.get(prior.combatantId)?.actor
        ?? (saved?.id === prior.combatantId ? saved.actor : null);
    if (ownsActor(actor)) clearTargets();
}

function onCombatUpdate(combat, changed) {
    if (!("active" in changed || "round" in changed)) return;
    const saved = lastTurns.get(combat.id);
    if (saved?.started && saved.active && (!combat.started || (combat.isActive ?? combat.active) === false)
        && saved.sceneId === canvas.scene?.id && ownsActor(saved.actor)) clearTargets();
    if (!combat.started || (combat.isActive ?? combat.active) === false || !saved?.started) rememberTurn(combat);
}

function onCombatDeleted(combat) {
    const saved = lastTurns.get(combat.id);
    if (saved?.started && saved.active && saved.sceneId === canvas.scene?.id && ownsActor(saved.actor)) clearTargets();
    lastTurns.delete(combat.id);
}
